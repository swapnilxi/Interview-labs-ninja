"""Who sees a lab topic, the same rules in every lab (DSA, CV, System Design, Communication, Finance, Python, GenAI).

A topic is *shared* (`owner_id` NULL: the seed topics, and anything an admin shared) or one person's own (`owner_id` = their user
id). A person sees the shared topics plus their own. Changing a shared topic (moving it to another pattern, adding subtopics) does
not change it for everyone: it stores that person's own version in the lab's `<lab>_topic_overrides` table, and their topic list
returns that version in its place (`isModified`). An admin saves with `shared` to change the shared topic itself, or to make a
person's own topic everyone's.

One implementation, parameterised by the lab's table and its TopicShape (which columns a save writes). The Next.js twin is
frontend/fe-apis/labs/index.ts (`fetchOwned`, `saveOwned`, `deleteOwned`): same rules and the same error texts, change both.
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass
from typing import Any, Callable, List, Tuple

from modules.common.db import get_db_path


class TopicError(Exception):
    """The caller may not do this to the topic (or it does not exist); the routers turn it into an HTTP error."""

    status_code = 403


class TopicForbidden(TopicError):
    status_code = 403


class TopicNotFound(TopicError):
    status_code = 404


_TABLE_NAME = re.compile(r"^[a-z_]+_topics$")


def _check_table(table: str) -> str:
    # Table names come from code, never from a request; this guards the f-string SQL below anyway.
    if not _TABLE_NAME.match(table):
        raise ValueError(f"invalid topic table name: {table!r}")
    return table


def overrides_table(table: str) -> str:
    """`dsa_topics` -> `dsa_topic_overrides`."""
    return _check_table(table)[: -len("_topics")] + "_topic_overrides"


# ── The two shapes of topic table ──────────────────────────────────────────────


def _json_value(text: str, lenient: bool) -> Any:
    try:
        return json.loads(text)
    except Exception:
        if lenient:
            return []
        raise  # DSA lets json.loads raise, as it always did


@dataclass(frozen=True)
class TopicShape:
    """The columns of a lab's topic table that a save writes (besides `id` and `is_custom`), and how a row reads back."""

    columns: Tuple[str, ...]
    #: the same columns' definitions, for the overrides table
    ddl: str
    #: a request body (a dict) -> the values for `columns`
    to_values: Callable[[dict], tuple]
    #: (id, values for `columns`, is_custom) -> the API's topic dict
    to_dict: Callable[[str, tuple, bool], dict]


def _with_prerequisites(lenient: bool) -> TopicShape:
    def to_values(t: dict) -> tuple:
        return (
            t["name"], t["brief"], t["category"], t["difficulty"],
            json.dumps(t.get("prerequisites", [])), json.dumps(t.get("subtopics", [])),
        )

    def to_dict(topic_id: str, v: tuple, is_custom: bool) -> dict:
        return {
            "id": topic_id,
            "name": v[0],
            "brief": v[1],
            "category": v[2],
            "difficulty": v[3],
            "prerequisites": _json_value(v[4], lenient),
            "subtopics": _json_value(v[5], lenient),
            "isCustom": is_custom,
        }

    return TopicShape(
        columns=("name", "brief", "category", "difficulty", "prerequisites_json", "subtopics_json"),
        ddl=(
            "name TEXT NOT NULL, brief TEXT NOT NULL, category TEXT NOT NULL, difficulty TEXT NOT NULL, "
            "prerequisites_json TEXT NOT NULL DEFAULT '[]', subtopics_json TEXT NOT NULL DEFAULT '[]'"
        ),
        to_values=to_values,
        to_dict=to_dict,
    )


#: CV, Communication, Finance, Python, GenAI: a damaged JSON column reads as [].
PREREQUISITES = _with_prerequisites(lenient=True)
#: DSA: a damaged JSON column raises, as it always did.
PREREQUISITES_STRICT = _with_prerequisites(lenient=False)


def _system_design() -> TopicShape:
    def to_values(t: dict) -> tuple:
        return (
            t["name"], t["brief"], t["category"], t["scale"], t["difficulty"],
            1 if t.get("isLLD") else 0, json.dumps(t.get("subtopics", [])),
        )

    def to_dict(topic_id: str, v: tuple, is_custom: bool) -> dict:
        return {
            "id": topic_id,
            "name": v[0],
            "brief": v[1],
            "category": v[2],
            "scale": v[3],
            "difficulty": v[4],
            "isLLD": bool(v[5]),
            "subtopics": _json_value(v[6], True),
            "isCustom": is_custom,
        }

    return TopicShape(
        columns=("name", "brief", "category", "scale", "difficulty", "is_lld", "subtopics_json"),
        ddl=(
            "name TEXT NOT NULL, brief TEXT NOT NULL, category TEXT NOT NULL, scale TEXT NOT NULL DEFAULT 'N/A', "
            "difficulty TEXT NOT NULL, is_lld INTEGER NOT NULL DEFAULT 0, subtopics_json TEXT NOT NULL DEFAULT '[]'"
        ),
        to_values=to_values,
        to_dict=to_dict,
    )


SYSTEM_DESIGN = _system_design()


# ── Schema ─────────────────────────────────────────────────────────────────────


