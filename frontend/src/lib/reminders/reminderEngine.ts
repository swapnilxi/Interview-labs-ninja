/**
 * Fires task reminders at their exact time.
 *
 * Mounted once (NotificationHost, root layout), so a reminder goes off on whichever page is open. It reads the tasks
 * (API when logged in, this browser's IndexedDB for guests), raises every reminder that is due, and sleeps until the
 * next one. It wakes early when tasks change in this tab, when the tab comes back to the front, and every few minutes.
 *
 * What it can't do: fire while no tab of the app is open. Phones pause web pages in the background, so the
 * notification-setup guide (public/notification-setup.html) explains the calendar export and the pending server push.
 */

import { todoService, TASKS_CHANGED_EVENT, type Task } from '@/lib/services/todoService';
import { getPrefs, notify, pageInBackground, showDeviceNotification } from '@/lib/ui/notifications';
import { formatReminder } from './reminderTime';
import { isNativeApp, syncNativeReminders } from './nativeReminders';

export interface ReminderAlert {
  key: string;
  taskId: number;
  title: string;
  remindAt: string;
  /** Found after the time had already passed by a while (the app was closed). Shown, but without a sound. */
  missed: boolean;
}

// ── Alert store (what the in-app reminder cards show) ─────────────────────────────────────────────────────────

let alerts: ReminderAlert[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeReminderAlerts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReminderAlerts(): ReminderAlert[] {
  return alerts;
}

const NO_ALERTS: ReminderAlert[] = [];
export function getServerReminderAlerts(): ReminderAlert[] {
  return NO_ALERTS;
}

export function dismissReminderAlert(key: string) {
  const next = alerts.filter((a) => a.key !== key);
  if (next.length !== alerts.length) {
    alerts = next;
    emit();
  }
}

function pushAlert(alert: ReminderAlert) {
  alerts = [alert, ...alerts.filter((a) => a.taskId !== alert.taskId)].slice(0, 4);
  emit();
}

// ── Fired bookkeeping (survives reloads; shared by every tab of this browser) ─────────────────────────────────

const FIRED_KEY = 'labninja.reminders.fired.v1';
const KEEP_FIRED_MS = 30 * 24 * 3600_000;
/** Found later than this after its time: shown as "missed", without an OS notification or sound. */
const LATE_MS = 15 * 60_000;
const POLL_MS = 3 * 60_000;

function readFired(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function markFired(key: string) {
  const fired = readFired();
  const cutoff = Date.now() - KEEP_FIRED_MS;
  for (const k of Object.keys(fired)) if (fired[k] < cutoff) delete fired[k];
  fired[key] = Date.now();
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
  } catch {
    /* private mode: still fires once per page view */
  }
}

// ── Sound + vibration for a reminder that goes off while the app is in front ──────────────────────────────────

let audio: AudioContext | null = null;

function chime() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio = audio ?? new Ctor();
    if (audio.state === 'suspended') void audio.resume();
    const t0 = audio.currentTime + 0.02;
    [880, 1318.5].forEach((freq, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    /* no audio before the first tap on some browsers: the card still shows */
  }
  try {
    navigator.vibrate?.([160, 70, 160]);
  } catch {
    /* not supported */
  }
}

// ── The scheduler ─────────────────────────────────────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

export function taskHref(taskId: number): string {
  return `/ai-todo?tab=today&task=${taskId}`;
}

function fire(task: Task, missed: boolean) {
  const remindAt = task.remind_at as string;
  const key = `${task.id}@${remindAt}`;
  markFired(key);
  pushAlert({ key, taskId: task.id, title: task.title, remindAt, missed });
  const when = formatReminder(remindAt);
  notify({
    source: 'todo',
    tone: missed ? 'warning' : 'info',
    title: missed ? `Missed reminder: ${task.title}` : task.title,
    body: missed ? `Was due ${when}` : `Reminder · ${when}`,
    href: taskHref(task.id),
    dedupeKey: `todo-remind:${key}`,
    toast: false,
    browser: false,
  });
  if (missed) return;
  if (isNativeApp()) {
    // The OS alarm shows the notification (sound, vibration, lock screen); the in-app card above is enough here.
    chime();
  } else if (pageInBackground()) {
    void showDeviceNotification({
      title: task.title,
      body: `Reminder · ${when}`,
      tag: `reminder-${task.id}`,
      href: taskHref(task.id),
      requireInteraction: true,
    });
  } else {
    chime();
  }
}

function schedule(nextAt: number) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!Number.isFinite(nextAt)) return;
  // setTimeout overflows past ~24.8 days; wake up at least every 6 hours anyway (clock changes, sleep).
  const delay = Math.min(Math.max(nextAt - Date.now(), 0) + 300, 6 * 3600_000);
  timer = setTimeout(() => void checkReminders(), delay);
}

/** Fire what is due, then sleep until the next reminder. Safe to call often. */
export async function checkReminders(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    if (!getPrefs().todoReminders) {
      void syncNativeReminders([]); // reminders switched off: clear the phone's alarms too
      schedule(Infinity);
      return;
    }
    let tasks: Task[];
    try {
      tasks = await todoService.fetchTasks();
    } catch {
      return;
    }
    // Android app: hand every reminder to the OS as an exact alarm, so it fires with the app closed.
    void syncNativeReminders(tasks);
    const now = Date.now();
    const fired = readFired();
    let nextAt = Infinity;
    for (const task of tasks) {
      if (!task.remind_at || task.status === 'done' || task.status === 'not_done') continue;
      const at = Date.parse(task.remind_at);
      if (Number.isNaN(at)) continue;
      if (at > now) {
        nextAt = Math.min(nextAt, at);
        continue;
      }
      if (fired[`${task.id}@${task.remind_at}`]) continue;
      fire(task, now - at > LATE_MS);
    }
    schedule(nextAt);
  } finally {
    running = false;
    if (again) {
      again = false;
      void checkReminders();
    }
  }
}

/** Starts the scheduler; returns the cleanup. */
export function startReminderEngine(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') void checkReminders();
  };
  const onChange = () => void checkReminders();
  const first = setTimeout(() => void checkReminders(), 1200);
  // Polling is only a safety net while someone is looking; the precise timer covers the rest.
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') void checkReminders();
  }, POLL_MS);
  window.addEventListener(TASKS_CHANGED_EVENT, onChange);
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(first);
    clearInterval(poll);
    if (timer) clearTimeout(timer);
    window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
