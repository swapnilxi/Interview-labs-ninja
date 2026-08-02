'use client';

/**
 * Guest-mode (IndexedDB-backed) implementation of the manual-CRUD subset of
 * todoService. AI-powered methods (dive deeper, brain dump, copilot, etc.)
 * are NOT implemented here — guests never call them; todoService always
 * routes those to the remote adapter, which the backend rejects with 401
 * for anyone not logged in.
 */

import { nextId, getAll, getAllByIndex, get, put, remove } from './db';
import type { Task, TaskCreatePayload, TaskUpdatePayload, Note } from '../todoService';

interface StoredTask extends Omit<Task, 'children'> {}

function buildTree(flat: StoredTask[]): Task[] {
  const byId = new Map<number, Task>();
  for (const t of flat) byId.set(t.id, { ...t, children: [] });

  const roots: Task[] = [];
  for (const t of flat) {
    const node = byId.get(t.id)!;
    if (t.parent_id != null && byId.has(t.parent_id)) {
      byId.get(t.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function collectDescendantIds(taskId: number): Promise<number[]> {
  const children = await getAllByIndex<StoredTask>('tasks', 'parent_id', taskId);
  let ids: number[] = [];
  for (const c of children) {
    ids.push(c.id);
    ids = ids.concat(await collectDescendantIds(c.id));
  }
  return ids;
}

export const localTodoAdapter = {
  async fetchTaskTree(): Promise<Task[]> {
    const flat = await getAll<StoredTask>('tasks');
    return buildTree(flat);
  },

  async fetchTask(id: number): Promise<Task | null> {
    const t = await get<StoredTask>('tasks', id);
    return t ? { ...t, children: [] } : null;
  },

  async createTask(data: TaskCreatePayload): Promise<Task | null> {
    const id = await nextId();
    const now = new Date().toISOString();
    let depth_level = 1;
    if (data.parent_id != null) {
      const parent = await get<StoredTask>('tasks', data.parent_id);
      if (parent) depth_level = parent.depth_level + 1;
    }
    const task: StoredTask = {
      id,
      parent_id: data.parent_id ?? null,
      title: data.title,
      status: data.status ?? 'backlog',
      priority: data.priority ?? 'p3',
      time_estimate: data.time_estimate ?? null,
      due_date: data.due_date ?? null,
      generation_type: 'manual',
      depth_level,
      context: data.context ?? null,
      attachments: data.attachments ?? [],
      created_at: now,
      updated_at: now,
      intention: data.intention ?? null,
      definition_of_done: data.definition_of_done ?? null,
      is_recurring: false,
      recurrence_interval: data.recurrence_interval ?? null,
      recurrence_custom_days: data.recurrence_custom_days ?? null,
      recurrence_template_id: null,
      last_activity_at: now,
      pareto_score: null,
      is_top_20: false,
      pareto_reason: null,
      pareto_locked: false,
      eisenhower_quadrant: data.eisenhower_quadrant ?? null,
    };
    await put('tasks', task);
    return { ...task, children: [] };
  },

  async updateTask(taskId: number, data: TaskUpdatePayload): Promise<Task | null> {
    const existing = await get<StoredTask>('tasks', taskId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const wasDone = existing.status === 'done';
    const { is_recurring, ...restData } = data;
    const updated: StoredTask = {
      ...existing,
      ...restData,
      ...(is_recurring !== undefined ? { is_recurring: !!is_recurring } : {}),
      updated_at: now,
      last_activity_at: now,
    };
    if ('is_top_20' in data) updated.pareto_locked = true;
    await put('tasks', updated);

    if (!wasDone && updated.status === 'done') {
      await bumpStat(1);
    } else if (wasDone && updated.status !== 'done') {
      await bumpStat(-1);
    }
    return { ...updated, children: [] };
  },

  async deleteTask(taskId: number): Promise<boolean> {
    const existing = await get<StoredTask>('tasks', taskId);
    if (!existing) return false;
    const descendantIds = await collectDescendantIds(taskId);
    for (const id of descendantIds) await remove('tasks', id);
    await remove('tasks', taskId);
    return true;
  },

  async fetchNotes(taskId: number): Promise<Note[]> {
    const notes = await getAllByIndex<Note>('task_notes', 'task_id', taskId);
    return notes.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  async moveToQuick(taskId: number): Promise<any> {
    const task = await localTodoAdapter.fetchTask(taskId);
    if (!task) return null;
    const id = await nextId();
    const today = new Date().toISOString().slice(0, 10);
    const qt = {
      id, title: task.title, done: false, quadrant: 'do_now' as const, date: today,
      source: 'moved_from_smart' as const, original_task_id: taskId, order_index: 0,
      created_at: new Date().toISOString(), pareto_score: null, is_top_20: false,
    };
    await put('quick_tasks', qt);
    return { status: 'moved', quick_task: qt };
  },

  async moveToPlan(taskId: number): Promise<any> {
    const task = await localTodoAdapter.fetchTask(taskId);
    if (!task) return null;
    const { localProjectAdapter } = await import('./localProjectAdapter');
    const project = await localProjectAdapter.createProject({
      title: task.title,
      description: task.context || `Created from task: ${task.title}`,
      priority: task.priority,
    });
    return { status: 'moved', project };
  },

  async createNote(taskId: number, content: string): Promise<Note | null> {
    const task = await get<StoredTask>('tasks', taskId);
    if (!task) return null;
    const id = await nextId();
    const now = new Date().toISOString();
    const note: Note = { id, task_id: taskId, content, note_type: 'manual', created_at: now };
    await put('task_notes', note);
    await put('tasks', { ...task, last_activity_at: now, updated_at: now });
    return note;
  },

  async bulkSaveTasks(tasks: any[]): Promise<any> {
    const tempToDb = new Map<number, number>();
    const unprocessed = [...tasks];
    let loops = 0;
    const maxLoops = unprocessed.length * 3 + 1;
    while (unprocessed.length && loops < maxLoops) {
      loops++;
      const current = unprocessed.shift();
      if (current.parent_temp_id == null) {
        const created = await localTodoAdapter.createTask({
          title: current.title, priority: current.priority, time_estimate: current.time_estimate, context: current.context,
        });
        if (created) tempToDb.set(current.temp_id, created.id);
      } else if (tempToDb.has(current.parent_temp_id)) {
        const created = await localTodoAdapter.createTask({
          title: current.title, priority: current.priority, time_estimate: current.time_estimate, context: current.context,
          parent_id: tempToDb.get(current.parent_temp_id),
        });
        if (created) tempToDb.set(current.temp_id, created.id);
      } else {
        unprocessed.push(current);
      }
    }
    return { status: 'success', count: tasks.length };
  },

  async createInboxItem(content: string): Promise<any> {
    const id = await nextId();
    const item = { id, content, created_at: new Date().toISOString() };
    await put('inbox', item);
    return item;
  },

  async getInboxItems(): Promise<any[]> {
    const items = await getAll<any>('inbox');
    return items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  async deleteInboxItem(id: number): Promise<any> {
    await remove('inbox', id);
    return { status: 'deleted', id };
  },

  async getDailyPlan(): Promise<{ status: 'none' | 'active'; plan: any | null }> {
    const today = new Date().toISOString().slice(0, 10);
    const plan = await get<any>('daily_plans', today);
    if (!plan) return { status: 'none', plan: null };
    const tasks: Task[] = [];
    for (const tid of plan.task_ids || []) {
      const t = await localTodoAdapter.fetchTask(tid);
      if (t) tasks.push(t);
    }
    return { status: 'active', plan: { ...plan, tasks } };
  },

  async saveDailyPlan(availableHours: number, taskIds: number[], reasoning: Record<number, string>): Promise<any> {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const plan = {
      id: today, plan_date: today, available_hours: availableHours, task_ids: taskIds, reasoning,
      created_at: now, updated_at: now,
    };
    await put('daily_plans', plan);
    const tasks: Task[] = [];
    for (const tid of taskIds) {
      const t = await localTodoAdapter.fetchTask(tid);
      if (t) tasks.push(t);
    }
    return { ...plan, tasks };
  },

  /** No AI encouragement text for guests (that's an AI feature, login-gated) — just archives/reschedules. */
  async endDaily(
    completedTaskIds: number[],
    incompleteReschedule: Record<number, 'tomorrow' | 'next_week' | 'remove'>,
  ): Promise<any> {
    for (const [tidStr, action] of Object.entries(incompleteReschedule)) {
      const tid = Number(tidStr);
      if (action === 'tomorrow' || action === 'next_week') {
        const days = action === 'tomorrow' ? 1 : 7;
        const due = new Date();
        due.setDate(due.getDate() + days);
        await localTodoAdapter.updateTask(tid, { due_date: due.toISOString().slice(0, 10) });
      }
    }
    return {
      summary: `Nice work completing ${completedTaskIds.length} task(s) today! Log in to get an AI-generated recap.`,
      completed_count: completedTaskIds.length,
      incomplete_count: Object.keys(incompleteReschedule).length,
      top20_incomplete_count: 0,
      top20_warning: null,
    };
  },

  async getStats(): Promise<{ completed_today: number; streak: number; last_7_days: number[]; last_7_dates: string[] }> {
    const statsRows = await getAll<{ key: string; value: number }>('meta');
    const map = new Map<string, number>();
    for (const row of statsRows) {
      if (row.key.startsWith('stat_')) map.set(row.key.slice(5), row.value);
    }
    const today = new Date();
    const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
    const todayStr = toDateStr(today);

    let streak = 0;
    const cursor = new Date(today);
    if ((map.get(todayStr) || 0) > 0) {
      streak = 1;
      cursor.setDate(cursor.getDate() - 1);
      while ((map.get(toDateStr(cursor)) || 0) > 0) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    } else {
      cursor.setDate(cursor.getDate() - 1);
      if ((map.get(toDateStr(cursor)) || 0) > 0) {
        streak = 1;
        cursor.setDate(cursor.getDate() - 1);
        while ((map.get(toDateStr(cursor)) || 0) > 0) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
        }
      }
    }

    const last7Days: number[] = [];
    const last7Dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      last7Days.push(map.get(toDateStr(d)) || 0);
      last7Dates.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }

    return {
      completed_today: map.get(todayStr) || 0,
      streak,
      last_7_days: last7Days,
      last_7_dates: last7Dates,
    };
  },
};

async function bumpStat(delta: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `stat_${today}`;
  const current = await get<{ key: string; value: number }>('meta', key);
  const value = Math.max(0, (current?.value || 0) + delta);
  await put('meta', { key, value });
}
