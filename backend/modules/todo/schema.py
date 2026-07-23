"""SQLite schema registration for the tasks table."""

from __future__ import annotations


def register(cursor) -> None:
    """Create the tasks table if it does not exist and run migrations."""
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
            FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    """)

    # Safe migrations — add columns if they don't exist yet
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

<<<<<<< HEAD
=======
    # Create daily_plans table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_date TEXT NOT NULL UNIQUE,
            available_hours REAL NOT NULL,
            task_ids TEXT NOT NULL,       -- JSON list of integers
            reasoning TEXT,               -- JSON map of task_id to reasoning
            summary TEXT DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Create inbox table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

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

    # Create indices
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_handwriting_task_id ON handwriting_extractions(task_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quick_tasks_date ON quick_tasks(date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quick_archive_date ON quick_tasks_archive(date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_project_nodes_project ON project_nodes(project_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_project_nodes_parent ON project_nodes(parent_node_id);")

    # ── 80/20 Principle Migrations ─────────────────────────────────────────────
    # Safe migrations to add pareto_score and is_top_20 to all task tables

    # 1. tasks table
    if "pareto_score" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN is_top_20 INTEGER DEFAULT 0;")

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

    # 3. project_nodes table
    cursor.execute("PRAGMA table_info(project_nodes);")
    pn_cols = [row[1] for row in cursor.fetchall()]
    if "pareto_score" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN is_top_20 INTEGER DEFAULT 0;")
    if "eisenhower_quadrant" not in pn_cols:
        cursor.execute("ALTER TABLE project_nodes ADD COLUMN eisenhower_quadrant TEXT DEFAULT 'schedule';")

    # 4. projects table — add pareto + is_top_20 if missing
    cursor.execute("PRAGMA table_info(projects);")
    proj_cols = [row[1] for row in cursor.fetchall()]
    if "pareto_score" not in proj_cols:
        cursor.execute("ALTER TABLE projects ADD COLUMN pareto_score REAL DEFAULT NULL;")
    if "is_top_20" not in proj_cols:
        cursor.execute("ALTER TABLE projects ADD COLUMN is_top_20 INTEGER DEFAULT 0;")
>>>>>>> f2f3bfe (ai-to-do)
