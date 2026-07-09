from __future__ import annotations
import sqlite3

CATEGORY_LAB = "linkedin-category"

DEFAULT_CATEGORIES = [
    "Artificial Intelligence",
    "Software Engineering",
    "Career",
    "Leadership",
    "Entrepreneurship",
    "Product",
    "Startup",
    "Learning",
    "Personal Story",
    "Achievement",
    "Educational",
    "Thought Leadership",
    "Other",
]


def create_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS linkedin_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            content TEXT NOT NULL,
            style_analysis TEXT,
            tags TEXT,
            tone TEXT,
            post_type TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # migrations for DBs created before description/tags/favorite/updated_at existed
    cursor.execute("PRAGMA table_info(linkedin_templates);")
    columns = [row[1] for row in cursor.fetchall()]
    if "description" not in columns:
        cursor.execute("ALTER TABLE linkedin_templates ADD COLUMN description TEXT;")
    if "tags" not in columns:
        cursor.execute("ALTER TABLE linkedin_templates ADD COLUMN tags TEXT;")
    if "is_favorite" not in columns:
        cursor.execute("ALTER TABLE linkedin_templates ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;")
    if "updated_at" not in columns:
        cursor.execute("ALTER TABLE linkedin_templates ADD COLUMN updated_at TEXT;")


def register(cursor: sqlite3.Cursor) -> None:
    """Create tables and seed default categories. Called from init_db."""
    create_tables(cursor)
    for name in DEFAULT_CATEGORIES:
        cursor.execute(
            "INSERT OR IGNORE INTO lab_sections (lab_name, name, is_custom) VALUES (?, ?, 0)",
            (CATEGORY_LAB, name),
        )
