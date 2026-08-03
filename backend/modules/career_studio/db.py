"""Career Studio persistence — raw sqlite3 against its OWN database file.

Mirrors the app's existing raw-sqlite idiom (see linkedin_post_generator/store.py)
but points at a separate career_studio.sqlite3 so the module can be extracted to a
standalone service by copying this folder + its DB. Never imports the app's shared
DB module for connections; only the auth guard is reused (in the routers, by value).

All rows are user-scoped: every function takes `user_id` and filters on it.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any, Optional

from .schema import register

# ── Connection / init ──────────────────────────────────────────────────────────


def get_career_db_path() -> str:
    """Resolve career_studio.sqlite3 (env override wins). Lives inside the module."""
    override = os.environ.get("CAREER_STUDIO_DB_PATH")
    if override:
        return override
    return str(Path(__file__).resolve().parent / "career_studio.sqlite3")


def _connect() -> sqlite3.Connection:
    return sqlite3.connect(get_career_db_path())


def init_career_db() -> None:
    """Create the module's tables. Called once from main.py's lifespan."""
    conn = _connect()
    try:
        register(conn.cursor())
        conn.commit()
    finally:
        conn.close()


def _new_id() -> str:
    return uuid.uuid4().hex


# ── Section defaults (empty shapes the frontend fills in) ───────────────────────

DEFAULT_SECTIONS: list[tuple[str, str]] = [
    ("personal_info", "Personal Info"),
    ("summary", "Summary"),
    ("experience", "Experience"),
    ("education", "Education"),
    ("skills", "Skills"),
]


def default_content(section_type: str) -> dict:
    if section_type == "personal_info":
        return {"name": "", "title": "", "email": "", "phone": "", "location": "", "links": []}
    if section_type == "summary":
        return {"text": ""}
    if section_type == "skills":
        return {"groups": []}
    # experience, education, projects, certifications, awards, custom, …
    return {"items": []}


# ── Row → dict helpers ──────────────────────────────────────────────────────────

_MASTER_COLS = "id, user_id, title, current_version_id, current_draft_id, is_deleted, deleted_at, created_at, updated_at"
_SECTION_COLS = "id, version_id, master_id, user_id, section_type, title, content_json, sort_order, is_hidden, created_at, updated_at"


def _master_to_dict(r) -> dict:
    return {
        "id": r[0],
        "user_id": r[1],
        "title": r[2],
        "current_version_id": r[3],
        "current_draft_id": r[4],
        "is_deleted": bool(r[5]),
        "deleted_at": r[6],
        "created_at": r[7],
        "updated_at": r[8],
    }


def _section_to_dict(r) -> dict:
    return {
        "id": r[0],
        "version_id": r[1],
        "master_id": r[2],
        "section_type": r[4],
        "title": r[5],
        "content": json.loads(r[6]) if r[6] else {},
        "sort_order": r[7],
        "is_hidden": bool(r[8]),
        "created_at": r[9],
        "updated_at": r[10],
    }


# ── Internal section insert (shared by create/restore/clone) ────────────────────


def _insert_section(
    cursor: sqlite3.Cursor,
    *,
    user_id: str,
    master_id: str,
    version_id: str,
    section_type: str,
    title: Optional[str],
    content: Any,
    sort_order: int,
    is_hidden: bool = False,
) -> str:
    sid = _new_id()
    cursor.execute(
        """
        INSERT INTO resume_sections
            (id, version_id, master_id, user_id, section_type, title, content_json, sort_order, is_hidden)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sid, version_id, master_id, str(user_id), section_type, title,
         json.dumps(content if content is not None else {}), sort_order, 1 if is_hidden else 0),
    )
    return sid


def _touch_master(cursor: sqlite3.Cursor, user_id: str, master_id: str) -> None:
    cursor.execute(
        "UPDATE resume_master SET updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        (master_id, str(user_id)),
    )


# ── Resume master CRUD ──────────────────────────────────────────────────────────


def create_resume(user_id: str, title: str) -> dict:
    """Create a resume with a fresh mutable draft + default empty sections."""
    uid = str(user_id)
    master_id = _new_id()
    draft_id = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO resume_master (id, user_id, title, current_draft_id) VALUES (?, ?, ?, ?)",
            (master_id, uid, title or "Untitled Resume", draft_id),
        )
        cur.execute(
            "INSERT INTO resume_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'draft')",
            (draft_id, master_id, uid),
        )
        for i, (section_type, section_title) in enumerate(DEFAULT_SECTIONS):
            _insert_section(
                cur, user_id=uid, master_id=master_id, version_id=draft_id,
                section_type=section_type, title=section_title,
                content=default_content(section_type), sort_order=i,
            )
        conn.commit()
    finally:
        conn.close()
    return get_resume_tree(uid, master_id)


