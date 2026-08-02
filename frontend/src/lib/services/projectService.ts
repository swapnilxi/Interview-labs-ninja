'use client';

import { parseApiError } from './todoService';
import { aiRequestFields } from './settingsService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082';

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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/projects`);
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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const res = await fetch(`${API_BASE_URL}/todo/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      return resData.project || null;
    } catch (err) {
      console.error(`Failed to update project ${id}`, err);
      return null;
    }
  },

  async deleteProject(id: number): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/projects/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete project ${id}`, err);
      return false;
    }
  },

  async fetchProjectTree(id: number): Promise<ProjectNode[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/projects/${id}/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : (data.tree || []);
    } catch (err) {
      console.error(`Failed to fetch tree for project ${id}`, err);
      return [];
    }
  },

  async createNode(projectId: number, data: Partial<ProjectNode>): Promise<ProjectNode | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/projects/${projectId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async updateNode(projectId: number, nodeId: number, data: Partial<ProjectNode>): Promise<ProjectNode | null> {
    // There isn't an explicit node update endpoint in the router yet, we can add it later if needed.
    // For now, this is a placeholder or we can implement it.
    return null;
  },

  async deleteNode(nodeId: number): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/project-nodes/${nodeId}`, { method: 'DELETE' });
      return res.ok;
    } catch (err) {
      console.error(`Failed to delete node ${nodeId}`, err);
      return false;
    }
  },

  async diveDeeper(nodeId: number, model: string = 'gemini'): Promise<ProjectNode[]> {
    const res = await fetch(`${API_BASE_URL}/todo/project-nodes/${nodeId}/dive-deeper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return data.nodes || [];
  },

  async chunkIt(nodeId: number, model: string = 'gemini'): Promise<ProjectNode[]> {
    const res = await fetch(`${API_BASE_URL}/todo/project-nodes/${nodeId}/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await res.json();
    return data.nodes || [];
  },

  async moveToSmart(nodeId: number): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/project-nodes/${nodeId}/move-to-smart`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to move node ${nodeId} to smart`, err);
      return null;
    }
  },

  async moveToQuick(nodeId: number): Promise<any> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/project-nodes/${nodeId}/move-to-quick`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Failed to move node ${nodeId} to quick`, err);
      return null;
    }
  },

  async fetchFlatProjectNodes(): Promise<ProjectNodeFlat[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/project-nodes/all`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch flat project nodes', err);
      return [];
    }
  },

  async updateProjectNode(nodeId: number, data: Partial<ProjectNode>): Promise<ProjectNode | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/todo/project-nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API_BASE_URL}/todo/project-nodes/eisenhower-auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  async eisenhowerAuto(model: string = 'gemini'): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/todo/projects/eisenhower-auto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },

  async generateRoadmap(projectId: number, model: string = 'gemini'): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/todo/projects/${projectId}/ai-roadmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestFields(model)),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return await res.json();
  },
};
