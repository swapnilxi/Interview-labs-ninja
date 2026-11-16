"""Class membership and class updates (announcements) for AI LMS.

Who is "into" a class: a learner either joins it (`enrolled`) or shows interest by turning on its practice
reminders (`interested`); both are rows of `lms_class_members`. An instructor or admin (the `ai_lms:edit`
permission, checked by the router's gate) can send an update to the people of one class or to everyone who is in
any class. An update is fanned out when it is sent: one `lms_notifications` row plus one
`lms_notification_recipients` row per person. The recipient row's integer id is the cursor the browser polls with
(`inbox`), and it is how the app's notification centre receives the update.

Twin: frontend/fe-apis/lms/updates.ts (the Next.js layer, which also sends the device push; there is no push here).
Same tables, limits, validation texts and status codes, so change both.

No FastAPI import on purpose: this module runs against a database copy with a bare interpreter (see
backend/tests/lms_updates_test.py). The router in router.py only turns `UpdateError` into an HTTPException.
"""

from __future__ import annotations

import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterator, List, Optional

from modules.common.db import get_db_path

MEMBER_STATUSES = ("enrolled", "interested")
SCOPES = ("class", "ai-lms")

TITLE_MAX = 120
BODY_MAX = 1000
LINK_MAX = 300
SENDS_PER_HOUR = 30
# The first time a browser asks for its updates it only gets the last few days, so a new device is not flooded.
FIRST_SYNC_DAYS = 3
INBOX_DEFAULT_LIMIT = 20
INBOX_MAX_LIMIT = 50
RECENT_LIMIT = 20
MODULE_LINK = "/ai-lms"

# Control characters other than tab, newline and carriage return (those are handled per field).
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
# An in-app path: one leading slash (never `//`), no backslash, no whitespace, no control characters.
_LINK_OK = re.compile(r"/(?!/)[^\\\s\x00-\x1f\x7f-\x9f]*")

# Only people who can still log in are notified: the account exists and is approved.
_NOTIFIABLE = "JOIN users u ON u.id = m.user_id AND COALESCE(u.status, 'approved') = 'approved'"


class UpdateError(Exception):
    """A request the caller can fix. `status_code` and `detail` go straight into the HTTP response."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# ── Schema ─────────────────────────────────────────────────────────────────────


def ensure_tables(cursor: sqlite3.Cursor) -> None:
    """CREATE TABLE IF NOT EXISTS for the three tables. Called from init_lms_db and before every query here."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lms_class_members (
            class_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('enrolled', 'interested')),
            joined_at TEXT NOT NULL,
            PRIMARY KEY (class_id, user_id)
        );
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_class_members_user ON lms_class_members(user_id);")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lms_notifications (
            id TEXT PRIMARY KEY,
            scope TEXT NOT NULL CHECK (scope IN ('class', 'ai-lms')),
            class_id TEXT,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            link TEXT NOT NULL DEFAULT '',
            sender_id INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_notifications_class ON lms_notifications(class_id, created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_notifications_sender ON lms_notifications(sender_id, created_at);")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lms_notification_recipients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notification_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            UNIQUE (notification_id, user_id)
        );
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_lms_notif_recipients_user ON lms_notification_recipients(user_id, id);"
    )


def purge_class(cursor: sqlite3.Cursor, class_id: str) -> None:
    """Remove what a deleted class leaves behind. Its own updates go with it; a module-wide update that was merely
    sent from this class stays (and loses the class)."""
    ensure_tables(cursor)
    cursor.execute(
        "DELETE FROM lms_notification_recipients WHERE notification_id IN "
        "(SELECT id FROM lms_notifications WHERE scope = 'class' AND class_id = ?)",
        (class_id,),
    )
    cursor.execute("DELETE FROM lms_notifications WHERE scope = 'class' AND class_id = ?", (class_id,))
    cursor.execute("UPDATE lms_notifications SET class_id = NULL WHERE class_id = ?", (class_id,))
    cursor.execute("DELETE FROM lms_class_members WHERE class_id = ?", (class_id,))


# ── Helpers ────────────────────────────────────────────────────────────────────


def _iso(moment: datetime) -> str:
    """YYYY-MM-DDTHH:MM:SS.mmmZ: the text JavaScript's toISOString() gives, so both twins store the same shape."""
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def now_iso() -> str:
    return _iso(datetime.now(timezone.utc))


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


def _resolve_class(conn: sqlite3.Connection, id_or_slug: str) -> Dict[str, str]:
    row = conn.execute("SELECT id, slug, name FROM lms_classes WHERE id = ? OR slug = ?", (id_or_slug, id_or_slug)).fetchone()
    if row is None:
        raise UpdateError(404, "Class not found.")
    return {"id": row["id"], "slug": row["slug"], "name": row["name"]}


