/**
 * FCM push for the Android app (Capacitor shell): asks for permission, registers the device token with the server
 * (login required) and opens the right screen when a push is tapped. No-op in a normal browser.
 * Needs android/app/google-services.json (Firebase) — see README ("Android app").
 */
import { PushNotifications } from '@capacitor/push-notifications';
import { getToken } from '@/lib/auth/tokenStore';
import { isNativeApp } from './nativeReminders';

let started = false;
let lastToken: string | null = null;

async function sendToken(token: string) {
  const auth = getToken();
  if (!auth) return; // not logged in yet: retried on the next start / login
  try {
    await fetch('/api/push/fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* offline: retried on the next start */
  }
}

/** Re-sends the token after login (the token only arrives once per app start). */
export function syncPushTokenAfterLogin() {
  if (lastToken) void sendToken(lastToken);
}

export async function startNativePush(): Promise<void> {
  if (!isNativeApp() || started) return;
  started = true;
  try {
    await PushNotifications.addListener('registration', (t) => {
      lastToken = t.value;
      void sendToken(t.value);
    });
    await PushNotifications.addListener('registrationError', (e) =>
      console.warn('FCM registration error:', e)
    );
    await PushNotifications.addListener('pushNotificationActionPerformed', (e) => {
      const href = (e.notification.data as { href?: string } | undefined)?.href;
      if (href && href.startsWith('/')) window.location.assign(href);
    });
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
    if (perm.receive === 'granted') await PushNotifications.register();
  } catch (err) {
    console.warn('Native push setup failed (is google-services.json in android/app?):', err);
  }
}
