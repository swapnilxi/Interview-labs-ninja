package com.labsninja.app.scheduler;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.labsninja.app.scheduler.SchedulerStore.Job;

/** A job's alarm went off (the app may be closed): show the reminder, or run the AI job and show its answer. */
public class SchedulerReceiver extends BroadcastReceiver {

    private static final String TAG = "LabNinjaScheduler";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!SchedulerAlarms.ACTION_FIRE.equals(intent.getAction())) return;
        String key = intent.getStringExtra(SchedulerAlarms.EXTRA_KEY);
        if (key == null) return;
        Context app = context.getApplicationContext();
        // Taking it out first means a sync racing this alarm can't arm it again, and it never fires twice.
        Job job = SchedulerStore.take(app, key);
        if (job == null) return; // dropped by a newer sync, or cleared

        if (!job.isAgent()) {
            SchedulerNotifier.show(app, job.key, job.title, job.body, job.href);
            return;
        }
        // The HTTP call can take most of a minute: goAsync() keeps the broadcast (and the alarm's wake lock) alive
        // until finish(), which must always run.
        PendingResult pending = goAsync();
        new Thread(
            () -> {
                try {
                    SchedulerAgentRun.run(app, job, SchedulerStore.config(app));
                } catch (RuntimeException e) {
                    Log.w(TAG, "Scheduled job failed", e);
                } finally {
                    pending.finish();
                }
            },
            "LabNinjaScheduler"
        ).start();
    }
}
