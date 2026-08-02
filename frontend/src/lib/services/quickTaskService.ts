'use client';

import { parseApiError } from './todoService';
import { aiRequestFields } from './settingsService';
import { apiFetch } from '../http/apiClient';
import { isLoggedIn } from '../auth/tokenStore';
import { localQuickTaskAdapter } from './local/localQuickTaskAdapter';

export type QuadrantType = 'do_now' | 'schedule' | 'delegate' | 'eliminate';
export type QuickTaskSource = 'manual' | 'brain_dump' | 'handwriting' | 'moved_from_smart' | 'moved_from_plan';

export interface QuickTask {
  id: number;
  title: string;
  done: boolean;
  quadrant: QuadrantType | null;
  date: string;
  due_date?: string | null;
  time_estimate?: string | null;
  source: QuickTaskSource;
  original_task_id: number | null;
  order_index: number;
  created_at: string;
  pareto_score: number | null;
  is_top_20: boolean;
  pareto_reason?: string | null;
  pareto_locked?: boolean;
  is_exported?: boolean;
  exported_task_id?: number | null;
  exported_project_id?: number | null;
  context?: string | null;
}

export interface QuickTaskCreate {
  title: string;
  quadrant?: QuadrantType;
  source?: QuickTaskSource;
  due_date?: string | null;
  time_estimate?: string | null;
}

export interface QuickTaskUpdate {
  title?: string;
  done?: boolean;
  quadrant?: QuadrantType | null;
  order_index?: number;
  is_top_20?: boolean;
  pareto_score?: number | null;
  pareto_reason?: string | null;
  due_date?: string | null;
  time_estimate?: string | null;
  context?: string | null;
}

export interface ParsedBrainDumpTask {
  title: string;
  quadrant: QuadrantType;
  time_estimate: string | null;
  context: string | null;
}

export interface BrainDumpResult {
  extracted_text: string;
  parsed_tasks: ParsedBrainDumpTask[];
  count: number;
  warning?: string;
}

export const quickTaskService = {
  async fetchTodayTasks(): Promise<QuickTask[]> {
    if (!isLoggedIn()) return localQuickTaskAdapter.fetchTodayTasks();
    try {
      const res = await apiFetch('/todo/quick-tasks/today');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch quick tasks', err);
      return [];
    }
  },

  async createTask(data: QuickTaskCreate): Promise<QuickTask | null> {
    if (!isLoggedIn()) return localQuickTaskAdapter.createTask(data);
    try {
      const res = await apiFetch('/todo/quick-tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to create quick task', err);
      return null;
    }
  },

  async updateTask(id: number, data: QuickTaskUpdate): Promise<QuickTask | null> {
    if (!isLoggedIn()) return localQuickTaskAdapter.updateTask(id, data);
    try {
      const res = await apiFetch(`/todo/quick-tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to update quick task ${id}`, err);
      return null;
    }
  },

  async deleteTask(id: number): Promise<boolean> {
    if (!isLoggedIn()) return localQuickTaskAdapter.deleteTask(id);
    try {
      const res = await apiFetch(`/todo/quick-tasks/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete quick task ${id}`, err);
      return false;
    }
  },

  async moveToSmart(id: number): Promise<any | null> {
    if (!isLoggedIn()) return localQuickTaskAdapter.moveToSmart(id);
    try {
      const res = await apiFetch(`/todo/quick-tasks/${id}/move-to-smart`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to move quick task ${id} to smart`, err);
      return null;
    }
  },

  async moveToPlan(id: number): Promise<any | null> {
    if (!isLoggedIn()) return localQuickTaskAdapter.moveToPlan(id);
    try {
      const res = await apiFetch(`/todo/quick-tasks/${id}/move-to-plan`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to move quick task ${id} to plan`, err);
      return null;
    }
  },

  /** Upload handwriting image/PDF brain dump → vision AI extract → task parse preview */
  async brainDumpUpload(file: File, model: 'ollama' | 'gemini'): Promise<BrainDumpResult> {
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(aiRequestFields(model)).forEach(([key, value]) => formData.append(key, value));
    const res = await apiFetch('/todo/quick-tasks/brain-dump-upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /** Bulk-save confirmed brain dump tasks */
  async bulkCreate(tasks: ParsedBrainDumpTask[]): Promise<{ created: QuickTask[]; count: number } | null> {
    if (!isLoggedIn()) return localQuickTaskAdapter.bulkCreate(tasks);
    try {
      const res = await apiFetch('/todo/quick-tasks/bulk-create', {
        method: 'POST',
        body: JSON.stringify({ tasks }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Bulk create failed', err);
      return null;
    }
  },

  async autoSort(model: 'ollama' | 'gemini'): Promise<any> {
    const res = await apiFetch('/todo/quick-tasks/eisenhower-auto', {
      method: 'POST',
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  async aiDayPlan(available_hours: number, model: 'ollama' | 'gemini'): Promise<any> {
    const res = await apiFetch('/todo/quick-tasks/ai-day-plan', {
      method: 'POST',
      body: JSON.stringify({ available_hours, ...aiRequestFields(model) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  async endOfDay(
    model: 'ollama' | 'gemini' = 'gemini',
    selections: { move_to_tomorrow?: number[]; move_to_smart?: number[]; discard?: number[] } = {}
  ): Promise<any> {
    const res = await apiFetch('/todo/quick-tasks/end-of-day', {
      method: 'POST',
      body: JSON.stringify({
        move_to_tomorrow: selections.move_to_tomorrow || [],
        move_to_smart: selections.move_to_smart || [],
        discard: selections.discard || [],
        ...aiRequestFields(model),
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  }
};
