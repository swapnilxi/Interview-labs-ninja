'use client';

import { parseApiError } from './todoService';
import { aiRequestFields } from './settingsService';
import { apiFetch } from '../http/apiClient';
import { isLoggedIn } from '../auth/tokenStore';
import { localProjectAdapter } from './local/localProjectAdapter';

export interface Project {
  id: number;
  title: string;
  description: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived';
  priority: string;
  eisenhower_quadrant: string | null;
  due_date: string | null;
  color: string | null;
  icon: string | null;
  pareto_score: number | null;
  is_top_20: boolean;
  pareto_reason?: string | null;
  pareto_locked?: boolean;
  created_at: string;
  node_count?: number; // Added in GET /projects response
  exported_count?: number; // Nodes already exported to Smart Todo, added in GET /projects response
}

export interface ProjectNode {
  id: number;
  project_id: number;
  parent_node_id: number | null;
  title: string;
  node_type: 'topic' | 'phase' | 'idea' | 'action';
  generation_type: 'manual' | 'dive_deeper' | 'chunk';
  depth_level: number;
  exported_to_smart_todo: boolean;
  exported_task_id: number | null;
  exported_to_quick: boolean;
  eisenhower_quadrant?: 'do_now' | 'schedule' | 'delegate' | 'eliminate' | null;
  pareto_score: number | null;
  is_top_20: boolean;
  pareto_reason?: string | null;
  pareto_locked?: boolean;
  order_index: number;
  created_at: string;
  context?: string | null;
  due_date?: string | null;
  time_estimate?: string | null;
  intention?: string | null;
  definition_of_done?: string | null;
  children?: ProjectNode[];
}

export interface ProjectNodeFlat extends ProjectNode {
  project_title: string;
  project_color: string | null;
  project_icon: string | null;
}

export const projectService = {
  async fetchProjects(): Promise<Project[]> {
    if (!isLoggedIn()) return localProjectAdapter.fetchProjects();
    try {
      const res = await apiFetch('/todo/projects');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Backend returns an array directly or wrapped in {projects:[...]}
      return Array.isArray(data) ? data : (data.projects || []);
    } catch (err) {
      console.error('Failed to fetch projects', err);
      return [];
    }
  },

  async createProject(data: Partial<Project>): Promise<Project | null> {
    if (!isLoggedIn()) return localProjectAdapter.createProject(data);
    try {
      const res = await apiFetch('/todo/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      // Backend returns project directly (flat) or wrapped in {project:{...}}
      return (resData.project ?? resData) as Project;
    } catch (err) {
      console.error('Failed to create project', err);
      return null;
    }
  },

  async updateProject(id: number, data: Partial<Project>): Promise<Project | null> {
    if (!isLoggedIn()) return localProjectAdapter.updateProject(id, data);
    try {
      const res = await apiFetch(`/todo/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      return resData.project || resData || null;
    } catch (err) {
      console.error(`Failed to update project ${id}`, err);
      return null;
    }
  },

  async deleteProject(id: number): Promise<boolean> {
    if (!isLoggedIn()) return localProjectAdapter.deleteProject(id);
    try {
      const res = await apiFetch(`/todo/projects/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete project ${id}`, err);
      return false;
    }
  },

  async fetchProjectTree(id: number): Promise<ProjectNode[]> {
    if (!isLoggedIn()) return localProjectAdapter.fetchProjectTree(id);
    try {
      const res = await apiFetch(`/todo/projects/${id}/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : (data.tree || []);
    } catch (err) {
      console.error(`Failed to fetch tree for project ${id}`, err);
      return [];
    }
  },

  async createNode(projectId: number, data: Partial<ProjectNode>): Promise<ProjectNode | null> {
    if (!isLoggedIn()) return localProjectAdapter.createNode(projectId, data);
    try {
      const res = await apiFetch(`/todo/projects/${projectId}/nodes`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      return (resData.node ?? resData) as ProjectNode;
    } catch (err) {
      console.error(`Failed to create node in project ${projectId}`, err);
      return null;
    }
  },

  async deleteNode(nodeId: number): Promise<boolean> {
    if (!isLoggedIn()) return localProjectAdapter.deleteNode(nodeId);
    try {
      const res = await apiFetch(`/todo/project-nodes/${nodeId}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete node ${nodeId}`, err);
      return false;
    }
  },

  async diveDeeper(nodeId: number, model: string = 'gemini'): Promise<ProjectNode[]> {
    const res = await apiFetch(`/todo/project-nodes/${nodeId}/dive-deeper`, {
      method: 'POST',
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return data.nodes || [];
  },

  async chunkIt(nodeId: number, model: string = 'gemini'): Promise<ProjectNode[]> {
    const res = await apiFetch(`/todo/project-nodes/${nodeId}/chunk`, {
      method: 'POST',
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return data.nodes || [];
  },

  async moveToSmart(nodeId: number): Promise<any> {
    if (!isLoggedIn()) return localProjectAdapter.moveToSmart(nodeId);
    try {
      const res = await apiFetch(`/todo/project-nodes/${nodeId}/move-to-smart`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to move node ${nodeId} to smart`, err);
      return null;
    }
  },

  async moveToQuick(nodeId: number): Promise<any> {
    if (!isLoggedIn()) return localProjectAdapter.moveToQuick(nodeId);
    try {
      const res = await apiFetch(`/todo/project-nodes/${nodeId}/move-to-quick`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to move node ${nodeId} to quick`, err);
      return null;
    }
  },

  async fetchFlatProjectNodes(): Promise<ProjectNodeFlat[]> {
    if (!isLoggedIn()) return localProjectAdapter.fetchFlatProjectNodes();
    try {
      const res = await apiFetch('/todo/project-nodes/all');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch flat project nodes', err);
      return [];
    }
  },

  async updateProjectNode(nodeId: number, data: Partial<ProjectNode>): Promise<ProjectNode | null> {
    if (!isLoggedIn()) return localProjectAdapter.updateProjectNode(nodeId, data);
    try {
      const res = await apiFetch(`/todo/project-nodes/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to update node ${nodeId}`, err);
      return null;
    }
  },

  async eisenhowerAutoNodes(model: string = 'gemini'): Promise<any> {
    const res = await apiFetch('/todo/project-nodes/eisenhower-auto', {
      method: 'POST',
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  async generateRoadmap(projectId: number, model: string = 'gemini'): Promise<any> {
    const res = await apiFetch(`/todo/projects/${projectId}/ai-roadmap`, {
      method: 'POST',
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },
};
