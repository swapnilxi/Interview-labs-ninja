package com.labsninja.app.scheduler;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Alarms don't survive a reboot, so re-arm the stored jobs from the last sync (past ones are dropped: the phone was off
 * when they were due). Also runs after an app update, as a safety net, and when the user grants exact alarms, so jobs
 * armed as inexact become exact without waiting for the next sync.
 */
public class SchedulerBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            SchedulerAlarms.rearmStored(context.getApplicationContext(), true);
        } else if (
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)
        ) {
            SchedulerAlarms.rearmStored(context.getApplicationContext(), false);
        }
    }
}
