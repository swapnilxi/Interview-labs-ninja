from __future__ import annotations
import sqlite3


def create_tables(cursor: sqlite3.Cursor) -> None:
    # One row per (user, lab, topic, subtopic, section): the latest AI-generated body for that
    # on-demand section plus the learner context that produced it. `subtopic_id` is '' for the
    # topic's own page (not NULL — SQLite treats NULLs as distinct, which would defeat the UNIQUE).
    cursor.execute("""
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
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lab_section_content_user_id ON lab_section_content(user_id);")

    # AI-generated multiple-choice questions for a topic/subtopic page. Each "generate more" appends
    # rows, so the page's quiz grows and the same questions come back after a reload.
    cursor.execute("""
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
        )
    """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_lab_quiz_questions_page ON lab_quiz_questions(user_id, lab_name, topic_id, subtopic_id);"
    )


def register(cursor: sqlite3.Cursor) -> None:
    """Create tables. Called from init_db."""
    create_tables(cursor)
