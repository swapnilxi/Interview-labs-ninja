"""Table for the shared per-user AI memory (see store.py). Registered from modules/common/db.py init_db().

Twin: ensureMemorySchema() in frontend/fe-apis/memory/db.ts -- keep the two in sync.
"""

from __future__ import annotations


def register(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            module TEXT NOT NULL,
            topic TEXT NOT NULL DEFAULT '',
            kind TEXT NOT NULL,
            fact TEXT NOT NULL,
            weight REAL NOT NULL DEFAULT 1,
            hits INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, module, topic, fact)
        )
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_memory_user_module ON ai_memory(user_id, module)")
