"""Immutable version snapshots for portfolios — mirrors versions.py (resume)."""

from __future__ import annotations

import json
import sqlite3
from typing import Optional

from ..shared.db import _connect, _new_id
from .db import get_portfolio_master, get_portfolio_tree, insert_widget_row

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


def _draft_snapshot(cur: sqlite3.Cursor, master_id: str, version_id: str) -> list[dict]:
    cur.execute(
        "SELECT widget_type, title, content_json, sort_order, is_hidden FROM portfolio_widgets "
        "WHERE master_id = ? AND version_id = ? ORDER BY sort_order ASC",
        (master_id, version_id),
    )
    return [
        {"widget_type": r[0], "title": r[1], "content": json.loads(r[2]) if r[2] else {}, "sort_order": r[3], "is_hidden": bool(r[4])}
        for r in cur.fetchall()
    ]


def snapshot_version(user_id: str, master_id: str, label: Optional[str] = None, source: str = "manual") -> Optional[dict]:
    uid = str(user_id)
    master = get_portfolio_master(uid, master_id)
    if master is None:
        return None
    conn = _connect()
    try:
        cur = conn.cursor()
        snapshot = _draft_snapshot(cur, master_id, master["current_draft_id"])
        vid = _new_id()
        cur.execute(
            "INSERT INTO portfolio_versions (id, master_id, user_id, parent_version_id, label, is_immutable, is_draft, source, content_json) "
            "VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)",
            (vid, master_id, uid, master["current_version_id"], label, source, json.dumps(snapshot)),
        )
        cur.execute("UPDATE portfolio_master SET current_version_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?", (vid, master_id, uid))
        conn.commit()
        cur.execute(f"SELECT {_VERSION_META_COLS} FROM portfolio_versions WHERE id = ?", (vid,))
        meta = _version_meta(cur.fetchone())
        meta["widget_count"] = len(snapshot)
        return meta
    finally:
        conn.close()


def list_versions(user_id: str, master_id: str) -> list[dict]:
    uid = str(user_id)
    if get_portfolio_master(uid, master_id) is None:
        return []
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_VERSION_META_COLS} FROM portfolio_versions WHERE master_id = ? AND user_id = ? AND is_immutable = 1 ORDER BY created_at DESC",
            (master_id, uid),
        )
        rows = cur.fetchall()
        out = []
        for r in rows:
            meta = _version_meta(r)
            cur.execute("SELECT content_json FROM portfolio_versions WHERE id = ?", (meta["id"],))
            content = cur.fetchone()[0]
            meta["widget_count"] = len(json.loads(content)) if content else 0
            out.append(meta)
        return out
    finally:
        conn.close()


def get_version(user_id: str, version_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_VERSION_META_COLS}, content_json FROM portfolio_versions WHERE id = ? AND user_id = ?", (version_id, str(user_id)))
        row = cur.fetchone()
        if not row:
            return None
        meta = _version_meta(row)
        meta["widgets"] = json.loads(row[10]) if row[10] else _draft_snapshot(cur, meta["master_id"], version_id)
        return meta
    finally:
        conn.close()


def restore_version(user_id: str, master_id: str, version_id: str) -> Optional[dict]:
    uid = str(user_id)
    version = get_version(uid, version_id)
    master = get_portfolio_master(uid, master_id)
    if version is None or master is None or version["master_id"] != master_id:
        return None
    draft_id = master["current_draft_id"]
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM portfolio_widgets WHERE master_id = ? AND version_id = ?", (master_id, draft_id))
        for i, w in enumerate(version["widgets"]):
            insert_widget_row(cur, user_id=uid, master_id=master_id, version_id=draft_id, widget_type=w.get("widget_type", "custom"),
                              title=w.get("title"), content=w.get("content", {}), sort_order=w.get("sort_order", i), is_hidden=w.get("is_hidden", False))
        cur.execute("UPDATE portfolio_master SET updated_at = datetime('now') WHERE id = ? AND user_id = ?", (master_id, uid))
        conn.commit()
    finally:
        conn.close()
    return get_portfolio_tree(uid, master_id)


def clone_version(user_id: str, version_id: str, title: Optional[str] = None) -> Optional[dict]:
    uid = str(user_id)
    version = get_version(uid, version_id)
    if version is None:
        return None
    src_master = get_portfolio_master(uid, version["master_id"])
    base_title = src_master["title"] if src_master else "Portfolio"
    new_title = title or f"{base_title} (copy)"
    master_id = _new_id()
    draft_id = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO portfolio_master (id, user_id, title, current_draft_id, theme_json) VALUES (?, ?, ?, ?, ?)",
                    (master_id, uid, new_title, draft_id, json.dumps((src_master or {}).get("theme"))))
        cur.execute("INSERT INTO portfolio_versions (id, master_id, user_id, is_draft, source) VALUES (?, ?, ?, 1, 'clone')", (draft_id, master_id, uid))
        for i, w in enumerate(version["widgets"]):
            insert_widget_row(cur, user_id=uid, master_id=master_id, version_id=draft_id, widget_type=w.get("widget_type", "custom"),
                              title=w.get("title"), content=w.get("content", {}), sort_order=w.get("sort_order", i), is_hidden=w.get("is_hidden", False))
        conn.commit()
    finally:
        conn.close()
    return get_portfolio_tree(uid, master_id)
