"""Database operations for To-Do Routines. All access is scoped to a user_id.

Tables (shared/schema.py): routine_groups (Dailies + the groups a user makes, e.g. Weekdays, Weekend, Deployment eve)
and routine_items (what you tick off in a group each day; done for a day when done_on equals that local date).

TypeScript twin: frontend/fe-apis/todo/routines/db.ts -- keep the two in sync (same SQL, same dict shapes).
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path

DAILIES_NAME = "Dailies"

_GROUP_COLUMNS = "id, user_id, name, kind, days, active_on, order_index, created_at, updated_at"
_ITEM_COLUMNS = "id, user_id, group_id, title, priority, notes, done_on, order_index, created_at, updated_at"

# Columns the update functions may write (the PATCH fields; order_index only on a move between groups).
_GROUP_UPDATABLE = ("name", "days", "active_on")
_ITEM_UPDATABLE = ("title", "priority", "notes", "done_on", "group_id")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def days_from_text(value: Any) -> Optional[List[int]]:
    """'1,2,3,4,5' -> [1, 2, 3, 4, 5]; NULL/empty/garbage -> None."""
    if not isinstance(value, str) or not value:
        return None
    out: List[int] = []
    for part in value.split(","):
        part = part.strip()
        if part.isdigit() and int(part) <= 6 and int(part) not in out:
            out.append(int(part))
    return sorted(out) or None


def days_to_text(days: Optional[List[int]]) -> Optional[str]:
    return ",".join(str(d) for d in days) if days else None


def _group_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "kind": row["kind"],
        "days": days_from_text(row["days"]),
        "active_on": row["active_on"],
        "order_index": row["order_index"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _item_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "group_id": row["group_id"],
        "title": row["title"],
        "priority": row["priority"],
        "notes": row["notes"],
        "done_on": row["done_on"],
        "order_index": row["order_index"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def ensure_dailies(user_id: int) -> bool:
    """Every user has a Dailies group; it is made the first time their routines are read. True when it was made now.

    Looked up first, so an ordinary read writes nothing (an ignored INSERT would still use up an id); the partial
    unique index makes a race between two first reads harmless.
    """
    conn = _connect()
    try:
        if conn.execute("SELECT 1 FROM routine_groups WHERE user_id = ? AND kind = 'dailies'", (user_id,)).fetchone():
            return False
        cursor = conn.execute(
            "INSERT OR IGNORE INTO routine_groups (user_id, name, kind, order_index) VALUES (?, ?, 'dailies', 0)",
            (user_id, DAILIES_NAME),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def list_groups(user_id: int) -> List[Dict[str, Any]]:
    """The user's groups (Dailies first, then in the order they were made), each with its items."""
    ensure_dailies(user_id)
    conn = _connect()
    try:
        groups = [
            _group_dict(row)
            for row in conn.execute(
                f"SELECT {_GROUP_COLUMNS} FROM routine_groups WHERE user_id = ? "
                "ORDER BY CASE kind WHEN 'dailies' THEN 0 ELSE 1 END, order_index ASC, id ASC",
                (user_id,),
            ).fetchall()
        ]
        by_group: Dict[int, List[Dict[str, Any]]] = {g["id"]: [] for g in groups}
        for row in conn.execute(
            f"SELECT {_ITEM_COLUMNS} FROM routine_items WHERE user_id = ? ORDER BY order_index ASC, id ASC",
            (user_id,),
        ).fetchall():
            if row["group_id"] in by_group:
                by_group[row["group_id"]].append(_item_dict(row))
        for group in groups:
            group["items"] = by_group[group["id"]]
        return groups
    finally:
        conn.close()


