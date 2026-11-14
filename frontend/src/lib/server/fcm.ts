/**
 * Firebase Cloud Messaging sender for the Android app (token rows live in `fcm_tokens`).
 *
 * Needs FIREBASE_SERVICE_ACCOUNT (the service-account JSON, as one line) in the server env. Without it every
 * function here is a safe no-op and `fcmConfigured()` is false, so the rest of the app is unaffected.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { withTodoDb } from 'fe-apis/todo/_shared';

let app: App | null | undefined;

function getApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return (app = null);
  try {
    const existing = getApps()[0];
    app = existing ?? initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (err) {
    console.error('Firebase admin init failed:', err);
    app = null;
  }
  return app;
}

export function fcmConfigured(): boolean {
  return getApp() !== null;
}

export function saveFcmToken(userId: number, token: string, platform = 'android'): void {
  withTodoDb((db) => {
    db.run(
      `INSERT INTO fcm_tokens (user_id, token, platform, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, updated_at = datetime('now');`,
      userId,
      token,
      platform
    );
  });
}

export function removeFcmToken(token: string): void {
  withTodoDb((db) => db.run('DELETE FROM fcm_tokens WHERE token = ?;', token));
}

export interface FcmPayload {
  title: string;
  body: string;
  href?: string;
  tag?: string;
}

/** Sends a visible notification to every Android device of a user. Returns how many were accepted. */
export async function sendFcmToUser(userId: number, payload: FcmPayload): Promise<number> {
  const firebase = getApp();
  if (!firebase) return 0;
  const tokens = withTodoDb((db) =>
    db
      .all<{ token: string }>('SELECT token FROM fcm_tokens WHERE user_id = ?;', userId)
      .map((r) => r.token)
  );
  if (!tokens.length) return 0;
  const res = await getMessaging(firebase).sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: { href: payload.href || '/ai-todo?tab=today' },
    android: {
      priority: 'high',
      notification: {
        channelId: 'task-reminders',
        tag: payload.tag,
        icon: 'ic_stat_icon',
        color: '#2563EB',
      },
    },
  });
  // Drop tokens Firebase says are dead (app uninstalled / token rotated).
  res.responses.forEach((r, i) => {
    const code = r.error?.code;
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      removeFcmToken(tokens[i]);
    }
  });
  return res.successCount;
}
