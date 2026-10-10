/**
 * fe-apis/todo/quick/handlers.ts
 *
 * Port of backend/modules/ai_todo/quick/router.py (Quick Daily, mounted at /todo/quick-tasks).
 * Keep prompts, status codes and response shapes in sync with the Python router.
 */

import {
  HttpError,
  aiSettings,
  callAi,
  callAiVision,
  extractJsonArray,
  imageMimeType,
  todayIso,
  type Row,
} from '../_shared';
import { errMsg, pyFloat, pyJsonDumps } from '../py';
import type { TodoCtx, TodoRoute } from '../router';
import {
  archiveCompletedQuickTasks,
  bulkUpdateQuadrants,
  countIncompleteTop20,
  createQuickTask,
  deleteQuickTask,
  getQuickTask,
  getQuickTasksForDate,
  markQuickTaskExported,
  moveQuickTasksToTomorrow,
  updateQuickTask,
} from './db';
import { createTask, getAllTasks } from '../tasks/db';
import { createProject } from '../projects/db';

// ── Request-body validation (Pydantic stand-in) ──────────────────────────────

type Kind = 'str' | 'int' | 'float' | 'bool' | 'intList' | 'objList';

const TRUE_STRINGS = new Set(['1', 'on', 't', 'true', 'y', 'yes']);
const FALSE_STRINGS = new Set(['0', 'off', 'f', 'false', 'n', 'no']);

