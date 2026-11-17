'use client';

/**
 * To-Do Scheduler API client — mirrors /todo/schedules* (backend/modules/ai_todo/schedules, fe-apis/todo/schedules).
 *
 * Two kinds of schedule: a `reminder` (tell me something at a time) and an `agent` job (at that time the AI follows
 * the instructions, can read the to-do list, and its answer becomes the notification). Guests keep reminders in this
 * browser (IndexedDB); AI jobs and the natural-language parse need an account, like every AI feature.
 *
 * Every change dispatches SCHEDULES_CHANGED_EVENT so the scheduler engine and the Android alarms re-sync at once.
 */

import { defaultAIRequestFields } from './settingsService';
import { parseApiError } from '../http/apiClient';
import { isLoggedIn } from '../auth/tokenStore';
import { todoApiError, todoFetch } from './todoService';
import { localScheduleAdapter } from './local/localScheduleAdapter';
import { toLocalStamp, type ScheduleRule } from '../schedules/scheduleRules';
import type { Task } from './todoService';

export type ScheduleKind = 'reminder' | 'agent';
/** What an AI job reads: its open tasks, the whole To-Do workspace (projects, goals, finished work), or nothing. */
export type AgentContext = 'tasks' | 'workspace' | 'none';
export type RunSource = 'web' | 'app' | 'manual';

export interface Schedule {
  id: number;
  user_id?: number;
  title: string;
  kind: ScheduleKind;
  /** Reminder: the text to show. Agent: the instructions the AI follows each run. */
  message: string | null;
  rule: ScheduleRule;
  timezone: string | null;
  agent_context: AgentContext;
  add_tasks: boolean;
  /** AI job: may search the web once per run (news, prices, weather…). */
  use_web?: boolean;
  /** AI job: also writes a full report the app shows; the notification stays short. */
  write_report?: boolean;
  enabled: boolean;
  source_text: string | null;
  last_run_at: string | null;
  last_status: 'ok' | 'error' | 'running' | null;
  last_output: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRun {
  id: number;
  schedule_id: number;
  scheduled_for: string;
  source: string;
  status: 'ok' | 'error' | 'running';
  title: string | null;
  output: string | null;
  created_task_ids: number[];
  started_at: string;
  finished_at: string | null;
  /** The full report (write_report jobs); `output` is the short notification text. */
  report?: string | null;
  /** The web pages a use_web run read. */
  sources?: { title: string; url: string }[];
}

/** A run in the Assistant's feed (GET /todo/schedules/activity). */
export interface ActivityRun extends ScheduleRun {
  schedule_title: string;
}

export interface ScheduleCreatePayload {
  title: string;
  kind: ScheduleKind;
  message?: string | null;
  rule: ScheduleRule;
  timezone?: string | null;
  agent_context?: AgentContext;
  add_tasks?: boolean;
  use_web?: boolean;
  write_report?: boolean;
  enabled?: boolean;
  source_text?: string | null;
}

export type ScheduleUpdatePayload = Partial<ScheduleCreatePayload>;

/** What the AI made of a sentence; shown for confirmation, saved with `create`. */
export interface ScheduleDraft {
  title: string;
  kind: ScheduleKind;
  message: string | null;
  agent_context: AgentContext;
  add_tasks: boolean;
  rule: ScheduleRule;
  source_text: string;
}

export interface RunResult {
  run: ScheduleRun;
  /** Another device or tab already ran (or is running) this occurrence; `run` is that one. */
  duplicate: boolean;
  /** Agent jobs: the tasks it added (add_tasks) or suggested. */
  tasks: Partial<Task>[];
}

export const SCHEDULES_CHANGED_EVENT = 'todo:schedules-changed';

function emitChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SCHEDULES_CHANGED_EVENT));
}

function localTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** A server timestamp ("YYYY-MM-DD HH:MM:SS" UTC, or ISO) → epoch ms. */
export function parseServerTime(value: string | null | undefined): number {
  if (!value) return NaN;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return Date.parse(iso);
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await todoApiError(res));
  return (await res.json()) as T;
}

export const scheduleService = {
  async list(): Promise<Schedule[]> {
    if (!isLoggedIn()) return localScheduleAdapter.list();
    return jsonOrThrow<Schedule[]>(await todoFetch('/todo/schedules'));
  },

  async create(payload: ScheduleCreatePayload): Promise<Schedule> {
    const body = { timezone: localTimezone(), ...payload };
    let saved: Schedule;
    if (!isLoggedIn()) {
      if (payload.kind === 'agent')
        throw new Error('Sign in to schedule AI jobs. Reminders work without an account.');
      saved = await localScheduleAdapter.create(body);
    } else {
      saved = await jsonOrThrow<Schedule>(
        await todoFetch('/todo/schedules', { method: 'POST', body: JSON.stringify(body) })
      );
    }
    emitChanged();
    return saved;
  },

  async update(id: number, patch: ScheduleUpdatePayload): Promise<Schedule> {
    let saved: Schedule | null;
    if (!isLoggedIn()) {
      if (patch.kind === 'agent')
        throw new Error('Sign in to schedule AI jobs. Reminders work without an account.');
      saved = await localScheduleAdapter.update(id, patch);
      if (!saved) throw new Error('Schedule not found');
    } else {
      saved = await jsonOrThrow<Schedule>(
        await todoFetch(`/todo/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      );
    }
    emitChanged();
    return saved;
  },

  async remove(id: number): Promise<void> {
    if (!isLoggedIn()) {
      await localScheduleAdapter.remove(id);
    } else {
      await jsonOrThrow(await todoFetch(`/todo/schedules/${id}`, { method: 'DELETE' }));
    }
    emitChanged();
  },

  /** The latest AI-job runs across all schedules, newest first (the Assistant shows them in its conversation). */
  async activity(): Promise<ActivityRun[]> {
    if (!isLoggedIn()) return [];
    return jsonOrThrow<ActivityRun[]>(await todoFetch('/todo/schedules/activity'));
  },

  async runs(id: number): Promise<ScheduleRun[]> {
    if (!isLoggedIn()) return localScheduleAdapter.runs(id);
    return jsonOrThrow<ScheduleRun[]>(await todoFetch(`/todo/schedules/${id}/runs`));
  },

  /** AI: "every weekday at 9, plan my day" → a draft to confirm. Login required. */
  async parse(text: string): Promise<ScheduleDraft> {
    if (!isLoggedIn())
      throw new Error(
        'Sign in to describe a schedule in your own words, or use the options below.'
      );
    const res = await todoFetch('/todo/schedules/parse', {
      method: 'POST',
      body: JSON.stringify({ text, now: toLocalStamp(new Date()), ...defaultAIRequestFields() }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return data.schedule as ScheduleDraft;
  },

  /**
   * Runs one occurrence. The server keeps one run per (schedule, scheduledFor), so calling this from several tabs and
   * the phone at once runs the AI only once; the others get `duplicate: true` and the same run.
   */
  async run(id: number, scheduledFor: string, source: RunSource): Promise<RunResult> {
    let result: RunResult | null;
    if (!isLoggedIn()) {
      result = await localScheduleAdapter.run(id, scheduledFor, source);
      if (!result) throw new Error('Schedule not found');
    } else {
      const res = await todoFetch(`/todo/schedules/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({
          scheduled_for: scheduledFor,
          source,
          now: toLocalStamp(new Date()),
          ...defaultAIRequestFields(),
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      result = (await res.json()) as RunResult;
    }
    emitChanged();
    return result;
  },
};
