/**
 * fe-apis/todo/quick/db.ts
 *
 * TypeScript port of backend/modules/ai_todo/quick/db.py -- keep the two in sync.
 * Signatures follow the contract in fe-apis/todo/README.md (generated from the Python
 * function signatures, so handlers and other modules can rely on them).
 */

import { withTodoDb, todayIso, type Row } from '../_shared';
import { UNSORTED } from './autoSort';

/** Port of `_quick_task_row_to_dict`. */
function quickTaskRowToDict(row: Row): Row {
  return {
    id: row.id,
    title: row.title,
    done: !!row.done,
    quadrant: row.quadrant,
    date: row.date,
    source: row.source,
    original_task_id: row.original_task_id,
    order_index: row.order_index,
    created_at: row.created_at,
    pareto_score: row.pareto_score ?? null,
    is_top_20: !!row.is_top_20,
    exported_task_id: row.exported_task_id ?? null,
    exported_project_id: row.exported_project_id ?? null,
    is_exported: !!row.is_exported,
    due_date: row.due_date ?? null,
    time_estimate: row.time_estimate ?? null,
    context: row.context ?? null,
    pareto_reason: row.pareto_reason ?? null,
    pareto_locked: !!row.pareto_locked,
  };
}

const QT_COLUMNS =
  'id, title, done, quadrant, date, source, original_task_id, order_index, created_at, ' +
  'pareto_score, is_top_20, exported_task_id, exported_project_id, is_exported, due_date, time_estimate, context, ' +
  'pareto_reason, pareto_locked';

/** Port of `create_quick_task` (task_date defaults to today). */
export function createQuickTask(userId: number, title: string, opts: { task_date?: string | null; quadrant?: string; source?: string; original_task_id?: number | null; order_index?: number; due_date?: string | null; time_estimate?: string | null } = {}): Row {
  const {
    quadrant = UNSORTED,
    source = 'manual',
    original_task_id = null,
    order_index = 0,
    due_date = null,
    time_estimate = null,
  } = opts;
  const taskDate = opts.task_date || todayIso();
  return withTodoDb((db) => {
    const { lastInsertRowid } = db.run(
      `
      INSERT INTO quick_tasks (user_id, title, quadrant, date, source, original_task_id, order_index, due_date, time_estimate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      userId, title, quadrant, taskDate, source, original_task_id, order_index, due_date, time_estimate,
    );
    return quickTaskRowToDict(db.get(`SELECT ${QT_COLUMNS} FROM quick_tasks WHERE id = ?`, lastInsertRowid)!);
  });
}

/** Port of `get_quick_tasks_for_date`. */
export function getQuickTasksForDate(userId: number, taskDate: string): Row[] {
  return withTodoDb((db) =>
    db
      .all(
        `SELECT ${QT_COLUMNS} FROM quick_tasks WHERE user_id = ? AND date = ? ORDER BY order_index ASC, id ASC`,
        userId, taskDate,
      )
      .map(quickTaskRowToDict),
  );
}

const QUICK_UPDATE_FIELDS = new Set([
  'title', 'done', 'quadrant', 'order_index', 'pareto_score', 'is_top_20', 'due_date', 'time_estimate',
  'context', 'pareto_reason', 'pareto_locked',
]);

/**
 * Port of `update_quick_task`. Keys outside the allow-list or with an `undefined` value are
 * ignored. The re-read is scoped to userId (Python re-reads by id only, so a non-owner got
 * someone else's row back); here a non-owner gets null.
 */
export function updateQuickTask(taskId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const updates: Row = {};
    for (const [k, v] of Object.entries(fields || {})) {
      if (QUICK_UPDATE_FIELDS.has(k) && v !== undefined) updates[k] = v;
    }
    const keys = Object.keys(updates);
    if (!keys.length) return getQuickTask(taskId, userId);

    db.run(
      `UPDATE quick_tasks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => updates[k]), taskId, userId,
    );
    return getQuickTask(taskId, userId);
  });
}

/** Port of `get_quick_task`. */
export function getQuickTask(taskId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(`SELECT ${QT_COLUMNS} FROM quick_tasks WHERE id = ? AND user_id = ?`, taskId, userId);
    return row ? quickTaskRowToDict(row) : null;
  });
}

/**
 * Port of `mark_quick_task_exported`: keeps the row but sets is_exported=1 so the UI can dim it.
 * Re-read scoped to userId (see updateQuickTask).
 */
export function markQuickTaskExported(taskId: number, userId: number, opts: { exported_task_id?: number | null; exported_project_id?: number | null } = {}): Row | null {
  const { exported_task_id = null, exported_project_id = null } = opts;
  return withTodoDb((db) => {
    db.run(
      `UPDATE quick_tasks
         SET is_exported = 1,
             exported_task_id = ?,
             exported_project_id = ?
         WHERE id = ? AND user_id = ?`,
      exported_task_id, exported_project_id, taskId, userId,
    );
    return getQuickTask(taskId, userId);
  });
}

/** Port of `delete_quick_task`. */
export function deleteQuickTask(taskId: number, userId: number): boolean {
  return withTodoDb((db) => db.run('DELETE FROM quick_tasks WHERE id = ? AND user_id = ?', taskId, userId).changes > 0);
}

/** Port of `archive_completed_quick_tasks`: moves done tasks for the date into quick_tasks_archive. */
export function archiveCompletedQuickTasks(userId: number, taskDate: string): number {
  return withTodoDb((db) =>
    db.transaction(() => {
      const archived = db.run(
        `
        INSERT INTO quick_tasks_archive (user_id, original_id, title, quadrant, date, source, original_task_id, done, pareto_score, is_top_20)
        SELECT user_id, id, title, quadrant, date, source, original_task_id, done, pareto_score, is_top_20
        FROM quick_tasks WHERE user_id = ? AND date = ? AND done = 1
        `,
        userId, taskDate,
      ).changes;
      db.run('DELETE FROM quick_tasks WHERE user_id = ? AND date = ? AND done = 1', userId, taskDate);
      return archived;
    }),
  );
}

/** Port of `move_quick_tasks_to_tomorrow`. */
export function moveQuickTasksToTomorrow(userId: number, taskIds: number[]): number {
  const tomorrow = todayIso(1);
  return withTodoDb((db) => {
    const placeholders = taskIds.map(() => '?').join(',');
    return db.run(
      `UPDATE quick_tasks SET date = ? WHERE user_id = ? AND id IN (${placeholders})`,
      tomorrow, userId, ...taskIds,
    ).changes;
  });
}

/** Port of `count_incomplete_top20` (for end-of-day warnings). */
export function countIncompleteTop20(userId: number, taskDate: string): number {
  return withTodoDb((db) =>
    Number(
      db.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM quick_tasks WHERE user_id = ? AND date = ? AND done = 0 AND is_top_20 = 1',
        userId, taskDate,
      )!.n,
    ),
  );
}

/** Port of `bulk_update_quadrants`: `[{task_id, quadrant}]`, entries missing either are skipped. */
export function bulkUpdateQuadrants(userId: number, updates: Row[]): void {
  withTodoDb((db) =>
    db.transaction(() => {
      for (const u of updates) {
        const taskId = u?.task_id;
        const quadrant = u?.quadrant;
        if (taskId && quadrant) {
          db.run('UPDATE quick_tasks SET quadrant = ? WHERE id = ? AND user_id = ?', quadrant, taskId, userId);
        }
      }
    }),
  );
}
