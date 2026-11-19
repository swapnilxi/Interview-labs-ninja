/**
 * fe-apis/todo/routines/handlers.ts
 *
 * TypeScript twin of backend/modules/ai_todo/routines/router.py (To-Do Routines: groups of things you tick off each
 * day — Dailies plus the groups a user makes). Limits, status codes and error texts are copied verbatim, so change both.
 *
 *   GET    /todo/routines                          groups with their items (Dailies first; made on first read)
 *   POST   /todo/routines/groups                   new group {name, days?}
 *   PATCH  /todo/routines/groups/:group_id         rename, set days, switch on for a date (active_on)
 *   DELETE /todo/routines/groups/:group_id         delete a group and its items (not Dailies)
 *   POST   /todo/routines/groups/:group_id/items   add an item {title, priority?, notes?}
 *   PATCH  /todo/routines/items/:item_id           edit, tick for a date (done_on), move to another group (group_id)
 *   DELETE /todo/routines/items/:item_id           delete an item
 *   POST   /todo/routines/items/:item_id/move-out  item -> a To-Do task (to='task', due_date?) or Quick Daily (to='quick')
 *   POST   /todo/tasks/:task_id/move-to-routine    To-Do task -> a group {group_id} (subtasks are deleted with it)
 *   POST   /todo/quick-tasks/:task_id/move-to-routine  Quick Daily task -> a group {group_id}
 */

import { pushLocalWrite } from '@/lib/server/neonSync';
import { HttpError, patchUpdates, type Row } from '../_shared';
import type { TodoCtx, TodoRoute } from '../router';
import { createQuickTask, deleteQuickTask, getQuickTask } from '../quick/db';
import { createTask, deleteTask, getTask } from '../tasks/db';
import {
  countGroups,
  countItems,
  createGroup,
  createItem,
  deleteGroup,
  deleteItem,
  ensureDailies,
  getGroup,
  getItem,
  listGroups,
  updateGroup,
  updateItem,
} from './db';

const NAME_MAX = 60;
const TITLE_MAX = 200;
const NOTES_MAX = 2000;
const GROUPS_MAX = 30;
const ITEMS_MAX = 100;
const PRIORITIES = ['p1', 'p2', 'p3', 'p4'];
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const GROUP_NULLABLE: ReadonlySet<string> = new Set(['days', 'active_on']);
const ITEM_NULLABLE: ReadonlySet<string> = new Set(['notes', 'done_on']);

// ── Request bodies (the Pydantic models, lax mode; 422 like FastAPI) ─────────

type Kind = 'str' | 'int' | 'intList';
interface Field {
  kind: Kind;
  required?: boolean;
  nullable?: boolean;
}

const LABEL: Record<Kind, string> = {
  str: 'a valid string',
  int: 'a valid integer',
  intList: 'a valid list of integers',
};

function asInt(value: unknown): number | undefined {
  const n =
    typeof value === 'boolean'
      ? Number(value)
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : value;
  return typeof n === 'number' && Number.isInteger(n) ? n : undefined;
}

function coerce(value: unknown, kind: Kind): unknown {
  if (kind === 'str') return typeof value === 'string' ? value : undefined;
  if (kind === 'int') return asInt(value);
  if (!Array.isArray(value)) return undefined;
  const out = value.map(asInt);
  return out.every((n) => n !== undefined) ? out : undefined;
}

async function readBody(ctx: TodoCtx, spec: Record<string, Field>): Promise<Row> {
  const body = await ctx.json<unknown>();
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new HttpError(422, 'Input should be a valid dictionary');
  const src = body as Row;
  const out: Row = {};
  for (const [key, { kind, required, nullable }] of Object.entries(spec)) {
    if (!(key in src)) {
      if (required) throw new HttpError(422, `${key}: Field required`);
      continue;
    }
    const value = src[key] === null && nullable ? null : coerce(src[key], kind);
    if (value === undefined) throw new HttpError(422, `${key}: Input should be ${LABEL[kind]}`);
    out[key] = value;
  }
  return out;
}

const GROUP_CREATE: Record<string, Field> = {
  name: { kind: 'str', required: true },
  days: { kind: 'intList', nullable: true },
};
const GROUP_UPDATE: Record<string, Field> = {
  name: { kind: 'str', nullable: true },
  days: { kind: 'intList', nullable: true },
  active_on: { kind: 'str', nullable: true },
};
const ITEM_CREATE: Record<string, Field> = {
  title: { kind: 'str', required: true },
  priority: { kind: 'str' },
  notes: { kind: 'str', nullable: true },
};
const ITEM_UPDATE: Record<string, Field> = {
  title: { kind: 'str', nullable: true },
  priority: { kind: 'str', nullable: true },
  notes: { kind: 'str', nullable: true },
  done_on: { kind: 'str', nullable: true },
  group_id: { kind: 'int', nullable: true },
};
const MOVE_OUT: Record<string, Field> = {
  to: { kind: 'str', required: true },
  due_date: { kind: 'str', nullable: true },
};
const MOVE_IN: Record<string, Field> = { group_id: { kind: 'int', required: true } };

