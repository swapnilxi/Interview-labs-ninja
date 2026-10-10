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
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);")

    # Migration: add the role column to installs that predate the admin system.
    # 'user' (default) or 'admin'. Admin bootstrap happens in db.promote_admins_from_env().
    cursor.execute("PRAGMA table_info(users);")
    _user_cols = [row[1] for row in cursor.fetchall()]
    if "role" not in _user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';")

    # Migration: account-approval status. Default 'approved' so every existing row (and any
    # other INSERT path) is unaffected -- only db.create_user() explicitly overrides this to
    # 'pending' for a brand-new signup. See modules/auth/dependencies.py: get_current_active_user.
    if "status" not in _user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';")

    # Per-user AI model/provider selection, synced across devices once logged in.
    # Deliberately holds no API keys — those stay browser-only (see modules/common/ai/settings.py).
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

    # Per-user overrides on top of the role ladder's default permission set (see
    # modules/auth/dependencies.py: DEFAULT_PERMISSIONS/has_permission). allowed=1 grants a
    # permission a role wouldn't otherwise imply; allowed=0 revokes one it would. No row means
    # "defer to the role default".
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            permission TEXT NOT NULL,
            allowed INTEGER NOT NULL DEFAULT 1,
            granted_by INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, permission)
        )
    """)

    # A user's self-service ask for a role bump or a specific permission, reviewed by an
    # admin from the portal. Exactly one of requested_role/permission is set per row.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS access_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            requested_role TEXT,
            permission TEXT,
            message TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by INTEGER,
            review_note TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            decided_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CHECK ((requested_role IS NOT NULL) + (permission IS NOT NULL) = 1)
        )
    """)
    # A plain UNIQUE(user_id, requested_role, permission) would never fire here: SQLite
    # never matches a UNIQUE constraint across NULLs, and exactly one of these two columns
    # is always NULL. Coalescing to '' in a partial index (pending rows only) is what
    # actually blocks a duplicate pending request for the same thing.
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending
        ON access_requests(user_id, IFNULL(requested_role, ''), IFNULL(permission, ''))
        WHERE status = 'pending'
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);")
