/**
 * fe-apis/todo/goals/handlers.ts
 *
 * Port of backend/modules/ai_todo/goals/router.py (hierarchical yearly → daily goals,
 * mounted at /todo). Keep prompts, status codes and response shapes in sync with Python.
 */

import { HttpError, aiSettings, callAi, extractJsonArray, todayIso, type Row } from '../_shared';
import { errMsg } from '../py';
import type { TodoCtx, TodoRoute } from '../router';
import {
  createGoalNode,
  createGoalNodesBatch,
  deleteGoalNode,
  getGoalNode,
  getGoalSiblingTitles,
  getGoalTree,
  updateGoalNode,
} from './db';
import { createTask } from '../tasks/db';
import { createQuickTask } from '../quick/db';
import { createProject } from '../projects/db';

/** goals/db.py LEVEL_ORDER (not exported by goals/db.ts). */
const LEVEL_ORDER = ['main', 'yearly', 'quarterly', 'monthly', 'weekly', 'daily'];

function nextLevelDown(level: string): string {
  const i = LEVEL_ORDER.indexOf(level);
  if (i !== -1 && level !== LEVEL_ORDER[LEVEL_ORDER.length - 1]) return LEVEL_ORDER[i + 1];
  return 'daily';
}

// ── Request-body validation (Pydantic stand-in) ──────────────────────────────

type Kind = 'str' | 'int' | 'strList';

function invalid(key: string, expected: string): HttpError {
  return new HttpError(422, `Invalid value for '${key}': expected ${expected}`);
}

function coerce(kind: Kind, key: string, v: unknown): unknown {
  if (kind === 'str') {
    if (typeof v === 'string') return v;
    throw invalid(key, 'a string');
  }
  if (kind === 'int') {
    if (typeof v === 'boolean') return v ? 1 : 0;
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n === 'number' && Number.isInteger(n)) return n;
    throw invalid(key, 'an integer');
  }
  if (!Array.isArray(v) || v.some((item) => typeof item !== 'string')) throw invalid(key, 'a list of strings');
  return v;
}

/** One Pydantic field: 422 when required and missing, null on a non-Optional field, or a wrong type. */
function field(
  body: Row,
  key: string,
  kind: Kind,
  opts: { required?: boolean; nullable?: boolean; default?: unknown } = {}
): any {
  if (!(key in body)) {
    if (opts.required) throw new HttpError(422, `Field required: ${key}`);
    return 'default' in opts ? opts.default : null;
  }
  const value = body[key];
  if (value === null) {
    if (opts.nullable) return null;
    throw invalid(key, kind === 'str' ? 'a string' : `a valid ${kind}`);
  }
  return coerce(kind, key, value);
}

async function jsonBody(ctx: TodoCtx): Promise<Row> {
  const body = await ctx.json<unknown>();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'Input should be a valid dictionary');
  }
  return body as Row;
}

function requireGoal(goalId: number, userId: number): Row {
  const node = getGoalNode(goalId, userId);
  if (!node) throw new HttpError(404, 'Goal not found');
  return node;
}

// ── Goal CRUD ────────────────────────────────────────────────────────────────

/** POST /todo/goals — create_goal_endpoint. */
async function createGoalHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const title = field(body, 'title', 'str', { required: true });
  return createGoalNode(ctx.userId, title, {
    level: field(body, 'level', 'str', { default: 'daily' }),
    parent_id: field(body, 'parent_id', 'int', { nullable: true }),
    description: field(body, 'description', 'str', { nullable: true }),
    priority: field(body, 'priority', 'str', { default: 'p3' }),
    due_date: field(body, 'due_date', 'str', { nullable: true }),
    status: field(body, 'status', 'str', { default: 'backlog' }),
    attachments: field(body, 'attachments', 'strList', { nullable: true }),
  });
}

/** GET /todo/goals/tree — get_goal_tree_endpoint. */
function getGoalTreeHandler(ctx: TodoCtx) {
  return getGoalTree(ctx.userId);
}

const GOAL_UPDATE_FIELDS: [string, Kind][] = [
  ['title', 'str'],
  ['description', 'str'],
  ['level', 'str'],
  ['status', 'str'],
  ['priority', 'str'],
  ['due_date', 'str'],
  ['parent_id', 'int'],
  ['order_index', 'int'],
  ['attachments', 'strList'],
];

/** PATCH /todo/goals/{goal_id} — update_goal_endpoint. */
async function updateGoalHandler(ctx: TodoCtx) {
  const goalId = ctx.intParam('goal_id');
  const body = await jsonBody(ctx);
  // model_dump(exclude_none=True): only known fields with a non-null value.
  const updates: Row = {};
  for (const [key, kind] of GOAL_UPDATE_FIELDS) {
    const value = field(body, key, kind, { nullable: true });
    if (value !== null) updates[key] = value;
  }
  const updated = updateGoalNode(goalId, ctx.userId, updates);
  if (!updated) throw new HttpError(404, 'Goal not found');
  return updated;
}

/** DELETE /todo/goals/{goal_id} — delete_goal_endpoint. */
function deleteGoalHandler(ctx: TodoCtx) {
  const goalId = ctx.intParam('goal_id');
  if (!deleteGoalNode(goalId, ctx.userId)) throw new HttpError(404, 'Goal not found');
  return { status: 'deleted', id: goalId };
}

// ── AI breakdown ─────────────────────────────────────────────────────────────

