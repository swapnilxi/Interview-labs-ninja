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

# A profile is the reusable data source, so it seeds a richer default set.
DEFAULT_PROFILE_SECTIONS: list[tuple[str, str]] = [
    ("personal_info", "Personal Info"),
    ("summary", "Summary"),
    ("experience", "Experience"),
    ("projects", "Projects"),
    ("education", "Education"),
    ("skills", "Skills"),
    ("certifications", "Certifications"),
]


def default_content(section_type: str) -> dict:
    if section_type == "personal_info":
        return {"name": "", "title": "", "email": "", "phone": "", "location": "", "links": []}
    if section_type in ("summary", "career_goals"):
        return {"text": ""}
    if section_type == "skills":
        return {"groups": []}
    # experience, education, projects, certifications, awards, publications,
    # interests, patents, custom, …
    return {"items": []}


# ── Row → dict helpers ──────────────────────────────────────────────────────────

_MASTER_COLS = (
    "id, user_id, title, current_version_id, current_draft_id, is_deleted, deleted_at, "
    "created_at, updated_at, template_key, is_profile, is_archived, origin, primary_role, "
    "experience_level, target_industry, target_roles, target_companies, tags, confidence_score, last_used_at, "
    "description, tech_stack"
)
_SECTION_COLS = "id, version_id, master_id, user_id, section_type, title, content_json, sort_order, is_hidden, created_at, updated_at, source"


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
        "template_key": r[9],
        "is_profile": bool(r[10]),
        "is_archived": bool(r[11]),
        "origin": r[12],
        "primary_role": r[13],
        "experience_level": r[14],
        "target_industry": r[15],
        "target_roles": json.loads(r[16]) if r[16] else [],
        "target_companies": json.loads(r[17]) if r[17] else [],
        "tags": json.loads(r[18]) if r[18] else [],
        "confidence_score": r[19],
        "last_used_at": r[20],
        "description": r[21],
        "tech_stack": json.loads(r[22]) if r[22] else [],
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
        "source": r[11],
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
    source: Optional[str] = None,
) -> str:
    sid = _new_id()
    cursor.execute(
        """
        INSERT INTO resume_sections
            (id, version_id, master_id, user_id, section_type, title, content_json, sort_order, is_hidden, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sid, version_id, master_id, str(user_id), section_type, title,
         json.dumps(content if content is not None else {}), sort_order, 1 if is_hidden else 0, source),
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


def create_profile(user_id: str, title: str = "My Profile", origin: str = "manual") -> dict:
    """A Master Profile is a resume_master with is_profile=1 (reusable data source)."""
    uid = str(user_id)
    master_id = _new_id()
    draft_id = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO resume_master (id, user_id, title, current_draft_id, is_profile, origin) VALUES (?, ?, ?, ?, 1, ?)",
            (master_id, uid, title or "My Profile", draft_id, origin),
        )
        cur.execute(
            "INSERT INTO resume_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'draft')",
            (draft_id, master_id, uid),
        )
        for i, (section_type, section_title) in enumerate(DEFAULT_PROFILE_SECTIONS):
            _insert_section(
                cur, user_id=uid, master_id=master_id, version_id=draft_id,
                section_type=section_type, title=section_title,
                content=default_content(section_type), sort_order=i,
            )
        conn.commit()
    finally:
        conn.close()
    return get_resume_tree(uid, master_id)


def create_profile_from_sections(
    user_id: str, sections: list[dict], title: str, origin: str = "manual", confidence_score: Optional[int] = None
) -> dict:
    """Create a new Master Profile from an explicit section list (used by the tailor
    'new tailored profile' flow, resume generation, profile import, and duplication —
    so the source profile is always left untouched)."""
    uid = str(user_id)
    master_id = _new_id()
    draft_id = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO resume_master (id, user_id, title, current_draft_id, is_profile, origin, confidence_score) "
            "VALUES (?, ?, ?, ?, 1, ?, ?)",
            (master_id, uid, title or "Tailored Profile", draft_id, origin, confidence_score),
        )
        cur.execute(
            "INSERT INTO resume_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'tailor')",
            (draft_id, master_id, uid),
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


def replace_profile_sections(
    user_id: str, profile_id: str, sections: list[dict], mode: str = "replace"
) -> Optional[dict]:
    """Populate a profile's draft from an imported section list.

    mode='replace' wipes the profile's current draft sections first (callers
    should snapshot beforehand for undo — see views_router); mode='append' adds
    the new sections after the existing ones. Returns the refreshed profile tree,
    or None if the id isn't the caller's profile.
    """
    uid = str(user_id)
    master = get_master(uid, profile_id)
    if master is None or not master.get("is_profile"):
        return None
    draft_id = master["current_draft_id"]
    conn = _connect()
    try:
        cur = conn.cursor()
        if mode == "append":
            cur.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM resume_sections WHERE master_id = ? AND version_id = ?",
                (profile_id, draft_id),
            )
            base = cur.fetchone()[0] + 1
        else:  # replace
            cur.execute(
                "DELETE FROM resume_sections WHERE master_id = ? AND version_id = ? AND user_id = ?",
                (profile_id, draft_id, uid),
            )
            base = 0
        for i, s in enumerate(sections):
            _insert_section(
                cur, user_id=uid, master_id=profile_id, version_id=draft_id,
                section_type=s.get("section_type", "custom"), title=s.get("title"),
                content=s.get("content", {}), sort_order=base + i,
                is_hidden=bool(s.get("is_hidden", False)),
            )
        _touch_master(cur, uid, profile_id)
        conn.commit()
    finally:
        conn.close()
    return get_resume_tree(uid, profile_id)


def list_profiles(user_id: str, include_archived: bool = False) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        archived_clause = "" if include_archived else "AND is_archived = 0"
        cur.execute(
            f"SELECT {_MASTER_COLS} FROM resume_master WHERE user_id = ? AND is_deleted = 0 AND is_profile = 1 {archived_clause} ORDER BY updated_at DESC",
            (str(user_id),),
        )
        masters = [_master_to_dict(r) for r in cur.fetchall()]
        for m in masters:
            cur.execute(
                "SELECT COUNT(*) FROM resume_sections WHERE master_id = ? AND version_id = ?",
                (m["id"], m["current_draft_id"]),
            )
            m["section_count"] = cur.fetchone()[0]
        return masters
    finally:
        conn.close()


def set_profile_archived(user_id: str, profile_id: str, archived: bool) -> Optional[dict]:
    """Archive/unarchive a profile — hides it from the default selector without deleting it."""
    uid = str(user_id)
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE resume_master SET is_archived = ?, updated_at = datetime('now') "
            "WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0",
            (1 if archived else 0, profile_id, uid),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_profile(uid, profile_id)


def duplicate_profile(user_id: str, profile_id: str, title: Optional[str] = None) -> Optional[dict]:
    """Clone a profile's current sections into a brand-new profile. Source untouched."""
    uid = str(user_id)
    source = get_profile(uid, profile_id)
    if source is None:
        return None
    return create_profile_from_sections(
        uid, source["sections"], title or f"{source['title']} (copy)",
        origin="duplicate", confidence_score=source.get("confidence_score"),
    )