function invalid(key: string, expected: string): HttpError {
  return new HttpError(422, `Invalid value for '${key}': expected ${expected}`);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function coerce(kind: Kind, key: string, v: unknown): unknown {
  switch (kind) {
    case 'str':
      if (typeof v === 'string') return v;
      throw invalid(key, 'a string');
    case 'int': {
      const n = toNumber(v);
      if (n !== null && Number.isInteger(n)) return n;
      throw invalid(key, 'an integer');
    }
    case 'float': {
      const n = toNumber(v);
      if (n !== null) return n;
      throw invalid(key, 'a number');
    }
    case 'bool':
      if (typeof v === 'boolean') return v;
      if (v === 0 || v === 1) return v === 1;
      if (typeof v === 'string' && TRUE_STRINGS.has(v.toLowerCase())) return true;
      if (typeof v === 'string' && FALSE_STRINGS.has(v.toLowerCase())) return false;
      throw invalid(key, 'a boolean');
    case 'intList':
      if (!Array.isArray(v)) throw invalid(key, 'a list');
      return v.map((item) => coerce('int', key, item));
    case 'objList':
      if (!Array.isArray(v)) throw invalid(key, 'a list');
      if (v.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw invalid(key, 'a list of objects');
      }
      return v;
  }
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

// ── Python-compat formatting ─────────────────────────────────────────────────

/** Python `str.strip()[:n]` / `len()` count code points, not UTF-16 units. */
function codePoints(s: string): string[] {
  return Array.from(s);
}

// ── Brain dump prompts / limits ──────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

const BRAIN_DUMP_EXTRACT_PROMPT = `This is a handwritten brain dump — a person's unfiltered thoughts, tasks, and ideas.
Please:
1. Transcribe ALL handwritten text accurately, preserving lists and structure
2. Fix obvious misspellings but keep all abbreviations the person used
3. If multiple items are written, keep them clearly separated
Return the raw transcribed text only. No commentary. No markdown.`;

function brainDumpParsePrompt(today: string, text: string): string {
  return `You are a productivity coach parsing a handwritten brain dump into today's task list.
Today: ${today}

Extracted handwriting text:
---
${text}
---

Convert every distinct task, action item, or intention into a structured quick task.
Ignore pure observations, feelings, or reflections that aren't actionable.

For each actionable item return:
- "title": Clean, actionable task title starting with a verb (max 60 chars)
- "quadrant": One of:
    "do_now"   (urgent + important — do today)
    "schedule" (important, not urgent — plan for later)
    "delegate" (urgent, not important — can be delegated)
    "eliminate"(neither — consider dropping)
- "time_estimate": "15m" | "30m" | "1h" | "2h" | null
- "context": Short additional note extracted from the writing, or null

Return ONLY a valid JSON array. No prose:
[
  {
    "title": "Email project update to client",
    "quadrant": "do_now",
    "time_estimate": "15m",
    "context": "Mention the delay on feature X"
  }
]`;
}

/** `Path(name).suffix.lower()`. */
function fileSuffix(filename: string): string {
  const name = filename.split('/').pop() ?? '';
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i).toLowerCase() : '';
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** POST /todo/quick-tasks — create_quick_task_endpoint. */
async function createQuickTaskHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const title = field(body, 'title', 'str', { required: true });
  const opts = {
    quadrant: field(body, 'quadrant', 'str', { default: 'do_now' }),
    source: field(body, 'source', 'str', { default: 'manual' }),
    original_task_id: field(body, 'original_task_id', 'int', { nullable: true }),
    order_index: field(body, 'order_index', 'int', { default: 0 }),
    due_date: field(body, 'due_date', 'str', { nullable: true }),
    time_estimate: field(body, 'time_estimate', 'str', { nullable: true }),
  };
  return createQuickTask(ctx.userId, title, { task_date: todayIso(), ...opts });
}

/** GET /todo/quick-tasks/today — get_today_tasks_endpoint. */
function getTodayTasksHandler(ctx: TodoCtx) {
  return getQuickTasksForDate(ctx.userId, todayIso());
}

const QUICK_TASK_UPDATE_FIELDS: [string, Kind][] = [
  ['title', 'str'],
  ['done', 'int'],
  ['quadrant', 'str'],
  ['order_index', 'int'],
  ['is_top_20', 'bool'],
  ['pareto_score', 'float'],
  ['pareto_reason', 'str'],
  ['due_date', 'str'],
  ['time_estimate', 'str'],
  ['context', 'str'],
];

/** PATCH /todo/quick-tasks/{task_id} — update_quick_task_endpoint. */
async function updateQuickTaskHandler(ctx: TodoCtx) {
  const taskId = ctx.intParam('task_id');
  const body = await jsonBody(ctx);
  // model_dump(exclude_none=True): only known fields with a non-null value.
  const updates: Row = {};
  for (const [key, kind] of QUICK_TASK_UPDATE_FIELDS) {
    const value = field(body, key, kind, { nullable: true });
    if (value !== null) updates[key] = value;
  }
  if ('is_top_20' in updates) {
    // Human toggle via the Pareto modal — lock so bulk /pareto/analyze won't overwrite it.
    updates.pareto_locked = 1;
  }
  const task = updateQuickTask(taskId, ctx.userId, updates);
  if (!task) throw new HttpError(404, 'Quick task not found');
  return task;
}

/** DELETE /todo/quick-tasks/{task_id} — delete_quick_task_endpoint. */
function deleteQuickTaskHandler(ctx: TodoCtx) {
  const taskId = ctx.intParam('task_id');
  if (!deleteQuickTask(taskId, ctx.userId)) throw new HttpError(404, 'Quick task not found');
  return { status: 'deleted', id: taskId };
}

// ── Moves (non-destructive: the quick_tasks row is kept, marked is_exported) ──

/** POST /todo/quick-tasks/{task_id}/move-to-smart — move_to_smart_endpoint. */
function moveToSmartHandler(ctx: TodoCtx) {
  const taskId = ctx.intParam('task_id');
  const qt = getQuickTask(taskId, ctx.userId);
  if (!qt) throw new HttpError(404, 'Quick task not found');
  const newTask = createTask(ctx.userId, qt.title, { context: `Moved from Quick Daily (${qt.date})` });
  markQuickTaskExported(taskId, ctx.userId, { exported_task_id: newTask.id });
  return { status: 'moved', new_task_id: newTask.id, task: newTask };
}

/** POST /todo/quick-tasks/{task_id}/move-to-plan — move_to_plan_endpoint. */
function moveToPlanHandler(ctx: TodoCtx) {
  const taskId = ctx.intParam('task_id');
  const qt = getQuickTask(taskId, ctx.userId);
  if (!qt) throw new HttpError(404, 'Quick task not found');
  const project = createProject(ctx.userId, qt.title, {
    description: `Created from Quick Daily task (${qt.date})`,
  });
  markQuickTaskExported(taskId, ctx.userId, { exported_project_id: project.id });
  return { status: 'moved', project_id: project.id, project };
}

// ── Brain dump ───────────────────────────────────────────────────────────────

/**
 * POST /todo/quick-tasks/brain-dump-upload — brain_dump_upload_endpoint.
 * The FastAPI backend ships without pdf2image and pillow-heif, so .pdf and .heic fail
 * there with the errors below; this port returns the same ones. Other images go to the
 * vision model as uploaded (no Pillow JPEG re-encode).
 */
async function brainDumpUploadHandler(ctx: TodoCtx) {
  let form: FormData;
  try {
    form = await ctx.formData();
  } catch {
    throw new HttpError(422, 'Field required: file');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new HttpError(422, 'Field required: file');
  if (!file.name) throw new HttpError(400, 'No file provided');

  const ext = fileSuffix(file.name);
  if (!IMAGE_EXTENSIONS.has(ext) && ext !== '.pdf') {
    throw new HttpError(
      400,
      `Unsupported file '${ext}'. Upload a photo (.jpg, .png, .webp, .heic) or PDF scan.`
    );
  }

  const content = Buffer.from(await file.arrayBuffer());
  if (content.length > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, `File too large. Max size is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`);
  }

  // FastAPI swaps an empty form value for the Form() default.
  const formStr = (key: string, dflt: string) => {
    const v = form.get(key);
    return typeof v === 'string' && v !== '' ? v : dflt;
  };
  const settings = aiSettings({
    model: formStr('model', ''),
    geminiKey: formStr('geminiKey', ''),
    deepseekKey: formStr('deepseekKey', ''),
    groqKey: formStr('groqKey', ''),
    openaiKey: formStr('openaiKey', ''),
    anthropicKey: formStr('anthropicKey', ''),
    ollamaUrl: formStr('ollamaUrl', 'http://localhost:11434'),
    ollamaModel: formStr('ollamaModel', 'llama3.2'),
  });

  const todayStr = todayIso();
  let extractedText: string;

  if (ext === '.pdf') {
    throw new HttpError(500, 'pdf2image not installed. Run: pip install pdf2image');
  }
  if (ext === '.heic') {
    throw new HttpError(400, 'Failed to convert HEIC image. Ensure pillow-heif is installed.');
  }
  try {
    extractedText = await callAiVision(content.toString('base64'), BRAIN_DUMP_EXTRACT_PROMPT, settings, imageMimeType(ext));
  } catch (err) {
    throw new HttpError(500, `Vision AI failed to read the image. Try a clearer photo. Error: ${errMsg(err)}`);
  }

  const stripped = (extractedText || '').trim();
  if (!extractedText || codePoints(stripped).length < 5) {
    return {
      extracted_text: '',
      parsed_tasks: [],
      count: 0,
      warning: 'No text detected in this image. Please try a clearer, well-lit photo.',
    };
  }

  // Guard against very long extractions.
  const parsePrompt = brainDumpParsePrompt(todayStr, codePoints(stripped).slice(0, 3000).join(''));

  let parsedTasks: any[];
  try {
    const parseResponse = await callAi(parsePrompt, settings);
    parsedTasks = extractJsonArray(parseResponse);
  } catch (err) {
    // If parsing fails, still return the extracted text so the user isn't stuck.
    return {
      extracted_text: stripped,
      parsed_tasks: [],
      count: 0,
      warning: `Text extracted but task parsing failed: ${errMsg(err)}. You can manually add tasks.`,
    };
  }

  return { extracted_text: stripped, parsed_tasks: parsedTasks, count: parsedTasks.length };
}

/** POST /todo/quick-tasks/bulk-create — bulk_create_quick_tasks_endpoint. */
async function bulkCreateHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const tasks: Row[] = field(body, 'tasks', 'objList', { required: true });
  const todayStr = todayIso();
  // dict.get(key, default): the default only applies when the key is absent.
  const get = (t: Row, key: string, dflt: unknown) => (key in t ? t[key] : dflt);
  const created: Row[] = [];
  for (const t of tasks) {
    created.push(
      createQuickTask(ctx.userId, get(t, 'title', 'Unnamed task') as string, {
        task_date: todayStr,
        quadrant: get(t, 'quadrant', 'do_now') as string,
        source: 'brain_dump',
      })
    );
  }
  return { created, count: created.length };
}

