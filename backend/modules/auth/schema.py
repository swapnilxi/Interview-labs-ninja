"""SQLite schema registration for users and their profile/preferences."""

from __future__ import annotations


def register(cursor) -> None:
    """Create the users and user_profile tables if they do not exist."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);")

    # Per-user AI model/provider selection, synced across devices once logged in.
    # Deliberately holds no API keys — those stay browser-only (see modules/common/ai_client.py).
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_profile (
            user_id INTEGER PRIMARY KEY,
            text_generation_model TEXT DEFAULT NULL,
            answer_model TEXT DEFAULT NULL,
            ai_provider TEXT DEFAULT NULL,
            ollama_url TEXT DEFAULT NULL,
            ollama_model TEXT DEFAULT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
