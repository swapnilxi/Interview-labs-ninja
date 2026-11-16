/**
 * Runs the To-Do Scheduler on the website (any page; mounted once by NotificationHost).
 *
 * For every enabled schedule it finds the latest occurrence that has come round and hasn't been handled yet:
 * - reminder: an in-app card, a notification-centre entry and (tab in the background) a device notification;
 * - AI job: POST /todo/schedules/{id}/run, then the AI's answer the same three ways.
 * Then it sleeps until the next occurrence. It also wakes when schedules change, when the tab comes back, and
 * every few minutes as a safety net.
 *
 * Closed tab: nothing runs (the website has no server cron, by choice). What came round meanwhile is caught up once
 * the app is open again: a reminder found more than 15 minutes late is shown as missed; an AI job up to 6 hours late
 * still runs (marked late), older ones are reported as missed. Only the LATEST missed occurrence counts, so a week
 * away doesn't replay 7 morning briefings.
 *
 * Android app: the native plugin (nativeScheduler.ts) fires the same occurrences with the app closed. When the app is
 * open both may try the same one; the server's one-run-per-occurrence claim makes that harmless.
 */

import {
  scheduleService,
  SCHEDULES_CHANGED_EVENT,
  parseServerTime,
  type Schedule,
  type RunResult,
} from '@/lib/services/scheduleService';
import { isLoggedIn, onAuthChange } from '@/lib/auth/tokenStore';
import { notify, pageInBackground, showDeviceNotification } from '@/lib/ui/notifications';
import { lastOccurrence, nextOccurrence } from './scheduleRules';
import {
  nativeSchedulerAvailable,
  scheduleHref,
  scheduleTargetHref,
  syncNativeSchedules,
} from './nativeScheduler';

export interface ScheduleAlert {
  key: string;
  scheduleId: number;
  kind: 'reminder' | 'agent';
  title: string;
  body: string;
  /** When the occurrence was due (ISO). */
  at: string;
  state: 'ok' | 'running' | 'error' | 'missed' | 'late';
  runId?: number;
  /** Where the card's Open button goes when it is not the Scheduler tab (a class reminder opens its class). */
  href?: string;
}

// ── Alert store (the in-app cards, ScheduleAlerts.tsx) ───────────────────────────────────────────────────────────

let alerts: ScheduleAlert[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const NO_ALERTS: ScheduleAlert[] = [];

export function subscribeScheduleAlerts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getScheduleAlerts = () => alerts;
export const getServerScheduleAlerts = () => NO_ALERTS;

export function dismissScheduleAlert(key: string) {
  const next = alerts.filter((a) => a.key !== key);
  if (next.length !== alerts.length) {
    alerts = next;
    emit();
  }
}

function upsertAlert(alert: ScheduleAlert) {
  alerts = [alert, ...alerts.filter((a) => a.key !== alert.key)].slice(0, 4);
  emit();
}

// ── Handled-occurrence bookkeeping (survives reloads; shared by this browser's tabs) ─────────────────────────────

const FIRED_KEY = 'labninja.schedules.fired.v1';
const KEEP_MS = 14 * 86_400_000;
/** A reminder found later than this is "missed" (no sound, no device notification). */
const LATE_MS = 15 * 60_000;
/** An AI job found up to this late still runs (marked late). */
const AGENT_CATCHUP_MS = 6 * 3600_000;
/** How far back to look for an occurrence that came round while the app was closed. */
const LOOKBACK_MS = 36 * 3600_000;
const POLL_MS = 3 * 60_000;

function readFired(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Marks an occurrence handled; false when another tab got there first. */
function claimLocally(key: string): boolean {
  const fired = readFired();
  if (fired[key]) return false;
  const cutoff = Date.now() - KEEP_MS;
  for (const k of Object.keys(fired)) if (fired[k] < cutoff) delete fired[k];
  fired[key] = Date.now();
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
  } catch {
    /* private mode: still once per page view via the server claim */
  }
  return true;
}

// ── Delivery ─────────────────────────────────────────────────────────────────────────────────────────────────────

function chime() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const t0 = ctx.currentTime + 0.02;
    [659.25, 987.77].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const start = t0 + i * 0.15;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 1200);
  } catch {
    /* no audio before a first tap: the card still shows */
  }
}

