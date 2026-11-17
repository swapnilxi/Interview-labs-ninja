"""Video links on lab pages (a topic's page, or one of its subtopics).

Like a user's saved sections, progress and settings, they belong to the signed-in user alone: nobody else sees them,
and another user's id answers 404. The one exception: an admin or superadmin can add a link "for everyone" (stored with
user_id = SHARED_USER, which no real user has); everybody sees those, only an admin removes them. One row per link in `lab_page_videos`, ordered by `order_index`. `subtopic_id` is ''
for the topic's own page (not NULL, as in the other lab tables). Any lab key works, DSA problems included.

Only a link and an optional title are stored; the provider, playlist or video, start time and embed address are derived
from the link in the browser (frontend/src/lib/video/videoLinks.ts). The link rules are in
modules/common/video_links.py, shared with AI LMS (modules/ai_lms/videos.py).

Twin: frontend/fe-apis/labSections/videos.ts (+ videosSchema.ts). Same table, limits, validation texts and status
codes, so change both. No FastAPI import on purpose: this module runs against a database copy with a bare interpreter
(see backend/tests/videos_test.py); the router in router.py only turns `VideoError` into an HTTPException.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List

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

__all__ = ["VideoError"]

SHARED_USER = 0  # user_id of a link an admin added for everyone


def ensure_table(cursor: sqlite3.Cursor) -> None:
    """CREATE TABLE IF NOT EXISTS. Called from schema.register and before every query here."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lab_page_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            lab_name TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            subtopic_id TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            order_index INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_lab_page_videos_page ON lab_page_videos(user_id, lab_name, topic_id, subtopic_id, order_index);"
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
        "shared": row["user_id"] == SHARED_USER,
        "id": row["id"],
        "url": row["url"],
        "title": row["title"],
        "order_index": row["order_index"],
        "created_at": row["created_at"],
    }


def _page(
    conn: sqlite3.Connection, user_id: int, lab: str, topic_id: str, subtopic_id: str, only_user: bool = False
) -> List[Dict[str, Any]]:
    """The links the caller sees: the shared ones first, then their own. `only_user`: just the rows of `user_id`
    (the shared bucket when that is SHARED_USER) -- what the limit and the order are counted over."""
    users = (user_id,) if only_user else (SHARED_USER, user_id)
    rows = conn.execute(
        f"""
        SELECT * FROM lab_page_videos
        WHERE user_id IN ({",".join("?" * len(users))}) AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
        ORDER BY (user_id = {SHARED_USER}) DESC, order_index ASC, id ASC
        """,
        (*users, lab, topic_id, subtopic_id),
    ).fetchall()
    return [_row(r) for r in rows]


def list_videos(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> Dict[str, Any]:
    with _db() as conn:
        return {"videos": _page(conn, user_id, lab, topic_id, subtopic_id)}


def add_video(
    user_id: int, lab: str, topic_id: str, subtopic_id: str, url_raw: Any, title_raw: Any, shared: bool = False
) -> Dict[str, Any]:
    """Checks run in this order in both twins (after the router has checked lab and page ids): url, title, admin (403,
    only when `shared`), limit (422), duplicate (409). The limit counts the bucket being added to (the caller's own, or
    the shared one); the duplicate check looks at everything the caller sees."""
    url = clean_url(url_raw)
    title = clean_title(title_raw)
    if shared and not _is_admin(user_id):
        raise VideoError(403, "Only an admin can add a video for everyone.")
    owner = SHARED_USER if shared else user_id
    with _db() as conn:
        existing = _page(conn, owner, lab, topic_id, subtopic_id, only_user=True)
        if len(existing) >= MAX_PER_ITEM:
            raise VideoError(422, LIMIT_ERROR)
        if any(v["url"] == url for v in _page(conn, user_id, lab, topic_id, subtopic_id)):
            raise VideoError(409, DUPLICATE_ERROR)
        order_index = (existing[-1]["order_index"] + 1) if existing else 0
        cursor = conn.execute(
            """
            INSERT INTO lab_page_videos (user_id, lab_name, topic_id, subtopic_id, url, title, order_index, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (owner, lab, topic_id, subtopic_id, url, title, order_index, now_iso()),
        )
        return _row(conn.execute("SELECT * FROM lab_page_videos WHERE id = ?", (cursor.lastrowid,)).fetchone())


def delete_video(user_id: int, video_id: int) -> Dict[str, Any]:
    """Own rows only (an admin also the shared ones): someone else's id is a 404, exactly like an id that does not exist."""
    with _db() as conn:
        owners = (user_id, SHARED_USER) if _is_admin(user_id) else (user_id,)
        cursor = conn.execute(
            f"DELETE FROM lab_page_videos WHERE id = ? AND user_id IN ({','.join('?' * len(owners))})", (video_id, *owners)
        )
        if cursor.rowcount == 0:
            raise VideoError(404, "Video not found.")
    return {"message": "Video removed"}