def get_group(group_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conn = _connect()
    try:
        row = conn.execute(
            f"SELECT {_GROUP_COLUMNS} FROM routine_groups WHERE id = ? AND user_id = ?", (group_id, user_id)
        ).fetchone()
        return _group_dict(row) if row else None
    finally:
        conn.close()


def count_groups(user_id: int) -> int:
    conn = _connect()
    try:
        return conn.execute("SELECT COUNT(*) FROM routine_groups WHERE user_id = ?", (user_id,)).fetchone()[0]
    finally:
        conn.close()


def create_group(user_id: int, name: str, days: Optional[List[int]] = None) -> Dict[str, Any]:
    conn = _connect()
    try:
        cursor = conn.execute(
            "INSERT INTO routine_groups (user_id, name, kind, days, order_index) VALUES (?, ?, 'custom', ?, "
            "(SELECT COALESCE(MAX(order_index), 0) + 1 FROM routine_groups WHERE user_id = ?))",
            (user_id, name, days_to_text(days), user_id),
        )
        conn.commit()
        row = conn.execute(f"SELECT {_GROUP_COLUMNS} FROM routine_groups WHERE id = ?", (cursor.lastrowid,)).fetchone()
        group = _group_dict(row)
        group["items"] = []
        return group
    finally:
        conn.close()


def update_group(group_id: int, user_id: int, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Write the given fields (days as a list); returns the group without its items, or None if it isn't the user's."""
    updates = {k: v for k, v in fields.items() if k in _GROUP_UPDATABLE}
    if "days" in updates:
        updates["days"] = days_to_text(updates["days"])
    conn = _connect()
    try:
        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE routine_groups SET {set_clause}, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
                (*updates.values(), group_id, user_id),
            )
            conn.commit()
        row = conn.execute(
            f"SELECT {_GROUP_COLUMNS} FROM routine_groups WHERE id = ? AND user_id = ?", (group_id, user_id)
        ).fetchone()
        return _group_dict(row) if row else None
    finally:
        conn.close()


def delete_group(group_id: int, user_id: int) -> bool:
    """Delete a group and its items (explicitly: these connections don't turn foreign keys on)."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM routine_items WHERE group_id = ? AND user_id = ?", (group_id, user_id))
        cursor = conn.execute("DELETE FROM routine_groups WHERE id = ? AND user_id = ?", (group_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_item(item_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conn = _connect()
    try:
        row = conn.execute(
            f"SELECT {_ITEM_COLUMNS} FROM routine_items WHERE id = ? AND user_id = ?", (item_id, user_id)
        ).fetchone()
        return _item_dict(row) if row else None
    finally:
        conn.close()


def count_items(group_id: int, user_id: int) -> int:
    conn = _connect()
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM routine_items WHERE group_id = ? AND user_id = ?", (group_id, user_id)
        ).fetchone()[0]
    finally:
        conn.close()


def create_item(
    user_id: int, group_id: int, title: str, priority: str = "p3", notes: Optional[str] = None
) -> Dict[str, Any]:
    """Add an item at the end of its group."""
    conn = _connect()
    try:
        cursor = conn.execute(
            "INSERT INTO routine_items (user_id, group_id, title, priority, notes, order_index) VALUES (?, ?, ?, ?, ?, "
            "(SELECT COALESCE(MAX(order_index), 0) + 1 FROM routine_items WHERE group_id = ? AND user_id = ?))",
            (user_id, group_id, title, priority, notes, group_id, user_id),
        )
        conn.commit()
        row = conn.execute(f"SELECT {_ITEM_COLUMNS} FROM routine_items WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _item_dict(row)
    finally:
        conn.close()


def update_item(item_id: int, user_id: int, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Write the given fields. A move to another group (group_id) puts the item at the end of that group."""
    updates = {k: v for k, v in fields.items() if k in _ITEM_UPDATABLE}
    conn = _connect()
    try:
        if updates:
            set_parts = [f"{k} = ?" for k in updates]
            values: List[Any] = list(updates.values())
            if "group_id" in updates:
                set_parts.append(
                    "order_index = (SELECT COALESCE(MAX(order_index), 0) + 1 FROM routine_items "
                    "WHERE group_id = ? AND user_id = ?)"
                )
                values += [updates["group_id"], user_id]
            conn.execute(
                f"UPDATE routine_items SET {', '.join(set_parts)}, updated_at = datetime('now') "
                "WHERE id = ? AND user_id = ?",
                (*values, item_id, user_id),
            )
            conn.commit()
        row = conn.execute(
            f"SELECT {_ITEM_COLUMNS} FROM routine_items WHERE id = ? AND user_id = ?", (item_id, user_id)
        ).fetchone()
        return _item_dict(row) if row else None
    finally:
        conn.close()


def delete_item(item_id: int, user_id: int) -> bool:
    conn = _connect()
    try:
        cursor = conn.execute("DELETE FROM routine_items WHERE id = ? AND user_id = ?", (item_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()
