/**
 * fe-apis/career/db.ts
 *
 * TypeScript twin of backend/modules/career_studio/{shared,resume,views,job_match,
 * portfolio,cover_letter,templates_designer,analysis,publishing}/db.py.
 *
 * Career Studio owns a SEPARATE database (career_studio.sqlite3). Everything here is
 * user-scoped: every function takes a `user_id` string and filters on it, exactly like
 * the Python twin. Keep the row shapes in sync with the Python `_to_dict` helpers —
 * the frontend types in src/modules/career-studio/shared/types.ts depend on them.
 */

import { randomUUID } from 'crypto';
import { getSQLiteDatabase } from '../_shared/db';

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export class HttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

export interface CareerDb {
  all<T = Row>(sql: string, ...params: unknown[]): T[];
  get<T = Row>(sql: string, ...params: unknown[]): T | undefined;
  run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number };
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
}

function bindable(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function wrap(raw: any): CareerDb { // eslint-disable-line @typescript-eslint/no-explicit-any
  let inTransaction = false;
  return {
    all: (sql, ...params) => raw.prepare(sql).all(...params.map(bindable)),
    get: (sql, ...params) => raw.prepare(sql).get(...params.map(bindable)) ?? undefined,
    run: (sql, ...params) => {
      const res = raw.prepare(sql).run(...params.map(bindable));
      return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
    },
    exec: (sql) => raw.exec(sql),
    transaction: (fn) => {
      if (inTransaction) return fn();
      raw.exec('BEGIN IMMEDIATE');
      inTransaction = true;
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw err;
      } finally {
        inTransaction = false;
      }
    },
  };
}

let current: CareerDb | null = null;
let schemaReady = false;

/** Run fn against career_studio.sqlite3. Re-entrant: nested db calls share one connection. */
export function withCareerDb<T>(fn: (db: CareerDb) => T): T {
  if (current) return fn(current);
  const res = getSQLiteDatabase('career_studio');
  if (!res) throw new HttpError(503, 'Database unavailable');
  const raw = res.db;
  raw.exec('PRAGMA busy_timeout = 5000');
  current = wrap(raw);
  try {
    if (!schemaReady) {
      ensureCareerSchema(current);
      schemaReady = true;
    }
    return fn(current);
  } finally {
    current = null;
    try { raw.close(); } catch { /* already closed */ }
  }
}