// ── Validation (same texts as the Python router) ─────────────────────────────

/** Python's len() counts code points, not UTF-16 units. */
const length = (s: string) => Array.from(s).length;

function checkedName(value: unknown): string {
  const name = (typeof value === 'string' ? value : '').trim();
  if (!name) throw new HttpError(400, 'Give the group a name.');
  if (length(name) > NAME_MAX) throw new HttpError(400, `Keep the name to ${NAME_MAX} characters.`);
  return name;
}

function checkedTitle(value: unknown): string {
  const title = (typeof value === 'string' ? value : '').trim();
  if (!title) throw new HttpError(400, 'Write what to do.');
  if (length(title) > TITLE_MAX) throw new HttpError(400, `Keep it to ${TITLE_MAX} characters.`);
  return title;
}

function checkedNotes(value: unknown): string | null {
  const notes = (typeof value === 'string' ? value : '').trim();
  if (length(notes) > NOTES_MAX) throw new HttpError(400, `Keep notes to ${NOTES_MAX} characters.`);
  return notes || null;
}

function checkedPriority(value: unknown): string {
  if (typeof value !== 'string' || !PRIORITIES.includes(value))
    throw new HttpError(400, 'Priority must be p1, p2, p3 or p4.');
  return value;
}

function checkedDays(value: number[] | null | undefined): number[] | null {
  if (value === null || value === undefined) return null;
  if (value.some((d) => d < 0 || d > 6))
    throw new HttpError(400, 'Days are 0 (Sunday) to 6 (Saturday).');
  const days = [...new Set(value)].sort((a, b) => a - b);
  return days.length ? days : null;
}

function checkedDate(value: string | null | undefined, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (!DATE_RE.test(value)) throw new HttpError(400, `${field} must be a date like 2026-11-17.`);
  return value;
}

function requireGroup(groupId: number, userId: number): Row {
  const group = getGroup(groupId, userId);
  if (!group) throw new HttpError(404, 'Routine group not found');
  return group;
}

function requireItem(itemId: number, userId: number): Row {
  const item = getItem(itemId, userId);
  if (!item) throw new HttpError(404, 'Routine item not found');
  return item;
}

function requireRoom(groupId: number, userId: number): void {
  if (countItems(groupId, userId) >= ITEMS_MAX)
    throw new HttpError(400, `A group holds up to ${ITEMS_MAX} items.`);
}

