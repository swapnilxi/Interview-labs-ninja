from __future__ import annotations
import sqlite3
from modules.common.owned_topics import PREREQUISITES, ensure_ownership
from .seed import seed_cv_topics


def create_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cv_topics (
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


def register(cursor: sqlite3.Cursor) -> None:
    """Create tables and seed initial data. Called from init_db."""
    create_tables(cursor)
    # owner_id (NULL = shared with everyone) and cv_topic_overrides: see common/owned_topics.py
    ensure_ownership(cursor, "cv_topics", PREREQUISITES)
    seed_cv_topics(cursor)
