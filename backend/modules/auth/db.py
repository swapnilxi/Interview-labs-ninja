"""Raw-sqlite CRUD for users and their profile, matching the style of modules/todo/db.py."""

from __future__ import annotations

import sqlite3
from typing import Optional

from modules.common.db import get_db_path


def _row_to_user(row) -> dict:
    return {
        "id": row[0],
        "email": row[1],
        "password_hash": row[2],
        "display_name": row[3],
        "created_at": row[4],
        "updated_at": row[5],
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
            "SELECT id, email, password_hash, display_name, created_at, updated_at FROM users WHERE email = ?",
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
            "SELECT id, email, password_hash, display_name, created_at, updated_at FROM users WHERE id = ?",
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
