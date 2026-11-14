/**
 * In-app notification centre store. Plain module (no React), like `toast.ts`, so services and
 * modules can raise a notification without knowing about any component. `NotificationCenter`
 * renders it (bell + sheet); `NotificationHost` mounts once in the root layout and runs reminders.
 *
 * Unlike a toast, a notification is kept (localStorage, per browser) until the person clears it,
 * so a result that finished while they were on another page is still there when they come back.
 * Guests get it too — nothing here touches the backend.
 */

import { toast } from '@/lib/ui/toast';

export type NotificationSource = 'daily-session' | 'labs' | 'todo' | 'system';
export type NotificationTone = 'info' | 'success' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  source: NotificationSource;
  tone: NotificationTone;
  title: string;
  body?: string;
  /** Where tapping the notification goes. */
  href?: string;
  createdAt: number;
  read: boolean;
  /** Same key again replaces the earlier entry instead of stacking (e.g. one reminder per day). */
  dedupeKey?: string;
}

export interface NotifyInput {
  source: NotificationSource;
  title: string;
  body?: string;
  tone?: NotificationTone;
  href?: string;
  dedupeKey?: string;
  /** Also show a transient toast. Default true. */
  toast?: boolean;
  /** Also raise an OS notification when the tab is in the background and permission was granted. */
  browser?: boolean;
}

export interface NotificationPrefs {
  /** OS-level notifications while the tab is hidden (needs browser permission too). */
  browser: boolean;
  dailyReminder: boolean;
  /** Local hour (0-23) after which an unfinished daily session triggers a reminder. */
  dailyReminderHour: number;
  todoDue: boolean;
  /** A task's own reminder, at the exact time set on it (To-Do → Today, the voice capture, the task panel). */
  todoReminders: boolean;
  labs: boolean;
}

const ITEMS_KEY = 'labninja.notifications.v1';
const PREFS_KEY = 'labninja.notification_prefs.v1';
const MAX_ITEMS = 50;

export const DEFAULT_PREFS: NotificationPrefs = {
  browser: false,
  dailyReminder: true,
  dailyReminderHour: 9,
  todoDue: true,
  todoReminders: true,
  labs: true,
};

const NO_ITEMS: NotificationItem[] = [];

let items: NotificationItem[] | null = null;
let prefs: NotificationPrefs | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: the store still works for this page view */
  }
}

function load(): NotificationItem[] {
  if (items === null) {
    const stored = readJson<NotificationItem[]>(ITEMS_KEY);
    items = Array.isArray(stored) ? stored.filter((n) => n && typeof n.id === 'string') : [];
  }
  return items;
}

function commit(next: NotificationItem[]) {
  items = next.slice(0, MAX_ITEMS);
  writeJson(ITEMS_KEY, items);
  emit();
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the list (or the prefs): pick it up.
  const onStorage = (event: StorageEvent) => {
    if (event.key === ITEMS_KEY) items = null;
    if (event.key === PREFS_KEY) prefs = null;
    if (event.key === ITEMS_KEY || event.key === PREFS_KEY) emit();
  };
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    storageHandler = onStorage;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageHandler && typeof window !== 'undefined') {
      window.removeEventListener('storage', storageHandler);
      storageHandler = null;
    }
  };
}
let storageHandler: ((event: StorageEvent) => void) | null = null;

/** Stable between changes, as `useSyncExternalStore` requires. */
export function getNotifications(): NotificationItem[] {
  return typeof window === 'undefined' ? NO_ITEMS : load();
}

export function getServerNotifications(): NotificationItem[] {
  return NO_ITEMS;
}

export function getPrefs(): NotificationPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  if (prefs === null)
    prefs = { ...DEFAULT_PREFS, ...(readJson<Partial<NotificationPrefs>>(PREFS_KEY) ?? {}) };
  return prefs;
}

export function getServerPrefs(): NotificationPrefs {
  return DEFAULT_PREFS;
}

export function setPrefs(patch: Partial<NotificationPrefs>) {
  prefs = { ...getPrefs(), ...patch };
  writeJson(PREFS_KEY, prefs);
  emit();
}

export function browserNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function browserPermission(): NotificationPermission | 'unsupported' {
  return browserNotificationsSupported() ? Notification.permission : 'unsupported';
}

/**
 * The app's service worker (public/sw.js). Phones need it for notifications: Android Chrome refuses
 * `new Notification()` from a page, and an iPhone shows them only for the app added to the Home Screen, through
 * the worker. It also opens the right task when a notification is tapped. Registered once notifications are on.
 */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

/** The worker once it is active: a just-registered one can't show notifications until it has activated. */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  const registration = await ensureServiceWorker();
  if (!registration) return null;
  if (registration.active) return registration;
  const ready = navigator.serviceWorker.ready.catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
  return (await Promise.race([ready, timeout])) ?? null;
}

export const DEFAULT_VAPID_PUBLIC_KEY =
  'BMGzuSpkexvgrnV7tyqkbaHUmmksT8zNId8xXSusY3txzXgLFYLuBhkWcYF15A-4umBKOPndZRUQAGzmsligWvU';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribes this browser/phone to native Web Push (VAPID) so reminders can wake the phone
 * even when the app is completely closed.
 */
