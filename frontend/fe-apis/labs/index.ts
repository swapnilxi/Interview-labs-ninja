/**
 * fe-apis/labs/index.ts
 *
 * Next.js twin (nextjs-api mode) of the topic and section routes of the three interview labs:
 *
 *   /dsa/topics            /dsa/sections             backend/modules/dsa_lab/router.py (+ dsa_lab/seed.py)
 *   /cv/topics             /cv/sections              backend/modules/cv_lab/router.py (+ cv_lab/seed.py)
 *   /system-design/topics  /system-design/sections   backend/modules/system_design_lab/router.py (+ seed.py)
 *   /communication/topics, /finance/topics, /python/topics, /genai/topics (+ /sections each)
 *                                                    backend/modules/common/topic_lab.py (+ <lab>_lab/topics.json)
 *
 * GET/POST each, login required (router-level get_current_user_id). Topics are shared by everyone; sections are the
 * shared defaults plus the caller's own (common/db.py fetch_lab_sections/save_lab_section). Stored JSON is written with
 * Python's json.dumps formatting so both backends can share one SQLite file. A change to those Python files must be
 * mirrored here (CLAUDE.md, "Dual deployment modes").
 *
 * Seed data: the DSA/CV/System Design topics are not ported (FastAPI's init_db seeds them; the git-tracked database
 * already holds them). The Communication, Finance, Python and GenAI labs seed from the same backend/modules/<lab>_lab/topics.json
 * files FastAPI reads (seedTopicLabs below, once per process, INSERT OR IGNORE like topic_lab.seed_topics), so they work
 * even on a database FastAPI never started on. Each route's next.config.mjs outputFileTracingIncludes ships its file.
 */

import fs from 'node:fs';
import path from 'node:path';

import { withNeonSync } from '@/lib/server/neonSync';
import { compileRoutes, dispatch, type TodoRoute } from '../todo/router';
import { HttpError, withTodoDb, type Row, type TodoDb } from '../todo/_shared';
import { pyJsonDumps } from '../todo/py';

export type LabKey = 'dsa' | 'cv' | 'system-design' | 'communication' | 'finance' | 'python' | 'genai';

interface LabConfig {
  table: string;
  /** lab_sections.lab_name */
  sectionLab: string;
  shape: 'prerequisites' | 'system-design';
  /** Second ORDER BY key after is_custom, as each Python fetch has it. */
  order: 'id' | 'rowid';
  /** cv/system design catch a malformed JSON column and use []; dsa lets json.loads raise. */
  lenientJson: boolean;
  /** backend/modules/<seedDir>/topics.json holds the seed topics (the topic labs; see seedTopicLabs). */
  seedDir?: string;
}

const LABS: Record<LabKey, LabConfig> = {
  dsa: { table: 'dsa_topics', sectionLab: 'dsa', shape: 'prerequisites', order: 'id', lenientJson: false },
  cv: { table: 'cv_topics', sectionLab: 'cv', shape: 'prerequisites', order: 'rowid', lenientJson: true },
  'system-design': { table: 'system_design_topics', sectionLab: 'system_design', shape: 'system-design', order: 'rowid', lenientJson: true },
  communication: { table: 'communication_topics', sectionLab: 'communication', shape: 'prerequisites', order: 'rowid', lenientJson: true, seedDir: 'communication_lab' },
  finance: { table: 'finance_topics', sectionLab: 'finance', shape: 'prerequisites', order: 'rowid', lenientJson: true, seedDir: 'finance_lab' },
  python: { table: 'python_topics', sectionLab: 'python', shape: 'prerequisites', order: 'rowid', lenientJson: true, seedDir: 'python_lab' },
  genai: { table: 'genai_topics', sectionLab: 'genai', shape: 'prerequisites', order: 'rowid', lenientJson: true, seedDir: 'genai_lab' },
};

// ── Schema (CREATE TABLE IF NOT EXISTS copies of the Python ones; no seeding) ────────────────────────────────

let schemaReady = false;

