/**
 * fe-apis/todo/agent/handlers.ts
 *
 * Port of backend/modules/ai_todo/agent/router.py (the To-Do Assistant, mounted at /todo):
 *
 *   POST /todo/agent/chat   {messages: [{role: "user"|"assistant", content}], now, timezone?, voice?, ...AISettings}
 *        -> {reply, speech, actions, notes, sources, searched}
 *
 * Each turn reads a fresh snapshot of the workspace and the schedules (context.ts) into the prompt; the model may ask
 * for one web search (webStep.ts) and may propose actions. This only validates the actions and returns them: the app
 * carries them out through the ordinary endpoints. Nothing here writes to the database. Prompt, limits and texts are
 * copied verbatim from the Python file, so change both.
 */

import { HttpError, aiSettings, callAi, type Row } from '../_shared';
import { errMsg, pyJsonDumps } from '../py';
import type { TodoCtx, TodoRoute } from '../router';
import { normalizeRule } from '@/lib/schedules/scheduleRules';
import { getTask } from '../tasks/db';
import { getSchedule } from '../schedules/db';
import {
  CONTEXTS,
  KINDS,
  cleanAgentTasks,
  cleanText,
  cleanTimezone,
  cleanTitle,
  jsonBody,
  jsonObject,
  localNow,
  timeLine,
  weekdayOf,
} from '../schedules/handlers';
import { schedulesContext, workspaceContext } from './context';
import { runSearch, searchQuery, sourcesOf, webBlock } from './webStep';

const HISTORY_MAX = 16;
const MESSAGE_MAX = 4000;
const TRANSCRIPT_MAX = 20000;
const REPLY_MAX = 8000;
const SPEECH_MAX = 600;
const ACTIONS_MAX = 8;
const TASKS_PER_ACTION = 10;
const SOURCE_TEXT_MAX = 500;
// A report in the chat can be REPLY_MAX characters of markdown inside a JSON string plus speech and actions: 2048
// tokens cut those off mid-string. Twin: CHAT_BUDGET in router.py.
const CHAT_BUDGET = 4096;
const ROLES = new Set(['user', 'assistant']);
const ID_RE = /^[0-9]{1,12}$/;
const EMPTY_REPLY = "I couldn't put an answer together. Try asking another way.";

type Turn = { role: string; content: string };

// ── Input ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** `_clean_messages`: the last HISTORY_MAX well-formed turns, trimmed from the oldest end to TRANSCRIPT_MAX. */
function cleanMessages(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  let turns: Turn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !ROLES.has(item.role)) continue;
    const content = item.content;
    if (typeof content !== 'string' || !content.trim()) continue;
    turns.push({ role: item.role, content: content.trim().slice(0, MESSAGE_MAX) });
  }
  turns = turns.slice(-HISTORY_MAX);
  while (turns.length > 1 && turns.reduce((n, t) => n + t.content.length, 0) > TRANSCRIPT_MAX) {
    turns = turns.slice(1);
  }
  return turns;
}

function transcriptOf(turns: Turn[]): string {
  return turns
    .map((t) => `${t.role === 'user' ? 'Person' : 'Assistant'}: ${t.content}`)
    .join('\n\n');
}

/** `_as_id`: a row id from the model's JSON (an integer, an integral float or a digit string). */
function asId(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string' && ID_RE.test(value.trim())) return Number(value.trim()) || null;
  return null;
}

const jsString = (value: unknown): string =>
  value !== null && value !== undefined ? String(value) : '';

// ── Prompt ─────────────────────────────────────────────────────────────────────────────────────────────────────