/** POST /todo/goals/{goal_id}/dive-deeper — dive_deeper_goal_endpoint (3-5 sub-goals one level down). */
async function diveDeeperHandler(ctx: TodoCtx) {
  const goalId = ctx.intParam('goal_id');
  const settings = aiSettings(await jsonBody(ctx));

  const node = requireGoal(goalId, ctx.userId);
  const childLevel = nextLevelDown(node.level);
  const siblings = getGoalSiblingTitles(goalId, ctx.userId);

  const prompt = `You are a strategic life/work planner. Break this ${node.level} goal into 3-5 concrete ${childLevel} sub-goals that move it forward.

Goal (${node.level}): ${node.title}
Description: ${node.description || 'No description'}
Existing children already planned under this goal: ${siblings.length ? siblings.join(', ') : 'None'}

Generate NEW ${childLevel} sub-goals that complement (not repeat) the existing ones.
Return ONLY a valid JSON array:
[
  {"title": "Sub-goal title", "description": "Optional one-line description"}
]
No extra text, no markdown blocks, just raw JSON array.`;

  let subgoals: any[];
  try {
    const responseText = await callAi(prompt, settings);
    subgoals = extractJsonArray(responseText);
  } catch (err) {
    throw new HttpError(500, `AI Dive Deeper failed: ${errMsg(err)}`);
  }

  if (!subgoals.length) {
    throw new HttpError(
      422,
      "AI didn't return any sub-goals for this one — try adding more detail to its description and breaking it down again."
    );
  }

  const children = createGoalNodesBatch(goalId, ctx.userId, subgoals.slice(0, 5), 'dive_deeper', childLevel);
  return { children };
}

/** POST /todo/goals/{goal_id}/chunk — chunk_goal_endpoint (3-5 actionable daily steps). */
async function chunkGoalHandler(ctx: TodoCtx) {
  const goalId = ctx.intParam('goal_id');
  const settings = aiSettings(await jsonBody(ctx));

  const node = requireGoal(goalId, ctx.userId);

  const prompt = `You are a task breakdown expert. Convert this ${node.level} goal into 3-5 small, concrete, immediately-actionable daily steps.

Goal (${node.level}): ${node.title}
Description: ${node.description || 'No description'}

Each step should be specific and completable in a single day. Return ONLY a valid JSON array:
[
  {"title": "Action item title", "description": "Optional one-line description"}
]
No extra text.`;

  let steps: any[];
  try {
    const responseText = await callAi(prompt, settings);
    steps = extractJsonArray(responseText);
  } catch (err) {
    throw new HttpError(500, `AI Chunk failed: ${errMsg(err)}`);
  }

  if (!steps.length) {
    throw new HttpError(
      422,
      "AI couldn't find any actionable daily steps for this goal — try adding more detail to its description and chunking again."
    );
  }

  const children = createGoalNodesBatch(goalId, ctx.userId, steps.slice(0, 5), 'chunk', 'daily');
  return { children };
}

// ── Cross-module moves ───────────────────────────────────────────────────────

/** POST /todo/goals/{goal_id}/move-to-smart — move_goal_to_smart_endpoint. */
function moveToSmartHandler(ctx: TodoCtx) {
  const goalId = ctx.intParam('goal_id');
  const node = requireGoal(goalId, ctx.userId);
  const newTask = createTask(ctx.userId, node.title, {
    context: node.description || `From goal: ${node.title}`,
    priority: node.priority,
    due_date: node.due_date ?? null,
  });
  updateGoalNode(goalId, ctx.userId, { exported_to_smart_todo: 1, exported_task_id: newTask.id });
  return { status: 'exported', task: newTask };
}

/** POST /todo/goals/{goal_id}/move-to-quick — move_goal_to_quick_endpoint. */
function moveToQuickHandler(ctx: TodoCtx) {
  const goalId = ctx.intParam('goal_id');
  const node = requireGoal(goalId, ctx.userId);
  const qt = createQuickTask(ctx.userId, node.title, { task_date: todayIso(), source: 'moved_from_goal' });
  updateGoalNode(goalId, ctx.userId, { exported_to_quick: 1, exported_quick_task_id: qt.id });
  return { status: 'exported', quick_task: qt };
}

/** POST /todo/goals/{goal_id}/move-to-plan — move_goal_to_plan_endpoint. */
function moveToPlanHandler(ctx: TodoCtx) {
  const goalId = ctx.intParam('goal_id');
  const node = requireGoal(goalId, ctx.userId);
  const project = createProject(ctx.userId, node.title, {
    description: node.description || `Created from goal: ${node.title}`,
    priority: node.priority,
    due_date: node.due_date ?? null,
  });
  updateGoalNode(goalId, ctx.userId, { exported_to_plan: 1, exported_project_id: project.id });
  return { status: 'exported', project };
}

export const routes: TodoRoute[] = [
  { method: 'POST', path: '/goals', handler: createGoalHandler },
  { method: 'GET', path: '/goals/tree', handler: getGoalTreeHandler },
  { method: 'PATCH', path: '/goals/:goal_id', handler: updateGoalHandler },
  { method: 'DELETE', path: '/goals/:goal_id', handler: deleteGoalHandler },
  { method: 'POST', path: '/goals/:goal_id/dive-deeper', handler: diveDeeperHandler },
  { method: 'POST', path: '/goals/:goal_id/chunk', handler: chunkGoalHandler },
  { method: 'POST', path: '/goals/:goal_id/move-to-smart', handler: moveToSmartHandler },
  { method: 'POST', path: '/goals/:goal_id/move-to-quick', handler: moveToQuickHandler },
  { method: 'POST', path: '/goals/:goal_id/move-to-plan', handler: moveToPlanHandler },
];