// ── AI ───────────────────────────────────────────────────────────────────────

/** POST /todo/quick-tasks/ai-day-plan — ai_day_plan_endpoint (Top 20% tasks always first). */
async function aiDayPlanHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const availableHours: number = field(body, 'available_hours', 'float', { default: 4.0 });
  const settings = aiSettings(body);

  const quickTasks = getQuickTasksForDate(ctx.userId, todayIso());
  const allSmart = getAllTasks(ctx.userId);
  const smartUrgent = allSmart.filter((t) => t.status !== 'done' && ['p1', 'p2'].includes(t.priority));

  const top20: Row[] = [];
  const regular: Row[] = [];

  for (const qt of quickTasks) {
    if (qt.done || qt.is_exported) continue;
    const entry = {
      task_id: qt.id,
      source: 'quick',
      title: qt.title,
      quadrant: qt.quadrant,
      is_top_20: Boolean(qt.is_top_20),
    };
    (qt.is_top_20 ? top20 : regular).push(entry);
  }

  for (const st of smartUrgent.slice(0, 10)) {
    const entry = {
      task_id: st.id,
      source: 'smart',
      title: st.title,
      priority: st.priority,
      time_estimate: st.time_estimate || 'unknown',
      is_top_20: Boolean(st.is_top_20),
    };
    (st.is_top_20 ? top20 : regular).push(entry);
  }

  const taskList = [...top20, ...regular];
  if (!taskList.length) return { plan: [], message: 'No tasks available for planning.' };

  const top20Note = top20.length
    ? `\nIMPORTANT: ${top20.length} tasks are marked is_top_20=true — ` +
      'these are the highest-leverage Pareto tasks. Always include ALL of them first ' +
      'before selecting any other tasks.\n'
    : '';

  const hours = pyFloat(availableHours);
  const taskJson = pyJsonDumps(taskList, 2);
  const prompt = `You are a productivity coach. The user has ${hours} hours available today.
${top20Note}
Tasks (Top 20% listed first):
${taskJson}

Select tasks fitting within ${hours} hours. Include ALL top 20% tasks first, then fill remaining time with others.
Return ONLY a valid JSON array:
[
  {"task_id": 1, "source": "quick|smart", "title": "...", "allocated_time": "30 mins", "reason": "Brief reason"}
]
No extra text, just raw JSON array.`;

  let plan: any[];
  try {
    const responseText = await callAi(prompt, settings);
    plan = extractJsonArray(responseText);
  } catch (err) {
    throw new HttpError(500, `AI Day Plan failed: ${errMsg(err)}`);
  }

  return { plan, top_20_count: top20.length };
}

