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
  `);
}
