/**
 * fe-apis/labProjects/db.ts
 *
 * Port of backend/modules/lab_projects/store.py. Synchronous, run inside `withLabProjectsDb`
 * (never `await` inside the callback -- node:sqlite is synchronous).
 *
 * Every function takes the caller's `userId` and scopes every query by it; every section query is also
 * scoped by its project. Someone else's project or section is simply "not found" -- the isolation the
 * labs' project-aware generation relies on.
 */

import { withTodoDb, type Row, type TodoDb } from '../todo/_shared';
import { ensureLabProjectsSchema } from './schema';
import { collapseWhitespace, cpLength, cpSlice, pyRstrip, pyStrip } from './text';

let schemaReady = false;

/** `withTodoDb` (one connection, busy_timeout, re-entrant) plus this module's tables, created once per process. */
export function withLabProjectsDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    if (!schemaReady) {
      ensureLabProjectsSchema(db);
      schemaReady = true;
    }
    return fn(db);
  });
}

export const STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = (typeof STATUSES)[number];
const EXCERPT_CHARS = 220;

export interface Project {
  id: number;
  name: string;
  description: string;
  context: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
}

export interface ProjectSection {
  id: number;
  projectId: number;
  title: string;
  sourceLabId: string;
  sourceLabName: string;
  sourceGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
  excerpt: string;
  /** Only on detail reads and on the retrieval corpus. */
  content?: string;
}

function projectRow(row: Row): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    context: row.context,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sectionCount: row.section_count,
  };
}

const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.context, p.status, p.created_at, p.updated_at,
         (SELECT COUNT(*) FROM lab_project_sections s WHERE s.project_id = p.id) AS section_count
  FROM lab_projects p
`;

const MARKDOWN_NOISE = /```[^\n]*\n|```|[*_`#>|]+/g;

/** The first few words of a section, with the Markdown punctuation stripped, for list views. */
export function makeExcerpt(content: string): string {
  const flat = pyStrip(collapseWhitespace(content.replace(MARKDOWN_NOISE, ' ')));
  return cpLength(flat) <= EXCERPT_CHARS
    ? flat
    : pyRstrip(cpSlice(flat, 0, EXCERPT_CHARS - 1)) + '…';
}

function sectionRow(row: Row, withContent: boolean): ProjectSection {
  const out: ProjectSection = {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    sourceLabId: row.source_lab_id,
    sourceLabName: row.source_lab_name,
    sourceGenerationId: row.source_generation_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    excerpt: makeExcerpt(row.content),
  };
  if (withContent) out.content = row.content;
  return out;
}

// ── Projects ────────────────────────────────────────────────────────────────

export function listProjects(userId: number, status: string = 'all'): Project[] {
  return withLabProjectsDb((db) => {
    let where = 'WHERE p.user_id = ?';
    const args: unknown[] = [userId];
    if ((STATUSES as readonly string[]).includes(status)) {
      where += ' AND p.status = ?';
      args.push(status);
    }
    return db
      .all(`${PROJECT_SELECT} ${where} ORDER BY p.updated_at DESC, p.id DESC`, ...args)
      .map(projectRow);
  });
}

export function getProject(userId: number, projectId: number): Project | undefined {
  return withLabProjectsDb((db) => {
    const row = db.get(`${PROJECT_SELECT} WHERE p.user_id = ? AND p.id = ?`, userId, projectId);
    return row ? projectRow(row) : undefined;
  });
}

export function createProject(
  userId: number,
  name: string,
  description: string,
  context: string
): Project {
  return withLabProjectsDb((db) => {
    const res = db.run(
      'INSERT INTO lab_projects (user_id, name, description, context) VALUES (?, ?, ?, ?)',
      userId,
      name,
      description,
      context
    );
    return getProject(userId, res.lastInsertRowid)!;
  });
}

/**
 * Apply `changes` (any of name, description, context, status). Undefined if the project isn't the
 * user's. Only the project row changes: its saved sections are separate rows and are never touched.
 */
