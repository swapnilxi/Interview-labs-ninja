'use client';

/** Cover Letter Generator API — generates a full letter from a profile + a job
 * target, then a lightweight editable draft with its own version history. */

import { apiFetch, apiJson, parseApiError } from '../http/apiClient';
import { defaultAIRequestFields } from './settingsService';
import type { CoverLetter, CoverLetterGenerateResult, CoverLetterTone, CoverLetterVersion } from '@/modules/career-studio/shared/types';

export const coverLetterService = {
  generate(args: {
    profileId: string;
    jobSource: 'url' | 'text' | 'json';
    jobUrl?: string;
    jobText?: string;
    jobJson?: any;
    tone: CoverLetterTone;
    notes?: string;
    title?: string;
    saveJob?: boolean;
    jobTitle?: string;
    company?: string;
  }): Promise<CoverLetterGenerateResult> {
    return apiJson<CoverLetterGenerateResult>('/career/cover-letters', {
      method: 'POST',
      body: JSON.stringify({
        profile_id: args.profileId,
        job_source: args.jobSource,
        job_url: args.jobUrl,
        job_text: args.jobText,
        job_json: args.jobJson,
        tone: args.tone,
        notes: args.notes,
        title: args.title,
        save_job: args.saveJob ?? false,
        job_title: args.jobTitle,
        company: args.company,
        ...defaultAIRequestFields(),
      }),
    });
  },

  list(): Promise<CoverLetter[]> {
    return apiJson<CoverLetter[]>('/career/cover-letters');
  },

  get(id: string): Promise<CoverLetter> {
    return apiJson<CoverLetter>(`/career/cover-letters/${id}`);
  },

  update(id: string, fields: Partial<{ title: string; tone: CoverLetterTone; content_text: string }>): Promise<CoverLetter> {
    return apiJson<CoverLetter>(`/career/cover-letters/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
  },

  remove(id: string): Promise<{ status: string }> {
    return apiJson(`/career/cover-letters/${id}`, { method: 'DELETE' });
  },

  snapshotVersion(id: string, label?: string): Promise<CoverLetterVersion> {
    return apiJson<CoverLetterVersion>(`/career/cover-letters/${id}/versions`, { method: 'POST', body: JSON.stringify({ label }) });
  },

  listVersions(id: string): Promise<CoverLetterVersion[]> {
    return apiJson<CoverLetterVersion[]>(`/career/cover-letters/${id}/versions`);
  },

  restoreVersion(id: string, versionId: string): Promise<CoverLetter> {
    return apiJson<CoverLetter>(`/career/cover-letters/${id}/versions/${versionId}/restore`, { method: 'POST' });
  },

  async exportBlob(id: string, format: 'html' | 'pdf' | 'markdown' | 'docx'): Promise<Blob> {
    const res = await apiFetch(`/career/cover-letters/${id}/export?format=${format}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.blob();
  },
};
