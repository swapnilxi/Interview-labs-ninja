/**
 * fe-apis/labSections/db.ts
 *
 * Port of backend/modules/lab_sections/store.py. Synchronous, run inside `withLabDb`
 * (never `await` inside the callback -- node:sqlite is synchronous).
 */

import { withTodoDb, parseJson, type Row, type TodoDb } from '../todo/_shared';
import { ensureLabSectionsSchema } from './schema';

let schemaReady = false;

/** `withTodoDb` (one connection, busy_timeout, re-entrant) plus this module's tables, created once per process. */
export function withLabDb<T>(fn: (db: TodoDb) => T): T {
  return withTodoDb((db) => {
    if (!schemaReady) {
      ensureLabSectionsSchema(db);
      schemaReady = true;
    }
    return fn(db);
  });
}

export interface SavedSection {
  content: string;
  context: string;
  mode: string;
  updatedAt: string;
}

export interface QuizQuestion {
  id?: number;
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}

function sectionRow(row: Row): SavedSection {
  return { content: row.content, context: row.context, mode: row.mode, updatedAt: row.updated_at };
}

export function fetchSavedSections(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string
): Record<string, SavedSection> {
  return withLabDb((db) => {
    const rows = db.all(
      `SELECT section_id, content, context, mode, updated_at
       FROM lab_section_content
       WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?`,
      userId,
      lab,
      topicId,
      subtopicId
    );
    return Object.fromEntries(rows.map((r) => [r.section_id as string, sectionRow(r)]));
  });
}

export function saveSection(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  sectionId: string,
  content: string,
  context: string,
  mode: string
): SavedSection {
  return withLabDb((db) => {
    db.run(
      `INSERT INTO lab_section_content
         (user_id, lab_name, topic_id, subtopic_id, section_id, content, context, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lab_name, topic_id, subtopic_id, section_id) DO UPDATE SET
         content = excluded.content,
         context = excluded.context,
         mode = excluded.mode,
         updated_at = datetime('now')`,
      userId,
      lab,
      topicId,
      subtopicId,
      sectionId,
      content,
      context,
      mode
    );
    const row = db.get(
      `SELECT content, context, mode, updated_at FROM lab_section_content
       WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND section_id = ?`,
      userId,
      lab,
      topicId,
      subtopicId,
      sectionId
    )!;
    return sectionRow(row);
  });
}

function quizRow(row: Row): QuizQuestion {
  return {
    id: row.id,
    q: row.question,
    options: parseJson<string[]>(row.options_json, []),
    answer: row.answer,
    explanation: row.explanation,
  };
}

export function fetchQuizQuestions(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string
): QuizQuestion[] {
  return withLabDb((db) =>
    db
      .all(
        `SELECT id, question, options_json, answer, explanation FROM lab_quiz_questions
         WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
         ORDER BY id`,
        userId,
        lab,
        topicId,
        subtopicId
      )
      .map(quizRow)
  );
}

/** Append questions to the page's quiz, skipping any whose text is already there. Returns the ones added. */
export function addQuizQuestions(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  questions: QuizQuestion[]
): QuizQuestion[] {
  return withLabDb((db) =>
    db.transaction(() => {
      const existing = new Set(
        db
          .all<{ question: string }>(
            'SELECT question FROM lab_quiz_questions WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?',
            userId,
            lab,
            topicId,
            subtopicId
          )
          .map((r) => r.question.trim().toLowerCase())
      );
      const added: QuizQuestion[] = [];
      for (const q of questions) {
        const key = q.q.trim().toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        const res = db.run(
          `INSERT INTO lab_quiz_questions
             (user_id, lab_name, topic_id, subtopic_id, question, options_json, answer, explanation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          userId,
          lab,
          topicId,
          subtopicId,
          q.q,
          JSON.stringify(q.options),
          q.answer,
          q.explanation
        );
        added.push({ ...q, id: res.lastInsertRowid });
      }
      return added;
    })
  );
}