/** In-app card + notification centre + (background, not the Android app) device notification. */
function deliver(alert: ScheduleAlert, href: string, quiet: boolean) {
  upsertAlert(alert);
  notify({
    source: 'todo',
    tone: alert.state === 'error' ? 'error' : alert.state === 'missed' ? 'warning' : 'info',
    title: alert.state === 'missed' ? `Missed: ${alert.title}` : alert.title,
    body: alert.body,
    href,
    dedupeKey: `schedule:${alert.key}`,
    toast: false,
    browser: false,
  });
  if (quiet) return;
  // In the Android app the native alarm already shows the phone notification.
  if (!nativeSchedulerAvailable() && pageInBackground()) {
    void showDeviceNotification({
      title: alert.title,
      body: alert.body,
      tag: `schedule-${alert.key}`,
      href,
      requireInteraction: true,
    });
  } else {
    chime();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs one occurrence of an AI job and shows its answer. Exported for the Scheduler tab ("Run now", and the
 * `run_now` link a failed phone run opens).
 */
export async function runAgentOccurrence(
  schedule: Schedule,
  scheduledFor: string,
  opts: { source: 'web' | 'app' | 'manual'; late?: boolean; quiet?: boolean } = { source: 'web' }
): Promise<RunResult | null> {
  const key = `${schedule.id}@${scheduledFor}`;
  const href = scheduleHref(schedule.id);
  const base = { key, scheduleId: schedule.id, kind: 'agent' as const, at: scheduledFor };
  upsertAlert({
    ...base,
    title: schedule.title,
    body: 'Running your scheduled AI job…',
    state: 'running',
  });
  try {
    let result = await scheduleService.run(schedule.id, scheduledFor, opts.source);
    // Another device is running it right now: ask again until its answer is in.
    for (let i = 0; i < 4 && result.duplicate && result.run.status === 'running'; i++) {
      await sleep(8000);
      result = await scheduleService.run(schedule.id, scheduledFor, opts.source);
    }
    const run = result.run;
    if (run.status === 'running') {
      deliver(
        {
          ...base,
          title: schedule.title,
          body: 'Still running on another device.',
          state: 'running',
        },
        href,
        true
      );
    } else if (run.status === 'error') {
      deliver(
        {
          ...base,
          title: `Couldn't run: ${schedule.title}`,
          body: run.output || 'The AI job failed.',
          state: 'error',
          runId: run.id,
        },
        href,
        false
      );
    } else {
      const added =
        result.tasks.length && schedule.add_tasks
          ? ` · Added ${result.tasks.length} task${result.tasks.length > 1 ? 's' : ''}`
          : '';
      deliver(
        {
          ...base,
          title: run.title || schedule.title,
          body: `${run.output || ''}${added}`,
          state: opts.late ? 'late' : 'ok',
          runId: run.id,
        },
        `${href}&run=${run.id}`,
        // Already run elsewhere (the phone's alarm, another tab): show the answer, without a second chime.
        !!opts.quiet || result.duplicate
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The AI job failed.';
    deliver(
      { ...base, title: `Couldn't run: ${schedule.title}`, body: message, state: 'error' },
      href,
      false
    );
    return null;
  }
}

async function fireReminder(schedule: Schedule, at: Date, missed: boolean) {
  const scheduledFor = at.toISOString();
  const key = `${schedule.id}@${scheduledFor}`;
  const href = scheduleTargetHref(schedule);
  deliver(
    {
      key,
      scheduleId: schedule.id,
      kind: 'reminder',
      title: schedule.title,
      body: schedule.message || 'Scheduled reminder',
      at: scheduledFor,
      state: missed ? 'missed' : 'ok',
      // Only a link that is not the Scheduler tab is kept on the card (a class reminder's class).
      ...(href !== scheduleHref(schedule.id) ? { href } : {}),
    },
    href,
    missed
  );
  if (!missed) {
    try {
      await scheduleService.run(schedule.id, scheduledFor, 'web'); // history + once-schedules switch off
    } catch {
      /* the card already showed; history is best-effort */
    }
  }
}

// ── The loop ─────────────────────────────────────────────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;

function sleepUntil(nextAt: number) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!Number.isFinite(nextAt)) return;
  const delay = Math.min(Math.max(nextAt - Date.now(), 0) + 400, 6 * 3600_000);
  timer = setTimeout(() => void checkSchedules(), delay);
}

export async function checkSchedules(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    let schedules: Schedule[];
    try {
      schedules = await scheduleService.list();
    } catch {
      return;
    }
    void syncNativeSchedules(schedules);
    const now = new Date();
    let nextAt = Infinity;
    for (const s of schedules) {
      if (!s.enabled) continue;
      if (s.kind === 'agent' && !isLoggedIn()) continue;
      const since = Math.max(
        parseServerTime(s.updated_at) || 0,
        parseServerTime(s.created_at) || 0,
        now.getTime() - LOOKBACK_MS
      );
      const due = lastOccurrence(s.rule, now, new Date(since));
      if (due) {
        const late = now.getTime() - due.getTime();
        const key = `${s.id}@${due.toISOString()}`;
        if (claimLocally(key)) {
          if (s.kind === 'reminder') {
            if (late > LATE_MS && nativeSchedulerAvailable()) {
              // Android app: the native alarm already rang as a phone notification, so no "missed" card; just record
              // it (history, and a one-time reminder switches off instead of staying on with no upcoming run).
              void scheduleService.run(s.id, due.toISOString(), 'app').catch(() => {});
            } else {
              void fireReminder(s, due, late > LATE_MS);
            }
          } else if (late <= AGENT_CATCHUP_MS) {
            void runAgentOccurrence(s, due.toISOString(), { source: 'web', late: late > LATE_MS });
          } else {
            deliver(
              {
                key,
                scheduleId: s.id,
                kind: 'agent',
                title: s.title,
                body: 'This AI job was due while the app was closed. Open it to run it now.',
                at: due.toISOString(),
                state: 'missed',
              },
              scheduleHref(s.id),
              true
            );
          }
        }
      }
      const next = nextOccurrence(s.rule, now);
      if (next) nextAt = Math.min(nextAt, next.getTime());
    }
    sleepUntil(nextAt);
  } finally {
    running = false;
    if (again) {
      again = false;
      void checkSchedules();
    }
  }
}

/** Starts the engine; returns the cleanup. */
export function startScheduleEngine(): () => void {
  const onVisible = () => {
    if (document.visibilityState === 'visible') void checkSchedules();
  };
  const onChange = () => void checkSchedules();
  const first = setTimeout(() => void checkSchedules(), 1500);
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') void checkSchedules();
  }, POLL_MS);
  window.addEventListener(SCHEDULES_CHANGED_EVENT, onChange);
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onVisible);
  // Signing in/out switches between this browser's schedules and the account's (and the phone's token).
  const offAuth = onAuthChange(onChange);
  return () => {
    offAuth();
    clearTimeout(first);
    clearInterval(poll);
    if (timer) clearTimeout(timer);
    window.removeEventListener(SCHEDULES_CHANGED_EVENT, onChange);
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
