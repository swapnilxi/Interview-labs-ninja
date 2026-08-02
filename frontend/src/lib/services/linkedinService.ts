'use client';

import { defaultAIRequestFields } from './settingsService';

export interface LinkedInCategory {
  id: number;
  name: string;
  isCustom: boolean;
}

export type LinkedInTemplateType =
  | 'prompt'
  | 'reference_post'
  | 'creator_post'
  | 'writing_style'
  | 'post_structure'
  | 'custom';

export interface LinkedInTemplate {
  id: number;
  type: LinkedInTemplateType;
  title: string;
  description?: string | null;
  content: string;
  styleAnalysis?: string | null;
  tags: string[];
  tone?: string | null;
  postType?: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt?: string | null;
  category?: string | null;
}

export interface TemplateInput {
  type: LinkedInTemplateType;
  title: string;
  content: string;
  description?: string;
  styleAnalysis?: string;
  tags?: string[];
  tone?: string;
  postType?: string;
  isFavorite?: boolean;
  category?: string;
}

export interface GeneratePostInput {
  topic: string;
  category?: string;
  tone?: string;
  postType?: string;
  templateIds?: number[];
  context?: string;
  pdfText?: string;
  variation?: boolean;
}

export type RefineAction = 'improve_hook' | 'shorten' | 'expand' | 'change_tone';

export interface AnalyzePostResult {
  analysis: {
    hook?: string;
    tone?: string;
    writingStyle?: string;
    postStructure?: string;
    formatting?: string;
    storytelling?: string;
    engagementTechniques?: string;
  };
  stylePrompt: string;
  regeneratedPost: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082';

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || `HTTP error! status: ${res.status}`;
  } catch {
    return `HTTP error! status: ${res.status}`;
  }
}

export const linkedinService = {
  async getCategories(): Promise<LinkedInCategory[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/linkedin/categories`);
      if (!res.ok) throw new Error(await parseErrorDetail(res));
      return await res.json();
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      return [];
    }
  },

  async addCategory(name: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/linkedin/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
  },

  async deleteCategory(id: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/linkedin/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
  },

  async getTemplates(opts?: {
    type?: LinkedInTemplateType;
    search?: string;
    favoritesOnly?: boolean;
    category?: string;
  }): Promise<LinkedInTemplate[]> {
    try {
      const params = new URLSearchParams();
      if (opts?.type) params.set('type', opts.type);
      if (opts?.search) params.set('search', opts.search);
      if (opts?.favoritesOnly) params.set('favoritesOnly', 'true');
      if (opts?.category) params.set('category', opts.category);
      const query = params.toString();
      const res = await fetch(`${API_BASE_URL}/linkedin/templates${query ? `?${query}` : ''}`);
      if (!res.ok) throw new Error(await parseErrorDetail(res));
      return await res.json();
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      return [];
    }
  },

  async addTemplate(payload: TemplateInput): Promise<number | null> {
    const res = await fetch(`${API_BASE_URL}/linkedin/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
    const data = await res.json();
    return data.id ?? null;
  },

  async updateTemplate(id: number, payload: Partial<TemplateInput>): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/linkedin/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
  },

  async duplicateTemplate(id: number): Promise<number | null> {
    const res = await fetch(`${API_BASE_URL}/linkedin/templates/${id}/duplicate`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
    const data = await res.json();
    return data.id ?? null;
  },

  async deleteTemplate(id: number): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/linkedin/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
  },

  async extractPdf(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/linkedin/extract-pdf`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
    const data = await res.json();
    return data.text || '';
  },

  async generatePost(input: GeneratePostInput): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/linkedin/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, ...defaultAIRequestFields() }),
    });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
    const data = await res.json();
    return data.post || '';
  },

  async refinePost(post: string, action: RefineAction, tone?: string): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/linkedin/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post, action, tone, ...defaultAIRequestFields() }),
    });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
    const data = await res.json();
    return data.post || '';
  },

  async analyzePost(postText: string): Promise<AnalyzePostResult> {
    const res = await fetch(`${API_BASE_URL}/linkedin/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postText, ...defaultAIRequestFields() }),
    });
    if (!res.ok) throw new Error(await parseErrorDetail(res));
    return await res.json();
  },
};