export async function subscribeToWebPush(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  if (browserPermission() !== 'granted') return null;

  try {
    const registration = await activeRegistration();
    if (!registration) return null;

    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pubKey) as unknown as BufferSource,
      });
    }

    const json = sub.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
    }

    return sub;
  } catch (err) {
    console.warn('Web push subscription failed:', err);
    return null;
  }
}

/** Asks the browser for permission (must run from a tap/click) and switches the preference on. */
export async function enableBrowserNotifications(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!browserNotificationsSupported()) return 'unsupported';
  // Ask first, straight from the tap: Safari drops the request if anything is awaited before it.
  const result =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  setPrefs({ browser: result === 'granted' });
  if (result === 'granted') {
    void ensureServiceWorker().then(() => subscribeToWebPush());
  }
  return result;
}

export interface DeviceNotificationInput {
  title: string;
  body?: string;
  /** Same tag replaces the earlier notification on the device instead of stacking. */
  tag?: string;
  href?: string;
  /** Stays on screen until dealt with (desktop Chrome/Edge); phones decide for themselves. */
  requireInteraction?: boolean;
}

/**
 * Shows a notification on this device: through the service worker when there is one (the only way on Android and on
 * an installed iPhone app), else the page's Notification API (desktop). Needs the person's permission and the
 * "Browser notifications" switch. Returns whether it was shown.
 */
export async function showDeviceNotification(input: DeviceNotificationInput): Promise<boolean> {
  if (!getPrefs().browser || browserPermission() !== 'granted') return false;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const icon = origin ? `${origin}/icons/icon-192.png` : '/icons/icon-192.png';
  const badge = origin ? `${origin}/icons/badge-96.png` : '/icons/badge-96.png';
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: input.body,
    tag: input.tag,
    icon,
    badge,
    data: { href: input.href ?? '/ai-todo' },
    requireInteraction: input.requireInteraction,
    renotify: Boolean(input.tag),
    vibrate: [180, 80, 180],
  };
  try {
    const registration = await activeRegistration();
    if (registration) {
      await registration.showNotification(input.title, options);
      return true;
    }
  } catch {
    /* fall through to the page API */
  }
  try {
    const n = new Notification(input.title, options);
    n.onclick = () => {
      window.focus();
      if (input.href) window.location.assign(input.href);
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** "Send a test" in the notification settings: proves permission, the worker and the device all work. */
export async function sendTestNotification(): Promise<boolean> {
  if (browserNotificationsSupported()) {
    if (browserPermission() === 'default') {
      await enableBrowserNotifications();
    } else if (browserPermission() === 'granted') {
      setPrefs({ browser: true });
    }
  }

  // Attempt server Web Push first (tests the real mobile background gateway)
  try {
    const pushSub = await subscribeToWebPush();
    if (pushSub) {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: pushSub.endpoint,
          keys: pushSub.toJSON().keys,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) return true;
      }
    }
  } catch {
    /* Fallback to local service worker notification */
  }

  return showDeviceNotification({
    title: 'LabNinja Android Push 🔔',
    body: 'Mobile notifications are active and working! Tap to open.',
    tag: 'labninja-test',
    href: '/ai-todo?tab=today',
    requireInteraction: true,
  });
}

/** True when the person is not looking at this tab right now (another tab, another app, screen off). */
export function pageInBackground(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'visible' || !document.hasFocus();
}

function raiseBrowserNotification(item: NotificationItem) {
  if (!pageInBackground()) return;
  void showDeviceNotification({
    title: item.title,
    body: item.body,
    tag: item.dedupeKey ?? item.id,
    href: item.href,
  });
}

export function notify(input: NotifyInput): string {
  if (input.source === 'labs' && !getPrefs().labs) return '';
  const tone = input.tone ?? 'info';
  const item: NotificationItem = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    source: input.source,
    tone,
    title: input.title,
    body: input.body,
    href: input.href,
    createdAt: Date.now(),
    read: false,
    dedupeKey: input.dedupeKey,
  };
  const current = load();
  commit([item, ...current.filter((n) => !(input.dedupeKey && n.dedupeKey === input.dedupeKey))]);

  if (input.toast !== false) {
    const message = input.body ? `${input.title} — ${input.body}` : input.title;
    if (tone === 'error') toast.error(message);
    else if (tone === 'success') toast.success(message);
    else toast.info(message);
  }
  if (input.browser !== false) raiseBrowserNotification(item);
  return item.id;
}

/** True when a notification with this key already exists — reminders use it to fire once a day. */
export function hasNotification(dedupeKey: string): boolean {
  return load().some((n) => n.dedupeKey === dedupeKey);
}

export function markRead(id: string) {
  const current = load();
  if (!current.some((n) => n.id === id && !n.read)) return;
  commit(current.map((n) => (n.id === id ? { ...n, read: true } : n)));
}

export function markAllRead() {
  const current = load();
  if (current.every((n) => n.read)) return;
  commit(current.map((n) => (n.read ? n : { ...n, read: true })));
}

export function removeNotification(id: string) {
  commit(load().filter((n) => n.id !== id));
}

export function clearNotifications() {
  commit([]);
}

export function unreadCount(list: NotificationItem[]): number {
  return list.reduce((count, n) => count + (n.read ? 0 : 1), 0);
}
