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

/** Asks the browser for permission (must run from a tap/click) and switches the preference on. */
export async function enableBrowserNotifications(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!browserNotificationsSupported()) return 'unsupported';
  const result =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  setPrefs({ browser: result === 'granted' });
  return result;
}

function raiseBrowserNotification(item: NotificationItem) {
  if (!getPrefs().browser || browserPermission() !== 'granted') return;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
  try {
    const n = new Notification(item.title, {
      body: item.body,
      tag: item.dedupeKey ?? item.id,
      icon: '/favicon.ico',
    });
    n.onclick = () => {
      window.focus();
      if (item.href) window.location.assign(item.href);
      n.close();
    };
  } catch {
    /* some mobile browsers only allow notifications through a service worker */
  }
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
