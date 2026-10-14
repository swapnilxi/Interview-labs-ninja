'use client';

/**
 * Goals API service — mirrors the backend /todo/goals* endpoints.
 * Follows the same guest/logged-in dispatch pattern as projectService.ts.
 */

import { aiRequestFields } from './settingsService';
import { apiFetch, parseApiError } from '../http/apiClient';
import { isLoggedIn } from '../auth/tokenStore';
import { localGoalAdapter } from './local/localGoalAdapter';
import { todoApiError, todoFetch } from './todoService';
import { reportFailure } from './mutationFeedback';

// ── Types ────────────────────────────────────────────────────────────────────

export type GoalLevel = 'main' | 'yearly' | 'quarterly' | 'monthly' | 'weekly' | 'daily';
export type GoalStatus = 'backlog' | 'in_progress' | 'delayed' | 'done' | 'not_done';

export const GOAL_LEVELS: { id: GoalLevel; label: string }[] = [
  { id: 'main', label: 'Main Goal' },
  { id: 'yearly', label: 'Yearly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'daily', label: 'Daily' },
];

export interface GoalNode {
  id: number;
  parent_id: number | null;
  title: string;
  description: string | null;
  level: GoalLevel;
  status: GoalStatus;
  priority: string;
  due_date: string | null;
  generation_type: 'manual' | 'dive_deeper' | 'chunk';
  depth_level: number;
  order_index: number;
  exported_to_smart_todo: boolean;
  exported_task_id: number | null;
  exported_to_quick: boolean;
  exported_quick_task_id: number | null;
  exported_to_plan: boolean;
  exported_project_id: number | null;
  attachments: string[];
  created_at: string;
  updated_at: string;
  children?: GoalNode[];
}

export interface GoalCreatePayload {
  title: string;
  level: GoalLevel;
  parent_id?: number | null;
  description?: string | null;
  priority?: string;
  due_date?: string | null;
  status?: GoalStatus;
  attachments?: string[] | null;
}

export interface GoalUpdatePayload {
  title?: string;
  description?: string | null;
  level?: GoalLevel;
  status?: GoalStatus;
  priority?: string;
  due_date?: string | null;
  parent_id?: number | null;
  order_index?: number;
  attachments?: string[] | null;
}

export const goalService = {
  async fetchGoalTree(): Promise<GoalNode[]> {
    if (!isLoggedIn()) return localGoalAdapter.fetchGoalTree();
    try {
      const res = await apiFetch('/todo/goals/tree');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : (data.tree || []);
    } catch (err) {
      console.error('Failed to fetch goal tree', err);
      return [];
    }
  },

  /** Throws with a human-readable message on failure — callers must catch and surface it. */
  async createGoal(data: GoalCreatePayload): Promise<GoalNode> {
    if (!isLoggedIn()) {
      const goal = await localGoalAdapter.createGoal(data);
      if (!goal) throw new Error('Could not save the goal locally.');
      return goal;
    }
    const res = await apiFetch('/todo/goals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  /** Throws with a human-readable message on failure — callers must catch and surface it. */
  async updateGoal(id: number, data: GoalUpdatePayload): Promise<GoalNode> {
    if (!isLoggedIn()) {
      const goal = await localGoalAdapter.updateGoal(id, data);
      if (!goal) throw new Error('Goal not found.');
      return goal;
    }
    const res = await apiFetch(`/todo/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  /** Throws with a human-readable message on failure — callers must catch and surface it. */
  async deleteGoal(id: number): Promise<void> {
    if (!isLoggedIn()) {
      const ok = await localGoalAdapter.deleteGoal(id);
      if (!ok) throw new Error('Goal not found.');
      return;
    }
    const res = await apiFetch(`/todo/goals/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
  },

  async diveDeeper(id: number, model: string = 'gemini'): Promise<GoalNode[]> {
    const res = await apiFetch(`/todo/goals/${id}/dive-deeper`, {
      method: 'POST',
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return data.children || [];
  },

  async chunkIt(id: number, model: string = 'gemini'): Promise<GoalNode[]> {
    const res = await apiFetch(`/todo/goals/${id}/chunk`, {
      method: 'POST',
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return data.children || [];
  },

  async moveToSmart(id: number): Promise<any> {
    if (!isLoggedIn()) return localGoalAdapter.moveToSmart(id);
    try {
      const res = await todoFetch(`/todo/goals/${id}/move-to-smart`, { method: 'POST' });
      if (!res.ok) throw new Error(await todoApiError(res));
      return await res.json();
    } catch (err) {
      console.error(`Failed to move goal ${id} to smart`, err);
      reportFailure('send that goal to Smart To-Do', err);
      return null;
    }
  },

  async moveToQuick(id: number): Promise<any> {
    if (!isLoggedIn()) return localGoalAdapter.moveToQuick(id);
    try {
      const res = await todoFetch(`/todo/goals/${id}/move-to-quick`, { method: 'POST' });
      if (!res.ok) throw new Error(await todoApiError(res));
      return await res.json();
    } catch (err) {
      console.error(`Failed to move goal ${id} to quick`, err);
      reportFailure('send that goal to Quick Daily', err);
      return null;
    }
  },

  async moveToPlan(id: number): Promise<any> {
    if (!isLoggedIn()) return localGoalAdapter.moveToPlan(id);
    try {
      const res = await todoFetch(`/todo/goals/${id}/move-to-plan`, { method: 'POST' });
      if (!res.ok) throw new Error(await todoApiError(res));
      return await res.json();
    } catch (err) {
      console.error(`Failed to move goal ${id} to plan`, err);
      reportFailure('send that goal to Plan & Project', err);
      return null;
    }
  },
};
