/**
 * fe-apis/todo/tasks/handlersPlanning.ts
 *
 * Second half of backend/modules/ai_todo/tasks/router.py (`/daily/plan` to the end of
 * the file): daily planning, brain dump, inbox, stats, bulk AI actions and the
 * cross-module moves. Keep in sync with the Python router.
 */

import { HttpError, aiSettings, callAi, extractJsonArray, todayIso, withTodoDb, type Row } from '../_shared';
import { errMsg, pyFloat, pyJsonDumps } from '../py';
import type { TodoCtx, TodoRoute } from '../router';
import {
  createDailyPlan,
  createInboxItem,
  createSubtasksBatch,
  createTask,
  deleteInboxItem,
  deleteTask,
  getAllTasks,
  getDailyPlan,
  getTask,
  getUnprocessedInboxItems,
  getUserStatsSummary,
  updateDailyPlanSummary,
  updateDailyPlanTasks,
  updateTask,
} from './db';
import { createQuickTask } from '../quick/db';
import { createProject, createProjectNode, getProject } from '../projects/db';

// ── Request validation (Pydantic models -> 422) ──────────────────────────────

function invalid(loc: string, msg: string): never {
  throw new HttpError(422, `${loc}: ${msg}`);
}

function isDict(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The JSON body as a Pydantic model sees it. `optional`: a `null` body means "all defaults". */
async function readBody(ctx: TodoCtx, optional = false): Promise<Row> {
  const body = await ctx.json<unknown>();
  if (optional && body === null) return {};
  if (!isDict(body)) invalid('body', 'Input should be a valid dictionary or object to extract fields from');
  return body;
}

function str(obj: Row, key: string, at = 'body', def?: string): string {
  const v = obj[key];
  if (v === undefined) {
    if (def !== undefined) return def;
    invalid(`${at}.${key}`, 'Field required');
  }
  if (typeof v !== 'string') invalid(`${at}.${key}`, 'Input should be a valid string');
  return v;
}

function optStr(obj: Row, key: string, at = 'body'): string | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') invalid(`${at}.${key}`, 'Input should be a valid string');
  return v;
}

function float(obj: Row, key: string, def?: number): number {
  const v = obj[key];
  if (v === undefined) {
    if (def !== undefined) return def;
    invalid(`body.${key}`, 'Field required');
  }
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  invalid(`body.${key}`, 'Input should be a valid number');
}

function toInt(v: unknown, loc: string): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return parseInt(v, 10);
  invalid(loc, 'Input should be a valid integer');
}

function int(obj: Row, key: string, at = 'body'): number {
  if (obj[key] === undefined) invalid(`${at}.${key}`, 'Field required');
  return toInt(obj[key], `${at}.${key}`);
}

function optInt(obj: Row, key: string, at = 'body'): number | null {
  const v = obj[key];
  return v === undefined || v === null ? null : toInt(v, `${at}.${key}`);
}

function intList(obj: Row, key: string): number[] {
  const v = obj[key];
  if (v === undefined) invalid(`body.${key}`, 'Field required');
  if (!Array.isArray(v)) invalid(`body.${key}`, 'Input should be a valid list');
  return v.map((x, i) => toInt(x, `body.${key}.${i}`));
}

function dict(obj: Row, key: string): Row {
  const v = obj[key];
  if (v === undefined) invalid(`body.${key}`, 'Field required');
  if (!isDict(v)) invalid(`body.${key}`, 'Input should be a valid dictionary');
  return v;
}

// ── Python-semantics helpers for AI output and prompt text ───────────────────

function pyTypeName(v: unknown): string {
  if (v === null || v === undefined) return 'NoneType';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'string') return 'str';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  return 'dict';
}

/** Python truthiness (empty list/dict are falsy). */
function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (isDict(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}

/** `x.get(...)` on a parsed-JSON value: AttributeError unless it's a dict. */
function asDict(v: unknown): Row {
  if (isDict(v)) return v;
  throw new Error(`'${pyTypeName(v)}' object has no attribute 'get'`);
}

/** `d.get(key, default)` — the default applies only when the key is absent. */
function pyGet(d: Row, key: string, def: unknown = null): any {
  return key in d ? d[key] : def;
}

/** Python `int(v)`. */
function pyInt(v: unknown): number {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^[+-]?\d+(_\d+)*$/.test(s)) return parseInt(s.replace(/_/g, ''), 10);
    throw new Error(`invalid literal for int() with base 10: '${v}'`);
  }
  throw new Error(`int() argument must be a string, a bytes-like object or a real number, not '${pyTypeName(v)}'`);
}