def ensure_ownership(cursor: sqlite3.Cursor, table: str, shape: TopicShape) -> None:
    """`owner_id` on the topic table (idempotent, the repo's PRAGMA + ALTER idiom) and the lab's overrides table."""
    table = _check_table(table)
    cursor.execute(f"PRAGMA table_info({table})")
    if "owner_id" not in [c[1] for c in cursor.fetchall()]:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN owner_id INTEGER DEFAULT NULL")
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {overrides_table(table)} (
            user_id INTEGER NOT NULL,
            topic_id TEXT NOT NULL,
            {shape.ddl},
            is_custom INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, topic_id)
        )
        """
    )


# ── Reads and writes ───────────────────────────────────────────────────────────


def is_admin_user(user_id: int) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    finally:
        conn.close()
    return bool(row) and row[0] in ("admin", "superadmin")


def fetch_owned(table: str, shape: TopicShape, user_id: int, order: str = "rowid") -> List[dict]:
    """The shared topics plus the caller's own, the caller's version of a shared one in its place. Seeded first, then the custom ones."""
    table = _check_table(table)
    if order not in ("rowid", "id"):
        raise ValueError(f"invalid order: {order!r}")
    cols = ", ".join(shape.columns)
    conn = sqlite3.connect(get_db_path())
    try:
        rows = conn.execute(
            f"SELECT id, {cols}, is_custom, owner_id FROM {table} WHERE owner_id IS NULL OR owner_id = ? "
            f"ORDER BY is_custom ASC, {order} ASC",
            (user_id,),
        ).fetchall()
        overrides = {
            r[0]: r
            for r in conn.execute(
                f"SELECT topic_id, {cols}, is_custom FROM {overrides_table(table)} WHERE user_id = ?", (user_id,)
            ).fetchall()
        }
    finally:
        conn.close()
    out = []
    for r in rows:
        shared = r[-1] is None  # shared = everyone sees it (seed topics and anything an admin shared); else the caller's own
        changed = shared and r[0] in overrides
        row = overrides[r[0]] if changed else r[:-1]
        topic = shape.to_dict(row[0], tuple(row[1:-1]), bool(row[-1]))
        topic["isShared"] = shared
        # a shared topic the caller changed (moved, added subtopics): what they get is their own version
        topic["isModified"] = changed
        out.append(topic)
    return out


def save_owned(table: str, shape: TopicShape, topic: dict, user_id: int, is_admin: bool, shared: bool = False) -> None:
    """Create or change a topic for `user_id`.
    - a new topic is the caller's own (an admin can create it shared);
    - changing an own topic updates it in place (this is also how it moves to another pattern, keeping its place in the list);
    - changing a shared topic stores the caller's own version, unless an admin saves it with `shared`;
    - `shared` on an own topic makes it everyone's (admin only)."""
    table = _check_table(table)
    if shared and not is_admin:
        raise TopicForbidden("Only an admin can share a topic with everyone")
    cols = shape.columns
    values = shape.to_values(topic)
    topic_id = topic["id"]
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute(f"SELECT owner_id FROM {table} WHERE id = ?", (topic_id,)).fetchone()
        if row is None:
            conn.execute(
                f"INSERT INTO {table} (id, {', '.join(cols)}, is_custom, owner_id) "
                f"VALUES (?, {', '.join('?' * len(cols))}, 1, ?)",
                (topic_id, *values, None if shared else user_id),
            )
        else:
            owner = row[0]
            if owner is not None and owner != user_id:
                raise TopicForbidden("This topic belongs to another user")
            if owner is None and not shared:
                conn.execute(
                    f"INSERT OR REPLACE INTO {overrides_table(table)} (user_id, topic_id, {', '.join(cols)}, is_custom) "
                    f"VALUES (?, ?, {', '.join('?' * len(cols))}, (SELECT is_custom FROM {table} WHERE id = ?))",
                    (user_id, topic_id, *values, topic_id),
                )
            else:
                conn.execute(
                    f"UPDATE {table} SET {', '.join(c + '=?' for c in cols)}, owner_id=? WHERE id=?",
                    (*values, None if shared else owner, topic_id),
                )
                # the admin's own copy of it is now the shared one
                conn.execute(
                    f"DELETE FROM {overrides_table(table)} WHERE user_id=? AND topic_id=?", (user_id, topic_id)
                )
        conn.commit()
    finally:
        conn.close()


def delete_owned(table: str, topic_id: str, user_id: int, is_admin: bool) -> None:
    """Remove a topic the caller added (an admin: any custom topic shared with everyone). A seed topic cannot be removed;
    for one the caller changed, this resets it (drops their own version). Removing a topic also drops every user's version of it."""
    table = _check_table(table)
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute(f"SELECT owner_id, is_custom FROM {table} WHERE id = ?", (topic_id,)).fetchone()
        if row is None:
            raise TopicNotFound("Topic not found")
        owner, is_custom = row
        if owner is not None and owner != user_id:
            raise TopicForbidden("This topic belongs to another user")
        if owner is None and not is_custom:
            conn.execute(
                f"DELETE FROM {overrides_table(table)} WHERE user_id = ? AND topic_id = ?", (user_id, topic_id)
            )
        elif owner is None and not is_admin:
            raise TopicForbidden("Only an admin can remove a topic shared with everyone")
        else:
            conn.execute(f"DELETE FROM {table} WHERE id = ?", (topic_id,))
            conn.execute(f"DELETE FROM {overrides_table(table)} WHERE topic_id = ?", (topic_id,))
        conn.commit()
    finally:
        conn.close()
