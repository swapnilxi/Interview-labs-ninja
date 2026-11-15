package com.labsninja.app.scheduler;

import android.content.Context;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.Nullable;
import com.labsninja.app.scheduler.SchedulerStore.Config;
import com.labsninja.app.scheduler.SchedulerStore.Job;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Runs one AI job with the app closed: POSTs to the app's own API (the server calls the LLM, with the AI settings the web
 * app synced) and turns the answer, or the reason there is none, into a notification. Called on a background thread
 * inside the alarm receiver's goAsync() window, which Android closes about a minute after the alarm; BUDGET_MS keeps the
 * whole run, retries included, inside it so a notification always goes out.
 */
final class SchedulerAgentRun {

    private static final String TAG = "LabNinjaScheduler";

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 45_000;
    private static final long BUDGET_MS = 50_000;
    /** Another device is running this occurrence: ask again this often, this many times, for its finished run. */
    private static final long RETRY_DELAY_MS = 8_000;
    private static final int RETRIES = 2;
    /** Don't start a retry with less time than this left for its request. */
    private static final long MIN_ATTEMPT_MS = 5_000;
    private static final int MAX_RESPONSE_BYTES = 512 * 1024;

    private static final String OPEN_QUOTE = "“";
    private static final String CLOSE_QUOTE = "”";

    private SchedulerAgentRun() {}

    /** One HTTP outcome. code -1 = no response at all (offline, timeout, bad URL). */
    private static final class Reply {

        static final Reply NONE = new Reply(-1, null);

        final int code;

        @Nullable
        final JSONObject json;

        Reply(int code, @Nullable JSONObject json) {
            this.code = code;
            this.json = json;
        }

        /** The response's run object, for a 2xx reply that has one. */
        @Nullable
        JSONObject run() {
            return code >= 200 && code < 300 && json != null ? json.optJSONObject("run") : null;
        }

        @Nullable
        String runStatus() {
            JSONObject run = run();
            return run == null ? null : SchedulerStore.str(run, "status");
        }
    }

    static void run(Context ctx, Job job, Config config) {
        String title = job.title.isEmpty() ? "Scheduled job" : job.title;
        String quoted = OPEN_QUOTE + title + CLOSE_QUOTE;
        String runNowHref = withParam(job.href, "run_now", job.scheduledFor);

        if (config.token == null || config.token.isEmpty()) {
            SchedulerNotifier.show(ctx, job.key, quoted + " is due", "Open LabNinja to run it.", runNowHref);
            return;
        }

        long deadline = SystemClock.elapsedRealtime() + BUDGET_MS;
        String url = runUrl(config, job);
        byte[] body = requestBody(config, job);
        Reply reply = url == null ? Reply.NONE : post(url, config.token, body, deadline);
        // "running" = another device claimed this occurrence and is still waiting on the AI; once it finishes, the same
        // request returns that finished run (the server deduplicates on scheduled_for).
        for (
            int i = 0;
            i < RETRIES && "running".equals(reply.runStatus()) && deadline - SystemClock.elapsedRealtime() > RETRY_DELAY_MS + MIN_ATTEMPT_MS;
            i++
        ) {
            SystemClock.sleep(RETRY_DELAY_MS);
            reply = post(url, config.token, body, deadline);
        }

        if (reply.code == 401 || reply.code == 403) {
            SchedulerNotifier.show(ctx, job.key, "Sign in to keep " + quoted + " running", "Open LabNinja and sign in again.", job.href);
            return;
        }
        JSONObject run = reply.run();
        String status = reply.runStatus();
        if (run != null && "ok".equals(status)) {
            long runId = run.optLong("id", -1);
            SchedulerNotifier.show(
                ctx,
                job.key,
                nonEmpty(SchedulerStore.str(run, "title"), title),
                nonEmpty(SchedulerStore.str(run, "output"), "Tap to see the result."),
                runId >= 0 ? withParam(job.href, "run", String.valueOf(runId)) : job.href
            );
            return;
        }
        if ("running".equals(status)) {
            SchedulerNotifier.show(ctx, job.key, title + " is running", "Tap to see the result.", job.href);
            return;
        }
        // Everything else failed. A server-side failure says why: a 502's detail, or the output of a run that ended in
        // "error" (e.g. another device's attempt, returned as a duplicate).
        String why = run != null ? SchedulerStore.str(run, "output") : reply.code == 502 ? SchedulerStore.str(reply.json, "detail") : null;
        SchedulerNotifier.show(ctx, job.key, "Couldn't run " + quoted, nonEmpty(why, "Tap to run it now."), runNowHref);
    }

