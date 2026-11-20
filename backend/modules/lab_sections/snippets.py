"""User code snippets on a lab section.

Stored in `lab_section_snippets`. Each snippet belongs to one section of one page (topic/subtopic).
Like lab page videos, `user_id = 0` means shared (admin-added, visible to all); every other id is
the owner. Admins can add shared snippets and delete any snippet. Regular users add/delete their own.

Languages: a short slug from LANGUAGES below; the UI renders the matching label and highlight class.

Twin: frontend/fe-apis/labSections/snippets.ts (same limits, error texts and status codes — change both).
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List

from modules.common.db import get_db_path

__all__ = ["SnippetError"]

SHARED_USER = 0

LANGUAGES = {
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "java": "Java",
    "cpp": "C++",
    "go": "Go",
    "rust": "Rust",
    "sql": "SQL",
    "other": "Other",
}

MAX_PER_SECTION = 20
MAX_TITLE = 120
MAX_CODE = 20_000

NOT_ADMIN_SHARE = "Only an admin can add a shared snippet."
LIMIT_ERROR = f"You have reached the {MAX_PER_SECTION}-snippet limit for this section."
SHARED_LIMIT_ERROR = f"The shared snippets for this section have reached the {MAX_PER_SECTION} limit."
NOTHING_TO_CHANGE = "Send a title, language or code to change."
BAD_LANGUAGE = f"language must be one of: {', '.join(LANGUAGES)}."


class SnippetError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def ensure_table(cursor: sqlite3.Cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lab_section_snippets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            lab_name TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            subtopic_id TEXT NOT NULL DEFAULT '',
            section_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT 'python',
            code TEXT NOT NULL,
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_lab_section_snippets_page "
        "ON lab_section_snippets(user_id, lab_name, topic_id, subtopic_id, section_id, order_index);"
    )


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        ensure_table(conn.cursor())
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _is_admin(user_id: int) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()
    return bool(row) and row[0] in ("admin", "superadmin")


def _row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "shared": row["user_id"] == SHARED_USER,
        "title": row["title"],
        "language": row["language"],
        "code": row["code"],
        "order_index": row["order_index"],
        "created_at": row["created_at"],
    }


def _section_rows(
    conn: sqlite3.Connection,
    user_id: int,
    lab: str,
    topic_id: str,
    subtopic_id: str,
    section_id: str,
    only_user: bool = False,
) -> List[Dict[str, Any]]:
    users = (user_id,) if only_user else (SHARED_USER, user_id)
    rows = conn.execute(
        f"""
        SELECT * FROM lab_section_snippets
        WHERE user_id IN ({",".join("?" * len(users))})
          AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND section_id = ?
        ORDER BY (user_id = {SHARED_USER}) DESC, order_index ASC, id ASC
        """,
        (*users, lab, topic_id, subtopic_id, section_id),
    ).fetchall()
    return [_row(r) for r in rows]


def _clean_title(raw: Any) -> str:
    if raw is None:
        return ""
    t = str(raw).strip()
    if len(t) > MAX_TITLE:
        raise SnippetError(422, f"Title must be {MAX_TITLE} characters or fewer.")
    return t


def _clean_code(raw: Any) -> str:
    if not isinstance(raw, str) or not raw.strip():
        raise SnippetError(422, "code is required.")
    if len(raw) > MAX_CODE:
        raise SnippetError(422, f"Code must be {MAX_CODE} characters or fewer.")
    return raw


def _clean_language(raw: Any) -> str:
    lang = str(raw).strip().lower() if raw else "python"
    if lang not in LANGUAGES:
        raise SnippetError(422, BAD_LANGUAGE)
    return lang


# ── Public API ──────────────────────────────────────────────────────────────

def list_snippets(
    user_id: int, lab: str, topic_id: str, subtopic_id: str, section_id: str
) -> Dict[str, Any]:
    with _db() as conn:
        return {"snippets": _section_rows(conn, user_id, lab, topic_id, subtopic_id, section_id)}


def add_snippet(
    user_id: int,
    lab: str,
    topic_id: str,
    subtopic_id: str,
    section_id: str,
    title_raw: Any,
    language_raw: Any,
    code_raw: Any,
    shared: bool = False,
) -> Dict[str, Any]:
    title = _clean_title(title_raw)
    language = _clean_language(language_raw)
    code = _clean_code(code_raw)
    admin = _is_admin(user_id)
    if shared and not admin:
        raise SnippetError(403, NOT_ADMIN_SHARE)
    owner = SHARED_USER if shared else user_id
    with _db() as conn:
        bucket = _section_rows(conn, owner, lab, topic_id, subtopic_id, section_id, only_user=True)
        limit_msg = SHARED_LIMIT_ERROR if shared else LIMIT_ERROR
        if len(bucket) >= MAX_PER_SECTION:
            raise SnippetError(422, limit_msg)
        order_index = (bucket[-1]["order_index"] + 1) if bucket else 0
        cursor = conn.execute(
            """
            INSERT INTO lab_section_snippets
                (user_id, lab_name, topic_id, subtopic_id, section_id, title, language, code, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (owner, lab, topic_id, subtopic_id, section_id, title, language, code, order_index),
        )
        return _row(conn.execute("SELECT * FROM lab_section_snippets WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_snippet(
    user_id: int,
    snippet_id: int,
    title_raw: Any = None,
    language_raw: Any = None,
    code_raw: Any = None,
) -> Dict[str, Any]:
    if title_raw is None and language_raw is None and code_raw is None:
        raise SnippetError(422, NOTHING_TO_CHANGE)
    title = _clean_title(title_raw) if title_raw is not None else None
    language = _clean_language(language_raw) if language_raw is not None else None
    code = _clean_code(code_raw) if code_raw is not None else None
    admin = _is_admin(user_id)
    with _db() as conn:
        owners = (user_id, SHARED_USER) if admin else (user_id,)
        row = conn.execute(
            f"SELECT * FROM lab_section_snippets WHERE id = ? AND user_id IN ({','.join('?' * len(owners))})",
            (snippet_id, *owners),
        ).fetchone()
        if row is None:
            raise SnippetError(404, "Snippet not found.")
        conn.execute(
            "UPDATE lab_section_snippets SET title = ?, language = ?, code = ? WHERE id = ?",
            (
                row["title"] if title is None else title,
                row["language"] if language is None else language,
                row["code"] if code is None else code,
                snippet_id,
            ),
        )
        return _row(conn.execute("SELECT * FROM lab_section_snippets WHERE id = ?", (snippet_id,)).fetchone())


def delete_snippet(user_id: int, snippet_id: int) -> Dict[str, Any]:
    with _db() as conn:
        owners = (user_id, SHARED_USER) if _is_admin(user_id) else (user_id,)
        cursor = conn.execute(
            f"DELETE FROM lab_section_snippets WHERE id = ? AND user_id IN ({','.join('?' * len(owners))})",
            (snippet_id, *owners),
        )
        if cursor.rowcount == 0:
            raise SnippetError(404, "Snippet not found.")
    return {"message": "Snippet deleted"}
