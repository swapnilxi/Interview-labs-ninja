/**
 * fe-apis/todo/schedules/handlers.ts
 *
 * Port of backend/modules/ai_todo/schedules/router.py (the To-Do Scheduler, mounted at /todo). Prompts, limits, status
 * codes and error texts are copied verbatim, so change both.
 *
 *   GET    /todo/schedules                 list
 *   POST   /todo/schedules                 create (rule validated by normalizeRule)
 *   PATCH  /todo/schedules/{id}            update
 *   DELETE /todo/schedules/{id}            delete (and its runs)
 *   GET    /todo/schedules/{id}/runs       last runs
 *   GET    /todo/schedules/activity        latest AI-job runs across all schedules (the Assistant's feed)
 *   POST   /todo/schedules/parse           AI: a sentence -> a schedule draft (not saved)
 *   POST   /todo/schedules/{id}/run        run one occurrence (reminder: record it; agent: ask the AI), deduplicated
 *
 * An AI job reads nothing, its open tasks ("tasks") or the whole To-Do workspace ("workspace", agent/context.ts); with
 * use_web it may search the web once per run (agent/webStep.ts); with write_report it also writes a full report the app
 * shows, while `output` stays the short notification text the phone shows.
 */

import {
  HttpError,
  aiSettings,
  callAi,
  extractJsonObject,
  patchUpdates,
  type Row,
} from '../_shared';
import { extractJsonObjectLenient } from '../../ai/utils';
import { errMsg, pyJsonDumps } from '../py';
import type { TodoCtx, TodoRoute } from '../router';
import { normalizeRule } from '@/lib/schedules/scheduleRules';
import { getAllTasks, createTask } from '../tasks/db';
import { workspaceContext } from '../agent/context';
import { runSearch, searchQuery, sourcesOf, webBlock } from '../agent/webStep';
import {
  claimRun,
  createSchedule,
  deleteSchedule,
  finishRun,
  getSchedule,
  listRecentAgentRuns,
  listRuns,
  listSchedules,
  updateSchedule,
} from './db';

export const KINDS = new Set(['reminder', 'agent']);
export const CONTEXTS = new Set(['tasks', 'workspace', 'none']);
const SOURCES = new Set(['web', 'app', 'manual']);
export const PRIORITIES = new Set(['p1', 'p2', 'p3', 'p4']);
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TITLE_MAX = 120;
const OUTPUT_MAX = 2000;
const REPORT_MAX = 8000;

/** SCHEDULE_NULLABLE in schedules/router.py: PATCH fields a `null` empties. */
const SCHEDULE_NULLABLE: ReadonlySet<string> = new Set(['message', 'timezone', 'source_text']);

// ── Body helpers (Pydantic stand-ins) ──────────────────────────────────────────────────────────────────────────

export async function jsonBody(ctx: TodoCtx): Promise<Row> {
  const body = await ctx.json<unknown>();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'Input should be a valid dictionary');
  }
  return body as Row;
}

export function strField(
  body: Row,
  key: string,
  opts: { required?: boolean; nullable?: boolean } = {}
): string | null | undefined {
  if (!(key in body)) {
    if (opts.required) throw new HttpError(422, `Field required: ${key}`);
    return undefined;
  }
  const v = body[key];
  if (v === null && opts.nullable) return null;
  if (typeof v !== 'string')
    throw new HttpError(422, `Invalid value for '${key}': expected a string`);
  return v;
}

function boolField(body: Row, key: string): boolean | undefined {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (typeof v === 'boolean') return v;
  if (v === 0 || v === 1) return v === 1;
  throw new HttpError(422, `Invalid value for '${key}': expected a boolean`);
}

/** Python's `strptime(now, "%Y-%m-%dT%H:%M").strftime("%A")`, or null for an impossible date/time. */
export function weekdayOf(localDt: string): string | null {
  const [y, mo, d] = localDt.slice(0, 10).split('-').map(Number);
  const hh = Number(localDt.slice(11, 13));
  const mi = Number(localDt.slice(14, 16));
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null;
  if (hh > 23 || mi > 59) return null;
  return WEEKDAYS[(date.getUTCDay() + 6) % 7];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `_local_now(sent)`: the client's local "YYYY-MM-DDTHH:MM" when valid, else the server's. */
export function localNow(sent: unknown): string {
  if (typeof sent === 'string' && LOCAL_DT_RE.test(sent) && weekdayOf(sent)) return sent;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `_utc_now_iso()`: "YYYY-MM-DDTHH:MM:SS.mmmZ". */
function utcNowIso(): string {
  return new Date().toISOString();
}

export function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, TITLE_MAX) : '';
}

