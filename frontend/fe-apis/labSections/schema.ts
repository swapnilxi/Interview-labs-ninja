/**
 * fe-apis/labSections/schema.ts
 *
 * TypeScript port of backend/modules/lab_sections/schema.py -- keep the two in sync.
 * Runs once per process from `withLabDb`; CREATE ... IF NOT EXISTS, so a DB the Python backend
 * already migrated is left alone.
 */

import type { TodoDb } from '../todo/_shared';

export function ensureLabSectionsSchema(db: TodoDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_section_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT NULL,
      lab_name TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      subtopic_id TEXT NOT NULL DEFAULT '',
      section_id TEXT NOT NULL,
      content TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'regenerate',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, lab_name, topic_id, subtopic_id, section_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lab_section_content_user_id ON lab_section_content(user_id);

    CREATE TABLE IF NOT EXISTS lab_quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT NULL,
      lab_name TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      subtopic_id TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      answer INTEGER NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lab_quiz_questions_page ON lab_quiz_questions(user_id, lab_name, topic_id, subtopic_id);

    CREATE TABLE IF NOT EXISTS lab_page_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT NULL,
      lab_name TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      subtopic_id TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, lab_name, topic_id, subtopic_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lab_page_progress_user_lab ON lab_page_progress(user_id, lab_name);

    CREATE TABLE IF NOT EXISTS lab_section_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT NULL,
      lab_name TEXT NOT NULL,
      section_id TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      addon TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, lab_name, section_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lab_section_settings_user_lab ON lab_section_settings(user_id, lab_name);
  `);
  addProjectColumns(db);
}

/**
 * `project_id`: the Labs Project a generated body / quiz question was written for (NULL = no project).
 * It keeps one project's text out of another project's (or a general) generation; deleting a project
 * leaves its id on the rows on purpose (ids are never reused). Port of schema.add_project_columns.
 */
function addProjectColumns(db: TodoDb): void {
  for (const table of ['lab_section_content', 'lab_quiz_questions']) {
    const columns = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name);
    if (!columns.includes('project_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN project_id INTEGER DEFAULT NULL`);
    }
  }
}