/** Python's json.loads on a TEXT column that may be NULL/empty/invalid. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function json(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function newId(): string {
  return randomUUID().replace(/-/g, '');
}

const bool = (v: unknown): boolean => v === 1 || v === true;

// ── Schema (port of shared/schema.py register()) ─────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS resume_master (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  current_version_id TEXT, current_draft_id TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS resume_versions (
  id TEXT PRIMARY KEY, master_id TEXT NOT NULL, user_id TEXT NOT NULL,
  parent_version_id TEXT, branch_name TEXT, label TEXT,
  is_immutable INTEGER NOT NULL DEFAULT 0, is_draft INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'draft', content_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS resume_sections (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL, master_id TEXT NOT NULL, user_id TEXT NOT NULL,
  section_type TEXT NOT NULL, title TEXT, content_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0, is_hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS resume_analysis (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, resume_version_id TEXT NOT NULL,
  master_id TEXT, job_description_id TEXT, report_json TEXT NOT NULL,
  overall_score INTEGER, ats_score INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS job_descriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, company TEXT, url TEXT,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY, user_id TEXT, feature TEXT NOT NULL, provider TEXT, model TEXT,
  latency_ms INTEGER, status TEXT NOT NULL DEFAULT 'success', error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS portfolio_master (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  current_version_id TEXT, current_draft_id TEXT, theme_json TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS portfolio_versions (
  id TEXT PRIMARY KEY, master_id TEXT NOT NULL, user_id TEXT NOT NULL,
  parent_version_id TEXT, branch_name TEXT, label TEXT,
  is_immutable INTEGER NOT NULL DEFAULT 0, is_draft INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'draft', content_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS portfolio_widgets (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL, master_id TEXT NOT NULL, user_id TEXT NOT NULL,
  widget_type TEXT NOT NULL, title TEXT, content_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0, is_hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resume_master_user ON resume_master(user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_resume_sections_version ON resume_sections(version_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_master ON resume_versions(master_id);
CREATE INDEX IF NOT EXISTS idx_resume_analysis_version ON resume_analysis(resume_version_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_master_user ON portfolio_master(user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_portfolio_widgets_version ON portfolio_widgets(version_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_versions_master ON portfolio_versions(master_id);
CREATE INDEX IF NOT EXISTS idx_job_descriptions_user ON job_descriptions(user_id);
CREATE TABLE IF NOT EXISTS portfolio_published (
  slug TEXT PRIMARY KEY, master_id TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT,
  content_json TEXT NOT NULL, theme_json TEXT, view_count INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_published_master ON portfolio_published(master_id);
CREATE TABLE IF NOT EXISTS published_snapshots (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL, master_id TEXT NOT NULL, user_id TEXT NOT NULL,
  kind TEXT NOT NULL, version_number INTEGER NOT NULL, title TEXT,
  content_json TEXT NOT NULL, theme_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_published_snapshots_master ON published_snapshots(master_id, version_number);
CREATE INDEX IF NOT EXISTS idx_published_snapshots_slug_version ON published_snapshots(slug, version_number);
CREATE TABLE IF NOT EXISTS view_events (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL, master_id TEXT NOT NULL, user_id TEXT NOT NULL,
  event_type TEXT NOT NULL, format TEXT, referrer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_view_events_master ON view_events(master_id, event_type);
CREATE INDEX IF NOT EXISTS idx_view_events_slug ON view_events(slug);
CREATE TABLE IF NOT EXISTS testimonial_submissions (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL, master_id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, quote TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_testimonial_submissions_master ON testimonial_submissions(master_id, status);
CREATE INDEX IF NOT EXISTS idx_testimonial_submissions_slug ON testimonial_submissions(slug, created_at);
CREATE TABLE IF NOT EXISTS career_views (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, profile_id TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, template TEXT, accent TEXT, font TEXT, layout TEXT, config_json TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_career_views_user ON career_views(user_id, kind, is_deleted);
CREATE TABLE IF NOT EXISTS career_templates (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
  spec_json TEXT NOT NULL, source TEXT, is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_career_templates_user ON career_templates(user_id, kind, is_deleted);
CREATE TABLE IF NOT EXISTS cover_letters (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, profile_id TEXT NOT NULL, job_description_id TEXT,
  title TEXT NOT NULL, tone TEXT NOT NULL DEFAULT 'professional',
  content_text TEXT NOT NULL DEFAULT '', is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cover_letter_versions (
  id TEXT PRIMARY KEY, letter_id TEXT NOT NULL, user_id TEXT NOT NULL, label TEXT,
  content_text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cover_letters_user ON cover_letters(user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_cover_letter_versions_letter ON cover_letter_versions(letter_id);
CREATE TABLE IF NOT EXISTS career_people (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT, company TEXT, email TEXT, phone TEXT, linkedin_url TEXT,
  relationship TEXT NOT NULL DEFAULT 'recruiter', stage TEXT NOT NULL DEFAULT 'lead',
  job_id TEXT, notes TEXT NOT NULL DEFAULT '', tags TEXT, last_contacted TEXT,
  next_follow_up TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_career_people_user ON career_people(user_id, stage, is_deleted);
CREATE INDEX IF NOT EXISTS idx_career_people_job ON career_people(job_id);
`;

const MIGRATIONS: Array<[string, string, string]> = [
  ['resume_master', 'template_key', 'TEXT'],
  ['portfolio_master', 'template_key', 'TEXT'],
  ['resume_master', 'is_profile', 'INTEGER NOT NULL DEFAULT 0'],
  ['resume_master', 'is_archived', 'INTEGER NOT NULL DEFAULT 0'],
  ['resume_master', 'origin', 'TEXT'],
  ['resume_master', 'primary_role', 'TEXT'],
  ['resume_master', 'experience_level', 'TEXT'],
  ['resume_master', 'target_industry', 'TEXT'],
  ['resume_master', 'target_roles', 'TEXT'],
  ['resume_master', 'target_companies', 'TEXT'],
  ['resume_master', 'tags', 'TEXT'],
  ['resume_master', 'confidence_score', 'INTEGER'],
  ['resume_master', 'last_used_at', 'TEXT'],
  ['resume_master', 'description', 'TEXT'],
  ['resume_master', 'tech_stack', 'TEXT'],
  ['resume_sections', 'source', 'TEXT'],
  ['job_descriptions', 'location', 'TEXT'],
  ['job_descriptions', 'employment_type', 'TEXT'],
  ['job_descriptions', 'experience_level', 'TEXT'],
  ['job_descriptions', 'education', 'TEXT'],
  ['job_descriptions', 'salary', 'TEXT'],
  ['job_descriptions', 'required_skills', 'TEXT'],
  ['job_descriptions', 'preferred_skills', 'TEXT'],
  ['job_descriptions', 'responsibilities', 'TEXT'],
  ['job_descriptions', 'benefits', 'TEXT'],
  ['job_descriptions', 'certifications', 'TEXT'],
  ['job_descriptions', 'extraction_confidence', 'INTEGER'],
  ['portfolio_published', 'kind', "TEXT NOT NULL DEFAULT 'portfolio'"],
  ['job_descriptions', 'status', "TEXT NOT NULL DEFAULT 'saved'"],
  ['job_descriptions', 'priority', "TEXT NOT NULL DEFAULT 'medium'"],
  ['job_descriptions', 'applied_at', 'TEXT'],
  ['job_descriptions', 'deadline', 'TEXT'],
  ['job_descriptions', 'notes', "TEXT NOT NULL DEFAULT ''"],
  ['job_descriptions', 'rating', 'INTEGER NOT NULL DEFAULT 0'],
];

function ensureCareerSchema(db: CareerDb): void {
  db.exec(DDL);
  for (const [table, column, ddl] of MIGRATIONS) {
    const cols = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
  }
  // After the migrations: on an existing DB the status column arrives here, not in the DDL above.
  db.exec('CREATE INDEX IF NOT EXISTS idx_job_descriptions_status ON job_descriptions(user_id, status)');
}

// ── Row mappers ───────────────────────────────────────────────────────────────

const MASTER_COLS = `id, user_id, title, current_version_id, current_draft_id, is_deleted, deleted_at,
  created_at, updated_at, template_key, is_profile, is_archived, origin, primary_role,
  experience_level, target_industry, target_roles, target_companies, tags, confidence_score,
  last_used_at, description, tech_stack`;
const SECTION_COLS = `id, version_id, master_id, user_id, section_type, title, content_json,
  sort_order, is_hidden, created_at, updated_at, source`;
const JOB_COLS = `id, title, company, url, raw_text, created_at, updated_at, location,
  employment_type, experience_level, education, salary, required_skills, preferred_skills,
  responsibilities, benefits, certifications, extraction_confidence,
  status, priority, applied_at, deadline, notes, rating`;
const VIEW_COLS = `id, user_id, profile_id, kind, title, template, accent, font, layout,
  config_json, is_deleted, created_at, updated_at`;
const TEMPLATE_COLS = `id, user_id, kind, name, spec_json, source, is_deleted, created_at, updated_at`;
const LETTER_COLS = `id, user_id, profile_id, job_description_id, title, tone, content_text,
  is_deleted, created_at, updated_at`;
const PM_COLS = `id, user_id, title, current_version_id, current_draft_id, theme_json,
  is_deleted, deleted_at, created_at, updated_at, template_key`;
const WIDGET_COLS = `id, version_id, master_id, user_id, widget_type, title, content_json,
  sort_order, is_hidden, created_at, updated_at`;

function masterToDict(r: Row): Row {
  return {
    id: r.id, user_id: r.user_id, title: r.title,
    current_version_id: r.current_version_id, current_draft_id: r.current_draft_id,
    is_deleted: bool(r.is_deleted), deleted_at: r.deleted_at,
    created_at: r.created_at, updated_at: r.updated_at, template_key: r.template_key,
    is_profile: bool(r.is_profile), is_archived: bool(r.is_archived), origin: r.origin,
    primary_role: r.primary_role, experience_level: r.experience_level,
    target_industry: r.target_industry,
    target_roles: parseJson(r.target_roles, []), target_companies: parseJson(r.target_companies, []),
    tags: parseJson(r.tags, []), confidence_score: r.confidence_score, last_used_at: r.last_used_at,
    description: r.description, tech_stack: parseJson(r.tech_stack, []),
  };
}

function sectionToDict(r: Row): Row {
  return {
    id: r.id, version_id: r.version_id, master_id: r.master_id,
    section_type: r.section_type, title: r.title, content: parseJson(r.content_json, {}),
    sort_order: r.sort_order, is_hidden: bool(r.is_hidden),
    created_at: r.created_at, updated_at: r.updated_at, source: r.source,
  };
}

function jobToDict(r: Row): Row {
  return {
    id: r.id, title: r.title, company: r.company, url: r.url, raw_text: r.raw_text,
    created_at: r.created_at, updated_at: r.updated_at, location: r.location,
    employment_type: r.employment_type, experience_level: r.experience_level,
    education: r.education, salary: r.salary,
    required_skills: parseJson(r.required_skills, []), preferred_skills: parseJson(r.preferred_skills, []),
    responsibilities: parseJson(r.responsibilities, []), benefits: parseJson(r.benefits, []),
    certifications: parseJson(r.certifications, []), extraction_confidence: r.extraction_confidence,
    status: r.status || 'saved', priority: r.priority || 'medium', applied_at: r.applied_at,
    deadline: r.deadline, notes: r.notes || '', rating: r.rating || 0,
  };
}

function viewMeta(r: Row): Row {
  return {
    id: r.id, profile_id: r.profile_id, kind: r.kind, title: r.title, template: r.template,
    accent: r.accent, font: r.font, layout: r.layout,
    config: parseJson(r.config_json, { items: [] }),
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

function templateToDict(r: Row): Row {
  return {
    id: r.id, kind: r.kind, name: r.name, spec: parseJson(r.spec_json, {}), source: r.source,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

function letterToDict(r: Row): Row {
  return {
    id: r.id, profile_id: r.profile_id, job_description_id: r.job_description_id,
    title: r.title, tone: r.tone, content_text: r.content_text,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

function pMasterToDict(r: Row): Row {
  return {
    id: r.id, user_id: r.user_id, title: r.title,
    current_version_id: r.current_version_id, current_draft_id: r.current_draft_id,
    theme: parseJson(r.theme_json, {}), template_key: r.template_key,
    is_deleted: bool(r.is_deleted), deleted_at: r.deleted_at,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

function widgetToDict(r: Row): Row {
  return {
    id: r.id, widget_type: r.widget_type, title: r.title, content: parseJson(r.content_json, {}),
    sort_order: r.sort_order, is_hidden: bool(r.is_hidden),
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

function versionToDict(r: Row): Row {
  return {
    id: r.id, master_id: r.master_id, parent_version_id: r.parent_version_id,
    branch_name: r.branch_name, label: r.label, is_immutable: bool(r.is_immutable),
    is_draft: bool(r.is_draft), source: r.source, content: parseJson(r.content_json, null),
    created_at: r.created_at,
  };
}

function analysisToDict(r: Row): Row {
  return {
    id: r.id, resume_version_id: r.resume_version_id, master_id: r.master_id,
    job_description_id: r.job_description_id, report: parseJson(r.report_json, {}),
    overall_score: r.overall_score, ats_score: r.ats_score, created_at: r.created_at,
  };
}

// ── Resume / Master Profile ───────────────────────────────────────────────────

const DEFAULT_SECTIONS: Array<[string, string]> = [
  ['personal_info', 'Personal Info'], ['summary', 'Summary'], ['experience', 'Experience'],
  ['education', 'Education'], ['skills', 'Skills'],
];
const DEFAULT_PROFILE_SECTIONS: Array<[string, string]> = [
  ['personal_info', 'Personal Info'], ['summary', 'Summary'], ['experience', 'Experience'],
  ['projects', 'Projects'], ['education', 'Education'], ['skills', 'Skills'],
  ['certifications', 'Certifications'],
];

export function defaultContent(sectionType: string): Row {
  if (sectionType === 'personal_info') return { name: '', title: '', email: '', phone: '', location: '', links: [] };
  if (sectionType === 'summary' || sectionType === 'career_goals') return { text: '' };
  if (sectionType === 'skills') return { groups: [] };
  return { items: [] };
}

function insertSection(
  db: CareerDb, userId: string, masterId: string, versionId: string,
  sectionType: string, title: string | null, content: unknown, sortOrder: number,
  isHidden = false, source: string | null = null,
): string {
  const sid = newId();
  db.run(
    `INSERT INTO resume_sections (id, version_id, master_id, user_id, section_type, title,
       content_json, sort_order, is_hidden, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    sid, versionId, masterId, userId, sectionType, title, json(content ?? {}), sortOrder,
    isHidden ? 1 : 0, source,
  );
  return sid;
}

function touchMaster(db: CareerDb, userId: string, masterId: string): void {
  db.run("UPDATE resume_master SET updated_at = datetime('now') WHERE id = ? AND user_id = ?", masterId, userId);
}

export function getMaster(userId: string, masterId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get(`SELECT ${MASTER_COLS} FROM resume_master WHERE id = ? AND user_id = ? AND is_deleted = 0`, masterId, String(userId));
    return r ? masterToDict(r) : undefined;
  });
}

export function getProfile(userId: string, profileId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get(`SELECT ${MASTER_COLS} FROM resume_master WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0`, profileId, String(userId));
    return r ? getResumeTreeFrom(db, userId, profileId) : undefined;
  });
}

function getResumeTreeFrom(db: CareerDb, userId: string, masterId: string): Row | undefined {
  const r = db.get(`SELECT ${MASTER_COLS} FROM resume_master WHERE id = ? AND user_id = ? AND is_deleted = 0`, masterId, String(userId));
  if (!r) return undefined;
  const master = masterToDict(r);
  const versionId = master.current_draft_id || master.current_version_id;
  const sections = versionId
    ? db.all(`SELECT ${SECTION_COLS} FROM resume_sections WHERE version_id = ? ORDER BY sort_order, created_at`, versionId).map(sectionToDict)
    : [];
  return { ...master, sections };
}

export function getResumeTree(userId: string, masterId: string): Row | undefined {
  return withCareerDb((db) => getResumeTreeFrom(db, userId, masterId));
}

function createMaster(
  db: CareerDb, userId: string, title: string, isProfile: boolean,
  sections: Array<[string, string]>, origin = 'manual',
): Row {
  const uid = String(userId);
  const masterId = newId();
  const draftId = newId();
  db.run(
    `INSERT INTO resume_master (id, user_id, title, current_draft_id, is_profile, origin)
     VALUES (?, ?, ?, ?, ?, ?)`,
    masterId, uid, title || (isProfile ? 'My Profile' : 'Untitled Resume'), draftId, isProfile ? 1 : 0, origin,
  );
  db.run(
    "INSERT INTO resume_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'draft')",
    draftId, masterId, uid,
  );
  sections.forEach(([type, label], i) => {
    insertSection(db, uid, masterId, draftId, type, label, defaultContent(type), i);
  });
  return getResumeTreeFrom(db, uid, masterId)!;
}

export function createResume(userId: string, title: string): Row {
  return withCareerDb((db) => db.transaction(() => createMaster(db, userId, title, false, DEFAULT_SECTIONS)));
}

export function createProfile(userId: string, title = 'My Profile', origin = 'manual'): Row {
  return withCareerDb((db) => db.transaction(() => createMaster(db, userId, title, true, DEFAULT_PROFILE_SECTIONS, origin)));
}

export function createProfileFromSections(
  userId: string, sections: Row[], title: string, origin = 'manual', confidenceScore: number | null = null,
): Row {
  return withCareerDb((db) => db.transaction(() => {
    const uid = String(userId);
    const masterId = newId();
    const draftId = newId();
    db.run(
      `INSERT INTO resume_master (id, user_id, title, current_draft_id, is_profile, origin, confidence_score)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      masterId, uid, title, draftId, origin, confidenceScore,
    );
    db.run("INSERT INTO resume_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'draft')", draftId, masterId, uid);
    sections.forEach((s, i) => {
      insertSection(db, uid, masterId, draftId, s.section_type || 'custom', s.title ?? null,
        s.content ?? {}, s.sort_order ?? i, bool(s.is_hidden), s.source ?? null);
    });
    return getResumeTreeFrom(db, uid, masterId)!;
  }));
}

export function replaceProfileSections(userId: string, profileId: string, sections: Row[]): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const profile = getResumeTreeFrom(db, userId, profileId);
    if (!profile || !profile.is_profile) return undefined;
    const versionId = profile.current_draft_id;
    db.run('DELETE FROM resume_sections WHERE version_id = ? AND user_id = ?', versionId, String(userId));
    sections.forEach((s, i) => {
      insertSection(db, String(userId), profileId, versionId, s.section_type || 'custom', s.title ?? null,
        s.content ?? {}, s.sort_order ?? i, bool(s.is_hidden), s.source ?? null);
    });
    touchMaster(db, String(userId), profileId);
    return getResumeTreeFrom(db, userId, profileId);
  }));
}

export function listProfiles(userId: string, includeArchived = false): Row[] {
  return withCareerDb((db) => {
    const rows = db.all(
      `SELECT ${MASTER_COLS} FROM resume_master WHERE user_id = ? AND is_profile = 1 AND is_deleted = 0
       ${includeArchived ? '' : 'AND is_archived = 0'} ORDER BY updated_at DESC`,
      String(userId),
    );
    return rows.map(masterToDict);
  });
}

export function listResumes(userId: string): Row[] {
  return withCareerDb((db) => {
    const rows = db.all(
      `SELECT ${MASTER_COLS} FROM resume_master WHERE user_id = ? AND is_profile = 0 AND is_deleted = 0 ORDER BY updated_at DESC`,
      String(userId),
    );
    return rows.map(masterToDict);
  });
}

export function setProfileArchived(userId: string, profileId: string, archived: boolean): Row | undefined {
  return withCareerDb((db) => {
    const res = db.run('UPDATE resume_master SET is_archived = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0', archived ? 1 : 0, profileId, String(userId));
    if (!res.changes) return undefined;
    const r = db.get(`SELECT ${MASTER_COLS} FROM resume_master WHERE id = ?`, profileId);
    return r ? masterToDict(r) : undefined;
  });
}

export function duplicateProfile(userId: string, profileId: string, title?: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const src = getResumeTreeFrom(db, userId, profileId);
    if (!src || !src.is_profile) return undefined;
    return createProfileFromSections(String(userId), src.sections, title || `${src.title} (copy)`, 'duplicate');
  }));
}

const PROFILE_METADATA_FIELDS = [
  'description', 'primary_role', 'experience_level', 'target_industry', 'target_roles',
  'target_companies', 'tech_stack', 'tags',
] as const;
const PROFILE_JSON_FIELDS = new Set<string>(['target_roles', 'target_companies', 'tech_stack', 'tags']);

export function updateProfileMetadata(userId: string, profileId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of PROFILE_METADATA_FIELDS) {
      if (!(key in fields)) continue;
      sets.push(`${key} = ?`);
      args.push(PROFILE_JSON_FIELDS.has(key) ? json(fields[key] ?? []) : fields[key]);
    }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE resume_master SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0`, ...args, profileId, String(userId));
    }
    const r = db.get(`SELECT ${MASTER_COLS} FROM resume_master WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0`, profileId, String(userId));
    return r ? masterToDict(r) : undefined;
  });
}

export function touchProfile(userId: string, profileId: string): boolean {
  return withCareerDb((db) => {
    const res = db.run("UPDATE resume_master SET last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0", profileId, String(userId));
    return res.changes > 0;
  });
}

export function updateResume(userId: string, masterId: string, title: string): Row | undefined {
  return withCareerDb((db) => {
    const res = db.run("UPDATE resume_master SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0", title, masterId, String(userId));
    return res.changes ? getResumeTreeFrom(db, userId, masterId) : undefined;
  });
}

export function setResumeTemplate(userId: string, masterId: string, templateKey: string): Row | undefined {
  return withCareerDb((db) => {
    const res = db.run("UPDATE resume_master SET template_key = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0", templateKey, masterId, String(userId));
    return res.changes ? getResumeTreeFrom(db, userId, masterId) : undefined;
  });
}

export function softDeleteResume(userId: string, masterId: string): boolean {
  return withCareerDb((db) => db.run(
    "UPDATE resume_master SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0",
    masterId, String(userId),
  ).changes > 0);
}

export function addSection(
  userId: string, masterId: string, sectionType: string, title: string | null,
  content: unknown, source: string | null = null,
): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const master = db.get(`SELECT ${MASTER_COLS} FROM resume_master WHERE id = ? AND user_id = ? AND is_deleted = 0`, masterId, String(userId));
    if (!master) return undefined;
    const m = masterToDict(master);
    const versionId = m.current_draft_id || m.current_version_id;
    const max = db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM resume_sections WHERE version_id = ?', versionId)!.n;
    const sid = insertSection(db, String(userId), masterId, versionId, sectionType, title, content, max, false, source);
    touchMaster(db, String(userId), masterId);
    const r = db.get(`SELECT ${SECTION_COLS} FROM resume_sections WHERE id = ?`, sid);
    return r ? sectionToDict(r) : undefined;
  }));
}

export function updateSection(userId: string, masterId: string, sectionId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const existing = db.get('SELECT * FROM resume_sections WHERE id = ? AND master_id = ? AND user_id = ?', sectionId, masterId, String(userId));
    if (!existing) return undefined;
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ['section_type', 'title', 'sort_order', 'is_hidden', 'source']) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if ('content' in fields) { sets.push('content_json = ?'); args.push(json(fields.content)); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE resume_sections SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, ...args, sectionId, String(userId));
      touchMaster(db, String(userId), masterId);
    }
    const r = db.get(`SELECT ${SECTION_COLS} FROM resume_sections WHERE id = ?`, sectionId);
    return r ? sectionToDict(r) : undefined;
  }));
}

export function deleteSection(userId: string, masterId: string, sectionId: string): boolean {
  return withCareerDb((db) => db.transaction(() => {
    const res = db.run('DELETE FROM resume_sections WHERE id = ? AND master_id = ? AND user_id = ?', sectionId, masterId, String(userId));
    if (res.changes) touchMaster(db, String(userId), masterId);
    return res.changes > 0;
  }));
}

export function reorderSections(userId: string, masterId: string, orderedIds: string[]): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const master = db.get(`SELECT ${MASTER_COLS} FROM resume_master WHERE id = ? AND user_id = ? AND is_deleted = 0`, masterId, String(userId));
    if (!master) return undefined;
    const m = masterToDict(master);
    const versionId = m.current_draft_id || m.current_version_id;
    orderedIds.forEach((sid, i) => {
      db.run('UPDATE resume_sections SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ? AND version_id = ? AND user_id = ?', i, sid, versionId, String(userId));
    });
    touchMaster(db, String(userId), masterId);
    return getResumeTreeFrom(db, userId, masterId);
  }));
}

export function getSection(userId: string, sectionId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get(`SELECT ${SECTION_COLS} FROM resume_sections WHERE id = ? AND user_id = ?`, sectionId, String(userId));
    return r ? sectionToDict(r) : undefined;
  });
}

// ── Versions (resume + portfolio) ─────────────────────────────────────────────

function listVersionsFor(db: CareerDb, table: string, masterId: string, userId: string): Row[] {
  return db.all(`SELECT * FROM ${table} WHERE master_id = ? AND user_id = ? ORDER BY created_at DESC`, masterId, String(userId)).map(versionToDict);
}

export function listResumeVersions(userId: string, masterId: string): Row[] {
  return withCareerDb((db) => listVersionsFor(db, 'resume_versions', masterId, String(userId)));
}

export function getResumeVersion(userId: string, versionId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get('SELECT * FROM resume_versions WHERE id = ? AND user_id = ?', versionId, String(userId));
    return r ? versionToDict(r) : undefined;
  });
}

export function snapshotResumeVersion(userId: string, masterId: string, label?: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const tree = getResumeTreeFrom(db, userId, masterId);
    if (!tree) return undefined;
    const vid = newId();
    db.run(
      `INSERT INTO resume_versions (id, master_id, user_id, parent_version_id, label, is_immutable, source, content_json)
       VALUES (?, ?, ?, ?, ?, 1, 'checkpoint', ?)`,
      vid, masterId, String(userId), tree.current_version_id || null, label || null, json(tree.sections),
    );
    db.run('UPDATE resume_master SET current_version_id = ? WHERE id = ? AND user_id = ?', vid, masterId, String(userId));
    const r = db.get('SELECT * FROM resume_versions WHERE id = ?', vid);
    return r ? versionToDict(r) : undefined;
  }));
}

export function restoreResumeVersion(userId: string, masterId: string, versionId: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const version = db.get('SELECT * FROM resume_versions WHERE id = ? AND master_id = ? AND user_id = ?', versionId, masterId, String(userId));
    if (!version) return undefined;
    const sections = parseJson<Row[]>(version.content_json, []);
    const draftId = newId();
    const oldDraft = (db.get('SELECT current_draft_id FROM resume_master WHERE id = ? AND user_id = ?', masterId, String(userId)) as { current_draft_id: string } | undefined)?.current_draft_id;
    db.run("INSERT INTO resume_versions (id, master_id, user_id, parent_version_id, is_draft, source) VALUES (?, ?, ?, ?, 1, 'restore')", draftId, masterId, String(userId), versionId);
    if (oldDraft) db.run('DELETE FROM resume_sections WHERE version_id = ? AND user_id = ?', oldDraft, String(userId));
    sections.forEach((s, i) => insertSection(db, String(userId), masterId, draftId, s.section_type || 'custom', s.title ?? null, s.content ?? {}, s.sort_order ?? i, bool(s.is_hidden), s.source ?? null));
    db.run('UPDATE resume_master SET current_draft_id = ?, current_version_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?', draftId, versionId, masterId, String(userId));
    return getResumeTreeFrom(db, userId, masterId);
  }));
}

export function cloneResumeVersion(userId: string, versionId: string, title?: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const version = db.get('SELECT * FROM resume_versions WHERE id = ? AND user_id = ?', versionId, String(userId));
    if (!version) return undefined;
    const sections = parseJson<Row[]>(version.content_json, []);
    return createProfileFromSections(String(userId), sections, title || 'Copy', 'clone');
  }));
}

export function branchResumeVersion(userId: string, versionId: string, branchName: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const version = db.get('SELECT * FROM resume_versions WHERE id = ? AND user_id = ?', versionId, String(userId));
    if (!version) return undefined;
    const sections = parseJson<Row[]>(version.content_json, []);
    return createProfileFromSections(String(userId), sections, branchName || 'Branch', 'branch');
  }));
}

// ── Views ─────────────────────────────────────────────────────────────────────

const RESUME_VIEW_DEFAULTS: Row = { template: 'classic', accent: null, font: null, layout: null };
const PORTFOLIO_VIEW_DEFAULTS: Row = { template: 'modern3d', accent: 'violet', font: 'sans', layout: 'stack' };

function seedConfig(profile: Row): Row {
  return { items: (profile.sections || []).map((s: Row) => ({ section_id: s.id, hidden: bool(s.is_hidden) })) };
}

function getViewMeta(db: CareerDb, userId: string, viewId: string): Row | undefined {
  const r = db.get(`SELECT ${VIEW_COLS} FROM career_views WHERE id = ? AND user_id = ? AND is_deleted = 0`, viewId, String(userId));
  return r ? viewMeta(r) : undefined;
}

export function createView(userId: string, profileId: string, kind: string, title?: string, template?: string): Row | undefined {
  return withCareerDb((db) => {
    const profile = getResumeTreeFrom(db, userId, profileId);
    if (!profile || !profile.is_profile) return undefined;
    const defaults = kind === 'portfolio' ? PORTFOLIO_VIEW_DEFAULTS : RESUME_VIEW_DEFAULTS;
    const vid = newId();
    db.run(
      `INSERT INTO career_views (id, user_id, profile_id, kind, title, template, accent, font, layout, config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      vid, String(userId), profileId, kind, title || `${profile.title} — ${kind === 'portfolio' ? 'Portfolio' : 'Resume'}`,
      template || defaults.template, defaults.accent, defaults.font, defaults.layout, json(seedConfig(profile)),
    );
    return getViewFrom(db, userId, vid);
  });
}

export function listViews(userId: string, kind?: string): Row[] {
  return withCareerDb((db) => {
    const rows = kind
      ? db.all(`SELECT ${VIEW_COLS} FROM career_views WHERE user_id = ? AND kind = ? AND is_deleted = 0 ORDER BY updated_at DESC`, String(userId), kind)
      : db.all(`SELECT ${VIEW_COLS} FROM career_views WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC`, String(userId));
    return rows.map((r) => {
      const m = viewMeta(r);
      m.section_count = (m.config.items || []).filter((i: Row) => !i.hidden).length;
      delete m.config;
      return m;
    });
  });
}

export function resolveSections(view: Row, profile: Row): Row[] {
  const byId = new Map<string, Row>((profile.sections || []).map((s: Row) => [s.id, s]));
  const ordered: Row[] = [];
  const seen = new Set<string>();
  for (const item of (view.config?.items || []) as Row[]) {
    const s = byId.get(item.section_id);
    if (!s) continue;
    ordered.push({ ...s, hidden: bool(item.hidden) });
    seen.add(item.section_id);
  }
  for (const s of (profile.sections || []) as Row[]) {
    if (!seen.has(s.id)) ordered.push({ ...s, hidden: bool(s.is_hidden) });
  }
  return ordered;
}

export function getView(userId: string, viewId: string): Row | undefined {
  return withCareerDb((db) => getViewFrom(db, userId, viewId));
}

function getViewFrom(db: CareerDb, userId: string, viewId: string): Row | undefined {
  const meta = getViewMeta(db, userId, viewId);
  if (!meta) return undefined;
  const profile = getResumeTreeFrom(db, userId, meta.profile_id);
  if (!profile) {
    return { ...meta, profile_title: null, sections: [] };
  }
  const resolved = resolveSections(meta, profile);
  return {
    ...meta,
    profile_title: profile.title,
    sections: resolved,
    config: { items: resolved.map((s) => ({ section_id: s.id, hidden: bool(s.hidden) })) },
  };
}

export function updateView(userId: string, viewId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => {
    if (!getViewMeta(db, userId, viewId)) return undefined;
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ['profile_id', 'kind', 'title', 'template', 'accent', 'font', 'layout']) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if ('config' in fields) { sets.push('config_json = ?'); args.push(json(fields.config)); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE career_views SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, ...args, viewId, String(userId));
    }
    return getViewFrom(db, userId, viewId);
  });
}

export function deleteView(userId: string, viewId: string): boolean {
  return withCareerDb((db) => db.run('UPDATE career_views SET is_deleted = 1 WHERE id = ? AND user_id = ?', viewId, String(userId)).changes > 0);
}

export function resolvedToWidgets(sections: Row[]): Row[] {
  const map: Record<string, string> = {
    personal_info: 'contact', summary: 'text', experience: 'experience', education: 'education',
    skills: 'skills', projects: 'projects', certifications: 'stats',
  };
  return sections.filter((s) => !s.hidden).map((s, i) => ({
    id: s.id, widget_type: map[s.section_type] || 'text', title: s.title || s.section_type,
    content: s.content, is_hidden: false, sort_order: i,
  }));
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

const JOB_STRUCTURED_FIELDS = [
  'location', 'employment_type', 'experience_level', 'education', 'salary',
] as const;
const JOB_LIST_FIELDS = ['required_skills', 'preferred_skills', 'responsibilities', 'benefits', 'certifications'] as const;

export function createJob(
  userId: string, rawText: string, title?: string | null, company?: string | null,
  url?: string | null, structured: Row = {},
): Row {
  return withCareerDb((db) => {
    const id = newId();
    const args: unknown[] = [id, String(userId), title ?? null, company ?? null, url ?? null, rawText || ''];
    for (const f of JOB_STRUCTURED_FIELDS) args.push(structured[f] ?? null);
    for (const f of JOB_LIST_FIELDS) args.push(structured[f]?.length ? json(structured[f]) : null);
    args.push(structured.extraction_confidence ?? null);
    db.run(
      `INSERT INTO job_descriptions (id, user_id, title, company, url, raw_text,
         location, employment_type, experience_level, education, salary,
         required_skills, preferred_skills, responsibilities, benefits, certifications, extraction_confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...args,
    );
    return jobToDict(db.get(`SELECT ${JOB_COLS} FROM job_descriptions WHERE id = ?`, id)!);
  });
}

export function listJobs(userId: string): Row[] {
  return withCareerDb((db) => db.all(`SELECT ${JOB_COLS} FROM job_descriptions WHERE user_id = ? ORDER BY updated_at DESC`, String(userId)).map(jobToDict));
}

export function getJob(userId: string, jobId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get(`SELECT ${JOB_COLS} FROM job_descriptions WHERE id = ? AND user_id = ?`, jobId, String(userId));
    return r ? jobToDict(r) : undefined;
  });
}

export function deleteJob(userId: string, jobId: string): boolean {
  return withCareerDb((db) => db.run('DELETE FROM job_descriptions WHERE id = ? AND user_id = ?', jobId, String(userId)).changes > 0);
}

// ── Templates ─────────────────────────────────────────────────────────────────

export function listTemplates(userId: string, kind?: string): Row[] {
  return withCareerDb((db) => {
    const rows = kind
      ? db.all(`SELECT ${TEMPLATE_COLS} FROM career_templates WHERE user_id = ? AND kind = ? AND is_deleted = 0 ORDER BY updated_at DESC`, String(userId), kind)
      : db.all(`SELECT ${TEMPLATE_COLS} FROM career_templates WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC`, String(userId));
    return rows.map(templateToDict);
  });
}

export function getTemplate(userId: string, templateId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get(`SELECT ${TEMPLATE_COLS} FROM career_templates WHERE id = ? AND user_id = ? AND is_deleted = 0`, templateId, String(userId));
    return r ? templateToDict(r) : undefined;
  });
}

export function createTemplate(userId: string, kind: string, name: string, spec: Row, source = 'custom'): Row {
  return withCareerDb((db) => {
    const id = newId();
    db.run(`INSERT INTO career_templates (id, user_id, kind, name, spec_json, source) VALUES (?, ?, ?, ?, ?, ?)`, id, String(userId), kind, name, json(spec), source);
    return getTemplate(userId, id)!;
  });
}

export function updateTemplate(userId: string, templateId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ['kind', 'name', 'source']) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if ('spec' in fields) { sets.push('spec_json = ?'); args.push(json(fields.spec)); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE career_templates SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND is_deleted = 0`, ...args, templateId, String(userId));
    }
    return getTemplate(userId, templateId);
  });
}

export function deleteTemplate(userId: string, templateId: string): boolean {
  return withCareerDb((db) => db.run('UPDATE career_templates SET is_deleted = 1 WHERE id = ? AND user_id = ?', templateId, String(userId)).changes > 0);
}

export function duplicateTemplate(userId: string, templateId: string): Row | undefined {
  const src = getTemplate(userId, templateId);
  return src ? createTemplate(userId, src.kind, `${src.name} (copy)`, src.spec, 'duplicate') : undefined;
}

// ── Cover letters ─────────────────────────────────────────────────────────────

export function listLetters(userId: string): Row[] {
  return withCareerDb((db) => db.all(`SELECT ${LETTER_COLS} FROM cover_letters WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC`, String(userId)).map(letterToDict));
}

export function getLetter(userId: string, letterId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get(`SELECT ${LETTER_COLS} FROM cover_letters WHERE id = ? AND user_id = ? AND is_deleted = 0`, letterId, String(userId));
    return r ? letterToDict(r) : undefined;
  });
}

export function createLetter(userId: string, profileId: string, title: string, tone: string, contentText: string, jobDescriptionId?: string | null): Row {
  return withCareerDb((db) => {
    const id = newId();
    db.run(`INSERT INTO cover_letters (id, user_id, profile_id, job_description_id, title, tone, content_text) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, String(userId), profileId, jobDescriptionId ?? null, title, tone, contentText);
    return getLetter(userId, id)!;
  });
}

export function updateLetter(userId: string, letterId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ['title', 'tone', 'content_text', 'profile_id', 'job_description_id']) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE cover_letters SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND is_deleted = 0`, ...args, letterId, String(userId));
    }
    return getLetter(userId, letterId);
  });
}

export function deleteLetter(userId: string, letterId: string): boolean {
  return withCareerDb((db) => db.run('UPDATE cover_letters SET is_deleted = 1 WHERE id = ? AND user_id = ?', letterId, String(userId)).changes > 0);
}

export function snapshotLetter(userId: string, letterId: string, label?: string): Row | undefined {
  return withCareerDb((db) => {
    const letter = getLetter(userId, letterId);
    if (!letter) return undefined;
    const id = newId();
    db.run('INSERT INTO cover_letter_versions (id, letter_id, user_id, label, content_text) VALUES (?, ?, ?, ?, ?)', id, letterId, String(userId), label ?? null, letter.content_text);
    const r = db.get('SELECT * FROM cover_letter_versions WHERE id = ?', id)!;
    return { id: r.id, letter_id: r.letter_id, label: r.label, content_text: r.content_text, created_at: r.created_at };
  });
}

export function listLetterVersions(userId: string, letterId: string): Row[] {
  return withCareerDb((db) => db.all('SELECT * FROM cover_letter_versions WHERE letter_id = ? AND user_id = ? ORDER BY created_at DESC', letterId, String(userId)).map((r) => ({
    id: r.id, letter_id: r.letter_id, label: r.label, content_text: r.content_text, created_at: r.created_at,
  })));
}

export function restoreLetterVersion(userId: string, letterId: string, versionId: string): Row | undefined {
  return withCareerDb((db) => {
    const v = db.get('SELECT * FROM cover_letter_versions WHERE id = ? AND letter_id = ? AND user_id = ?', versionId, letterId, String(userId));
    if (!v) return undefined;
    db.run("UPDATE cover_letters SET content_text = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?", v.content_text, letterId, String(userId));
    return getLetter(userId, letterId);
  });
}

// ── Portfolios ────────────────────────────────────────────────────────────────

export function defaultWidgetContent(widgetType: string): Row {
  if (widgetType === 'hero') return { headline: '', subheadline: '', tagline: '', ctaLabel: '', ctaUrl: '' };
  if (widgetType === 'text') return { text: '' };
  if (widgetType === 'contact') return { email: '', phone: '', location: '', links: [] };
  if (widgetType === 'skills') return { groups: [] };
  if (widgetType === 'stats') return { items: [] };
  return { items: [] };
}

function getPortfolioTreeFrom(db: CareerDb, userId: string, masterId: string): Row | undefined {
  const r = db.get(`SELECT ${PM_COLS} FROM portfolio_master WHERE id = ? AND user_id = ? AND is_deleted = 0`, masterId, String(userId));
  if (!r) return undefined;
  const master = pMasterToDict(r);
  const versionId = master.current_draft_id || master.current_version_id;
  const widgets = versionId
    ? db.all(`SELECT ${WIDGET_COLS} FROM portfolio_widgets WHERE version_id = ? ORDER BY sort_order, created_at`, versionId).map(widgetToDict)
    : [];
  return { ...master, widgets };
}

export function getPortfolioTree(userId: string, masterId: string): Row | undefined {
  return withCareerDb((db) => getPortfolioTreeFrom(db, userId, masterId));
}

export function listPortfolios(userId: string): Row[] {
  return withCareerDb((db) => db.all(`SELECT ${PM_COLS} FROM portfolio_master WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC`, String(userId)).map(pMasterToDict));
}

export function createPortfolio(userId: string, title: string): Row {
  return withCareerDb((db) => db.transaction(() => {
    const uid = String(userId);
    const id = newId();
    const draftId = newId();
    db.run('INSERT INTO portfolio_master (id, user_id, title, current_draft_id) VALUES (?, ?, ?, ?)', id, uid, title || 'Untitled Portfolio', draftId);
    db.run("INSERT INTO portfolio_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'draft')", draftId, id, uid);
    return getPortfolioTreeFrom(db, uid, id)!;
  }));
}

export function updatePortfolio(userId: string, masterId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ['title', 'template_key']) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if ('theme' in fields) { sets.push('theme_json = ?'); args.push(json(fields.theme)); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE portfolio_master SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND is_deleted = 0`, ...args, masterId, String(userId));
    }
    return getPortfolioTreeFrom(db, userId, masterId);
  });
}

export function softDeletePortfolio(userId: string, masterId: string): boolean {
  return withCareerDb((db) => db.run("UPDATE portfolio_master SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ? AND user_id = ?", masterId, String(userId)).changes > 0);
}

export function addWidget(userId: string, masterId: string, widgetType: string, title: string | null, content: unknown): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const master = db.get(`SELECT ${PM_COLS} FROM portfolio_master WHERE id = ? AND user_id = ? AND is_deleted = 0`, masterId, String(userId));
    if (!master) return undefined;
    const m = pMasterToDict(master);
    const versionId = m.current_draft_id || m.current_version_id;
    const max = db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM portfolio_widgets WHERE version_id = ?', versionId)!.n;
    const id = newId();
    db.run(`INSERT INTO portfolio_widgets (id, version_id, master_id, user_id, widget_type, title, content_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, versionId, masterId, String(userId), widgetType, title, json(content ?? defaultWidgetContent(widgetType)), max);
    db.run("UPDATE portfolio_master SET updated_at = datetime('now') WHERE id = ? AND user_id = ?", masterId, String(userId));
    const r = db.get(`SELECT ${WIDGET_COLS} FROM portfolio_widgets WHERE id = ?`, id);
    return r ? widgetToDict(r) : undefined;
  }));
}

export function updateWidget(userId: string, masterId: string, widgetId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of ['widget_type', 'title', 'sort_order', 'is_hidden']) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if ('content' in fields) { sets.push('content_json = ?'); args.push(json(fields.content)); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE portfolio_widgets SET ${sets.join(', ')} WHERE id = ? AND master_id = ? AND user_id = ?`, ...args, widgetId, masterId, String(userId));
      db.run("UPDATE portfolio_master SET updated_at = datetime('now') WHERE id = ? AND user_id = ?", masterId, String(userId));
    }
    const r = db.get(`SELECT ${WIDGET_COLS} FROM portfolio_widgets WHERE id = ?`, widgetId);
    return r ? widgetToDict(r) : undefined;
  }));
}

export function deleteWidget(userId: string, masterId: string, widgetId: string): boolean {
  return withCareerDb((db) => db.run('DELETE FROM portfolio_widgets WHERE id = ? AND master_id = ? AND user_id = ?', widgetId, masterId, String(userId)).changes > 0);
}

export function reorderWidgets(userId: string, masterId: string, orderedIds: string[]): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const tree = getPortfolioTreeFrom(db, userId, masterId);
    if (!tree) return undefined;
    orderedIds.forEach((id, i) => db.run("UPDATE portfolio_widgets SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND master_id = ? AND user_id = ?", i, id, masterId, String(userId)));
    return getPortfolioTreeFrom(db, userId, masterId);
  }));
}

export function listPortfolioVersions(userId: string, masterId: string): Row[] {
  return withCareerDb((db) => listVersionsFor(db, 'portfolio_versions', masterId, String(userId)));
}

export function getPortfolioVersion(userId: string, versionId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get('SELECT * FROM portfolio_versions WHERE id = ? AND user_id = ?', versionId, String(userId));
    return r ? versionToDict(r) : undefined;
  });
}

export function snapshotPortfolioVersion(userId: string, masterId: string, label?: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const tree = getPortfolioTreeFrom(db, userId, masterId);
    if (!tree) return undefined;
    const id = newId();
    db.run(`INSERT INTO portfolio_versions (id, master_id, user_id, parent_version_id, label, is_immutable, source, content_json) VALUES (?, ?, ?, ?, ?, 1, 'checkpoint', ?)`, id, masterId, String(userId), tree.current_version_id || null, label ?? null, json(tree.widgets));
    db.run('UPDATE portfolio_master SET current_version_id = ? WHERE id = ? AND user_id = ?', id, masterId, String(userId));
    const r = db.get('SELECT * FROM portfolio_versions WHERE id = ?', id)!;
    return versionToDict(r);
  }));
}

export function restorePortfolioVersion(userId: string, masterId: string, versionId: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const v = db.get('SELECT * FROM portfolio_versions WHERE id = ? AND master_id = ? AND user_id = ?', versionId, masterId, String(userId));
    if (!v) return undefined;
    const widgets = parseJson<Row[]>(v.content_json, []);
    const draftId = newId();
    const oldDraft = (db.get('SELECT current_draft_id FROM portfolio_master WHERE id = ? AND user_id = ?', masterId, String(userId)) as { current_draft_id: string } | undefined)?.current_draft_id;
    db.run("INSERT INTO portfolio_versions (id, master_id, user_id, parent_version_id, is_draft, source) VALUES (?, ?, ?, ?, 1, 'restore')", draftId, masterId, String(userId), versionId);
    if (oldDraft) db.run('DELETE FROM portfolio_widgets WHERE version_id = ? AND user_id = ?', oldDraft, String(userId));
    widgets.forEach((w, i) => db.run(`INSERT INTO portfolio_widgets (id, version_id, master_id, user_id, widget_type, title, content_json, sort_order, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, newId(), draftId, masterId, String(userId), w.widget_type || 'text', w.title ?? null, json(w.content ?? {}), w.sort_order ?? i, w.is_hidden ? 1 : 0));
    db.run("UPDATE portfolio_master SET current_draft_id = ?, current_version_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?", draftId, versionId, masterId, String(userId));
    return getPortfolioTreeFrom(db, userId, masterId);
  }));
}

export function clonePortfolioVersion(userId: string, versionId: string): Row | undefined {
  return withCareerDb((db) => db.transaction(() => {
    const v = db.get('SELECT * FROM portfolio_versions WHERE id = ? AND user_id = ?', versionId, String(userId));
    if (!v) return undefined;
    const widgets = parseJson<Row[]>(v.content_json, []);
    const uid = String(userId);
    const id = newId();
    const draftId = newId();
    db.run('INSERT INTO portfolio_master (id, user_id, title, current_draft_id) VALUES (?, ?, ?, ?)', id, uid, 'Portfolio (copy)', draftId);
    db.run("INSERT INTO portfolio_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'clone')", draftId, id, uid);
    widgets.forEach((w, i) => db.run(`INSERT INTO portfolio_widgets (id, version_id, master_id, user_id, widget_type, title, content_json, sort_order, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, newId(), draftId, id, uid, w.widget_type || 'text', w.title ?? null, json(w.content ?? {}), w.sort_order ?? i, w.is_hidden ? 1 : 0));
    return getPortfolioTreeFrom(db, uid, id);
  }));
}

// ── Analysis records ──────────────────────────────────────────────────────────

export function insertAnalysis(
  userId: string, versionId: string, report: Row, masterId?: string | null, jobDescriptionId?: string | null,
): Row {
  return withCareerDb((db) => {
    const id = newId();
    db.run(`INSERT INTO resume_analysis (id, user_id, resume_version_id, master_id, job_description_id, report_json, overall_score, ats_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, String(userId), versionId, masterId ?? null, jobDescriptionId ?? null, json(report),
      report.overall_score ?? null, report.ats_score ?? null);
    return { ...report, id, created_at: db.get('SELECT created_at FROM resume_analysis WHERE id = ?', id)!.created_at };
  });
}

export function getLatestAnalysis(userId: string, versionId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get('SELECT * FROM resume_analysis WHERE user_id = ? AND resume_version_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', String(userId), versionId);
    return r ? analysisToDict(r) : undefined;
  });
}

export function trackAiRun(userId: string, feature: string, provider: string | null, model: string | null, started: number, status = 'success', error: string | null = null): void {
  try {
    withCareerDb((db) => db.run(
      'INSERT INTO ai_runs (id, user_id, feature, provider, model, latency_ms, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      newId(), String(userId), feature, provider, model, Date.now() - started, status, error,
    ));
  } catch { /* auditing must never break the request */ }
}

