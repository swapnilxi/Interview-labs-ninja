/**
 * fe-apis/labSections/snippets.ts
 *
 * User code snippets on a lab section card. Twin of backend/modules/lab_sections/snippets.py:
 * same table (created in schema.ts), limits, error texts and status codes — change both.
 * user_id 0 = shared (added by an admin for everyone).
 */

import { HttpError, type Row } from '../todo/_shared';
import { withLabDb } from './db';

const SHARED_USER = 0;

const LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'cpp', 'go', 'rust', 'sql', 'other'] as const;

const MAX_PER_SECTION = 20;
const MAX_TITLE = 120;
const MAX_CODE = 20_000;

const NOT_ADMIN_SHARE = 'Only an admin can add a shared snippet.';
const LIMIT_ERROR = `You have reached the ${MAX_PER_SECTION}-snippet limit for this section.`;
const SHARED_LIMIT_ERROR = `The shared snippets for this section have reached the ${MAX_PER_SECTION} limit.`;
const NOTHING_TO_CHANGE = 'Send a title, language or code to change.';
const BAD_LANGUAGE = `language must be one of: ${LANGUAGES.join(', ')}.`;

type Db = Parameters<Parameters<typeof withLabDb>[0]>[0];

function isAdmin(db: Db, userId: number): boolean {
  const role = db.get<{ role?: string }>('SELECT role FROM users WHERE id = ?', userId)?.role;
  return role === 'admin' || role === 'superadmin';
}

function rowOut(r: Row) {
  return {
    id: Number(r.id),
    shared: Number(r.user_id) === SHARED_USER,
    title: r.title as string,
    language: r.language as string,
    code: r.code as string,
    order_index: Number(r.order_index),
    created_at: r.created_at as string,
  };
}

function sectionRows(
  db: Db,
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  sectionId: string,
  onlyUser = false
) {
  const users = onlyUser ? [userId] : [SHARED_USER, userId];
  return db
    .all<Row>(
      `SELECT * FROM lab_section_snippets
       WHERE user_id IN (${users.map(() => '?').join(',')})
         AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND section_id = ?
       ORDER BY (user_id = ${SHARED_USER}) DESC, order_index ASC, id ASC`,
      ...users,
      lab,
      topicId,
      subtopicId,
      sectionId
    )
    .map(rowOut);
}

function cleanTitle(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  const t = String(raw).trim();
  if (t.length > MAX_TITLE) throw new HttpError(422, `Title must be ${MAX_TITLE} characters or fewer.`);
  return t;
}

function cleanCode(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(422, 'code is required.');
  if (raw.length > MAX_CODE) throw new HttpError(422, `Code must be ${MAX_CODE} characters or fewer.`);
  return raw;
}

function cleanLanguage(raw: unknown): string {
  const lang = raw ? String(raw).trim().toLowerCase() : 'python';
  if (!(LANGUAGES as readonly string[]).includes(lang)) throw new HttpError(422, BAD_LANGUAGE);
  return lang;
}

export function listSnippets(userId: number, lab: string, topicId: string, subtopicId: string, sectionId: string) {
  return withLabDb((db) => ({ snippets: sectionRows(db, userId, lab, topicId, subtopicId, sectionId) }));
}

export function addSnippet(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  sectionId: string,
  titleRaw: unknown,
  languageRaw: unknown,
  codeRaw: unknown,
  shared: boolean
) {
  const title = cleanTitle(titleRaw);
  const language = cleanLanguage(languageRaw);
  const code = cleanCode(codeRaw);
  return withLabDb((db) =>
    db.transaction(() => {
      if (shared && !isAdmin(db, userId)) throw new HttpError(403, NOT_ADMIN_SHARE);
      const owner = shared ? SHARED_USER : userId;
      const bucket = sectionRows(db, owner, lab, topicId, subtopicId, sectionId, true);
      if (bucket.length >= MAX_PER_SECTION) throw new HttpError(422, shared ? SHARED_LIMIT_ERROR : LIMIT_ERROR);
      const orderIndex = bucket.length ? bucket[bucket.length - 1].order_index + 1 : 0;
      const { lastInsertRowid } = db.run(
        `INSERT INTO lab_section_snippets
           (user_id, lab_name, topic_id, subtopic_id, section_id, title, language, code, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        owner,
        lab,
        topicId,
        subtopicId,
        sectionId,
        title,
        language,
        code,
        orderIndex
      );
      return rowOut(db.get<Row>('SELECT * FROM lab_section_snippets WHERE id = ?', lastInsertRowid) as Row);
    })
  );
}

export function updateSnippet(
  userId: number,
  snippetId: number,
  titleRaw: unknown,
  languageRaw: unknown,
  codeRaw: unknown
) {
  const sent = (v: unknown) => v !== undefined && v !== null;
  if (!sent(titleRaw) && !sent(languageRaw) && !sent(codeRaw)) throw new HttpError(422, NOTHING_TO_CHANGE);
  const title = sent(titleRaw) ? cleanTitle(titleRaw) : null;
  const language = sent(languageRaw) ? cleanLanguage(languageRaw) : null;
  const code = sent(codeRaw) ? cleanCode(codeRaw) : null;
  return withLabDb((db) =>
    db.transaction(() => {
      const owners = isAdmin(db, userId) ? [userId, SHARED_USER] : [userId];
      const row = db.get<Row>(
        `SELECT * FROM lab_section_snippets WHERE id = ? AND user_id IN (${owners.map(() => '?').join(',')})`,
        snippetId,
        ...owners
      );
      if (!row) throw new HttpError(404, 'Snippet not found.');
      db.run(
        'UPDATE lab_section_snippets SET title = ?, language = ?, code = ? WHERE id = ?',
        title ?? (row.title as string),
        language ?? (row.language as string),
        code ?? (row.code as string),
        snippetId
      );
      return rowOut(db.get<Row>('SELECT * FROM lab_section_snippets WHERE id = ?', snippetId) as Row);
    })
  );
}

export function deleteSnippet(userId: number, snippetId: number) {
  return withLabDb((db) => {
    const owners = isAdmin(db, userId) ? [userId, SHARED_USER] : [userId];
    const { changes } = db.run(
      `DELETE FROM lab_section_snippets WHERE id = ? AND user_id IN (${owners.map(() => '?').join(',')})`,
      snippetId,
      ...owners
    );
    if (changes === 0) throw new HttpError(404, 'Snippet not found.');
    return { message: 'Snippet deleted' };
  });
}
