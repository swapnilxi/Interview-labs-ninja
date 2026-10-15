/**
 * fe-apis/dsaLab/weekPlan.ts
 *
 * Port of backend/modules/dsa_lab/week_plan.py + the /dsa/week-plan routes of dsa_lab/router.py:
 * a user's week-by-week DSA study plan, stored as one JSON row. Keep limits and messages in sync.
 */

import { HttpError, parseJson, withTodoDb, type Row, type TodoDb } from '../todo/_shared';
import type { TodoRoute } from '../todo/router';

const WEEK_CAP = 7; // most questions a single week may hold
const MAX_WEEKS = 12;

let schemaReady = false;

function withDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    if (!schemaReady) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS dsa_week_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER DEFAULT NULL,
          plan_json TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_dsa_week_plans_user_id ON dsa_week_plans(user_id);
      `);
      schemaReady = true;
    }
    return fn(db);
  });
}

interface WeekPlan {
  weeks: number;
  assignments: Record<string, number>;
  updatedAt: string;
}

function rowToPlan(row: Row): WeekPlan {
  const plan = parseJson<{ weeks: number; assignments: Record<string, number> }>(row.plan_json, {
    weeks: 0,
    assignments: {},
  });
  return { weeks: plan.weeks, assignments: plan.assignments, updatedAt: row.updated_at };
}

/** A human-readable problem with the plan, or null when it is fine. */
function validatePlan(weeks: number, assignments: Record<string, number>): string | null {
  const counts = new Map<number, number>();
  for (const [topicId, week] of Object.entries(assignments)) {
    if (!topicId || topicId.length > 200) return 'Every question id must be 1-200 characters.';
    if (week < 1 || week > weeks)
      return `'${topicId}' is in week ${week}, but the plan has weeks 1-${weeks}.`;
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  for (const week of [...counts.keys()].sort((a, b) => a - b)) {
    const n = counts.get(week)!;
    if (n > WEEK_CAP) return `Week ${week} has ${n} questions; a week holds at most ${WEEK_CAP}.`;
  }
  return null;
}

export const routes: TodoRoute[] = [
  {
    method: 'GET',
    path: '/week-plan',
    handler: ({ userId }) =>
      withDb((db) => {
        const row = db.get(
          'SELECT plan_json, updated_at FROM dsa_week_plans WHERE user_id = ?',
          userId
        );
        return { plan: row ? rowToPlan(row) : null };
      }),
  },
  {
    method: 'PUT',
    path: '/week-plan',
    handler: async ({ userId, json }) => {
      const body = await json();
      const weeks = body.weeks;
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) {
        throw new HttpError(422, `Field 'weeks' must be an integer from 1 to ${MAX_WEEKS}`);
      }
      const raw = body.assignments ?? {};
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpError(422, "Field 'assignments' must be an object");
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length > 500)
        throw new HttpError(422, "Field 'assignments' has too many entries (max 500)");
      if (!entries.every(([, w]) => Number.isInteger(w)))
        throw new HttpError(422, 'Every week must be an integer');
      const assignments = Object.fromEntries(entries) as Record<string, number>;

      const problem = validatePlan(weeks, assignments);
      if (problem) throw new HttpError(422, problem);

      return withDb((db) => {
        db.run(
          `INSERT INTO dsa_week_plans (user_id, plan_json) VALUES (?, ?)
           ON CONFLICT(user_id) DO UPDATE SET plan_json = excluded.plan_json, updated_at = datetime('now')`,
          userId,
          JSON.stringify({ weeks, assignments })
        );
        const row = db.get(
          'SELECT plan_json, updated_at FROM dsa_week_plans WHERE user_id = ?',
          userId
        )!;
        return { plan: rowToPlan(row) };
      });
    },
  },
  {
    method: 'DELETE',
    path: '/week-plan',
    handler: ({ userId }) =>
      withDb((db) => {
        db.run('DELETE FROM dsa_week_plans WHERE user_id = ?', userId);
        return { plan: null };
      }),
  },
];
