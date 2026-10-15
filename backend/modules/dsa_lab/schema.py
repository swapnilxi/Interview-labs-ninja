from __future__ import annotations
import sqlite3
from .seed import seed_dsa_topics


def create_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dsa_topics (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            brief TEXT NOT NULL,
            category TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            prerequisites_json TEXT NOT NULL DEFAULT '[]',
            subtopics_json TEXT NOT NULL DEFAULT '[]',
            is_custom INTEGER NOT NULL DEFAULT 0
        )
    """)


def create_week_plan_table(cursor: sqlite3.Cursor) -> None:
    # One row per user: their week-by-week study plan as JSON ({"weeks": 6, "assignments": {topic_id: week}}).
    # No row means "never customised" — the frontend then shows its suggested plan.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dsa_week_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT NULL,
            plan_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dsa_week_plans_user_id ON dsa_week_plans(user_id);")


def register(cursor: sqlite3.Cursor) -> None:
    """Create tables and seed initial data. Called from init_db."""
    create_tables(cursor)
    create_week_plan_table(cursor)
    seed_dsa_topics(cursor)
