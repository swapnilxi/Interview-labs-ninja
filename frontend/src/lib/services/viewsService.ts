'use client';

/**
 * Career "views" API — resumes/portfolios as live, template-driven renderings
 * of a Master Profile. Content is never stored on a view; it renders from the
 * chosen profile at read/export time.
 */

import { API_BASE_URL, apiFetch, apiJson, parseApiError } from '../http/apiClient';
import { defaultAIRequestFields } from './settingsService';
import type {
  AnalysisRecord,
  AnalyticsSummaryEntry,
  CareerView,
  PublicResume,
  PublishHistoryEntry,
  PublishStatus,
  TailorProposal,
  ViewKind,
  ViewTailorApplyResult,
} from '@/modules/career-studio/shared/types';

export const viewsService = {
  list(kind?: ViewKind): Promise<CareerView[]> {
    return apiJson<CareerView[]>(`/career/views${kind ? `?kind=${kind}` : ''}`);
  },
  create(args: { profileId: string; kind: ViewKind; title?: string; template?: string }): Promise<CareerView> {
    return apiJson<CareerView>('/career/views', {
      method: 'POST',
      body: JSON.stringify({ profile_id: args.profileId, kind: args.kind, title: args.title, template: args.template }),
    });
  },
  get(id: string): Promise<CareerView> {
    return apiJson<CareerView>(`/career/views/${id}`);
  },
  update(
    id: string,
    fields: Partial<{ title: string; template: string; accent: string; font: string; layout: string; profile_id: string; config: { items: Array<{ section_id: string; hidden: boolean }> } }>,
  ): Promise<CareerView> {
    return apiJson<CareerView>(`/career/views/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
  },
  remove(id: string): Promise<{ status: string }> {
    return apiJson(`/career/views/${id}`, { method: 'DELETE' });
  },

  async exportBlob(id: string, format: 'html' | 'pdf' | 'markdown' | 'docx'): Promise<Blob> {
    const res = await apiFetch(`/career/views/${id}/export?format=${format}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.blob();
  },

  // Portfolio-view publishing (reuses the public /p/{slug} reader).
  getPublishStatus(id: string): Promise<PublishStatus | Record<string, never>> {
    return apiJson(`/career/views/${id}/publish`);
  },
  publish(id: string, customSlug?: string): Promise<PublishStatus> {
    return apiJson<PublishStatus>(`/career/views/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ custom_slug: customSlug || undefined }),
    });
  },
  unpublish(id: string): Promise<{ status: string }> {
    return apiJson(`/career/views/${id}/publish`, { method: 'DELETE' });
  },
  getPublishHistory(id: string): Promise<PublishHistoryEntry[]> {
    return apiJson<PublishHistoryEntry[]>(`/career/views/${id}/publish/history`);
  },
  getAnalyticsSummary(): Promise<AnalyticsSummaryEntry[]> {
    return apiJson<AnalyticsSummaryEntry[]>('/career/analytics/summary');
  },

  // Public, UNAUTHENTICATED read of a published resume (/r/{slug}) — plain
  // fetch, no Bearer token, mirrors portfolioService.getPublic.
  async getPublicResume(slug: string): Promise<PublicResume> {
    const res = await fetch(`${API_BASE_URL}/career/public/resumes/${slug}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  async getPublicResumeVersion(slug: string, version: number): Promise<PublicResume> {
    const res = await fetch(`${API_BASE_URL}/career/public/resumes/${slug}/v/${version}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  async downloadPublicResume(slug: string, format: 'pdf' | 'html' = 'pdf'): Promise<Blob> {
    const res = await fetch(`${API_BASE_URL}/career/public/resumes/${slug}/download?format=${format}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.blob();
  },

  // ── AI: analyze + tailor, scoped to this view's visible sections ────────────
  // Content lives on the underlying profile, so tailoring writes back there —
  // either as a new tailored profile+view (mode 'new_profile') or in place with
  // an auto-checkpoint on the profile (mode 'in_place').
  analyze(id: string, jobDescription?: string): Promise<AnalysisRecord> {
    return apiJson<AnalysisRecord>(`/career/views/${id}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ job_description: jobDescription, ...defaultAIRequestFields() }),
    });
  },

  getAnalysis(id: string): Promise<AnalysisRecord | Record<string, never>> {
    return apiJson(`/career/views/${id}/analysis`);
  },

  /** Preview per-section rewrites tailored to a job description (no mutation). */
  tailor(
    id: string,
    args: { jobDescriptionId?: string; jobDescription?: string; notes?: string; saveJob?: boolean; jobTitle?: string; company?: string },
  ): Promise<TailorProposal> {
    return apiJson<TailorProposal>(`/career/views/${id}/tailor`, {
      method: 'POST',
      body: JSON.stringify({
        job_description_id: args.jobDescriptionId,
        job_description: args.jobDescription,
        notes: args.notes,
        save_job: args.saveJob ?? false,
        job_title: args.jobTitle,
        company: args.company,
        ...defaultAIRequestFields(),
      }),
    });
  },

  /** Commit tailored rewrites — as a new tailored profile+view, or in place on the profile. */
  applyTailor(
    id: string,
    args: { updates: Array<{ section_id: string; title?: string | null; content: any }>; mode: 'new_profile' | 'in_place'; jobLabel?: string },
  ): Promise<ViewTailorApplyResult> {
    return apiJson<ViewTailorApplyResult>(`/career/views/${id}/tailor/apply`, {
      method: 'POST',
      body: JSON.stringify({ updates: args.updates, mode: args.mode, job_label: args.jobLabel }),
    });
  },
};
