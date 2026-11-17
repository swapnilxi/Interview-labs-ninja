/**
 * fe-apis/todo/agent/context.ts
 *
 * Port of backend/modules/ai_todo/agent/context.py: what the Assistant (and an AI job set to read "everything") knows
 * about the person's To-Do workspace. Same SQL, same limits, same key order, so both backends send byte-identical
 * prompts. Change both.
 */

import { withTodoDb, parseJson, type Row } from '../_shared';

const OPEN_TASKS_MAX = 60;
const DONE_RECENT_MAX = 25;
const DONE_RECENT_DAYS = 14;
const QUICK_MAX = 30;
const PROJECTS_MAX = 20;
const GOALS_MAX = 30;
const SCHEDULES_MAX = 40;
const SCHEDULE_TEXT_MAX = 240;

/** `days_before`: "YYYY-MM-DD" `days` before `today` (also "YYYY-MM-DD"). */
export function daysBefore(today: string, days: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

const count = (row: Row | undefined): number => Number(row?.n ?? 0);

/** Port of `workspace_context` (key order is part of the prompt, keep it). */
export function workspaceContext(userId: number, today: string): Row {
  return withTodoDb((db) => {
    const openWhere = "user_id = ? AND status NOT IN ('done', 'not_done')";
    const openCount = count(db.get(`SELECT COUNT(*) AS n FROM tasks WHERE ${openWhere}`, userId));
    const overdue = count(
      db.get(
        `SELECT COUNT(*) AS n FROM tasks WHERE ${openWhere} AND due_date IS NOT NULL AND due_date < ?`,
        userId,
        today
      )
    );
    const dueToday = count(
      db.get(`SELECT COUNT(*) AS n FROM tasks WHERE ${openWhere} AND due_date = ?`, userId, today)
    );
    const done7 = count(
      db.get(
        'SELECT COALESCE(SUM(completed_count), 0) AS n FROM user_stats WHERE user_id = ? AND date >= ?',
        userId,
        daysBefore(today, 6)
      )
    );

    const openTasks = db
      .all(
        `SELECT id, title, priority, due_date, status, parent_id FROM tasks
          WHERE ${openWhere}
          ORDER BY due_date IS NULL, due_date, priority, id
          LIMIT ?`,
        userId,
        OPEN_TASKS_MAX
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        due_date: r.due_date,
        status: r.status,
        parent_id: r.parent_id,
      }));

    const recentlyDone = db
      .all(
        `SELECT id, title, substr(updated_at, 1, 10) AS done_on FROM tasks
          WHERE user_id = ? AND status = 'done' AND updated_at >= ?
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`,
        userId,
        daysBefore(today, DONE_RECENT_DAYS),
        DONE_RECENT_MAX
      )
      .map((r) => ({ id: r.id, title: r.title, done_on: r.done_on }));

    const quick = db
      .all(
        `SELECT id, title, done, quadrant FROM quick_tasks
          WHERE user_id = ? AND date = ?
          ORDER BY order_index, id
          LIMIT ?`,
        userId,
        today,
        QUICK_MAX
      )
      .map((r) => ({ id: r.id, title: r.title, done: !!r.done, quadrant: r.quadrant }));

    const projects = db
      .all(
        `SELECT p.id, p.title, p.status, p.priority, p.due_date,
                (SELECT COUNT(*) FROM project_nodes n WHERE n.project_id = p.id) AS items
           FROM projects p
          WHERE p.user_id = ?
          ORDER BY CASE WHEN p.status = 'active' THEN 0 ELSE 1 END, p.id DESC
          LIMIT ?`,
        userId,
        PROJECTS_MAX
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        due_date: r.due_date,
        items: Number(r.items),
      }));

    const goals = db
      .all(
        `SELECT id, title, level, status, due_date FROM goal_nodes
          WHERE user_id = ? AND depth_level <= 1
          ORDER BY depth_level, order_index, id
          LIMIT ?`,
        userId,
        GOALS_MAX
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        level: r.level,
        status: r.status,
        due_date: r.due_date,
      }));

    return {
      today,
      counts: {
        open_tasks: openCount,
        overdue,
        due_today: dueToday,
        completed_last_7_days: done7,
      },
      open_tasks: openTasks,
      recently_done: recentlyDone,
      quick_list_today: quick,
      projects,
      goals,
    };
  });
}

/** Port of `schedules_context`: the schedules as the Assistant sees them (it can pause, resume, delete or run them). */
export function schedulesContext(userId: number): Row[] {
  return withTodoDb((db) =>
    db
      .all(
        `SELECT id, title, kind, enabled, rule, message, agent_context, use_web, write_report, last_run_at,
                last_status
           FROM todo_schedules
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT ?`,
        userId,
        SCHEDULES_MAX
      )
      .map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        enabled: !!r.enabled,
        rule: parseJson<Row>(r.rule, {}),
        message: (r.message || '').slice(0, SCHEDULE_TEXT_MAX),
        reads: r.kind === 'agent' ? r.agent_context : null,
        web: !!r.use_web,
        report: !!r.write_report,
        last_run_at: r.last_run_at,
        last_status: r.last_status,
      }))
  );
}
