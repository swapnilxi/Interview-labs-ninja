"""Video links on lab pages (a topic's page, or one of its subtopics).

Like a user's saved sections, progress and settings, they belong to the signed-in user alone: nobody else sees them,
and another user's id answers 404. The one exception: an admin or superadmin can add a link "for everyone" (stored with
user_id = SHARED_USER, which no real user has); everybody sees those, only an admin removes them. One row per link in `lab_page_videos`, ordered by `order_index`. `subtopic_id` is ''
for the topic's own page (not NULL, as in the other lab tables). Any lab key works, DSA problems included.

A link is stored with its url and an optional title; the provider, playlist or video, start time and embed address are
derived from the url in the browser (frontend/src/lib/video/videoLinks.ts). On top of that an admin can give a link a
`preview_image` (an https link, or an uploaded image as a data URL up to 200 KB), a card `shape` (wide, side or slim;
default wide) and an `icon` (a slug from LINK_ICONS, '' = picked from the url in the browser). The owner of a link sets
all three on it (an admin also on the shared ones); only the audience ("only me" / "everyone") is admin-only (403). The link
rules are in modules/common/video_links.py, shared with AI LMS (modules/ai_lms/videos.py).

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
    DEFAULT_SHAPE,
    DUPLICATE_ERROR,
    LIMIT_ERROR,
    MAX_PER_ITEM,
    SHARED_ERROR,
    VideoError,
    clean_preview_image,
    clean_shape,
    clean_title,
    clean_url,
    now_iso,
)

__all__ = ["VideoError"]

SHARED_USER = 0  # user_id of a link an admin added for everyone

NOTHING_TO_CHANGE = "Send a title, a preview image, a shape, an icon or shared to change."
NOT_ADMIN_SHARE = "Only an admin can add a video for everyone."
NOT_ADMIN_PATCH = "Only an admin can change who sees a link."

# The icons a card can show for its kind of link; '' = guess from the url. Same list in fe-apis/labSections/videos.ts.
LINK_ICONS = (
    "link", "video", "article", "doc", "pdf", "code", "repo", "slides", "sheet", "book", "course", "image", "audio", "tool",
)
ICON_ERROR = "icon must be one of: " + ", ".join(LINK_ICONS) + " (or empty)."


def clean_icon(raw: Any) -> str | None:
    """None = not sent; '' = automatic."""
    if raw is None:
        return None
    if not isinstance(raw, str) or (raw != "" and raw not in LINK_ICONS):
        raise VideoError(422, ICON_ERROR)
    return raw


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
            created_at TEXT NOT NULL,
            preview_image TEXT NOT NULL DEFAULT '',
            shape TEXT NOT NULL DEFAULT 'wide'
        );
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_lab_page_videos_page ON lab_page_videos(user_id, lab_name, topic_id, subtopic_id, order_index);"
    )
    # A table made before preview images and shapes existed gets the two columns (the repo's migration idiom).
    cursor.execute("PRAGMA table_info(lab_page_videos);")
    have = {row[1] for row in cursor.fetchall()}
    if "preview_image" not in have:
        cursor.execute("ALTER TABLE lab_page_videos ADD COLUMN preview_image TEXT NOT NULL DEFAULT ''")
    if "shape" not in have:
        cursor.execute("ALTER TABLE lab_page_videos ADD COLUMN shape TEXT NOT NULL DEFAULT 'wide'")
    if "icon" not in have:
        cursor.execute("ALTER TABLE lab_page_videos ADD COLUMN icon TEXT NOT NULL DEFAULT ''")


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
        "preview_image": row["preview_image"],
        "shape": row["shape"],
        "icon": row["icon"],
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
    user_id: int,
    lab: str,
    topic_id: str,
    subtopic_id: str,
    url_raw: Any,
    title_raw: Any,
    shared: bool = False,
    preview_raw: Any = None,
    shape_raw: Any = None,
    icon_raw: Any = None,
) -> Dict[str, Any]:
    """Checks run in this order in both twins (after the router has checked lab and page ids): url, title, shape, preview
    image, icon (all 422), admin (403: `shared`), limit (422), duplicate (409). The limit counts
    the bucket being added to (the caller's own, or the shared one); the duplicate check looks at everything the caller sees.
    `preview_raw` None or '' and `shape_raw` None mean "not sent"."""
    url = clean_url(url_raw)
    title = clean_title(title_raw)
    shape = clean_shape(shape_raw)
    preview = clean_preview_image(preview_raw)
    icon = clean_icon(icon_raw) or ""
    if shared and not _is_admin(user_id):
        raise VideoError(403, NOT_ADMIN_SHARE)
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
            INSERT INTO lab_page_videos
                (user_id, lab_name, topic_id, subtopic_id, url, title, order_index, created_at, preview_image, shape, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (owner, lab, topic_id, subtopic_id, url, title, order_index, now_iso(), preview, shape or DEFAULT_SHAPE, icon),
        )
        return _row(conn.execute("SELECT * FROM lab_page_videos WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_video(
    user_id: int,
    video_id: int,
    title_raw: Any = None,
    preview_raw: Any = None,
    shape_raw: Any = None,
    shared_raw: Any = None,
    icon_raw: Any = None,
) -> Dict[str, Any]:
    """Change one link. A field that is None (not sent) is left alone; a title of '' clears the title, a preview image of ''
    removes the image and an icon of '' goes back to automatic. Checks, in this order in both twins: nothing sent (422),
    title, shape, preview image, icon, shared (422), the link is the caller's own or an admin's shared one (404 otherwise,
    like a missing id), admin for shared (403), then for a change of audience: limit of the target bucket (422), duplicate
    (409)."""
    if title_raw is None and preview_raw is None and shape_raw is None and shared_raw is None and icon_raw is None:
        raise VideoError(422, NOTHING_TO_CHANGE)
    title = clean_title(title_raw) if title_raw is not None else None
    shape = clean_shape(shape_raw)
    preview = clean_preview_image(preview_raw) if preview_raw is not None else None
    icon = clean_icon(icon_raw)
    if shared_raw is not None and not isinstance(shared_raw, bool):
        raise VideoError(422, SHARED_ERROR)
    admin = _is_admin(user_id)
    with _db() as conn:
        owners = (user_id, SHARED_USER) if admin else (user_id,)
        row = conn.execute(
            f"SELECT * FROM lab_page_videos WHERE id = ? AND user_id IN ({','.join('?' * len(owners))})", (video_id, *owners)
        ).fetchone()
        if row is None:
            raise VideoError(404, "Video not found.")
        if shared_raw is not None and not admin:
            raise VideoError(403, NOT_ADMIN_PATCH)
        owner = row["user_id"]
        order_index = row["order_index"]
        if shared_raw is not None and shared_raw != (owner == SHARED_USER):
            target = SHARED_USER if shared_raw else user_id
            bucket = _page(conn, target, row["lab_name"], row["topic_id"], row["subtopic_id"], only_user=True)
            if len(bucket) >= MAX_PER_ITEM:
                raise VideoError(422, LIMIT_ERROR)
            seen = _page(conn, user_id, row["lab_name"], row["topic_id"], row["subtopic_id"])
            if any(v["url"] == row["url"] and v["id"] != video_id for v in seen):
                raise VideoError(409, DUPLICATE_ERROR)
            owner = target
            order_index = (bucket[-1]["order_index"] + 1) if bucket else 0
        conn.execute(
            "UPDATE lab_page_videos SET user_id = ?, order_index = ?, title = ?, preview_image = ?, shape = ?, icon = ? WHERE id = ?",
            (
                owner,
                order_index,
                row["title"] if title is None else title,
                row["preview_image"] if preview is None else preview,
                row["shape"] if shape is None else shape,
                row["icon"] if icon is None else icon,
                video_id,
            ),
        )
        return _row(conn.execute("SELECT * FROM lab_page_videos WHERE id = ?", (video_id,)).fetchone())


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