export function updateProject(
  userId: number,
  projectId: number,
  changes: Row
): Project | undefined {
  const keys = Object.keys(changes).filter((k) =>
    ['name', 'description', 'context', 'status'].includes(k)
  );
  return withLabProjectsDb((db) => {
    if (keys.length) {
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const res = db.run(
        `UPDATE lab_projects SET ${sets}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
        ...keys.map((k) => changes[k]),
        projectId,
        userId
      );
      if (res.changes === 0) return undefined;
    }
    return getProject(userId, projectId);
  });
}

/**
 * Delete a project and every section saved to it. Returns how many sections went, undefined if not
 * found. Lab pages that were generated for the project keep their text and their (now dangling) project
 * id, which is never reused, so that text is never revised or quoted by a generation for anything else.
 */
export function deleteProject(userId: number, projectId: number): number | undefined {
  return withLabProjectsDb((db) =>
    db.transaction(() => {
      const owned = db.get(
        'SELECT 1 FROM lab_projects WHERE id = ? AND user_id = ?',
        projectId,
        userId
      );
      if (!owned) return undefined;
      const deleted = db.run(
        'DELETE FROM lab_project_sections WHERE project_id = ? AND user_id = ?',
        projectId,
        userId
      ).changes;
      db.run('DELETE FROM lab_projects WHERE id = ? AND user_id = ?', projectId, userId);
      return deleted;
    })
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

/** A project's sections, newest first. `q` matches the title or the content, `lab` the source lab. */
export function listSections(
  userId: number,
  projectId: number,
  q: string = '',
  lab: string = ''
): ProjectSection[] {
  return withLabProjectsDb((db) => {
    let where = 'WHERE project_id = ? AND user_id = ?';
    const args: unknown[] = [projectId, userId];
    const needle = pyStrip(q);
    if (needle) {
      where += ' AND (instr(lower(title), lower(?)) > 0 OR instr(lower(content), lower(?)) > 0)';
      args.push(needle, needle);
    }
    if (lab) {
      where += ' AND source_lab_id = ?';
      args.push(lab);
    }
    return db
      .all(`SELECT * FROM lab_project_sections ${where} ORDER BY updated_at DESC, id DESC`, ...args)
      .map((r) => sectionRow(r, false));
  });
}

/** Every section of the project including its text, newest first (the retrieval corpus). */
export function listSectionsWithContent(userId: number, projectId: number): ProjectSection[] {
  return withLabProjectsDb((db) =>
    db
      .all(
        `SELECT * FROM lab_project_sections WHERE project_id = ? AND user_id = ?
         ORDER BY updated_at DESC, id DESC`,
        projectId,
        userId
      )
      .map((r) => sectionRow(r, true))
  );
}

export function getSection(
  userId: number,
  projectId: number,
  sectionId: number
): ProjectSection | undefined {
  return withLabProjectsDb((db) => {
    const row = db.get(
      'SELECT * FROM lab_project_sections WHERE id = ? AND project_id = ? AND user_id = ?',
      sectionId,
      projectId,
      userId
    );
    return row ? sectionRow(row, true) : undefined;
  });
}

export function createSection(
  userId: number,
  projectId: number,
  title: string,
  content: string,
  sourceLabId: string,
  sourceLabName: string,
  sourceGenerationId: string | null
): ProjectSection {
  return withLabProjectsDb((db) =>
    db.transaction(() => {
      const res = db.run(
        `INSERT INTO lab_project_sections
           (project_id, user_id, title, content, source_lab_id, source_lab_name, source_generation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        projectId,
        userId,
        title,
        content,
        sourceLabId,
        sourceLabName,
        sourceGenerationId
      );
      // Saving into a project is activity on it, so it floats to the top of the user's list.
      db.run(
        "UPDATE lab_projects SET updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        projectId,
        userId
      );
      return getSection(userId, projectId, res.lastInsertRowid)!;
    })
  );
}

export function updateSection(
  userId: number,
  projectId: number,
  sectionId: number,
  changes: Row
): ProjectSection | undefined {
  const keys = Object.keys(changes).filter((k) => ['title', 'content'].includes(k));
  return withLabProjectsDb((db) => {
    if (keys.length) {
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const res = db.run(
        `UPDATE lab_project_sections SET ${sets}, updated_at = datetime('now')
         WHERE id = ? AND project_id = ? AND user_id = ?`,
        ...keys.map((k) => changes[k]),
        sectionId,
        projectId,
        userId
      );
      if (res.changes === 0) return undefined;
    }
    return getSection(userId, projectId, sectionId);
  });
}

export function deleteSection(userId: number, projectId: number, sectionId: number): boolean {
  return withLabProjectsDb(
    (db) =>
      db.run(
        'DELETE FROM lab_project_sections WHERE id = ? AND project_id = ? AND user_id = ?',
        sectionId,
        projectId,
        userId
      ).changes > 0
  );
}
