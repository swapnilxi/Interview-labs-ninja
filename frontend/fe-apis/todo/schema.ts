/**
 * fe-apis/todo/schema.ts
 *
 * TypeScript port of backend/modules/ai_todo/shared/schema.py -- keep the two in sync.
 * Runs once per process from `withTodoDb`, usually against a DB the Python backend has
 * already migrated, so every step is idempotent (a no-op when already applied).
 */

import type { TodoDb } from './_shared';

/** Column names of a table (`PRAGMA table_info` → row[1]). */
function columnsOf(db: TodoDb, table: string): string[] {
  return db.all<{ name: string }>(`PRAGMA table_info(${table});`).map((r) => r.name);
}

/** `if name not in cols: ALTER TABLE table ADD COLUMN name decl`. */
function addColumnIfMissing(db: TodoDb, table: string, cols: string[], name: string, decl: string): void {
  if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl};`);
}

/**
 * Port of `register(cursor)`. The table rebuilds (daily_plans_new, user_stats_new) run in
 * a transaction so a failure can't leave the original table dropped; everything else
 * is CREATE ... IF NOT EXISTS / guarded ADD COLUMN, so a migrated (or read-only) DB is untouched.
 */
export function ensureTodoSchema(db: TodoDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'p3',
      time_estimate TEXT DEFAULT NULL,
      due_date TEXT DEFAULT NULL,
      generation_type TEXT NOT NULL DEFAULT 'manual',
      depth_level INTEGER NOT NULL DEFAULT 1,
      context TEXT DEFAULT NULL,
      attachments TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at TEXT DEFAULT NULL,
      is_recurring INTEGER DEFAULT 0,
      recurrence_interval TEXT DEFAULT NULL,
      recurrence_custom_days TEXT DEFAULT NULL,
      recurrence_template_id INTEGER DEFAULT NULL,
      intention TEXT DEFAULT NULL,
      definition_of_done TEXT DEFAULT NULL,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  // Safe migrations — add columns to tasks if they don't exist yet
  const columns = columnsOf(db, 'tasks');
  addColumnIfMissing(db, 'tasks', columns, 'context', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'attachments', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'generation_type', "TEXT NOT NULL DEFAULT 'manual'");
  addColumnIfMissing(db, 'tasks', columns, 'depth_level', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'tasks', columns, 'due_date', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'last_activity_at', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'is_recurring', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'tasks', columns, 'recurrence_interval', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'recurrence_custom_days', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'recurrence_template_id', 'INTEGER DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'intention', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'definition_of_done', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'eisenhower_quadrant', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'user_id', 'INTEGER DEFAULT NULL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL,
      available_hours REAL NOT NULL,
      task_ids TEXT NOT NULL,       -- JSON list of integers
      reasoning TEXT,               -- JSON map of task_id to reasoning
      summary TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER DEFAULT NULL,
      UNIQUE(user_id, plan_date)
    )
  `);

  // Migration: daily_plans used to have a global UNIQUE(plan_date). Recreate with a
  // composite UNIQUE(user_id, plan_date) so each user can have their own plan per date.
  if (!columnsOf(db, 'daily_plans').includes('user_id')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE daily_plans_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_date TEXT NOT NULL,
          available_hours REAL NOT NULL,
          task_ids TEXT NOT NULL,
          reasoning TEXT,
          summary TEXT DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          user_id INTEGER DEFAULT NULL,
          UNIQUE(user_id, plan_date)
        )
      `);
      db.exec(`
        INSERT INTO daily_plans_new (id, plan_date, available_hours, task_ids, reasoning, summary, created_at, updated_at, user_id)
        SELECT id, plan_date, available_hours, task_ids, reasoning, summary, created_at, updated_at, NULL FROM daily_plans
      `);
      db.exec('DROP TABLE daily_plans');
      db.exec('ALTER TABLE daily_plans_new RENAME TO daily_plans');
    });
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  addColumnIfMissing(db, 'inbox', columnsOf(db, 'inbox'), 'user_id', 'INTEGER DEFAULT NULL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      note_type TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);
  addColumnIfMissing(db, 'task_notes', columnsOf(db, 'task_notes'), 'user_id', 'INTEGER DEFAULT NULL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stats_date TEXT NOT NULL UNIQUE,
      completed_count INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: user_stats might have been created with 'stats_date' but code uses 'date'.
  let statsCols = columnsOf(db, 'user_stats');
  if (!statsCols.includes('date') && statsCols.includes('stats_date')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_stats_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          completed_count INTEGER DEFAULT 0,
          streak INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        INSERT OR IGNORE INTO user_stats_new (id, date, completed_count, streak, created_at, updated_at)
        SELECT id, stats_date, completed_count, streak, created_at, updated_at FROM user_stats
      `);
      db.exec('DROP TABLE user_stats');
      db.exec('ALTER TABLE user_stats_new RENAME TO user_stats');
    });
  }

  // Migration: user_stats used to have a global UNIQUE(date). Recreate with a composite
  // UNIQUE(user_id, date) so each user tracks their own stats.
  statsCols = columnsOf(db, 'user_stats');
  if (!statsCols.includes('user_id')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE user_stats_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          completed_count INTEGER DEFAULT 0,
          streak INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          user_id INTEGER DEFAULT NULL,
          UNIQUE(user_id, date)
        )
      `);
      db.exec(`
        INSERT INTO user_stats_new (id, date, completed_count, streak, created_at, updated_at, user_id)
        SELECT id, date, completed_count, streak, created_at, updated_at, NULL FROM user_stats
      `);
      db.exec('DROP TABLE user_stats');
      db.exec('ALTER TABLE user_stats_new RENAME TO user_stats');
    });
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS handwriting_extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER DEFAULT NULL,
      original_filename TEXT,
      extracted_text TEXT,
      vision_model_used TEXT,
      confidence_note TEXT,
      extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT DEFAULT 'task_context',
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    )
  `);
  addColumnIfMissing(db, 'handwriting_extractions', columnsOf(db, 'handwriting_extractions'), 'user_id', 'INTEGER DEFAULT NULL');

  // ── Quick Daily tables ─────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS quick_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      quadrant TEXT DEFAULT 'do_now',
      date TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      original_task_id INTEGER DEFAULT NULL,
      order_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  addColumnIfMissing(db, 'quick_tasks', columnsOf(db, 'quick_tasks'), 'user_id', 'INTEGER DEFAULT NULL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS quick_tasks_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER,
      title TEXT NOT NULL,
      quadrant TEXT DEFAULT 'do_now',
      date TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      original_task_id INTEGER DEFAULT NULL,
      archived_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  addColumnIfMissing(db, 'quick_tasks_archive', columnsOf(db, 'quick_tasks_archive'), 'user_id', 'INTEGER DEFAULT NULL');

  // ── Plan & Project tables ──────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      priority TEXT DEFAULT 'p3',
      eisenhower_quadrant TEXT DEFAULT 'schedule',
      due_date TEXT,
      color TEXT,
      icon TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  addColumnIfMissing(db, 'projects', columnsOf(db, 'projects'), 'user_id', 'INTEGER DEFAULT NULL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      parent_node_id INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      node_type TEXT DEFAULT 'topic',
      generation_type TEXT DEFAULT 'manual',
      depth_level INTEGER DEFAULT 1,
      exported_to_smart_todo INTEGER DEFAULT 0,
      exported_task_id INTEGER DEFAULT NULL,
      exported_to_quick INTEGER DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_node_id) REFERENCES project_nodes(id) ON DELETE CASCADE
    )
  `);
  addColumnIfMissing(db, 'project_nodes', columnsOf(db, 'project_nodes'), 'user_id', 'INTEGER DEFAULT NULL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS goal_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      title TEXT NOT NULL,
      description TEXT,
      level TEXT NOT NULL DEFAULT 'daily',
      status TEXT DEFAULT 'backlog',
      priority TEXT DEFAULT 'p3',
      due_date TEXT,
      generation_type TEXT DEFAULT 'manual',
      depth_level INTEGER DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      exported_to_smart_todo INTEGER DEFAULT 0,
      exported_task_id INTEGER DEFAULT NULL,
      exported_to_quick INTEGER DEFAULT 0,
      exported_quick_task_id INTEGER DEFAULT NULL,
      exported_to_plan INTEGER DEFAULT 0,
      exported_project_id INTEGER DEFAULT NULL,
      attachments TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES goal_nodes(id) ON DELETE CASCADE
    )
  `);
  addColumnIfMissing(db, 'goal_nodes', columnsOf(db, 'goal_nodes'), 'attachments', 'TEXT DEFAULT NULL');

  // Indices
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id);
    CREATE INDEX IF NOT EXISTS idx_handwriting_task_id ON handwriting_extractions(task_id);
    CREATE INDEX IF NOT EXISTS idx_quick_tasks_date ON quick_tasks(date);
    CREATE INDEX IF NOT EXISTS idx_quick_archive_date ON quick_tasks_archive(date);
    CREATE INDEX IF NOT EXISTS idx_project_nodes_project ON project_nodes(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_nodes_parent ON project_nodes(parent_node_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_inbox_user_id ON inbox(user_id);
    CREATE INDEX IF NOT EXISTS idx_task_notes_user_id ON task_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_quick_tasks_user_id ON quick_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_quick_archive_user_id ON quick_tasks_archive(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_nodes_user_id ON project_nodes(user_id);
    CREATE INDEX IF NOT EXISTS idx_goal_nodes_user_id ON goal_nodes(user_id);
    CREATE INDEX IF NOT EXISTS idx_goal_nodes_parent_id ON goal_nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_daily_plans_user_id ON daily_plans(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
  `);

  // ── 80/20 Principle migrations ─────────────────────────────────────────────
  // 1. tasks (checked against the column list read above, as Python does)
  addColumnIfMissing(db, 'tasks', columns, 'pareto_score', 'REAL DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'is_top_20', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'tasks', columns, 'pareto_reason', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'tasks', columns, 'pareto_locked', 'INTEGER DEFAULT 0');

  // 2. quick_tasks
  const qtCols = columnsOf(db, 'quick_tasks');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'pareto_score', 'REAL DEFAULT NULL');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'is_top_20', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'due_date', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'time_estimate', 'TEXT DEFAULT NULL');
  // Non-destructive export tracking: keep quick_tasks row when moved to Smart/Plan
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'exported_task_id', 'INTEGER DEFAULT NULL');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'exported_project_id', 'INTEGER DEFAULT NULL');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'is_exported', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'context', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'pareto_reason', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'quick_tasks', qtCols, 'pareto_locked', 'INTEGER DEFAULT 0');

  // 2b. quick_tasks_archive — preserve done/pareto data instead of losing it on archive
  const qtaCols = columnsOf(db, 'quick_tasks_archive');
  addColumnIfMissing(db, 'quick_tasks_archive', qtaCols, 'done', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'quick_tasks_archive', qtaCols, 'pareto_score', 'REAL DEFAULT NULL');
  addColumnIfMissing(db, 'quick_tasks_archive', qtaCols, 'is_top_20', 'INTEGER DEFAULT 0');

  // 3. project_nodes
  const pnCols = columnsOf(db, 'project_nodes');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'pareto_score', 'REAL DEFAULT NULL');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'is_top_20', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'eisenhower_quadrant', "TEXT DEFAULT 'schedule'");
  addColumnIfMissing(db, 'project_nodes', pnCols, 'context', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'due_date', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'time_estimate', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'intention', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'definition_of_done', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'pareto_reason', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'project_nodes', pnCols, 'pareto_locked', 'INTEGER DEFAULT 0');

  // 4. projects
  const projCols = columnsOf(db, 'projects');
  addColumnIfMissing(db, 'projects', projCols, 'pareto_score', 'REAL DEFAULT NULL');
  addColumnIfMissing(db, 'projects', projCols, 'is_top_20', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'projects', projCols, 'pareto_reason', 'TEXT DEFAULT NULL');
  addColumnIfMissing(db, 'projects', projCols, 'pareto_locked', 'INTEGER DEFAULT 0');
}