function chatPrompt(
  now: string,
  weekday: string | null,
  timezone: string | null,
  workspace: string,
  schedules: string,
  web: string,
  transcript: string,
  voice: boolean,
  askSearch: boolean
): string {
  const voiceRule = voice
    ? '- They are talking to you by voice right now and hear your speech: keep reply short too, unless they asked for ' +
      'a report.\n'
    : '';
  const searchRule = askSearch
    ? "- web_search: when answering needs current information from the internet that isn't above (news, prices, " +
      "weather, releases, facts you aren't sure of), set it to a short search query and leave reply, speech and " +
      'actions empty; you will get the results and answer then. Otherwise null. For weather or anything local, put ' +
      "the place in the query (their time zone hints where they are when they don't say).\n"
    : '- You already searched the web: answer now from the results above and keep web_search null.\n';
  return `You are the Assistant in LabNinja, the person's personal to-do and learning app. You talk with them in a chat, sometimes by voice. You answer questions about their work from the data below, write reports and summaries, look things up on the web, and schedule reminders and AI jobs that run later.
${timeLine(now, weekday, timezone)}

Their To-Do workspace (JSON):
${workspace}

Their schedules (JSON; "rule" is when it runs, in their local time; "reads" is what an AI job reads):
${schedules}

${web}Conversation (oldest first):
${transcript}

Return ONLY a JSON object:
{
  "reply": "Your answer, shown in the chat. Markdown allowed: short paragraphs, bullet lists, **bold**, ### headings for a report",
  "speech": "The same answer said out loud: 1-3 short spoken sentences, no markdown, no lists, no links",
  "web_search": null,
  "actions": []
}
Actions (put them in "actions"; the app carries them out right away and the person can undo them):
- {"type": "create_schedule", "title": "Short name, at most 60 characters", "kind": "reminder or agent", "message": "For a reminder: the text to show. For an agent: the instructions the AI follows each time it runs", "reads": "none, tasks or workspace", "web": false, "report": false, "add_tasks": false, "rule": {"repeat": "once|interval|daily|weekdays|weekly|monthly|cron"}}
- {"type": "update_schedule", "id": 12, "enabled": false} to pause (false) or resume (true); it may also set a new "title", "message" or "rule"
- {"type": "run_schedule", "id": 12} to run an existing schedule now
- {"type": "delete_schedule", "id": 12} only when they clearly ask to delete or remove it; the app asks them to confirm
- {"type": "add_tasks", "tasks": [{"title": "Short imperative task title", "due_date": "YYYY-MM-DD or null", "priority": "p1|p2|p3|p4"}]} at most 10
- {"type": "complete_task", "id": 34} to mark one of their open tasks done
Rule fields by repeat (inside "rule"):
- once: "at": "YYYY-MM-DDTHH:MM"
- interval: "every_minutes": 15-10080, "start": "YYYY-MM-DDTHH:MM" (the first run)
- daily or weekdays: "time": "HH:MM"
- weekly: "time": "HH:MM", "days": [0-6] (0 = Sunday, 6 = Saturday)
- monthly: "time": "HH:MM", "day_of_month": 1-31
- cron: "cron": "minute hour day-of-month month day-of-week", only when nothing above fits
- a repeating rule may add "end": "YYYY-MM-DD" when they give a last day
Rules:
- Answer from the data above. Use real titles, dates and numbers; never invent tasks, projects, schedules or results. If something isn't there, say so.
- Schedule only when they want something to happen later or repeatedly ("remind me", "every Monday", "tomorrow at 6"). A question about now is answered now, not scheduled.
- kind is "agent" when the AI has to think, look something up or write something each time (plan my day, weekly report, news digest, quiz me); "reminder" when they only want to be told something.
- For an agent job: "reads" is "tasks" when it needs only their open tasks, "workspace" for reports and reviews that need projects, goals or finished work, else "none"; "web" is true when each run needs current information from the internet (news, prices, weather, releases); "report" is true when they want a report, digest, summary or review longer than a notification; "add_tasks" only when they ask it to add tasks.
- A time without a day is today if it is still ahead, otherwise tomorrow. "Every morning" means 08:00, "every evening" 19:00 and "every night" 21:00 unless a time is said. For an interval, start is now rounded up to the next 5 minutes unless they say when to start.
- To change, pause, run or delete a schedule, or complete a task, use its id from the data above. If it's unclear which one they mean, ask instead of acting.
- When you act, say what you did in a few words; the app shows the details.
${searchRule}${voiceRule}- Keep the person's language. Be brief and specific: lead with the answer.
No extra text, no markdown code fences, just the raw JSON object.`;
}

