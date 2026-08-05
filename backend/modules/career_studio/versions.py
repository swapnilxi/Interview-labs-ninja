"""Immutable version snapshots for resumes (git-like history).

The draft (see db.py) is mutable and autosaved in place. Explicit checkpoints
freeze the current draft into an immutable resume_versions row whose content is
stored in content_json and never mutated. clone/branch/restore operate on those
frozen snapshots.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Optional

from . import db
from .db import _connect, _insert_section, _new_id, _touch_master, get_master, get_resume_tree

_VERSION_META_COLS = "id, master_id, user_id, parent_version_id, branch_name, label, is_immutable, is_draft, source, created_at"


def _version_meta(r) -> dict:
    return {
        "id": r[0],
        "master_id": r[1],
        "parent_version_id": r[3],
        "branch_name": r[4],
        "label": r[5],
        "is_immutable": bool(r[6]),
        "is_draft": bool(r[7]),
        "source": r[8],
        "created_at": r[9],
    }


def _draft_sections_snapshot(cur: sqlite3.Cursor, master_id: str, version_id: str) -> list[dict]:
    """Read a version's live section rows into a plain snapshot list."""
    cur.execute(
        "SELECT section_type, title, content_json, sort_order, is_hidden "
        "FROM resume_sections WHERE master_id = ? AND version_id = ? ORDER BY sort_order ASC",
        (master_id, version_id),
    )
    return [
        {
            "section_type": r[0],
            "title": r[1],
            "content": json.loads(r[2]) if r[2] else {},
            "sort_order": r[3],
            "is_hidden": bool(r[4]),
        }
        for r in cur.fetchall()
    ]


def _sections_of_version(cur: sqlite3.Cursor, version_row: dict, master_id: str) -> list[dict]:
    """Frozen snapshots read from content_json; the live draft reads its rows."""
    cur.execute("SELECT content_json, is_draft FROM resume_versions WHERE id = ?", (version_row["id"],))
    row = cur.fetchone()
    if row and row[0] and not row[1]:
        return json.loads(row[0])
    return _draft_sections_snapshot(cur, master_id, version_row["id"])


# ── Snapshot (checkpoint the current draft) ─────────────────────────────────────


def snapshot_version(user_id: str, master_id: str, label: Optional[str] = None, source: str = "manual") -> Optional[dict]:
    uid = str(user_id)
    master = get_master(uid, master_id)
    if master is None:
        return None
    conn = _connect()
    try:
        cur = conn.cursor()
        snapshot = _draft_sections_snapshot(cur, master_id, master["current_draft_id"])
        vid = _new_id()
        cur.execute(
            """
            INSERT INTO resume_versions
                (id, master_id, user_id, parent_version_id, branch_name, label, is_immutable, is_draft, source, content_json)
            VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
            """,
            (vid, master_id, uid, master["current_version_id"], None, label, source, json.dumps(snapshot)),
        )
        cur.execute(
            "UPDATE resume_master SET current_version_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
            (vid, master_id, uid),
        )
        conn.commit()
        cur.execute(f"SELECT {_VERSION_META_COLS} FROM resume_versions WHERE id = ?", (vid,))
        meta = _version_meta(cur.fetchone())
        meta["section_count"] = len(snapshot)
        return meta
    finally:
        conn.close()


def list_versions(user_id: str, master_id: str) -> list[dict]:
    uid = str(user_id)
    if get_master(uid, master_id) is None:
        return []
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_VERSION_META_COLS} FROM resume_versions "
            "WHERE master_id = ? AND user_id = ? AND is_immutable = 1 ORDER BY created_at DESC",
            (master_id, uid),
        )
        rows = cur.fetchall()
        out = []
        for r in rows:
            meta = _version_meta(r)
            cur.execute("SELECT content_json FROM resume_versions WHERE id = ?", (meta["id"],))
            content = cur.fetchone()[0]
            meta["section_count"] = len(json.loads(content)) if content else 0
            out.append(meta)
        return out
    finally:
        conn.close()