/** The inline `re.sub(fences) ... json.loads(text[start:end+1])` the Python endpoints use. */
function stripFences(raw: string): string {
  return raw.trim().replace(/```[a-z]*\n?/g, '').replace(/^`+|`+$/g, '').trim();
}

function loadsObjectSlice(raw: string): any {
  const text = stripFences(raw);
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

function pendingTasks(userId: number): Row[] {
  return getAllTasks(userId).filter((t) => t.status !== 'done');
}

function hydrateTasks(taskIds: unknown[], userId: number): Row[] {
  const out: Row[] = [];
  for (const tid of taskIds) {
    const t = getTask(tid as number, userId);
    if (t) out.push(t);
  }
  return out;
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  /** Port of `GET /todo/daily/plan`. */
  {
    method: 'GET',
    path: '/daily/plan',
    handler: (ctx) => {
      const plan = getDailyPlan(ctx.userId, todayIso());
      if (!plan) return { status: 'none', plan: null };
      plan.tasks = hydrateTasks(plan.task_ids, ctx.userId);
      return { status: 'active', plan };
    },
  },

  /** Port of `POST /todo/daily/kickstart`. */
  {
    method: 'POST',
    path: '/daily/kickstart',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const availableHours = float(body, 'available_hours');
      const settings = aiSettings(body);

      const pending = pendingTasks(ctx.userId);
      if (!pending.length) return { tasks: [], raw_ai_response: '' };

      let top20Count = 0;
      const taskList = pending.map((t) => {
        if (truthy(t.is_top_20)) top20Count += 1;
        return {
          id: t.id,
          title: t.title,
          priority: t.priority,
          due_date: t.due_date || 'none',
          time_estimate: t.time_estimate || 'none',
          intention: t.intention || 'none',
          definition_of_done: t.definition_of_done || 'none',
          is_top_20: truthy(t.is_top_20),
        };
      });
      const taskListStr = pyJsonDumps(taskList, 2);

      const top20Note = top20Count
        ? `\nIMPORTANT: ${top20Count} tasks are marked is_top_20=true — these are the highest-leverage ` +
          'Pareto tasks. Always select these FIRST, before any other task, even if it means fewer total ' +
          'tasks fit the available time. If only 1-2 tasks can fit, they must be the is_top_20 ones with ' +
          'the strongest fit.\n'
        : '';

      const hours = pyFloat(availableHours);
      const prompt = `You are a productivity coach. The user has ${hours} hours today.
Here are their pending tasks with priorities, due dates, time estimates, intentions, and definition of done criteria:
${taskListStr}
${top20Note}
Select 3-5 tasks that best fit their available time of ${hours} hours. Prioritize overdue tasks, high priority (p1/p2) tasks, and tasks with imminent due dates.
Return ONLY a valid JSON array:
[
  {"task_id": 123, "reason": "Reason for selecting this task in one short line."}
]
No extra text, no markdown block, just raw JSON array.`;

      let subtasksData: any[];
      try {
        subtasksData = extractJsonArray(await callAi(prompt, settings));
      } catch (err) {
        throw new HttpError(500, `AI Daily Kickstart failed: ${errMsg(err)}`);
      }

      const suggestions: { task: Row; reason: unknown }[] = [];
      const pendingMap = new Map<unknown, Row>(pending.map((t) => [t.id, t]));
      for (const raw of subtasksData) {
        const item = asDict(raw);
        const tid = pyGet(item, 'task_id');
        if (pendingMap.has(tid)) {
          suggestions.push({ task: pendingMap.get(tid)!, reason: pyGet(item, 'reason', 'Curated for your day.') });
        }
      }

      // Guarantee top-20 bias regardless of AI compliance: pin any top-20 suggestions first.
      suggestions.sort((a, b) => (truthy(a.task.is_top_20) ? 0 : 1) - (truthy(b.task.is_top_20) ? 0 : 1));

      const suggestedIds = new Set(suggestions.map((s) => s.task.id));
      const alternatives = pending.filter((t) => !suggestedIds.has(t.id));

      return { suggestions, alternatives };
    },
  },

  /** Port of `POST /todo/daily/plan`. */
  {
    method: 'POST',
    path: '/daily/plan',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const availableHours = float(body, 'available_hours');
      const taskIds = intList(body, 'task_ids');
      const reasoning = dict(body, 'reasoning');
      const plan = createDailyPlan(ctx.userId, todayIso(), availableHours, taskIds, reasoning);
      plan.tasks = hydrateTasks(plan.task_ids, ctx.userId);
      return plan;
    },
  },

  /** Port of `POST /todo/daily/end`. */
  {
    method: 'POST',
    path: '/daily/end',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const completedTaskIds = intList(body, 'completed_task_ids');
      const incompleteReschedule = dict(body, 'incomplete_reschedule');
      const settings = aiSettings(body);
      const userId = ctx.userId;
      const todayStr = todayIso();

      // 1. Update due dates for rescheduled tasks
      for (const [tidStr, action] of Object.entries(incompleteReschedule)) {
        try {
          const tid = pyInt(tidStr);
          if (action === 'tomorrow') updateTask(tid, userId, { due_date: todayIso(1) });
          else if (action === 'next_week') updateTask(tid, userId, { due_date: todayIso(7) });
        } catch {
          // ignored, like Python's bare except
        }
      }

      // 2. Get task titles for Completed vs Incomplete
      const completedTitles: string[] = [];
      const incompleteTitles: string[] = [];
      let top20IncompleteCount = 0;
      for (const cid of completedTaskIds) {
        const t = getTask(cid, userId);
        if (t) completedTitles.push(t.title);
      }
      for (const iidStr of Object.keys(incompleteReschedule)) {
        try {
          const t = getTask(pyInt(iidStr), userId);
          if (t) {
            incompleteTitles.push(t.title);
            if (truthy(t.is_top_20)) top20IncompleteCount += 1;
          }
        } catch {
          // ignored, like Python's bare except
        }
      }

      const top20Warning = top20IncompleteCount
        ? `⚠️ ${top20IncompleteCount} high-leverage task${top20IncompleteCount !== 1 ? 's' : ''} ` +
          'still incomplete — prioritize these tomorrow'
        : null;

      const prompt = `You are a productivity coach. The user is finishing their work day.
They completed the following tasks today:
${completedTitles.length ? completedTitles.join(', ') : 'None'}

They did not complete these planned tasks:
${incompleteTitles.length ? incompleteTitles.join(', ') : 'None'}

Generate a short (1-2 sentences), highly encouraging and positive summary of their day. Keep it positive and motivating.`;

      let encouragement: string;
      try {
        encouragement = await callAi(prompt, settings);
      } catch {
        encouragement = `Great work completing ${completedTitles.length} tasks today. Tomorrow is a new start!`;
      }

      // 3. Save AI Day Summary
      updateDailyPlanSummary(userId, todayStr, encouragement.trim());

      // 4. Remove rescheduled/removed tasks from today's daily_plan task list
      const plan = getDailyPlan(userId, todayStr);
      if (plan) {
        const remSet = new Set(Object.keys(incompleteReschedule).map(pyInt));
        const newTaskIds = (plan.task_ids as number[]).filter((tid) => !remSet.has(tid));
        updateDailyPlanTasks(userId, todayStr, newTaskIds);
      }

      return {
        summary: encouragement.trim(),
        completed_count: completedTitles.length,
        incomplete_count: incompleteTitles.length,
        top20_incomplete_count: top20IncompleteCount,
        top20_warning: top20Warning,
      };
    },
  },

  /** Port of `POST /todo/brain-dump`. */
  {
    method: 'POST',
    path: '/brain-dump',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const text = str(body, 'text');
      const prompt = `You are a productivity coach. Parse the following messy text dump into structured tasks:
"${text}"

Identify individual tasks, priorities (p1-p4, where p1 is highest), time estimates (e.g. 30m, 2h, 4h), short context, and hierarchical relationships.
If a task is a subtask or detail of another task in the list, set parent_temp_id to the temp_id of that parent task.

Return ONLY a valid JSON array:
[
  {
    "temp_id": 1,
    "parent_temp_id": null,
    "title": "Task title",
    "priority": "p1|p2|p3|p4",
    "time_estimate": "30m|1h|2h",
    "context": "Context detail"
  }
]
No extra text, no markdown blocks, just raw JSON array.`;

      let tasksData: any[];
      try {
        tasksData = extractJsonArray(await callAi(prompt, aiSettings(body)));
      } catch (err) {
        throw new HttpError(500, `AI Brain Dump failed: ${errMsg(err)}`);
      }
      return { tasks: tasksData };
    },
  },

  /** Port of `POST /todo/tasks/bulk` — saves the tree topologically (parents before children). */
  {
    method: 'POST',
    path: '/tasks/bulk',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      if (body.tasks === undefined) invalid('body.tasks', 'Field required');
      if (!Array.isArray(body.tasks)) invalid('body.tasks', 'Input should be a valid list');
      const tasks = (body.tasks as unknown[]).map((raw, i) => {
        const at = `body.tasks.${i}`;
        if (!isDict(raw)) invalid(at, 'Input should be a valid dictionary or object to extract fields from');
        return {
          temp_id: int(raw, 'temp_id', at),
          parent_temp_id: optInt(raw, 'parent_temp_id', at),
          title: str(raw, 'title', at),
          priority: str(raw, 'priority', at, 'p3'),
          time_estimate: optStr(raw, 'time_estimate', at),
          context: optStr(raw, 'context', at),
        };
      });

      const userId = ctx.userId;
      const tempToDb = new Map<number, number>();
      const unprocessed = [...tasks];
      const maxLoops = unprocessed.length * 3;
      let loops = 0;

      while (unprocessed.length && loops < maxLoops) {
        loops += 1;
        const current = unprocessed.shift()!;
        const fields = { priority: current.priority, time_estimate: current.time_estimate, context: current.context };
        if (current.parent_temp_id === null) {
          const dbTask = createTask(userId, current.title, fields);
          tempToDb.set(current.temp_id, dbTask.id);
        } else if (tempToDb.has(current.parent_temp_id)) {
          const dbTask = createTask(userId, current.title, { ...fields, parent_id: tempToDb.get(current.parent_temp_id) });
          tempToDb.set(current.temp_id, dbTask.id);
        } else {
          unprocessed.push(current);
        }
      }

      // Backup for disconnected nodes
      for (const current of unprocessed) {
        createTask(userId, current.title, {
          priority: current.priority,
          time_estimate: current.time_estimate,
          context: current.context,
        });
      }

      return { status: 'success', count: tasks.length };
    },
  },

  /** Port of `POST /todo/inbox`. */
  {
    method: 'POST',
    path: '/inbox',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      return createInboxItem(ctx.userId, str(body, 'content').trim());
    },
  },

  /** Port of `GET /todo/inbox`. */
  {
    method: 'GET',
    path: '/inbox',
    handler: (ctx) => getUnprocessedInboxItems(ctx.userId),
  },

  /** Port of `DELETE /todo/inbox/{inbox_id}`. */
  {
    method: 'DELETE',
    path: '/inbox/:inbox_id',
    handler: (ctx) => {
      const inboxId = ctx.intParam('inbox_id');
      if (!deleteInboxItem(inboxId, ctx.userId)) throw new HttpError(404, 'Inbox item not found');
      return { status: 'deleted', id: inboxId };
    },
  },

  /** Port of `GET /todo/stats`. */
  {
    method: 'GET',
    path: '/stats',
    handler: (ctx) => getUserStatsSummary(ctx.userId),
  },

  /** Port of `POST /todo/tasks/eisenhower-auto` — AI assigns Eisenhower quadrants to all non-done tasks. */
  {
    method: 'POST',
    path: '/tasks/eisenhower-auto',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const userId = ctx.userId;
      const pending = pendingTasks(userId);
      if (!pending.length) return { assignments: [] };

      const taskJson = pyJsonDumps(
        pending.slice(0, 30).map((t) => ({
          task_id: t.id,
          title: t.title,
          priority: t.priority,
          due_date: t.due_date || 'none',
          status: t.status,
          intention: t.intention || 'none',
          is_top_20: truthy(t.is_top_20),
        })),
        2
      );

      const prompt = `You are a productivity expert using the Eisenhower Matrix.
Categorize each task into one of 4 quadrants:
- do_now: Urgent + Important
- schedule: Not Urgent + Important
- delegate: Urgent + Not Important
- eliminate: Not Urgent + Not Important

Consider priority level (p1 is highest), due dates, status, and intention.

RULE: Any task with is_top_20=true is a Pareto high-leverage task — weight it toward
"do_now" unless it is clearly not urgent, in which case use "schedule". Never place a
is_top_20=true task in "delegate" or "eliminate".

Tasks:
${taskJson}

Return ONLY a valid JSON array:
[
  {"task_id": 1, "quadrant": "do_now"}
]
No extra text.`;

      let assignments: any[];
      try {
        assignments = extractJsonArray(await callAi(prompt, aiSettings(body)));
      } catch (err) {
        throw new HttpError(500, `AI Eisenhower sort failed: ${errMsg(err)}`);
      }

      // Apply updates (one commit, like Python)
      withTodoDb((db) =>
        db.transaction(() => {
          for (const raw of assignments) {
            const a = asDict(raw);
            const taskIdVal = pyGet(a, 'task_id');
            const quadrantVal = pyGet(a, 'quadrant');
            if (truthy(taskIdVal) && truthy(quadrantVal)) {
              db.run(
                'UPDATE tasks SET eisenhower_quadrant = ? WHERE id = ? AND user_id = ?',
                quadrantVal,
                taskIdVal,
                userId
              );
            }
          }
        })
      );

      return { assignments };
    },
  },

  /** Port of `POST /todo/tasks/ai-weekly-plan` — AI generates a structured Mon-Fri weekly plan. */
  {
    method: 'POST',
    path: '/tasks/ai-weekly-plan',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const pending = pendingTasks(ctx.userId);
      if (!pending.length) return { weekly_plan: {} };

      const top20ById = new Set<unknown>(pending.filter((t) => truthy(t.is_top_20)).map((t) => t.id));

      const taskJson = pyJsonDumps(
        pending.slice(0, 25).map((t) => ({
          task_id: t.id,
          title: t.title,
          priority: t.priority,
          time_estimate: t.time_estimate || 'unknown',
          due_date: t.due_date || 'none',
          status: t.status,
          is_top_20: truthy(t.is_top_20),
        })),
        2
      );

      const top20Note = top20ById.size
        ? `\nIMPORTANT: ${top20ById.size} tasks are marked is_top_20=true — these are the ` +
          'highest-leverage Pareto tasks. Pin each of them to the EARLIEST available slot in ' +
          'whichever day you place them, before any other task that day.\n'
        : '';

      const prompt = `You are a productivity coach. Create a structured weekly execution plan (Monday through Friday).
Distribute these tasks across the 5 weekdays, considering priority, due dates, and estimated time.
Aim for 3-5 hours of focused work per day.
${top20Note}
Tasks:
${taskJson}

Return ONLY a valid JSON object (not an array):
{
  "monday": [{"task_id": 1, "title": "...", "allocated_time": "1h"}],
  "tuesday": [...],
  "wednesday": [...],
  "thursday": [...],
  "friday": [...]
}
No extra text.`;

      let weeklyPlan: Row;
      try {
        const text = stripFences(await callAi(prompt, aiSettings(body)));
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error('No JSON object found');
        weeklyPlan = JSON.parse(text.slice(start, end + 1));
      } catch (err) {
        throw new HttpError(500, `AI Weekly Plan failed: ${errMsg(err)}`);
      }

      // Guarantee top-20 pinning regardless of AI compliance: annotate is_top_20 and
      // move any top-20 tasks to the front of whichever day they landed on.
      const rank = (dt: unknown) => (isDict(dt) && truthy(dt.is_top_20) ? 0 : 1);
      for (const [day, dayTasks] of Object.entries(weeklyPlan)) {
        if (!Array.isArray(dayTasks)) continue;
        for (const dt of dayTasks) {
          if (isDict(dt) && top20ById.has(pyGet(dt, 'task_id'))) dt.is_top_20 = true;
        }
        weeklyPlan[day] = [...dayTasks].sort((a, b) => rank(a) - rank(b));
      }

      return { weekly_plan: weeklyPlan };
    },
  },

  /** Port of `POST /todo/tasks/{task_id}/move-to-quick` — a real move: the Smart To-Do task is deleted. */
  {
    method: 'POST',
    path: '/tasks/:task_id/move-to-quick',
    handler: (ctx) => {
      const taskId = ctx.intParam('task_id');
      const task = getTask(taskId, ctx.userId);
      if (!task) throw new HttpError(404, 'Task not found');
      const qt = createQuickTask(ctx.userId, task.title, {
        task_date: todayIso(),
        source: 'moved_from_smart',
        original_task_id: taskId,
      });
      deleteTask(taskId, ctx.userId);
      return { status: 'moved', quick_task: qt };
    },
  },

  /**
   * Port of `POST /todo/tasks/{task_id}/move-to-plan` — into an existing project
   * (body.project_id) or a new one; a real move: the Smart To-Do task is deleted.
   */
  {
    method: 'POST',
    path: '/tasks/:task_id/move-to-plan',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const projectId = optInt(await readBody(ctx, true), 'project_id');
      const userId = ctx.userId;
      const task = getTask(taskId, userId);
      if (!task) throw new HttpError(404, 'Task not found');

      if (projectId !== null) {
        const project = getProject(projectId, userId);
        if (!project) throw new HttpError(404, 'Project not found');
        const node = createProjectNode(projectId, userId, task.title, { node_type: 'action' });
        deleteTask(taskId, userId);
        return { status: 'moved', project, node };
      }

      const project = createProject(userId, task.title, {
        description: task.context || `Created from task: ${task.title}`,
        priority: task.priority,
      });
      deleteTask(taskId, userId);
      return { status: 'moved', project };
    },
  },

  /** Port of `POST /todo/ai/parse-task` — NLP task string to fields; regex fallback when the AI fails. */
  {
    method: 'POST',
    path: '/ai/parse-task',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const rawText = str(body, 'raw_text');

      const prompt = `You are an AI task assistant. Parse this natural language task input into JSON fields.
Today's date is: ${todayIso()}
Tomorrow's date is: ${todayIso(1)}

User Input: "${rawText}"

Extract the following JSON fields:
- "title": Clean task title without hashtags or dates
- "priority": "p1" (critical/urgent), "p2" (high), "p3" (medium), or "p4" (low). Infer from #p1, #p2, "urgent", or importance. Default "p3".
- "due_date": YYYY-MM-DD format if date/time specified, or null
- "time_estimate": Estimated duration string (e.g. "30m", "1h", "2h"), or null
- "intention": Short 1-sentence motivation, or null
- "context": Extra context notes if present, or null

Return ONLY a valid JSON object matching the schema above.`;

      try {
        return loadsObjectSlice(await callAi(prompt, aiSettings(body)));
      } catch {
        const pMatch = /#p([1-4])/i.exec(rawText);
        return {
          title: rawText.replace(/#p[1-4]/g, '').trim(),
          priority: pMatch ? `p${pMatch[1]}` : 'p3',
          due_date: null,
          time_estimate: null,
          intention: null,
          context: null,
        };
      }
    },
  },

  /** Port of `POST /todo/ai/prioritize-all` — AI priority/quadrant/Pareto sweep over active tasks. */
  {
    method: 'POST',
    path: '/ai/prioritize-all',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const userId = ctx.userId;
      const activeTasks = pendingTasks(userId);
      if (!activeTasks.length) return { updated: 0, message: 'No active tasks to prioritize' };

      const tasksSummary = activeTasks.map((t) => ({
        id: t.id,
        title: t.title,
        current_priority: t.priority,
        due_date: t.due_date ?? null,
      }));

      const prompt = `You are a Pareto 80/20 productivity master. Evaluate these tasks and return a JSON array.

Tasks:
${pyJsonDumps(tasksSummary, 2)}

For each task item, assign:
- "id": number
- "priority": "p1" | "p2" | "p3" | "p4"
- "eisenhower_quadrant": "q1_do" | "q2_schedule" | "q3_delegate" | "q4_eliminate"
- "pareto_score": integer 0-100 (where >80 represents top 20% highest leverage tasks)
- "is_top_20": boolean (true if pareto_score >= 80)

Return ONLY a valid JSON array of objects with the exact schema above.`;

      try {
        const evaluations = extractJsonArray(await callAi(prompt, aiSettings(body)));
        let updatedCount = 0;
        for (const raw of evaluations) {
          const item = asDict(raw);
          const tId = pyGet(item, 'id');
          if (truthy(tId)) {
            const fields: Row = { priority: pyGet(item, 'priority', 'p3') };
            if (item.eisenhower_quadrant !== undefined && item.eisenhower_quadrant !== null) {
              fields.eisenhower_quadrant = item.eisenhower_quadrant;
            }
            if (item.pareto_score !== undefined && item.pareto_score !== null) fields.pareto_score = item.pareto_score;
            if ('is_top_20' in item) fields.is_top_20 = truthy(item.is_top_20) ? 1 : 0;
            updateTask(pyInt(tId), userId, fields);
            updatedCount += 1;
          }
        }
        return { updated: updatedCount, evaluations };
      } catch (err) {
        throw new HttpError(500, `AI Auto-Prioritization failed: ${errMsg(err)}`);
      }
    },
  },

  /** Port of `POST /todo/tasks/{task_id}/generate-dod` — AI Definition of Done + initial subtasks. */
  {
    method: 'POST',
    path: '/tasks/:task_id/generate-dod',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const body = await readBody(ctx);
      const userId = ctx.userId;
      const task = getTask(taskId, userId);
      if (!task) throw new HttpError(404, 'Task not found');

      const prompt = `You are an elite software project manager.
For the task: "${task.title}" (Context: ${task.context || 'N/A'})

Generate:
1. "definition_of_done": Clear, 3-4 bullet point testable criteria string for when this task is 100% complete.
2. "subtasks": Array of 3-5 specific actionable subtask objects to complete it.
   Each subtask object format: {"title": "...", "priority": "p2"|"p3", "time_estimate": "30m"|"1h"}

Return ONLY a valid JSON object matching:
{
  "definition_of_done": "1. ...\n2. ...\n3. ...",
  "subtasks": [
    {"title": "...", "priority": "p2", "time_estimate": "30m"}
  ]
}`;

      try {
        const data = asDict(loadsObjectSlice(await callAi(prompt, aiSettings(body))));
        const dod = pyGet(data, 'definition_of_done', '');
        const subtasksData = pyGet(data, 'subtasks', []);

        updateTask(taskId, userId, { definition_of_done: dod });

        let createdSubtasks: Row[] = [];
        if (truthy(subtasksData)) {
          if (!Array.isArray(subtasksData)) throw new Error(`'${pyTypeName(subtasksData)}' object is not iterable`);
          const stPayloads = subtasksData.map((st: unknown) => {
            if (!isDict(st)) throw new Error(`'${pyTypeName(st)}' object is not subscriptable`);
            if (!('title' in st)) throw new Error("'title'");
            return {
              title: st.title,
              priority: pyGet(st, 'priority', 'p3'),
              time_estimate: pyGet(st, 'time_estimate', '30m'),
            };
          });
          createdSubtasks = createSubtasksBatch(taskId, userId, stPayloads as Record<string, string>[], 'chunk');
        }

        return { task_id: taskId, definition_of_done: dod, created_subtasks: createdSubtasks };
      } catch (err) {
        throw new HttpError(500, `AI DoD & Subtask Generation failed: ${errMsg(err)}`);
      }
    },
  },

  /** Port of `POST /todo/ai/smart-schedule` — energy-aware time-blocked schedule for today. */
  {
    method: 'POST',
    path: '/ai/smart-schedule',
    handler: async (ctx) => {
      const body = await readBody(ctx);
      const availableHours = float(body, 'available_hours', 6.0);
      const energyLevel = str(body, 'energy_level', 'body', 'medium');
      const activeTasks = pendingTasks(ctx.userId);

      const taskJson = pyJsonDumps(
        activeTasks.slice(0, 15).map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          time_estimate: t.time_estimate ?? null,
        })),
        2
      );

      const prompt = `You are an executive productivity coach.
User Profile:
- Available Focus Hours Today: ${pyFloat(availableHours)} hours
- Energy Level: ${energyLevel.toUpperCase()}

Active Tasks:
${taskJson}

Create an optimal daily schedule block array.
Schema:
{
  "schedule": [
    {
      "time_slot": "9:00 AM - 10:30 AM",
      "task_id": number or null,
      "task_title": "...",
      "focus_type": "Deep Work" | "Quick Win" | "Break" | "Admin",
      "rationale": "Why this task now based on energy level"
    }
  ],
  "top_advice": "One key tip for executing today's plan"
}

Return ONLY a valid JSON object matching the schema above.`;

      try {
        return loadsObjectSlice(await callAi(prompt, aiSettings(body)));
      } catch (err) {
        throw new HttpError(500, `AI Smart Schedule failed: ${errMsg(err)}`);
      }
    },
  },
];