/** Port of `_carried`: text taken over from a task when it moves in, trimmed and cut to the routine's limit. */
function carried(value: unknown, limit: number): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return Array.from(text).slice(0, limit).join('') || null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  {
    method: 'GET',
    path: '/routines',
    handler: async (ctx) => {
      // GETs skip the Neon push (index.ts), so a Dailies made on this read is pushed here, once, or a cold start on
      // Vercel would lose it while the browser already holds its id.
      if (ensureDailies(ctx.userId)) await pushLocalWrite();
      return listGroups(ctx.userId);
    },
  },

  {
    method: 'POST',
    path: '/routines/groups',
    handler: async (ctx) => {
      const body = await readBody(ctx, GROUP_CREATE);
      const name = checkedName(body.name);
      const days = checkedDays(body.days);
      if (countGroups(ctx.userId) >= GROUPS_MAX)
        throw new HttpError(400, `You can have up to ${GROUPS_MAX} routine groups.`);
      return createGroup(ctx.userId, name, { days });
    },
  },

  {
    method: 'PATCH',
    path: '/routines/groups/:group_id',
    handler: async (ctx) => {
      const groupId = ctx.intParam('group_id');
      const body = await readBody(ctx, GROUP_UPDATE);
      const group = requireGroup(groupId, ctx.userId);
      const updates = patchUpdates(body, GROUP_NULLABLE);
      if ('name' in updates) updates.name = checkedName(updates.name);
      if ('days' in updates) updates.days = checkedDays(updates.days);
      if ('active_on' in updates) updates.active_on = checkedDate(updates.active_on, 'active_on');
      if (group.kind === 'dailies' && ('days' in updates || 'active_on' in updates)) {
        throw new HttpError(400, 'Dailies are on every day.');
      }
      const updated = updateGroup(groupId, ctx.userId, updates);
      if (!updated) throw new HttpError(404, 'Routine group not found');
      return updated;
    },
  },

  {
    method: 'DELETE',
    path: '/routines/groups/:group_id',
    handler: (ctx) => {
      const groupId = ctx.intParam('group_id');
      const group = requireGroup(groupId, ctx.userId);
      if (group.kind === 'dailies') throw new HttpError(400, "Dailies can't be deleted.");
      deleteGroup(groupId, ctx.userId);
      return { status: 'deleted', id: groupId };
    },
  },

  {
    method: 'POST',
    path: '/routines/groups/:group_id/items',
    handler: async (ctx) => {
      const groupId = ctx.intParam('group_id');
      const body = await readBody(ctx, ITEM_CREATE);
      requireGroup(groupId, ctx.userId);
      const title = checkedTitle(body.title);
      const priority = checkedPriority(body.priority ?? 'p3');
      const notes = checkedNotes(body.notes);
      requireRoom(groupId, ctx.userId);
      return createItem(ctx.userId, groupId, title, { priority, notes });
    },
  },

  {
    method: 'PATCH',
    path: '/routines/items/:item_id',
    handler: async (ctx) => {
      const itemId = ctx.intParam('item_id');
      const body = await readBody(ctx, ITEM_UPDATE);
      const item = requireItem(itemId, ctx.userId);
      const updates = patchUpdates(body, ITEM_NULLABLE);
      if ('title' in updates) updates.title = checkedTitle(updates.title);
      if ('priority' in updates) updates.priority = checkedPriority(updates.priority);
      if ('notes' in updates) updates.notes = checkedNotes(updates.notes);
      if ('done_on' in updates) updates.done_on = checkedDate(updates.done_on, 'done_on');
      if ('group_id' in updates) {
        if (updates.group_id === item.group_id) delete updates.group_id;
        else {
          requireGroup(updates.group_id, ctx.userId);
          requireRoom(updates.group_id, ctx.userId);
        }
      }
      const updated = updateItem(itemId, ctx.userId, updates);
      if (!updated) throw new HttpError(404, 'Routine item not found');
      return updated;
    },
  },

  {
    method: 'DELETE',
    path: '/routines/items/:item_id',
    handler: (ctx) => {
      const itemId = ctx.intParam('item_id');
      if (!deleteItem(itemId, ctx.userId)) throw new HttpError(404, 'Routine item not found');
      return { status: 'deleted', id: itemId };
    },
  },

  {
    method: 'POST',
    path: '/routines/items/:item_id/move-out',
    handler: async (ctx) => {
      const itemId = ctx.intParam('item_id');
      const body = await readBody(ctx, MOVE_OUT);
      const item = requireItem(itemId, ctx.userId);
      if (body.to === 'task') {
        const dueDate = checkedDate(body.due_date, 'due_date');
        const task = createTask(ctx.userId, item.title, {
          priority: item.priority,
          context: item.notes,
          due_date: dueDate,
        });
        deleteItem(itemId, ctx.userId);
        return { status: 'moved', task };
      }
      if (body.to === 'quick') {
        const quickTask = createQuickTask(ctx.userId, item.title, { source: 'moved_from_routine' });
        deleteItem(itemId, ctx.userId);
        return { status: 'moved', quick_task: quickTask };
      }
      throw new HttpError(400, "Move it to 'task' or 'quick'.");
    },
  },

  {
    method: 'POST',
    path: '/tasks/:task_id/move-to-routine',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const body = await readBody(ctx, MOVE_IN);
      const task = getTask(taskId, ctx.userId);
      if (!task) throw new HttpError(404, 'Task not found');
      requireGroup(body.group_id, ctx.userId);
      requireRoom(body.group_id, ctx.userId);
      const priority = PRIORITIES.includes(task.priority) ? task.priority : 'p3';
      const item = createItem(
        ctx.userId,
        body.group_id,
        carried(task.title, TITLE_MAX) || 'Untitled',
        {
          priority,
          notes: carried(task.context, NOTES_MAX),
        }
      );
      deleteTask(taskId, ctx.userId);
      return { status: 'moved', item };
    },
  },

  {
    method: 'POST',
    path: '/quick-tasks/:task_id/move-to-routine',
    handler: async (ctx) => {
      const taskId = ctx.intParam('task_id');
      const body = await readBody(ctx, MOVE_IN);
      const quickTask = getQuickTask(taskId, ctx.userId);
      if (!quickTask) throw new HttpError(404, 'Quick task not found');
      requireGroup(body.group_id, ctx.userId);
      requireRoom(body.group_id, ctx.userId);
      const item = createItem(
        ctx.userId,
        body.group_id,
        carried(quickTask.title, TITLE_MAX) || 'Untitled',
        {
          priority: 'p3',
          notes: carried(quickTask.context, NOTES_MAX),
        }
      );
      deleteQuickTask(taskId, ctx.userId);
      return { status: 'moved', item };
    },
  },
];
