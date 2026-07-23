'use client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type QuadrantType = 'do_now' | 'schedule' | 'delegate' | 'eliminate';
export type QuickTaskSource = 'manual' | 'brain_dump' | 'handwriting' | 'moved_from_smart' | 'moved_from_plan';

export interface QuickTask {
  id: number;
  title: string;
  done: boolean;
  quadrant: QuadrantType | null;
  date: string;
  source: QuickTaskSource;
  original_task_id: number | null;
  order_index: number;
  created_at: string;
  pareto_score: number | null;
  is_top_20: boolean;
  is_exported?: boolean;
  exported_task_id?: number | null;
  exported_project_id?: number | null;
}

export interface QuickTaskCreate {
  title: string;
  quadrant?: QuadrantType;
  source?: QuickTaskSource;
}

export interface QuickTaskUpdate {
  title?: string;
  done?: boolean;
  quadrant?: QuadrantType | null;
  order_index?: number;
  is_top_20?: boolean;
  pareto_score?: number | null;
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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/today`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch quick tasks', err);
      return [];
    }
  },

  async createTask(data: QuickTaskCreate): Promise<QuickTask | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete quick task ${id}`, err);
      return false;
    }
  },

  async moveToSmart(id: number): Promise<any | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/${id}/move-to-smart`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to move quick task ${id} to smart`, err);
      return null;
    }
  },

  async moveToPlan(id: number): Promise<any | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/${id}/move-to-plan`, { method: 'POST' });
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
    formData.append('model', model);
    const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/brain-dump-upload`, {
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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/bulk-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/eisenhower-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to auto-sort quick tasks', err);
      return { assignments: [] };
    }
  },

  async aiDayPlan(available_hours: number, model: 'ollama' | 'gemini'): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/ai-day-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_hours, model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to generate AI day plan', err);
      return { plan: [] };
    }
  },

  async endOfDay(model: 'ollama' | 'gemini' = 'gemini'): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/end-of-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to run end of day', err);
      return null;
    }
  }
};