function ensureLabSchema(db: TodoDb) {
  if (schemaReady) return;
  for (const table of ['dsa_topics', 'cv_topics', 'communication_topics', 'finance_topics', 'python_topics', 'genai_topics']) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brief TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        prerequisites_json TEXT NOT NULL DEFAULT '[]',
        subtopics_json TEXT NOT NULL DEFAULT '[]',
        is_custom INTEGER NOT NULL DEFAULT 0
      )`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_design_topics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brief TEXT NOT NULL,
      category TEXT NOT NULL,
      scale TEXT NOT NULL DEFAULT 'N/A',
      difficulty TEXT NOT NULL,
      is_lld INTEGER NOT NULL DEFAULT 0,
      subtopics_json TEXT NOT NULL DEFAULT '[]',
      is_custom INTEGER NOT NULL DEFAULT 0
    )`);
  // lab_sections as it is after FastAPI's migration (per-user uniqueness).
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lab_name TEXT NOT NULL,
      name TEXT NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER DEFAULT NULL,
      UNIQUE(user_id, lab_name, name)
    )`);
  seedTopicLabs(db);
  schemaReady = true;
}

/** The parsed backend/modules/<dir>/topics.json (run from frontend/ or the repo root), or null if it can't be read. */
function readSeedTopics(dir: string): Row[] | null {
  const cwd = process.cwd();
  for (const base of [path.join(cwd, '..', 'backend'), path.join(cwd, 'backend')]) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(base, 'modules', dir, 'topics.json'), 'utf8'));
      if (Array.isArray(parsed)) return parsed as Row[];
    } catch {
      /* try the next location */
    }
  }
  return null;
}

/**
 * The topic labs' seed (topic_lab.seed_topics + the category rows init_db adds): every seed topic whose id is missing
 * is inserted as a default (is_custom 0) topic, and every seed category becomes a shared default section. Existing rows
 * are never touched, so a user's added subtopics survive.
 */
function seedTopicLabs(db: TodoDb) {
  for (const lab of Object.values(LABS)) {
    if (!lab.seedDir) continue;
    const topics = readSeedTopics(lab.seedDir);
    if (!topics) {
      console.warn(`[fe-apis/labs] backend/modules/${lab.seedDir}/topics.json not found: ${lab.table} is not seeded`);
      continue;
    }
    for (const t of topics) {
      db.run(
        `INSERT OR IGNORE INTO ${lab.table} (
           id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        t.id, t.name, t.brief, t.category, t.difficulty, pyJsonDumps(t.prerequisites ?? []), pyJsonDumps(t.subtopics ?? [])
      );
    }
    for (const category of new Set(topics.map((t) => t.category as string))) {
      db.run(
        `INSERT INTO lab_sections (lab_name, name, is_custom, user_id)
         SELECT ?, ?, 0, NULL
         WHERE NOT EXISTS (SELECT 1 FROM lab_sections WHERE lab_name = ? AND name = ? AND user_id IS NULL)`,
        lab.sectionLab, category, lab.sectionLab, category
      );
    }
  }
}

function withLabsDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    ensureLabSchema(db);
    return fn(db);
  });
}

// ── Request validation (the Pydantic models in each router) ─────────────────────────────────────────────────

function isDict(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqStr(obj: Row, key: string, at: string): string {
  if (!(key in obj)) throw new HttpError(422, `${at}${key}: Field required`);
  if (typeof obj[key] !== 'string') throw new HttpError(422, `${at}${key}: Input should be a valid string`);
  return obj[key] as string;
}

function optStr(obj: Row, key: string, at: string): string | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new HttpError(422, `${at}${key}: Input should be a valid string`);
  return v;
}

/** Pydantic bool, lax mode. */
function optBool(obj: Row, key: string, fallback: boolean): boolean {
  const v = obj[key];
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 0 || v === 1) return v === 1;
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (['true', '1', 'yes', 'on', 't', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'off', 'f', 'n'].includes(s)) return false;
  throw new HttpError(422, `${key}: Input should be a valid boolean`);
}

