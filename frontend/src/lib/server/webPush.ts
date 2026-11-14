// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require('web-push');
import { withTodoDb } from 'fe-apis/todo/_shared';

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BMGzuSpkexvgrnV7tyqkbaHUmmksT8zNId8xXSusY3txzXgLFYLuBhkWcYF15A-4umBKOPndZRUQAGzmsligWvU';

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  '_XJ9xZy3wNF0SsMBsJJ82xi0Z6nsEdrs_baUvrnBYDw';

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  'mailto:admin@labs-ninja.vercel.app';

// Configure web-push once
try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn('Failed to configure web-push VAPID details:', e);
}

export interface WebPushPayload {
  title: string;
  body: string;
  href?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export interface PushSubscriptionRecord {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
  created_at: string;
}

/**
 * Save or update a push subscription in the SQLite database.
 */
export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId?: number;
  userAgent?: string;
}): Promise<void> {
  withTodoDb((db) => {
    db.run(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         updated_at = datetime('now');`,
      sub.userId || 0,
      sub.endpoint,
      sub.keys.p256dh,
      sub.keys.auth,
      sub.userAgent || null
    );
  });
}

/**
 * Remove a push subscription by its endpoint.
 */
export async function removePushSubscription(endpoint: string): Promise<void> {
  withTodoDb((db) => {
    db.run('DELETE FROM push_subscriptions WHERE endpoint = ?;', endpoint);
  });
}

/**
 * Send a web push notification to a specific subscription.
 * Automatically deletes dead/expired subscriptions (HTTP 410 or 404).
 */
export async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: WebPushPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        href: payload.href || '/ai-todo?tab=today',
        tag: payload.tag || 'reminder',
        requireInteraction: payload.requireInteraction !== false,
      }),
      {
        TTL: 86400, // 24 hours
        urgency: 'high',
      }
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 410 || status === 404) {
      // Endpoint is no longer valid, delete it
      await removePushSubscription(sub.endpoint);
      return false;
    }
    console.error('sendWebPush failed:', err);
    return false;
  }
}

/**
 * Sweep tasks whose remind_at has passed and send push notifications to registered subscriptions.
 */
export async function sweepDueReminders(): Promise<{ sent: number; checked: number }> {
  return withTodoDb((db) => {
    // Find tasks that have a reminder due and haven't had a push sent yet
    const dueTasks = db.all<{
      id: number;
      title: string;
      remind_at: string;
      user_id: number;
    }>(
      `SELECT id, title, remind_at, user_id FROM tasks
       WHERE remind_at IS NOT NULL
         AND remind_at <= datetime('now')
         AND (reminder_sent_at IS NULL OR reminder_sent_at < remind_at)
         AND status != 'done'
       LIMIT 50;`
    );

    let sent = 0;

    for (const task of dueTasks) {
      // Find matching subscriptions: either by user_id or all active if user_id == 0
      const subs = db.all<PushSubscriptionRecord>(
        task.user_id > 0
          ? `SELECT * FROM push_subscriptions WHERE user_id = ? OR user_id = 0;`
          : `SELECT * FROM push_subscriptions;`,
        ...(task.user_id > 0 ? [task.user_id] : [])
      );

      for (const sub of subs) {
        void sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          {
            title: `Reminder: ${task.title} 🔔`,
            body: 'Your scheduled task is due now.',
            href: `/ai-todo?tab=today&task=${task.id}`,
            tag: `task-${task.id}`,
            requireInteraction: true,
          }
        );
        sent++;
      }

      // Mark task reminder as sent
      db.run(
        `UPDATE tasks SET reminder_sent_at = datetime('now') WHERE id = ?;`,
        task.id
      );
    }

    return { sent, checked: dueTasks.length };
  });
}