def list_resumes(user_id: str) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_MASTER_COLS} FROM resume_master WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC",
            (str(user_id),),
        )
        masters = [_master_to_dict(r) for r in cur.fetchall()]
        for m in masters:
            cur.execute(
                "SELECT COUNT(*) FROM resume_sections WHERE master_id = ? AND version_id = ?",
                (m["id"], m["current_draft_id"]),
            )
            m["section_count"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM resume_versions WHERE master_id = ? AND is_immutable = 1", (m["id"],))
            m["version_count"] = cur.fetchone()[0]
        return masters
    finally:
        conn.close()


def get_master(user_id: str, master_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_MASTER_COLS} FROM resume_master WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (master_id, str(user_id)),
        )
        row = cur.fetchone()
        return _master_to_dict(row) if row else None
    finally:
        conn.close()


def get_resume_tree(user_id: str, master_id: str) -> Optional[dict]:
    """Master + its live draft sections (the editable working copy)."""
    master = get_master(user_id, master_id)
    if master is None:
        return None
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_SECTION_COLS} FROM resume_sections WHERE master_id = ? AND version_id = ? ORDER BY sort_order ASC, created_at ASC",
            (master_id, master["current_draft_id"]),
        )
        master["sections"] = [_section_to_dict(r) for r in cur.fetchall()]
        return master
    finally:
        conn.close()


def update_resume(user_id: str, master_id: str, title: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE resume_master SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (title, master_id, str(user_id)),
        )
        conn.commit()
        changed = cur.rowcount
    finally:
        conn.close()
    return get_resume_tree(user_id, master_id) if changed else None


def soft_delete_resume(user_id: str, master_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE resume_master SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (master_id, str(user_id)),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ── Section CRUD (operates on the mutable draft) ────────────────────────────────


def add_section(user_id: str, master_id: str, section_type: str, title: Optional[str], content: Any = None) -> Optional[dict]:
    uid = str(user_id)
    master = get_master(uid, master_id)
    if master is None:
        return None
    draft_id = master["current_draft_id"]
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) FROM resume_sections WHERE version_id = ?", (draft_id,))
        next_order = cur.fetchone()[0] + 1
        sid = _insert_section(
            cur, user_id=uid, master_id=master_id, version_id=draft_id,
            section_type=section_type, title=title,
            content=content if content is not None else default_content(section_type),
            sort_order=next_order,
        )
        _touch_master(cur, uid, master_id)
        conn.commit()
        cur.execute(f"SELECT {_SECTION_COLS} FROM resume_sections WHERE id = ?", (sid,))
        return _section_to_dict(cur.fetchone())
    finally:
        conn.close()


def update_section(user_id: str, master_id: str, section_id: str, fields: dict) -> Optional[dict]:
    uid = str(user_id)
    sets: list[str] = []
    params: list[Any] = []
    if "title" in fields:
        sets.append("title = ?")
        params.append(fields["title"])
    if "content" in fields:
        sets.append("content_json = ?")
        params.append(json.dumps(fields["content"] if fields["content"] is not None else {}))
    if "is_hidden" in fields:
        sets.append("is_hidden = ?")
        params.append(1 if fields["is_hidden"] else 0)
    if "sort_order" in fields:
        sets.append("sort_order = ?")
        params.append(int(fields["sort_order"]))
    if not sets:
        return None
    sets.append("updated_at = datetime('now')")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE resume_sections SET {', '.join(sets)} WHERE id = ? AND master_id = ? AND user_id = ?",
            (*params, section_id, master_id, uid),
        )
        if cur.rowcount == 0:
            return None
        _touch_master(cur, uid, master_id)
        conn.commit()
        cur.execute(f"SELECT {_SECTION_COLS} FROM resume_sections WHERE id = ?", (section_id,))
        return _section_to_dict(cur.fetchone())
    finally:
        conn.close()


def delete_section(user_id: str, master_id: str, section_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM resume_sections WHERE id = ? AND master_id = ? AND user_id = ?",
            (section_id, master_id, str(user_id)),
        )
        if cur.rowcount:
            _touch_master(cur, user_id, master_id)
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def reorder_sections(user_id: str, master_id: str, ordered_ids: list[str]) -> Optional[dict]:
    uid = str(user_id)
    if get_master(uid, master_id) is None:
        return None
    conn = _connect()
    try:
        cur = conn.cursor()
        for order, sid in enumerate(ordered_ids):
            cur.execute(
                "UPDATE resume_sections SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND master_id = ? AND user_id = ?",
                (order, sid, master_id, uid),
            )
        _touch_master(cur, uid, master_id)
        conn.commit()
    finally:
        conn.close()
    return get_resume_tree(uid, master_id)


def get_section(user_id: str, section_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_SECTION_COLS} FROM resume_sections WHERE id = ? AND user_id = ?",
            (section_id, str(user_id)),
        )
        row = cur.fetchone()
        return _section_to_dict(row) if row else None
    finally:
        conn.close()
