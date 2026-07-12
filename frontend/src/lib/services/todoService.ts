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
  intention: string | null;
  definition_of_done: string | null;
  is_recurring: boolean;
  recurrence_interval: string | null;
  recurrence_custom_days: string | null;
  recurrence_template_id: number | null;
  last_activity_at: string | null;
  pareto_score?: number | null;
  is_top_20?: boolean;
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
  intention?: string | null;
  definition_of_done?: string | null;
  is_recurring?: number;
  recurrence_interval?: string | null;
  recurrence_custom_days?: string | null;
}

export interface TaskUpdatePayload {
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  time_estimate?: string | null;
  due_date?: string | null;
  context?: string | null;
  attachments?: string[];
  intention?: string | null;
  definition_of_done?: string | null;
  is_recurring?: number;
  recurrence_interval?: string | null;
  recurrence_custom_days?: string | null;
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

  async eisenhowerAuto(model: 'ollama' | 'gemini'): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/eisenhower-auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to auto-sort tasks', error);
      return { assignments: [] };
    }
  },

  async aiWeeklyPlan(model: 'ollama' | 'gemini'): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/ai-weekly-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to generate weekly plan', error);
      return { weekly_plan: {} };
    }
  },

  async moveToQuick(taskId: number): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/move-to-quick`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to move task ${taskId} to quick`, error);
      return null;
    }
  },

  async moveToPlan(taskId: number): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/move-to-plan`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to move task ${taskId} to plan`, error);
      return null;
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

  // ── Notes Operations ───────────────────────────────────────────────────────
  
  async fetchNotes(taskId: number): Promise<Note[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/notes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to fetch notes for task ${taskId}:`, error);
      return [];
    }
  },

  async createNote(taskId: number, content: string): Promise<Note | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to create note for task ${taskId}:`, error);
      return null;
    }
  },

  async explainTask(taskId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<Note | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/notes/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to explain task ${taskId}:`, error);
      return null;
    }
  },

  async expandNote(taskId: number, noteId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<Note | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/notes/${noteId}/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to expand note ${noteId} for task ${taskId}:`, error);
      return null;
    }
  },

  async summarizeNotes(taskId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<string> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/notes/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.summary || '';
    } catch (error) {
      console.error(`Failed to summarize notes for task ${taskId}:`, error);
      return 'Summary failed.';
    }
  },

  async suggestIntention(taskId: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<{ intention: string; definition_of_done: string } | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/${taskId}/suggest-intention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to suggest intention for task ${taskId}:`, error);
      return null;
    }
  },

  async suggestIntentionGeneral(title: string, context?: string | null, model: 'ollama' | 'gemini' = 'gemini'): Promise<{ intention: string; definition_of_done: string } | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/suggest-intention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, context, model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to suggest intention generally:', error);
      return null;
    }
  },

  async getDailyPlan(): Promise<{ status: 'none' | 'active'; plan: any | null }> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/daily/plan`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to fetch daily plan:', error);
      return { status: 'none', plan: null };
    }
  },

  async kickstartDaily(availableHours: number, model: 'ollama' | 'gemini' = 'gemini'): Promise<{ suggestions: any[]; alternatives: any[] }> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/daily/kickstart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_hours: availableHours, model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to kickstart daily plan:', error);
      return { suggestions: [], alternatives: [] };
    }
  },

  async saveDailyPlan(availableHours: number, taskIds: number[], reasoning: Record<number, string>): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/daily/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_hours: availableHours, task_ids: taskIds, reasoning }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to save daily plan:', error);
      return null;
    }
  },

  async endDaily(completedTaskIds: number[], incompleteReschedule: Record<number, 'tomorrow' | 'next_week' | 'remove'>, model: 'ollama' | 'gemini' = 'gemini'): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/daily/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_task_ids: completedTaskIds, incomplete_reschedule: incompleteReschedule, model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to end daily plan:', error);
      return null;
    }
  },

  async brainDump(text: string, model: 'ollama' | 'gemini' = 'gemini'): Promise<{ tasks: any[] }> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/brain-dump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to analyze brain dump:', error);
      return { tasks: [] };
    }
  },

  async bulkSaveTasks(tasks: any[]): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/tasks/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to bulk save tasks:', error);
      return null;
    }
  },

  async createInboxItem(content: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to create inbox item:', error);
      return null;
    }
  },

  async getInboxItems(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/inbox`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to get inbox items:', error);
      return [];
    }
  },

  async deleteInboxItem(id: number): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/inbox/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error(`Failed to delete inbox item ${id}:`, error);
      return null;
    }
  },

  async getStats(): Promise<{ completed_today: number; streak: number; last_7_days: number[]; last_7_dates: string[] }> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      console.error('Failed to get stats:', error);
      return { completed_today: 0, streak: 0, last_7_days: [0, 0, 0, 0, 0, 0, 0], last_7_dates: [] };
    }
  },
};

export function triggerConfetti(x: number, y: number) {
  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;
  container.style.pointerEvents = 'none';
  container.style.zIndex = '99999';
  document.body.appendChild(container);

  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.random() * 6 + 4;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 100 + 50;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 50;

    el.style.position = 'absolute';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.backgroundColor = color;
    el.style.borderRadius = Math.random() > 0.5 ? '50%' : '0%';
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(el);

    el.animate([
      { transform: 'translate3d(0, 0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate3d(${dx}px, ${dy + 150}px, 0) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], {
      duration: Math.random() * 600 + 600,
      easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)',
      fill: 'forwards'
    });
  }

  setTimeout(() => {
    document.body.removeChild(container);
  }, 1500);
}


export interface Note {
  id: number;
  task_id: number;
  content: string;
  note_type: 'manual' | 'ai_explanation' | 'ai_expansion' | 'ai_summary';
  created_at: string;
}

