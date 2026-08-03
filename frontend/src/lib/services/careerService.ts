'use client';

/**
 * Career Studio API service — wraps the backend /career/* endpoints.
 *
 * Reuses the shared authenticated fetch wrapper (apiFetch/apiJson attach the
 * Bearer token automatically) and the AI settings helpers (provider keys ride
 * per-request from localStorage, never stored server-side) — same pattern as
 * todoService / linkedinService.
 */

import { apiFetch, apiJson, parseApiError } from '../http/apiClient';
import { defaultAIRequestFields } from './settingsService';
import type { AnalysisRecord, Resume, ResumeSection, ResumeVersion } from '@/modules/career/types';

export { parseApiError };

export const careerService = {
  // ── Resumes ──────────────────────────────────────────────────────────────
  listResumes(): Promise<Resume[]> {
    return apiJson<Resume[]>('/career/resumes');
  },

  createResume(title: string): Promise<Resume> {
    return apiJson<Resume>('/career/resumes', { method: 'POST', body: JSON.stringify({ title }) });
  },

  getResume(masterId: string): Promise<Resume> {
    return apiJson<Resume>(`/career/resumes/${masterId}`);
  },

  updateResume(masterId: string, title: string): Promise<Resume> {
    return apiJson<Resume>(`/career/resumes/${masterId}`, { method: 'PATCH', body: JSON.stringify({ title }) });
  },

  deleteResume(masterId: string): Promise<{ status: string }> {
    return apiJson(`/career/resumes/${masterId}`, { method: 'DELETE' });
  },

  // ── Sections (mutable draft) ──────────────────────────────────────────────
  addSection(masterId: string, sectionType: string, title?: string, content?: any): Promise<ResumeSection> {
    return apiJson<ResumeSection>(`/career/resumes/${masterId}/sections`, {
      method: 'POST',
      body: JSON.stringify({ section_type: sectionType, title, content }),
    });
  },

  updateSection(
    masterId: string,
    sectionId: string,
    fields: Partial<Pick<ResumeSection, 'title' | 'content' | 'is_hidden' | 'sort_order'>>,
  ): Promise<ResumeSection> {
    return apiJson<ResumeSection>(`/career/resumes/${masterId}/sections/${sectionId}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
  },

  deleteSection(masterId: string, sectionId: string): Promise<{ status: string }> {
    return apiJson(`/career/resumes/${masterId}/sections/${sectionId}`, { method: 'DELETE' });
  },

  reorderSections(masterId: string, orderedIds: string[]): Promise<Resume> {
    return apiJson<Resume>(`/career/resumes/${masterId}/sections/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ordered_ids: orderedIds }),
    });
  },

  // ── Versioning ────────────────────────────────────────────────────────────
  listVersions(masterId: string): Promise<ResumeVersion[]> {
    return apiJson<ResumeVersion[]>(`/career/resumes/${masterId}/versions`);
  },

  snapshotVersion(masterId: string, label?: string): Promise<ResumeVersion> {
    return apiJson<ResumeVersion>(`/career/resumes/${masterId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  },

  getVersion(versionId: string): Promise<ResumeVersion> {
    return apiJson<ResumeVersion>(`/career/versions/${versionId}`);
  },

  restoreVersion(masterId: string, versionId: string): Promise<Resume> {
    return apiJson<Resume>(`/career/resumes/${masterId}/versions/${versionId}/restore`, { method: 'POST' });
  },

  cloneVersion(versionId: string, title?: string): Promise<Resume> {
    return apiJson<Resume>(`/career/versions/${versionId}/clone`, { method: 'POST', body: JSON.stringify({ title }) });
  },

  branchVersion(versionId: string, branchName: string): Promise<Resume> {
    return apiJson<Resume>(`/career/versions/${versionId}/branch`, {
      method: 'POST',
      body: JSON.stringify({ branch_name: branchName }),
    });
  },

  // ── AI: analyzer, import, copilot ─────────────────────────────────────────
  analyzeResume(masterId: string, jobDescription?: string): Promise<AnalysisRecord> {
    return apiJson<AnalysisRecord>(`/career/resumes/${masterId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ job_description: jobDescription, ...defaultAIRequestFields() }),
    });
  },

  getAnalysis(masterId: string): Promise<AnalysisRecord | Record<string, never>> {
    return apiJson(`/career/resumes/${masterId}/analysis`);
  },

  async importExtract(file: File): Promise<{ text: string }> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch('/career/import/extract', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },

  importStructure(rawText: string): Promise<{ sections: Array<{ section_type: string; title: string; content: any }> }> {
    return apiJson('/career/import/structure', {
      method: 'POST',
      body: JSON.stringify({ raw_text: rawText, ...defaultAIRequestFields() }),
    });
  },

  askCopilot(question: string, masterId?: string): Promise<{ answer: string }> {
    return apiJson('/career/copilot/ask', {
      method: 'POST',
      body: JSON.stringify({ question, master_id: masterId, ...defaultAIRequestFields() }),
    });
  },

  /**
   * Stream an inline AI rewrite of a section. Calls onToken for each chunk and
   * resolves with the full text. Backend streams text/plain (see analysis_router).
   */
  async rewriteSection(sectionId: string, instruction: string | undefined, onToken?: (chunk: string) => void): Promise<string> {
    const res = await apiFetch(`/career/sections/${sectionId}/rewrite`, {
      method: 'POST',
      body: JSON.stringify({ instruction, ...defaultAIRequestFields() }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const reader = res.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let full = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      onToken?.(chunk);
    }
    return full;
  },
};