/** POST /todo/quick-tasks/eisenhower-auto — eisenhower_auto_endpoint. */
async function eisenhowerAutoHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const settings = aiSettings(body);

  const tasks = getQuickTasksForDate(ctx.userId, todayIso());
  const undone = tasks.filter((t) => !t.done && !t.is_exported);
  if (!undone.length) return { assignments: [], message: 'No undone tasks to sort.' };

  const taskList = undone.map((t) => ({ task_id: t.id, title: t.title, is_top_20: Boolean(t.is_top_20) }));
  const taskJson = pyJsonDumps(taskList, 2);

  const prompt = `You are a productivity expert using the Eisenhower Matrix.
Categorize each task into one of 4 quadrants:
- do_now: Urgent + Important — must be done today
- schedule: Not Urgent + Important — plan for later
- delegate: Urgent + Not Important — delegate or do quickly
- eliminate: Not Urgent + Not Important — consider dropping

RULE: Any task with is_top_20=true must be placed in "do_now" or "schedule" only.

Tasks:
${taskJson}

Return ONLY a valid JSON array:
[
  {"task_id": 1, "quadrant": "do_now", "reasoning": "Brief reason"}
]
No extra text.`;

  let assignments: any[];
  try {
    const responseText = await callAi(prompt, settings);
    assignments = extractJsonArray(responseText);
  } catch (err) {
    throw new HttpError(500, `AI Eisenhower sort failed: ${errMsg(err)}`);
  }

  bulkUpdateQuadrants(ctx.userId, assignments);
  return { assignments };
}

