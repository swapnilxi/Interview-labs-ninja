"""Portfolio persistence — mirrors db.py (resume) but for portfolios + widgets.

Same raw-sqlite / separate-DB idiom; reuses the connection + id helpers from db.py.
A portfolio_master has a mutable draft (portfolio_widgets under current_draft_id) and
immutable checkpoints (portfolio_versions, see portfolio_versions.py).
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Optional

from .db import _connect, _new_id

# ── Defaults ────────────────────────────────────────────────────────────────────

DEFAULT_WIDGETS: list[tuple[str, str]] = [
    ("hero", "Hero"),
    ("about", "About"),
    ("projects", "Projects"),
    ("skills", "Skills"),
    ("contact", "Contact"),
]

DEFAULT_THEME = {"accent": "violet", "font": "sans", "layout": "stack"}


def default_widget_content(widget_type: str) -> dict:
    if widget_type == "hero":
        return {"headline": "", "subheadline": "", "tagline": "", "ctaLabel": "", "ctaUrl": ""}
    if widget_type in ("about", "custom"):
        return {"text": ""}
    if widget_type == "contact":
        return {"email": "", "phone": "", "location": "", "links": []}
    if widget_type == "skills":
        return {"groups": []}
    if widget_type == "stats":
        return {"items": []}  # [{label, value}]
    # projects, experience, education, gallery, testimonials
    return {"items": []}


# ── Row → dict ────────────────────────────────────────────────────────────────

_PMASTER_COLS = "id, user_id, title, current_version_id, current_draft_id, theme_json, is_deleted, deleted_at, created_at, updated_at"
_WIDGET_COLS = "id, version_id, master_id, user_id, widget_type, title, content_json, sort_order, is_hidden, created_at, updated_at"


def _pmaster_to_dict(r) -> dict:
    return {
        "id": r[0],
        "user_id": r[1],
        "title": r[2],
        "current_version_id": r[3],
        "current_draft_id": r[4],
        "theme": json.loads(r[5]) if r[5] else dict(DEFAULT_THEME),
        "is_deleted": bool(r[6]),
        "deleted_at": r[7],
        "created_at": r[8],
        "updated_at": r[9],
    }


def _widget_to_dict(r) -> dict:
    return {
        "id": r[0],
        "version_id": r[1],
        "master_id": r[2],
        "widget_type": r[4],
        "title": r[5],
        "content": json.loads(r[6]) if r[6] else {},
        "sort_order": r[7],
        "is_hidden": bool(r[8]),
        "created_at": r[9],
        "updated_at": r[10],
    }


def insert_widget_row(
    cursor: sqlite3.Cursor,
    *,
    user_id: str,
    master_id: str,
    version_id: str,
    widget_type: str,
    title: Optional[str],
    content: Any,
    sort_order: int,
    is_hidden: bool = False,
) -> str:
    wid = _new_id()
    cursor.execute(
        """
        INSERT INTO portfolio_widgets
            (id, version_id, master_id, user_id, widget_type, title, content_json, sort_order, is_hidden)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (wid, version_id, master_id, str(user_id), widget_type, title,
         json.dumps(content if content is not None else {}), sort_order, 1 if is_hidden else 0),
    )
    return wid


def _touch(cursor: sqlite3.Cursor, user_id: str, master_id: str) -> None:
    cursor.execute(
        "UPDATE portfolio_master SET updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        (master_id, str(user_id)),
    )


# ── Master CRUD ─────────────────────────────────────────────────────────────────

def create_portfolio(user_id: str, title: str) -> dict:
    uid = str(user_id)
    master_id = _new_id()
    draft_id = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO portfolio_master (id, user_id, title, current_draft_id, theme_json) VALUES (?, ?, ?, ?, ?)",
            (master_id, uid, title or "Untitled Portfolio", draft_id, json.dumps(DEFAULT_THEME)),
        )
        cur.execute(
            "INSERT INTO portfolio_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'draft')",
            (draft_id, master_id, uid),
        )
        for i, (wtype, wtitle) in enumerate(DEFAULT_WIDGETS):
            insert_widget_row(cur, user_id=uid, master_id=master_id, version_id=draft_id,
                              widget_type=wtype, title=wtitle, content=default_widget_content(wtype), sort_order=i)
        conn.commit()
    finally:
        conn.close()
    return get_portfolio_tree(uid, master_id)


