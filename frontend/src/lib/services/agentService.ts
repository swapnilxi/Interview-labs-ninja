'use client';

/**
 * The To-Do Assistant: client for POST /todo/agent/chat (backend/modules/ai_todo/agent, fe-apis/todo/agent), the
 * conversation kept in this browser, and the actions the Assistant proposes.
 *
 * The server only reads (your workspace, your schedules, the web) and returns a reply plus proposed actions. This file
 * carries the actions out through the ordinary services (scheduleService, todoService), so each change is validated
 * by the same endpoints as a manual one, re-syncs the alarms, and can be undone from its card. Deleting a schedule
 * waits for a tap on its card.
 */

import { defaultAIRequestFields, isMissingKeyError } from './settingsService';
import { parseApiError } from '../http/apiClient';
import { getToken } from '../auth/tokenStore';
import { todoFetch, todoService, type TaskStatus } from './todoService';
import {
  scheduleService,
  type Schedule,
  type ScheduleCreatePayload,
  type ScheduleUpdatePayload,
} from './scheduleService';
import { toLocalStamp } from '../schedules/scheduleRules';
import { runAgentOccurrence } from '../schedules/scheduleEngine';

// ── Wire types ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface AgentTaskDraft {
  title: string;
  due_date: string | null;
  priority: 'p1' | 'p2' | 'p3' | 'p4';
}

export type AgentAction =
  | { type: 'create_schedule'; schedule: ScheduleCreatePayload }
  | {
      type: 'update_schedule';
      id: number;
      title: string;
      patch: ScheduleUpdatePayload;
      before: ScheduleUpdatePayload;
    }
  | { type: 'run_schedule'; id: number; title: string }
  | { type: 'delete_schedule'; id: number; title: string }
  | { type: 'add_tasks'; tasks: AgentTaskDraft[] }
  | { type: 'complete_task'; id: number; title: string; before: TaskStatus };

export interface AgentSource {
  title: string;
  url: string;
}

export interface AgentReply {
  reply: string;
  /** The reply as 1–3 spoken sentences (may be empty: then the reply itself is read). */
  speech: string;
  actions: AgentAction[];
  /** Actions the server refused (a time it couldn't read, an id that isn't yours). */
  notes: string[];
  sources: AgentSource[];
  /** The web search it ran, if any. */
  searched: string | null;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const agentService = {
  async chat(turns: ChatTurn[], opts: { voice?: boolean } = {}): Promise<AgentReply> {
    const res = await todoFetch('/todo/agent/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: turns,
        now: toLocalStamp(new Date()),
        voice: !!opts.voice,
        ...defaultAIRequestFields(),
      }),
    });
    if (!res.ok) {
      const message = await parseApiError(res);
      throw new Error(
        isMissingKeyError(message)
          ? 'Add an AI key in Config (or pick “Use .env default”), then ask again.'
          : message
      );
    }
    const data = (await res.json()) as Partial<AgentReply>;
    return {
      reply: data.reply ?? '',
      speech: data.speech ?? '',
      actions: Array.isArray(data.actions) ? data.actions : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
      searched: data.searched ?? null,
    };
  },
};

// ── The conversation (this browser only) ────────────────────────────────────────────────────────────────────────

export type ActionState = 'working' | 'done' | 'undone' | 'failed' | 'confirm' | 'kept';

export interface ActionEntry {
  action: AgentAction;
  state: ActionState;
  /** create_schedule: the saved schedule's id. */
  scheduleId?: number;
  /** add_tasks: the ids of the tasks it added. */
  taskIds?: number[];
  /** delete_schedule: the schedule as it was, so Undo can recreate it (its history is gone). */
  deleted?: ScheduleCreatePayload;
  error?: string;
}

export interface ThreadItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** epoch ms */
  at: number;
  speech?: string;
  actions?: ActionEntry[];
  notes?: string[];
  sources?: AgentSource[];
  searched?: string | null;
  /** An assistant item that is an error ("Couldn't reach the server…"); Retry resends the turn before it. */
  failed?: boolean;
  /** Asked by voice. */
  voice?: boolean;
}

export interface StoredThread {
  items: ThreadItem[];
  /** Job results older than this are not shown (New chat). */
  clearedAt: number;
}

const THREAD_KEY = 'labninja.assistant.thread.v1';
const THREAD_MAX = 80;

/** The signed-in user's id from the token, so two accounts on one browser keep separate conversations. */
function userKey(): string {
  try {
    const token = getToken();
    const payload = token?.split('.')[1];
    if (!payload) return 'me';
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return String(json.sub ?? 'me');
  } catch {
    return 'me';
  }
}

export function loadThread(): StoredThread {
  try {
    const raw = window.localStorage.getItem(`${THREAD_KEY}:${userKey()}`);
    if (!raw) return { items: [], clearedAt: 0 };
    const parsed = JSON.parse(raw) as StoredThread;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      clearedAt: Number(parsed.clearedAt) || 0,
    };
  } catch {
    return { items: [], clearedAt: 0 };
  }
}

export function saveThread(thread: StoredThread) {
  try {
    window.localStorage.setItem(
      `${THREAD_KEY}:${userKey()}`,
      JSON.stringify({ items: thread.items.slice(-THREAD_MAX), clearedAt: thread.clearedAt })
    );
  } catch {
    /* storage full or blocked: the conversation just isn't kept */
  }
}