/** SubtopicIn.model_dump(): exactly these keys, in this order, None for the missing optional ones. */
function subtopics(obj: Row): Row[] {
  const raw = obj.subtopics;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(422, 'subtopics: Input should be a valid list');
  return raw.map((item, i) => {
    if (!isDict(item)) throw new HttpError(422, `subtopics.${i}: Input should be a valid dictionary`);
    const at = `subtopics.${i}.`;
    return {
      id: reqStr(item, 'id', at),
      name: reqStr(item, 'name', at),
      brief: reqStr(item, 'brief', at),
      content: optStr(item, 'content', at),
      sourceUrl: optStr(item, 'sourceUrl', at),
    };
  });
}

function strList(obj: Row, key: string): string[] {
  const raw = obj[key];
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((v) => typeof v === 'string'))
    throw new HttpError(422, `${key}: Input should be a valid list of strings`);
  return raw as string[];
}

function parseJsonColumn(text: string, lenient: boolean): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    // dsa/cv: json.loads raises (a 500 in FastAPI too); system design catches it and uses [].
    if (lenient) return [];
    throw err;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────────────────────────────────────

function fetchTopics(lab: LabConfig): Row[] {
  return withLabsDb((db) => {
    if (lab.shape === 'system-design') {
      return db
        .all(
          `SELECT id, name, brief, category, scale, difficulty, is_lld, subtopics_json, is_custom
           FROM system_design_topics ORDER BY is_custom ASC, rowid ASC`
        )
        .map((r) => ({
          id: r.id,
          name: r.name,
          brief: r.brief,
          category: r.category,
          scale: r.scale,
          difficulty: r.difficulty,
          isLLD: Boolean(r.is_lld),
          subtopics: parseJsonColumn(r.subtopics_json, true),
          isCustom: Boolean(r.is_custom),
        }));
    }
    return db
      .all(
        `SELECT id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
         FROM ${lab.table} ORDER BY is_custom ASC, ${lab.order} ASC`
      )
      .map((r) => ({
        id: r.id,
        name: r.name,
        brief: r.brief,
        category: r.category,
        difficulty: r.difficulty,
        prerequisites: parseJsonColumn(r.prerequisites_json, lab.lenientJson),
        subtopics: parseJsonColumn(r.subtopics_json, lab.lenientJson),
        isCustom: Boolean(r.is_custom),
      }));
  });
}

function saveTopic(key: LabKey, lab: LabConfig, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  const id = reqStr(body, 'id', '');
  const name = reqStr(body, 'name', '');
  const brief = reqStr(body, 'brief', '');
  const category = reqStr(body, 'category', '');
  if (lab.shape === 'system-design') {
    const scale = reqStr(body, 'scale', '');
    const difficulty = reqStr(body, 'difficulty', '');
    const isLLD = optBool(body, 'isLLD', false);
    const subs = subtopics(body);
    withLabsDb((db) =>
      db.run(
        `INSERT OR REPLACE INTO system_design_topics (
           id, name, brief, category, scale, difficulty, is_lld, subtopics_json, is_custom
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT is_custom FROM system_design_topics WHERE id = ?), 1))`,
        id, name, brief, category, scale, difficulty, isLLD ? 1 : 0, pyJsonDumps(subs), id
      )
    );
    return { status: 'success' };
  }
  const difficulty = reqStr(body, 'difficulty', '');
  const prerequisites = strList(body, 'prerequisites');
  const subs = subtopics(body);
  withLabsDb((db) => {
    if (key === 'dsa') {
      db.run(
        `INSERT INTO dsa_topics (
           id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           brief=excluded.brief,
           category=excluded.category,
           difficulty=excluded.difficulty,
           prerequisites_json=excluded.prerequisites_json,
           subtopics_json=excluded.subtopics_json,
           is_custom=COALESCE((SELECT is_custom FROM dsa_topics WHERE id=excluded.id), 1)`,
        id, name, brief, category, difficulty, pyJsonDumps(prerequisites), pyJsonDumps(subs)
      );
    } else if (lab.seedDir) {
      // The topic labs (common/topic_lab.py save_topic): an upsert keeps an edited lesson's rowid, so it keeps its
      // place in the lab's ordered path (INSERT OR REPLACE would re-insert it at the end), and keeps is_custom.
      db.run(
        `INSERT INTO ${lab.table} (
           id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           brief = excluded.brief,
           category = excluded.category,
           difficulty = excluded.difficulty,
           prerequisites_json = excluded.prerequisites_json,
           subtopics_json = excluded.subtopics_json`,
        id, name, brief, category, difficulty, pyJsonDumps(prerequisites), pyJsonDumps(subs)
      );
    } else {
      // cv_lab/seed.py save_cv_topic
      db.run(
        `INSERT OR REPLACE INTO cv_topics (
           id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
         ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT is_custom FROM cv_topics WHERE id = ?), 1))`,
        id, name, brief, category, difficulty, pyJsonDumps(prerequisites), pyJsonDumps(subs), id
      );
    }
  });
  return { status: 'success' };
}

