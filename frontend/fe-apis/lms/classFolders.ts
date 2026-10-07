/**
 * fe-apis/lms/classFolders.ts
 *
 * nextjs-api twin of backend/modules/ai_lms/class_folders.py: two-way sync between the
 * AI-LMS tables and per-class folders of editable HTML under
 * frontend/src/modules/ai-lms/classes/. The Python module documents the layout and the
 * three-way rule. Both twins must write the same files byte for byte (layout, names,
 * class.json, landing blocks), so change them together.
 *
 * Writes: reconcileAll() runs after every mutating /api/lms handler (withClassFolderSync
 * in index.ts) and once per server process (ensureStartupReconcile). Reads:
 * getLessonById(), getLanding() and the class detail handler pull in IDE edits first.
 * Reconciles take a BEGIN IMMEDIATE lock, so this and the FastAPI twin never sync at the
 * same time. On Vercel the folder is a read-only build snapshot: edits there are still
 * read, but nothing is written. Templates are read from backend/modules/ai_lms/templates/.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSQLiteDatabase } from '../_shared/db';
import { ensureLmsTables } from './db';

type Row = Record<string, any>;
type Db = NonNullable<ReturnType<typeof getSQLiteDatabase>>['db'];
type Placement = [Row, string];
type Place = (lesson: Row, rel: string) => Row | null;

export const LANDING_FILE = 'landingpage.html';
const MANIFEST_FILE = 'class.json';
const BACKUPS_KEPT = 5;
const AUTO_BLOCK =
  /(<!--[ \t\r\n]*lms:auto:([a-z][a-z0-9-]*)[ \t\r\n]*-->)([\s\S]*?)(<!--[ \t\r\n]*\/lms:auto:\2[ \t\r\n]*-->)/g;
const SAFE_SEGMENT = /^[^/\\\0]+$/;
const MANIFEST_NOTE =
  'Generated from the AI-LMS tables on every change; edits here are overwritten. ' +
  'Edit landingpage.html and the lesson .html files instead.';
// Used only when templates/landingpage.html can't be read. Same text in the Python twin.
const FALLBACK_TEMPLATE =
  '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '  <title>{{CLASS_NAME}}</title>\n</head>\n<body>\n' +
  '  <h1><!-- lms:auto:name --><!-- /lms:auto:name --></h1>\n' +
  '  <p><!-- lms:auto:description --><!-- /lms:auto:description --></p>\n' +
  '  <p><a href="#contents" data-lms-route="class">Enter Class</a></p>\n' +
  '  <main id="contents">\n' +
  '    <!-- lms:auto:subjects --><!-- /lms:auto:subjects -->\n' +
  '    <!-- lms:auto:projects --><!-- /lms:auto:projects -->\n' +
  '    <!-- lms:auto:lessons --><!-- /lms:auto:lessons -->\n' +
  '  </main>\n</body>\n</html>\n';
const CLASS_COLS = 'id, slug, name, description, landing_html, landing_hash, landing_data_hash';
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** A file exists but can't be used (not valid UTF-8, permissions): leave it alone. */
class Unreadable extends Error {}

// ─────────────────────────────────────────────────────────────────────────────
// Where the folder and the templates are
// ─────────────────────────────────────────────────────────────────────────────

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function firstDir(candidates: string[]): string | null {
  return candidates.find(isDir) ?? null;
}

function repoClasses(): string | null {
  const cwd = process.cwd();
  return firstDir([
    path.join(cwd, 'src', 'modules', 'ai-lms', 'classes'),
    path.join(cwd, 'frontend', 'src', 'modules', 'ai-lms', 'classes'),
  ]);
}

function templatesDir(): string | null {
  const cwd = process.cwd();
  return firstDir([
    path.join(cwd, '..', 'backend', 'modules', 'ai_lms', 'templates'),
    path.join(cwd, 'backend', 'modules', 'ai_lms', 'templates'),
  ]);
}

/**
 * The classes folder, or null when the file layer is off. LMS_CLASSES_DIR overrides it
 * (tests). When the DB is redirected elsewhere (LABNINJA_DB_DIR / LABNINJA_TEST_DB_PATH)
 * and no folder is named, there is none: a DB copy must never rewrite the repo's folder.
 */
export function classesRoot(): string | null {
  const override = process.env.LMS_CLASSES_DIR;
  if (override) return isDir(override) ? override : null;
  if (process.env.LABNINJA_DB_DIR || process.env.LABNINJA_TEST_DB_PATH) return null;
  return repoClasses();
}

export function fileSyncEnabled(): boolean {
  return classesRoot() !== null;
}

