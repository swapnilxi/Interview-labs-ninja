'use client';

/**
 * Todo API service — mirrors the backend /todo/* endpoints.
 * Follows the same pattern as questionsService.ts.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Task {
  id: number;
  parent_id: number | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  time_estimate: string | null;
  due_date: string | null;
  generation_type: GenerationType;
  depth_level: number;
  context: string | null;
  attachments: string[];
  created_at: string;
  updated_at: string;
  children: Task[];
}

export type TaskStatus = 'backlog' | 'in_progress' | 'delayed' | 'done' | 'not_done';
export type TaskPriority = 'p1' | 'p2' | 'p3' | 'p4';
export type GenerationType = 'manual' | 'dive_deeper' | 'chunk';
export type ViewMode = 'tree' | 'list' | 'focus';

export interface TaskCreatePayload {
  title: string;
  parent_id?: number | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  time_estimate?: string | null;
  due_date?: string | null;
  context?: string | null;
  attachments?: string[];
}

export interface TaskUpdatePayload {
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  time_estimate?: string | null;
  due_date?: string | null;
  context?: string | null;
  attachments?: string[];
}

// ── Status & Priority config ─────────────────────────────────────────────────

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgClass: string }> = {
  backlog:      { label: 'Backlog',     color: '#9ca3af', bgClass: 'bg-gray-400/15 text-gray-500 dark:text-gray-400' },
  in_progress:  { label: 'In Progress', color: '#3b82f6', bgClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  delayed:      { label: 'Delayed',     color: '#f59e0b', bgClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  done:         { label: 'Done',        color: '#22c55e', bgClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  not_done:     { label: 'Not Done',    color: '#ef4444', bgClass: 'bg-red-500/15 text-red-600 dark:text-red-400' },
};

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dotClass: string }> = {
  p1: { label: 'P1 Critical', color: '#ef4444', dotClass: 'bg-red-500' },
  p2: { label: 'P2 High',     color: '#f59e0b', dotClass: 'bg-amber-500' },
  p3: { label: 'P3 Medium',   color: '#eab308', dotClass: 'bg-yellow-500' },
  p4: { label: 'P4 Low',      color: '#9ca3af', dotClass: 'bg-gray-400' },
};

export const DEPTH_COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899'];
export const DEPTH_LABELS = ['blue', 'purple', 'teal', 'amber', 'pink'];

export function getDepthColor(depth: number): string {
  return DEPTH_COLORS[Math.min(depth - 1, DEPTH_COLORS.length - 1)];
}

// ── Due date helpers ─────────────────────────────────────────────────────────

export function getRelativeDueDate(dueDateStr: string | null): { text: string; isOverdue: boolean; isDueToday: boolean } | null {
  if (!dueDateStr) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true, isDueToday: false };
  if (diffDays === 0) return { text: 'Due today', isOverdue: false, isDueToday: true };
  if (diffDays === 1) return { text: 'Due tomorrow', isOverdue: false, isDueToday: false };
  if (diffDays <= 7) return { text: `Due in ${diffDays}d`, isOverdue: false, isDueToday: false };
  return { text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isOverdue: false, isDueToday: false };
}

// ── Tree helpers ─────────────────────────────────────────────────────────────

export function flattenTree(tasks: Task[]): Task[] {
  const result: Task[] = [];
  function walk(nodes: Task[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) walk(node.children);
    }
  }
  walk(tasks);
  return result;
}

export function getBreadcrumb(taskId: number, allTasks: Task[]): { id: number; title: string }[] {
  const flat = flattenTree(allTasks);
  const byId = new Map(flat.map(t => [t.id, t]));
  const crumbs: { id: number; title: string }[] = [];
  let current = byId.get(taskId);
  while (current) {
    crumbs.unshift({ id: current.id, title: current.title });
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return crumbs;
}

export function computeProgress(task: Task): number {
  if (!task.children?.length) return task.status === 'done' ? 100 : 0;
  const done = task.children.filter(c => c.status === 'done').length;
  return Math.round((done / task.children.length) * 100);
}

export function parseTimeEstimateMinutes(est: string | null): number | null {
  if (!est) return null;
  const lower = est.toLowerCase().trim();
  const hMatch = lower.match(/(\d+)\s*h/);
  const mMatch = lower.match(/(\d+)\s*m/);
  let total = 0;
  if (hMatch) total += parseInt(hMatch[1]) * 60;
  if (mMatch) total += parseInt(mMatch[1]);
  if (total === 0 && /^\d+$/.test(lower)) total = parseInt(lower);
  return total > 0 ? total : null;
}

// ── API Service ──────────────────────────────────────────────────────────────

export const todoService = {
  async fetchTaskTree(): Promise<Task[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to fetch task tree:', error);
      return [];
    }
  },

  async fetchChildren(taskId: number): Promise<Task[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/children`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to fetch children for task ${taskId}:`, error);
      return [];
    }
  },

  async createTask(data: TaskCreatePayload): Promise<Task | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const task = await res.json();
      task.children = [];
      return task;
    } catch (error) {
      console.error('Failed to create task:', error);
      return null;
    }
  },

  async updateTask(taskId: number, data: TaskUpdatePayload): Promise<Task | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to update task ${taskId}:`, error);
      return null;
    }
  },

  async deleteTask(taskId: number): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}`, { method: 'DELETE' });
      return res.ok;
    } catch (error) {
      console.error(`Failed to delete task ${taskId}:`, error);
      return false;
    }
  },

  async diveDeeper(taskId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<Task[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/dive-deeper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.subtasks || []).map((s: Task) => ({ ...s, children: [] }));
    } catch (error) {
      console.error(`Failed to dive deeper on task ${taskId}:`, error);
      return [];
    }
  },

  async chunkIt(taskId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<Task[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/chunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.subtasks || []).map((s: Task) => ({ ...s, children: [] }));
    } catch (error) {
      console.error(`Failed to chunk task ${taskId}:`, error);
      return [];
    }
  },

  async regenerate(taskId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<Task[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.subtasks || []).map((s: Task) => ({ ...s, children: [] }));
    } catch (error) {
      console.error(`Failed to regenerate task ${taskId}:`, error);
      return [];
    }
  },

  async uploadContext(file: File): Promise<{ filename: string; extracted_text: string } | null> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE_URL}/todo/tasks/upload-context`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to upload context:', error);
      return null;
    }
  },

  async askCopilot(question: string, model: 'ollama' | 'gemini' = 'gemini'): Promise<string> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/copilot/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.answer || '';
    } catch (error) {
      console.error('Failed to ask copilot:', error);
      return 'Sorry, I could not process your question. Please check if the backend is running.';
    }
  },
};