def clean_title(value: str) -> str:
    """One line: line breaks and tabs become spaces, other control characters go, the ends are trimmed."""
    return _CONTROL.sub("", re.sub(r"[\r\n\t]+", " ", value)).strip()


def clean_body(value: str) -> str:
    """Line breaks stay (as \\n); other control characters go; the ends are trimmed."""
    return _CONTROL.sub("", re.sub(r"\r\n?", "\n", value)).strip()


def valid_link(link: str) -> bool:
    return len(link) <= LINK_MAX and _LINK_OK.fullmatch(link) is not None


# ── Membership ─────────────────────────────────────────────────────────────────


def _membership_view(conn: sqlite3.Connection, class_id: str, user_id: int) -> Dict[str, Any]:
    counts = {"enrolled": 0, "interested": 0}
    for row in conn.execute(
        f"SELECT m.status AS status, COUNT(*) AS n FROM lms_class_members m {_NOTIFIABLE} WHERE m.class_id = ? GROUP BY m.status",
        (class_id,),
    ):
        counts[row["status"]] = row["n"]
    module_total = conn.execute(f"SELECT COUNT(DISTINCT m.user_id) FROM lms_class_members m {_NOTIFIABLE}").fetchone()[0]
    mine = conn.execute("SELECT status FROM lms_class_members WHERE class_id = ? AND user_id = ?", (class_id, user_id)).fetchone()
    in_any = conn.execute("SELECT 1 FROM lms_class_members WHERE user_id = ? LIMIT 1", (user_id,)).fetchone()
    member_count = counts["enrolled"] + counts["interested"]
    return {
        "status": mine["status"] if mine else None,
        "enrolled_count": counts["enrolled"],
        "interested_count": counts["interested"],
        "member_count": member_count,
        "module_member_count": module_total,
        # What a send from this user would reach: the same people without the sender.
        "audience_count": member_count - (1 if mine else 0),
        "module_audience_count": module_total - (1 if in_any else 0),
    }


def get_membership(class_id_or_slug: str, user_id: int) -> Dict[str, Any]:
    with _db() as conn:
        cls = _resolve_class(conn, class_id_or_slug)
        return _membership_view(conn, cls["id"], user_id)


def set_membership(class_id_or_slug: str, user_id: int, status: Any) -> Dict[str, Any]:
    """Join (`enrolled`) or show interest (`interested`). Interest never downgrades an enrolment."""
    if status not in MEMBER_STATUSES:
        raise UpdateError(422, "Membership status must be 'enrolled' or 'interested'.")
    with _db() as conn:
        cls = _resolve_class(conn, class_id_or_slug)
        row = conn.execute("SELECT status FROM lms_class_members WHERE class_id = ? AND user_id = ?", (cls["id"], user_id)).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO lms_class_members (class_id, user_id, status, joined_at) VALUES (?, ?, ?, ?)",
                (cls["id"], user_id, status, now_iso()),
            )
        elif row["status"] == "interested" and status == "enrolled":
            conn.execute("UPDATE lms_class_members SET status = 'enrolled' WHERE class_id = ? AND user_id = ?", (cls["id"], user_id))
        return _membership_view(conn, cls["id"], user_id)


def remove_membership(class_id_or_slug: str, user_id: int) -> Dict[str, Any]:
    with _db() as conn:
        cls = _resolve_class(conn, class_id_or_slug)
        conn.execute("DELETE FROM lms_class_members WHERE class_id = ? AND user_id = ?", (cls["id"], user_id))
        return _membership_view(conn, cls["id"], user_id)


# ── Sending ────────────────────────────────────────────────────────────────────


