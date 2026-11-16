"""Per-user tables for Daily Session questions (Question Review). Registered from modules/common/db.py init_db().

`questions` rows are shared (one owner, visible to everyone), so whatever a user keeps about a question lives
here, keyed by (user_id, question_id):
  question_workspace  the user's written answer and notes for the question (one row per user and question)
  question_quiz       AI-generated multiple-choice items about the question's concepts (see question_quiz.py)
  question_study      AI-written study content: quick review, breakdown, deep dive (see question_study.py)
  question_user_state each user's own star rating (`performance`) and last-reviewed date for the question. It
                      replaces the shared questions.user_performance / last_reviewed columns, which are no longer
                      written; their old values are copied to the question's owner once (see below).
  question_review_list the questions a user has added to their review list ("Add to review")

Twin: ensureQuestionStoreSchema() in frontend/fe-apis/dailySession/questionStore.ts -- keep the two in sync.
"""

from __future__ import annotations

import sqlite3


def register(cursor: sqlite3.Cursor) -> None:
    """Create tables. Called from init_db."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS question_workspace (
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            answer TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, question_id)
        )
    """)
    # `options` is a JSON array of 4 strings; `answer` is the index of the correct one.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS question_quiz (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            q TEXT NOT NULL,
            options TEXT NOT NULL,
            answer INTEGER NOT NULL,
            explanation TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_question_quiz_user_question ON question_quiz(user_id, question_id);"
    )
    # Study content (question_study.py): one row per user, question and kind ('quick', 'breakdown', 'deep').
    # `content` is the item's JSON without `kind` / `updated_at`.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS question_study (
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            content TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, question_id, kind)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS question_user_state (
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            performance INTEGER DEFAULT NULL,
            last_reviewed TEXT DEFAULT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, question_id)
        )
    """)
    # "Add to review": the questions a user has put on their review list.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS question_review_list (
            user_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, question_id)
        )
    """)
    # Ratings made before this table existed sit on the shared questions row: give each one to the row's owner.
    # INSERT OR IGNORE keeps it idempotent (a rating the owner has made since is never overwritten). Rows with no
    # owner (user_id NULL) can't be attributed to anyone and are left out.
    cursor.execute("PRAGMA table_info(questions);")
    question_cols = {row[1] for row in cursor.fetchall()}
    if {"user_id", "user_performance", "last_reviewed"} <= question_cols:
        cursor.execute("""
            INSERT OR IGNORE INTO question_user_state (user_id, question_id, performance, last_reviewed)
            SELECT user_id, id, user_performance, last_reviewed FROM questions
            WHERE user_id IS NOT NULL AND (user_performance IS NOT NULL OR last_reviewed IS NOT NULL)
        """)
