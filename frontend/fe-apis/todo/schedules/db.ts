/**
 * fe-apis/todo/schedules/db.ts
 *
 * TypeScript port of backend/modules/ai_todo/schedules/db.py -- keep the two in sync (same SQL, same dict shapes).
 * Tables: todo_schedules (one row per scheduled reminder / AI job) and todo_schedule_runs (one row per occurrence that
 * ran; UNIQUE(schedule_id, scheduled_for) is what stops a phone and an open tab running the same occurrence twice).
 */

import { withTodoDb, parseJson, type Row } from '../_shared';
import { pyJsonDumps } from '../py';

const SCHEDULE_COLUMNS =
  'id, user_id, title, kind, message, rule, timezone, agent_context, add_tasks, enabled, source_text, ' +
  'last_run_at, last_status, last_output, created_at, updated_at';

const RUN_COLUMNS =
  'id, schedule_id, user_id, scheduled_for, source, status, title, output, created_task_ids, started_at, finished_at';

/** Columns `updateSchedule` may write (the PATCH fields). */
const UPDATABLE = new Set([
  'title',
  'kind',
  'message',
  'rule',
  'timezone',
  'agent_context',
  'add_tasks',
  'enabled',
  'source_text',
]);

/** Port of `_schedule_row_to_dict`. */
function scheduleRowToDict(row: Row): Row {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    kind: row.kind,
    message: row.message,
    rule: parseJson<Row>(row.rule, {}),
    timezone: row.timezone,
    agent_context: row.agent_context,
    add_tasks: !!row.add_tasks,
    enabled: !!row.enabled,
    source_text: row.source_text,
    last_run_at: row.last_run_at,
    last_status: row.last_status,
    last_output: row.last_output,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Port of `_run_row_to_dict`. */
function runRowToDict(row: Row): Row {
  return {
    id: row.id,
    schedule_id: row.schedule_id,
    user_id: row.user_id,
    scheduled_for: row.scheduled_for,
    source: row.source,
    status: row.status,
    title: row.title,
    output: row.output,
    created_task_ids: parseJson<number[]>(row.created_task_ids, []),
    started_at: row.started_at,
    finished_at: row.finished_at,
  };
}

/** Port of `create_schedule`. `rule` is already canonical (normalizeRule). */
export function createSchedule(
  userId: number,
  title: string,
  rule: Row,
  opts: {
    kind?: string;
    message?: string | null;
    timezone?: string | null;
    agent_context?: string;
    add_tasks?: boolean;
    enabled?: boolean;
    source_text?: string | null;
  } = {}
): Row {
  const {
    kind = 'reminder',
    message = null,
    timezone = null,
    agent_context = 'tasks',
    add_tasks = false,
    enabled = true,
    source_text = null,
  } = opts;
  return withTodoDb((db) => {
    const res = db.run(
      `INSERT INTO todo_schedules
         (user_id, title, kind, message, rule, timezone, agent_context, add_tasks, enabled, source_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      title,
      kind,
      message,
      pyJsonDumps(rule),
      timezone,
      agent_context,
      add_tasks ? 1 : 0,
      enabled ? 1 : 0,
      source_text
    );
    return scheduleRowToDict(
      db.get(`SELECT ${SCHEDULE_COLUMNS} FROM todo_schedules WHERE id = ?`, res.lastInsertRowid)!
    );
  });
}

/** Port of `list_schedules` (newest first). */
export function listSchedules(userId: number): Row[] {
  return withTodoDb((db) =>
    db
      .all(
        `SELECT ${SCHEDULE_COLUMNS} FROM todo_schedules WHERE user_id = ? ORDER BY id DESC`,
        userId
      )
      .map(scheduleRowToDict)
  );
}

/** Port of `get_schedule`. */
export function getSchedule(scheduleId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(
      `SELECT ${SCHEDULE_COLUMNS} FROM todo_schedules WHERE id = ? AND user_id = ?`,
      scheduleId,
      userId
    );
    return row ? scheduleRowToDict(row) : null;
  });
}

/** Port of `update_schedule`: writes the known fields given, bumps updated_at. Null when not the user's. */
export function updateSchedule(scheduleId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!UPDATABLE.has(key)) continue;
      let v: unknown = value;
      if (key === 'rule') v = pyJsonDumps(value);
      else if (key === 'add_tasks' || key === 'enabled') v = value ? 1 : 0;
      sets.push(`${key} = ?`);
      values.push(v);
    }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(
        `UPDATE todo_schedules SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
        ...values,
        scheduleId,
        userId
      );
    }
    const row = db.get(
      `SELECT ${SCHEDULE_COLUMNS} FROM todo_schedules WHERE id = ? AND user_id = ?`,
      scheduleId,
      userId
    );
    return row ? scheduleRowToDict(row) : null;
  });
}

