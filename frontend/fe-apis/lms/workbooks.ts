/**
 * fe-apis/lms/workbooks.ts
 *
 * AI Interactive Workbooks: the third kind of content in a class, beside Subjects and Projects. Twin of
 * backend/modules/ai_lms/workbooks.py: the same tables, limits, access rules, validation texts and status codes, so
 * change both (backend/tests/lms_workbooks_test.py runs one scenario through both and diffs the answers).
 *
 * The template (`lms_workbooks.content_json`) is shared; every learner's answers and progress live in their own
 * `lms_workbook_progress` row and are never returned to anyone else, instructors and admins included.
 *
 * Who sees what (checked here, never only in the browser):
 * - `private` workbook: its owner only. Any signed-in user may create one.
 * - `class` workbook (public): everyone who opens the class once it is `published`; instructors also see its drafts
 *   and archived copies, and may edit it. Only an instructor may make a workbook public.
 * - A workbook someone may not see is a 404, never a 403, so its existence does not leak.
 *
 * Deliberately free of `@/` imports (only node:crypto and ./workbookGen), so the twin check can run it in plain
 * Node against a database copy. index.ts wraps these functions in handlers.
 */

import crypto from 'node:crypto';
import * as gen from './workbookGen';

export const VISIBILITIES = ['private', 'class'] as const;
export const STATUSES = ['draft', 'published', 'archived'] as const;

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const INSTRUCTIONS_MAX = 4000;
export const SOURCE_NAME_MAX = 200;
/** About a 400-page book. Only slices of it are ever sent to the AI (one chapter's chunks per call). */
export const SOURCE_MAX = 1_000_000;
export const ICON_MAX = 40;
export const DEFAULT_ICON = 'BookOpenIcon';

// eslint-disable-next-line no-control-regex -- stripping control characters is the point (same set as workbooks.py)
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const ICON_OK = /^[A-Za-z0-9]+$/;

const SUMMARY_COLUMNS =
  'id, class_id, owner_id, title, description, icon, source_name, visibility, status, template_version, ' +
  'content_json, created_at, updated_at';

/** The slice of a database connection this module needs (fe-apis' TodoDb, or the twin check's adapter). */
export interface WorkbookDb {
  all<T = Row>(sql: string, ...params: unknown[]): T[];
  get<T = Row>(sql: string, ...params: unknown[]): T | undefined;
  run(sql: string, ...params: unknown[]): unknown;
  exec(sql: string): void;
}

type Row = Record<string, any>;

/** A request the caller can fix. `status` and `detail` go straight into the HTTP response. */
export class WorkbookError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

// ── Schema ────────────────────────────────────────────────────────────────────

export const WORKBOOKS_DDL = `
  CREATE TABLE IF NOT EXISTS lms_workbooks (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      owner_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'BookOpenIcon',
      source_name TEXT NOT NULL DEFAULT '',
      source_text TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'class')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      template_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lms_workbooks_class ON lms_workbooks(class_id, visibility, status);
  CREATE INDEX IF NOT EXISTS idx_lms_workbooks_owner ON lms_workbooks(owner_id);
  CREATE TABLE IF NOT EXISTS lms_workbook_progress (
      workbook_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      state_json TEXT NOT NULL DEFAULT '{}',
      summary_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      started_at TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workbook_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_lms_workbook_progress_user ON lms_workbook_progress(user_id);
`;

/** The slice of a node:sqlite connection the purge needs (db.ts's deleteClass passes its raw connection). */
interface RawDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): unknown };
}