def get_version(user_id: str, version_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_VERSION_META_COLS}, content_json FROM resume_versions WHERE id = ? AND user_id = ?",
            (version_id, str(user_id)),
        )
        row = cur.fetchone()
        if not row:
            return None
        meta = _version_meta(row)
        meta["sections"] = json.loads(row[10]) if row[10] else _draft_sections_snapshot(cur, meta["master_id"], version_id)
        return meta
    finally:
        conn.close()


# ── Restore / clone / branch ────────────────────────────────────────────────────


def restore_version(user_id: str, master_id: str, version_id: str) -> Optional[dict]:
    """Overwrite the live draft with a frozen snapshot's content."""
    uid = str(user_id)
    version = get_version(uid, version_id)
    master = get_master(uid, master_id)
    if version is None or master is None or version["master_id"] != master_id:
        return None
    draft_id = master["current_draft_id"]
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM resume_sections WHERE master_id = ? AND version_id = ?", (master_id, draft_id))
        for i, s in enumerate(version["sections"]):
            _insert_section(
                cur, user_id=uid, master_id=master_id, version_id=draft_id,
                section_type=s.get("section_type", "custom"), title=s.get("title"),
                content=s.get("content", {}), sort_order=s.get("sort_order", i),
                is_hidden=s.get("is_hidden", False),
            )
        _touch_master(cur, uid, master_id)
        conn.commit()
    finally:
        conn.close()
    return get_resume_tree(uid, master_id)


def _clone_snapshot_into_new_master(uid: str, sections: list[dict], title: str, branch_name: Optional[str], is_profile: bool = False) -> dict:
    master_id = _new_id()
    draft_id = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO resume_master (id, user_id, title, current_draft_id, is_profile) VALUES (?, ?, ?, ?, ?)",
            (master_id, uid, title, draft_id, int(is_profile)),
        )
        cur.execute(
            "INSERT INTO resume_versions (id, master_id, user_id, branch_name, is_draft, source) VALUES (?, ?, ?, ?, 1, ?)",
            (draft_id, master_id, uid, branch_name, "branch" if branch_name else "clone"),
        )
        for i, s in enumerate(sections):
            _insert_section(
                cur, user_id=uid, master_id=master_id, version_id=draft_id,
                section_type=s.get("section_type", "custom"), title=s.get("title"),
                content=s.get("content", {}), sort_order=s.get("sort_order", i),
                is_hidden=s.get("is_hidden", False),
            )
        conn.commit()
    finally:
        conn.close()
    return get_resume_tree(uid, master_id)


def create_resume_from_sections(user_id: str, sections: list[dict], title: str, branch_name: Optional[str] = None) -> dict:
    """Public wrapper: fork an explicit section list into a brand-new resume.

    Used by the JD-tailoring 'apply as a new copy' flow so the original resume
    is never mutated. `sections` items use the snapshot shape
    (section_type/title/content/sort_order/is_hidden).
    """
    return _clone_snapshot_into_new_master(str(user_id), sections, title, branch_name)


def clone_version(user_id: str, version_id: str, title: Optional[str] = None, branch_name: Optional[str] = None) -> Optional[dict]:
    """Duplicate a version's content into a brand-new resume (or profile, if the
    source was one) the user can edit freely."""
    uid = str(user_id)
    version = get_version(uid, version_id)
    if version is None:
        return None
    source_master = get_master(uid, version["master_id"])
    base_title = (source_master["title"] if source_master else "Resume")
    new_title = title or (f"{base_title} ({branch_name})" if branch_name else f"{base_title} (copy)")
    is_profile = bool(source_master and source_master.get("is_profile"))
    return _clone_snapshot_into_new_master(uid, version["sections"], new_title, branch_name, is_profile=is_profile)


def branch_version(user_id: str, version_id: str, branch_name: str) -> Optional[dict]:
    """A clone that records the branch name — a named fork of a checkpoint."""
    return clone_version(user_id, version_id, branch_name=branch_name or "branch")
