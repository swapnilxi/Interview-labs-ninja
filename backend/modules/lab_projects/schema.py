from __future__ import annotations
import sqlite3


def create_tables(cursor: sqlite3.Cursor) -> None:
    # A "Labs Project": a named body of background (`context`) that the labs can generate against.
    # `status` is 'active' or 'archived' (archived projects are hidden from the labs' selectors and
    # take no new sections, but nothing is deleted). Every row belongs to exactly one user.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lab_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            context TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lab_projects_user ON lab_projects(user_id, status);")

    # A response the user chose to keep ("Save to Project"). It is a copy: regenerating or editing the
    # lab page afterwards never changes it. `source_generation_id` points back at the lab page and
    # section it came from ('lab|topic|subtopic|section@<generated at>'); it is NULL for content that
    # has no such origin. Deleting a project deletes its sections (the store does it explicitly).
    cursor.execute("""
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
        )
    """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_lab_project_sections_project ON lab_project_sections(project_id, updated_at);"
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lab_project_sections_user ON lab_project_sections(user_id);")


def register(cursor: sqlite3.Cursor) -> None:
    """Create tables. Called from init_db."""
    create_tables(cursor)
