/**
 * fe-apis/todo/projects/planDb.ts
 *
 * TypeScript port of backend/modules/ai_todo/projects/plan_db.py (a project's AI Planner workspace and
 * "add the plan to the project") -- keep the two in sync. Signatures follow the contract in fe-apis/todo/README.md.
 */

import { parseJson, withTodoDb, type Row } from '../_shared';
import { pyJsonDumps } from '../py';

const MAX_PHASES = 20;
const MAX_TASKS_PER_PHASE = 30;
const MAX_TITLE_CHARS = 200;
const MAX_CONTEXT_CHARS = 1500;

/** Python `str[:n]` after `.strip()` -- slices code points, and anything that isn't a string is empty. */
function text(value: unknown, limit: number): string {
  return Array.from(typeof value === 'string' ? value.trim() : '').slice(0, limit).join('');
}

/** Port of `get_project_plan`: `{state: {...} | null, updated_at: string | null}`. */
export function getProjectPlan(projectId: number, userId: number): Row {
  return withTodoDb((db) => {
    const row = db.get('SELECT state, updated_at FROM project_plans WHERE project_id = ? AND user_id = ?', projectId, userId);
    if (!row) return { state: null, updated_at: null };
    const state = parseJson<unknown>(row.state, null);
    const isObject = !!state && typeof state === 'object' && !Array.isArray(state);
    return { state: isObject ? state : null, updated_at: row.updated_at };
  });
}

/** Port of `save_project_plan`. Returns null if the project isn't owned by userId. */
export function saveProjectPlan(projectId: number, userId: number, state: Row): Row | null {
  return withTodoDb((db) => {
    if (!db.get('SELECT id FROM projects WHERE id = ? AND user_id = ?', projectId, userId)) return null;
    db.run(
      `
      INSERT INTO project_plans (project_id, user_id, state, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(project_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
      `,
      projectId, userId, pyJsonDumps(state),
    );
    return { state, updated_at: db.get('SELECT updated_at FROM project_plans WHERE project_id = ?', projectId)!.updated_at };
  });
}

/**
 * Port of `apply_plan_to_project`: each plan phase becomes a `phase` node (context = description + milestone,
 * due date = its end date) with its key tasks as `action` children, appended after the nodes already there.
 * Returns null if the project isn't owned by userId.
 */
export function applyPlanToProject(projectId: number, userId: number, phases: Row[]): { phases: number; nodes: number } | null {
  return withTodoDb((db) =>
    db.transaction(() => {
      if (!db.get('SELECT id FROM projects WHERE id = ? AND user_id = ?', projectId, userId)) return null;

      const nextRootOrder =
        Number(
          db.get(
            'SELECT COALESCE(MAX(order_index), -1) AS m FROM project_nodes WHERE project_id = ? AND user_id = ? AND parent_node_id IS NULL',
            projectId, userId,
          )!.m,
        ) + 1;

      let phaseCount = 0;
      let nodeCount = 0;
      for (const phase of phases.slice(0, MAX_PHASES)) {
        if (!phase || typeof phase !== 'object' || Array.isArray(phase)) continue;
        const name = text(phase.name, MAX_TITLE_CHARS);
        if (!name) continue;
        const contextParts = [text(phase.description, MAX_CONTEXT_CHARS)];
        const milestone = text(phase.milestone, MAX_TITLE_CHARS);
        if (milestone) contextParts.push(`Milestone: ${milestone}`);
        const { lastInsertRowid: phaseId } = db.run(
          `
          INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type,
                                     depth_level, order_index, context, due_date, time_estimate)
          VALUES (?, ?, NULL, ?, 'phase', 'manual', 1, ?, ?, ?, ?)
          `,
          userId, projectId, name, nextRootOrder + phaseCount,
          contextParts.filter(Boolean).join('\n\n') || null,
          text(phase.end_date, 10) || null,
          text(phase.duration, 40) || null,
        );
        phaseCount += 1;
        nodeCount += 1;

        const tasks: unknown[] = Array.isArray(phase.key_tasks) ? phase.key_tasks : [];
        tasks.slice(0, MAX_TASKS_PER_PHASE).forEach((task, index) => {
          const title = text(task, MAX_TITLE_CHARS);
          if (!title) return;
          db.run(
            `
            INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type,
                                       depth_level, order_index)
            VALUES (?, ?, ?, ?, 'action', 'manual', 2, ?)
            `,
            userId, projectId, phaseId, title, index,
          );
          nodeCount += 1;
        });
      }
      return { phases: phaseCount, nodes: nodeCount };
    }),
  );
}
