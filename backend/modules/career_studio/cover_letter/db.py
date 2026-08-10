"""Cover letters — a single generated letter tied to a profile.

Mirrors resume_master/resume_versions' draft-vs-immutable-snapshot idiom, but
for one text blob instead of a section tree: `cover_letters.content_text` is
the mutable draft, `cover_letter_versions` rows are frozen checkpoints.
"""

from __future__ import annotations

from typing import Optional

from ..shared.db import _connect, _new_id

_COLS = "id, user_id, profile_id, job_description_id, title, tone, content_text, created_at, updated_at"
_VERSION_COLS = "id, letter_id, user_id, label, content_text, created_at"


def _to_dict(r) -> dict:
    return {
        "id": r[0],
        "profile_id": r[2],
        "job_description_id": r[3],
        "title": r[4],
        "tone": r[5],
        "content_text": r[6],
        "created_at": r[7],
        "updated_at": r[8],
    }


def _version_to_dict(r) -> dict:
    return {"id": r[0], "letter_id": r[1], "label": r[3], "content_text": r[4], "created_at": r[5]}


def create_letter(user_id: str, profile_id: str, title: str, tone: str, content_text: str, job_description_id: Optional[str] = None) -> dict:
    uid = str(user_id)
    lid = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO cover_letters (id, user_id, profile_id, job_description_id, title, tone, content_text) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (lid, uid, profile_id, job_description_id, title, tone, content_text),
        )
        conn.commit()
    finally:
        conn.close()
    return get_letter(uid, lid)


def list_letters(user_id: str) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_COLS} FROM cover_letters WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC",
            (str(user_id),),
        )
        return [_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_letter(user_id: str, letter_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_COLS} FROM cover_letters WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (letter_id, str(user_id)),
        )
        row = cur.fetchone()
        return _to_dict(row) if row else None
    finally:
        conn.close()


def update_letter(user_id: str, letter_id: str, fields: dict) -> Optional[dict]:
    """Autosave-style partial update: title/tone/content_text, any subset."""
    uid = str(user_id)
    allowed = {"title", "tone", "content_text"}
    sets = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not sets:
        return get_letter(uid, letter_id)
    conn = _connect()
    try:
        cur = conn.cursor()
        assignments = ", ".join(f"{k} = ?" for k in sets)
        cur.execute(
            f"UPDATE cover_letters SET {assignments}, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (*sets.values(), letter_id, uid),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_letter(uid, letter_id)


def delete_letter(user_id: str, letter_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE cover_letters SET is_deleted = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
            (letter_id, str(user_id)),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ── Immutable version snapshots ──────────────────────────────────────────────────


def snapshot_version(user_id: str, letter_id: str, label: Optional[str] = None) -> Optional[dict]:
    uid = str(user_id)
    letter = get_letter(uid, letter_id)
    if letter is None:
        return None
    vid = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO cover_letter_versions (id, letter_id, user_id, label, content_text) VALUES (?, ?, ?, ?, ?)",
            (vid, letter_id, uid, label, letter["content_text"]),
        )
        conn.commit()
        cur.execute(f"SELECT {_VERSION_COLS} FROM cover_letter_versions WHERE id = ?", (vid,))
        return _version_to_dict(cur.fetchone())
    finally:
        conn.close()


def list_versions(user_id: str, letter_id: str) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_VERSION_COLS} FROM cover_letter_versions WHERE letter_id = ? AND user_id = ? ORDER BY created_at DESC",
            (letter_id, str(user_id)),
        )
        return [_version_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_version(user_id: str, version_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_VERSION_COLS} FROM cover_letter_versions WHERE id = ? AND user_id = ?",
            (version_id, str(user_id)),
        )
        row = cur.fetchone()
        return _version_to_dict(row) if row else None
    finally:
        conn.close()


def restore_version(user_id: str, letter_id: str, version_id: str) -> Optional[dict]:
    """Overwrite the letter's live content_text with a frozen snapshot's text."""
    uid = str(user_id)
    version = get_version(uid, version_id)
    if version is None or version["letter_id"] != letter_id:
        return None
    return update_letter(uid, letter_id, {"content_text": version["content_text"]})
