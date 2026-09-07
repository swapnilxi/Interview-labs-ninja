'use client';

/**
 * Guest-mode (IndexedDB-backed) implementation of the manual-CRUD subset of
 * quickTaskService. AI methods (brain-dump upload, auto-sort, AI day plan,
 * end-of-day summary) are NOT implemented here — those go through the remote
 * adapter, which requires login.
 */

import { nextId, getAllByIndex, get, put, remove } from './db';
import type { QuickTask, QuickTaskCreate, QuickTaskUpdate, ParsedBrainDumpTask } from '../quickTaskService';
import { localTodoAdapter } from './localTodoAdapter';
import { localProjectAdapter } from './localProjectAdapter';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const localQuickTaskAdapter = {
  async fetchTodayTasks(): Promise<QuickTask[]> {
    const rows = await getAllByIndex<QuickTask>('quick_tasks', 'date', today());
    return rows.sort((a, b) => a.order_index - b.order_index || a.id - b.id);
  },

  async createTask(data: QuickTaskCreate): Promise<QuickTask | null> {
    const id = await nextId();
    const task: QuickTask = {
      id,
      title: data.title,
      done: false,
      quadrant: data.quadrant ?? 'do_now',
      date: today(),
      due_date: data.due_date ?? null,
      time_estimate: data.time_estimate ?? null,
      source: data.source ?? 'manual',
      original_task_id: null,
      order_index: 0,
      created_at: new Date().toISOString(),
      pareto_score: null,
      is_top_20: false,
    };
    await put('quick_tasks', task);
    return task;
  },

  async updateTask(id: number, data: QuickTaskUpdate): Promise<QuickTask | null> {
    const existing = await get<QuickTask>('quick_tasks', id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    if ('is_top_20' in data) updated.pareto_locked = true;
    await put('quick_tasks', updated);
    return updated;
  },

  async deleteTask(id: number): Promise<boolean> {
    const existing = await get<QuickTask>('quick_tasks', id);
    if (!existing) return false;
    await remove('quick_tasks', id);
    return true;
  },

  async moveToSmart(id: number): Promise<any> {
    const qt = await get<QuickTask>('quick_tasks', id);
    if (!qt) return null;
    const newTask = await localTodoAdapter.createTask({
      title: qt.title,
      context: `Moved from Quick Daily (${qt.date}, local)`,
    });
    if (newTask) {
      await localQuickTaskAdapter.updateTask(id, { } as QuickTaskUpdate);
      await put('quick_tasks', { ...qt, is_exported: true, exported_task_id: newTask.id });
    }
    return { status: 'moved', new_task_id: newTask?.id, task: newTask };
  },

  async moveToPlan(id: number): Promise<any> {
    const qt = await get<QuickTask>('quick_tasks', id);
    if (!qt) return null;
    const project = await localProjectAdapter.createProject({
      title: qt.title,
      description: `Created from Quick Daily task (${qt.date}, local)`,
    });
    if (project) {
      await put('quick_tasks', { ...qt, is_exported: true, exported_project_id: project.id });
    }
    return { status: 'moved', project_id: project?.id, project };
  },

  async bulkCreate(tasks: ParsedBrainDumpTask[]): Promise<{ created: QuickTask[]; count: number } | null> {
    const created: QuickTask[] = [];
    for (const t of tasks) {
      const c = await localQuickTaskAdapter.createTask({
        title: t.title, quadrant: t.quadrant, time_estimate: t.time_estimate ?? undefined, source: 'brain_dump',
      });
      if (c) created.push(c);
    }
    return { created, count: created.length };
  },
};
