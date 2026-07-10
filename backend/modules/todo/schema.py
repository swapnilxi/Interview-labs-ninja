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