/** A deleted class takes its workbooks and everyone's progress in them with it (no FOREIGN KEY on these). */
export function purgeClassWorkbooks(db: RawDb, classId: string): void {
  db.exec(WORKBOOKS_DDL);
  db.prepare(
    'DELETE FROM lms_workbook_progress WHERE workbook_id IN (SELECT id FROM lms_workbooks WHERE class_id = ?)'
  ).run(classId);
  db.prepare('DELETE FROM lms_workbooks WHERE class_id = ?').run(classId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const nowIso = (): string => new Date().toISOString();

/** Length in code points, like Python's len(): an emoji is one character, not two UTF-16 units. */
const cpLength = (value: string): number => Array.from(value).length;

function resolveClass(
  db: WorkbookDb,
  idOrSlug: string
): { id: string; slug: string; name: string } {
  const row = db.get<Row>(
    'SELECT id, slug, name FROM lms_classes WHERE id = ? OR slug = ?',
    idOrSlug,
    idOrSlug
  );
  if (!row) throw new WorkbookError(404, 'Class not found.');
  return { id: row.id, slug: row.slug, name: row.name };
}

/** One line: line breaks and tabs become spaces, other control characters go, the ends are trimmed. */
export function cleanLine(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(CONTROL, '')
    .trim();
}

/** Line breaks stay (as \n) and so do tabs; other control characters go; the ends are trimmed. */
export function cleanText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim();
}

const has = (payload: Row, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(payload, key) &&
  payload[key] !== null &&
  payload[key] !== undefined;

/** The cleaned value of an optional text field, or null when the payload does not carry it. */
function textField(
  payload: Row,
  key: string,
  label: string,
  limit: number,
  multiline: boolean
): string | null {
  if (!has(payload, key)) return null;
  const raw = payload[key];
  if (typeof raw !== 'string') throw new WorkbookError(422, `${label} must be text.`);
  const value = multiline ? cleanText(raw) : cleanLine(raw);
  if (cpLength(value) > limit) {
    throw new WorkbookError(
      422,
      `${label} can be at most ${limit.toLocaleString('en-US')} characters.`
    );
  }
  return value;
}

function iconField(payload: Row): string | null {
  if (!has(payload, 'icon')) return null;
  const raw = payload.icon;
  if (typeof raw !== 'string' || cpLength(raw) > ICON_MAX || (raw && !ICON_OK.test(raw))) {
    throw new WorkbookError(422, 'Icon must be an icon name.');
  }
  return raw || DEFAULT_ICON;
}

function choice<T extends string>(
  payload: Row,
  key: string,
  allowed: readonly T[],
  message: string
): T | null {
  if (!has(payload, key)) return null;
  if (!(allowed as readonly unknown[]).includes(payload[key]))
    throw new WorkbookError(422, message);
  return payload[key] as T;
}

const isPlainObject = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored template, or null while nothing is generated yet (or the stored text is unreadable). */
function parseContent(raw: unknown): Row | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const value = JSON.parse(raw);
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

function sectionCount(content: Row | null): number {
  const sections = content?.sections;
  return Array.isArray(sections) ? sections.length : 0;
}

function sectionsOf(content: Row | null): Row[] {
  const sections = content?.sections;
  return Array.isArray(sections) ? sections.filter(isPlainObject) : [];
}

/** True when the workbook has chapters and every one of them is written (what publishing needs). */
function allWritten(content: Row | null): boolean {
  const sections = sectionsOf(content);
  return sections.length > 0 && sections.every((item) => item.status === 'ready');
}

function canView(row: Row, userId: number, isEditor: boolean): boolean {
  if (row.owner_id === userId) return true;
  if (row.visibility !== 'class') return false;
  return row.status === 'published' || isEditor;
}

function canEdit(row: Row, userId: number, isEditor: boolean): boolean {
  return row.owner_id === userId || (isEditor && row.visibility === 'class');
}

function load(db: WorkbookDb, workbookId: string, userId: number, isEditor: boolean): Row {
  const row = db.get<Row>('SELECT * FROM lms_workbooks WHERE id = ?', workbookId);
  if (!row || !canView(row, userId, isEditor)) throw new WorkbookError(404, 'Workbook not found.');
  return row;
}

export interface WorkbookSummary {
  id: string;
  class_id: string;
  title: string;
  description: string;
  icon: string;
  source_name: string;
  visibility: 'private' | 'class';
  status: 'draft' | 'published' | 'archived';
  template_version: number;
  section_count: number;
  estimated_minutes: number | null;
  is_owner: boolean;
  can_edit: boolean;
  my_progress: { percent: number; last_accessed_at: string } | null;
  created_at: string;
  updated_at: string;
}

function summary(db: WorkbookDb, row: Row, userId: number, isEditor: boolean): WorkbookSummary {
  const content = parseContent(row.content_json);
  const minutes = content?.estimated_minutes;
  const mine = db.get<Row>(
    'SELECT summary_json, last_accessed_at FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?',
    row.id,
    userId
  );
  let progress: WorkbookSummary['my_progress'] = null;
  if (mine) {
    let stored: unknown = {};
    try {
      stored = JSON.parse(mine.summary_json || '{}');
    } catch {
      stored = {};
    }
    const percent = isPlainObject(stored) ? stored.percent : null;
    progress = {
      percent: whole(percent) && percent >= 0 && percent <= 100 ? percent : 0,
      last_accessed_at: mine.last_accessed_at,
    };
  }
  return {
    id: row.id,
    class_id: row.class_id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    source_name: row.source_name,
    visibility: row.visibility,
    status: row.status,
    template_version: Number(row.template_version),
    section_count: sectionCount(content),
    estimated_minutes: whole(minutes) && minutes > 0 ? minutes : null,
    is_owner: row.owner_id === userId,
    can_edit: canEdit(row, userId, isEditor),
    my_progress: progress,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface WorkbookDetail extends WorkbookSummary {
  class_slug: string;
  class_name: string;
  content: Row | null;
  /** Only for someone who may edit the workbook: the book's own text is working material, not a learner's page. */
  source_text?: string;
  instructions?: string;
}

function full(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean
): WorkbookDetail {
  const row = load(db, workbookId, userId, isEditor);
  const view: WorkbookDetail = {
    ...summary(db, row, userId, isEditor),
    class_slug: '',
    class_name: '',
    content: null,
  };
  const cls = db.get<Row>('SELECT slug, name FROM lms_classes WHERE id = ?', row.class_id);
  view.class_slug = cls ? cls.slug : '';
  view.class_name = cls ? cls.name : '';
  view.content = parseContent(row.content_json);
  if (view.can_edit) {
    view.source_text = row.source_text;
    view.instructions = row.instructions;
  }
  return view;
}

// ── Endpoints' logic ──────────────────────────────────────────────────────────

/** The workbooks of a class this user may see: their own (any state) first, then the class's, newest first. */
export function listWorkbooks(
  db: WorkbookDb,
  classIdOrSlug: string,
  userId: number,
  isEditor: boolean
): WorkbookSummary[] {
  db.exec(WORKBOOKS_DDL);
  const cls = resolveClass(db, classIdOrSlug);
  const rows = db.all<Row>(
    `SELECT ${SUMMARY_COLUMNS} FROM lms_workbooks WHERE class_id = ? ` +
      "AND (owner_id = ? OR (visibility = 'class' AND (status = 'published' OR ? = 1))) " +
      'ORDER BY CASE WHEN owner_id = ? THEN 0 ELSE 1 END, updated_at DESC, id',
    cls.id,
    userId,
    isEditor ? 1 : 0,
    userId
  );
  return rows.map((row) => summary(db, row, userId, isEditor));
}

export function createWorkbook(
  db: WorkbookDb,
  classIdOrSlug: string,
  userId: number,
  isEditor: boolean,
  payload: unknown
): WorkbookDetail {
  if (!isPlainObject(payload)) throw new WorkbookError(422, 'Send the workbook as a JSON object.');
  const title = textField(payload, 'title', 'Title', TITLE_MAX, false);
  if (!title) throw new WorkbookError(422, 'Give the workbook a title.');
  const description = textField(payload, 'description', 'Description', DESCRIPTION_MAX, true) || '';
  const instructions =
    textField(payload, 'instructions', 'Instructions', INSTRUCTIONS_MAX, true) || '';
  const sourceName = textField(payload, 'source_name', 'Source name', SOURCE_NAME_MAX, false) || '';
  const sourceText = textField(payload, 'source_text', 'Source text', SOURCE_MAX, true) || '';
  if (!sourceText)
    throw new WorkbookError(422, 'Add the learning material: upload a file or paste the text.');
  const icon = iconField(payload) || DEFAULT_ICON;
  const visibility =
    choice(payload, 'visibility', VISIBILITIES, "Visibility must be 'private' or 'class'.") ||
    'private';
  if (visibility === 'class' && !isEditor) {
    throw new WorkbookError(
      403,
      'Only an instructor or admin can share a workbook with the class.'
    );
  }

  db.exec(WORKBOOKS_DDL);
  const cls = resolveClass(db, classIdOrSlug);
  const workbookId = `wb-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const stamp = nowIso();
  db.run(
    'INSERT INTO lms_workbooks (id, class_id, owner_id, title, description, icon, source_name, source_text, ' +
      'instructions, content_json, visibility, status, template_version, created_at, updated_at) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'draft', 1, ?, ?)",
    workbookId,
    cls.id,
    userId,
    title,
    description,
    icon,
    sourceName,
    sourceText,
    instructions,
    visibility,
    stamp,
    stamp
  );
  return full(db, workbookId, userId, isEditor);
}

export function getWorkbook(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean
): WorkbookDetail {
  db.exec(WORKBOOKS_DDL);
  return full(db, workbookId, userId, isEditor);
}

/** Change the details, the source, the visibility or the status. Fields left out stay as they are. */
export function updateWorkbook(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean,
  payload: unknown
): WorkbookDetail {
  if (!isPlainObject(payload)) throw new WorkbookError(422, 'Send the changes as a JSON object.');
  const changes: Array<[string, unknown]> = [];
  const title = textField(payload, 'title', 'Title', TITLE_MAX, false);
  if (title !== null) {
    if (!title) throw new WorkbookError(422, 'Give the workbook a title.');
    changes.push(['title', title]);
  }
  for (const [key, label, limit, multiline] of [
    ['description', 'Description', DESCRIPTION_MAX, true],
    ['instructions', 'Instructions', INSTRUCTIONS_MAX, true],
    ['source_name', 'Source name', SOURCE_NAME_MAX, false],
  ] as const) {
    const value = textField(payload, key, label, limit, multiline);
    if (value !== null) changes.push([key, value]);
  }
  const sourceText = textField(payload, 'source_text', 'Source text', SOURCE_MAX, true);
  if (sourceText !== null) {
    if (!sourceText)
      throw new WorkbookError(422, 'Add the learning material: upload a file or paste the text.');
    changes.push(['source_text', sourceText]);
  }
  const icon = iconField(payload);
  if (icon !== null) changes.push(['icon', icon]);
  const visibility = choice(
    payload,
    'visibility',
    VISIBILITIES,
    "Visibility must be 'private' or 'class'."
  );
  const status = choice(
    payload,
    'status',
    STATUSES,
    "Status must be 'draft', 'published' or 'archived'."
  );

  db.exec(WORKBOOKS_DDL);
  const row = load(db, workbookId, userId, isEditor);
  if (!canEdit(row, userId, isEditor))
    throw new WorkbookError(403, "You can't change this workbook.");
  if (visibility !== null && visibility !== row.visibility) {
    if (visibility === 'class' && !isEditor) {
      throw new WorkbookError(
        403,
        'Only an instructor or admin can share a workbook with the class.'
      );
    }
    changes.push(['visibility', visibility]);
  }
  if (status !== null && status !== row.status) {
    // Publishing or archiving a shared workbook changes what the whole class sees.
    if ((visibility || row.visibility) === 'class' && !isEditor) {
      throw new WorkbookError(
        403,
        'Only an instructor or admin can share a workbook with the class.'
      );
    }
    if (status === 'published' && !allWritten(parseContent(row.content_json))) {
      throw new WorkbookError(409, 'Write every chapter before publishing.');
    }
    changes.push(['status', status]);
  }
  if (changes.length) {
    changes.push(['updated_at', nowIso()]);
    const assignments = changes.map(([key]) => `${key} = ?`).join(', ');
    db.run(
      `UPDATE lms_workbooks SET ${assignments} WHERE id = ?`,
      ...changes.map(([, value]) => value),
      row.id
    );
  }
  return full(db, row.id, userId, isEditor);
}

/** Delete a workbook and every learner's progress in it. */
export function deleteWorkbook(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean
): { deleted: true; id: string } {
  db.exec(WORKBOOKS_DDL);
  const row = load(db, workbookId, userId, isEditor);
  if (!canEdit(row, userId, isEditor))
    throw new WorkbookError(403, "You can't change this workbook.");
  db.run('DELETE FROM lms_workbook_progress WHERE workbook_id = ?', row.id);
  db.run('DELETE FROM lms_workbooks WHERE id = ?', row.id);
  return { deleted: true, id: row.id };
}

// ── Generation (the AI call itself is the handler's; these prepare it and store its cleaned answer) ──────────────
//
// Both steps are split around the AI call so nothing is held while the model writes: `*Job` checks the caller and
// returns the prompt, the handler runs it, `save*` checks again and stores the normalized answer. Only someone who may
// edit the workbook may generate it. A published workbook is what learners are working through, so it is never
// re-planned or rewritten in place: move it back to draft first.

const PUBLISHED_OUTLINE = 'Move the workbook back to draft before planning its chapters again.';
const PUBLISHED_SECTION = 'Move the workbook back to draft before rewriting a chapter.';

function editable(db: WorkbookDb, workbookId: string, userId: number, isEditor: boolean): Row {
  const row = load(db, workbookId, userId, isEditor);
  if (!canEdit(row, userId, isEditor))
    throw new WorkbookError(403, "You can't change this workbook.");
  return row;
}

function partsOf(row: Row): string[] {
  const parts = gen.splitSource(row.source_text || '');
  if (!parts.length) {
    throw new WorkbookError(422, 'Add the learning material: upload a file or paste the text.');
  }
  return parts;
}

function asWorkbookError(err: unknown): unknown {
  return err instanceof gen.GenerationError ? new WorkbookError(err.status, err.detail) : err;
}

export interface GenerationJob {
  prompt: string;
  max_tokens: number;
  template_version?: number;
}

/** The prompt that plans the chapters (step 1 of generating a workbook). */
export function outlineJob(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean
): GenerationJob {
  db.exec(WORKBOOKS_DDL);
  const row = editable(db, workbookId, userId, isEditor);
  if (row.status === 'published') throw new WorkbookError(409, PUBLISHED_OUTLINE);
  const parts = partsOf(row);
  const prompt = gen.buildOutlinePrompt(row.title, row.description, row.instructions, parts);
  return { prompt, max_tokens: gen.MAX_TOKENS.outline };
}

/** Store a new outline: every chapter pending, the template version moved on (so a chapter still being written for
 *  the previous outline is refused when it comes back). */
export function saveOutline(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean,
  parsed: unknown
): WorkbookDetail {
  db.exec(WORKBOOKS_DDL);
  const row = editable(db, workbookId, userId, isEditor);
  if (row.status === 'published') throw new WorkbookError(409, PUBLISHED_OUTLINE);
  let content: Row;
  try {
    content = gen.normalizeOutline(parsed, partsOf(row).length);
  } catch (err) {
    throw asWorkbookError(err);
  }
  db.run(
    'UPDATE lms_workbooks SET content_json = ?, template_version = template_version + 1, updated_at = ? ' +
      'WHERE id = ?',
    JSON.stringify(content),
    nowIso(),
    row.id
  );
  return full(db, row.id, userId, isEditor);
}

function findSection(content: Row | null, sectionId: string): number {
  const index = sectionsOf(content).findIndex((item) => item.id === sectionId);
  if (index < 0) throw new WorkbookError(404, 'Chapter not found.');
  return index;
}

/** The prompt that writes one chapter (step 2, once per chapter), and the template version it belongs to. */
export function sectionJob(
  db: WorkbookDb,
  workbookId: string,
  sectionId: string,
  userId: number,
  isEditor: boolean
): GenerationJob {
  db.exec(WORKBOOKS_DDL);
  const row = editable(db, workbookId, userId, isEditor);
  const content = parseContent(row.content_json);
  const index = findSection(content, sectionId);
  const sections = sectionsOf(content);
  if (row.status === 'published') throw new WorkbookError(409, PUBLISHED_SECTION);
  const parts = partsOf(row);
  const section = sections[index];
  const start = section.from;
  const end = section.to;
  if (!(whole(start) && whole(end) && start >= 1 && start <= end && end <= parts.length)) {
    throw new WorkbookError(
      409,
      'The learning material changed since the chapters were planned. Plan them again.'
    );
  }
  const { material, wasCut } = gen.sectionMaterial(parts, start, end);
  const prompt = gen.buildSectionPrompt(
    row.title,
    row.description,
    row.instructions,
    sections,
    index,
    material,
    wasCut
  );
  return {
    prompt,
    max_tokens: gen.MAX_TOKENS.section,
    template_version: Number(row.template_version),
  };
}

/** Store one written chapter, unless the chapters were planned again while it was being written. */
export function saveSection(
  db: WorkbookDb,
  workbookId: string,
  sectionId: string,
  userId: number,
  isEditor: boolean,
  templateVersion: number,
  parsed: unknown
): WorkbookDetail {
  let blocks: Row[];
  try {
    blocks = gen.normalizeSection(parsed, sectionId);
  } catch (err) {
    throw asWorkbookError(err);
  }
  db.exec(WORKBOOKS_DDL);
  const row = editable(db, workbookId, userId, isEditor);
  if (Number(row.template_version) !== templateVersion) {
    throw new WorkbookError(
      409,
      'The chapters were planned again while this one was being written. Write it again.'
    );
  }
  if (row.status === 'published') throw new WorkbookError(409, PUBLISHED_SECTION);
  const content = parseContent(row.content_json) || {};
  const index = findSection(content, sectionId);
  const sections = content.sections as unknown[];
  const position = sections.map((item, i) => (isPlainObject(item) ? i : -1)).filter((i) => i >= 0)[
    index
  ];
  sections[position] = { ...(sections[position] as Row), status: 'ready', blocks };
  db.run(
    'UPDATE lms_workbooks SET content_json = ?, updated_at = ? WHERE id = ?',
    JSON.stringify(content),
    nowIso(),
    row.id
  );
  return full(db, row.id, userId, isEditor);
}

// ── Learner progress (each learner's own private workspace) ───────────────────────────────────────────────────────
//
// One JSON document per (workbook, learner) that the browser owns: answers, ticks, quiz attempts, the last chapter
// opened and a `done` map of block ids. It is only ever read or written with `user_id = <the caller>`; the one
// exception is the instructors' learner list, which gets names, percentages and dates computed here and never the
// document. A save must quote the version it loaded, so a second tab or device holding an older copy is refused (409)
// instead of overwriting newer answers. The percentage is counted here from `done` and the workbook's current blocks.

export const STATE_MAX = 400_000;
const LEARNER_ID = /^[1-9][0-9]{0,11}$/;
const STALE =
  'Your answers were changed in another tab or on another device. Reload to get the latest.';
const NOT_INSTRUCTOR = 'Only an instructor or admin can see who is working through this workbook.';
const NO_LEARNER = 'This learner has no progress in this workbook.';

function blockIds(content: Row | null): string[] {
  const ids: string[] = [];
  for (const section of sectionsOf(content)) {
    if (section.status !== 'ready' || !Array.isArray(section.blocks)) continue;
    for (const block of section.blocks) {
      if (isPlainObject(block) && typeof block.id === 'string') ids.push(block.id);
    }
  }
  return ids;
}

export interface ProgressSummary {
  percent: number;
  done: number;
  total: number;
}

function progressSummary(content: Row | null, state: unknown): ProgressSummary {
  const ids = blockIds(content);
  const doneMap = isPlainObject(state) ? state.done : null;
  const done = ids.filter((id) => isPlainObject(doneMap) && doneMap[id] === true).length;
  const total = ids.length;
  return { percent: total ? Math.floor((100 * done) / total) : 0, done, total };
}

function stateOf(raw: unknown): Row {
  try {
    const value = JSON.parse(typeof raw === 'string' && raw ? raw : '{}');
    return isPlainObject(value) ? value : {};
  } catch {
    return {};
  }
}

export interface ProgressView {
  workbook_id: string;
  state: Row;
  version: number;
  template_version: number;
  summary: ProgressSummary;
  started_at: string | null;
  last_accessed_at: string | null;
}

function progressView(row: Row, mine: Row | undefined): ProgressView {
  const content = parseContent(row.content_json);
  const state = mine ? stateOf(mine.state_json) : {};
  return {
    workbook_id: row.id,
    state,
    version: mine ? Number(mine.version) : 0,
    template_version: Number(row.template_version),
    summary: progressSummary(content, state),
    started_at: mine ? mine.started_at : null,
    last_accessed_at: mine ? mine.last_accessed_at : null,
  };
}

function mineOf(db: WorkbookDb, workbookId: string, userId: number): Row | undefined {
  return db.get<Row>(
    'SELECT * FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?',
    workbookId,
    userId
  );
}

/** The caller's own answers and progress (an empty document and version 0 before they start). */
export function getProgress(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean
): ProgressView {
  db.exec(WORKBOOKS_DDL);
  const row = load(db, workbookId, userId, isEditor);
  return progressView(row, mineOf(db, row.id, userId));
}

/** Replace the caller's document, if `version` is the one stored (0 = nothing saved yet). */
export function saveProgress(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean,
  payload: unknown
): ProgressView {
  if (!isPlainObject(payload)) throw new WorkbookError(422, 'Send your answers as a JSON object.');
  const version = whole(payload.version) ? payload.version : null;
  if (version === null || version < 0) throw new WorkbookError(422, 'Send the version you loaded.');
  const state = payload.state;
  if (!isPlainObject(state)) throw new WorkbookError(422, 'Send your answers as a JSON object.');
  const text = JSON.stringify(state);
  if (cpLength(text) > STATE_MAX)
    throw new WorkbookError(413, 'Your answers are too large to save.');

  db.exec(WORKBOOKS_DDL);
  const row = load(db, workbookId, userId, isEditor);
  const content = parseContent(row.content_json);
  if (!blockIds(content).length) {
    throw new WorkbookError(409, 'This workbook has no written chapters yet.');
  }
  const mine = mineOf(db, row.id, userId);
  if ((mine ? Number(mine.version) : 0) !== version) throw new WorkbookError(409, STALE);
  const stamp = nowIso();
  const summary = JSON.stringify(progressSummary(content, state));
  if (!mine) {
    db.run(
      'INSERT INTO lms_workbook_progress (workbook_id, user_id, state_json, summary_json, version, ' +
        'started_at, last_accessed_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
      row.id,
      userId,
      text,
      summary,
      stamp,
      stamp,
      stamp
    );
  } else {
    db.run(
      'UPDATE lms_workbook_progress SET state_json = ?, summary_json = ?, version = version + 1, ' +
        'last_accessed_at = ?, updated_at = ? WHERE workbook_id = ? AND user_id = ?',
      text,
      summary,
      stamp,
      stamp,
      row.id,
      userId
    );
  }
  return progressView(row, mineOf(db, row.id, userId));
}

/** Delete the caller's own answers and progress in this workbook (nobody else's). */
export function resetProgress(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean
): ProgressView {
  db.exec(WORKBOOKS_DDL);
  const row = load(db, workbookId, userId, isEditor);
  db.run('DELETE FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?', row.id, userId);
  return progressView(row, undefined);
}

function instructorRow(db: WorkbookDb, workbookId: string, userId: number, isEditor: boolean): Row {
  const row = load(db, workbookId, userId, isEditor);
  if (!(isEditor && row.visibility === 'class')) throw new WorkbookError(403, NOT_INSTRUCTOR);
  return row;
}

export interface LearnerRow extends ProgressSummary {
  user_id: number;
  name: string;
  started_at: string;
  last_accessed_at: string;
}

/** Who has started a class workbook: name, percentage and dates only. Never anyone's answers. */
export function listLearners(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean
): LearnerRow[] {
  db.exec(WORKBOOKS_DDL);
  const row = instructorRow(db, workbookId, userId, isEditor);
  const content = parseContent(row.content_json);
  const rows = db.all<Row>(
    'SELECT p.user_id, p.state_json, p.started_at, p.last_accessed_at, u.display_name, u.email ' +
      'FROM lms_workbook_progress p LEFT JOIN users u ON u.id = p.user_id ' +
      'WHERE p.workbook_id = ? ORDER BY p.last_accessed_at DESC, p.user_id',
    row.id
  );
  return rows.map((item) => ({
    user_id: Number(item.user_id),
    name:
      cleanLine(item.display_name || '') ||
      cleanLine(item.email || '') ||
      `Learner ${item.user_id}`,
    ...progressSummary(content, stateOf(item.state_json)),
    started_at: item.started_at,
    last_accessed_at: item.last_accessed_at,
  }));
}

/** An instructor resets one learner's progress in a class workbook. Every other learner's stays as it is. */
export function resetLearner(
  db: WorkbookDb,
  workbookId: string,
  learnerId: string,
  userId: number,
  isEditor: boolean
): { reset: true; user_id: number } {
  db.exec(WORKBOOKS_DDL);
  const row = instructorRow(db, workbookId, userId, isEditor);
  if (!LEARNER_ID.test(learnerId || '')) throw new WorkbookError(404, NO_LEARNER);
  const before = db.get<Row>(
    'SELECT 1 AS found FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?',
    row.id,
    Number(learnerId)
  );
  if (!before) throw new WorkbookError(404, NO_LEARNER);
  db.run(
    'DELETE FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?',
    row.id,
    Number(learnerId)
  );
  return { reset: true, user_id: Number(learnerId) };
}

// ── "Explain this to me" (nothing is saved) ──────────────────────────────────────────────────────────────────────

/** The prompt that explains one block of a written chapter again, for anyone who can see the workbook. */
export function explainJob(
  db: WorkbookDb,
  workbookId: string,
  userId: number,
  isEditor: boolean,
  payload: unknown
): GenerationJob {
  if (!isPlainObject(payload)) throw new WorkbookError(422, 'Send the request as a JSON object.');
  const blockId = payload.block_id;
  const raw = payload.question;
  if (raw !== null && raw !== undefined && typeof raw !== 'string') {
    throw new WorkbookError(422, 'Question must be text.');
  }
  const question = cleanLine(typeof raw === 'string' ? raw : '');
  if (cpLength(question) > gen.EXPLAIN_QUESTION_MAX) {
    throw new WorkbookError(
      422,
      `Question can be at most ${gen.EXPLAIN_QUESTION_MAX.toLocaleString('en-US')} characters.`
    );
  }
  db.exec(WORKBOOKS_DDL);
  const row = load(db, workbookId, userId, isEditor);
  for (const section of sectionsOf(parseContent(row.content_json))) {
    if (section.status !== 'ready' || !Array.isArray(section.blocks)) continue;
    for (const block of section.blocks) {
      if (isPlainObject(block) && typeof blockId === 'string' && block.id === blockId) {
        const prompt = gen.buildExplainPrompt(row.title, section.title || '', block, question);
        return { prompt, max_tokens: gen.MAX_TOKENS.explain };
      }
    }
  }
  throw new WorkbookError(404, 'That part of the workbook was not found.');
}
