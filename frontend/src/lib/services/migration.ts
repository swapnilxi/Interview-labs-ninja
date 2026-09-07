'use client';

/**
 * Guest -> account migration: export whatever's in the guest's IndexedDB
 * store and hand it to the backend's /todo/import endpoint, which recreates
 * it under the new account (remapping ids) in a single transaction.
 */

import { getAll, hasAnyGuestData, clearAllGuestData } from './local/db';
import { apiFetch } from '../http/apiClient';
import type { Task, Note } from './todoService';
import type { Project, ProjectNode } from './projectService';
import type { QuickTask } from './quickTaskService';

const BACKUP_KEY = 'labninja.guest-backup.v1';

export async function hasGuestData(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    return await hasAnyGuestData();
  } catch {
    return false;
  }
}

async function buildEnvelope() {
  const [tasks, notes, projects, nodes, quickTasks, dailyPlans, inbox] = await Promise.all([
    getAll<Task>('tasks'),
    getAll<Note>('task_notes'),
    getAll<Project>('projects'),
    getAll<ProjectNode>('project_nodes'),
    getAll<QuickTask>('quick_tasks'),
    getAll<any>('daily_plans'),
    getAll<any>('inbox'),
  ]);

  const notesByTask = new Map<number, Note[]>();
  for (const n of notes) {
    if (!notesByTask.has(n.task_id)) notesByTask.set(n.task_id, []);
    notesByTask.get(n.task_id)!.push(n);
  }

  const nodesByProject = new Map<number, ProjectNode[]>();
  for (const n of nodes) {
    if (!nodesByProject.has(n.project_id)) nodesByProject.set(n.project_id, []);
    nodesByProject.get(n.project_id)!.push(n);
  }

  return {
    tasks: tasks.map((t) => ({
      client_id: t.id,
      parent_client_id: t.parent_id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      time_estimate: t.time_estimate,
      due_date: t.due_date,
      context: t.context,
      intention: t.intention,
      definition_of_done: t.definition_of_done,
      is_recurring: t.is_recurring,
      recurrence_interval: t.recurrence_interval,
      eisenhower_quadrant: t.eisenhower_quadrant,
      attachments: t.attachments,
      created_at: t.created_at,
      updated_at: t.updated_at,
      notes: (notesByTask.get(t.id) || []).map((n) => ({
        client_id: n.id, content: n.content, note_type: n.note_type, created_at: n.created_at,
      })),
    })),
    projects: projects.map((p) => ({
      client_id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      priority: p.priority,
      color: p.color,
      icon: p.icon,
      due_date: p.due_date,
      created_at: p.created_at,
      nodes: (nodesByProject.get(p.id) || []).map((n) => ({
        client_id: n.id,
        parent_client_id: n.parent_node_id,
        title: n.title,
        node_type: n.node_type,
        order_index: n.order_index,
        context: n.context,
        due_date: n.due_date,
        time_estimate: n.time_estimate,
        created_at: n.created_at,
      })),
    })),
    quick_tasks: quickTasks.map((q) => ({
      client_id: q.id,
      title: q.title,
      done: q.done,
      quadrant: q.quadrant,
      date: q.date,
      source: q.source,
      created_at: q.created_at,
    })),
    daily_plans: dailyPlans.map((p) => ({
      date: p.plan_date,
      available_hours: p.available_hours,
      task_client_ids: p.task_ids || [],
      reasoning: p.reasoning || {},
    })),
    inbox: inbox.map((i) => ({ content: i.content })),
  };
}

export interface MigrationResult {
  ok: boolean;
  error?: string;
  imported?: { tasks: number; projects: number; quick_tasks: number; daily_plans: number; inbox: number };
}

/**
 * Exports the guest's local data and imports it into the now-logged-in
 * account. On success, snapshots a backup to localStorage and clears the
 * active IndexedDB stores. On failure, leaves everything untouched so
 * nothing is ever lost — the caller can offer a retry.
 */
export async function importGuestDataIntoAccount(): Promise<MigrationResult> {
  try {
    const envelope = await buildEnvelope();
    const totalRows =
      envelope.tasks.length + envelope.projects.length + envelope.quick_tasks.length +
      envelope.daily_plans.length + envelope.inbox.length;
    if (totalRows === 0) return { ok: true, imported: { tasks: 0, projects: 0, quick_tasks: 0, daily_plans: 0, inbox: 0 } };

    const res = await apiFetch('/todo/import', {
      method: 'POST',
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return { ok: false, error: detail?.detail || `Import failed (HTTP ${res.status})` };
    }
    const result = await res.json();

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BACKUP_KEY, JSON.stringify({ exported_at: new Date().toISOString(), ...envelope }));
    }
    await clearAllGuestData();

    return { ok: true, imported: result.imported };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Import failed' };
  }
}