const TIMEZONE_RE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** `_clean_timezone`: an IANA zone name ("Asia/Kolkata") safe to put in a prompt, or null. */
export function cleanTimezone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tz = value.trim();
  return TIMEZONE_RE.test(tz) ? tz : null;
}

/**
 * `_time_line`: the prompt's "now" line. The time zone, when known, is the model's only hint of where the person is:
 * the web search runs from the server, so without a place in the query "weather" or "local news" comes back for the
 * server's location, not theirs.
 */
export function timeLine(now: string, weekday: string | null, timezone: string | null): string {
  const zone = timezone ? `; time zone ${timezone}, so likely where they are unless they say otherwise` : '';
  return `Current local date and time: ${now} (${weekday}${zone}).`;
}

export function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireSchedule(scheduleId: number, userId: number): Row {
  const schedule = getSchedule(scheduleId, userId);
  if (!schedule) throw new HttpError(404, 'Schedule not found');
  return schedule;
}

function checkedRule(raw: unknown, now: string | null = null): Row {
  const result = normalizeRule(raw, now);
  if (result.error !== undefined) throw new HttpError(422, result.error);
  return result.rule as Row;
}

function checkedKind(value: string): string {
  if (!KINDS.has(value)) throw new HttpError(422, "kind must be 'reminder' or 'agent'.");
  return value;
}

function checkedContext(value: string): string {
  if (!CONTEXTS.has(value))
    throw new HttpError(422, "agent_context must be 'tasks', 'workspace' or 'none'.");
  return value;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────────────────────────────────────

async function createScheduleHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const title = cleanTitle(strField(body, 'title', { required: true }));
  if (!title) throw new HttpError(422, 'Give the schedule a title.');
  if (!('rule' in body)) throw new HttpError(422, 'Field required: rule');
  const rule = checkedRule(body.rule);
  return createSchedule(ctx.userId, title, rule, {
    kind: checkedKind(strField(body, 'kind') ?? 'reminder'),
    message: cleanText(strField(body, 'message', { nullable: true })),
    timezone: cleanText(strField(body, 'timezone', { nullable: true })),
    agent_context: checkedContext(strField(body, 'agent_context') ?? 'tasks'),
    add_tasks: boolField(body, 'add_tasks') ?? false,
    enabled: boolField(body, 'enabled') ?? true,
    source_text: cleanText(strField(body, 'source_text', { nullable: true })),
    use_web: boolField(body, 'use_web') ?? false,
    write_report: boolField(body, 'write_report') ?? false,
  });
}

async function updateScheduleHandler(ctx: TodoCtx) {
  const scheduleId = ctx.intParam('schedule_id');
  const body = await jsonBody(ctx);
  const sent: Row = {};
  if ('title' in body) {
    const title = cleanTitle(strField(body, 'title', { nullable: true }));
    if (body.title !== null) {
      if (!title) throw new HttpError(422, 'Give the schedule a title.');
      sent.title = title;
    }
  }
  if ('kind' in body && body.kind !== null)
    sent.kind = checkedKind(strField(body, 'kind') as string);
  if ('agent_context' in body && body.agent_context !== null) {
    sent.agent_context = checkedContext(strField(body, 'agent_context') as string);
  }
  for (const key of ['message', 'timezone', 'source_text']) {
    if (key in body) sent[key] = cleanText(strField(body, key, { nullable: true }));
  }
  for (const key of ['add_tasks', 'enabled', 'use_web', 'write_report']) {
    if (key in body && body[key] !== null) sent[key] = boolField(body, key);
  }
  if ('rule' in body && body.rule !== null) sent.rule = checkedRule(body.rule);
  const updated = updateSchedule(scheduleId, ctx.userId, patchUpdates(sent, SCHEDULE_NULLABLE));
  if (!updated) throw new HttpError(404, 'Schedule not found');
  return updated;
}

function deleteScheduleHandler(ctx: TodoCtx) {
  const scheduleId = ctx.intParam('schedule_id');
  if (!deleteSchedule(scheduleId, ctx.userId)) throw new HttpError(404, 'Schedule not found');
  return { status: 'deleted', id: scheduleId };
}

