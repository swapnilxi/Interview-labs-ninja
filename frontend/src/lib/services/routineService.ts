'use client';

/**
 * Routines API: `/todo/routines/*` (backend/modules/ai_todo/routines ↔ fe-apis/todo/routines). Dailies plus the groups a
 * user makes (Weekdays, Weekend, Deployment eve), each a list you tick off per day. Login-only like the rest of the
 * To-Do, so there is no guest branch. Every method throws a readable Error; callers show it.
 */

import {
  TASKS_CHANGED_EVENT,
  todoApiError,
  todoFetch,
  type Task,
  type TaskPriority,
} from './todoService';

export interface RoutineItem {
  id: number;
  group_id: number;
  title: string;
  priority: TaskPriority;
  notes: string | null;
  /** The local date (YYYY-MM-DD) it was last ticked; done today when it equals today's date. */
  done_on: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface RoutineGroup {
  id: number;
  name: string;
  /** 'dailies' = the group every user has, on every day; 'custom' = one the user made. */
  kind: 'dailies' | 'custom';
  /** Weekdays the group is on, 0 = Sunday … 6 = Saturday; null = none (only when switched on). */
  days: number[] | null;
  /** A local date the user switched the group on for. */
  active_on: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
  items: RoutineItem[];
}

export interface RoutineGroupPatch {
  name?: string;
  days?: number[] | null;
  active_on?: string | null;
}

export interface RoutineItemPatch {
  title?: string;
  priority?: TaskPriority;
  notes?: string | null;
  done_on?: string | null;
  group_id?: number;
}

/** Fired after any routine change in this tab, so the Today section and the Routines tab stay in step. */
export const ROUTINES_CHANGED_EVENT = 'todo:routines-changed';

function emit(tasksToo = false) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ROUTINES_CHANGED_EVENT));
  if (tasksToo) window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await todoFetch(path, init);
  if (!res.ok) throw new Error(await todoApiError(res));
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const routineService = {
  list(): Promise<RoutineGroup[]> {
    return send<RoutineGroup[]>('/todo/routines');
  },

  async createGroup(name: string, days: number[] | null): Promise<RoutineGroup> {
    const group = await send<RoutineGroup>('/todo/routines/groups', json('POST', { name, days }));
    emit();
    return group;
  },

  async updateGroup(id: number, patch: RoutineGroupPatch): Promise<RoutineGroup> {
    const group = await send<RoutineGroup>(`/todo/routines/groups/${id}`, json('PATCH', patch));
    emit();
    return group;
  },

  async deleteGroup(id: number): Promise<void> {
    await send(`/todo/routines/groups/${id}`, { method: 'DELETE' });
    emit();
  },

  async createItem(
    groupId: number,
    title: string,
    priority: TaskPriority = 'p3'
  ): Promise<RoutineItem> {
    const item = await send<RoutineItem>(
      `/todo/routines/groups/${groupId}/items`,
      json('POST', { title, priority })
    );
    emit();
    return item;
  },

  async updateItem(id: number, patch: RoutineItemPatch): Promise<RoutineItem> {
    const item = await send<RoutineItem>(`/todo/routines/items/${id}`, json('PATCH', patch));
    emit();
    return item;
  },

  async deleteItem(id: number): Promise<void> {
    await send(`/todo/routines/items/${id}`, { method: 'DELETE' });
    emit();
  },

  /** Out of Routines: into the To-Do as a task (due on `dueDate`, the user's today), or into Quick Daily. */
  async moveOut(
    id: number,
    to: 'task' | 'quick',
    dueDate: string | null = null
  ): Promise<{ task?: Task }> {
    const res = await send<{ task?: Task }>(
      `/todo/routines/items/${id}/move-out`,
      json('POST', { to, due_date: dueDate })
    );
    emit(true);
    return res;
  },

  /** A To-Do task into a group (its subtasks are deleted with it). */
  async moveTaskIn(taskId: number, groupId: number): Promise<RoutineItem> {
    const res = await send<{ item: RoutineItem }>(
      `/todo/tasks/${taskId}/move-to-routine`,
      json('POST', { group_id: groupId })
    );
    emit(true);
    return res.item;
  },

  /** A Quick Daily task into a group. */
  async moveQuickTaskIn(quickTaskId: number, groupId: number): Promise<RoutineItem> {
    const res = await send<{ item: RoutineItem }>(
      `/todo/quick-tasks/${quickTaskId}/move-to-routine`,
      json('POST', { group_id: groupId })
    );
    emit();
    return res.item;
  },
};
