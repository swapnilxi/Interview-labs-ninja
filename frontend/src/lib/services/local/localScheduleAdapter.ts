'use client';

/**
 * Guest-mode (IndexedDB) side of scheduleService: the manual CRUD and the run history of reminder schedules.
 * AI jobs and the natural-language parse are login-only, like every AI feature, so they never land here.
 */

import { getAll, getAllByIndex, get, nextId, put, remove, removeMany } from './db';
import type {
  Schedule,
  ScheduleCreatePayload,
  ScheduleRun,
  ScheduleUpdatePayload,
  RunResult,
} from '../scheduleService';

/** The server's datetime('now') format ("YYYY-MM-DD HH:MM:SS", UTC), so both sources parse the same way. */
function sqlNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const localScheduleAdapter = {
  async list(): Promise<Schedule[]> {
    const rows = await getAll<Schedule>('schedules');
    return rows.sort((a, b) => b.id - a.id);
  },

  async create(payload: ScheduleCreatePayload): Promise<Schedule> {
    const now = sqlNow();
    const schedule: Schedule = {
      id: await nextId(),
      title: payload.title.trim().slice(0, 120),
      kind: 'reminder',
      message: payload.message?.trim() || null,
      rule: payload.rule,
      timezone: payload.timezone ?? null,
      agent_context: payload.agent_context ?? 'tasks',
      add_tasks: false,
      enabled: payload.enabled ?? true,
      source_text: payload.source_text ?? null,
      last_run_at: null,
      last_status: null,
      last_output: null,
      created_at: now,
      updated_at: now,
    };
    return put('schedules', schedule);
  },

  async update(id: number, patch: ScheduleUpdatePayload): Promise<Schedule | null> {
    const current = await get<Schedule>('schedules', id);
    if (!current) return null;
    const next: Schedule = {
      ...current,
      ...patch,
      kind: 'reminder',
      updated_at: sqlNow(),
    } as Schedule;
    if (patch.title !== undefined) next.title = patch.title.trim().slice(0, 120) || current.title;
    if (patch.message !== undefined) next.message = patch.message?.trim() || null;
    return put('schedules', next);
  },

  async remove(id: number): Promise<boolean> {
    const current = await get<Schedule>('schedules', id);
    if (!current) return false;
    await remove('schedules', id);
    const runs = await getAllByIndex<ScheduleRun>('schedule_runs', 'schedule_id', id);
    await removeMany(
      'schedule_runs',
      runs.map((r) => r.id)
    );
    return true;
  },

  async runs(id: number): Promise<ScheduleRun[]> {
    const runs = await getAllByIndex<ScheduleRun>('schedule_runs', 'schedule_id', id);
    return runs.sort((a, b) => b.id - a.id).slice(0, 20);
  },

  /** Records a reminder occurrence (once per occurrence, like the server's UNIQUE claim). */
  async run(id: number, scheduledFor: string, source: string): Promise<RunResult | null> {
    const schedule = await get<Schedule>('schedules', id);
    if (!schedule) return null;
    const existing = (await getAllByIndex<ScheduleRun>('schedule_runs', 'schedule_id', id)).find(
      (r) => r.scheduled_for === scheduledFor
    );
    if (existing) return { run: existing, duplicate: true, tasks: [] };
    const now = sqlNow();
    const run: ScheduleRun = {
      id: await nextId(),
      schedule_id: id,
      scheduled_for: scheduledFor,
      source,
      status: 'ok',
      title: schedule.title,
      output: schedule.message,
      created_task_ids: [],
      started_at: now,
      finished_at: now,
    };
    await put('schedule_runs', run);
    const done = schedule.rule.repeat === 'once' && source !== 'manual';
    await put('schedules', {
      ...schedule,
      last_run_at: now,
      last_status: 'ok',
      last_output: schedule.message,
      enabled: done ? false : schedule.enabled,
    });
    return { run, duplicate: false, tasks: [] };
  },
};
