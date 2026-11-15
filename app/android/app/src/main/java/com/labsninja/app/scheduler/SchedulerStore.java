package com.labsninja.app.scheduler;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.Nullable;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the web app last synced: the config (page origin, API base, token, AI settings) and the upcoming jobs, as JSON
 * strings in one private SharedPreferences file. Alarms, the boot receiver and MainActivity run without the WebView, so
 * this file is all they share. apply() is durable enough here: a receiver's finish() and an activity's onStop() both
 * wait for pending apply() writes before the process can be killed.
 */
public final class SchedulerStore {

    /** Guards every read-modify-write: the plugin runs on Capacitor's plugin thread, the receivers on the main thread. */
    static final Object LOCK = new Object();

    private static final String PREFS = "labninja_scheduler";
    private static final String CONFIG = "config";
    private static final String JOBS = "jobs";

    private SchedulerStore() {}

    /** One upcoming occurrence of a schedule, as computed and handed over by the web code. */
    static final class Job {

        final String key;
        final long scheduleId;
        final String kind;
        final long at;
        final String scheduledFor;
        final String title;
        final String body;
        final String href;

        private Job(String key, long scheduleId, String kind, long at, String scheduledFor, String title, String body, String href) {
            this.key = key;
            this.scheduleId = scheduleId;
            this.kind = kind;
            this.at = at;
            this.scheduledFor = scheduledFor;
            this.title = title;
            this.body = body;
            this.href = href;
        }

        boolean isAgent() {
            return "agent".equals(kind);
        }

        /** Null for an entry the scheduler can't act on (no key, unknown kind, no time). */
        @Nullable
        static Job fromJson(JSONObject o) {
            String key = str(o, "key");
            String kind = str(o, "kind");
            long at = o.optLong("at", 0);
            if (key == null || key.isEmpty() || at <= 0 || !("reminder".equals(kind) || "agent".equals(kind))) {
                return null;
            }
            // Only in-app paths: MainActivity appends href to the page origin, so anything else could leave the site.
            String href = str(o, "href");
            if (href == null || !href.startsWith("/")) href = "/";
            return new Job(
                key,
                o.optLong("scheduleId", 0),
                kind,
                at,
                orEmpty(str(o, "scheduledFor")),
                orEmpty(str(o, "title")),
                orEmpty(str(o, "body")),
                href
            );
        }

        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("key", key);
                o.put("scheduleId", scheduleId);
                o.put("kind", kind);
                o.put("at", at);
                o.put("scheduledFor", scheduledFor);
                o.put("title", title);
                o.put("body", body);
                o.put("href", href);
            } catch (JSONException ignored) {
                /* only thrown for non-finite numbers */
            }
            return o;
        }
    }

    /** How to reach the app: where taps open, where AI jobs are run, and with which credentials and AI settings. */
    static final class Config {

        @Nullable
        final String origin;

        @Nullable
        final String apiBase;

        @Nullable
        final String token;

        /** The web app's AI settings, merged as-is into every run request body. */
        private final String aiJson;

        Config(@Nullable String origin, @Nullable String apiBase, @Nullable String token, @Nullable JSONObject ai) {
            this.origin = origin;
            this.apiBase = apiBase;
            this.token = token;
            this.aiJson = ai == null ? "{}" : ai.toString();
        }

        /** A fresh copy each call, so callers can add fields to it. */
        JSONObject ai() {
            try {
                return new JSONObject(aiJson);
            } catch (JSONException e) {
                return new JSONObject();
            }
        }

        JSONObject toJson() {
            JSONObject o = new JSONObject();
            try {
                o.put("origin", origin);
                o.put("apiBase", apiBase);
                o.put("token", token);
                o.put("ai", ai());
            } catch (JSONException ignored) {
                /* not thrown for strings and objects */
            }
            return o;
        }

        static Config fromJson(JSONObject o) {
            return new Config(str(o, "origin"), str(o, "apiBase"), str(o, "token"), o.optJSONObject("ai"));
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Config config(Context ctx) {
        return Config.fromJson(parseObject(prefs(ctx).getString(CONFIG, null)));
    }

    /** The page origin the web app last synced (taps open origin + href), or null before the first sync. */
    @Nullable
    public static String origin(Context ctx) {
        String origin = config(ctx).origin;
        return origin == null || origin.isEmpty() ? null : origin;
    }

    /** Stored jobs by key, in stored order (soonest first). */
    static Map<String, Job> jobs(Context ctx) {
        Map<String, Job> jobs = new LinkedHashMap<>();
        String raw = prefs(ctx).getString(JOBS, null);
        if (raw == null) return jobs;
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject o = array.optJSONObject(i);
                Job job = o == null ? null : Job.fromJson(o);
                if (job != null) jobs.put(job.key, job);
            }
        } catch (JSONException ignored) {
            /* unreadable: treat as empty, the next sync rewrites it */
        }
        return jobs;
    }

    static void save(Context ctx, Config config, Collection<Job> jobs) {
        prefs(ctx).edit().putString(CONFIG, config.toJson().toString()).putString(JOBS, toJson(jobs)).apply();
    }

    static void saveJobs(Context ctx, Collection<Job> jobs) {
        prefs(ctx).edit().putString(JOBS, toJson(jobs)).apply();
    }

    /** Removes the job and returns it, or null if it isn't stored (already fired, or dropped by a newer sync). */
    @Nullable
    static Job take(Context ctx, String key) {
        synchronized (LOCK) {
            Map<String, Job> jobs = jobs(ctx);
            Job job = jobs.remove(key);
            if (job != null) saveJobs(ctx, jobs.values());
            return job;
        }
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
    }

    /**
     * A stable int for a job key, used as the alarm request code and the notification id. Collisions are harmless: the
     * alarm intent also carries the key as its data URI (so PendingIntents stay distinct), and notifications are
     * posted under the scheduler's own tag.
     */
    static int idFor(String key) {
        return key.hashCode();
    }

    /** A string field, or null when it is missing, JSON null or not a string (org.json's optString returns "null"). */
    @Nullable
    static String str(@Nullable JSONObject o, String name) {
        Object value = o == null ? null : o.opt(name);
        return value instanceof String ? (String) value : null;
    }

    private static String orEmpty(@Nullable String s) {
        return s == null ? "" : s;
    }

    private static String toJson(Collection<Job> jobs) {
        JSONArray array = new JSONArray();
        for (Job job : jobs) array.put(job.toJson());
        return array.toString();
    }

    private static JSONObject parseObject(@Nullable String raw) {
        if (raw == null) return new JSONObject();
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }
}
