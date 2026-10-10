/**
 * fe-apis/todo/projects/db.ts
 *
 * TypeScript port of backend/modules/ai_todo/projects/db.py -- keep the two in sync.
 * Signatures follow the contract in fe-apis/todo/README.md (generated from the Python
 * function signatures, so handlers and other modules can rely on them).
 */

import { withTodoDb, type Row } from '../_shared';

/** Python `d.get(key, default)`: the default only when the key is absent. */
function getOr(obj: Row, key: string, fallback: unknown): any {
  return obj[key] === undefined ? fallback : obj[key];
}

// ── Projects ──────────────────────────────────────────────────────────────────

/** Port of `_project_row_to_dict`. */
function projectRowToDict(row: Row): Row {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    eisenhower_quadrant: row.eisenhower_quadrant,
    due_date: row.due_date,
    color: row.color,
    icon: row.icon,
    created_at: row.created_at,
    pareto_score: row.pareto_score ?? null,
    is_top_20: !!row.is_top_20,
    pareto_reason: row.pareto_reason ?? null,
    pareto_locked: !!row.pareto_locked,
  };
}

const PROJECT_COLUMNS =
  'id, title, description, status, priority, eisenhower_quadrant, ' +
  'due_date, color, icon, created_at, pareto_score, is_top_20, pareto_reason, pareto_locked';

/** Port of `create_project`. */
export function createProject(userId: number, title: string, opts: { description?: string | null; priority?: string; color?: string | null; icon?: string | null; due_date?: string | null; eisenhower_quadrant?: string } = {}): Row {
  const {
    description = null,
    priority = 'p3',
    color = null,
    icon = null,
    due_date = null,
    eisenhower_quadrant = 'schedule',
  } = opts;
  return withTodoDb((db) => {
    const { lastInsertRowid } = db.run(
      `
      INSERT INTO projects (user_id, title, description, priority, color, icon, due_date, eisenhower_quadrant)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      userId, title, description, priority, color, icon, due_date, eisenhower_quadrant,
    );
    return projectRowToDict(db.get(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`, lastInsertRowid)!);
  });
}

/** Port of `get_all_projects` (newest first, each with `node_count` and `exported_count`). */
export function getAllProjects(userId: number): Row[] {
  return withTodoDb((db) => {
    const projects = db
      .all(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE user_id = ? ORDER BY id DESC`, userId)
      .map(projectRowToDict);
    for (const p of projects) {
      p.node_count = Number(
        db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_nodes WHERE project_id = ? AND user_id = ?', p.id, userId)!.n,
      );
      p.exported_count = Number(
        db.get<{ n: number }>(
          'SELECT COUNT(*) AS n FROM project_nodes WHERE project_id = ? AND user_id = ? AND exported_to_smart_todo = 1',
          p.id, userId,
        )!.n,
      );
    }
    return projects;
  });
}

/** Port of `get_project`. */
export function getProject(projectId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ? AND user_id = ?`, projectId, userId);
    return row ? projectRowToDict(row) : null;
  });
}

const PROJECT_UPDATE_FIELDS = new Set([
  'title', 'description', 'status', 'priority', 'eisenhower_quadrant', 'due_date', 'color', 'icon',
  'pareto_score', 'is_top_20', 'pareto_reason', 'pareto_locked',
]);

/**
 * Port of `update_project`. Keys outside the allow-list or with an `undefined` value are
 * ignored. The re-read is scoped to userId (Python re-reads by id only); a non-owner gets null.
 */
