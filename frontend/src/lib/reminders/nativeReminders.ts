/**
 * Native Android reminders (Capacitor shell, see capacitor.config.ts).
 *
 * Inside the Android app, every task reminder is registered with the OS as an exact alarm
 * (@capacitor/local-notifications -> AlarmManager). The phone fires it at `remind_at` with the app closed, offline
 * and no server involved, so no cron/sweeper is needed. `syncNativeReminders` mirrors the task list: call it with
 * the current tasks whenever they change (the reminder engine does).
 *
 * In a normal browser every function here is a no-op.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Task } from '@/lib/services/todoService';

/** Android keeps ~500 pending alarms per app; stay well below it (soonest first). */
const MAX_ALARMS = 100;
const CHANNEL_ID = 'task-reminders';

export function isNativeApp(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let channelReady = false;
let tapListenerReady = false;
let chain: Promise<unknown> = Promise.resolve();

async function ensureChannel() {
  if (channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Task reminders',
      description: 'Fires at the exact time you set on a task',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
  } catch {
    /* channel already exists or not supported: the default channel still works */
  }
  channelReady = true;
}

/** Opens the task when a reminder is tapped (also fires for a tap that cold-started the app). */
function ensureTapListener() {
  if (tapListenerReady) return;
  tapListenerReady = true;
  void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const href = (event.notification.extra as { href?: string } | undefined)?.href;
    if (href && href.startsWith('/')) window.location.assign(href);
  });
}

export interface NativeReminderStatus {
  notifications: boolean;
  /** Android 12+: without this, alarms may fire minutes late. */
  exactAlarms: boolean;
}

export async function getNativeReminderStatus(): Promise<NativeReminderStatus | null> {
  if (!isNativeApp()) return null;
  try {
    const perm = await LocalNotifications.checkPermissions();
    const exact = await LocalNotifications.checkExactNotificationSetting();
    return {
      notifications: perm.display === 'granted',
      exactAlarms: exact.exact_alarm === 'granted',
    };
  } catch {
    return null;
  }
}

/** Asks for notification permission and the exact-alarm setting. Call from a tap (Settings) when possible. */
export async function enableNativeReminders(): Promise<NativeReminderStatus | null> {
  if (!isNativeApp()) return null;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    let exact = await LocalNotifications.checkExactNotificationSetting();
    if (exact.exact_alarm !== 'granted')
      exact = await LocalNotifications.changeExactNotificationSetting();
    return {
      notifications: perm.display === 'granted',
      exactAlarms: exact.exact_alarm === 'granted',
    };
  } catch {
    return null;
  }
}

function signature(task: Task): string {
  return `${task.title}|${task.remind_at}`;
}

async function doSync(tasks: Task[]) {
  ensureTapListener();
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') return; // user hasn't allowed notifications yet (Settings -> enable)
  await ensureChannel();

  const now = Date.now();
  const wanted = new Map<number, { task: Task; at: Date }>();
  tasks
    .filter((t) => t.remind_at && t.status !== 'done' && t.status !== 'not_done')
    .map((t) => ({ task: t, at: new Date(t.remind_at as string) }))
    .filter(({ at }) => !Number.isNaN(at.getTime()) && at.getTime() > now + 1000)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_ALARMS)
    .forEach((entry) => wanted.set(entry.task.id, entry));

  const { notifications: pending } = await LocalNotifications.getPending();
  const pendingById = new Map(pending.map((p) => [p.id, p]));

  // Cancel alarms for tasks that are gone, done, or whose title/time changed.
  const stale = pending.filter((p) => {
    const w = wanted.get(p.id);
    return !w || (p.extra as { sig?: string } | undefined)?.sig !== signature(w.task);
  });
  if (stale.length)
    await LocalNotifications.cancel({ notifications: stale.map((p) => ({ id: p.id })) });

  const toSchedule: LocalNotificationSchema[] = [];
  for (const [id, { task, at }] of wanted) {
    const existing = pendingById.get(id);
    if (existing && !stale.includes(existing)) continue; // already registered, unchanged
    toSchedule.push({
      id,
      title: task.title,
      body: 'Reminder · due now',
      channelId: CHANNEL_ID,
      schedule: { at, allowWhileIdle: true },
      smallIcon: 'ic_stat_icon',
      extra: { href: `/ai-todo?tab=today&task=${id}`, sig: signature(task) },
    });
  }
  if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule });
}

/** Makes the phone's pending alarms match `tasks`. Serialized, never throws. */
export function syncNativeReminders(tasks: Task[]): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  const run = chain
    .then(() => doSync(tasks))
    .catch((err) => console.warn('Native reminder sync failed:', err));
  chain = run;
  return run as Promise<void>;
}