_METADATA_SCALAR_FIELDS = {"primary_role", "experience_level", "target_industry", "confidence_score", "description"}
_METADATA_JSON_FIELDS = {"target_roles", "target_companies", "tags", "tech_stack"}


def update_profile_metadata(user_id: str, profile_id: str, fields: dict) -> Optional[dict]:
    """Partial update of a profile's metadata (role, seniority, target roles/companies,
    tags, …). Unknown keys in `fields` are silently ignored."""
    uid = str(user_id)
    sets: list[str] = []
    params: list = []
    for key, value in fields.items():
        if key in _METADATA_SCALAR_FIELDS:
            sets.append(f"{key} = ?")
            params.append(value)
        elif key in _METADATA_JSON_FIELDS:
            sets.append(f"{key} = ?")
            params.append(json.dumps(value if isinstance(value, list) else []))
    if not sets:
        return get_profile(uid, profile_id)
    sets.append("updated_at = datetime('now')")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE resume_master SET {', '.join(sets)} WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0",
            (*params, profile_id, uid),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_profile(uid, profile_id)


def touch_profile(user_id: str, profile_id: str) -> bool:
    """Mark a profile as just-used — called when the Profile Selector selects it."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE resume_master SET last_used_at = datetime('now') "
            "WHERE id = ? AND user_id = ? AND is_profile = 1 AND is_deleted = 0",
            (profile_id, str(user_id)),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_profile(user_id: str, profile_id: str) -> Optional[dict]:
    """Fetch a profile tree, verifying it is actually a profile row."""
    master = get_master(user_id, profile_id)
    if master is None or not master.get("is_profile"):
        return None
    return get_resume_tree(user_id, profile_id)


def list_resumes(user_id: str) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_MASTER_COLS} FROM resume_master WHERE user_id = ? AND is_deleted = 0 AND COALESCE(is_profile, 0) = 0 ORDER BY updated_at DESC",
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


def set_resume_template(user_id: str, master_id: str, template_key: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE resume_master SET template_key = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (template_key, master_id, str(user_id)),
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


def add_section(user_id: str, master_id: str, section_type: str, title: Optional[str], content: Any = None, source: Optional[str] = None) -> Optional[dict]:
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
            sort_order=next_order, source=source,
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
    if "source" in fields:
        sets.append("source = ?")
        params.append(fields["source"])
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