def send_update(class_id_or_slug: str, sender_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Store an update and its recipients. Returns the response fields plus `recipient_ids`, `title`, `body` and
    `link` (the Next.js twin pushes to devices with those; the router here drops them)."""
    scope = payload.get("scope")
    if scope is None or scope == "":
        scope = "class"
    if scope not in SCOPES:
        raise UpdateError(422, "Choose who gets this update: this class or all of AI LMS.")

    raw_title = payload.get("title")
    title = clean_title(raw_title) if isinstance(raw_title, str) else ""
    if not title:
        raise UpdateError(422, "Add a title for the update.")
    if len(title) > TITLE_MAX:
        raise UpdateError(422, f"The title can be at most {TITLE_MAX} characters.")

    raw_body = payload.get("body")
    if raw_body is None:
        raw_body = ""
    if not isinstance(raw_body, str):
        raise UpdateError(422, "The message must be text.")
    body = clean_body(raw_body)
    if len(body) > BODY_MAX:
        raise UpdateError(422, f"The message can be at most {BODY_MAX} characters.")

    raw_link = payload.get("link")
    if raw_link is not None and not isinstance(raw_link, str):
        raw_link = "\x00"  # not text: fails the link check below
    link = (raw_link or "").strip()
    if link and not valid_link(link):
        raise UpdateError(422, "The link must be a page inside LabNinja, like /ai-lms/classes/ai.")

    with _db() as conn:
        cls = _resolve_class(conn, class_id_or_slug)
        since = _iso(datetime.now(timezone.utc) - timedelta(hours=1))
        sent = conn.execute(
            "SELECT COUNT(*) FROM lms_notifications WHERE sender_id = ? AND created_at > ?", (sender_id, since)
        ).fetchone()[0]
        if sent >= SENDS_PER_HOUR:
            raise UpdateError(429, f"You have sent {SENDS_PER_HOUR} updates in the last hour. Try again later.")

        if not link:
            link = f"/ai-lms/classes/{cls['slug']}" if scope == "class" else MODULE_LINK

        if scope == "class":
            rows = conn.execute(
                f"SELECT m.user_id AS user_id FROM lms_class_members m {_NOTIFIABLE} WHERE m.class_id = ? AND m.user_id != ? ORDER BY m.user_id",
                (cls["id"], sender_id),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT DISTINCT m.user_id AS user_id FROM lms_class_members m {_NOTIFIABLE} WHERE m.user_id != ? ORDER BY m.user_id",
                (sender_id,),
            ).fetchall()
        recipient_ids = [row["user_id"] for row in rows]

        notification_id = f"notif-{uuid.uuid4().hex[:12]}"
        conn.execute(
            "INSERT INTO lms_notifications (id, scope, class_id, title, body, link, sender_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (notification_id, scope, cls["id"], title, body, link, sender_id, now_iso()),
        )
        conn.executemany(
            "INSERT OR IGNORE INTO lms_notification_recipients (notification_id, user_id) VALUES (?, ?)",
            [(notification_id, user_id) for user_id in recipient_ids],
        )
    return {
        "id": notification_id,
        "scope": scope,
        "recipients": len(recipient_ids),
        "push": {"web": 0, "android": 0},
        "recipient_ids": recipient_ids,
        "title": title,
        "body": body,
        "link": link,
    }


def list_class_updates(class_id_or_slug: str) -> List[Dict[str, Any]]:
    """Updates sent from this class (its own and the module-wide ones sent from it), newest first."""
    with _db() as conn:
        cls = _resolve_class(conn, class_id_or_slug)
        rows = conn.execute(
            """
            SELECT n.id AS id, n.title AS title, n.body AS body, n.link AS link, n.scope AS scope, n.created_at AS created_at,
                   COALESCE(NULLIF(TRIM(u.display_name), ''), 'Instructor') AS sender_name,
                   (SELECT COUNT(*) FROM lms_notification_recipients r WHERE r.notification_id = n.id) AS recipient_count
            FROM lms_notifications n
            LEFT JOIN users u ON u.id = n.sender_id
            WHERE n.class_id = ?
            ORDER BY n.created_at DESC, n.rowid DESC
            LIMIT ?
            """,
            (cls["id"], RECENT_LIMIT),
        ).fetchall()
        return [dict(row) for row in rows]


# ── The caller's own updates ───────────────────────────────────────────────────

_INBOX_SELECT = """
    SELECT r.id AS cursor, n.id AS id, n.scope AS scope, c.slug AS class_slug, c.name AS class_name,
           n.title AS title, n.body AS body, n.link AS link, n.created_at AS created_at,
           COALESCE(NULLIF(TRIM(u.display_name), ''), 'Instructor') AS sender_name
    FROM lms_notification_recipients r
    JOIN lms_notifications n ON n.id = r.notification_id
    LEFT JOIN lms_classes c ON c.id = n.class_id
    LEFT JOIN users u ON u.id = n.sender_id
    WHERE r.user_id = ?
"""


def inbox(user_id: int, after: Optional[int] = None, limit: int = INBOX_DEFAULT_LIMIT) -> Dict[str, Any]:
    """The caller's updates, oldest first. With `after` (a cursor from an earlier call): what came after it. Without:
    the newest few from the last days, and `cursor` is the caller's newest recipient id so the next call can continue."""
    limit = max(1, min(INBOX_MAX_LIMIT, limit))
    with _db() as conn:
        if after is None:
            cutoff = _iso(datetime.now(timezone.utc) - timedelta(days=FIRST_SYNC_DAYS))
            rows = conn.execute(_INBOX_SELECT + " AND n.created_at >= ? ORDER BY r.id DESC LIMIT ?", (user_id, cutoff, limit)).fetchall()
            top = conn.execute("SELECT COALESCE(MAX(id), 0) FROM lms_notification_recipients WHERE user_id = ?", (user_id,)).fetchone()[0]
            return {"items": [dict(row) for row in reversed(rows)], "cursor": top}
        rows = conn.execute(_INBOX_SELECT + " AND r.id > ? ORDER BY r.id ASC LIMIT ?", (user_id, after, limit)).fetchall()
        items = [dict(row) for row in rows]
        return {"items": items, "cursor": items[-1]["cursor"] if items else after}