export const newItemId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ── Carrying out an action ──────────────────────────────────────────────────────────────────────────────────────

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

/** Runs a just-proposed action. A delete is not run: it waits for a tap ('confirm'). */
export async function applyAction(action: AgentAction): Promise<ActionEntry> {
  try {
    switch (action.type) {
      case 'create_schedule': {
        const saved = await scheduleService.create(action.schedule);
        return { action, state: 'done', scheduleId: saved.id };
      }
      case 'update_schedule': {
        await scheduleService.update(action.id, action.patch);
        return { action, state: 'done' };
      }
      case 'run_schedule': {
        await runSchedule(action.id);
        return { action, state: 'done' };
      }
      case 'delete_schedule':
        return { action, state: 'confirm' };
      case 'add_tasks': {
        const ids: number[] = [];
        for (const t of action.tasks) {
          const task = await todoService.createTaskStrict({
            title: t.title,
            priority: t.priority,
            due_date: t.due_date,
            context: 'Added by the Assistant.',
          });
          ids.push(task.id);
        }
        return { action, state: 'done', taskIds: ids };
      }
      case 'complete_task': {
        const updated = await todoService.updateTask(action.id, { status: 'done' });
        if (!updated) throw new Error('Could not mark it done.');
        return { action, state: 'done' };
      }
    }
  } catch (err) {
    return { action, state: 'failed', error: errorText(err, 'That didn’t work.') };
  }
  return { action, state: 'failed', error: 'Unknown action.' };
}

async function runSchedule(id: number) {
  const schedule = (await scheduleService.list()).find((s) => s.id === id);
  if (!schedule) throw new Error('That schedule no longer exists.');
  const at = new Date().toISOString();
  if (schedule.kind === 'agent') {
    // Fire and forget: the answer arrives in the conversation (and as a notification) when the job is done.
    void runAgentOccurrence(schedule, at, { source: 'manual' });
  } else {
    await scheduleService.run(id, at, 'manual');
  }
}

function payloadOf(s: Schedule): ScheduleCreatePayload {
  return {
    title: s.title,
    kind: s.kind,
    message: s.message,
    rule: s.rule,
    timezone: s.timezone,
    agent_context: s.agent_context,
    add_tasks: s.add_tasks,
    use_web: !!s.use_web,
    write_report: !!s.write_report,
    enabled: s.enabled,
    source_text: s.source_text,
  };
}

/** The delete card's confirm button. */
export async function confirmDelete(entry: ActionEntry): Promise<ActionEntry> {
  const action = entry.action;
  if (action.type !== 'delete_schedule') return entry;
  try {
    const current = (await scheduleService.list()).find((s) => s.id === action.id);
    await scheduleService.remove(action.id);
    return { ...entry, state: 'done', deleted: current ? payloadOf(current) : undefined };
  } catch (err) {
    return { ...entry, state: 'failed', error: errorText(err, 'Could not delete it.') };
  }
}

/** Undo from a card. Running a schedule can't be undone; a deleted schedule comes back without its history. */
export async function undoAction(entry: ActionEntry): Promise<ActionEntry> {
  const a = entry.action;
  try {
    if (a.type === 'create_schedule' && entry.scheduleId) {
      await scheduleService.remove(entry.scheduleId);
    } else if (a.type === 'update_schedule') {
      await scheduleService.update(a.id, a.before);
    } else if (a.type === 'delete_schedule' && entry.deleted) {
      await scheduleService.create(entry.deleted);
    } else if (a.type === 'add_tasks' && entry.taskIds) {
      for (const id of entry.taskIds) await todoService.deleteTask(id);
    } else if (a.type === 'complete_task') {
      await todoService.updateTask(a.id, { status: a.before });
    } else {
      return entry;
    }
    return { ...entry, state: 'undone' };
  } catch (err) {
    return { ...entry, error: errorText(err, 'Could not undo it.') };
  }
}

/** The turns the server sees: your messages, its replies (with what it did), and job results it may refer to. */
export function turnsFor(items: ThreadItem[]): ChatTurn[] {
  return items
    .filter((it) => !it.failed && it.text.trim())
    .map((it) => {
      if (it.role === 'user') return { role: 'user' as const, content: it.text };
      const did = (it.actions ?? [])
        .filter((e) => e.state === 'done' || e.state === 'confirm')
        .map((e) => describeActionForModel(e))
        .filter(Boolean);
      const content = did.length ? `${it.text}\n\n[${did.join(' ')}]` : it.text;
      return { role: 'assistant' as const, content };
    });
}

function describeActionForModel(e: ActionEntry): string {
  const a = e.action;
  switch (a.type) {
    case 'create_schedule':
      return `Scheduled "${a.schedule.title}".`;
    case 'update_schedule':
      return a.patch.enabled === false
        ? `Paused "${a.title}".`
        : a.patch.enabled === true
          ? `Resumed "${a.title}".`
          : `Changed "${a.title}".`;
    case 'run_schedule':
      return `Ran "${a.title}".`;
    case 'delete_schedule':
      return e.state === 'confirm'
        ? `Asked to confirm deleting "${a.title}".`
        : `Deleted "${a.title}".`;
    case 'add_tasks':
      return `Added ${a.tasks.length} task${a.tasks.length > 1 ? 's' : ''}.`;
    case 'complete_task':
      return `Marked "${a.title}" done.`;
  }
}