/** Port of `delete_schedule` (its runs go too). */
export function deleteSchedule(scheduleId: number, userId: number): boolean {
  return withTodoDb((db) => {
    const res = db.run(
      'DELETE FROM todo_schedules WHERE id = ? AND user_id = ?',
      scheduleId,
      userId
    );
    if (!res.changes) return false;
    db.run(
      'DELETE FROM todo_schedule_runs WHERE schedule_id = ? AND user_id = ?',
      scheduleId,
      userId
    );
    return true;
  });
}

/**
 * Port of `claim_run`: takes the occurrence for this caller. Returns `[run, true]` when the caller should do the work
 * (a new row, or a retry of one that failed or has been "running" for over 3 minutes), `[run, false]` when another
 * device already did it or is doing it right now.
 */
export function claimRun(
  scheduleId: number,
  userId: number,
  scheduledFor: string,
  source: string
): [Row, boolean] {
  return withTodoDb((db) => {
    const res = db.run(
      `INSERT OR IGNORE INTO todo_schedule_runs (schedule_id, user_id, scheduled_for, source)
       VALUES (?, ?, ?, ?)`,
      scheduleId,
      userId,
      scheduledFor,
      source
    );
    let claimed = res.changes > 0;
    if (!claimed) {
      const retry = db.run(
        `UPDATE todo_schedule_runs
            SET status = 'running', source = ?, started_at = datetime('now'), finished_at = NULL
          WHERE schedule_id = ? AND scheduled_for = ?
            AND (status = 'error' OR (status = 'running' AND started_at < datetime('now', '-3 minutes')))`,
        source,
        scheduleId,
        scheduledFor
      );
      claimed = retry.changes > 0;
    }
    const row = db.get(
      `SELECT ${RUN_COLUMNS} FROM todo_schedule_runs WHERE schedule_id = ? AND scheduled_for = ?`,
      scheduleId,
      scheduledFor
    )!;
    return [runRowToDict(row), claimed];
  });
}

/**
 * Port of `finish_run`: stores the result and copies it onto the schedule (last_*). A one-time schedule that ran
 * successfully switches itself off (`disable_once`; false for a manual "Run now").
 */
export function finishRun(
  runId: number,
  scheduleId: number,
  status: string,
  title: string | null,
  output: string | null,
  opts: { created_task_ids?: number[] | null; disable_once?: boolean } = {}
): Row {
  const createdTaskIds = opts.created_task_ids || [];
  const disableOnce = opts.disable_once ?? true;
  return withTodoDb((db) => {
    db.run(
      `UPDATE todo_schedule_runs
          SET status = ?, title = ?, output = ?, created_task_ids = ?, finished_at = datetime('now')
        WHERE id = ?`,
      status,
      title,
      output,
      createdTaskIds.length ? pyJsonDumps(createdTaskIds) : null,
      runId
    );
    db.run(
      `UPDATE todo_schedules
          SET last_run_at = datetime('now'), last_status = ?, last_output = ?
        WHERE id = ?`,
      status,
      output,
      scheduleId
    );
    if (status === 'ok' && disableOnce) {
      db.run(
        `UPDATE todo_schedules SET enabled = 0
          WHERE id = ? AND json_extract(rule, '$.repeat') = 'once'`,
        scheduleId
      );
    }
    return runRowToDict(
      db.get(`SELECT ${RUN_COLUMNS} FROM todo_schedule_runs WHERE id = ?`, runId)!
    );
  });
}

/** Port of `list_runs` (newest first). */
export function listRuns(scheduleId: number, userId: number, limit = 20): Row[] {
  return withTodoDb((db) =>
    db
      .all(
        `SELECT ${RUN_COLUMNS} FROM todo_schedule_runs
          WHERE schedule_id = ? AND user_id = ?
          ORDER BY id DESC LIMIT ?`,
        scheduleId,
        userId,
        limit
      )
      .map(runRowToDict)
  );
}