function writable(root: string | null): boolean {
  if (root === null || process.env.VERCEL) return false;
  try {
    fs.accessSync(root, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (each behaves exactly like its Python twin)
// ─────────────────────────────────────────────────────────────────────────────

/** sha256 hex of the UTF-8 bytes. Twin of content_hash() in backend/modules/ai_lms/db.py. */
export function contentHash(text: string | null | undefined): string {
  return crypto
    .createHash('sha256')
    .update(text || '', 'utf8')
    .digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function str(value: unknown): string {
  return value ? String(value) : '';
}

/** AI-extracted titles can carry escaped entities (&amp;); decode the basic five. */
function unent(text: unknown): string {
  return str(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function esc(text: unknown): string {
  return str(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** File/folder name for a plan module or step: ASCII-only so both twins agree. */
export function pathSlug(text: unknown, fallback: string): string {
  const slug = str(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || fallback;
}

function claim(name: string, taken: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${name}-${n}`;
    n += 1;
  }
  taken.add(candidate);
  return candidate;
}

function safeRel(rel: string): boolean {
  return rel.split('/').every((part) => SAFE_SEGMENT.test(part) && !part.startsWith('.'));
}

/** A file's text; null if it doesn't exist. Throws Unreadable for anything else. */
function readText(p: string): string | null {
  let data: Buffer;
  try {
    data = fs.readFileSync(p);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw new Unreadable(`${p}: ${code || err}`);
  }
  try {
    return UTF8.decode(data);
  } catch {
    throw new Unreadable(`${p}: not valid UTF-8`);
  }
}

/** For files this module owns (class.json, templates): unusable counts as missing. */
function readQuiet(p: string): string | null {
  try {
    return readText(p);
  } catch {
    return null;
  }
}

/** Atomic write (temp file + rename), so the IDE or the other twin never sees half a file. */
function writeText(p: string, text: string): boolean {
  const tmp = path.join(path.dirname(p), `.${path.basename(p)}.${process.pid}.tmp`);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, p);
    return true;
  } catch (err) {
    console.warn(`[ai_lms] could not write ${p}:`, err);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* nothing to clean up */
    }
    return false;
  }
}

function unlink(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    /* already gone */
  }
}

/** Remove empty directories under (and optionally including) `dir`. */
function prune(dir: string, keepRoot: boolean): void {
  if (!isDir(dir)) return;
  const subdirs: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const child = path.join(d, entry.name);
        subdirs.push(child);
        walk(child);
      }
    }
  };
  walk(dir);
  subdirs.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
  for (const d of keepRoot ? subdirs : [...subdirs, dir]) {
    try {
      fs.rmdirSync(d);
    } catch {
      /* not empty */
    }
  }
}

function backup(
  db: Db,
  entityType: string,
  entityId: string,
  rel: string,
  html: string,
  reason: string
): void {
  db.prepare(
    'INSERT INTO lms_html_backups (entity_type, entity_id, rel_path, html, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(entityType, entityId, rel, html, reason, nowIso());
  db.prepare(
    `
    DELETE FROM lms_html_backups
    WHERE entity_type = ? AND entity_id = ? AND id NOT IN (
      SELECT id FROM lms_html_backups WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT ?
    )
  `
  ).run(entityType, entityId, entityType, entityId, BACKUPS_KEPT);
}

function withDb<T>(fn: (db: Db) => T): T | null {
  const res = getSQLiteDatabase('lab_ninja');
  if (!res) return null;
  try {
    res.db.exec('PRAGMA busy_timeout = 10000');
    return fn(res.db);
  } finally {
    try {
      res.db.close();
    } catch {
      /* already closed */
    }
  }
}

/** Keep a copy of HTML the app is about to replace (see updateLesson in db.ts). */
export function recordBackup(
  entityType: string,
  entityId: string,
  rel: string,
  html: string,
  reason: string
): void {
  withDb((db) => backup(db, entityType, entityId, rel, html, reason));
}

/** Three-way decision between the DB copy and the file; returns the content to keep. */
function merge(
  db: Db,
  entityType: string,
  entityId: string,
  rel: string,
  dbHtml: string,
  base: string,
  fileText: string
): string {
  if (fileText === dbHtml) return dbHtml;
  if (contentHash(fileText) === base) return dbHtml; // the app changed it; the file is just stale
  const reason =
    contentHash(dbHtml) !== base ? 'conflict: file and DB both changed' : 'replaced by a file edit';
  backup(db, entityType, entityId, rel, dbHtml, reason);
  return fileText;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout: where each lesson lives, and class.json
// ─────────────────────────────────────────────────────────────────────────────

function loadClassRows(db: Db, classId: string, withHtml = true): [Row[], Row[]] {
  const subjects = db
    .prepare(
      'SELECT id, slug, name, description, kind, project_plan FROM lms_subjects ' +
        'WHERE class_id = ? ORDER BY order_index ASC, name ASC, id ASC'
    )
    .all(classId) as Row[];
  const htmlCols = withHtml ? ', generated_html, file_path, file_hash' : '';
  const lessons = db
    .prepare(
      `SELECT id, subject_id, slug, title${htmlCols} FROM lms_lessons ` +
        'WHERE class_id = ? ORDER BY order_index ASC, created_at ASC, id ASC'
    )
    .all(classId) as Row[];
  return [subjects, lessons];
}

function parsePlan(raw: unknown): unknown[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(String(raw));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function planNodes(
  items: unknown[],
  dirRel: string,
  byId: Map<string, Row>,
  used: Set<string>,
  place: Place,
  fallback: string
): Row[] {
  const nodes: Row[] = [];
  const taken = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const it = item as Row;
    const title = unent(it.title).trim();
    if (!title) continue; // parsePlanItem drops untitled items (and their steps) too
    const name = claim(pathSlug(title, fallback), taken);
    const lessonId = it.lesson_id;
    const lesson =
      typeof lessonId === 'string' && !used.has(lessonId) ? byId.get(lessonId) : undefined;
    const node: Row = { title, name, lesson: null };
    if (lesson !== undefined) {
      used.add(lesson.id);
      node.lesson = place(lesson, `${dirRel}/${name}.html`);
    }
    const subs = it.sublessons;
    node.steps = planNodes(
      Array.isArray(subs) ? subs : [],
      `${dirRel}/${name}`,
      byId,
      used,
      place,
      'step'
    );
    nodes.push(node);
  }
  return nodes;
}

/** class.json content (without "files") and every lesson's path, in a fixed order. */
function layout(cls: Row, subjects: Row[], lessons: Row[]): [Row, Placement[]] {
  const c = String(cls.slug);
  const placements: Placement[] = [];
  const claimed = new Set<string>();

  const place: Place = (lesson, rel) => {
    if (claimed.has(rel) || !safeRel(rel)) {
      console.warn(
        `[ai_lms] no file for lesson ${lesson.id}: path ${JSON.stringify(rel)} is taken or unsafe`
      );
      return null;
    }
    claimed.add(rel);
    placements.push([lesson, rel]);
    return {
      id: lesson.id,
      slug: lesson.slug,
      title: unent(lesson.title),
      file: rel.slice(c.length + 1),
    };
  };

  const bySubject = new Map<string, Row[]>();
  const direct: Row[] = [];
  const subjectIds = new Set(subjects.map((s) => s.id));
  for (const lesson of lessons) {
    const sid = str(lesson.subject_id);
    if (!sid) direct.push(lesson);
    else if (subjectIds.has(sid)) {
      if (!bySubject.has(sid)) bySubject.set(sid, []);
      bySubject.get(sid)!.push(lesson);
    }
  }

  const entries: Row[] = [];
  for (const s of subjects) {
    const base = `${c}/${s.slug}`;
    const own = bySubject.get(s.id) ?? [];
    const kind = s.kind === 'project' ? 'project' : 'subject';
    const entry: Row = {
      id: s.id,
      slug: s.slug,
      name: unent(s.name),
      kind,
      description: str(s.description),
    };
    let rest = own;
    if (kind === 'project') {
      const used = new Set<string>();
      const byId = new Map(own.map((lesson) => [lesson.id as string, lesson]));
      entry.modules = planNodes(
        parsePlan(s.project_plan),
        `${base}/modules`,
        byId,
        used,
        place,
        'module'
      );
      rest = own.filter((lesson) => !used.has(lesson.id));
    }
    entry.lessons = rest
      .map((lesson) => place(lesson, `${base}/lessons/${lesson.slug}.html`))
      .filter(Boolean);
    entries.push(entry);
  }

  const manifest: Row = {
    $comment: MANIFEST_NOTE,
    id: cls.id,
    slug: c,
    name: unent(cls.name),
    description: str(cls.description),
    landing: LANDING_FILE,
    subjects: entries,
    lessons: direct
      .map((lesson) => place(lesson, `${c}/lessons/${lesson.slug}.html`))
      .filter(Boolean),
  };
  return [manifest, placements];
}

function manifestText(manifest: Row): string {
  return JSON.stringify(manifest, null, 2) + '\n';
}

function manifestFiles(p: string): Record<string, string> {
  const text = readQuiet(p);
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    const files = data && typeof data === 'object' ? data.files : null;
    if (!files || typeof files !== 'object' || Array.isArray(files)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(files)) if (typeof v === 'string') out[k] = v;
    return out;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Landing page: template + lms:auto blocks
// ─────────────────────────────────────────────────────────────────────────────

function template(): string {
  const dir = templatesDir();
  return (dir ? readQuiet(path.join(dir, LANDING_FILE)) : null) || FALLBACK_TEMPLATE;
}

function lessonList(lessons: Row[], indent: string, empty: string): string[] {
  if (!lessons.length) return empty ? [`${indent}<p class="lms-muted">${empty}</p>`] : [];
  const out = [`${indent}<ol class="lms-list">`];
  for (const lesson of lessons) {
    out.push(`${indent}  <li><a href="${esc(lesson.file)}">${esc(lesson.title)}</a></li>`);
  }
  out.push(`${indent}</ol>`);
  return out;
}

function moduleList(nodes: Row[], indent: string): string[] {
  const out = [`${indent}<ol class="lms-list">`];
  for (const node of nodes) {
    const label = node.lesson
      ? `<a href="${esc(node.lesson.file)}">${esc(node.title)}</a>`
      : `<span class="lms-pending">${esc(node.title)}</span>`;
    if (node.steps.length) {
      out.push(`${indent}  <li>${label}`);
      out.push(...moduleList(node.steps, indent + '    '));
      out.push(`${indent}  </li>`);
    } else {
      out.push(`${indent}  <li>${label}</li>`);
    }
  }
  out.push(`${indent}</ol>`);
  return out;
}

function section(sectionId: string, heading: string, body: string[]): string {
  const lines = [
    `<section class="lms-section" id="${sectionId}">`,
    `  <h2>${heading}</h2>`,
    ...body,
    '</section>',
  ];
  return '\n' + lines.join('\n') + '\n';
}

function card(tag: string, item: Row): string[] {
  const out = [
    '    <article class="lms-card">',
    `      <span class="lms-tag">${tag}</span>`,
    `      <h3>${esc(item.name)}</h3>`,
  ];
  if (item.description) out.push(`      <p>${esc(item.description)}</p>`);
  return out;
}

function stat(n: number, one: string, many: string): string {
  return `<span class="lms-stat"><strong>${n}</strong> ${n === 1 ? one : many}</span>`;
}

function autoBlocks(manifest: Row, lessonCount: number): Record<string, string> {
  const subjects = (manifest.subjects as Row[]).filter((s) => s.kind === 'subject');
  const projects = (manifest.subjects as Row[]).filter((s) => s.kind === 'project');

  let subjectHtml = '';
  if (subjects.length) {
    const body = ['  <div class="lms-grid">'];
    for (const s of subjects) {
      body.push(
        ...card('Subject', s),
        ...lessonList(s.lessons, '      ', 'No lessons yet.'),
        '    </article>'
      );
    }
    subjectHtml = section('subjects', 'Subjects', [...body, '  </div>']);
  }

  let projectHtml = '';
  if (projects.length) {
    const body = ['  <div class="lms-grid">'];
    for (const p of projects) {
      body.push(...card('Project', p));
      if (p.modules.length) body.push(...moduleList(p.modules, '      '));
      else if (!p.lessons.length) body.push('      <p class="lms-muted">No roadmap yet.</p>');
      body.push(...lessonList(p.lessons, '      ', ''), '    </article>');
    }
    projectHtml = section('projects', 'Projects', [...body, '  </div>']);
  }

  let lessonHtml = '';
  if ((manifest.lessons as Row[]).length) {
    const body = [
      '  <div class="lms-card">',
      ...lessonList(manifest.lessons, '    ', ''),
      '  </div>',
    ];
    lessonHtml = section('lessons', 'Lessons', body);
  }

  return {
    name: esc(manifest.name),
    description: esc(manifest.description),
    stats: [
      stat(subjects.length, 'subject', 'subjects'),
      stat(projects.length, 'project', 'projects'),
      stat(lessonCount, 'lesson', 'lessons'),
    ].join(' '),
    subjects: subjectHtml,
    projects: projectHtml,
    lessons: lessonHtml,
  };
}

/** Rewrite the inside of every known lms:auto marker pair; leave everything else alone. */
export function applyAutoBlocks(html: string, manifest: Row, lessonCount: number): string {
  const blocks = autoBlocks(manifest, lessonCount);
  return html.replace(
    AUTO_BLOCK,
    (all, start: string, name: string, _inner: string, end: string) =>
      Object.prototype.hasOwnProperty.call(blocks, name) ? start + blocks[name] + end : all
  );
}

/**
 * Three-way sync of <class>/landingpage.html; re-render its lms:auto blocks only when the
 * class data they show changed since they were last rendered.
 */
function syncLanding(
  db: Db,
  root: string | null,
  canWrite: boolean,
  cls: Row,
  manifest: Row,
  lessonCount: number
): [string, string] {
  const rel = `${cls.slug}/${LANDING_FILE}`;
  const dbHtml = str(cls.landing_html);
  const base = str(cls.landing_hash);
  const filePath = root !== null ? path.join(root, rel) : null;
  let fileText: string | null;
  try {
    fileText = filePath !== null ? readText(filePath) : null;
  } catch (err) {
    console.warn(`[ai_lms] skipping ${rel}: ${(err as Error).message}`);
    return [dbHtml, contentHash(dbHtml)];
  }
  let created = false;
  let current: string;
  if (fileText === null) {
    current = dbHtml;
    if (!current) {
      current = template()
        .split('{{CLASS_NAME}}')
        .join(esc(unent(cls.name)));
      created = true;
    }
  } else if (!dbHtml) {
    current = fileText; // e.g. a class folder copied in before its DB rows
  } else {
    current = merge(db, 'landing', cls.id, rel, dbHtml, base, fileText);
  }
  const dataHash = contentHash(manifestText(manifest));
  const final =
    created || dataHash !== str(cls.landing_data_hash)
      ? applyAutoBlocks(current, manifest, lessonCount)
      : current;
  const finalHash = contentHash(final);
  let fileOk = fileText === final;
  if (filePath !== null && canWrite && !fileOk) fileOk = writeText(filePath, final);
  const newBase = fileOk ? finalHash : base;
  if (final !== dbHtml || newBase !== base || dataHash !== str(cls.landing_data_hash)) {
    db.prepare(
      'UPDATE lms_classes SET landing_html = ?, landing_hash = ?, landing_data_hash = ? WHERE id = ?'
    ).run(final, newBase, dataHash, cls.id);
  }
  return [final, finalHash];
}

// ─────────────────────────────────────────────────────────────────────────────
// Lessons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Settle every lesson of one class, then write files, then drop vacated paths. Each
 * lesson's current file is read from where it was last written (file_path), all before
 * anything is written, so moves and name swaps between siblings stay correct.
 */
function syncLessons(
  db: Db,
  root: string,
  canWrite: boolean,
  placements: Placement[]
): Map<string, string> {
  const plans: {
    lesson: Row;
    rel: string;
    srcRel: string;
    fileText: string | null;
    current: string;
  }[] = [];
  const hashes = new Map<string, string>();
  for (const [lesson, rel] of placements) {
    let srcRel = str(lesson.file_path) || rel;
    if (!safeRel(srcRel)) srcRel = rel;
    const dbHtml = str(lesson.generated_html);
    const base = str(lesson.file_hash);
    let fileText: string | null;
    try {
      fileText = readText(path.join(root, srcRel));
    } catch (err) {
      console.warn(`[ai_lms] skipping ${srcRel}: ${(err as Error).message}`);
      hashes.set(rel, base || contentHash(dbHtml));
      continue;
    }
    const current =
      fileText === null ? dbHtml : merge(db, 'lesson', lesson.id, srcRel, dbHtml, base, fileText);
    plans.push({ lesson, rel, srcRel, fileText, current });
  }

  const sources = new Set(plans.map((p) => p.srcRel));
  const targets = new Set(plans.map((p) => p.rel));
  const vacated = new Set<string>(); // old paths whose lesson now sits at its new path
  for (const { lesson, rel, srcRel, fileText, current } of plans) {
    const currentHash = contentHash(current);
    let fileOk = srcRel === rel && fileText === current;
    if (canWrite && !fileOk) {
      if (rel !== srcRel && !sources.has(rel)) {
        let stranger: string | null;
        try {
          stranger = readText(path.join(root, rel)); // a file nobody tracks sits where this lesson goes
        } catch {
          console.warn(
            `[ai_lms] not moving lesson ${lesson.id}: ${rel} is in the way and unreadable`
          );
          hashes.set(rel, str(lesson.file_hash) || currentHash);
          continue;
        }
        if (stranger !== null && stranger !== current) {
          backup(db, 'file', rel, rel, stranger, 'overwritten by a lesson moving into this path');
        }
      }
      fileOk = writeText(path.join(root, rel), current);
    }
    if (fileOk && srcRel !== rel && fileText !== null) vacated.add(srcRel);
    const oldPath = str(lesson.file_path);
    const oldBase = str(lesson.file_hash);
    const [newPath, newBase] = fileOk ? [rel, currentHash] : [oldPath, oldBase];
    if (current !== str(lesson.generated_html)) {
      db.prepare(
        'UPDATE lms_lessons SET generated_html = ?, updated_at = ?, file_path = ?, file_hash = ? WHERE id = ?'
      ).run(current, nowIso(), newPath, newBase, lesson.id);
    } else if (newPath !== oldPath || newBase !== oldBase) {
      db.prepare('UPDATE lms_lessons SET file_path = ?, file_hash = ? WHERE id = ?').run(
        newPath,
        newBase,
        lesson.id
      );
    }
    hashes.set(rel, currentHash);
  }

  for (const srcRel of vacated) if (!targets.has(srcRel)) unlink(path.join(root, srcRel));
  const ordered = new Map<string, string>();
  for (const [, rel] of placements) if (hashes.has(rel)) ordered.set(rel, hashes.get(rel)!);
  return ordered;
}

/**
 * Delete files the last class.json listed that nothing claims now (lesson deleted,
 * project re-planned). A file edited since it was written is backed up first.
 */
function removeStale(
  db: Db,
  root: string,
  classSlug: string,
  previous: Record<string, string>,
  keep: Set<string>
): void {
  for (const [relInClass, recordedHash] of Object.entries(previous)) {
    const rel = `${classSlug}/${relInClass}`;
    if (keep.has(relInClass) || !safeRel(rel)) continue;
    let text: string | null;
    try {
      text = readText(path.join(root, rel));
    } catch (err) {
      console.warn(`[ai_lms] leaving ${rel} in place: ${(err as Error).message}`);
      continue;
    }
    if (text === null) continue;
    if (contentHash(text) !== recordedHash) {
      backup(
        db,
        'file',
        rel,
        rel,
        text,
        'removed after its lesson was deleted; had unsynced edits'
      );
    }
    unlink(path.join(root, rel));
  }
}

function reconcileOne(db: Db, root: string, canWrite: boolean, cls: Row): void {
  const [subjects, lessons] = loadClassRows(db, cls.id);
  const [manifest, placements] = layout(cls, subjects, lessons);
  const classDir = path.join(root, cls.slug);
  const previous = manifestFiles(path.join(classDir, MANIFEST_FILE));
  const lessonHashes = syncLessons(db, root, canWrite, placements);
  const [, landingHash] = syncLanding(db, root, canWrite, cls, manifest, placements.length);
  const files: Record<string, string> = { [LANDING_FILE]: landingHash };
  for (const [rel, digest] of lessonHashes) files[rel.slice(String(cls.slug).length + 1)] = digest;
  manifest.files = files;
  if (!canWrite) return;
  const text = manifestText(manifest);
  if (readQuiet(path.join(classDir, MANIFEST_FILE)) !== text)
    writeText(path.join(classDir, MANIFEST_FILE), text);
  removeStale(db, root, cls.slug, previous, new Set(Object.keys(files)));
  prune(classDir, true);
}

function removeDeletedClasses(db: Db, root: string, liveSlugs: Set<string>): void {
  const names = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const name of names) {
    if (name.startsWith('_') || name.startsWith('.') || liveSlugs.has(name)) continue;
    const manifestPath = path.join(root, name, MANIFEST_FILE);
    if (readQuiet(manifestPath) === null) continue; // not a folder this sync created
    removeStale(db, root, name, manifestFiles(manifestPath), new Set());
    unlink(manifestPath);
    prune(path.join(root, name), false);
  }
}

/** Run `work` inside BEGIN IMMEDIATE: the cross-process lock with the Python twin. */
function lockedSync(work: (db: Db, root: string, canWrite: boolean) => void): void {
  const root = classesRoot();
  if (root === null) return;
  ensureLmsTables();
  const canWrite = writable(root);
  withDb((db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      work(db, root, canWrite);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Bring every class folder and the DB in line (both directions). */
export function reconcileAll(): void {
  lockedSync((db, root, canWrite) => {
    const classes = db
      .prepare(`SELECT ${CLASS_COLS} FROM lms_classes ORDER BY order_index ASC, slug ASC`)
      .all() as Row[];
    for (const cls of classes) if (safeRel(str(cls.slug))) reconcileOne(db, root, canWrite, cls);
    if (canWrite) removeDeletedClasses(db, root, new Set(classes.map((c) => c.slug as string)));
  });
}

/** Sync one class folder, e.g. when its page opens, so IDE edits to unopened lessons reach the DB. */
export function reconcileClass(classIdOrSlug: string): void {
  lockedSync((db, root, canWrite) => {
    const cls = db
      .prepare(`SELECT ${CLASS_COLS} FROM lms_classes WHERE id = ? OR slug = ?`)
      .get(classIdOrSlug, classIdOrSlug) as Row | undefined;
    if (cls && safeRel(str(cls.slug))) reconcileOne(db, root, canWrite, cls);
  });
}

let startupReconciled = false;

/** Once per server process: write missing files and pick up edits made while it was down. */
export function ensureStartupReconcile(): void {
  if (startupReconciled) return;
  startupReconciled = true;
  try {
    reconcileAll();
  } catch (err) {
    console.warn('[ai_lms] class folder sync at startup failed:', err);
  }
}

/** Wrap a mutating /api/lms handler so the class folders are synced when it finishes. */
export function withClassFolderSync<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } finally {
      try {
        reconcileAll();
      } catch (err) {
        console.warn('[ai_lms] class folder sync failed:', err);
      }
    }
  };
}

/**
 * Pull an IDE edit of this lesson's file into the DB (or rewrite a stale file). Uses the
 * path recorded at the last reconcile, so it costs one file read.
 */
export function refreshLesson(lesson: Row): Row {
  const root = classesRoot();
  const rel = str(lesson.file_path);
  if (root === null || !rel || !safeRel(rel)) return lesson;
  let fileText: string | null;
  try {
    fileText = readText(path.join(root, rel));
  } catch (err) {
    console.warn(`[ai_lms] skipping ${rel}: ${(err as Error).message}`);
    return lesson;
  }
  const dbHtml = str(lesson.generated_html);
  if (fileText === null || fileText === dbHtml) return lesson;
  const fresh = fileText;
  return (
    withDb((db) => {
      const current = merge(db, 'lesson', lesson.id, rel, dbHtml, str(lesson.file_hash), fresh);
      const currentHash = contentHash(current);
      if (current !== dbHtml) {
        const now = nowIso();
        db.prepare(
          'UPDATE lms_lessons SET generated_html = ?, updated_at = ?, file_hash = ? WHERE id = ?'
        ).run(current, now, currentHash, lesson.id);
        return { ...lesson, generated_html: current, updated_at: now, file_hash: currentHash };
      }
      if (writable(root) && writeText(path.join(root, rel), current)) {
        db.prepare('UPDATE lms_lessons SET file_hash = ? WHERE id = ?').run(currentHash, lesson.id);
        return { ...lesson, file_hash: currentHash };
      }
      return lesson;
    }) ?? lesson
  );
}

/**
 * The class landing page as the app should render it (IDE edits pulled in, auto blocks
 * current). Works without a classes folder too: then it lives in the DB only.
 */
export function getLanding(classIdOrSlug: string): Row | null {
  ensureLmsTables();
  const root = classesRoot();
  const canWrite = writable(root);
  return withDb((db) => {
    const cls = db
      .prepare(`SELECT ${CLASS_COLS} FROM lms_classes WHERE id = ? OR slug = ?`)
      .get(classIdOrSlug, classIdOrSlug) as Row | undefined;
    if (!cls) return null;
    const [subjects, lessons] = loadClassRows(db, cls.id, false);
    const [manifest, placements] = layout(cls, subjects, lessons);
    const [html, digest] = syncLanding(db, root, canWrite, cls, manifest, placements.length);
    return {
      class_id: cls.id,
      class_slug: cls.slug,
      html,
      hash: digest,
      file_path: `${cls.slug}/${LANDING_FILE}`,
      file_sync: root !== null,
    };
  });
}

/**
 * Map a classes-folder path (where a link in a landing page or lesson points) to the
 * class / subject / lesson it shows, so the app can navigate to its own route.
 */
export function resolvePath(rawPath: string): Row | null {
  let parts = rawPath
    .trim()
    .split('/')
    .filter((p) => p !== '' && p !== '.');
  if (!parts.length || parts.includes('..')) return null;
  if (parts[parts.length - 1] === 'index.html') parts = parts.slice(0, -1);
  if (!parts.length) return null;
  ensureLmsTables();
  return withDb((db) => {
    const cls = db.prepare(`SELECT ${CLASS_COLS} FROM lms_classes WHERE slug = ?`).get(parts[0]) as
      Row | undefined;
    if (!cls) return null;
    const target = { class_slug: cls.slug };
    if (parts.length === 1) return { kind: 'class', ...target };
    if (parts.length === 2 && parts[1] === LANDING_FILE) return { kind: 'landing', ...target };
    const [subjects, lessons] = loadClassRows(db, cls.id, false);
    const slugs = new Map(subjects.map((s) => [s.id as string, s.slug as string]));
    if (parts.length === 2 && [...slugs.values()].includes(parts[1])) {
      return { kind: 'subject', ...target, subject_slug: parts[1] };
    }
    const [, placements] = layout(cls, subjects, lessons);
    const rel = parts.join('/');
    for (const [lesson, lessonRel] of placements) {
      if (lessonRel === rel) {
        return {
          kind: 'lesson',
          ...target,
          subject_slug: slugs.get(str(lesson.subject_id)) ?? null,
          lesson_id: lesson.id,
          lesson_slug: lesson.slug,
        };
      }
    }
    return null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Export: the class as a deployable static site
// ─────────────────────────────────────────────────────────────────────────────

/** index.html for an exported class: static hosts serve it at the folder root. */
function indexHtml(name: unknown): string {
  const title = esc(unent(name));
  return (
    '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n' +
    `  <meta http-equiv="refresh" content="0; url=${LANDING_FILE}">\n` +
    `  <title>${title}</title>\n</head>\n<body>\n` +
    `  <p><a href="${LANDING_FILE}">${title}</a></p>\n</body>\n</html>\n`
  );
}

/**
 * templates/deploy/* (Dockerfile + nginx config for Cloud Run, vercel.json, README), with
 * {{CLASS_NAME}} / {{CLASS_SLUG}} filled in.
 */
function deployFiles(cls: Row): Record<string, string> {
  const base = templatesDir();
  const dir = base ? path.join(base, 'deploy') : null;
  if (!dir || !isDir(dir)) return {};
  const files: Record<string, string> = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    const text = fs.statSync(file).isFile() ? readQuiet(file) : null;
    if (text !== null) {
      files[name] = text
        .split('{{CLASS_NAME}}')
        .join(unent(cls.name))
        .split('{{CLASS_SLUG}}')
        .join(String(cls.slug));
    }
  }
  return files;
}

/**
 * Every file of one class as {path inside the class folder: content}, ready to deploy:
 * the landing page, an index.html pointing at it, each lesson at its folder path,
 * class.json, plus the deploy files (vercel.json for Vercel, a Dockerfile serving the site
 * with nginx for Google Cloud Run, README). Built from the DB after pulling in IDE edits,
 * so it works with or without a classes folder (e.g. on Vercel). Twin of export_class in
 * class_folders.py.
 */
export function exportClass(
  classIdOrSlug: string
): { slug: string; files: Record<string, string> } | null {
  try {
    reconcileClass(classIdOrSlug);
  } catch (err) {
    console.warn('[ai_lms] class folder sync before export failed:', err);
  }
  const landing = getLanding(classIdOrSlug);
  if (!landing) return null;
  return withDb((db) => {
    const cls = db
      .prepare(`SELECT ${CLASS_COLS} FROM lms_classes WHERE id = ?`)
      .get(landing.class_id) as Row;
    const [subjects, lessons] = loadClassRows(db, cls.id);
    const [manifest, placements] = layout(cls, subjects, lessons);
    const slug = String(cls.slug);
    const files: Record<string, string> = { [LANDING_FILE]: landing.html };
    for (const [lesson, rel] of placements)
      files[rel.slice(slug.length + 1)] = str(lesson.generated_html);
    manifest.files = Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, contentHash(text)])
    );
    files[MANIFEST_FILE] = manifestText(manifest);
    files['index.html'] = indexHtml(cls.name);
    for (const [name, text] of Object.entries(deployFiles(cls))) {
      if (!(name in files)) files[name] = text;
    }
    return { slug, files };
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Landing page: saving an edit made in the app (twin of save_landing in class_folders.py)
// ─────────────────────────────────────────────────────────────────────────────

export class LandingConflict extends Error {}

/**
 * Replace the landing page with HTML edited in the app (manual or AI). The previous HTML goes
 * to lms_html_backups; landing_hash (the "base") is left alone so the next reconcile sees
 * DB != base and file == base and writes the new page to landingpage.html. baseHash guards
 * against clobbering an IDE edit made meanwhile.
 */
export function saveLanding(classIdOrSlug: string, html: string, baseHash?: string | null): Row | null {
  const current = getLanding(classIdOrSlug); // pulls in IDE edits, so baseHash compares to the disk
  if (!current) return null;
  if (baseHash && baseHash !== current.hash) {
    throw new LandingConflict('The landing page changed since you opened it. Reload and re-apply your edit.');
  }
  if (html === current.html) return current;
  withDb((db) => {
    backup(db, 'landing', current.class_id, current.file_path, current.html, 'replaced by an app edit');
    db.prepare('UPDATE lms_classes SET landing_html = ? WHERE id = ?').run(html, current.class_id);
  });
  reconcileClass(current.class_id);
  return getLanding(current.class_id);
}
