/**
 * fe-apis/todo/projects/handlers.ts
 *
 * Port of backend/modules/ai_todo/projects/router.py (Plan & Project: project CRUD, node
 * tree, AI breakdowns, export to Smart To-Do / Quick Daily, Eisenhower sort, roadmap) --
 * keep the two in sync. Paths are relative to the /todo prefix.
 */

import { HttpError, aiSettings, callAi, extractJsonArray, patchUpdates, todayIso, withTodoDb, type Row } from '../_shared';
import { pyJsonDumps, pyStr } from '../py';
import type { TodoCtx, TodoRoute } from '../router';
import { createTask } from '../tasks/db';
import { createQuickTask } from '../quick/db';
import {
  createProject,
  getAllProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectNodeTree,
  createProjectNode,
  getProjectNode,
  getNodeSiblingTitles,
  updateProjectNode,
  deleteProjectNode,
  createProjectNodesBatch,
  bulkUpdateProjectQuadrants,
  getAllFlatProjectNodes,
  bulkUpdateNodeQuadrants,
} from './db';

// ── Pydantic-style request validation ────────────────────────────────────────

type Kind = 'str' | 'int' | 'float' | 'bool';

const REQUIRED = Symbol('required');
const KIND_NAMES: Record<Kind, string> = { str: 'string', int: 'integer', float: 'number', bool: 'boolean' };
const BOOL_STRINGS = new Map<string, boolean>([
  ['1', true], ['on', true], ['t', true], ['true', true], ['y', true], ['yes', true],
  ['0', false], ['off', false], ['f', false], ['false', false], ['n', false], ['no', false],
]);

/** Pydantic (lax mode) scalar coercion; anything else is a 422. */
function scalar(value: unknown, kind: Kind, loc: string): any {
  if (kind === 'str' && typeof value === 'string') return value;
  if (kind === 'int') {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^\s*[-+]?\d+\s*$/.test(value)) return parseInt(value, 10);
  }
  if (kind === 'float') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  if (kind === 'bool') {
    if (typeof value === 'boolean') return value;
    if (value === 0 || value === 1) return value === 1;
    if (typeof value === 'string' && BOOL_STRINGS.has(value.toLowerCase())) return BOOL_STRINGS.get(value.toLowerCase());
  }
  throw new HttpError(422, `${loc}: Input should be a valid ${KIND_NAMES[kind]}`);
}

/** One model field: REQUIRED → `x: T`; null → `x: Optional[T] = None`; else → `x: T = default`. */
function field(body: Row, key: string, kind: Kind, dflt: unknown = REQUIRED): any {
  const value = body[key];
  if (value === undefined) {
    if (dflt === REQUIRED) throw new HttpError(422, `body.${key}: Field required`);
    return dflt;
  }
  if (value === null && dflt === null) return null;
  return scalar(value, kind, `body.${key}`);
}

/**
 * `patch_updates(payload, nullable)` for an all-Optional model: the fields the body sent; a `null` is
 * kept (and written as NULL) only for a nullable column, otherwise it means "no change".
 */
function dumpPatch(body: Row, spec: Record<string, Kind>, nullable: ReadonlySet<string>): Row {
  const sent: Row = {};
  for (const [key, kind] of Object.entries(spec)) {
    if (body[key] === undefined) continue;
    sent[key] = body[key] === null ? null : scalar(body[key], kind, `body.${key}`);
  }
  return patchUpdates(sent, nullable);
}

async function bodyModel(ctx: TodoCtx): Promise<Row> {
  const body = await ctx.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'body: Input should be a valid dictionary or object');
  }
  return body;
}

const PROJECT_UPDATE_FIELDS: Record<string, Kind> = {
  title: 'str', description: 'str', status: 'str', priority: 'str', eisenhower_quadrant: 'str',
  due_date: 'str', color: 'str', icon: 'str', is_top_20: 'bool', pareto_score: 'float', pareto_reason: 'str',
};

const NODE_UPDATE_FIELDS: Record<string, Kind> = {
  title: 'str', node_type: 'str', eisenhower_quadrant: 'str', is_top_20: 'bool', pareto_score: 'float',
  pareto_reason: 'str', order_index: 'int', context: 'str', due_date: 'str', time_estimate: 'str',
  intention: 'str', definition_of_done: 'str',
};

/**
 * PROJECT_NULLABLE / NODE_NULLABLE in projects/router.py: columns a PATCH can empty by sending `null`.
 * A node's eisenhower_quadrant is left out on purpose: NULL reads back as 'schedule', so clearing it
 * would report success and change nothing visible.
 */