// ── Publishing / testimonials / analytics ─────────────────────────────────────

function slugify(title: string, kind: string): string {
  const base = String(title || kind).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || kind;
  return `${base}-${newId().slice(0, 6)}`;
}

export function getPublishedByMaster(userId: string, masterId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get('SELECT * FROM portfolio_published WHERE master_id = ? AND user_id = ?', masterId, String(userId));
    return r ? publishedToDict(r) : undefined;
  });
}

function publishedToDict(r: Row, includeContent = true): Row {
  const out: Row = {
    slug: r.slug, master_id: r.master_id, title: r.title, view_count: r.view_count,
    is_public: bool(r.is_public), kind: r.kind || 'portfolio',
    created_at: r.created_at, updated_at: r.updated_at,
  };
  if (includeContent) {
    out.content = parseJson(r.content_json, []);
    out.theme = parseJson(r.theme_json, {});
  }
  return out;
}

export function publish(
  userId: string, masterId: string, title: string, content: unknown,
  extra: Row = {}, kind = 'portfolio', customSlug?: string,
): Row {
  return withCareerDb((db) => db.transaction(() => {
    const existing = db.get('SELECT slug FROM portfolio_published WHERE master_id = ? AND user_id = ?', masterId, String(userId));
    const slug = customSlug || existing?.slug || slugify(title, kind);
    const theme = extra.theme ?? {};
    db.run(`INSERT INTO portfolio_published (slug, master_id, user_id, title, content_json, theme_json, kind)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET title=excluded.title, content_json=excluded.content_json,
              theme_json=excluded.theme_json, kind=excluded.kind, updated_at=datetime('now')`,
      slug, masterId, String(userId), title, json(content), json(theme), kind);
    const next = (db.get<{ n: number }>('SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM published_snapshots WHERE master_id = ?', masterId)!).n;
    db.run(`INSERT INTO published_snapshots (id, slug, master_id, user_id, kind, version_number, title, content_json, theme_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(), slug, masterId, String(userId), kind, next, title, json(content), json(theme));
    return publishedToDict(db.get('SELECT * FROM portfolio_published WHERE slug = ?', slug)!);
  }));
}

export function unpublish(userId: string, masterId: string): boolean {
  return withCareerDb((db) => db.run('DELETE FROM portfolio_published WHERE master_id = ? AND user_id = ?', masterId, String(userId)).changes > 0);
}

export function getPublishedBySlug(slug: string, countView = false): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get('SELECT * FROM portfolio_published WHERE slug = ? AND is_public = 1', slug);
    if (!r) return undefined;
    if (countView) db.run('UPDATE portfolio_published SET view_count = view_count + 1 WHERE slug = ?', slug);
    return publishedToDict(r);
  });
}

export function listPublishedSnapshots(userId: string, masterId: string): Row[] {
  return withCareerDb((db) => db.all('SELECT * FROM published_snapshots WHERE master_id = ? AND user_id = ? ORDER BY version_number DESC', masterId, String(userId)).map((r) => ({
    id: r.id, slug: r.slug, version_number: r.version_number, kind: r.kind, title: r.title,
    content: parseJson(r.content_json, []), theme: parseJson(r.theme_json, {}), created_at: r.created_at,
  })));
}

export function analyticsSummary(userId: string): Row[] {
  return withCareerDb((db) => db.all(
    `SELECT p.slug, p.master_id, p.title, p.view_count,
       (SELECT COUNT(*) FROM view_events e WHERE e.slug = p.slug AND e.event_type = 'download') AS downloads
     FROM portfolio_published p WHERE p.user_id = ? ORDER BY p.view_count DESC`,
    String(userId),
  ));
}

export function listTestimonials(userId: string, masterId: string, status?: string): Row[] {
  return withCareerDb((db) => {
    const rows = status
      ? db.all('SELECT * FROM testimonial_submissions WHERE master_id = ? AND user_id = ? AND status = ? ORDER BY created_at DESC', masterId, String(userId), status)
      : db.all('SELECT * FROM testimonial_submissions WHERE master_id = ? AND user_id = ? ORDER BY created_at DESC', masterId, String(userId));
    return rows.map((r) => ({
      id: r.id, slug: r.slug, master_id: r.master_id, name: r.name, quote: r.quote,
      status: r.status, created_at: r.created_at, decided_at: r.decided_at,
    }));
  });
}

export function setTestimonialStatus(userId: string, testimonialId: string, status: string): Row | undefined {
  return withCareerDb((db) => {
    const res = db.run("UPDATE testimonial_submissions SET status = ?, decided_at = datetime('now') WHERE id = ? AND user_id = ?", status, testimonialId, String(userId));
    if (!res.changes) return undefined;
    const r = db.get('SELECT * FROM testimonial_submissions WHERE id = ?', testimonialId)!;
    return { id: r.id, slug: r.slug, master_id: r.master_id, name: r.name, quote: r.quote, status: r.status, created_at: r.created_at, decided_at: r.decided_at };
  });
}

export function deleteTestimonial(userId: string, testimonialId: string): boolean {
  return withCareerDb((db) => db.run('DELETE FROM testimonial_submissions WHERE id = ? AND user_id = ?', testimonialId, String(userId)).changes > 0);
}

export function submitTestimonial(slug: string, masterId: string, ownerUserId: string, name: string, quote: string): Row {
  return withCareerDb((db) => {
    const id = newId();
    db.run('INSERT INTO testimonial_submissions (id, slug, master_id, user_id, name, quote) VALUES (?, ?, ?, ?, ?, ?)', id, slug, masterId, ownerUserId, name, quote);
    const r = db.get('SELECT * FROM testimonial_submissions WHERE id = ?', id)!;
    return { id: r.id, slug: r.slug, master_id: r.master_id, name: r.name, quote: r.quote, status: r.status, created_at: r.created_at };
  });
}

// ── Job & People Tracker ──────────────────────────────────────────────────────

const PEOPLE_COLS = `id, user_id, name, role, company, email, phone, linkedin_url,
  relationship, stage, job_id, notes, tags, last_contacted, next_follow_up, created_at, updated_at`;

function personToDict(r: Row): Row {
  return {
    id: r.id, name: r.name, role: r.role, company: r.company, email: r.email, phone: r.phone,
    linkedin_url: r.linkedin_url, relationship: r.relationship, stage: r.stage, job_id: r.job_id,
    notes: r.notes || '', tags: parseJson<string[]>(r.tags, []),
    last_contacted: r.last_contacted, next_follow_up: r.next_follow_up,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

export function listPeople(userId: string, filters: Row = {}): Row[] {
  return withCareerDb((db) => {
    const where = ['user_id = ?', 'is_deleted = 0'];
    const args: unknown[] = [String(userId)];
    if (filters.stage) { where.push('stage = ?'); args.push(filters.stage); }
    if (filters.relationship) { where.push('relationship = ?'); args.push(filters.relationship); }
    if (filters.job_id) { where.push('job_id = ?'); args.push(filters.job_id); }
    if (filters.q) { where.push('(instr(lower(name), lower(?)) > 0 OR instr(lower(COALESCE(company,\'\')), lower(?)) > 0)'); args.push(filters.q, filters.q); }
    return db.all(`SELECT ${PEOPLE_COLS} FROM career_people WHERE ${where.join(' AND ')} ORDER BY updated_at DESC`, ...args).map(personToDict);
  });
}

export function getPerson(userId: string, personId: string): Row | undefined {
  return withCareerDb((db) => {
    const r = db.get(`SELECT ${PEOPLE_COLS} FROM career_people WHERE id = ? AND user_id = ? AND is_deleted = 0`, personId, String(userId));
    return r ? personToDict(r) : undefined;
  });
}

const PERSON_FIELDS = [
  'name', 'role', 'company', 'email', 'phone', 'linkedin_url', 'relationship', 'stage',
  'job_id', 'notes', 'last_contacted', 'next_follow_up',
] as const;

export function createPerson(userId: string, fields: Row): Row {
  return withCareerDb((db) => {
    const id = newId();
    const values: Row = {
      name: fields.name || 'Unnamed', role: null, company: null, email: null, phone: null,
      linkedin_url: null, relationship: 'recruiter', stage: 'lead', job_id: null, notes: '',
      last_contacted: null, next_follow_up: null, ...fields,
    };
    db.run(
      `INSERT INTO career_people (id, user_id, name, role, company, email, phone, linkedin_url,
         relationship, stage, job_id, notes, tags, last_contacted, next_follow_up)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, String(userId), values.name, values.role, values.company, values.email, values.phone,
      values.linkedin_url, values.relationship, values.stage, values.job_id, values.notes,
      json(values.tags ?? []), values.last_contacted, values.next_follow_up,
    );
    return getPerson(userId, id)!;
  });
}

export function updatePerson(userId: string, personId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of PERSON_FIELDS) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if ('tags' in fields) { sets.push('tags = ?'); args.push(json(fields.tags ?? [])); }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE career_people SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND is_deleted = 0`, ...args, personId, String(userId));
    }
    return getPerson(userId, personId);
  });
}

export function deletePerson(userId: string, personId: string): boolean {
  return withCareerDb((db) => db.run('UPDATE career_people SET is_deleted = 1 WHERE id = ? AND user_id = ?', personId, String(userId)).changes > 0);
}

const JOB_TRACKER_FIELDS = ['status', 'priority', 'applied_at', 'deadline', 'notes', 'rating', 'title', 'company', 'url', 'location', 'salary'] as const;

export function createTrackedJob(userId: string, fields: Row): Row {
  return withCareerDb((db) => {
    const id = newId();
    db.run(
      `INSERT INTO job_descriptions (id, user_id, title, company, url, raw_text, status, priority,
         applied_at, deadline, notes, rating, location, salary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, String(userId), fields.title ?? null, fields.company ?? null, fields.url ?? null,
      fields.raw_text || fields.title || '', fields.status || 'saved', fields.priority || 'medium',
      fields.applied_at ?? null, fields.deadline ?? null, fields.notes || '', fields.rating || 0,
      fields.location ?? null, fields.salary ?? null,
    );
    const r = db.get(`SELECT ${JOB_COLS} FROM job_descriptions WHERE id = ?`, id)!;
    return jobToDict(r);
  });
}

