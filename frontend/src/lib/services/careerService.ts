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
import type {
  AnalysisRecord,
  EnrichmentApplyResult,
  EnrichmentKind,
  EnrichmentPreview,
  GenerateResumeResult,
  ImportedSection,
  JobDescription,
  JobExtraction,
  ProfileImportPreview,
  ProfileImportSource,
  Resume,
  ResumeSection,
  ResumeVersion,
  TailorApplyResult,
  TailorProposal,
} from '@/modules/career/types';

export { parseApiError };

export const careerService = {
  // ── Master Profiles (reusable data source; a profile is a Resume tree) ─────
  listProfiles(includeArchived = false): Promise<Resume[]> {
    return apiJson<Resume[]>(`/career/profiles${includeArchived ? '?include_archived=true' : ''}`);
  },
  createProfile(title: string): Promise<Resume> {
    return apiJson<Resume>('/career/profiles', { method: 'POST', body: JSON.stringify({ title }) });
  },
  getProfile(profileId: string): Promise<Resume> {
    return apiJson<Resume>(`/career/profiles/${profileId}`);
  },
  duplicateProfile(profileId: string, title?: string): Promise<Resume> {
    return apiJson<Resume>(`/career/profiles/${profileId}/duplicate`, { method: 'POST', body: JSON.stringify({ title }) });
  },
  createProfileFromJob(args: { jobSource: 'url' | 'text'; jobUrl?: string; jobText?: string; title?: string }): Promise<Resume> {
    return apiJson<Resume>('/career/profiles/from-job', {
      method: 'POST',
      body: JSON.stringify({
        job_source: args.jobSource,
        job_url: args.jobUrl,
        job_text: args.jobText,
        title: args.title,
        ...defaultAIRequestFields(),
      }),
    });
  },
  archiveProfile(profileId: string): Promise<Resume> {
    return apiJson<Resume>(`/career/profiles/${profileId}/archive`, { method: 'POST' });
  },
  unarchiveProfile(profileId: string): Promise<Resume> {
    return apiJson<Resume>(`/career/profiles/${profileId}/unarchive`, { method: 'POST' });
  },
  updateProfileMetadata(profileId: string, fields: Partial<{
    description: string;
    primary_role: string;
    experience_level: string;
    target_industry: string;
    target_roles: string[];
    target_companies: string[];
    tech_stack: string[];
    tags: string[];
  }>): Promise<Resume> {
    return apiJson<Resume>(`/career/profiles/${profileId}/metadata`, { method: 'PATCH', body: JSON.stringify(fields) });
  },
  touchProfile(profileId: string): Promise<{ status: string }> {
    return apiJson(`/career/profiles/${profileId}/touch`, { method: 'POST' });
  },
  deleteProfile(profileId: string): Promise<{ status: string }> {
    return apiJson(`/career/profiles/${profileId}`, { method: 'DELETE' });
  },

  // ── Profile import: seed/replace/append a profile's sections from an existing
  //    resume/profile, raw JSON, or AI-parsed plain text. `text` needs AI keys;
  //    `json`/`resume` ignore them (defaults are harmless).
  previewProfileImport(source: ProfileImportSource): Promise<ProfileImportPreview> {
    return apiJson('/career/profiles/import/preview', {
      method: 'POST',
      body: JSON.stringify({ ...source, ...defaultAIRequestFields() }),
    });
  },
  createProfileFromImport(source: ProfileImportSource, title?: string): Promise<Resume> {
    return apiJson<Resume>('/career/profiles/import', {
      method: 'POST',
      body: JSON.stringify({ ...source, title, ...defaultAIRequestFields() }),
    });
  },
  importIntoProfile(profileId: string, source: ProfileImportSource, mode: 'replace' | 'append'): Promise<Resume> {
    return apiJson<Resume>(`/career/profiles/${profileId}/import`, {
      method: 'POST',
      body: JSON.stringify({ ...source, mode, ...defaultAIRequestFields() }),
    });
  },

  // ── Profile Enrichment: merge another document into an EXISTING profile,
  //    with AI-assisted duplicate/conflict detection (see ProfileEnrichDialog).
  previewProfileEnrichment(profileId: string, kind: EnrichmentKind, source: ProfileImportSource): Promise<EnrichmentPreview> {
    return apiJson<EnrichmentPreview>(`/career/profiles/${profileId}/enrich/preview`, {
      method: 'POST',
      body: JSON.stringify({ kind, ...source, ...defaultAIRequestFields() }),
    });
  },
  applyProfileEnrichment(
    profileId: string,
    kind: EnrichmentKind,
    additions: Array<{ section_type: string; title?: string | null; content: any }>,
    conflictResolutions: Array<{ existing_section_id: string; content: any; title?: string | null }>,
  ): Promise<EnrichmentApplyResult> {
    return apiJson<EnrichmentApplyResult>(`/career/profiles/${profileId}/enrich/apply`, {
      method: 'POST',
      body: JSON.stringify({ kind, additions, conflict_resolutions: conflictResolutions }),
    });
  },

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

  setTemplate(masterId: string, templateKey: string): Promise<Resume> {
    return apiJson<Resume>(`/career/resumes/${masterId}/template`, { method: 'PATCH', body: JSON.stringify({ template_key: templateKey }) });
  },

  /** Fetch a rendered export (auth-attached). format 'html' | 'pdf'; template overrides the saved one. */
  async exportResumeBlob(masterId: string, format: 'html' | 'pdf', template?: string): Promise<Blob> {
    const q = new URLSearchParams({ format });
    if (template) q.set('template', template);
    const res = await apiFetch(`/career/resumes/${masterId}/export?${q.toString()}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.blob();
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

  // ── Generate a job-tailored resume from a profile + a job target ──────────
  generateResume(args: {
    profileId: string;
    jobSource: 'url' | 'text' | 'json';
    jobUrl?: string;
    jobText?: string;
    jobJson?: any;
    notes?: string;
    targetRole?: string;
    targetCompany?: string;
    template?: string;
    title?: string;
    saveJob?: boolean;
    jobTitle?: string;
    company?: string;
  }): Promise<GenerateResumeResult> {
    return apiJson<GenerateResumeResult>('/career/generate/resume', {
      method: 'POST',
      body: JSON.stringify({
        profile_id: args.profileId,
        job_source: args.jobSource,
        job_url: args.jobUrl,
        job_text: args.jobText,
        job_json: args.jobJson,
        notes: args.notes,
        target_role: args.targetRole,
        target_company: args.targetCompany,
        template: args.template,
        title: args.title,
        save_job: args.saveJob ?? false,
        job_title: args.jobTitle,
        company: args.company,
        ...defaultAIRequestFields(),
      }),
    });
  },

  // ── Job descriptions + JD-driven tailoring ────────────────────────────────
  listJobs(): Promise<JobDescription[]> {
    return apiJson<JobDescription[]>('/career/jobs');
  },

  createJob(fields: {
    raw_text: string;
    title?: string;
    company?: string;
    url?: string;
    structured?: Partial<Omit<JobExtraction, 'title' | 'company' | 'confidence'>> & { extraction_confidence?: number };
  }): Promise<JobDescription> {
    return apiJson<JobDescription>('/career/jobs', { method: 'POST', body: JSON.stringify(fields) });
  },

  /** Preview-only structured extraction from a job link/text/JSON — does not save anything. */
  extractJob(args: { jobSource: 'url' | 'text' | 'json'; jobUrl?: string; jobText?: string; jobJson?: any }): Promise<{ raw_text: string; extraction: JobExtraction }> {
    return apiJson('/career/jobs/extract', {
      method: 'POST',
      body: JSON.stringify({
        job_source: args.jobSource,
        job_url: args.jobUrl,
        job_text: args.jobText,
        job_json: args.jobJson,
        ...defaultAIRequestFields(),
      }),
    });
  },

  deleteJob(jobId: string): Promise<{ status: string }> {
    return apiJson(`/career/jobs/${jobId}`, { method: 'DELETE' });
  },

  /** Preview per-section rewrites tailored to a job description (no mutation). */
  tailorResume(
    masterId: string,
    args: { jobDescriptionId?: string; jobDescription?: string; notes?: string; saveJob?: boolean; jobTitle?: string; company?: string },
  ): Promise<TailorProposal> {
    return apiJson<TailorProposal>(`/career/resumes/${masterId}/tailor`, {
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

  /** Commit tailored rewrites — either in place (auto-checkpoint first) or as a new copy. */
  applyTailor(
    masterId: string,
    args: { updates: Array<{ section_id: string; title?: string | null; content: any }>; mode: 'copy' | 'in_place'; newTitle?: string; jobLabel?: string },
  ): Promise<TailorApplyResult> {
    return apiJson<TailorApplyResult>(`/career/resumes/${masterId}/tailor/apply`, {
      method: 'POST',
      body: JSON.stringify({ updates: args.updates, mode: args.mode, new_title: args.newTitle, job_label: args.jobLabel }),
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
  async rewriteSection(sectionId: string, instruction: string | undefined, jobDescription: string | undefined, onToken?: (chunk: string) => void): Promise<string> {
    const res = await apiFetch(`/career/sections/${sectionId}/rewrite`, {
      method: 'POST',
      body: JSON.stringify({ instruction, job_description: jobDescription, ...defaultAIRequestFields() }),
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