/** POST /todo/quick-tasks/end-of-day — end_of_day_endpoint. */
async function endOfDayHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const moveToTomorrow: number[] = field(body, 'move_to_tomorrow', 'intList', { default: [] });
  const moveToSmart: number[] = field(body, 'move_to_smart', 'intList', { default: [] });
  const discard: number[] = field(body, 'discard', 'intList', { default: [] });
  const settings = aiSettings(body);

  const todayStr = todayIso();

  // Check before any mutation whether any Top 20% tasks are still incomplete today.
  const top20IncompleteCount = countIncompleteTop20(ctx.userId, todayStr);
  const top20Warning = top20IncompleteCount
    ? `⚠️ ${top20IncompleteCount} high-leverage task${top20IncompleteCount !== 1 ? 's' : ''} ` +
      'still incomplete — prioritize these tomorrow'
    : null;

  // 1. Archive completed tasks
  const archivedCount = archiveCompletedQuickTasks(ctx.userId, todayStr);

  // 2. Move to tomorrow
  let movedTomorrow = 0;
  if (moveToTomorrow.length) movedTomorrow = moveQuickTasksToTomorrow(ctx.userId, moveToTomorrow);

  // 3. Move to Smart To-Do (non-destructive)
  let movedSmart = 0;
  for (const tid of moveToSmart) {
    const qt = getQuickTask(tid, ctx.userId);
    if (qt) {
      const newTask = createTask(ctx.userId, qt.title, { context: `Moved from Quick Daily (${qt.date})` });
      markQuickTaskExported(tid, ctx.userId, { exported_task_id: newTask.id });
      movedSmart += 1;
    }
  }

  // 4. Discard
  let discarded = 0;
  for (const tid of discard) {
    if (deleteQuickTask(tid, ctx.userId)) discarded += 1;
  }

  // 5. AI day-end encouragement
  const prompt = `You are a productivity coach. The user is ending their day.
They completed ${archivedCount} tasks today.
They moved ${movedTomorrow} tasks to tomorrow, ${movedSmart} to their full task list, and discarded ${discarded}.
Write a short (1-2 sentences), warm, encouraging summary. Be positive and motivating.`;

  let encouragement: string;
  try {
    encouragement = await callAi(prompt, settings);
  } catch {
    encouragement = `Great work completing ${archivedCount} tasks today! Tomorrow is a fresh start.`;
  }

  return {
    summary: encouragement.trim(),
    archived_count: archivedCount,
    moved_tomorrow: movedTomorrow,
    moved_smart: movedSmart,
    discarded,
    top20_incomplete_count: top20IncompleteCount,
    top20_warning: top20Warning,
  };
}

export const routes: TodoRoute[] = [
  { method: 'POST', path: '/quick-tasks', handler: createQuickTaskHandler },
  { method: 'GET', path: '/quick-tasks/today', handler: getTodayTasksHandler },
  { method: 'PATCH', path: '/quick-tasks/:task_id', handler: updateQuickTaskHandler },
  { method: 'DELETE', path: '/quick-tasks/:task_id', handler: deleteQuickTaskHandler },
  { method: 'POST', path: '/quick-tasks/:task_id/move-to-smart', handler: moveToSmartHandler },
  { method: 'POST', path: '/quick-tasks/:task_id/move-to-plan', handler: moveToPlanHandler },
  { method: 'POST', path: '/quick-tasks/brain-dump-upload', handler: brainDumpUploadHandler },
  { method: 'POST', path: '/quick-tasks/bulk-create', handler: bulkCreateHandler },
  { method: 'POST', path: '/quick-tasks/ai-day-plan', handler: aiDayPlanHandler },
  { method: 'POST', path: '/quick-tasks/eisenhower-auto', handler: eisenhowerAutoHandler },
  { method: 'POST', path: '/quick-tasks/end-of-day', handler: endOfDayHandler },
];
