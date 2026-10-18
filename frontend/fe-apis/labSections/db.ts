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
  /** The Labs Project this body was written for (null = none). */
  projectId: number | null;
}

export interface QuizQuestion {
  id?: number;
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}

function sectionRow(row: Row): SavedSection {
  return {
    content: row.content,
    context: row.context,
    mode: row.mode,
    updatedAt: row.updated_at,
    projectId: row.project_id ?? null,
  };
}

/** [saved?, project_id] of the stored body for one page-section; project_id is null for a general one. */
export function fetchSectionProject(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  sectionId: string
): [boolean, number | null] {
  return withLabDb((db) => {
    const row = db.get(
      `SELECT project_id FROM lab_section_content
       WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND section_id = ?`,
      userId,
      lab,
      topicId,
      subtopicId,
      sectionId
    );
    return row ? [true, row.project_id ?? null] : [false, null];
  });
}

export function fetchSavedSections(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string
): Record<string, SavedSection> {
  return withLabDb((db) => {
    const rows = db.all(
      `SELECT section_id, content, context, mode, updated_at, project_id
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
  mode: string,
  projectId: number | null = null
): SavedSection {
  return withLabDb((db) => {
    db.run(
      `INSERT INTO lab_section_content
         (user_id, lab_name, topic_id, subtopic_id, section_id, content, context, mode, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lab_name, topic_id, subtopic_id, section_id) DO UPDATE SET
         content = excluded.content,
         context = excluded.context,
         mode = excluded.mode,
         project_id = excluded.project_id,
         updated_at = datetime('now')`,
      userId,
      lab,
      topicId,
      subtopicId,
      sectionId,
      content,
      context,
      mode,
      projectId
    );
    const row = db.get(
      `SELECT content, context, mode, updated_at, project_id FROM lab_section_content
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

/**
 * The page's earlier questions the model may be shown as "already seen" for a generation under `projectId`:
 * those written for no project plus those for this same project, never another project's. With a null
 * `projectId` (no project) only the project-less ones.
 */
export function fetchQuizQuestionsForPrompt(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  projectId: number | null
): QuizQuestion[] {
  return withLabDb((db) =>
    db
      .all(
        `SELECT id, question, options_json, answer, explanation FROM lab_quiz_questions
         WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
           AND (project_id IS NULL OR project_id = ?)
         ORDER BY id`,
        userId,
        lab,
        topicId,
        subtopicId,
        projectId
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
  questions: QuizQuestion[],
  projectId: number | null = null
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
             (user_id, lab_name, topic_id, subtopic_id, question, options_json, answer, explanation, project_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          userId,
          lab,
          topicId,
          subtopicId,
          q.q,
          JSON.stringify(q.options),
          q.answer,
          q.explanation,
          projectId
        );
        added.push({ ...q, id: res.lastInsertRowid });
      }
      return added;
    })
  );
}

export interface ProgressItem {
  topicId: string;
  subtopicId: string;
  completedAt: string;
}

/** Every page of the lab the user has marked complete, oldest first. */
export function fetchProgress(userId: number, lab: string): ProgressItem[] {
  return withLabDb((db) =>
    db
      .all(
        `SELECT topic_id, subtopic_id, completed_at FROM lab_page_progress
         WHERE user_id = ? AND lab_name = ?
         ORDER BY completed_at, id`,
        userId,
        lab
      )
      .map((r) => ({ topicId: r.topic_id, subtopicId: r.subtopic_id, completedAt: r.completed_at }))
  );
}

/** Mark a page complete or not. Idempotent; completing twice keeps the first completion time. */
export function setProgress(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  completed: boolean
) {
  return withLabDb((db) => {
    let completedAt: string | null = null;
    if (completed) {
      db.run(
        `INSERT INTO lab_page_progress (user_id, lab_name, topic_id, subtopic_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, lab_name, topic_id, subtopic_id) DO NOTHING`,
        userId,
        lab,
        topicId,
        subtopicId
      );
      completedAt = db.get(
        `SELECT completed_at FROM lab_page_progress
         WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?`,
        userId,
        lab,
        topicId,
        subtopicId
      )!.completed_at;
    } else {
      db.run(
        'DELETE FROM lab_page_progress WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?',
        userId,
        lab,
        topicId,
        subtopicId
      );
    }
    return { topicId, subtopicId, completed, completedAt };
  });
}

export interface SectionSettings {
  prompt: string;
  addon: string;
  context: string;
  updatedAt: string | null;
}

/** The user's customised sections for a lab, keyed by section id ('*' = the lab-wide row). */
export function fetchSettings(userId: number, lab: string): Record<string, SectionSettings> {
  return withLabDb((db) =>
    Object.fromEntries(
      db
        .all(
          'SELECT section_id, prompt, addon, context, updated_at FROM lab_section_settings WHERE user_id = ? AND lab_name = ?',
          userId,
          lab
        )
        .map((r) => [
          r.section_id as string,
          { prompt: r.prompt, addon: r.addon, context: r.context, updatedAt: r.updated_at },
        ])
    )
  );
}

/** Save one section's settings; all three fields empty removes the row (back to the defaults). */
export function saveSettings(
  userId: number,
  lab: string,
  sectionId: string,
  promptIn: string,
  addonIn: string,
  contextIn: string
) {
  const prompt = promptIn.trim();
  const addon = addonIn.trim();
  const context = contextIn.trim();
  return withLabDb((db) => {
    if (!(prompt || addon || context)) {
      db.run(
        'DELETE FROM lab_section_settings WHERE user_id = ? AND lab_name = ? AND section_id = ?',
        userId,
        lab,
        sectionId
      );
      return { sectionId, prompt: '', addon: '', context: '', updatedAt: null };
    }
    db.run(
      `INSERT INTO lab_section_settings (user_id, lab_name, section_id, prompt, addon, context)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lab_name, section_id) DO UPDATE SET
         prompt = excluded.prompt,
         addon = excluded.addon,
         context = excluded.context,
         updated_at = datetime('now')`,
      userId,
      lab,
      sectionId,
      prompt,
      addon,
      context
    );
    const row = db.get(
      'SELECT updated_at FROM lab_section_settings WHERE user_id = ? AND lab_name = ? AND section_id = ?',
      userId,
      lab,
      sectionId
    )!;
    return { sectionId, prompt, addon, context, updatedAt: row.updated_at };
  });
}

/** Delete settings for one section or reset all settings for the lab back to defaults. */
export function resetSettings(userId: number, lab: string, sectionId?: string) {
  return withLabDb((db) => {
    // One section ('*' = just the lab-wide row), or every setting of the lab ('all' / undefined).
    if (sectionId && sectionId !== 'all') {
      db.run(
        'DELETE FROM lab_section_settings WHERE user_id = ? AND lab_name = ? AND section_id = ?',
        userId,
        lab,
        sectionId
      );
    } else {
      db.run('DELETE FROM lab_section_settings WHERE user_id = ? AND lab_name = ?', userId, lab);
    }
    return { ok: true };
  });
}