const PROJECT_NULLABLE: ReadonlySet<string> = new Set([
  'description', 'due_date', 'color', 'icon', 'eisenhower_quadrant', 'pareto_score', 'pareto_reason',
]);
const NODE_NULLABLE: ReadonlySet<string> = new Set([
  'pareto_score', 'pareto_reason', 'context', 'due_date', 'time_estimate', 'intention', 'definition_of_done',
]);

// ── Python-compatible formatting for prompts ─────────────────────────────────

/** `(value or "")[:n]` — Python slices code points, not UTF-16 units. */
function head(value: unknown, n: number): string {
  return Array.from(String(value || '')).slice(0, n).join('');
}

/** `_call_ai` + `_extract_json_array`; any failure → HTTPException(500, '<prefix>: <exc>'). */
async function aiJsonArray(prompt: string, body: Row, prefix: string): Promise<any[]> {
  try {
    return extractJsonArray(await callAi(prompt, aiSettings(body)));
  } catch (err) {
    throw new HttpError(500, `${prefix}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  /** POST /todo/projects — create_project_endpoint. */
  {
    method: 'POST',
    path: '/projects',
    handler: async (ctx) => {
      const body = await bodyModel(ctx);
      const title = field(body, 'title', 'str');
      return createProject(ctx.userId, title, {
        description: field(body, 'description', 'str', null),
        priority: field(body, 'priority', 'str', 'p3'),
        color: field(body, 'color', 'str', null),
        icon: field(body, 'icon', 'str', null),
        due_date: field(body, 'due_date', 'str', null),
      });
    },
  },

  /** GET /todo/projects — list_projects_endpoint. */
  {
    method: 'GET',
    path: '/projects',
    handler: (ctx) => getAllProjects(ctx.userId),
  },

  /** PATCH /todo/projects/{project_id} — update_project_endpoint. */
  {
    method: 'PATCH',
    path: '/projects/:project_id',
    handler: async (ctx) => {
      const projectId = ctx.intParam('project_id');
      const updates = dumpPatch(await bodyModel(ctx), PROJECT_UPDATE_FIELDS, PROJECT_NULLABLE);
      if ('is_top_20' in updates) updates.pareto_locked = 1;
      const project = updateProject(projectId, ctx.userId, updates);
      if (!project) throw new HttpError(404, 'Project not found');
      return project;
    },
  },

  /** DELETE /todo/projects/{project_id} — delete_project_endpoint. */
  {
    method: 'DELETE',
    path: '/projects/:project_id',
    handler: (ctx) => {
      const projectId = ctx.intParam('project_id');
      if (!deleteProject(projectId, ctx.userId)) throw new HttpError(404, 'Project not found');
      return { status: 'deleted', id: projectId };
    },
  },

  /** GET /todo/projects/{project_id}/tree — get_project_tree_endpoint. */
  {
    method: 'GET',
    path: '/projects/:project_id/tree',
    handler: (ctx) => {
      const projectId = ctx.intParam('project_id');
      return withTodoDb(() => {
        if (!getProject(projectId, ctx.userId)) throw new HttpError(404, 'Project not found');
        return getProjectNodeTree(projectId, ctx.userId);
      });
    },
  },

  /** POST /todo/projects/{project_id}/nodes — create_node_endpoint. */
  {
    method: 'POST',
    path: '/projects/:project_id/nodes',
    handler: async (ctx) => {
      const projectId = ctx.intParam('project_id');
      const body = await bodyModel(ctx);
      const title = field(body, 'title', 'str');
      const node = createProjectNode(projectId, ctx.userId, title, {
        parent_node_id: field(body, 'parent_node_id', 'int', null),
        node_type: field(body, 'node_type', 'str', 'topic'),
      });
      if (node === null) throw new HttpError(404, 'Project not found');
      return node;
    },
  },

  /** POST /todo/project-nodes/{node_id}/dive-deeper — dive_deeper_node_endpoint. */
  {
    method: 'POST',
    path: '/project-nodes/:node_id/dive-deeper',
    handler: async (ctx) => {
      const nodeId = ctx.intParam('node_id');
      const body = await bodyModel(ctx);
      const { node, project, siblings } = withTodoDb(() => {
        const node = getProjectNode(nodeId, ctx.userId);
        if (!node) throw new HttpError(404, 'Node not found');
        const project = getProject(node.project_id, ctx.userId) as Row;
        const siblings = getNodeSiblingTitles(node.parent_node_id, node.project_id, ctx.userId);
        return { node, project, siblings };
      });

      const prompt = `You are a strategic project planner. Break this topic into 3-5 strategic subtopics or phases.

Project: ${pyStr(project.title)}
Project Description: ${project.description || 'No description'}
Current Topic: ${pyStr(node.title)}
Existing Siblings: ${siblings.length ? siblings.join(', ') : 'None'}

Return ONLY a valid JSON array:
[
  {"title": "Subtopic title", "node_type": "topic|phase|idea"}
]
No extra text, no markdown blocks, just raw JSON array.`;

      const subtopics = await aiJsonArray(prompt, body, 'AI Dive Deeper failed');
      const children = createProjectNodesBatch(node.project_id, ctx.userId, nodeId, subtopics, {
        generation_type: 'dive_deeper',
      });
      return { children };
    },
  },

  /** POST /todo/project-nodes/{node_id}/chunk — chunk_node_endpoint. */
  {
    method: 'POST',
    path: '/project-nodes/:node_id/chunk',
    handler: async (ctx) => {
      const nodeId = ctx.intParam('node_id');
      const body = await bodyModel(ctx);
      const { node, project } = withTodoDb(() => {
        const node = getProjectNode(nodeId, ctx.userId);
        if (!node) throw new HttpError(404, 'Node not found');
        return { node, project: getProject(node.project_id, ctx.userId) as Row };
      });

      const prompt = `You are a task breakdown expert. Convert this project topic into 3-5 concrete, actionable tasks.

Project: ${pyStr(project.title)}
Topic: ${pyStr(node.title)}

Each action should be specific and completable. Return ONLY a valid JSON array:
[
  {"title": "Action item title", "node_type": "action"}
]
No extra text.`;

      const actions = await aiJsonArray(prompt, body, 'AI Chunk failed');
      const children = createProjectNodesBatch(node.project_id, ctx.userId, nodeId, actions, {
        generation_type: 'chunk',
      });
      return { children };
    },
  },

  /** POST /todo/project-nodes/{node_id}/move-to-smart — move_node_to_smart_endpoint. */
  {
    method: 'POST',
    path: '/project-nodes/:node_id/move-to-smart',
    handler: (ctx) => {
      const nodeId = ctx.intParam('node_id');
      return withTodoDb(() => {
        const node = getProjectNode(nodeId, ctx.userId);
        if (!node) throw new HttpError(404, 'Node not found');
        const project = getProject(node.project_id, ctx.userId) as Row;
        const newTask = createTask(ctx.userId, node.title, { context: `From project: ${pyStr(project.title)}` });
        updateProjectNode(nodeId, ctx.userId, { exported_to_smart_todo: 1, exported_task_id: newTask.id });
        return { status: 'exported', task: newTask };
      });
    },
  },

  /** POST /todo/project-nodes/{node_id}/move-to-quick — move_node_to_quick_endpoint. */
  {
    method: 'POST',
    path: '/project-nodes/:node_id/move-to-quick',
    handler: (ctx) => {
      const nodeId = ctx.intParam('node_id');
      return withTodoDb(() => {
        const node = getProjectNode(nodeId, ctx.userId);
        if (!node) throw new HttpError(404, 'Node not found');
        const qt = createQuickTask(ctx.userId, node.title, { task_date: todayIso(), source: 'moved_from_plan' });
        updateProjectNode(nodeId, ctx.userId, { exported_to_quick: 1 });
        return { status: 'exported', quick_task: qt };
      });
    },
  },

  /** DELETE /todo/project-nodes/{node_id} — delete_project_node_endpoint. */
  {
    method: 'DELETE',
    path: '/project-nodes/:node_id',
    handler: (ctx) => {
      const nodeId = ctx.intParam('node_id');
      if (!deleteProjectNode(nodeId, ctx.userId)) throw new HttpError(404, 'Node not found');
      return { status: 'deleted', id: nodeId };
    },
  },

  /** GET /todo/project-nodes/all — get_all_project_nodes_endpoint. */
  {
    method: 'GET',
    path: '/project-nodes/all',
    handler: (ctx) => getAllFlatProjectNodes(ctx.userId),
  },

  /** PATCH /todo/project-nodes/{node_id} — update_project_node_endpoint. */
  {
    method: 'PATCH',
    path: '/project-nodes/:node_id',
    handler: async (ctx) => {
      const nodeId = ctx.intParam('node_id');
      const updates = dumpPatch(await bodyModel(ctx), NODE_UPDATE_FIELDS, NODE_NULLABLE);
      if ('is_top_20' in updates) updates.pareto_locked = 1;
      const updated = updateProjectNode(nodeId, ctx.userId, updates);
      if (!updated) throw new HttpError(404, 'Node not found');
      return updated;
    },
  },

  /** POST /todo/project-nodes/eisenhower-auto — eisenhower_auto_nodes_endpoint. */
  {
    method: 'POST',
    path: '/project-nodes/eisenhower-auto',
    handler: async (ctx) => {
      const body = await bodyModel(ctx);
      const nodes = getAllFlatProjectNodes(ctx.userId);
      if (!nodes.length) return { assignments: [] };

      const nodeList = nodes.map((n) => ({
        node_id: n.id,
        title: n.title,
        node_type: n.node_type,
        project_title: 'project_title' in n ? n.project_title : 'Unknown',
        depth_level: n.depth_level,
        is_top_20: Boolean(n.is_top_20),
      }));
      const nodeJson = pyJsonDumps(nodeList.slice(0, 60), 2);

      const prompt = `You are a productivity expert using the Eisenhower Matrix for project tasks and subtasks.
Categorize each task/subtask into:
- do_now: Urgent + Important
- schedule: Not Urgent + Important
- delegate: Urgent + Not Important
- eliminate: Not Urgent + Not Important

RULE: Any task/subtask with is_top_20=true is a Pareto high-leverage item — weight it toward
"do_now" (or "schedule" if clearly not urgent). Never place it in "delegate" or "eliminate".

Tasks & Subtasks:
${nodeJson}

Return ONLY a valid JSON array:
[
  {"node_id": 1, "quadrant": "do_now", "reasoning": "High impact subtask"}
]`;

      const assignments = await aiJsonArray(prompt, body, 'AI Eisenhower sort failed');
      bulkUpdateNodeQuadrants(ctx.userId, assignments);
      return { assignments };
    },
  },

  /** POST /todo/projects/eisenhower-auto — eisenhower_auto_projects_endpoint. */
  {
    method: 'POST',
    path: '/projects/eisenhower-auto',
    handler: async (ctx) => {
      const body = await bodyModel(ctx);
      const active = getAllProjects(ctx.userId).filter((p) => p.status === 'active');
      if (!active.length) return { assignments: [] };

      const projectList = active.map((p) => ({
        project_id: p.id,
        title: p.title,
        priority: p.priority,
        due_date: p.due_date || 'none',
        description: head(p.description, 100),
        is_top_20: Boolean(p.is_top_20),
      }));
      const projectJson = pyJsonDumps(projectList, 2);

      const prompt = `You are a strategic planning expert using the Eisenhower Matrix for projects.
Categorize each project:
- do_now: Urgent + Important
- schedule: Not Urgent + Important
- delegate: Urgent + Not Important
- eliminate: Not Urgent + Not Important

RULE: Any project with is_top_20=true is a Pareto high-leverage project — weight it toward
"do_now" (or "schedule" if clearly not urgent). Never place it in "delegate" or "eliminate".

Projects:
${projectJson}

Return ONLY a valid JSON array:
[
  {"project_id": 1, "quadrant": "do_now", "reasoning": "Brief reason"}
]`;

      const assignments = await aiJsonArray(prompt, body, 'AI Eisenhower sort failed');
      bulkUpdateProjectQuadrants(ctx.userId, assignments);
      return { assignments };
    },
  },

  /** POST /todo/projects/{project_id}/ai-roadmap — ai_roadmap_endpoint. */
  {
    method: 'POST',
    path: '/projects/:project_id/ai-roadmap',
    handler: async (ctx) => {
      const projectId = ctx.intParam('project_id');
      const body = await bodyModel(ctx);
      const { project, nodeTitles } = withTodoDb(() => {
        const project = getProject(projectId, ctx.userId);
        if (!project) throw new HttpError(404, 'Project not found');
        const existingNodes = getProjectNodeTree(projectId, ctx.userId);
        return { project, nodeTitles: existingNodes.map((n) => n.title as string) };
      });

      const prompt = `You are a project manager. Create a phased roadmap for this project.

Project: ${pyStr(project.title)}
Description: ${project.description || 'No description'}
Priority: ${pyStr(project.priority)}
Due date: ${project.due_date || 'Not set'}
Existing topics explored: ${nodeTitles.length ? nodeTitles.slice(0, 10).join(', ') : 'None'}

Return ONLY a valid JSON array of phases:
[
  {
    "name": "Phase 1: Research",
    "duration": "1 week",
    "key_tasks": ["Task 1", "Task 2"],
    "milestone": "Research report complete"
  }
]
Create 3-5 phases. Use 'name' (not 'phase') as the key. No extra text.`;

      const phases = await aiJsonArray(prompt, body, 'AI Roadmap failed');
      return { roadmap: { phases } };
    },
  },
];
