"""Video links on AI LMS classes, subjects and the modules of a project.

Shared content: an instructor or admin (the `ai_lms:edit` permission, checked by the router's gate) adds links and every
signed-in user sees them.

- A class or a subject (a project is a subject with kind='project') keeps its links in `lms_videos`, one row per link,
  ordered by `order_index`. `ref` is the class id or the subject id, so a class and a subject never share rows.
- A project's module or sub-step keeps its links INSIDE its outline entry (`lms_subjects.project_plan`, key `videos`:
  `[{url, title}]`), so they move with the entry when it is reordered, inserted around or generated. Only the module
  endpoints write that key; `_parse_plan_item` in db.py keeps it through every read.

Only a link and an optional title are stored. The provider, playlist or video, start time and embed address are derived
from the link in the browser (frontend/src/lib/video/videoLinks.ts). The link rules are in modules/common/video_links.py.

Twin: frontend/fe-apis/lms/videos.ts (+ videosSchema.ts). Same tables, limits, validation texts and status codes, so
change both. No FastAPI import on purpose: this module runs against a database copy with a bare interpreter (see
backend/tests/videos_test.py); the router in router.py only turns `VideoError` into an HTTPException.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

from modules.common.db import get_db_path
from modules.common.video_links import (
    DUPLICATE_ERROR,
    LIMIT_ERROR,
    MAX_PER_ITEM,
    VideoError,
    clean_title,
    clean_url,
    now_iso,
)

SCOPES = ("class", "subject")
SCOPE_ERROR = "Field 'scope' must be one of: class, subject"
REF_ERROR = "Field 'ref' is required"
REF_MAX = 100
NOTHING_TO_CHANGE = "Send a url or a title to change."
MODULE_NOT_FOUND = "Module not found in this project's outline."
SUBLESSON_NOT_FOUND = "Sublesson not found in this module."
LIST_ERROR = "Field 'videos' must be a list."

__all__ = ["VideoError"]


# ── Schema ─────────────────────────────────────────────────────────────────────


def ensure_tables(cursor: sqlite3.Cursor) -> None:
    """CREATE TABLE IF NOT EXISTS. Called from init_lms_db and before every query here."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lms_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL CHECK (scope IN ('class', 'subject')),
            ref TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            order_index INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL
        );
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_videos_item ON lms_videos(scope, ref, order_index);")


def purge_class(cursor: sqlite3.Cursor, class_id: str) -> None:
    """A deleted class takes its own links and those of its subjects with it. Call before the subjects are removed."""
    ensure_tables(cursor)
    cursor.execute(
        "DELETE FROM lms_videos WHERE scope = 'subject' AND ref IN (SELECT id FROM lms_subjects WHERE class_id = ?)",
        (class_id,),
    )
    cursor.execute("DELETE FROM lms_videos WHERE scope = 'class' AND ref = ?", (class_id,))


def purge_subject(cursor: sqlite3.Cursor, subject_id: str) -> None:
    ensure_tables(cursor)
    cursor.execute("DELETE FROM lms_videos WHERE scope = 'subject' AND ref = ?", (subject_id,))


# ── Helpers ────────────────────────────────────────────────────────────────────


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        ensure_tables(conn.cursor())
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _row(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "url": row["url"],
        "title": row["title"],
        "order_index": row["order_index"],
        "created_at": row["created_at"],
    }


def check_scope(scope: Any) -> str:
    if not isinstance(scope, str) or scope not in SCOPES:
        raise VideoError(422, SCOPE_ERROR)
    return scope


def check_ref(ref: Any) -> str:
    if not isinstance(ref, str) or not ref.strip() or len(ref) > REF_MAX:
        raise VideoError(422, REF_ERROR)
    return ref.strip()


def _resolve_ref(conn: sqlite3.Connection, scope: str, ref: str) -> str:
    """The canonical id of the class (id or slug) or subject (id) a link hangs on; 404 when it does not exist."""
    if scope == "class":
        row = conn.execute("SELECT id FROM lms_classes WHERE id = ? OR slug = ?", (ref, ref)).fetchone()
        if row is None:
            raise VideoError(404, "Class not found.")
        return row["id"]
    row = conn.execute("SELECT id FROM lms_subjects WHERE id = ?", (ref,)).fetchone()
    if row is None:
        raise VideoError(404, "Subject not found.")
    return row["id"]


def _list(conn: sqlite3.Connection, scope: str, ref_id: str) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM lms_videos WHERE scope = ? AND ref = ? ORDER BY order_index ASC, id ASC", (scope, ref_id)
    ).fetchall()
    return [_row(r) for r in rows]


# ── Class and subject links ────────────────────────────────────────────────────


def list_videos(scope: Any, ref: Any) -> Dict[str, Any]:
    scope = check_scope(scope)
    ref = check_ref(ref)
    with _db() as conn:
        return {"videos": _list(conn, scope, _resolve_ref(conn, scope, ref))}


