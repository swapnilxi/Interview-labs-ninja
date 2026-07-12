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

  async endOfDay(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/quick-tasks/end-of-day`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to run end of day', err);
      return null;
    }
  }
};