export function updateProject(projectId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const updates: Row = {};
    for (const [k, v] of Object.entries(fields || {})) {
      if (PROJECT_UPDATE_FIELDS.has(k) && v !== undefined) updates[k] = v;
    }
    const keys = Object.keys(updates);
    if (!keys.length) return getProject(projectId, userId);

    db.run(
      `UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => updates[k]), projectId, userId,
    );
    return getProject(projectId, userId);
  });
}

/** Port of `delete_project` (nodes go via ON DELETE CASCADE). */
export function deleteProject(projectId: number, userId: number): boolean {
  return withTodoDb((db) => db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', projectId, userId).changes > 0);
}

// ── Project Nodes ─────────────────────────────────────────────────────────────

/** Port of `_node_row_to_dict`. Columns missing from `row` fall back like Python's short-tuple case. */
function nodeRowToDict(row: Row): Row {
  return {
    id: row.id,
    project_id: row.project_id,
    parent_node_id: row.parent_node_id,
    title: row.title,
    node_type: row.node_type,
    generation_type: row.generation_type,
    depth_level: row.depth_level,
    exported_to_smart_todo: !!row.exported_to_smart_todo,
    exported_task_id: row.exported_task_id,
    exported_to_quick: !!row.exported_to_quick,
    order_index: row.order_index,
    created_at: row.created_at,
    pareto_score: row.pareto_score ?? null,
    is_top_20: !!row.is_top_20,
    eisenhower_quadrant: row.eisenhower_quadrant ?? 'schedule',
    context: row.context ?? null,
    due_date: row.due_date ?? null,
    time_estimate: row.time_estimate ?? null,
    intention: row.intention ?? null,
    definition_of_done: row.definition_of_done ?? null,
    pareto_reason: row.pareto_reason ?? null,
    pareto_locked: !!row.pareto_locked,
  };
}

const NODE_COLUMNS =
  'id, project_id, parent_node_id, title, node_type, generation_type, ' +
  'depth_level, exported_to_smart_todo, exported_task_id, exported_to_quick, ' +
  'order_index, created_at, pareto_score, is_top_20, eisenhower_quadrant, ' +
  'context, due_date, time_estimate, intention, definition_of_done, ' +
  'pareto_reason, pareto_locked';

/** Port of `create_project_node`. Returns null if the project isn't owned by userId. */
export function createProjectNode(projectId: number, userId: number, title: string, opts: { parent_node_id?: number | null; node_type?: string; generation_type?: string; order_index?: number } = {}): Row | null {
  const { node_type = 'topic', generation_type = 'manual', order_index = 0 } = opts;
  let parentNodeId = opts.parent_node_id ?? null;
  return withTodoDb((db) => {
    if (!db.get('SELECT id FROM projects WHERE id = ? AND user_id = ?', projectId, userId)) return null;

    // Calculate depth_level (only from a parent node this user owns)
    let depthLevel = 1;
    if (parentNodeId) {
      const parent = db.get('SELECT depth_level FROM project_nodes WHERE id = ? AND user_id = ?', parentNodeId, userId);
      if (parent) depthLevel = parent.depth_level + 1;
      else parentNodeId = null;
    }

    const { lastInsertRowid } = db.run(
      `
      INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type, depth_level, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      userId, projectId, parentNodeId, title, node_type, generation_type, depthLevel, order_index,
    );
    return nodeRowToDict(db.get(`SELECT ${NODE_COLUMNS} FROM project_nodes WHERE id = ?`, lastInsertRowid)!);
  });
}

/** Port of `get_project_node_tree`: the project's nodes as a nested forest (`children`). */
export function getProjectNodeTree(projectId: number, userId: number): Row[] {
  return withTodoDb((db) => {
    const allNodes = db
      .all(
        `SELECT ${NODE_COLUMNS} FROM project_nodes WHERE project_id = ? AND user_id = ? ORDER BY order_index ASC, id ASC`,
        projectId, userId,
      )
      .map(nodeRowToDict);

    const nodeMap = new Map<number, Row>();
    for (const n of allNodes) nodeMap.set(n.id, { ...n, children: [] });
    const roots: Row[] = [];
    for (const n of allNodes) {
      const withChildren = nodeMap.get(n.id)!;
      if (n.parent_node_id && nodeMap.has(n.parent_node_id)) nodeMap.get(n.parent_node_id)!.children.push(withChildren);
      else roots.push(withChildren);
    }
    return roots;
  });
}

/** Port of `get_project_node`. */
export function getProjectNode(nodeId: number, userId: number): Row | null {
  return withTodoDb((db) => {
    const row = db.get(`SELECT ${NODE_COLUMNS} FROM project_nodes WHERE id = ? AND user_id = ?`, nodeId, userId);
    return row ? nodeRowToDict(row) : null;
  });
}

/** Port of `get_node_sibling_titles` (falsy parentNodeId → the project's root nodes). */
export function getNodeSiblingTitles(parentNodeId: number | null, projectId: number, userId: number): string[] {
  return withTodoDb((db) => {
    const rows = parentNodeId
      ? db.all<{ title: string }>(
          'SELECT title FROM project_nodes WHERE parent_node_id = ? AND project_id = ? AND user_id = ?',
          parentNodeId, projectId, userId,
        )
      : db.all<{ title: string }>(
          'SELECT title FROM project_nodes WHERE parent_node_id IS NULL AND project_id = ? AND user_id = ?',
          projectId, userId,
        );
    return rows.map((r) => r.title);
  });
}

const NODE_UPDATE_FIELDS = new Set([
  'title', 'node_type', 'exported_to_smart_todo', 'exported_task_id', 'exported_to_quick',
  'order_index', 'pareto_score', 'is_top_20', 'eisenhower_quadrant',
  'context', 'due_date', 'time_estimate', 'intention', 'definition_of_done',
  'pareto_reason', 'pareto_locked',
]);