// ── Output ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** `_clean_actions`: the proposed actions that are safe to show and carry out, plus notes about the rest. */
function cleanActions(
  raw: unknown,
  userId: number,
  now: string,
  sourceText: string
): { actions: Row[]; notes: string[] } {
  const actions: Row[] = [];
  const notes: string[] = [];
  if (!Array.isArray(raw)) return { actions, notes };
  for (const item of raw.slice(0, ACTIONS_MAX)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const type = item.type;

    if (type === 'create_schedule') {
      const message = cleanText(item.message);
      const title = cleanTitle(jsString(item.title)) || (message || 'Scheduled job').slice(0, 60);
      const checked = normalizeRule(item.rule, now);
      if (checked.error !== undefined) {
        notes.push(`Couldn't schedule "${title}": ${checked.error}`);
        continue;
      }
      const kind = KINDS.has(item.kind) ? item.kind : 'reminder';
      const agent = kind === 'agent';
      const reads = CONTEXTS.has(item.reads) ? item.reads : 'tasks';
      actions.push({
        type: 'create_schedule',
        schedule: {
          title,
          kind,
          message,
          agent_context: agent ? reads : 'none',
          use_web: agent && item.web === true,
          write_report: agent && item.report === true,
          add_tasks: agent && item.add_tasks === true,
          rule: checked.rule,
          source_text: sourceText.slice(0, SOURCE_TEXT_MAX),
        },
      });
    } else if (
      type === 'update_schedule' ||
      type === 'run_schedule' ||
      type === 'delete_schedule'
    ) {
      const scheduleId = asId(item.id);
      const current = scheduleId !== null ? getSchedule(scheduleId, userId) : null;
      if (!current) {
        notes.push("Couldn't find that schedule.");
        continue;
      }
      if (type !== 'update_schedule') {
        actions.push({ type, id: scheduleId, title: current.title });
        continue;
      }
      const patch: Row = {};
      if (typeof item.enabled === 'boolean') patch.enabled = item.enabled;
      const newTitle = cleanTitle(item.title);
      if (newTitle) patch.title = newTitle;
      const newMessage = cleanText(item.message);
      if (newMessage) patch.message = newMessage;
      if (item.rule !== null && item.rule !== undefined) {
        const checked = normalizeRule(item.rule, now);
        if (checked.error !== undefined)
          notes.push(`Couldn't change "${current.title}": ${checked.error}`);
        else patch.rule = checked.rule;
      }
      if (!Object.keys(patch).length) continue;
      actions.push({
        type: 'update_schedule',
        id: scheduleId,
        title: current.title,
        patch,
        before: Object.fromEntries(Object.keys(patch).map((key) => [key, current[key]])),
      });
    } else if (type === 'add_tasks') {
      const tasks = cleanAgentTasks(item.tasks, TASKS_PER_ACTION);
      if (tasks.length) actions.push({ type: 'add_tasks', tasks });
    } else if (type === 'complete_task') {
      const taskId = asId(item.id);
      const task = taskId !== null ? getTask(taskId, userId) : null;
      if (!task || task.status === 'done' || task.status === 'not_done') {
        notes.push("Couldn't find that open task.");
        continue;
      }
      actions.push({ type: 'complete_task', id: taskId, title: task.title, before: task.status });
    }
  }
  return { actions, notes };
}

async function agentChatHandler(ctx: TodoCtx) {
  const body = await jsonBody(ctx);
  const turns = cleanMessages(body.messages);
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    throw new HttpError(400, 'Say or type something to ask.');
  }
  const now = localNow(body.now);
  const weekday = weekdayOf(now);
  const timezone = cleanTimezone(body.timezone);
  const voice = body.voice === true;
  const workspace = pyJsonDumps(workspaceContext(ctx.userId, now.slice(0, 10)));
  const schedules = pyJsonDumps(schedulesContext(ctx.userId));
  const transcript = transcriptOf(turns);
  const settings = aiSettings(body);

  let query: string | null = null;
  let results: Row[] = [];
  let text: string;
  let obj: Row | null;
  try {
    text = await callAi(
      chatPrompt(now, weekday, timezone, workspace, schedules, '', transcript, voice, true),
      settings,
      CHAT_BUDGET
    );
    obj = jsonObject(text);
    query = obj ? searchQuery(obj.web_search) : null;
    if (query !== null) {
      results = await runSearch(query);
      text = await callAi(
        chatPrompt(
          now,
          weekday,
          timezone,
          workspace,
          schedules,
          webBlock(query, results),
          transcript,
          voice,
          false
        ),
        settings,
        CHAT_BUDGET
      );
      obj = jsonObject(text);
    }
  } catch (err) {
    throw new HttpError(502, `AI could not answer: ${errMsg(err)}`);
  }

  let reply: string;
  let speech: string;
  let actions: Row[] = [];
  let notes: string[] = [];
  if (!obj) {
    reply = text.trim().slice(0, REPLY_MAX);
    speech = '';
  } else {
    reply = jsString(obj.reply).trim().slice(0, REPLY_MAX);
    speech = jsString(obj.speech).trim().slice(0, SPEECH_MAX);
    ({ actions, notes } = cleanActions(
      obj.actions,
      ctx.userId,
      now,
      turns[turns.length - 1].content
    ));
  }
  if (!reply && !actions.length) reply = EMPTY_REPLY;
  return {
    reply,
    speech,
    actions,
    notes,
    sources: query !== null ? sourcesOf(results) : [],
    searched: query,
  };
}

export const routes: TodoRoute[] = [
  { method: 'POST', path: '/agent/chat', handler: agentChatHandler },
];
