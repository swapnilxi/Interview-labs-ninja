/**
 * fe-apis/todo/tasks/db.ts
 *
 * TypeScript port of backend/modules/ai_todo/tasks/db.py -- keep the two in sync.
 * Signatures follow the contract in fe-apis/todo/README.md (generated from the Python
 * function signatures, so handlers and other modules can rely on them).
 */

import { withTodoDb, parseJson, todayIso, type Row } from '../_shared';
import { pyJsonDumps } from '../py';

/** `datetime.utcnow().isoformat()` — this module stamps rows in UTC (unlike `nowIso()`). */
function utcNowIso(): string {
  return new Date().toISOString().replace('Z', '000');
}

/** Port of `_task_row_to_dict`. */
function taskRowToDict(row: Row): Row {
  return {
    id: row.id,
    parent_id: row.parent_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    time_estimate: row.time_estimate,
    due_date: row.due_date,
    generation_type: row.generation_type,
    depth_level: row.depth_level,
    context: row.context,
    attachments: parseJson<any[]>(row.attachments, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_activity_at: row.last_activity_at,
    is_recurring: !!row.is_recurring,
    recurrence_interval: row.recurrence_interval,
    recurrence_custom_days: row.recurrence_custom_days,
    recurrence_template_id: row.recurrence_template_id,
    intention: row.intention,
    definition_of_done: row.definition_of_done,
    eisenhower_quadrant: row.eisenhower_quadrant ?? null,
    pareto_score: row.pareto_score ?? null,
    is_top_20: !!row.is_top_20,
    pareto_reason: row.pareto_reason ?? null,
    pareto_locked: !!row.pareto_locked,
  };
}

const TASK_COLUMNS =
  'id, parent_id, title, status, priority, time_estimate, due_date, ' +
  'generation_type, depth_level, context, attachments, created_at, updated_at, ' +
  'last_activity_at, is_recurring, recurrence_interval, recurrence_custom_days, ' +
  'recurrence_template_id, intention, definition_of_done, eisenhower_quadrant, ' +
  'pareto_score, is_top_20, pareto_reason, pareto_locked';

/** Assemble flat task dicts into a forest (adds `children` to each, in place). */
function buildTree(tasks: Row[]): Row[] {
  const byId = new Map<number, Row>();
  for (const task of tasks) {
    task.children = [];
    byId.set(task.id, task);
  }
  const roots: Row[] = [];
  for (const task of tasks) {
    const pid = task.parent_id;
    if (pid !== null && pid !== undefined && byId.has(pid)) byId.get(pid)!.children.push(task);
    else roots.push(task);
  }
  return roots;
}

/** Port of `create_task`. */
export function createTask(userId: number, title: string, opts: { parent_id?: number | null; status?: string; priority?: string; time_estimate?: string | null; due_date?: string | null; generation_type?: string; context?: string | null; attachments?: string[] | null; is_recurring?: number; recurrence_interval?: string | null; recurrence_custom_days?: string | null; recurrence_template_id?: number | null; intention?: string | null; definition_of_done?: string | null } = {}): Row {
  const {
    status = 'backlog',
    priority = 'p3',
    time_estimate = null,
    due_date = null,
    generation_type = 'manual',
    context = null,
    attachments = null,
    is_recurring = 0,
    recurrence_interval = null,
    recurrence_custom_days = null,
    recurrence_template_id = null,
    intention = null,
    definition_of_done = null,
  } = opts;
  let parentId = opts.parent_id ?? null;
  return withTodoDb((db) => {
    // Calculate depth_level from parent (only if the parent belongs to this user)
    let depthLevel = 1;
    if (parentId !== null) {
      const parent = db.get('SELECT depth_level FROM tasks WHERE id = ? AND user_id = ?', parentId, userId);
      if (parent) depthLevel = parent.depth_level + 1;
      else parentId = null;
    }

    const attachmentsJson = attachments && attachments.length ? pyJsonDumps(attachments) : null;
    const now = utcNowIso();

    const { lastInsertRowid } = db.run(
      `
      INSERT INTO tasks (
        user_id, parent_id, title, status, priority, time_estimate, due_date,
        generation_type, depth_level, context, attachments,
        created_at, updated_at, last_activity_at, is_recurring,
        recurrence_interval, recurrence_custom_days, recurrence_template_id,
        intention, definition_of_done
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      userId, parentId, title, status, priority, time_estimate, due_date,
      generation_type, depthLevel, context, attachmentsJson,
      now, now, now, is_recurring,
      recurrence_interval, recurrence_custom_days, recurrence_template_id,
      intention, definition_of_done,
    );
    return taskRowToDict(db.get(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, lastInsertRowid)!);
  });
}

/** Port of `get_task`. */
export function getTask(taskId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ? AND user_id = ?`, taskId, userId);
    return row ? taskRowToDict(row) : null;
  });
}

/** Port of `get_children`. */
export function getChildren(parentId: number, userId: number): Row[] {
  return withTodoDb((db) =>
    db
      .all(`SELECT ${TASK_COLUMNS} FROM tasks WHERE parent_id = ? AND user_id = ? ORDER BY id ASC`, parentId, userId)
      .map(taskRowToDict),
  );
}

/** Port of `get_sibling_titles`. */
export function getSiblingTitles(parentId: number, userId: number): string[] {
  return withTodoDb((db) =>
    db
      .all<{ title: string }>('SELECT title FROM tasks WHERE parent_id = ? AND user_id = ? ORDER BY id ASC', parentId, userId)
      .map((r) => r.title),
  );
}

/** Port of `get_all_tasks`. */
export function getAllTasks(userId: number): Row[] {
  return withTodoDb((db) =>
    db.all(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY id ASC`, userId).map(taskRowToDict),
  );
}

/** Port of `get_task_tree`. */
export function getTaskTree(userId: number): Row[] {
  return buildTree(getAllTasks(userId));
}

/**
 * Port of `get_active_tasks_for_copilot`: `{active_tree, summary: {total, done_count,
 * backlog_no_date_count, active_count}}`. Backlog tasks stay in the active tree.
 */
export function getActiveTasksForCopilot(userId: number): Row {
  const allTasks = getAllTasks(userId);
  const active: Row[] = [];
  let doneCount = 0;
  let backlogCount = 0;

  for (const task of allTasks) {
    if (task.status === 'done') {
      doneCount += 1;
    } else if (task.status === 'backlog' && !task.due_date) {
      backlogCount += 1;
      active.push(task); // Still include backlog in active for context
    } else {
      active.push(task);
    }
  }

  return {
    active_tree: buildTree(active),
    summary: {
      total: allTasks.length,
      done_count: doneCount,
      backlog_no_date_count: backlogCount,
      active_count: active.length,
    },
  };
}

const TASK_UPDATE_FIELDS = new Set([
  'title', 'status', 'priority', 'time_estimate', 'due_date',
  'context', 'attachments', 'parent_id', 'is_recurring',
  'recurrence_interval', 'recurrence_custom_days',
  'recurrence_template_id', 'intention', 'definition_of_done',
  'eisenhower_quadrant', 'pareto_score', 'is_top_20',
  'pareto_reason', 'pareto_locked',
]);

/**
 * Port of `update_task`. Keys outside the allow-list, and keys whose value is `undefined`
 * (≙ absent kwargs), are ignored. A status change to 'done' bumps today's completions and
 * clones a recurring task; leaving 'done' decrements them — as in Python, that includes any
 * update without `status` on an already-done task.
 */
export function updateTask(taskId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const updates: Row = {};
    for (const [k, v] of Object.entries(fields || {})) {
      if (TASK_UPDATE_FIELDS.has(k) && v !== undefined) updates[k] = v;
    }
    if (!Object.keys(updates).length) return getTask(taskId, userId);

    // 1. Fetch current task state before update to detect status transitions
    const oldTask = getTask(taskId, userId);
    if (!oldTask) return null;

    if (Array.isArray(updates.attachments)) updates.attachments = pyJsonDumps(updates.attachments);

    const now = utcNowIso();
    updates.updated_at = now;
    updates.last_activity_at = now;

    const keys = Object.keys(updates);
    const setClause = keys.map((k) => `${k} = ?`).join(', ');

    return db.transaction(() => {
      const res = db.run(
        `UPDATE tasks SET ${setClause} WHERE id = ? AND user_id = ?`,
        ...keys.map((k) => updates[k]), taskId, userId,
      );
      if (res.changes === 0) return null;

      // 2. Recurrence check: if task status is changed to "done"
      const oldStatus = oldTask.status;
      const newStatus = updates.status;
      if (oldStatus !== 'done' && newStatus === 'done') {
        incrementTodayCompletions(userId, { delta: 1 });
        const row = db.get(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, taskId);
        const currentTask = row ? taskRowToDict(row) : null;
        if (currentTask && currentTask.is_recurring) {
          const nextDue = calculateNextDueDate(
            currentTask.due_date,
            currentTask.recurrence_interval || 'daily',
            currentTask.recurrence_custom_days,
          );
          cloneRecurringTask(taskId, userId, nextDue);
          // Turn off recurrence on the completed task
          db.run('UPDATE tasks SET is_recurring = 0 WHERE id = ?', taskId);
        }
      } else if (oldStatus === 'done' && newStatus !== undefined && newStatus !== null && newStatus !== 'done') {
        // Only an actual status change un-counts a completion (a rename carries no status).
        incrementTodayCompletions(userId, { delta: -1 });
      }

      const row = db.get(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`, taskId);
      return row ? taskRowToDict(row) : null;
    });
  });
}

