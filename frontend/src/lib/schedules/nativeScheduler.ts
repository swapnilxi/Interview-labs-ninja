/**
 * Android app: hands upcoming Scheduler occurrences to the native `LabNinjaScheduler` plugin
 * (app/android/.../SchedulerPlugin.java), which sets one exact OS alarm per occurrence. With the app closed, a reminder
 * becomes a notification and an AI job calls POST /todo/schedules/{id}/run itself (with the login token and AI
 * settings handed over here) and shows the AI's answer as the notification.
 *
 * The phone only knows the occurrences we give it, so every sync covers the next HORIZON_DAYS; the web side re-syncs
 * on every app start, schedule change and engine wake-up. In a browser, or an older APK without the plugin, every
 * function here is a no-op.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { getToken, isLoggedIn } from '@/lib/auth/tokenStore';
import { resolveApiBaseUrl } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import type { Schedule } from '@/lib/services/scheduleService';
import { nextOccurrences } from './scheduleRules';

interface NativeJob {
  key: string;
  scheduleId: number;
  kind: 'reminder' | 'agent';
  at: number;
  scheduledFor: string;
  title: string;
  body: string;
  href: string;
}

interface SchedulerPlugin {
  sync(options: {
    origin: string;
    apiBase: string;
    token: string | null;
    ai: Record<string, string>;
    jobs: NativeJob[];
  }): Promise<{ scheduled: number; exact: boolean }>;
  status(): Promise<{ exact: boolean; notifications: boolean; pending: number }>;
  clear(): Promise<void>;
}

const NativeScheduler = registerPlugin<SchedulerPlugin>('LabNinjaScheduler');

const HORIZON_DAYS = 21;
const PER_SCHEDULE = 60;
/** Android allows ~500 alarms per app; task reminders use up to 100 of them. */
const MAX_JOBS = 300;

export function nativeSchedulerAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      Capacitor.isNativePlatform() &&
      Capacitor.isPluginAvailable('LabNinjaScheduler')
    );
  } catch {
    return false;
  }
}

export function scheduleHref(scheduleId: number): string {
  return `/ai-todo?tab=schedule&schedule=${scheduleId}`;
}

function buildJobs(schedules: Schedule[]): NativeJob[] {
  const now = new Date();
  const until = now.getTime() + HORIZON_DAYS * 86_400_000;
  const loggedIn = isLoggedIn();
  const jobs: NativeJob[] = [];
  for (const s of schedules) {
    if (!s.enabled) continue;
    if (s.kind === 'agent' && !loggedIn) continue;
    for (const at of nextOccurrences(s.rule, now, PER_SCHEDULE)) {
      if (at.getTime() > until) break;
      const scheduledFor = at.toISOString();
      jobs.push({
        key: `${s.id}@${scheduledFor}`,
        scheduleId: s.id,
        kind: s.kind,
        at: at.getTime(),
        scheduledFor,
        title: s.title,
        body:
          s.kind === 'agent' ? 'Running your scheduled AI job…' : s.message || 'Scheduled reminder',
        href: scheduleHref(s.id),
      });
    }
  }
  return jobs.sort((a, b) => a.at - b.at).slice(0, MAX_JOBS);
}

let chain: Promise<unknown> = Promise.resolve();
let lastSignature = '';

/** Makes the phone's scheduler alarms match `schedules`. Serialized, never throws. */
export function syncNativeSchedules(schedules: Schedule[]): Promise<void> {
  if (!nativeSchedulerAvailable()) return Promise.resolve();
  const run = chain
    .then(async () => {
      const ai = Object.fromEntries(
        Object.entries(defaultAIRequestFields()).filter(([, v]) => typeof v === 'string' && v)
      );
      const options = {
        origin: window.location.origin,
        apiBase: resolveApiBaseUrl() || window.location.origin,
        token: getToken(),
        ai,
        jobs: buildJobs(schedules),
      };
      const signature = JSON.stringify(options);
      if (signature === lastSignature) return;
      await NativeScheduler.sync(options);
      lastSignature = signature;
    })
    .catch((err) => console.warn('Native scheduler sync failed:', err));
  chain = run;
  return run as Promise<void>;
}

export async function nativeSchedulerStatus(): Promise<{
  exact: boolean;
  notifications: boolean;
  pending: number;
} | null> {
  if (!nativeSchedulerAvailable()) return null;
  try {
    return await NativeScheduler.status();
  } catch {
    return null;
  }
}