function listRunsHandler(ctx: TodoCtx) {
  const scheduleId = ctx.intParam('schedule_id');
  requireSchedule(scheduleId, ctx.userId);
  return listRuns(scheduleId, ctx.userId);
}

// ── AI: sentence -> schedule draft ─────────────────────────────────────────────────────────────────────────────

async function parseScheduleHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const text = (strField(body, 'text', { required: true }) as string).trim();
  if (!text) throw new HttpError(400, 'Say or type what to schedule.');
  const now = localNow(body.now);
  const weekday = weekdayOf(now);
  const settings = aiSettings(body);

  const prompt = `You turn a request into a scheduled job for a to-do app.
Current local date and time: ${now} (${weekday}).

Request: "${text}"

Return ONLY a JSON object:
{
  "title": "Short name for the job, at most 60 characters",
  "kind": "reminder or agent",
  "message": "For a reminder: the text to show. For an agent: the instructions the AI follows each time it runs",
  "agent_context": "tasks or none",
  "add_tasks": false,
  "rule": {"repeat": "once|interval|daily|weekdays|weekly|monthly|cron"}
}
Rule fields by repeat (add them inside "rule"):
- once: "at": "YYYY-MM-DDTHH:MM"
- interval: "every_minutes": 15-10080, "start": "YYYY-MM-DDTHH:MM" (the first run)
- daily or weekdays: "time": "HH:MM"
- weekly: "time": "HH:MM", "days": [0-6] (0 = Sunday, 6 = Saturday)
- monthly: "time": "HH:MM", "day_of_month": 1-31
- cron: "cron": "minute hour day-of-month month day-of-week", only when nothing above fits
- a repeating rule may add "end": "YYYY-MM-DD" when the request gives a last day
Rules:
- kind is "agent" when the AI has to think or write something each time it runs (plan my day, summarize, review, check, quiz me, suggest); "reminder" when the person only wants to be told something at a time.
- agent_context is "tasks" when the job needs their to-do list (planning, reviews, overdue checks), else "none". add_tasks is true only when they ask the AI to add or create tasks.
- A time without a day is today if it is still ahead, otherwise tomorrow. "Every morning" means 08:00, "every evening" 19:00 and "every night" 21:00 unless a time is said.
- For an interval, start is now rounded up to the next 5 minutes unless they say when to start.
- Keep the person's language in title and message.
No extra text, no markdown blocks, just the raw JSON object.`;

  let parsed: Row;
  try {
    const responseText = await callAi(prompt, settings);
    parsed = extractJsonObject(responseText);
  } catch (err) {
    throw new HttpError(502, `AI could not read that request: ${errMsg(err)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(502, 'AI could not read that request: no JSON object in the reply');
  }

  const result = normalizeRule(parsed.rule, now);
  if (result.error !== undefined) {
    throw new HttpError(
      422,
      `AI couldn't work out when to run this: ${result.error} Try saying the time, e.g. "every weekday at 9am".`
    );
  }
  const kind = KINDS.has(parsed.kind) ? parsed.kind : 'reminder';
  const title =
    cleanTitle(parsed.title !== null && parsed.title !== undefined ? String(parsed.title) : '') ||
    text.slice(0, 60);
  return {
    schedule: {
      title,
      kind,
      message: cleanText(parsed.message),
      agent_context: CONTEXTS.has(parsed.agent_context)
        ? parsed.agent_context
        : kind === 'agent'
          ? 'tasks'
          : 'none',
      add_tasks: kind === 'agent' && parsed.add_tasks === true,
      rule: result.rule,
      source_text: text,
    },
  };
}

// ── Run one occurrence ─────────────────────────────────────────────────────────────────────────────────────────

/** `_open_tasks_for_prompt`: the user's open tasks, soonest due first, at most 40, as compact dicts. */
function openTasksForPrompt(userId: number): Row[] {
  const active = getAllTasks(userId).filter((t) => t.status !== 'done' && t.status !== 'not_done');
  const cmp = (a: unknown, b: unknown) => (a! < b! ? -1 : a! > b! ? 1 : 0);
  active.sort(
    (a, b) =>
      cmp(
        a.due_date === null || a.due_date === undefined ? 1 : 0,
        b.due_date === null || b.due_date === undefined ? 1 : 0
      ) ||
      cmp(a.due_date || '', b.due_date || '') ||
      cmp(a.priority || 'p3', b.priority || 'p3') ||
      cmp(a.id, b.id)
  );
  return active.slice(0, 40).map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority ?? null,
    due_date: t.due_date ?? null,
    status: t.status ?? null,
  }));
}