function fetchSections(lab: LabConfig, userId: number): Row[] {
  return withLabsDb((db) =>
    db
      .all(
        `SELECT id, lab_name, name, is_custom FROM lab_sections
         WHERE lab_name = ? AND (user_id IS NULL OR user_id = ?)
         ORDER BY is_custom ASC, id ASC`,
        lab.sectionLab,
        userId
      )
      .map((r) => ({ id: r.id, labName: r.lab_name, name: r.name, isCustom: Boolean(r.is_custom) }))
  );
}

function saveSection(lab: LabConfig, userId: number, body: unknown): Row {
  if (!isDict(body)) throw new HttpError(422, 'Input should be a valid dictionary');
  const name = reqStr(body, 'name', '');
  optBool(body, 'isCustom', true); // validated like LabSectionIn, then ignored (always custom)
  withLabsDb((db) =>
    db.run('INSERT OR IGNORE INTO lab_sections (lab_name, name, is_custom, user_id) VALUES (?, ?, 1, ?)', lab.sectionLab, name, userId)
  );
  return { status: 'success' };
}

function routesFor(key: LabKey): TodoRoute[] {
  const lab = LABS[key];
  return [
    { method: 'GET', path: '/topics', handler: () => fetchTopics(lab) },
    { method: 'POST', path: '/topics', handler: async (ctx) => saveTopic(key, lab, await ctx.json()) },
    { method: 'GET', path: '/sections', handler: (ctx) => fetchSections(lab, ctx.userId) },
    { method: 'POST', path: '/sections', handler: async (ctx) => saveSection(lab, ctx.userId, await ctx.json()) },
  ];
}

const COMPILED: Record<LabKey, ReturnType<typeof compileRoutes>> = {
  dsa: compileRoutes(routesFor('dsa')),
  cv: compileRoutes(routesFor('cv')),
  'system-design': compileRoutes(routesFor('system-design')),
  communication: compileRoutes(routesFor('communication')),
  finance: compileRoutes(routesFor('finance')),
  python: compileRoutes(routesFor('python')),
  genai: compileRoutes(routesFor('genai')),
};

/** True for the paths this module serves (the DSA catch-all also serves the week plan). */
export function isLabTopicPath(segments: string[]): boolean {
  return segments.length === 1 && (segments[0] === 'topics' || segments[0] === 'sections');
}

function dispatchLab(key: LabKey) {
  return (req: Request, segments: string[]) => dispatch(COMPILED[key], req, segments);
}

const writers: Record<LabKey, (req: Request, segments: string[]) => Promise<Response>> = {
  dsa: withNeonSync(dispatchLab('dsa')),
  cv: withNeonSync(dispatchLab('cv')),
  'system-design': withNeonSync(dispatchLab('system-design')),
  communication: withNeonSync(dispatchLab('communication')),
  finance: withNeonSync(dispatchLab('finance')),
  python: withNeonSync(dispatchLab('python')),
  genai: withNeonSync(dispatchLab('genai')),
};

/** Entry point for src/app/api/{dsa,cv,system-design,communication,finance,python,genai}/[...path]/route.ts. */
export function handleLabTopics(key: LabKey, req: Request, segments: string[]): Promise<Response> {
  return req.method === 'GET' ? dispatchLab(key)(req, segments) : writers[key](req, segments);
}
