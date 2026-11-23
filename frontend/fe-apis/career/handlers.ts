/**
 * fe-apis/career/handlers.ts
 *
 * Route table for the Career Studio TypeScript twin. Paths mirror the Python
 * decorators in the career_studio routers minus the /career prefix.
 * Every handler is user-scoped via ctx.userId (the Python get_current_user_id twin).
 */

import { NextResponse } from 'next/server';
import type { TodoCtx, TodoRoute } from '../todo/router';
import { HttpError, type Row } from './db';
import * as db from './db';
import * as ai from './ai';

const notFound = (what = 'Not found'): never => { throw new HttpError(404, what); };
const badRequest = (msg: string): never => { throw new HttpError(400, msg); };
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

function settings(body: Row): ai.Settings {
  const out: ai.Settings = {};
  for (const key of [
    'model', 'geminiKey', 'openaiKey', 'anthropicKey', 'deepseekKey', 'groqKey',
    'openrouterKey', 'openrouterUrl', 'customKey', 'customBaseUrl', 'customModel',
    'ollamaUrl', 'ollamaModel',
  ] as const) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

/** Resolve a job source (url/text/json) to plain text, like shared/job_text.py. */
function jobText(body: Row): string {
  const source = body.job_source || 'text';
  if (source === 'json') {
    const j = body.job_json;
    if (!j) return '';
    return typeof j === 'string' ? j : JSON.stringify(j, null, 2);
  }
  if (source === 'url') {
    const url = str(body.job_url);
    return url ? `Job posting URL: ${url}\n\n${str(body.job_text)}` : str(body.job_text);
  }
  return str(body.job_text);
}

function resolveImportSections(userId: string, body: Row): { sections: Row[]; notes: string[] } {
  const source = body.source;
  if (source === 'json') {
    return { sections: arr(body.sections), notes: ['Sections taken from the supplied JSON.'] };
  }
  if (source === 'resume' || source === 'version' || source === 'portfolio') {
    const id = str(source === 'resume' ? body.resume_id : source === 'version' ? body.version_id : body.portfolio_id);
    if (!id) badRequest('A source id is required');
    if (source === 'version') {
      const v = db.getResumeVersion(userId, id);
      if (!v) notFound('Version not found');
      return { sections: arr(v.content), notes: ['Sections taken from the selected version.'] };
    }
    const tree = source === 'portfolio' ? db.getPortfolioTree(userId, id) : db.getResumeTree(userId, id);
    if (!tree) notFound('Source not found');
    const sections = source === 'portfolio'
      ? arr(tree.widgets).map((w) => ({ section_type: w.widget_type, title: w.title, content: w.content }))
      : arr(tree.sections).map((s) => ({ section_type: s.section_type, title: s.title, content: s.content, is_hidden: s.is_hidden }));
    return { sections, notes: [`Sections taken from “${tree.title}”.`] };
  }
  if (source === 'text') {
    const raw = str(body.raw_text);
    if (!raw.trim()) badRequest('No text was supplied');
    // The AI parse is done by the caller (preview/import) so it can be awaited.
    return { sections: [], notes: [] };
  }
  badRequest('Unknown import source');
}

async function importSections(userId: string, body: Row, s: ai.Settings): Promise<{ sections: Row[]; notes: string[] }> {
  if (body.source === 'text') {
    const parsed = await ai.structureImport(str(body.raw_text), s);
    return {
      sections: arr(parsed.sections),
      notes: Array.isArray(parsed.mapping_notes) ? parsed.mapping_notes.map(String) : ['AI-parsed from text.'],
    };
  }
  return resolveImportSections(userId, body);
}

// ── Tiny HTML renderers for the export endpoints ──────────────────────────────

const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function renderContent(content: Row): string {
  if (!content || typeof content !== 'object') return '';
  if (typeof content.text === 'string') return `<p>${esc(content.text).replace(/\n/g, '<br>')}</p>`;
  if (Array.isArray(content.items)) {
    return `<ul>${content.items.map((i: Row) => `<li><strong>${esc(i.title || i.name || i.label || '')}</strong>${i.subtitle || i.date ? ` — ${esc(i.subtitle || i.date)}` : ''}${i.description || i.text ? `<br>${esc(i.description || i.text)}</p>` : ''}</li>`).join('')}</ul>`;
  }
  if (Array.isArray(content.groups)) {
    return content.groups.map((g: Row) => `<p><strong>${esc(g.name)}</strong>: ${esc(Array.isArray(g.items) ? g.items.join(', ') : '')}</p>`).join('');
  }
  return Object.entries(content).filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => `<p><strong>${esc(k)}</strong>: ${esc(v)}</p>`).join('');
}