/** Port of `delete_task` (children go via ON DELETE CASCADE). */
export function deleteTask(taskId: number, userId: number): boolean {
  return withTodoDb((db) => db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', taskId, userId).changes > 0);
}

/** Port of `delete_children`. */
export function deleteChildren(parentId: number, userId: number): number {
  return withTodoDb((db) => db.run('DELETE FROM tasks WHERE parent_id = ? AND user_id = ?', parentId, userId).changes);
}

/**
 * Port of `create_subtasks_batch`. The returned dicts mirror Python's hand-built shape
 * (no `eisenhower_quadrant` key, `children: []`). Returns [] if the parent isn't owned.
 */
export function createSubtasksBatch(parentId: number, userId: number, subtasks: Record<string, string>[], generationType: string): Row[] {
  return withTodoDb((db) =>
    db.transaction(() => {
      // Get parent depth, context and Pareto top-20 status (only if owned by this user)
      const parent = db.get(
        'SELECT depth_level, context, is_top_20 FROM tasks WHERE id = ? AND user_id = ?',
        parentId, userId,
      );
      if (!parent) return [];

      const parentContext = parent.context;
      // Subtasks of a Top 20% task inherit an elevated base Pareto score until re-analyzed.
      const inheritedParetoScore = parent.is_top_20 ? 0.5 : null;
      const childDepth = parent.depth_level + 1;
      const now = utcNowIso();

      const created: Row[] = [];
      for (const sub of subtasks) {
        const title = sub.title === undefined ? 'Untitled' : sub.title;
        const timeEst = sub.time_estimate ?? null;
        let priority: any = sub.priority === undefined ? 'p3' : sub.priority;
        if (!['p1', 'p2', 'p3', 'p4'].includes(priority)) priority = 'p3';

        const { lastInsertRowid } = db.run(
          `
          INSERT INTO tasks (
            user_id, parent_id, title, status, priority, time_estimate,
            generation_type, depth_level, context, created_at, updated_at,
            last_activity_at, pareto_score
          ) VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          userId, parentId, title, priority, timeEst,
          generationType, childDepth, parentContext,
          now, now, now, inheritedParetoScore,
        );
        created.push({
          id: lastInsertRowid,
          parent_id: parentId,
          title,
          status: 'backlog',
          priority,
          time_estimate: timeEst,
          due_date: null,
          generation_type: generationType,
          depth_level: childDepth,
          context: parentContext,
          attachments: [],
          created_at: now,
          updated_at: now,
          last_activity_at: now,
          is_recurring: false,
          recurrence_interval: null,
          recurrence_custom_days: null,
          recurrence_template_id: null,
          intention: null,
          definition_of_done: null,
          pareto_score: inheritedParetoScore,
          is_top_20: false,
          pareto_reason: null,
          pareto_locked: false,
          children: [],
        });
      }
      return created;
    }),
  );
}

/** Port of `create_note`. Returns null if the task doesn't exist or isn't owned by userId. */
export function createNote(taskId: number, userId: number, content: string, opts: { note_type?: string } = {}): Row | null {
  const { note_type = 'manual' } = opts;
  return withTodoDb((db) =>
    db.transaction(() => {
      if (!db.get('SELECT id FROM tasks WHERE id = ? AND user_id = ?', taskId, userId)) return null;

      const now = utcNowIso();
      const { lastInsertRowid } = db.run(
        'INSERT INTO task_notes (task_id, user_id, content, note_type, created_at) VALUES (?, ?, ?, ?, ?)',
        taskId, userId, content, note_type, now,
      );
      // Update last_activity_at on the task
      db.run('UPDATE tasks SET last_activity_at = ?, updated_at = ? WHERE id = ?', now, now, taskId);

      return { id: lastInsertRowid, task_id: taskId, content, note_type, created_at: now };
    }),
  );
}

/** Port of `get_task_notes` (newest first). */
export function getTaskNotes(taskId: number, userId: number): Row[] {
  return withTodoDb((db) =>
    db.all(
      `
      SELECT id, task_id, content, note_type, created_at
      FROM task_notes
      WHERE task_id = ? AND user_id = ?
      ORDER BY created_at DESC
      `,
      taskId, userId,
    ).map((r) => ({ id: r.id, task_id: r.task_id, content: r.content, note_type: r.note_type, created_at: r.created_at })),
  );
}

/** Port of `get_note`. */
export function getNote(noteId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const r = db.get(
      'SELECT id, task_id, content, note_type, created_at FROM task_notes WHERE id = ? AND user_id = ?',
      noteId, userId,
    );
    return r ? { id: r.id, task_id: r.task_id, content: r.content, note_type: r.note_type, created_at: r.created_at } : null;
  });
}

/** Port of `get_unprocessed_inbox_items`. */
export function getUnprocessedInboxItems(userId: number): Row[] {
  return withTodoDb((db) =>
    db.all(
      `
      SELECT id, content, created_at
      FROM inbox
      WHERE user_id = ?
      ORDER BY created_at DESC
      `,
      userId,
    ).map((r) => ({ id: r.id, content: r.content, created_at: r.created_at })),
  );
}

/** Port of `create_daily_plan` (upsert on user_id + plan_date, keeping the original created_at). */
export function createDailyPlan(userId: number, planDate: string, availableHours: number, taskIds: number[], reasoning: Record<number, string>): Row {
  return withTodoDb((db) => {
    const now = utcNowIso();
    db.run(
      `
      INSERT INTO daily_plans (user_id, plan_date, available_hours, task_ids, reasoning, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM daily_plans WHERE user_id = ? AND plan_date = ?), ?), ?)
      ON CONFLICT(user_id, plan_date) DO UPDATE SET
        available_hours = excluded.available_hours,
        task_ids = excluded.task_ids,
        reasoning = excluded.reasoning,
        updated_at = excluded.updated_at
      `,
      userId, planDate, availableHours, pyJsonDumps(taskIds), pyJsonDumps(reasoning), userId, planDate, now, now,
    );
    return { plan_date: planDate, available_hours: availableHours, task_ids: taskIds, reasoning };
  });
}

/** Port of `get_daily_plan`. */
export function getDailyPlan(userId: number, planDate: string): Row | null {
  return withTodoDb((db) => {
    const row = db.get(
      `
      SELECT id, plan_date, available_hours, task_ids, reasoning, summary
      FROM daily_plans
      WHERE user_id = ? AND plan_date = ?
      `,
      userId, planDate,
    );
    if (!row) return null;
    return {
      id: row.id,
      plan_date: row.plan_date,
      available_hours: row.available_hours,
      task_ids: parseJson<number[]>(row.task_ids, []),
      reasoning: parseJson<Record<string, string>>(row.reasoning, {}),
      summary: row.summary,
    };
  });
}

/** Port of `update_daily_plan_summary`. */
export function updateDailyPlanSummary(userId: number, planDate: string, summary: string): boolean {
  return withTodoDb((db) =>
    db.run(
      'UPDATE daily_plans SET summary = ?, updated_at = ? WHERE user_id = ? AND plan_date = ?',
      summary, utcNowIso(), userId, planDate,
    ).changes > 0,
  );
}

/** Port of `update_daily_plan_tasks`. */
export function updateDailyPlanTasks(userId: number, planDate: string, taskIds: number[]): boolean {
  return withTodoDb((db) =>
    db.run(
      'UPDATE daily_plans SET task_ids = ?, updated_at = ? WHERE user_id = ? AND plan_date = ?',
      pyJsonDumps(taskIds), utcNowIso(), userId, planDate,
    ).changes > 0,
  );
}

// ── Calendar-date helpers (UTC Date objects used as plain dates, so no DST drift) ──

const DAY_MS = 86400000;
const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** `date.fromisoformat` for YYYY-MM-DD / YYYYMMDD; null where Python would raise. */
function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (!m || (value.length !== 8 && value.length !== 10)) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Python `date.weekday()`: Monday = 0 … Sunday = 6. */
function weekday(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/** Port of `_calculate_next_due_date`. */
function calculateNextDueDate(currentDue: string | null, interval: string, customDays: string | null): string {
  let baseDate = parseIsoDate(todayIso())!;
  if (currentDue) baseDate = parseIsoDate(currentDue) ?? baseDate;

  if (interval === 'daily') return isoDate(addDays(baseDate, 1));
  if (interval === 'weekly') return isoDate(addDays(baseDate, 7));
  if (interval === 'custom_days' && customDays) {
    const dayMap: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    const targetDays: number[] = [];
    for (const d of customDays.toLowerCase().split(',')) {
      const dClean = d.trim().slice(0, 3);
      if (dClean in dayMap) targetDays.push(dayMap[dClean]);
    }
    if (!targetDays.length) return isoDate(addDays(baseDate, 1));

    // Check candidate days 1 to 7
    for (let i = 1; i < 8; i++) {
      const candidate = addDays(baseDate, i);
      if (targetDays.includes(weekday(candidate))) return isoDate(candidate);
    }
  }
  return isoDate(addDays(baseDate, 1));
}

/** Port of `clone_recurring_task`: clones the task and its whole subtree; returns the new task id. */
export function cloneRecurringTask(taskId: number, userId: number, nextDueDate: string): number {
  return withTodoDb(() => {
    const task = getTask(taskId, userId);
    if (!task) throw new Error('Task not found');

    const templateId = task.recurrence_template_id || task.id;
    const newTask = createTask(userId, task.title, {
      priority: task.priority,
      time_estimate: task.time_estimate,
      context: task.context,
      due_date: nextDueDate,
      parent_id: task.parent_id,
      is_recurring: 1,
      recurrence_interval: task.recurrence_interval,
      recurrence_custom_days: task.recurrence_custom_days,
      recurrence_template_id: templateId,
      intention: task.intention,
      definition_of_done: task.definition_of_done,
    });

    cloneTaskRecursive(task.id, newTask.id, userId);
    return newTask.id;
  });
}

/** Port of `_clone_task_recursive`. */
function cloneTaskRecursive(oldParentId: number, newParentId: number, userId: number): void {
  withTodoDb((db) => {
    const children = db
      .all(`SELECT ${TASK_COLUMNS} FROM tasks WHERE parent_id = ? AND user_id = ?`, oldParentId, userId)
      .map(taskRowToDict);
    for (const child of children) {
      const newChild = createTask(userId, child.title, {
        priority: child.priority,
        time_estimate: child.time_estimate,
        context: child.context,
        parent_id: newParentId,
        intention: child.intention,
        definition_of_done: child.definition_of_done,
      });
      cloneTaskRecursive(child.id, newChild.id, userId);
    }
  });
}

/** Port of `create_inbox_item`. */
export function createInboxItem(userId: number, content: string): Row {
  return withTodoDb((db) => {
    const now = utcNowIso();
    const { lastInsertRowid } = db.run('INSERT INTO inbox (user_id, content, created_at) VALUES (?, ?, ?)', userId, content, now);
    return { id: lastInsertRowid, content, created_at: now };
  });
}

/** Port of `delete_inbox_item`. */
export function deleteInboxItem(inboxId: number, userId: number): boolean {
  return withTodoDb((db) => db.run('DELETE FROM inbox WHERE id = ? AND user_id = ?', inboxId, userId).changes > 0);
}

/** Port of `increment_today_completions` (never below 0). */
export function incrementTodayCompletions(userId: number, opts: { delta?: number } = {}): void {
  const { delta = 1 } = opts;
  const todayStr = todayIso();
  withTodoDb((db) => {
    const row = db.get('SELECT completed_count FROM user_stats WHERE user_id = ? AND date = ?', userId, todayStr);
    if (row) {
      const newVal = Math.max(0, row.completed_count + delta);
      db.run('UPDATE user_stats SET completed_count = ? WHERE user_id = ? AND date = ?', newVal, userId, todayStr);
    } else {
      db.run(
        'INSERT INTO user_stats (user_id, date, completed_count, streak) VALUES (?, ?, ?, 0)',
        userId, todayStr, Math.max(0, delta),
      );
    }
  });
}

/** Port of `get_user_stats_summary`: `{completed_today, streak, last_7_days, last_7_dates}`. */
export function getUserStatsSummary(userId: number): Row {
  const today = parseIsoDate(todayIso())!;
  const todayStr = isoDate(today);

  return withTodoDb((db) => {
    const rows = db.all('SELECT date, completed_count FROM user_stats WHERE user_id = ? ORDER BY date DESC LIMIT 40', userId);
    const dbMap = new Map<string, any>();
    for (const r of rows) dbMap.set(r.date, r.completed_count);
    const countOn = (d: string) => (dbMap.has(d) ? dbMap.get(d) : 0);

    // Streak counts back from today, or from yesterday if nothing is done yet today.
    let streak = 0;
    if (countOn(todayStr) > 0) {
      streak = 1;
      let check = addDays(today, -1);
      while (countOn(isoDate(check)) > 0) {
        streak += 1;
        check = addDays(check, -1);
      }
    } else if (countOn(isoDate(addDays(today, -1))) > 0) {
      streak = 1;
      let check = addDays(today, -2);
      while (countOn(isoDate(check)) > 0) {
        streak += 1;
        check = addDays(check, -1);
      }
    }

    const last7Days: any[] = [];
    const last7Dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      last7Days.push(countOn(isoDate(d)));
      last7Dates.push(WEEKDAY_ABBR[d.getUTCDay()]);
    }

    return {
      completed_today: countOn(todayStr),
      streak,
      last_7_days: last7Days,
      last_7_dates: last7Dates,
    };
  });
}

/** Port of `create_handwriting_extraction`. */
export function createHandwritingExtraction(userId: number, originalFilename: string, extractedText: string, visionModelUsed: string, opts: { source?: string; task_id?: number | null; confidence_note?: string | null } = {}): Row {
  const { source = 'task_context', task_id = null, confidence_note = null } = opts;
  return withTodoDb((db) => {
    const now = utcNowIso();
    const { lastInsertRowid } = db.run(
      `
      INSERT INTO handwriting_extractions
        (user_id, task_id, original_filename, extracted_text, vision_model_used, confidence_note, extracted_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      userId, task_id, originalFilename, extractedText, visionModelUsed, confidence_note, now, source,
    );
    return {
      id: lastInsertRowid,
      task_id,
      original_filename: originalFilename,
      extracted_text: extractedText,
      vision_model_used: visionModelUsed,
      confidence_note,
      source,
      extracted_at: now,
    };
  });
}
