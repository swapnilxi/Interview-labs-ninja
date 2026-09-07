'use client';

/**
 * Guest-mode (IndexedDB-backed) implementation of the manual-CRUD subset of
 * projectService. AI methods (dive deeper, chunk, roadmap, auto-sort) are
 * NOT implemented here — those always go through the remote adapter, which
 * requires login.
 */

import { nextId, getAll, getAllByIndex, get, put, remove } from './db';
import type { Project, ProjectNode, ProjectNodeFlat } from '../projectService';
import { localTodoAdapter } from './localTodoAdapter';

function buildNodeTree(flat: ProjectNode[]): ProjectNode[] {
  const byId = new Map<number, ProjectNode>();
  for (const n of flat) byId.set(n.id, { ...n, children: [] });
  const roots: ProjectNode[] = [];
  for (const n of flat) {
    const node = byId.get(n.id)!;
    if (n.parent_node_id != null && byId.has(n.parent_node_id)) {
      byId.get(n.parent_node_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export const localProjectAdapter = {
  async fetchProjects(): Promise<Project[]> {
    const projects = await getAll<Project>('projects');
    const nodes = await getAll<ProjectNode>('project_nodes');
    return projects
      .map((p) => ({
        ...p,
        node_count: nodes.filter((n) => n.project_id === p.id).length,
        exported_count: nodes.filter((n) => n.project_id === p.id && n.exported_to_smart_todo).length,
      }))
      .sort((a, b) => b.id - a.id);
  },

  async createProject(data: Partial<Project>): Promise<Project | null> {
    const id = await nextId();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      title: data.title || 'Untitled Project',
      description: data.description ?? null,
      status: data.status ?? 'active',
      priority: data.priority ?? 'p3',
      eisenhower_quadrant: data.eisenhower_quadrant ?? 'schedule',
      due_date: data.due_date ?? null,
      color: data.color ?? null,
      icon: data.icon ?? null,
      pareto_score: null,
      is_top_20: false,
      pareto_reason: null,
      pareto_locked: false,
      created_at: now,
    };
    await put('projects', project);
    return project;
  },

  async updateProject(id: number, data: Partial<Project>): Promise<Project | null> {
    const existing = await get<Project>('projects', id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    if ('is_top_20' in data) updated.pareto_locked = true;
    await put('projects', updated);
    return updated;
  },

  async deleteProject(id: number): Promise<boolean> {
    const existing = await get<Project>('projects', id);
    if (!existing) return false;
    const nodes = await getAllByIndex<ProjectNode>('project_nodes', 'project_id', id);
    for (const n of nodes) await remove('project_nodes', n.id);
    await remove('projects', id);
    return true;
  },

  async fetchProjectTree(id: number): Promise<ProjectNode[]> {
    const nodes = await getAllByIndex<ProjectNode>('project_nodes', 'project_id', id);
    return buildNodeTree(nodes);
  },

  async createNode(projectId: number, data: Partial<ProjectNode>): Promise<ProjectNode | null> {
    const project = await get<Project>('projects', projectId);
    if (!project) return null;
    const id = await nextId();
    const now = new Date().toISOString();
    let depth_level = 1;
    if (data.parent_node_id != null) {
      const parent = await get<ProjectNode>('project_nodes', data.parent_node_id);
      if (parent) depth_level = parent.depth_level + 1;
    }
    const node: ProjectNode = {
      id,
      project_id: projectId,
      parent_node_id: data.parent_node_id ?? null,
      title: data.title || 'Untitled',
      node_type: data.node_type ?? 'topic',
      generation_type: 'manual',
      depth_level,
      exported_to_smart_todo: false,
      exported_task_id: null,
      exported_to_quick: false,
      pareto_score: null,
      is_top_20: false,
      pareto_reason: null,
      pareto_locked: false,
      order_index: data.order_index ?? 0,
      created_at: now,
      context: data.context ?? null,
      due_date: data.due_date ?? null,
      time_estimate: data.time_estimate ?? null,
      intention: data.intention ?? null,
      definition_of_done: data.definition_of_done ?? null,
    };
    await put('project_nodes', node);
    return node;
  },

  async deleteNode(nodeId: number): Promise<boolean> {
    const existing = await get<ProjectNode>('project_nodes', nodeId);
    if (!existing) return false;
    await remove('project_nodes', nodeId);
    return true;
  },

  async updateProjectNode(nodeId: number, data: Partial<ProjectNode>): Promise<ProjectNode | null> {
    const existing = await get<ProjectNode>('project_nodes', nodeId);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    if ('is_top_20' in data) updated.pareto_locked = true;
    await put('project_nodes', updated);
    return updated;
  },

  async fetchFlatProjectNodes(): Promise<ProjectNodeFlat[]> {
    const nodes = await getAll<ProjectNode>('project_nodes');
    const projects = await getAll<Project>('projects');
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    return nodes
      .filter((n) => projectMap.get(n.project_id)?.status === 'active')
      .map((n) => {
        const p = projectMap.get(n.project_id)!;
        return { ...n, project_title: p.title, project_color: p.color, project_icon: p.icon };
      });
  },

  async moveToSmart(nodeId: number): Promise<any> {
    const node = await get<ProjectNode>('project_nodes', nodeId);
    if (!node) return null;
    const newTask = await localTodoAdapter.createTask({
      title: node.title,
      context: `From project (local)`,
    });
    if (newTask) {
      await localProjectAdapter.updateProjectNode(nodeId, { exported_to_smart_todo: true, exported_task_id: newTask.id });
    }
    return { status: 'exported', task: newTask };
  },

  async moveToQuick(nodeId: number): Promise<any> {
    const node = await get<ProjectNode>('project_nodes', nodeId);
    if (!node) return null;
    const id = await nextId();
    const today = new Date().toISOString().slice(0, 10);
    const qt = {
      id, title: node.title, done: false, quadrant: 'do_now' as const, date: today,
      source: 'moved_from_plan' as const, original_task_id: null, order_index: 0,
      created_at: new Date().toISOString(), pareto_score: null, is_top_20: false,
    };
    await put('quick_tasks', qt);
    await localProjectAdapter.updateProjectNode(nodeId, { exported_to_quick: true });
    return { status: 'exported', quick_task: qt };
  },
};
