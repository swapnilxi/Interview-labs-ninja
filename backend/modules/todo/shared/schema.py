"""SQLite schema registration for the tasks table."""

from __future__ import annotations


def register(cursor) -> None:
    """Create the tasks table and other related tables if they do not exist, and run safe migrations."""
    cursor.execute("""
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
    """)

    # Safe migrations — add columns to tasks if they don't exist yet
    cursor.execute("PRAGMA table_info(tasks);")
    columns = [row[1] for row in cursor.fetchall()]

    if "context" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN context TEXT DEFAULT NULL;")
    if "attachments" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN attachments TEXT DEFAULT NULL;")
    if "generation_type" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN generation_type TEXT NOT NULL DEFAULT 'manual';")
    if "depth_level" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN depth_level INTEGER NOT NULL DEFAULT 1;")
    if "due_date" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT NULL;")
    if "last_activity_at" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN last_activity_at TEXT DEFAULT NULL;")
    if "is_recurring" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN is_recurring INTEGER DEFAULT 0;")
    if "recurrence_interval" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN recurrence_interval TEXT DEFAULT NULL;")
    if "recurrence_custom_days" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN recurrence_custom_days TEXT DEFAULT NULL;")
    if "recurrence_template_id" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN recurrence_template_id INTEGER DEFAULT NULL;")
    if "intention" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN intention TEXT DEFAULT NULL;")
    if "definition_of_done" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN definition_of_done TEXT DEFAULT NULL;")
    if "eisenhower_quadrant" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN eisenhower_quadrant TEXT DEFAULT NULL;")
    if "user_id" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN user_id INTEGER DEFAULT NULL;")

    # Create daily_plans table
    cursor.execute("""
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
    """)

    # Migration: daily_plans used to have a global UNIQUE(plan_date). Recreate
    # with a composite UNIQUE(user_id, plan_date) so each user can have their
    # own plan for the same date.
    cursor.execute("PRAGMA table_info(daily_plans);")
    daily_plans_cols = [row[1] for row in cursor.fetchall()]
    if "user_id" not in daily_plans_cols:
        cursor.execute("""
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
        """)
        cursor.execute("""
            INSERT INTO daily_plans_new (id, plan_date, available_hours, task_ids, reasoning, summary, created_at, updated_at, user_id)
            SELECT id, plan_date, available_hours, task_ids, reasoning, summary, created_at, updated_at, NULL FROM daily_plans
        """)
        cursor.execute("DROP TABLE daily_plans")
        cursor.execute("ALTER TABLE daily_plans_new RENAME TO daily_plans")

    # Create inbox table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("PRAGMA table_info(inbox);")
    if "user_id" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE inbox ADD COLUMN user_id INTEGER DEFAULT NULL;")

    # Create task_notes table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS task_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            note_type TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("PRAGMA table_info(task_notes);")
    if "user_id" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE task_notes ADD COLUMN user_id INTEGER DEFAULT NULL;")

    # Create user_stats table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stats_date TEXT NOT NULL UNIQUE,
            completed_count INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Safe migration: user_stats might have been created with 'stats_date' but code uses 'date'
    # Check if 'date' column exists; if not, add it as an alias-style migration
    cursor.execute("PRAGMA table_info(user_stats);")
    stats_cols = [row[1] for row in cursor.fetchall()]
    if "date" not in stats_cols and "stats_date" in stats_cols:
        # SQLite doesn't support RENAME COLUMN in old versions, so we recreate
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_stats_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                completed_count INTEGER DEFAULT 0,
                streak INTEGER DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        cursor.execute("""
            INSERT OR IGNORE INTO user_stats_new (id, date, completed_count, streak, created_at, updated_at)
            SELECT id, stats_date, completed_count, streak, created_at, updated_at FROM user_stats
        """)
        cursor.execute("DROP TABLE user_stats")
        cursor.execute("ALTER TABLE user_stats_new RENAME TO user_stats")

    # Migration: user_stats used to have a global UNIQUE(date). Recreate with a
    # composite UNIQUE(user_id, date) so each user tracks their own stats.
    cursor.execute("PRAGMA table_info(user_stats);")
    stats_cols = [row[1] for row in cursor.fetchall()]
    if "user_id" not in stats_cols:
        cursor.execute("""
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
        """)
        cursor.execute("""
            INSERT INTO user_stats_new (id, date, completed_count, streak, created_at, updated_at, user_id)
            SELECT id, date, completed_count, streak, created_at, updated_at, NULL FROM user_stats
        """)
        cursor.execute("DROP TABLE user_stats")
        cursor.execute("ALTER TABLE user_stats_new RENAME TO user_stats")

    # Create handwriting_extractions table
    cursor.execute("""
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
    """)
    cursor.execute("PRAGMA table_info(handwriting_extractions);")
    if "user_id" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE handwriting_extractions ADD COLUMN user_id INTEGER DEFAULT NULL;")

    # ── Quick Daily tables ─────────────────────────────────────────────────────
    cursor.execute("""
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
    """)
    cursor.execute("PRAGMA table_info(quick_tasks);")
    if "user_id" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN user_id INTEGER DEFAULT NULL;")

    cursor.execute("""
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
    """)
    cursor.execute("PRAGMA table_info(quick_tasks_archive);")
    if "user_id" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE quick_tasks_archive ADD COLUMN user_id INTEGER DEFAULT NULL;")

    # ── Plan & Project tables ──────────────────────────────────────────────────
    cursor.execute("""
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
    """)
    cursor.execute("PRAGMA table_info(projects);")
    if "user_id" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE projects ADD COLUMN user_id INTEGER DEFAULT NULL;")

    cursor.execute("""
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
    """)
    cursor.execute("PRAGMA table_info(project_nodes);")
    if "user_id" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN user_id INTEGER DEFAULT NULL;")

    cursor.execute("""
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
    """)

    # Safe migrations — add columns to goal_nodes if they don't exist yet
    cursor.execute("PRAGMA table_info(goal_nodes);")
    if "attachments" not in [row[1] for row in cursor.fetchall()]:
        cursor.execute("ALTER TABLE goal_nodes ADD COLUMN attachments TEXT DEFAULT NULL;")

    # Create indices
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_handwriting_task_id ON handwriting_extractions(task_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quick_tasks_date ON quick_tasks(date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quick_archive_date ON quick_tasks_archive(date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_project_nodes_project ON project_nodes(project_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_project_nodes_parent ON project_nodes(parent_node_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inbox_user_id ON inbox(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_task_notes_user_id ON task_notes(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quick_tasks_user_id ON quick_tasks(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quick_archive_user_id ON quick_tasks_archive(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_project_nodes_user_id ON project_nodes(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_goal_nodes_user_id ON goal_nodes(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_goal_nodes_parent_id ON goal_nodes(parent_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_plans_user_id ON daily_plans(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);")

    # ── 80/20 Principle Migrations ─────────────────────────────────────────────
    # Safe migrations to add pareto_score and is_top_20 to all task tables

    # 1. tasks table
    if "pareto_score" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN is_top_20 INTEGER DEFAULT 0;")
    if "pareto_reason" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN pareto_reason TEXT DEFAULT NULL;")
    if "pareto_locked" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN pareto_locked INTEGER DEFAULT 0;")

    # 2. quick_tasks table
    cursor.execute("PRAGMA table_info(quick_tasks);")
    qt_cols = [row[1] for row in cursor.fetchall()]
    if "pareto_score" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN is_top_20 INTEGER DEFAULT 0;")
    if "due_date" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN due_date TEXT DEFAULT NULL;")
    if "time_estimate" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN time_estimate TEXT DEFAULT NULL;")
    # Non-destructive export tracking: keep quick_tasks row when moved to Smart/Plan
    if "exported_task_id" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN exported_task_id INTEGER DEFAULT NULL;")
    if "exported_project_id" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN exported_project_id INTEGER DEFAULT NULL;")
    if "is_exported" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN is_exported INTEGER DEFAULT 0;")
    if "context" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN context TEXT DEFAULT NULL;")
    if "pareto_reason" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN pareto_reason TEXT DEFAULT NULL;")
    if "pareto_locked" not in qt_cols:
        cursor.execute("ALTER TABLE quick_tasks ADD COLUMN pareto_locked INTEGER DEFAULT 0;")

    # 2b. quick_tasks_archive table — preserve done/pareto data instead of losing it on archive
    cursor.execute("PRAGMA table_info(quick_tasks_archive);")
    qta_cols = [row[1] for row in cursor.fetchall()]
    if "done" not in qta_cols:
        cursor.execute("ALTER TABLE quick_tasks_archive ADD COLUMN done INTEGER DEFAULT 0;")
    if "pareto_score" not in qta_cols:
        cursor.execute("ALTER TABLE quick_tasks_archive ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in qta_cols:
        cursor.execute("ALTER TABLE quick_tasks_archive ADD COLUMN is_top_20 INTEGER DEFAULT 0;")

    # 3. project_nodes table
    cursor.execute("PRAGMA table_info(project_nodes);")
    pn_cols = [row[1] for row in cursor.fetchall()]
    if "pareto_score" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN is_top_20 INTEGER DEFAULT 0;")
    if "eisenhower_quadrant" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN eisenhower_quadrant TEXT DEFAULT 'schedule';")
    if "context" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN context TEXT DEFAULT NULL;")
    if "due_date" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN due_date TEXT DEFAULT NULL;")
    if "time_estimate" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN time_estimate TEXT DEFAULT NULL;")
    if "intention" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN intention TEXT DEFAULT NULL;")
    if "definition_of_done" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN definition_of_done TEXT DEFAULT NULL;")
    if "pareto_reason" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN pareto_reason TEXT DEFAULT NULL;")
    if "pareto_locked" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN pareto_locked INTEGER DEFAULT 0;")

    # 4. projects table — add pareto + is_top_20 if missing
    cursor.execute("PRAGMA table_info(projects);")
    proj_cols = [row[1] for row in cursor.fetchall()]
    if "pareto_score" not in proj_cols:
        cursor.execute("ALTER TABLE projects ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in proj_cols:
        cursor.execute("ALTER TABLE projects ADD COLUMN is_top_20 INTEGER DEFAULT 0;")
    if "pareto_reason" not in proj_cols:
        cursor.execute("ALTER TABLE projects ADD COLUMN pareto_reason TEXT DEFAULT NULL;")
    if "pareto_locked" not in proj_cols:
        cursor.execute("ALTER TABLE projects ADD COLUMN pareto_locked INTEGER DEFAULT 0;")
