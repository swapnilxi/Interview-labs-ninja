import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native Android shell. The app itself is the deployed Next.js site, loaded in a WebView (server.url), so the web
 * code stays the single source of truth. The shell only adds what a browser can't do with the app closed: exact
 * OS alarms for task reminders (@capacitor/local-notifications) and FCM push (@capacitor/push-notifications).
 *
 * CAP_SERVER_URL: where the app is served. Production URL, or http://<your-mac-LAN-ip>:4028 for local dev.
 */
const serverUrl = process.env.CAP_SERVER_URL || 'https://labs-ninja.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.labsninja.app',
  appName: 'LabNinja',
  webDir: 'native-shell',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_icon', iconColor: '#2563EB' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