    @Nullable
    private static String runUrl(Config config, Job job) {
        String base = nonEmpty(config.apiBase, config.origin);
        if (base == null) return null;
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + "/todo/schedules/" + job.scheduleId + "/run";
    }

    /** The synced AI settings plus this occurrence; "now" lets the server word the answer in the phone's local time. */
    private static byte[] requestBody(Config config, Job job) {
        JSONObject body = config.ai();
        try {
            body.put("scheduled_for", job.scheduledFor);
            body.put("source", "app");
            body.put("now", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).format(new Date()));
        } catch (JSONException ignored) {
            /* not thrown for strings */
        }
        return body.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static Reply post(String url, String token, byte[] body, long deadline) {
        long budget = deadline - SystemClock.elapsedRealtime();
        if (budget < 1_000) return Reply.NONE;
        HttpURLConnection conn = null;
        Thread watchdog = null;
        try {
            conn = (HttpURLConnection) URI.create(url).toURL().openConnection();
            watchdog = startWatchdog(conn, budget);
            conn.setConnectTimeout((int) Math.min(CONNECT_TIMEOUT_MS, budget));
            conn.setReadTimeout((int) Math.min(READ_TIMEOUT_MS, budget));
            conn.setRequestMethod("POST");
            conn.setUseCaches(false);
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(body.length);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
            }
            int code = conn.getResponseCode();
            InputStream in = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            return new Reply(code, readJson(in));
        } catch (IOException | RuntimeException e) {
            // Never log the URL's query or the token; the exception class is enough to tell offline from timeout.
            Log.w(TAG, "Scheduled job request failed: " + e.getClass().getSimpleName());
            return Reply.NONE;
        } finally {
            if (watchdog != null) watchdog.interrupt();
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * Timeouts bound the connect and each read, not the whole exchange (a slow trickle could outlast the receiver).
     * This thread cuts the connection at the deadline; the blocked call then throws and the run reports a failure.
     */
    private static Thread startWatchdog(HttpURLConnection conn, long afterMs) {
        Thread watchdog = new Thread(
            () -> {
                try {
                    Thread.sleep(afterMs);
                    conn.disconnect();
                } catch (InterruptedException ignored) {
                    /* the request finished in time */
                }
            },
            "LabNinjaScheduler-watchdog"
        );
        watchdog.setDaemon(true);
        watchdog.start();
        return watchdog;
    }

    /** The body as a JSON object, or null when it is empty, not JSON or too large. */
    @Nullable
    private static JSONObject readJson(@Nullable InputStream in) throws IOException {
        if (in == null) return null;
        try (InputStream stream = in) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = stream.read(chunk)) != -1) {
                bytes.write(chunk, 0, n);
                if (bytes.size() > MAX_RESPONSE_BYTES) return null;
            }
            return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        } catch (JSONException e) {
            return null;
        }
    }

    /** Adds a query parameter to an in-app path, keeping any #fragment last. */
    static String withParam(String href, String name, String value) {
        int hash = href.indexOf('#');
        String path = hash >= 0 ? href.substring(0, hash) : href;
        String fragment = hash >= 0 ? href.substring(hash) : "";
        return path + (path.indexOf('?') >= 0 ? "&" : "?") + name + "=" + Uri.encode(value) + fragment;
    }

    @Nullable
    private static String nonEmpty(@Nullable String value, @Nullable String fallback) {
        return value != null && !value.trim().isEmpty() ? value : fallback;
    }
}
