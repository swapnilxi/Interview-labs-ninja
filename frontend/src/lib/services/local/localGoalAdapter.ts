'use client';

/**
 * Guest-mode (IndexedDB-backed) implementation of the manual-CRUD subset of
 * goalService. AI methods (dive deeper, chunk) are NOT implemented here —
 * those always go through the remote adapter, which requires login.
 */

import { nextId, getAll, getAllByIndex, get, put, remove } from './db';
import type { GoalNode, GoalCreatePayload, GoalUpdatePayload } from '../goalService';

interface StoredGoal extends Omit<GoalNode, 'children'> {}

function buildTree(flat: StoredGoal[]): GoalNode[] {
  const byId = new Map<number, GoalNode>();
  for (const g of flat) byId.set(g.id, { ...g, children: [] });

  const roots: GoalNode[] = [];
  for (const g of flat) {
    const node = byId.get(g.id)!;
    if (g.parent_id != null && byId.has(g.parent_id)) {
      byId.get(g.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function collectDescendantIds(goalId: number): Promise<number[]> {
  const children = await getAllByIndex<StoredGoal>('goal_nodes', 'parent_id', goalId);
  let ids: number[] = [];
  for (const c of children) {
    ids.push(c.id);
    ids = ids.concat(await collectDescendantIds(c.id));
  }
  return ids;
}

export const localGoalAdapter = {
  async fetchGoalTree(): Promise<GoalNode[]> {
    const flat = await getAll<StoredGoal>('goal_nodes');
    return buildTree(flat);
  },

  async fetchGoal(id: number): Promise<GoalNode | null> {
    const g = await get<StoredGoal>('goal_nodes', id);
    return g ? { ...g, children: [] } : null;
  },

  async createGoal(data: GoalCreatePayload): Promise<GoalNode | null> {
    const id = await nextId();
    const now = new Date().toISOString();
    let depth_level = 0;
    if (data.parent_id != null) {
      const parent = await get<StoredGoal>('goal_nodes', data.parent_id);
      if (parent) depth_level = parent.depth_level + 1;
    }
    const goal: StoredGoal = {
      id,
      parent_id: data.parent_id ?? null,
      title: data.title,
      description: data.description ?? null,
      level: data.level,
      status: data.status ?? 'backlog',
      priority: data.priority ?? 'p3',
      due_date: data.due_date ?? null,
      generation_type: 'manual',
      depth_level,
      order_index: 0,
      exported_to_smart_todo: false,
      exported_task_id: null,
      exported_to_quick: false,
      exported_quick_task_id: null,
      exported_to_plan: false,
      exported_project_id: null,
      attachments: data.attachments ?? [],
      created_at: now,
      updated_at: now,
    };
    await put('goal_nodes', goal);
    return { ...goal, children: [] };
  },

  async updateGoal(id: number, data: GoalUpdatePayload): Promise<GoalNode | null> {
    const existing = await get<StoredGoal>('goal_nodes', id);
    if (!existing) return null;
    const updated: StoredGoal = { ...existing, ...data, updated_at: new Date().toISOString() };
    await put('goal_nodes', updated);
    return { ...updated, children: [] };
  },

  async deleteGoal(id: number): Promise<boolean> {
    const existing = await get<StoredGoal>('goal_nodes', id);
    if (!existing) return false;
    const descendantIds = await collectDescendantIds(id);
    for (const did of descendantIds) await remove('goal_nodes', did);
    await remove('goal_nodes', id);
    return true;
  },

  async moveToSmart(id: number): Promise<any> {
    const goal = await get<StoredGoal>('goal_nodes', id);
    if (!goal) return null;
    const { localTodoAdapter } = await import('./localTodoAdapter');
    const newTask = await localTodoAdapter.createTask({
      title: goal.title,
      context: goal.description || `From goal: ${goal.title}`,
      priority: goal.priority as any,
      due_date: goal.due_date,
    });
    if (newTask) {
      await put('goal_nodes', { ...goal, exported_to_smart_todo: true, exported_task_id: newTask.id });
    }
    return { status: 'exported', task: newTask };
  },

  async moveToQuick(id: number): Promise<any> {
    const goal = await get<StoredGoal>('goal_nodes', id);
    if (!goal) return null;
    const qid = await nextId();
    const today = new Date().toISOString().slice(0, 10);
    const qt = {
      id: qid, title: goal.title, done: false, quadrant: 'do_now' as const, date: today,
      source: 'moved_from_goal' as const, original_task_id: null, order_index: 0,
      created_at: new Date().toISOString(), pareto_score: null, is_top_20: false,
    };
    await put('quick_tasks', qt);
    await put('goal_nodes', { ...goal, exported_to_quick: true, exported_quick_task_id: qid });
    return { status: 'exported', quick_task: qt };
  },

  async moveToPlan(id: number): Promise<any> {
    const goal = await get<StoredGoal>('goal_nodes', id);
    if (!goal) return null;
    const { localProjectAdapter } = await import('./localProjectAdapter');
    const project = await localProjectAdapter.createProject({
      title: goal.title,
      description: goal.description || `Created from goal: ${goal.title}`,
      priority: goal.priority,
      due_date: goal.due_date,
    });
    if (project) {
      await put('goal_nodes', { ...goal, exported_to_plan: true, exported_project_id: project.id });
    }
    return { status: 'exported', project };
  },
};
