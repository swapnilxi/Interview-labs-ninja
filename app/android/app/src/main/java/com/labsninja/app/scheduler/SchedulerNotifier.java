package com.labsninja.app.scheduler;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.labsninja.app.MainActivity;
import com.labsninja.app.R;

/** Posts the scheduler's notifications. A tap opens MainActivity, which loads origin + href in the WebView. */
final class SchedulerNotifier {

    private static final String CHANNEL_ID = "scheduled-jobs";
    private static final String CHANNEL_NAME = "Scheduled jobs";

    /** Our own tag keeps these ids apart from @capacitor/local-notifications', which posts untagged. */
    private static final String NOTIFICATION_TAG = "labninja-scheduler";

    /** A private action keeps our tap PendingIntents distinct from local-notifications' ones for MainActivity. */
    private static final String ACTION_OPEN = "com.labsninja.app.scheduler.OPEN";

    /** Same accent as the LocalNotifications iconColor in capacitor.config.ts. */
    private static final int ACCENT = 0xFF2563EB;

    private static final String TAG = "LabNinjaScheduler";

    private SchedulerNotifier() {}

    static void show(Context ctx, String key, String title, String text, String href) {
        if (!allowed(ctx)) return;
        NotificationManagerCompat manager = NotificationManagerCompat.from(ctx);
        // No-op below Android 8 and when the channel exists (the user's own changes to it are kept).
        manager.createNotificationChannel(
            new NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_HIGH).setName(CHANNEL_NAME).build()
        );

        int id = SchedulerStore.idFor(key);
        Intent tap = new Intent(ctx, MainActivity.class)
            .setAction(ACTION_OPEN)
            .putExtra(MainActivity.EXTRA_HREF, href)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // Request code = notification id: PendingIntent identity ignores extras, so a shared code would let a later
        // notification overwrite an earlier one's href.
        PendingIntent contentIntent = PendingIntent.getActivity(
            ctx,
            id,
            tap,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon) // the monochrome bell LocalNotifications uses (smallIcon in config)
            .setColor(ACCENT)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH) // heads-up below Android 8, where channels don't exist
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build();
        try {
            manager.notify(NOTIFICATION_TAG, id, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Notification permission withdrawn", e);
        }
    }

    /** Skip silently when the user hasn't allowed notifications (POST_NOTIFICATIONS on 13+, or the app switch). */
    private static boolean allowed(Context ctx) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false;
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }
}
