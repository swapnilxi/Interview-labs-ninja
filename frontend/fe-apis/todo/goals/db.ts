/**
 * fe-apis/todo/goals/db.ts
 *
 * TypeScript port of backend/modules/ai_todo/goals/db.py -- keep the two in sync.
 * Signatures follow the contract in fe-apis/todo/README.md (generated from the Python
 * function signatures, so handlers and other modules can rely on them).
 *
 * Unlike project_nodes, a goal_node's parent is optional at any level — a goal can start
 * at any time horizon (main/yearly/quarterly/monthly/weekly/daily).
 */

import { withTodoDb, parseJson, type Row } from '../_shared';
import { pyJsonDumps } from '../py';

/** Port of `LEVEL_ORDER` (coarsest → finest horizon). */
export const LEVEL_ORDER = ['main', 'yearly', 'quarterly', 'monthly', 'weekly', 'daily'];

/** Port of `_goal_row_to_dict`. */
function goalRowToDict(row: Row): Row {
  return {
    id: row.id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    title: row.title,
    description: row.description,
    level: row.level,
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    generation_type: row.generation_type,
    depth_level: row.depth_level,
    order_index: row.order_index,
    exported_to_smart_todo: !!row.exported_to_smart_todo,
    exported_task_id: row.exported_task_id,
    exported_to_quick: !!row.exported_to_quick,
    exported_quick_task_id: row.exported_quick_task_id,
    exported_to_plan: !!row.exported_to_plan,
    exported_project_id: row.exported_project_id,
    attachments: parseJson<any[]>(row.attachments, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const GOAL_COLUMNS =
  'id, user_id, parent_id, title, description, level, status, priority, due_date, ' +
  'generation_type, depth_level, order_index, exported_to_smart_todo, exported_task_id, ' +
  'exported_to_quick, exported_quick_task_id, exported_to_plan, exported_project_id, ' +
  'attachments, created_at, updated_at';

/** Port of `create_goal_node` (an unowned parent_id is dropped, making it a root). */
export function createGoalNode(userId: number, title: string, opts: { level?: string; parent_id?: number | null; description?: string | null; priority?: string; due_date?: string | null; status?: string; order_index?: number; attachments?: string[] | null } = {}): Row {
  const {
    level = 'daily',
    description = null,
    priority = 'p3',
    due_date = null,
    status = 'backlog',
    order_index = 0,
    attachments = null,
  } = opts;
  let parentId = opts.parent_id ?? null;
  return withTodoDb((db) => {
    let depthLevel = 0;
    if (parentId) {
      const parent = db.get('SELECT depth_level FROM goal_nodes WHERE id = ? AND user_id = ?', parentId, userId);
      if (parent) depthLevel = parent.depth_level + 1;
      else parentId = null;
    }

    const attachmentsJson = attachments && attachments.length ? pyJsonDumps(attachments) : null;
    const { lastInsertRowid } = db.run(
      `
      INSERT INTO goal_nodes
        (user_id, parent_id, title, description, level, status, priority, due_date, depth_level, order_index, attachments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      userId, parentId, title, description, level, status, priority, due_date, depthLevel, order_index, attachmentsJson,
    );
    return goalRowToDict(db.get(`SELECT ${GOAL_COLUMNS} FROM goal_nodes WHERE id = ?`, lastInsertRowid)!);
  });
}

/** Port of `get_goal_tree`: all of the user's goals as a nested forest (`children`). */
export function getGoalTree(userId: number): Row[] {
  return withTodoDb((db) => {
    const allNodes = db
      .all(`SELECT ${GOAL_COLUMNS} FROM goal_nodes WHERE user_id = ? ORDER BY order_index ASC, id ASC`, userId)
      .map(goalRowToDict);

    const nodeMap = new Map<number, Row>();
    for (const n of allNodes) nodeMap.set(n.id, { ...n, children: [] });
    const roots: Row[] = [];
    for (const n of allNodes) {
      const withChildren = nodeMap.get(n.id)!;
      if (n.parent_id && nodeMap.has(n.parent_id)) nodeMap.get(n.parent_id)!.children.push(withChildren);
      else roots.push(withChildren);
    }
    return roots;
  });
}

/** Port of `get_goal_node`. */
export function getGoalNode(goalId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(`SELECT ${GOAL_COLUMNS} FROM goal_nodes WHERE id = ? AND user_id = ?`, goalId, userId);
    return row ? goalRowToDict(row) : null;
  });
}

/** Port of `get_goal_sibling_titles` (falsy parentId → the user's root goals). */
export function getGoalSiblingTitles(parentId: number | null, userId: number): string[] {
  return withTodoDb((db) => {
    const rows = parentId
      ? db.all<{ title: string }>('SELECT title FROM goal_nodes WHERE parent_id = ? AND user_id = ?', parentId, userId)
      : db.all<{ title: string }>('SELECT title FROM goal_nodes WHERE parent_id IS NULL AND user_id = ?', userId);
    return rows.map((r) => r.title);
  });
}

const GOAL_UPDATE_FIELDS = new Set([
  'title', 'description', 'level', 'status', 'priority', 'due_date', 'parent_id',
  'order_index', 'exported_to_smart_todo', 'exported_task_id', 'exported_to_quick',
  'exported_quick_task_id', 'exported_to_plan', 'exported_project_id', 'attachments',
]);

/** Port of `update_goal_node`. Keys outside the allow-list or with an `undefined` value are ignored. */
export function updateGoalNode(goalId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const updates: Row = {};
    for (const [k, v] of Object.entries(fields || {})) {
      if (GOAL_UPDATE_FIELDS.has(k) && v !== undefined) updates[k] = v;
    }
    const keys = Object.keys(updates);
    if (!keys.length) return getGoalNode(goalId, userId);

    if (Array.isArray(updates.attachments)) updates.attachments = pyJsonDumps(updates.attachments);

    const setParts = [...keys.map((k) => `${k} = ?`), "updated_at = datetime('now')"];
    db.run(
      `UPDATE goal_nodes SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => updates[k]), goalId, userId,
    );
    return getGoalNode(goalId, userId);
  });
}

/** Port of `delete_goal_node` (descendants go via ON DELETE CASCADE). */
export function deleteGoalNode(goalId: number, userId: number): boolean {
  return withTodoDb((db) => db.run('DELETE FROM goal_nodes WHERE id = ? AND user_id = ?', goalId, userId).changes > 0);
}

/**
 * Port of `create_goal_nodes_batch` (AI breakdowns): `nodesData` is
 * `[{title, description?, priority?, due_date?}]`, order_index = position.
 * Returns [] if the parent isn't owned by userId.
 */
export function createGoalNodesBatch(parentId: number, userId: number, nodesData: Row[], generationType: string, level: string): Row[] {
  return withTodoDb((db) =>
    db.transaction(() => {
      const parent = db.get('SELECT depth_level FROM goal_nodes WHERE id = ? AND user_id = ?', parentId, userId);
      if (!parent) return [];
      const depthLevel = parent.depth_level + 1;

      const results: Row[] = [];
      nodesData.forEach((nd, i) => {
        const { lastInsertRowid } = db.run(
          `
          INSERT INTO goal_nodes
            (user_id, parent_id, title, description, level, generation_type, depth_level, order_index,
             priority, due_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          userId, parentId, nd.title, nd.description ?? null, level, generationType,
          depthLevel, i, nd.priority === undefined ? 'p3' : nd.priority, nd.due_date ?? null,
        );
        results.push(goalRowToDict(db.get(`SELECT ${GOAL_COLUMNS} FROM goal_nodes WHERE id = ?`, lastInsertRowid)!));
      });
      return results;
    }),
  );
}