/** Port of `update_project_node`. Keys outside the allow-list or with an `undefined` value are ignored. */
export function updateProjectNode(nodeId: number, userId: number, fields: Row): Row | null {
  return withTodoDb((db) => {
    const updates: Row = {};
    for (const [k, v] of Object.entries(fields || {})) {
      if (NODE_UPDATE_FIELDS.has(k) && v !== undefined) updates[k] = v;
    }
    const keys = Object.keys(updates);
    if (!keys.length) return getProjectNode(nodeId, userId);

    db.run(
      `UPDATE project_nodes SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
      ...keys.map((k) => updates[k]), nodeId, userId,
    );
    return getProjectNode(nodeId, userId);
  });
}

/** Port of `delete_project_node` (child nodes go via ON DELETE CASCADE). */
export function deleteProjectNode(nodeId: number, userId: number): boolean {
  return withTodoDb((db) => db.run('DELETE FROM project_nodes WHERE id = ? AND user_id = ?', nodeId, userId).changes > 0);
}

/**
 * Port of `create_project_nodes_batch` (AI breakdowns): `nodesData` is `[{title, node_type?}]`,
 * order_index = position. Returns [] if the project isn't owned by userId.
 */
export function createProjectNodesBatch(projectId: number, userId: number, parentNodeId: number | null, nodesData: Row[], opts: { generation_type?: string } = {}): Row[] {
  const { generation_type = 'dive_deeper' } = opts;
  return withTodoDb((db) =>
    db.transaction(() => {
      if (!db.get('SELECT id FROM projects WHERE id = ? AND user_id = ?', projectId, userId)) return [];

      let depthLevel = 1;
      let inheritedParetoScore: number | null = null;
      if (parentNodeId) {
        const parent = db.get(
          'SELECT depth_level, is_top_20 FROM project_nodes WHERE id = ? AND user_id = ?',
          parentNodeId, userId,
        );
        if (parent) {
          depthLevel = parent.depth_level + 1;
          // Children of a Top 20% node inherit an elevated base Pareto score until re-analyzed.
          inheritedParetoScore = parent.is_top_20 ? 0.5 : null;
        }
      }

      const results: Row[] = [];
      nodesData.forEach((nd, i) => {
        const { lastInsertRowid } = db.run(
          `
          INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type, depth_level, order_index, pareto_score)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          userId, projectId, parentNodeId, nd.title, getOr(nd, 'node_type', 'topic'), generation_type, depthLevel, i, inheritedParetoScore,
        );
        results.push(nodeRowToDict(db.get(`SELECT ${NODE_COLUMNS} FROM project_nodes WHERE id = ?`, lastInsertRowid)!));
      });
      return results;
    }),
  );
}

/** Port of `bulk_update_project_quadrants`: `[{project_id, quadrant}]`, entries missing either are skipped. */
export function bulkUpdateProjectQuadrants(userId: number, updates: Row[]): void {
  withTodoDb((db) =>
    db.transaction(() => {
      for (const u of updates) {
        const projectId = u?.project_id;
        const quadrant = u?.quadrant;
        if (projectId && quadrant) {
          db.run('UPDATE projects SET eisenhower_quadrant = ? WHERE id = ? AND user_id = ?', quadrant, projectId, userId);
        }
      }
    }),
  );
}

/**
 * Port of `get_all_flat_project_nodes`: nodes of the user's active projects plus
 * project_title/color/icon. Like Python, only the first 15 node columns are read, so
 * context/due_date/time_estimate/intention/definition_of_done/pareto_reason are always
 * null and pareto_locked always false here.
 */
export function getAllFlatProjectNodes(userId: number): Row[] {
  return withTodoDb((db) =>
    db
      .all(
        `
        SELECT
          n.id, n.project_id, n.parent_node_id, n.title, n.node_type, n.generation_type,
          n.depth_level, n.exported_to_smart_todo, n.exported_task_id, n.exported_to_quick,
          n.order_index, n.created_at, n.pareto_score, n.is_top_20, n.eisenhower_quadrant,
          p.title as project_title, p.color as project_color, p.icon as project_icon
        FROM project_nodes n
        JOIN projects p ON n.project_id = p.id
        WHERE p.status = 'active' AND n.user_id = ? AND p.user_id = ?
        ORDER BY n.order_index ASC, n.id ASC
        `,
        userId, userId,
      )
      .map((row) => ({
        ...nodeRowToDict(row),
        project_title: row.project_title,
        project_color: row.project_color,
        project_icon: row.project_icon,
      })),
  );
}

/** Port of `bulk_update_node_quadrants`: `[{node_id | id, quadrant}]`, entries missing either are skipped. */
export function bulkUpdateNodeQuadrants(userId: number, updates: Row[]): void {
  withTodoDb((db) =>
    db.transaction(() => {
      for (const u of updates) {
        const nid = u?.node_id || u?.id;
        const quad = u?.quadrant;
        if (nid && quad) {
          db.run('UPDATE project_nodes SET eisenhower_quadrant = ? WHERE id = ? AND user_id = ?', quad, nid, userId);
        }
      }
    }),
  );
}
