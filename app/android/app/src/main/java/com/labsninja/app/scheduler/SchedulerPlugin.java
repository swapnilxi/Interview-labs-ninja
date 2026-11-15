package com.labsninja.app.scheduler;

import android.content.Context;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.labsninja.app.scheduler.SchedulerStore.Config;
import com.labsninja.app.scheduler.SchedulerStore.Job;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * JS face of the native scheduler. The web app computes every upcoming occurrence of its reminders and AI jobs and
 * hands the whole list over with sync(); from then on the alarms fire with the app closed (SchedulerReceiver).
 * Capacitor runs these methods on its plugin thread, so the SharedPreferences writes stay off the UI thread.
 */
@CapacitorPlugin(name = "LabNinjaScheduler")
public class SchedulerPlugin extends Plugin {

    /** sync({ origin, apiBase, token, ai, jobs }): replaces the whole job set. Resolves { scheduled, exact }. */
    @PluginMethod
    public void sync(PluginCall call) {
        JSArray rawJobs = call.getArray("jobs");
        if (rawJobs == null) {
            call.reject("jobs must be an array");
            return;
        }
        Map<String, Job> incoming = new LinkedHashMap<>();
        for (int i = 0; i < rawJobs.length(); i++) {
            JSONObject o = rawJobs.optJSONObject(i);
            Job job = o == null ? null : Job.fromJson(o);
            if (job != null) incoming.put(job.key, job);
        }
        Config config = new Config(
            call.getString("origin"),
            call.getString("apiBase"),
            call.getString("token"),
            call.getObject("ai", new JSObject())
        );

        Context ctx = getContext();
        int scheduled = 0;
        synchronized (SchedulerStore.LOCK) {
            Map<String, Job> stored = SchedulerStore.jobs(ctx);
            List<Job> keep = SchedulerAlarms.reconcile(ctx, stored, incoming.values(), true);
            SchedulerStore.save(ctx, config, keep);
            long now = System.currentTimeMillis();
            for (Job job : keep) {
                if (job.at > now) scheduled++;
            }
        }
        JSObject result = new JSObject();
        result.put("scheduled", scheduled);
        result.put("exact", SchedulerAlarms.exactAllowed(ctx));
        call.resolve(result);
    }

    /** status(): resolves { exact, notifications, pending } (pending = stored jobs still in the future). */
    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        long now = System.currentTimeMillis();
        int pending = 0;
        for (Job job : SchedulerStore.jobs(ctx).values()) {
            if (job.at > now) pending++;
        }
        JSObject result = new JSObject();
        result.put("exact", SchedulerAlarms.exactAllowed(ctx));
        result.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        result.put("pending", pending);
        call.resolve(result);
    }

    /** clear(): cancels every alarm and forgets everything, token included (e.g. on sign-out). */
    @PluginMethod
    public void clear(PluginCall call) {
        Context ctx = getContext();
        synchronized (SchedulerStore.LOCK) {
            for (String key : SchedulerStore.jobs(ctx).keySet()) SchedulerAlarms.cancel(ctx, key);
            SchedulerStore.clear(ctx);
        }
        call.resolve();
    }
}
