package com.labsninja.app.scheduler;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.annotation.Nullable;
import com.labsninja.app.scheduler.SchedulerStore.Job;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** AlarmManager side of the scheduler: one alarm per stored job, delivered to SchedulerReceiver at job.at. */
final class SchedulerAlarms {

    static final String ACTION_FIRE = "com.labsninja.app.scheduler.FIRE";
    static final String EXTRA_KEY = "key";

    /** Android allows 500 pending alarms per app, shared with @capacitor/local-notifications: stay well under it. */
    private static final int MAX_ALARMS = 300;

    private static final String TAG = "LabNinjaScheduler";

    private SchedulerAlarms() {}

    /**
     * Exact alarms need the user's "Alarms & reminders" grant on Android 12+ (denied by default for new installs on
     * 14+). Without it, alarms still fire, just possibly some minutes late in Doze.
     */
    static boolean exactAllowed(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    /** The jobs worth an alarm: still in the future, soonest first, capped at MAX_ALARMS. */
    private static List<Job> upcoming(Collection<Job> jobs, long now) {
        List<Job> future = new ArrayList<>();
        for (Job job : jobs) {
            if (job.at > now) future.add(job);
        }
        Collections.sort(future, (a, b) -> Long.compare(a.at, b.at));
        return future.size() > MAX_ALARMS ? new ArrayList<>(future.subList(0, MAX_ALARMS)) : future;
    }

    /** Arms each job (re-arming one that is already set just replaces it) and returns those that were armed. */
    private static List<Job> armAll(Context ctx, List<Job> jobs) {
        List<Job> armed = new ArrayList<>();
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return armed;
        boolean exact = exactAllowed(ctx);
        for (Job job : jobs) {
            if (arm(ctx, am, job, exact)) armed.add(job);
        }
        return armed;
    }

    static void cancel(Context ctx, String key) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        PendingIntent pi = pendingIntent(ctx, key, PendingIntent.FLAG_NO_CREATE);
        if (pi == null) return;
        if (am != null) am.cancel(pi);
        pi.cancel();
    }

    /**
     * Makes the alarms match {@code wanted} and returns the jobs to store: every future one that got an alarm, plus (with
     * keepLate) past ones that are still stored. A stored past job hasn't fired yet: its inexact alarm can run minutes
     * late in Doze, so cancelling it would lose the job. After a reboot there is no such alarm any more (keepLate false).
     * Any stored key left out is cancelled.
     */
    static List<Job> reconcile(Context ctx, Map<String, Job> stored, Collection<Job> wanted, boolean keepLate) {
        long now = System.currentTimeMillis();
        List<Job> keep = armAll(ctx, upcoming(wanted, now));
        if (keepLate) {
            for (Job job : wanted) {
                if (job.at <= now && stored.containsKey(job.key)) keep.add(job);
            }
        }
        Set<String> kept = new HashSet<>();
        for (Job job : keep) kept.add(job.key);
        for (String key : stored.keySet()) {
            if (!kept.contains(key)) cancel(ctx, key);
        }
        return keep;
    }

    /** Re-arms what is stored, for a reboot (alarms are cleared), an app update or a new exact-alarm grant. */
    static void rearmStored(Context ctx, boolean afterBoot) {
        synchronized (SchedulerStore.LOCK) {
            Map<String, Job> stored = SchedulerStore.jobs(ctx);
            if (stored.isEmpty()) return;
            SchedulerStore.saveJobs(ctx, reconcile(ctx, stored, stored.values(), !afterBoot));
        }
    }

    private static boolean arm(Context ctx, AlarmManager am, Job job, boolean exact) {
        PendingIntent pi = pendingIntent(ctx, job.key, PendingIntent.FLAG_UPDATE_CURRENT);
        if (pi == null) return false;
        try {
            if (exact) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, job.at, pi);
                    return true;
                } catch (SecurityException revoked) {
                    /* the grant was withdrawn after the check: fall back to an inexact alarm */
                }
            }
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, job.at, pi);
            return true;
        } catch (RuntimeException e) {
            // IllegalStateException once the per-app alarm limit is hit.
            Log.w(TAG, "Could not set an alarm: " + e);
            return false;
        }
    }

    /**
     * The key rides in the intent's data URI as well as its extras: PendingIntent identity ignores extras, so this keeps
     * one alarm per key even if two keys hash to the same request code.
     */
    @Nullable
    private static PendingIntent pendingIntent(Context ctx, String key, int flags) {
        Intent intent = new Intent(ctx, SchedulerReceiver.class)
            .setAction(ACTION_FIRE)
            .setData(Uri.fromParts("labninja-scheduler", key, null))
            .putExtra(EXTRA_KEY, key);
        return PendingIntent.getBroadcast(ctx, SchedulerStore.idFor(key), intent, PendingIntent.FLAG_IMMUTABLE | flags);
    }
}