def list_portfolios(user_id: str) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_PMASTER_COLS} FROM portfolio_master WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC",
            (str(user_id),),
        )
        masters = [_pmaster_to_dict(r) for r in cur.fetchall()]
        for m in masters:
            cur.execute("SELECT COUNT(*) FROM portfolio_widgets WHERE master_id = ? AND version_id = ?", (m["id"], m["current_draft_id"]))
            m["widget_count"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM portfolio_versions WHERE master_id = ? AND is_immutable = 1", (m["id"],))
            m["version_count"] = cur.fetchone()[0]
        return masters
    finally:
        conn.close()


def get_portfolio_master(user_id: str, master_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_PMASTER_COLS} FROM portfolio_master WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (master_id, str(user_id)),
        )
        row = cur.fetchone()
        return _pmaster_to_dict(row) if row else None
    finally:
        conn.close()


def get_portfolio_tree(user_id: str, master_id: str) -> Optional[dict]:
    master = get_portfolio_master(user_id, master_id)
    if master is None:
        return None
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_WIDGET_COLS} FROM portfolio_widgets WHERE master_id = ? AND version_id = ? ORDER BY sort_order ASC, created_at ASC",
            (master_id, master["current_draft_id"]),
        )
        master["widgets"] = [_widget_to_dict(r) for r in cur.fetchall()]
        return master
    finally:
        conn.close()


def update_portfolio(user_id: str, master_id: str, fields: dict) -> Optional[dict]:
    uid = str(user_id)
    sets: list[str] = []
    params: list[Any] = []
    if "title" in fields:
        sets.append("title = ?")
        params.append(fields["title"])
    if "theme" in fields:
        sets.append("theme_json = ?")
        params.append(json.dumps(fields["theme"] or DEFAULT_THEME))
    if not sets:
        return get_portfolio_tree(uid, master_id)
    sets.append("updated_at = datetime('now')")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE portfolio_master SET {', '.join(sets)} WHERE id = ? AND user_id = ? AND is_deleted = 0", (*params, master_id, uid))
        conn.commit()
        changed = cur.rowcount
    finally:
        conn.close()
    return get_portfolio_tree(uid, master_id) if changed else None


def soft_delete_portfolio(user_id: str, master_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE portfolio_master SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (master_id, str(user_id)),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ── Widget CRUD (mutable draft) ─────────────────────────────────────────────────

def add_widget(user_id: str, master_id: str, widget_type: str, title: Optional[str], content: Any = None) -> Optional[dict]:
    uid = str(user_id)
    master = get_portfolio_master(uid, master_id)
    if master is None:
        return None
    draft_id = master["current_draft_id"]
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) FROM portfolio_widgets WHERE version_id = ?", (draft_id,))
        next_order = cur.fetchone()[0] + 1
        wid = insert_widget_row(cur, user_id=uid, master_id=master_id, version_id=draft_id, widget_type=widget_type,
                                title=title, content=content if content is not None else default_widget_content(widget_type), sort_order=next_order)
        _touch(cur, uid, master_id)
        conn.commit()
        cur.execute(f"SELECT {_WIDGET_COLS} FROM portfolio_widgets WHERE id = ?", (wid,))
        return _widget_to_dict(cur.fetchone())
    finally:
        conn.close()


def update_widget(user_id: str, master_id: str, widget_id: str, fields: dict) -> Optional[dict]:
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
        cur.execute(f"UPDATE portfolio_widgets SET {', '.join(sets)} WHERE id = ? AND master_id = ? AND user_id = ?", (*params, widget_id, master_id, uid))
        if cur.rowcount == 0:
            return None
        _touch(cur, uid, master_id)
        conn.commit()
        cur.execute(f"SELECT {_WIDGET_COLS} FROM portfolio_widgets WHERE id = ?", (widget_id,))
        return _widget_to_dict(cur.fetchone())
    finally:
        conn.close()


def delete_widget(user_id: str, master_id: str, widget_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM portfolio_widgets WHERE id = ? AND master_id = ? AND user_id = ?", (widget_id, master_id, str(user_id)))
        if cur.rowcount:
            _touch(cur, user_id, master_id)
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def reorder_widgets(user_id: str, master_id: str, ordered_ids: list[str]) -> Optional[dict]:
    uid = str(user_id)
    if get_portfolio_master(uid, master_id) is None:
        return None
    conn = _connect()
    try:
        cur = conn.cursor()
        for order, wid in enumerate(ordered_ids):
            cur.execute(
                "UPDATE portfolio_widgets SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND master_id = ? AND user_id = ?",
                (order, wid, master_id, uid),
            )
        _touch(cur, uid, master_id)
        conn.commit()
    finally:
        conn.close()
    return get_portfolio_tree(uid, master_id)


def get_widget(user_id: str, widget_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_WIDGET_COLS} FROM portfolio_widgets WHERE id = ? AND user_id = ?", (widget_id, str(user_id)))
        row = cur.fetchone()
        return _widget_to_dict(row) if row else None
    finally:
        conn.close()
