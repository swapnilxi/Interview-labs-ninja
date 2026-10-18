/**
 * fe-apis/labProjects/schema.ts
 *
 * TypeScript port of backend/modules/lab_projects/schema.py -- keep the two in sync.
 * Runs once per process from `withLabProjectsDb`; CREATE ... IF NOT EXISTS, so a DB the Python
 * backend already migrated is left alone.
 */

import type { TodoDb } from '../todo/_shared';

export function ensureLabProjectsSchema(db: TodoDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lab_projects_user ON lab_projects(user_id, status);

    CREATE TABLE IF NOT EXISTS lab_project_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_lab_id TEXT NOT NULL,
      source_lab_name TEXT NOT NULL,
      source_generation_id TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lab_project_sections_project ON lab_project_sections(project_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_lab_project_sections_user ON lab_project_sections(user_id);
  `);
}