def add_video(payload: Dict[str, Any], user_id: Optional[int]) -> Dict[str, Any]:
    """Checks run in this order in both twins: scope, ref, url, title, existence (404), limit (422), duplicate (409)."""
    scope = check_scope(payload.get("scope"))
    ref = check_ref(payload.get("ref"))
    url = clean_url(payload.get("url"))
    title = clean_title(payload.get("title"))
    with _db() as conn:
        ref_id = _resolve_ref(conn, scope, ref)
        existing = _list(conn, scope, ref_id)
        if len(existing) >= MAX_PER_ITEM:
            raise VideoError(422, LIMIT_ERROR)
        if any(v["url"] == url for v in existing):
            raise VideoError(409, DUPLICATE_ERROR)
        order_index = (existing[-1]["order_index"] + 1) if existing else 0
        cursor = conn.execute(
            "INSERT INTO lms_videos (scope, ref, url, title, order_index, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (scope, ref_id, url, title, order_index, user_id, now_iso()),
        )
        return _row(conn.execute("SELECT * FROM lms_videos WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_video(video_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    has_url = "url" in payload
    has_title = "title" in payload
    if not has_url and not has_title:
        raise VideoError(422, NOTHING_TO_CHANGE)
    url = clean_url(payload.get("url")) if has_url else None
    title = clean_title(payload.get("title")) if has_title else None
    with _db() as conn:
        current = conn.execute("SELECT * FROM lms_videos WHERE id = ?", (video_id,)).fetchone()
        if current is None:
            raise VideoError(404, "Video not found.")
        if url is not None and url != current["url"]:
            clash = conn.execute(
                "SELECT 1 FROM lms_videos WHERE scope = ? AND ref = ? AND url = ? AND id != ?",
                (current["scope"], current["ref"], url, video_id),
            ).fetchone()
            if clash is not None:
                raise VideoError(409, DUPLICATE_ERROR)
        conn.execute(
            "UPDATE lms_videos SET url = ?, title = ? WHERE id = ?",
            (url if url is not None else current["url"], title if title is not None else current["title"], video_id),
        )
        return _row(conn.execute("SELECT * FROM lms_videos WHERE id = ?", (video_id,)).fetchone())


def delete_video(video_id: int) -> Dict[str, Any]:
    with _db() as conn:
        cursor = conn.execute("DELETE FROM lms_videos WHERE id = ?", (video_id,))
        if cursor.rowcount == 0:
            raise VideoError(404, "Video not found.")
    return {"message": "Video removed"}


def reorder_videos(payload: Dict[str, Any]) -> Dict[str, Any]:
    """The listed ids first, in the order given (ids that are not this item's, or repeated, are ignored); every link
    not listed keeps its relative order after them. Answers with the new list."""
    scope = check_scope(payload.get("scope"))
    ref = check_ref(payload.get("ref"))
    raw_ids = payload.get("ids")
    # JSON `1.0` is a float here and the integer 1 in JavaScript: accept whole numbers either way (like Number.isInteger).
    if not isinstance(raw_ids, list) or not all(
        isinstance(i, (int, float)) and not isinstance(i, bool) and float(i).is_integer() for i in raw_ids
    ):
        raise VideoError(422, "Field 'ids' must be a list of video ids.")
    ids = [int(i) for i in raw_ids]
    with _db() as conn:
        ref_id = _resolve_ref(conn, scope, ref)
        current = _list(conn, scope, ref_id)
        known = {v["id"] for v in current}
        first = list(dict.fromkeys(i for i in ids if i in known))
        order = first + [v["id"] for v in current if v["id"] not in set(first)]
        for index, video_id in enumerate(order):
            conn.execute("UPDATE lms_videos SET order_index = ? WHERE id = ?", (index, video_id))
        return {"videos": _list(conn, scope, ref_id)}


# ── Project module / sub-step links (inside the outline) ───────────────────────


def clean_plan_videos(raw: Any) -> List[Dict[str, str]]:
    """What a stored outline entry's `videos` becomes when it is read: valid, de-duplicated, at most 20. An entry that
    no longer passes the rules is dropped quietly (reading never fails). Used by db.py's `_parse_plan_item`."""
    if not isinstance(raw, list):
        return []
    videos: List[Dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            url = clean_url(item.get("url"))
            title = clean_title(item.get("title"))
        except VideoError:
            continue
        if any(v["url"] == url for v in videos):
            continue
        videos.append({"url": url, "title": title})
        if len(videos) >= MAX_PER_ITEM:
            break
    return videos


def validate_video_list(raw: Any) -> List[Dict[str, str]]:
    """The body of a module's `PUT .../videos`: the whole new list, checked. Errors say which video (1-based)."""
    if not isinstance(raw, list):
        raise VideoError(422, LIST_ERROR)
    if len(raw) > MAX_PER_ITEM:
        raise VideoError(422, LIMIT_ERROR)
    videos: List[Dict[str, str]] = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise VideoError(422, f"Video {index}: send an object with a url.")
        try:
            url = clean_url(item.get("url"))
            title = clean_title(item.get("title"))
        except VideoError as exc:
            raise VideoError(exc.status_code, f"Video {index}: {exc.detail}") from None
        if any(v["url"] == url for v in videos):
            raise VideoError(409, DUPLICATE_ERROR)
        videos.append({"url": url, "title": title})
    return videos


def set_plan_item_videos(
    plan: List[Dict[str, Any]], module_index: int, sub_index: Optional[int], raw_videos: Any
) -> List[Dict[str, Any]]:
    """The outline with one module's (or one sub-step's) `videos` replaced. Everything else in the entry is untouched."""
    if module_index < 0 or module_index >= len(plan):
        raise VideoError(404, MODULE_NOT_FOUND)
    module = plan[module_index]
    if sub_index is None:
        videos = validate_video_list(raw_videos)
        plan[module_index] = {**module, "videos": videos}
        return plan
    subs = list(module.get("sublessons") or [])
    if sub_index < 0 or sub_index >= len(subs):
        raise VideoError(404, SUBLESSON_NOT_FOUND)
    videos = validate_video_list(raw_videos)
    subs[sub_index] = {**subs[sub_index], "videos": videos}
    plan[module_index] = {**module, "sublessons": subs}
    return plan