function renderResumeHtml(title: string, sections: Row[]): string {
  const body = sections.filter((s) => !s.hidden).map((s) => `<section><h2>${esc(s.title || s.section_type)}</h2>${renderContent(s.content)}</section>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Inter,Arial,sans-serif;max-width:800px;margin:40px auto;color:#18181b;line-height:1.6}
    h1{border-bottom:2px solid #7c3aed;padding-bottom:8px}h2{color:#7c3aed;font-size:1.1rem;margin-top:28px}
    ul{padding-left:20px}li{margin-bottom:10px}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

function renderPortfolioHtml(title: string, widgets: Row[]): string {
  const body = widgets.filter((w) => !w.hidden).map((w) => `<section><h2>${esc(w.title || w.widget_type)}</h2>${renderContent(w.content)}</section>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Inter,Arial,sans-serif;max-width:800px;margin:40px auto;color:#18181b;line-height:1.6}
    h1{border-bottom:2px solid #7c3aed;padding-bottom:8px}h2{color:#7c3aed;font-size:1.1rem;margin-top:28px}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

function htmlResponse(html: string, filename: string): Response {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.html"` },
  });
}

function safeFilename(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'career';
}

// ── Route table ───────────────────────────────────────────────────────────────

export const routes: TodoRoute[] = [
  // ── Master Profiles ────────────────────────────────────────────────────────
  { method: 'GET', path: '/profiles', handler: (c) => db.listProfiles(String(c.userId), c.query.get('include_archived') === 'true') },
  { method: 'POST', path: '/profiles', handler: async (c) => db.createProfile(String(c.userId), str((await c.json()).title) || 'My Profile') },
  { method: 'GET', path: '/profiles/:id', handler: (c) => db.getProfile(String(c.userId), c.params.id) ?? notFound('Profile not found') },
  { method: 'DELETE', path: '/profiles/:id', handler: (c) => {
    if (!db.getProfile(String(c.userId), c.params.id)) notFound('Profile not found');
    db.softDeleteResume(String(c.userId), c.params.id);
    return { status: 'deleted' };
  } },
  { method: 'POST', path: '/profiles/:id/duplicate', handler: async (c) => db.duplicateProfile(String(c.userId), c.params.id, str((await c.json()).title) || undefined) ?? notFound('Profile not found') },
  { method: 'POST', path: '/profiles/:id/archive', handler: (c) => db.setProfileArchived(String(c.userId), c.params.id, true) ?? notFound('Profile not found') },
  { method: 'POST', path: '/profiles/:id/unarchive', handler: (c) => db.setProfileArchived(String(c.userId), c.params.id, false) ?? notFound('Profile not found') },
  { method: 'PATCH', path: '/profiles/:id/metadata', handler: async (c) => db.updateProfileMetadata(String(c.userId), c.params.id, await c.json()) ?? notFound('Profile not found') },
  { method: 'POST', path: '/profiles/:id/touch', handler: (c) => { db.touchProfile(String(c.userId), c.params.id); return { status: 'ok' }; } },

  { method: 'POST', path: '/profiles/import/preview', handler: async (c) => {
    const body = await c.json();
    const { sections, notes } = await importSections(String(c.userId), body, settings(body));
    return { sections, count: sections.length, mapping_notes: notes };
  } },
  { method: 'POST', path: '/profiles/import', handler: async (c) => {
    const body = await c.json();
    const { sections } = await importSections(String(c.userId), body, settings(body));
    if (!sections.length) badRequest('No sections could be extracted from the source');
    const origins: Row = { resume: 'import_resume', version: 'import_version', portfolio: 'import_portfolio', json: 'import_json', text: 'import_text' };
    const confidence: Row = { resume: 90, version: 90, portfolio: 80, json: 100, text: 70 };
    return db.createProfileFromSections(String(c.userId), sections, str(body.title) || 'Imported Profile', origins[body.source] || 'manual', confidence[body.source] ?? null);
  } },
  { method: 'POST', path: '/profiles/:id/import', handler: async (c) => {
    const body = await c.json();
    if (!db.getProfile(String(c.userId), c.params.id)) notFound('Profile not found');
    const { sections } = await importSections(String(c.userId), body, settings(body));
    if (!sections.length) badRequest('No sections could be extracted from the source');
    const normalized = sections.map((s, i) => ({
      section_type: s.section_type || 'custom', title: s.title ?? null, content: s.content ?? {},
      sort_order: s.sort_order ?? i, is_hidden: Boolean(s.is_hidden), source: `import:${body.source || 'json'}`,
    }));
    if (body.mode === 'append') {
      for (const s of normalized) db.addSection(String(c.userId), c.params.id, s.section_type, s.title, s.content, s.source);
      return db.getProfile(String(c.userId), c.params.id);
    }
    return db.replaceProfileSections(String(c.userId), c.params.id, normalized);
  } },

  { method: 'POST', path: '/profiles/:id/enrich/preview', handler: async (c) => {
    const body = await c.json();
    const profile = db.getProfile(String(c.userId), c.params.id) ?? notFound('Profile not found');
    const { sections } = await importSections(String(c.userId), body, settings(body));
    if (!sections.length) badRequest('No content could be extracted from that source');
    const result = await ai.enrichPreview(profile, JSON.stringify(sections, null, 2), str(body.kind) || 'context', settings(body));
    return { additions: arr(result.additions), duplicates: arr(result.duplicates), conflicts: arr(result.conflicts) };
  } },
  { method: 'POST', path: '/profiles/:id/enrich/apply', handler: async (c) => {
    const body = await c.json();
    if (!db.getProfile(String(c.userId), c.params.id)) notFound('Profile not found');
    const additions = arr(body.additions);
    const conflicts = arr(body.conflict_resolutions);
    if (!additions.length && !conflicts.length) badRequest('Nothing to merge');
    db.snapshotResumeVersion(String(c.userId), c.params.id, `Before enrichment: ${str(body.kind)}`);
    const tag = `enrichment:${str(body.kind)}`;
    let added = 0;
    for (const a of additions) {
      if (db.addSection(String(c.userId), c.params.id, str(a.section_type) || 'custom', a.title ?? null, a.content ?? {}, tag)) added++;
    }
    let resolved = 0;
    for (const x of conflicts) {
      const fields: Row = { content: x.content ?? {}, source: tag };
      if (x.title !== undefined) fields.title = x.title;
      if (db.updateSection(String(c.userId), c.params.id, str(x.existing_section_id), fields)) resolved++;
    }
    return { profile: db.getProfile(String(c.userId), c.params.id), added, resolved };
  } },

  { method: 'POST', path: '/profiles/from-job', handler: async (c) => {
    const body = await c.json();
    const text = jobText(body);
    const extraction = await ai.extractJob(text, settings(body));
    const groups: Row[] = [];
    if (Array.isArray(extraction.required_skills) && extraction.required_skills.length) {
      groups.push({ name: 'Required by this role', items: extraction.required_skills.map(String) });
    }
    if (Array.isArray(extraction.preferred_skills) && extraction.preferred_skills.length) {
      groups.push({ name: 'Nice to have', items: extraction.preferred_skills.map(String) });
    }
    const sections: Row[] = [
      { section_type: 'personal_info', title: 'Personal Info', content: { name: '', title: str(extraction.title), email: '', phone: '', location: str(extraction.location), links: [] } },
      { section_type: 'summary', title: 'Summary', content: { text: '' } },
      { section_type: 'skills', title: 'Skills', content: { groups } },
      { section_type: 'experience', title: 'Experience', content: { items: [] } },
      { section_type: 'education', title: 'Education', content: { items: [] } },
    ];
    return db.createProfileFromSections(String(c.userId), sections, str(body.title) || `${str(extraction.title) || 'Job'} Profile`, 'from_job', 60);
  } },
  { method: 'POST', path: '/profiles/:id/match', handler: async (c) => {
    const body = await c.json();
    const profile = db.getProfile(String(c.userId), c.params.id) ?? notFound('Profile not found');
    if (!profile.sections?.length) badRequest('This profile has no content yet — add or import your details first.');
    const result = await ai.matchJob(profile, jobText(body), body.target_role, body.target_company, settings(body));
    let job: Row | undefined;
    if (body.save_job) job = db.createJob(String(c.userId), jobText(body), body.job_title, body.company, body.job_source === 'url' ? body.job_url : null);
    return { ...result, job: job ?? null };
  } },

  // ── Resumes ────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/resumes', handler: (c) => db.listResumes(String(c.userId)) },
  { method: 'POST', path: '/resumes', handler: async (c) => db.createResume(String(c.userId), str((await c.json()).title)) },
  { method: 'GET', path: '/resumes/:id', handler: (c) => db.getResumeTree(String(c.userId), c.params.id) ?? notFound('Resume not found') },
  { method: 'PATCH', path: '/resumes/:id', handler: async (c) => db.updateResume(String(c.userId), c.params.id, str((await c.json()).title)) ?? notFound('Resume not found') },
  { method: 'PATCH', path: '/resumes/:id/template', handler: async (c) => db.setResumeTemplate(String(c.userId), c.params.id, str((await c.json()).template_key)) ?? notFound('Resume not found') },
  { method: 'DELETE', path: '/resumes/:id', handler: (c) => { if (!db.softDeleteResume(String(c.userId), c.params.id)) notFound('Resume not found'); return { status: 'deleted' }; } },
  { method: 'GET', path: '/resumes/:id/export', handler: (c) => {
    const resume = db.getResumeTree(String(c.userId), c.params.id) ?? notFound('Resume not found');
    const format = c.query.get('format') || 'html';
    if (format !== 'html') badRequest('Only HTML export is available in this mode');
    return htmlResponse(renderResumeHtml(resume.title, arr(resume.sections)), safeFilename(resume.title));
  } },

  { method: 'POST', path: '/resumes/:id/sections', handler: async (c) => {
    const b = await c.json();
    return db.addSection(String(c.userId), c.params.id, str(b.section_type) || 'custom', b.title ?? null, b.content ?? {}, b.source ?? null) ?? notFound('Resume not found');
  } },
  { method: 'PATCH', path: '/resumes/:id/sections/:sid', handler: async (c) => db.updateSection(String(c.userId), c.params.id, c.params.sid, await c.json()) ?? notFound('Section not found') },
  { method: 'DELETE', path: '/resumes/:id/sections/:sid', handler: (c) => { if (!db.deleteSection(String(c.userId), c.params.id, c.params.sid)) notFound('Section not found'); return { status: 'deleted' }; } },
  { method: 'POST', path: '/resumes/:id/sections/reorder', handler: async (c) => {
    const b = await c.json();
    return db.reorderSections(String(c.userId), c.params.id, arr(b.ordered_ids).map((x) => str(x.id ?? x))) ?? notFound('Resume not found');
  } },

  { method: 'GET', path: '/resumes/:id/versions', handler: (c) => db.listResumeVersions(String(c.userId), c.params.id) },
  { method: 'POST', path: '/resumes/:id/versions', handler: async (c) => {
    const b = await c.json();
    return db.snapshotResumeVersion(String(c.userId), c.params.id, b.label ?? undefined) ?? notFound('Resume not found');
  } },
  { method: 'GET', path: '/versions/:id', handler: (c) => db.getResumeVersion(String(c.userId), c.params.id) ?? notFound('Version not found') },
  { method: 'POST', path: '/resumes/:id/versions/:vid/restore', handler: (c) => db.restoreResumeVersion(String(c.userId), c.params.id, c.params.vid) ?? notFound('Version not found') },
  { method: 'POST', path: '/versions/:id/clone', handler: async (c) => db.cloneResumeVersion(String(c.userId), c.params.id, str((await c.json()).title) || undefined) ?? notFound('Version not found') },
  { method: 'POST', path: '/versions/:id/branch', handler: async (c) => db.branchResumeVersion(String(c.userId), c.params.id, str((await c.json()).branch_name) || 'Branch') ?? notFound('Version not found') },

  { method: 'POST', path: '/resumes/:id/analyze', handler: async (c) => {
    const b = await c.json();
    const resume = db.getResumeTree(String(c.userId), c.params.id) ?? notFound('Resume not found');
    const report = await ai.analyzeResume(resume, b.job_description, settings(b));
    return db.insertAnalysis(String(c.userId), resume.current_draft_id, report, c.params.id, null);
  } },
  { method: 'GET', path: '/resumes/:id/analysis', handler: (c) => {
    const resume = db.getResumeTree(String(c.userId), c.params.id) ?? notFound('Resume not found');
    return db.getLatestAnalysis(String(c.userId), resume.current_draft_id) ?? {};
  } },
  { method: 'POST', path: '/resumes/:id/analyze/sections', handler: async (c) => {
    const b = await c.json();
    const resume = db.getResumeTree(String(c.userId), c.params.id) ?? notFound('Resume not found');
    const visible = arr(resume.sections).filter((s) => !s.is_hidden && s.section_type !== 'personal_info');
    if (!visible.length) badRequest('This resume has no sections to analyze yet.');
    return ai.analyzeSections(resume, b.job_description, b.job_title, settings(b));
  } },

  { method: 'POST', path: '/import/extract', handler: async (c) => {
    const form = await c.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') badRequest('A file is required');
    const text = await (file as File).text();
    return { text };
  } },
  { method: 'POST', path: '/import/structure', handler: async (c) => {
    const b = await c.json();
    return ai.structureImport(str(b.text || b.raw_text), settings(b));
  } },

  // ── Tailoring / generation ─────────────────────────────────────────────────
  { method: 'POST', path: '/resumes/:id/tailor', handler: async (c) => {
    const b = await c.json();
    const resume = db.getResumeTree(String(c.userId), c.params.id) ?? notFound('Resume not found');
    if (!resume.sections?.length) badRequest('This resume has no content yet.');
    let jd = str(b.job_description);
    if (b.job_description_id) jd = str(db.getJob(String(c.userId), str(b.job_description_id))?.raw_text) || jd;
    const result = await ai.tailorResume(resume, jd, b.notes, settings(b));
    let job: Row | undefined;
    if (b.save_job) job = db.createJob(String(c.userId), jd, b.job_title, b.company);
    return { ...result, job: job ?? null };
  } },
  { method: 'POST', path: '/resumes/:id/tailor/apply', handler: async (c) => {
    const b = await c.json();
    const resume = db.getResumeTree(String(c.userId), c.params.id) ?? notFound('Resume not found');
    const updates = arr(b.updates);
    if (!updates.length) badRequest('No updates to apply');
    const overrides = new Map(updates.map((u) => [str(u.section_id), u]));
    if (b.mode === 'in_place') {
      db.snapshotResumeVersion(String(c.userId), c.params.id, 'Before tailoring');
      let applied = 0;
      for (const s of arr(resume.sections)) {
        const u = overrides.get(s.id);
        if (!u) continue;
        const fields: Row = { content: u.content ?? {} };
        if (u.title !== undefined) fields.title = u.title;
        if (db.updateSection(String(c.userId), c.params.id, s.id, fields)) applied++;
      }
      return { mode: 'in_place', applied, resume_id: c.params.id };
    }
    const newSections = arr(resume.sections).map((s) => {
      const u = overrides.get(s.id);
      return {
        section_type: s.section_type, title: u?.title ?? s.title, content: u?.content ?? s.content,
        sort_order: s.sort_order, is_hidden: s.is_hidden,
      };
    });
    const copy = db.createProfileFromSections(String(c.userId), newSections, str(b.new_title) || `${resume.title} — ${str(b.job_label) || 'tailored'}`, 'tailor', 85);
    return { mode: 'copy', applied: updates.length, resume_id: copy.id, profile_id: copy.id };
  } },

  { method: 'POST', path: '/generate/resume', handler: async (c) => {
    const b = await c.json();
    const profile = db.getProfile(String(c.userId), str(b.profile_id)) ?? notFound('Profile not found');
    if (!profile.sections?.length) badRequest('This profile has no content yet — add or import your details first.');
    const jd = jobText(b);
    const result = await ai.generateResume(profile, jd, b.notes, b.target_role, b.target_company, settings(b));
    const overrides = new Map(arr(result.updates).map((u) => [str(u.section_id), u]));
    const newSections: Row[] = arr(profile.sections).map((s) => {
      const u = overrides.get(s.id);
      return {
        section_type: s.section_type, title: u?.title ?? s.title, content: u?.content ?? s.content,
        sort_order: s.sort_order, is_hidden: s.is_hidden,
      };
    });
    const validNew = new Set(['certifications', 'awards', 'achievements', 'research', 'languages', 'volunteer', 'publications', 'interests', 'custom']);
    const existing = new Set(newSections.map((s) => s.section_type));
    const addedTitles: string[] = [];
    for (const p of arr(result.new_sections)) {
      const st = str(p.section_type);
      if (!validNew.has(st) || existing.has(st) || !p.content || typeof p.content !== 'object') continue;
      const title = str(p.title) || st.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
      newSections.push({ section_type: st, title, content: p.content, sort_order: newSections.length, is_hidden: false });
      addedTitles.push(title);
      existing.add(st);
    }
    const label = (str(b.job_title) || str(b.company) || 'tailored').trim() || 'tailored';
    const newProfile = db.createProfileFromSections(String(c.userId), newSections, `${profile.title} — ${label}`, 'generate', 85);
    const view = db.createView(String(c.userId), newProfile.id, 'resume', str(b.title) || `${label} Resume`, b.template);
    let job: Row | undefined;
    if (b.save_job) job = db.createJob(String(c.userId), jd, b.job_title, b.company, b.job_source === 'url' ? b.job_url : null);
    return {
      view, profile_id: newProfile.id, summary: result.summary, keywords_added: result.keywords_added,
      sections_tailored: overrides.size, new_sections_added: addedTitles, gap_analysis: result.gap_analysis,
      job: job ?? null,
    };
  } },

  // ── Jobs ───────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/jobs', handler: (c) => db.listJobs(String(c.userId)) },
  { method: 'POST', path: '/jobs', handler: async (c) => {
    const b = await c.json();
    return db.createJob(String(c.userId), str(b.raw_text), b.title, b.company, b.url, b.structured ?? {});
  } },
  { method: 'DELETE', path: '/jobs/:id', handler: (c) => { if (!db.deleteJob(String(c.userId), c.params.id)) notFound('Job not found'); return { status: 'deleted' }; } },
  { method: 'POST', path: '/jobs/extract', handler: async (c) => {
    const b = await c.json();
    const text = jobText(b);
    return { raw_text: text, extraction: await ai.extractJob(text, settings(b)) };
  } },

  // ── Views ──────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/views', handler: (c) => db.listViews(String(c.userId), c.query.get('kind') || undefined) },
  { method: 'POST', path: '/views', handler: async (c) => {
    const b = await c.json();
    return db.createView(String(c.userId), str(b.profile_id), str(b.kind) || 'resume', b.title, b.template) ?? badRequest('Profile not found');
  } },
  { method: 'GET', path: '/views/:id', handler: (c) => db.getView(String(c.userId), c.params.id) ?? notFound('View not found') },
  { method: 'PATCH', path: '/views/:id', handler: async (c) => db.updateView(String(c.userId), c.params.id, await c.json()) ?? notFound('View not found') },
  { method: 'DELETE', path: '/views/:id', handler: (c) => { if (!db.deleteView(String(c.userId), c.params.id)) notFound('View not found'); return { status: 'deleted' }; } },
  { method: 'GET', path: '/views/:id/preview-data', handler: (c) => {
    const view = db.getView(String(c.userId), c.params.id) ?? notFound('View not found');
    if (view.kind !== 'portfolio') badRequest('Preview data is only available for portfolios');
    return { title: view.title, theme: { accent: view.accent || 'violet', font: view.font || 'sans', layout: view.layout || 'stack', template: view.template || 'modern3d' }, widgets: db.resolvedToWidgets(arr(view.sections)) };
  } },
  { method: 'GET', path: '/views/:id/export', handler: (c) => {
    const view = db.getView(String(c.userId), c.params.id) ?? notFound('View not found');
    if (!view.sections?.length) badRequest("This view's profile is empty or was deleted.");
    const format = c.query.get('format') || 'html';
    if (format !== 'html') badRequest('Only HTML export is available in this mode');
    const html = view.kind === 'portfolio'
      ? renderPortfolioHtml(view.title, db.resolvedToWidgets(arr(view.sections)))
      : renderResumeHtml(view.title, arr(view.sections));
    return htmlResponse(html, safeFilename(view.title));
  } },
  { method: 'GET', path: '/views/:id/publish', handler: (c) => {
    if (!db.getView(String(c.userId), c.params.id)) notFound('View not found');
    return db.getPublishedByMaster(String(c.userId), c.params.id) ?? {};
  } },
  { method: 'POST', path: '/views/:id/publish', handler: async (c) => {
    const view = db.getView(String(c.userId), c.params.id) ?? notFound('View not found');
    const b = (await c.json().catch(() => ({}))) as Row;
    const content = view.kind === 'portfolio' ? db.resolvedToWidgets(arr(view.sections)) : arr(view.sections).filter((s) => !s.hidden);
    return db.publish(String(c.userId), view.id, view.title, content, { theme: { accent: view.accent, font: view.font, layout: view.layout, template: view.template } }, view.kind, b.custom_slug || undefined);
  } },
  { method: 'DELETE', path: '/views/:id/publish', handler: (c) => { if (!db.unpublish(String(c.userId), c.params.id)) notFound('Published view not found'); return { status: 'unpublished' }; } },
  { method: 'GET', path: '/views/:id/publish/history', handler: (c) => db.listPublishedSnapshots(String(c.userId), c.params.id) },
  { method: 'GET', path: '/analytics/summary', handler: (c) => db.analyticsSummary(String(c.userId)) },

  { method: 'POST', path: '/views/:id/analyze', handler: async (c) => {
    const b = await c.json();
    const view = db.getView(String(c.userId), c.params.id) ?? notFound('View not found');
    const profile = db.getProfile(String(c.userId), view.profile_id) ?? notFound('Profile not found');
    const report = await ai.analyzeResume(profile, b.job_description, settings(b));
    return db.insertAnalysis(String(c.userId), profile.current_draft_id, report, profile.id, null);
  } },
  { method: 'GET', path: '/views/:id/analysis', handler: (c) => {
    const view = db.getView(String(c.userId), c.params.id) ?? notFound('View not found');
    const profile = db.getProfile(String(c.userId), view.profile_id);
    return (profile && db.getLatestAnalysis(String(c.userId), profile.current_draft_id)) || {};
  } },
  { method: 'POST', path: '/views/:id/tailor', handler: async (c) => {
    const b = await c.json();
    const view = db.getView(String(c.userId), c.params.id) ?? notFound('View not found');
    const profile = db.getProfile(String(c.userId), view.profile_id) ?? notFound('Profile not found');
    let jd = str(b.job_description);
    if (b.job_description_id) jd = str(db.getJob(String(c.userId), str(b.job_description_id))?.raw_text) || jd;
    const result = await ai.tailorResume(profile, jd, b.notes, settings(b));
    const byId = new Map(arr(view.sections).map((s) => [s.id, s]));
    const changes = arr(result.updates).map((u) => {
      const cur = byId.get(str(u.section_id));
      if (!cur || !('content' in u)) return null;
      return {
        section_id: u.section_id, section_type: cur.section_type, title: u.title ?? cur.title,
        before_text: JSON.stringify(cur.content), after_text: JSON.stringify(u.content),
        content: u.content, rationale: u.rationale,
      };
    }).filter(Boolean);
    let job: Row | undefined;
    if (b.save_job) job = db.createJob(String(c.userId), jd, b.job_title, b.company);
    return { summary: result.summary, keywords_added: result.keywords_added, changes, job: job ?? null };
  } },
  { method: 'POST', path: '/views/:id/tailor/apply', handler: async (c) => {
    const b = await c.json();
    const view = db.getView(String(c.userId), c.params.id) ?? notFound('View not found');
    const updates = arr(b.updates);
    if (!updates.length) badRequest('No updates to apply');
    const profile = db.getProfile(String(c.userId), view.profile_id) ?? badRequest("This view's profile was deleted");
    const overrides = new Map(updates.map((u) => [str(u.section_id), u]));
    if (b.mode === 'in_place') {
      db.snapshotResumeVersion(String(c.userId), profile.id, 'Before tailoring');
      let applied = 0;
      for (const s of arr(profile.sections)) {
        const u = overrides.get(s.id);
        if (!u) continue;
        const fields: Row = { content: u.content ?? {} };
        if (u.title !== undefined) fields.title = u.title;
        if (db.updateSection(String(c.userId), profile.id, s.id, fields)) applied++;
      }
      return { mode: 'in_place', applied, view_id: view.id, profile_id: profile.id };
    }
    const sections = arr(profile.sections).map((s) => {
      const u = overrides.get(s.id);
      return { section_type: s.section_type, title: u?.title ?? s.title, content: u?.content ?? s.content, sort_order: s.sort_order, is_hidden: s.is_hidden };
    });
    const label = str(b.job_label) || 'tailored';
    const newProfile = db.createProfileFromSections(String(c.userId), sections, `${profile.title} — ${label}`, 'tailor', 85);
    const newView = db.createView(String(c.userId), newProfile.id, view.kind, str(b.new_title) || `${view.title} — ${label}`, view.template);
    return { mode: 'new_profile', applied: updates.length, view_id: newView?.id, profile_id: newProfile.id };
  } },

  // ── Portfolios ─────────────────────────────────────────────────────────────
  { method: 'GET', path: '/portfolios', handler: (c) => db.listPortfolios(String(c.userId)) },
  { method: 'POST', path: '/portfolios', handler: async (c) => db.createPortfolio(String(c.userId), str((await c.json()).title)) },
  { method: 'GET', path: '/portfolios/:id', handler: (c) => db.getPortfolioTree(String(c.userId), c.params.id) ?? notFound('Portfolio not found') },
  { method: 'PATCH', path: '/portfolios/:id', handler: async (c) => db.updatePortfolio(String(c.userId), c.params.id, await c.json()) ?? notFound('Portfolio not found') },
  { method: 'DELETE', path: '/portfolios/:id', handler: (c) => { if (!db.softDeletePortfolio(String(c.userId), c.params.id)) notFound('Portfolio not found'); return { status: 'deleted' }; } },
  { method: 'GET', path: '/portfolios/:id/export', handler: (c) => {
    const p = db.getPortfolioTree(String(c.userId), c.params.id) ?? notFound('Portfolio not found');
    if (c.query.get('format') !== 'html') badRequest('Only HTML export is available in this mode');
    return htmlResponse(renderPortfolioHtml(p.title, arr(p.widgets)), safeFilename(p.title));
  } },
  { method: 'GET', path: '/portfolios/:id/publish', handler: (c) => db.getPublishedByMaster(String(c.userId), c.params.id) ?? {} },
  { method: 'POST', path: '/portfolios/:id/publish', handler: async (c) => {
    const p = db.getPortfolioTree(String(c.userId), c.params.id) ?? notFound('Portfolio not found');
    const b = (await c.json().catch(() => ({}))) as Row;
    return db.publish(String(c.userId), p.id, p.title, arr(p.widgets), { theme: p.theme }, 'portfolio', b.custom_slug || undefined);
  } },
  { method: 'DELETE', path: '/portfolios/:id/publish', handler: (c) => { if (!db.unpublish(String(c.userId), c.params.id)) notFound('Published portfolio not found'); return { status: 'unpublished' }; } },

  { method: 'POST', path: '/portfolios/:id/widgets', handler: async (c) => {
    const b = await c.json();
    return db.addWidget(String(c.userId), c.params.id, str(b.widget_type) || 'text', b.title ?? null, b.content ?? {}) ?? notFound('Portfolio not found');
  } },
  { method: 'PATCH', path: '/portfolios/:id/widgets/:wid', handler: async (c) => db.updateWidget(String(c.userId), c.params.id, c.params.wid, await c.json()) ?? notFound('Widget not found') },
  { method: 'DELETE', path: '/portfolios/:id/widgets/:wid', handler: (c) => { if (!db.deleteWidget(String(c.userId), c.params.id, c.params.wid)) notFound('Widget not found'); return { status: 'deleted' }; } },
  { method: 'POST', path: '/portfolios/:id/widgets/reorder', handler: async (c) => {
    const b = await c.json();
    return db.reorderWidgets(String(c.userId), c.params.id, arr(b.ordered_ids).map((x) => str(x.id ?? x))) ?? notFound('Portfolio not found');
  } },

  { method: 'GET', path: '/portfolios/:id/testimonials', handler: (c) => db.listTestimonials(String(c.userId), c.params.id, c.query.get('status') || undefined) },
  { method: 'POST', path: '/portfolios/:id/testimonials/:tid/approve', handler: (c) => db.setTestimonialStatus(String(c.userId), c.params.tid, 'approved') ?? notFound('Testimonial not found') },
  { method: 'POST', path: '/portfolios/:id/testimonials/:tid/reject', handler: (c) => db.setTestimonialStatus(String(c.userId), c.params.tid, 'rejected') ?? notFound('Testimonial not found') },
  { method: 'DELETE', path: '/portfolios/:id/testimonials/:tid', handler: (c) => { if (!db.deleteTestimonial(String(c.userId), c.params.tid)) notFound('Testimonial not found'); return { status: 'deleted' }; } },

  { method: 'GET', path: '/portfolios/:id/versions', handler: (c) => db.listPortfolioVersions(String(c.userId), c.params.id) },
  { method: 'POST', path: '/portfolios/:id/versions', handler: async (c) => db.snapshotPortfolioVersion(String(c.userId), c.params.id, str((await c.json()).label) || undefined) ?? notFound('Portfolio not found') },
  { method: 'GET', path: '/portfolio-versions/:id', handler: (c) => db.getPortfolioVersion(String(c.userId), c.params.id) ?? notFound('Version not found') },
  { method: 'POST', path: '/portfolios/:id/versions/:vid/restore', handler: (c) => db.restorePortfolioVersion(String(c.userId), c.params.id, c.params.vid) ?? notFound('Version not found') },
  { method: 'POST', path: '/portfolio-versions/:id/clone', handler: (c) => db.clonePortfolioVersion(String(c.userId), c.params.id) ?? notFound('Version not found') },

  { method: 'POST', path: '/portfolios/:id/analyze', handler: async (c) => {
    const p = db.getPortfolioTree(String(c.userId), c.params.id) ?? notFound('Portfolio not found');
    return ai.analyzePortfolio(p, settings(await c.json()));
  } },
  { method: 'GET', path: '/portfolios/:id/analysis', handler: () => ({}) },

  // ── Cover letters ──────────────────────────────────────────────────────────
  { method: 'GET', path: '/cover-letters', handler: (c) => db.listLetters(String(c.userId)) },
  { method: 'POST', path: '/cover-letters', handler: async (c) => {
    const b = await c.json();
    const profile = db.getProfile(String(c.userId), str(b.profile_id)) ?? notFound('Profile not found');
    let content = str(b.content_text);
    if (!content) {
      const job = b.job_description_id ? db.getJob(String(c.userId), str(b.job_description_id)) : undefined;
      content = await ai.generateCoverLetter(profile, str(b.job_description || job?.raw_text || ''), str(b.tone) || 'professional', settings(b));
    }
    return db.createLetter(String(c.userId), profile.id, str(b.title) || `${profile.title} — Cover Letter`, str(b.tone) || 'professional', content, b.job_description_id || null);
  } },
  { method: 'GET', path: '/cover-letters/:id', handler: (c) => db.getLetter(String(c.userId), c.params.id) ?? notFound('Cover letter not found') },
  { method: 'PATCH', path: '/cover-letters/:id', handler: async (c) => db.updateLetter(String(c.userId), c.params.id, await c.json()) ?? notFound('Cover letter not found') },
  { method: 'DELETE', path: '/cover-letters/:id', handler: (c) => { if (!db.deleteLetter(String(c.userId), c.params.id)) notFound('Cover letter not found'); return { status: 'deleted' }; } },
  { method: 'GET', path: '/cover-letters/:id/export', handler: (c) => {
    const letter = db.getLetter(String(c.userId), c.params.id) ?? notFound('Cover letter not found');
    if (c.query.get('format') !== 'html') badRequest('Only HTML export is available in this mode');
    return htmlResponse(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(letter.title)}</title></head><body><h1>${esc(letter.title)}</h1><p>${esc(letter.content_text).replace(/\n/g, '<br>')}</p></body></html>`, safeFilename(letter.title));
  } },
  { method: 'GET', path: '/cover-letters/:id/versions', handler: (c) => db.listLetterVersions(String(c.userId), c.params.id) },
  { method: 'POST', path: '/cover-letters/:id/versions', handler: async (c) => db.snapshotLetter(String(c.userId), c.params.id, str((await c.json()).label) || undefined) ?? notFound('Cover letter not found') },
  { method: 'POST', path: '/cover-letters/:id/versions/:vid/restore', handler: (c) => db.restoreLetterVersion(String(c.userId), c.params.id, c.params.vid) ?? notFound('Version not found') },

  // ── Templates ──────────────────────────────────────────────────────────────
  { method: 'GET', path: '/templates', handler: (c) => db.listTemplates(String(c.userId), c.query.get('kind') || undefined) },
  { method: 'POST', path: '/templates', handler: async (c) => {
    const b = await c.json();
    return db.createTemplate(String(c.userId), str(b.kind) || 'resume', str(b.name) || 'Untitled', b.spec ?? {}, b.source || 'custom');
  } },
  { method: 'GET', path: '/templates/:id', handler: (c) => db.getTemplate(String(c.userId), c.params.id) ?? notFound('Template not found') },
  { method: 'PATCH', path: '/templates/:id', handler: async (c) => db.updateTemplate(String(c.userId), c.params.id, await c.json()) ?? notFound('Template not found') },
  { method: 'DELETE', path: '/templates/:id', handler: (c) => { if (!db.deleteTemplate(String(c.userId), c.params.id)) notFound('Template not found'); return { status: 'deleted' }; } },
  { method: 'POST', path: '/templates/:id/duplicate', handler: (c) => db.duplicateTemplate(String(c.userId), c.params.id) ?? notFound('Template not found') },

  // ── Analysis / copilot ─────────────────────────────────────────────────────
  { method: 'POST', path: '/sections/:id/rewrite', handler: async (c) => {
    const b = await c.json();
    const section = db.getSection(String(c.userId), c.params.id) ?? notFound('Section not found');
    const text = await ai.rewriteSection(section, b.instruction, b.job_description, settings(b));
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } },
  { method: 'POST', path: '/copilot/ask', handler: async (c) => {
    const b = await c.json();
    const profile = b.master_id ? db.getProfile(String(c.userId), str(b.master_id)) : undefined;
    return ai.copilotAsk(str(b.question), profile, settings(b));
  } },

  // ── Job & People Tracker ───────────────────────────────────────────────────
  { method: 'GET', path: '/tracker/summary', handler: (c) => db.trackerSummary(String(c.userId)) },
  { method: 'GET', path: '/tracker/jobs', handler: (c) => db.listJobs(String(c.userId)) },
  { method: 'POST', path: '/tracker/jobs', handler: async (c) => db.createTrackedJob(String(c.userId), await c.json()) },
  { method: 'PATCH', path: '/tracker/jobs/:id', handler: async (c) => db.updateJobTracker(String(c.userId), c.params.id, await c.json()) ?? notFound('Job not found') },
  { method: 'GET', path: '/tracker/people', handler: (c) => db.listPeople(String(c.userId), {
    stage: c.query.get('stage') || undefined,
    relationship: c.query.get('relationship') || undefined,
    job_id: c.query.get('job_id') || undefined,
    q: c.query.get('q') || undefined,
  }) },
  { method: 'POST', path: '/tracker/people', handler: async (c) => db.createPerson(String(c.userId), await c.json()) },
  { method: 'GET', path: '/tracker/people/:id', handler: (c) => db.getPerson(String(c.userId), c.params.id) ?? notFound('Person not found') },
  { method: 'PATCH', path: '/tracker/people/:id', handler: async (c) => db.updatePerson(String(c.userId), c.params.id, await c.json()) ?? notFound('Person not found') },
  { method: 'DELETE', path: '/tracker/people/:id', handler: (c) => { if (!db.deletePerson(String(c.userId), c.params.id)) notFound('Person not found'); return { status: 'deleted' }; } },
];

/** Unauthenticated public routes (the Python public_router). */
export async function handlePublic(req: Request, segments: string[]): Promise<Response> {
  try {
    const method = req.method.toUpperCase();
    const url = new URL(req.url);
    // /public/portfolios/:slug[/v/:n|/testimonials|/download]
    if (segments[1] === 'portfolios' && segments[2]) {
      const slug = decodeURIComponent(segments[2]);
      if (method === 'POST' && segments[3] === 'testimonials') {
        const b = await req.json().catch(() => ({}));
        const snap = db.getPublishedBySlug(slug);
        if (!snap || snap.kind !== 'portfolio') throw new HttpError(404, "This portfolio isn't published (or the link is wrong).");
        const name = str(b.name).replace(/<[^>]*>/g, '').trim();
        const quote = str(b.quote).replace(/<[^>]*>/g, '').trim();
        if (!name || !quote) throw new HttpError(400, 'Name and quote are required');
        return NextResponse.json(db.submitTestimonial(slug, snap.master_id, snap.user_id, name, quote));
      }
      if (method === 'GET' && segments[3] === 'v' && segments[4]) {
        const snap = db.getPublishedBySlug(slug);
        if (!snap || snap.kind !== 'portfolio') throw new HttpError(404, 'That portfolio version is not available.');
        return NextResponse.json(snap);
      }
      if (method === 'GET' && !segments[3]) {
        const snap = db.getPublishedBySlug(slug, true);
        if (!snap || snap.kind !== 'portfolio') throw new HttpError(404, "This portfolio isn't published (or the link is wrong).");
        return NextResponse.json(snap);
      }
    }
    // /public/resumes/:slug
    if (segments[1] === 'resumes' && segments[2] && method === 'GET' && !segments[3]) {
      const snap = db.getPublishedBySlug(decodeURIComponent(segments[2]), true);
      if (!snap || snap.kind !== 'resume') throw new HttpError(404, "This resume isn't published (or the link is wrong).");
      return NextResponse.json({ slug: snap.slug, title: snap.title, html: renderResumeHtml(snap.title, arr(snap.content)), view_count: snap.view_count });
    }
    throw new HttpError(404, 'Not Found');
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ detail: err.detail }, { status: err.status });
    console.error('[career fe-api public] failed:', err);
    return NextResponse.json({ detail: 'Internal Server Error' }, { status: 500 });
  }
}
