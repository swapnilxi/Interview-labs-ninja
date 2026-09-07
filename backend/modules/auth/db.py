"""Raw-sqlite CRUD for users and their profile, matching the style of modules/todo/db.py."""

from __future__ import annotations

import os
import sqlite3
from typing import Optional

from modules.common.db import get_db_path

_USER_COLS = "id, email, password_hash, display_name, role, created_at, updated_at"


def _row_to_user(row) -> dict:
    return {
        "id": row[0],
        "email": row[1],
        "password_hash": row[2],
        "display_name": row[3],
        "role": row[4],
        "created_at": row[5],
        "updated_at": row[6],
    }


def create_user(email: str, password_hash: str, display_name: Optional[str] = None) -> dict:
    """Create a user + an empty profile row. Raises sqlite3.IntegrityError if the email exists."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
            (email, password_hash, display_name),
        )
        user_id = cursor.lastrowid
        cursor.execute("INSERT INTO user_profile (user_id) VALUES (?)", (user_id,))
        conn.commit()
        return get_user_by_id(user_id)
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_USER_COLS} FROM users WHERE email = ?",
            (email,),
        )
        row = cursor.fetchone()
        return _row_to_user(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> Optional[dict]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_USER_COLS} FROM users WHERE id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
        return _row_to_user(row) if row else None
    finally:
        conn.close()


def get_profile(user_id: int) -> Optional[dict]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT user_id, text_generation_model, answer_model, ai_provider,
                   ollama_url, ollama_model, updated_at
            FROM user_profile WHERE user_id = ?
            """,
            (user_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "user_id": row[0],
            "text_generation_model": row[1],
            "answer_model": row[2],
            "ai_provider": row[3],
            "ollama_url": row[4],
            "ollama_model": row[5],
            "updated_at": row[6],
        }
    finally:
        conn.close()


def upsert_profile(user_id: int, **fields) -> dict:
    """Update whichever of text_generation_model/answer_model/ai_provider/ollama_url/ollama_model are provided."""
    allowed = {"text_generation_model", "answer_model", "ai_provider", "ollama_url", "ollama_model"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO user_profile (user_id) VALUES (?)", (user_id,))
        if updates:
            set_clause = ", ".join(f"{col} = ?" for col in updates)
            cursor.execute(
                f"UPDATE user_profile SET {set_clause}, updated_at = datetime('now') WHERE user_id = ?",
                (*updates.values(), user_id),
            )
        conn.commit()
    finally:
        conn.close()
    return get_profile(user_id)


# ── Admin: role bootstrap, user management, and system-wide resource stats ──────

# Tables in lab_ninja.sqlite3 that carry a per-user `user_id` column. Deleting a
# user must clear their rows here (there are no FK ON DELETE CASCADE constraints
# on these — only user_profile has one), and these are what we count per user for
# the admin dashboard. Discovered dynamically so a new user-scoped module is
# picked up without editing this list.
_NON_DATA_USER_TABLES = {"users", "user_profile"}


def _user_scoped_tables(cursor) -> list[str]:
    """Every table (besides users/user_profile) that has a `user_id` column."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    tables = [r[0] for r in cursor.fetchall()]
    scoped = []
    for name in tables:
        if name in _NON_DATA_USER_TABLES or name.startswith("sqlite_"):
            continue
        cursor.execute(f"PRAGMA table_info({name})")
        if any(col[1] == "user_id" for col in cursor.fetchall()):
            scoped.append(name)
    return scoped


def promote_admins_from_env() -> list[str]:
    """Promote every email listed in LABNINJA_ADMIN_EMAILS (comma-separated) to admin.

    Idempotent and safe to call on every startup. Only affects accounts that
    already exist; an allow-listed email with no account yet is promoted the
    next time it's present. Returns the emails that were promoted (already-admin
    ones are skipped).
    """
    raw = os.environ.get("LABNINJA_ADMIN_EMAILS", "")
    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    if not emails:
        return []
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        promoted = []
        for email in emails:
            cursor.execute(
                "UPDATE users SET role = 'admin', updated_at = datetime('now') "
                "WHERE email = ? AND role != 'admin'",
                (email,),
            )
            if cursor.rowcount > 0:
                promoted.append(email)
        conn.commit()
        return promoted
    finally:
        conn.close()


def count_admins() -> int:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        return cursor.fetchone()[0]
    finally:
        conn.close()


def list_users(search: Optional[str] = None) -> list[dict]:
    """All users with a total resource count each, newest first. `search` filters on email/name."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        scoped = _user_scoped_tables(cursor)

        where, params = "", []
        if search:
            where = "WHERE email LIKE ? OR IFNULL(display_name, '') LIKE ?"
            like = f"%{search}%"
            params = [like, like]
        cursor.execute(
            f"SELECT id, email, display_name, role, created_at, updated_at FROM users {where} "
            "ORDER BY created_at DESC, id DESC",
            params,
        )
        rows = cursor.fetchall()

        # Per-user total across every user-scoped table, computed in one pass per
        # table (cheap on a single-file SQLite DB) rather than N queries per user.
        totals: dict[int, int] = {}
        for table in scoped:
            cursor.execute(
                f"SELECT user_id, COUNT(*) FROM {table} WHERE user_id IS NOT NULL GROUP BY user_id"
            )
            for uid, n in cursor.fetchall():
                totals[uid] = totals.get(uid, 0) + n

        return [
            {
                "id": r[0],
                "email": r[1],
                "display_name": r[2],
                "role": r[3],
                "created_at": r[4],
                "updated_at": r[5],
                "resource_count": totals.get(r[0], 0),
            }
            for r in rows
        ]
    finally:
        conn.close()


def system_stats() -> dict:
    """Aggregate counts for the admin overview: users, admins, recent signups, and per-table resource totals."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*), SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) FROM users")
        total_users, admin_users = cursor.fetchone()
        admin_users = admin_users or 0

        cursor.execute("SELECT COUNT(*) FROM users WHERE created_at >= datetime('now', '-7 days')")
        new_users_7d = cursor.fetchone()[0]

        # Only count user-owned rows (user_id IS NOT NULL) so globally-seeded
        # config rows — e.g. the ~190 default lab_sections — don't masquerade as
        # user data. This keeps the totals here consistent with list_users().
        resources = {}
        total_resources = 0
        for table in _user_scoped_tables(cursor):
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id IS NOT NULL")
            n = cursor.fetchone()[0]
            resources[table] = n
            total_resources += n

        return {
            "total_users": total_users,
            "admin_users": admin_users,
            "new_users_7d": new_users_7d,
            "total_resources": total_resources,
            "resources_by_table": dict(sorted(resources.items(), key=lambda kv: kv[1], reverse=True)),
        }
    finally:
        conn.close()


def set_user_role(user_id: int, role: str) -> Optional[dict]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?",
            (role, user_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_user_by_id(user_id)


def set_user_password(user_id: int, password_hash: str) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
            (password_hash, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_user(user_id: int) -> bool:
    """Delete a user and all of their rows across every user-scoped table.

    Manual cascade: only user_profile has an FK ON DELETE CASCADE; the module
    tables store user_id as a plain nullable column, so their rows would be
    orphaned otherwise.
    """
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
        if cursor.fetchone() is None:
            return False
        for table in _user_scoped_tables(cursor):
            cursor.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM user_profile WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return True
    finally:
        conn.close()
