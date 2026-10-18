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

    # "Mark as complete": one row per page (topic, or subtopic of a topic) the user has finished. A row
    # means complete and un-marking deletes it. `subtopic_id` is '' for the topic's own page.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lab_page_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT NULL,
            lab_name TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            subtopic_id TEXT NOT NULL DEFAULT '',
            completed_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, lab_name, topic_id, subtopic_id)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lab_page_progress_user_lab ON lab_page_progress(user_id, lab_name);")

    # "Lab settings": how a user wants a lab's sections generated. One row per (lab, section); the
    # section id '*' holds the lab-wide row. `prompt` replaces the section's built-in instructions when
    # non-empty, `addon` is appended to whichever instructions are in force, `context` is standing
    # context about the learner. A row whose three fields are all empty is deleted (= back to default).
    cursor.execute("""
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
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lab_section_settings_user_lab ON lab_section_settings(user_id, lab_name);")


def add_project_columns(cursor: sqlite3.Cursor) -> None:
    """`project_id`: the Labs Project a generated body / quiz question was written for (NULL = no project).

    It is what keeps one project's text out of another project's (or a general) generation: the section
    flow only revises an earlier draft that belongs to the same project, and a quiz only shows the model
    earlier questions from the same project or from no project. Deleting a project leaves its id on the
    rows on purpose (ids are never reused), so that text is never picked up by anything else.
    """
    for table in ("lab_section_content", "lab_quiz_questions"):
        cursor.execute(f"PRAGMA table_info({table});")
        if "project_id" not in {row[1] for row in cursor.fetchall()}:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN project_id INTEGER DEFAULT NULL")


def register(cursor: sqlite3.Cursor) -> None:
    """Create tables. Called from init_db."""
    create_tables(cursor)
    add_project_columns(cursor)