export function updateJobTracker(userId: string, jobId: string, fields: Row): Row | undefined {
  return withCareerDb((db) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    for (const key of JOB_TRACKER_FIELDS) {
      if (key in fields) { sets.push(`${key} = ?`); args.push(fields[key]); }
    }
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.run(`UPDATE job_descriptions SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, ...args, jobId, String(userId));
    }
    const r = db.get(`SELECT ${JOB_COLS} FROM job_descriptions WHERE id = ? AND user_id = ?`, jobId, String(userId));
    return r ? jobToDict(r) : undefined;
  });
}

export function trackerSummary(userId: string): Row {
  return withCareerDb((db) => {
    const jobs = db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM job_descriptions WHERE user_id = ? GROUP BY status', String(userId));
    const people = db.all<{ stage: string; n: number }>('SELECT stage, COUNT(*) AS n FROM career_people WHERE user_id = ? AND is_deleted = 0 GROUP BY stage', String(userId));
    const upcoming = db.all(`SELECT id, title, company, deadline FROM job_descriptions
      WHERE user_id = ? AND deadline IS NOT NULL AND deadline >= date('now')
      ORDER BY deadline LIMIT 10`, String(userId));
    const followUps = db.all(`SELECT id, name, company, next_follow_up FROM career_people
      WHERE user_id = ? AND is_deleted = 0 AND next_follow_up IS NOT NULL
      ORDER BY next_follow_up LIMIT 10`, String(userId));
    return {
      jobs: Object.fromEntries(jobs.map((r) => [r.status, r.n])),
      people: Object.fromEntries(people.map((r) => [r.stage, r.n])),
      upcoming_deadlines: upcoming,
      follow_ups: followUps,
    };
  });
}