/** `_clean_agent_tasks`: at most 5 well-formed task suggestions. */
export function cleanAgentTasks(raw: unknown, limit = 5): Row[] {
  if (!Array.isArray(raw)) return [];
  const out: Row[] = [];
  for (const item of raw.slice(0, limit)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : '';
    if (!title) continue;
    out.push({
      title,
      priority: PRIORITIES.has(item.priority) ? item.priority : 'p3',
      due_date:
        typeof item.due_date === 'string' && DATE_RE.test(item.due_date) ? item.due_date : null,
    });
  }
  return out;
}

/**
 * `_json_object`: the reply's JSON object, or null when there is none (the raw text is then the answer). A reply that
 * isn't strict JSON (a <think> block first, raw newlines in the markdown, cut off at max_tokens) is read leniently, so
 * the person sees the answer and not a raw `{"reply": ...` blob with its actions lost.
 */
export function jsonObject(text: string): Row | null {
  try {
    const candidate = extractJsonObject(text);
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
  } catch {
    // not strict JSON: read it leniently below
  }
  return extractJsonObjectLenient(text);
}

/** `_run_budget`: output tokens for one run: a full report needs room, a notification doesn't. */
function runBudget(schedule: Row): number {
  return schedule.write_report ? 3000 : 1024;
}

/** `_run_prompt`. A job without the newer options (workspace, web, report) gets exactly the original prompt. */
function runPrompt(
  schedule: Row,
  now: string,
  weekday: string | null,
  tasksBlock: string,
  web: string,
  askSearch: boolean
): string {
  const reportLine = schedule.write_report
    ? '\n  "report": "The full report, shown in the app: markdown allowed (### headings, bullet lists, **bold**), ' +
      'no emoji, at most 4000 characters",'
    : '';
  const searchLine = askSearch
    ? '\n  "web_search": "A short web search query for the current information this run needs",'
    : '';
  let extraRules = '';
  if (schedule.write_report)
    extraRules +=
      '- message is the short version for the notification; report is the complete answer.\n';
  if (askSearch)
    extraRules +=
      '- web_search: this job reads the web on every run. Set it to a short search query for what this run needs ' +
      '(name the place for weather or anything local; add the month and year for news, prices or releases) and leave ' +
      'the other fields empty; you will get the results and answer then.\n';
  if (web)
    extraRules += '- Use the web results for current facts; never make up news, prices or dates.\n';
  return `You are the scheduled assistant inside LabNinja, a personal to-do app. A job the person scheduled is running now, and your answer is shown to them as a phone notification.
${timeLine(now, weekday, cleanTimezone(schedule.timezone))}

Job: ${schedule.title}
Instructions: ${schedule.message || 'No extra instructions.'}

${tasksBlock}${web}Return ONLY a JSON object:
{
  "title": "Notification title, at most 60 characters",
  "message": "Your answer for the person: plain text, no markdown, at most 700 characters",${reportLine}${searchLine}
  "tasks": [
    {"title": "Short imperative task title", "due_date": "YYYY-MM-DD or null", "priority": "p1|p2|p3|p4"}
  ]
}
Rules:
- Follow the instructions (the job's title says what it is for when they are short). Be specific, and use the person's tasks when they matter; never invent tasks they don't have.
- Do the job now, for today, and give the finished result: never say you will do it later, and never ask the person anything or wait for an answer (they can't reply to this). A quiz gives its questions with the answers below them.
- Refer to tasks by title, never by id.
- tasks: new tasks only when the instructions ask you to create, plan or suggest tasks (at most 5); otherwise [].
${extraRules}- Keep the person's language.
No extra text, no markdown blocks, just the raw JSON object.`;
}

