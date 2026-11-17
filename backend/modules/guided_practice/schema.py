"""Table for Guided Practice's saved state (see store.py). Registered from modules/common/db.py init_db().

Twin: ensureGuidedPracticeSchema() in frontend/fe-apis/guidedPractice/schema.ts -- keep the two in sync.
"""

from __future__ import annotations

import sqlite3


def register(cursor: sqlite3.Cursor) -> None:
    """Create the table and its index. Called from init_db."""
    # One row per (user, lab, topic, subtopic): the whole Guided Practice document of that page (the generated path and the
    # learner's progress, as the browser wrote it) plus a small summary the topic page's card reads without parsing it.
    # `version` is bumped on every save and is what a save has to quote: a second tab holding an older copy is refused
    # instead of overwriting newer progress. `subtopic_id` is '' for the topic's own page (not NULL: NULLs are distinct
    # in a UNIQUE index).
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS guided_practice_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            lab_name TEXT NOT NULL DEFAULT 'dsa',
            topic_id TEXT NOT NULL,
            subtopic_id TEXT NOT NULL DEFAULT '',
            version INTEGER NOT NULL DEFAULT 1,
            state_json TEXT NOT NULL,
            summary_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, lab_name, topic_id, subtopic_id)
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_guided_practice_state_user ON guided_practice_state(user_id, lab_name);")