async function runScheduleHandler(ctx: TodoCtx) {
  const scheduleId = ctx.intParam('schedule_id');
  const body = await jsonBody(ctx);
  const schedule = requireSchedule(scheduleId, ctx.userId);
  const sentFor = strField(body, 'scheduled_for', { nullable: true });
  const scheduledFor = sentFor && sentFor.trim() ? sentFor.trim().slice(0, 64) : utcNowIso();
  const sentSource = strField(body, 'source', { nullable: true });
  const source = sentSource && SOURCES.has(sentSource) ? sentSource : 'web';
  const disableOnce = source !== 'manual';

  const [claimedRun, claimed] = claimRun(scheduleId, ctx.userId, scheduledFor, source);
  if (!claimed) return { run: claimedRun, duplicate: true, tasks: [] };

  if (schedule.kind !== 'agent') {
    const run = finishRun(claimedRun.id, scheduleId, 'ok', schedule.title, schedule.message, {
      disable_once: disableOnce,
    });
    return { run, duplicate: false, tasks: [] };
  }

  const now = localNow(body.now);
  const weekday = weekdayOf(now);
  let tasksBlock = '';
  if (schedule.agent_context === 'tasks') {
    const open = openTasksForPrompt(ctx.userId);
    tasksBlock = open.length
      ? `Their open tasks (JSON, soonest due first):\n${pyJsonDumps(open, 2)}\n\n`
      : 'Their open tasks: none.\n\n';
  } else if (schedule.agent_context === 'workspace') {
    tasksBlock = `Their To-Do workspace (JSON):\n${pyJsonDumps(workspaceContext(ctx.userId, now.slice(0, 10)))}\n\n`;
  }

  const settings = aiSettings(body);
  let query: string | null = null;
  let results: Row[] = [];
  let responseText: string;
  let obj: Row | null;
  try {
    responseText = await callAi(
      runPrompt(schedule, now, weekday, tasksBlock, '', schedule.use_web),
      settings,
      runBudget(schedule)
    );
    obj = jsonObject(responseText);
    // A job set to read the web always searches: when the model answered instead of asking (from its training data,
    // so stale news, prices and weather), the job's title is the query.
    query = schedule.use_web
      ? (obj ? searchQuery(obj.web_search) : null) ?? searchQuery(schedule.title)
      : null;
    if (query !== null) {
      results = await runSearch(query);
      responseText = await callAi(
        runPrompt(schedule, now, weekday, tasksBlock, webBlock(query, results), false),
        settings,
        runBudget(schedule)
      );
      obj = jsonObject(responseText);
    }
  } catch (err) {
    const detail = `AI could not run this job: ${errMsg(err)}`;
    finishRun(claimedRun.id, scheduleId, 'error', schedule.title, detail.slice(0, OUTPUT_MAX), {
      disable_once: disableOnce,
    });
    throw new HttpError(502, detail);
  }

  let title: string;
  let message: string;
  let suggestions: Row[];
  let report: string | null = null;
  if (obj) {
    title =
      (obj.title !== null && obj.title !== undefined ? String(obj.title) : '')
        .trim()
        .slice(0, 80) || schedule.title;
    message = (obj.message !== null && obj.message !== undefined ? String(obj.message) : '')
      .trim()
      .slice(0, OUTPUT_MAX);
    suggestions = cleanAgentTasks(obj.tasks);
    if (schedule.write_report && typeof obj.report === 'string' && obj.report.trim()) {
      report = obj.report.trim().slice(0, REPORT_MAX);
    }
  } else {
    title = schedule.title;
    message = responseText.trim().slice(0, OUTPUT_MAX);
    suggestions = [];
  }
  if (!message) message = 'The AI returned an empty answer.';

  const created: Row[] = [];
  if (schedule.add_tasks) {
    for (const s of suggestions) {
      created.push(
        createTask(ctx.userId, s.title, {
          priority: s.priority,
          due_date: s.due_date,
          context: `Added by the scheduled job "${schedule.title}".`,
        })
      );
    }
  }
  const run = finishRun(claimedRun.id, scheduleId, 'ok', title, message, {
    created_task_ids: created.map((t) => t.id),
    disable_once: disableOnce,
    report,
    sources: query !== null ? sourcesOf(results) : null,
  });
  return { run, duplicate: false, tasks: schedule.add_tasks ? created : suggestions };
}

export const routes: TodoRoute[] = [
  { method: 'GET', path: '/schedules', handler: (ctx) => listSchedules(ctx.userId) },
  { method: 'GET', path: '/schedules/activity', handler: (ctx) => listRecentAgentRuns(ctx.userId) },
  { method: 'POST', path: '/schedules', handler: createScheduleHandler },
  { method: 'POST', path: '/schedules/parse', handler: parseScheduleHandler },
  { method: 'PATCH', path: '/schedules/:schedule_id', handler: updateScheduleHandler },
  { method: 'DELETE', path: '/schedules/:schedule_id', handler: deleteScheduleHandler },
  { method: 'GET', path: '/schedules/:schedule_id/runs', handler: listRunsHandler },
  { method: 'POST', path: '/schedules/:schedule_id/run', handler: runScheduleHandler },
];
