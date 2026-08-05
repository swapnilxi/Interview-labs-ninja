"""Public publishing — frozen snapshots served without auth.

Publishing copies a view's current content into portfolio_published under a
stable, opaque slug. `kind` distinguishes what's actually stored, since a
portfolio's and a resume's content aren't shaped alike:
  - portfolio: content_json = widgets (list), theme_json = theme (dict)
  - resume:    content_json = sections (list), theme_json = {"template", "spec"}
The public reader (no auth) only ever sees this frozen snapshot, so unsaved
edits never leak until the user re-publishes.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Optional

from .db import _connect

_COLS = "slug, master_id, user_id, title, content_json, theme_json, view_count, is_public, created_at, updated_at, kind"


def _to_dict(r, include_content: bool = True) -> dict:
    kind = r[10] if len(r) > 10 else "portfolio"
    d = {
        "slug": r[0],
        "master_id": r[1],
        "title": r[3],
        "view_count": r[6],
        "is_public": bool(r[7]),
        "created_at": r[8],
        "updated_at": r[9],
        "kind": kind,
    }
    if include_content:
        content = json.loads(r[4]) if r[4] else []
        extra = json.loads(r[5]) if r[5] else {}
        if kind == "resume":
            d["sections"] = content
            d["template"] = extra.get("template")
            d["spec"] = extra.get("spec")
        else:
            d["widgets"] = content
            d["theme"] = extra
    return d


def _slugify(title: str, kind: str = "portfolio") -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (title or kind).lower()).strip("-")[:40] or kind
    return f"{base}-{uuid.uuid4().hex[:6]}"


def get_by_master(user_id: str, master_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_COLS} FROM portfolio_published WHERE master_id = ? AND user_id = ?", (master_id, str(user_id)))
        row = cur.fetchone()
        return _to_dict(row, include_content=False) if row else None
    finally:
        conn.close()


def publish(user_id: str, master_id: str, title: str, content: list, extra: dict, kind: str = "portfolio") -> dict:
    """Upsert a published snapshot. Keeps the existing slug on re-publish."""
    uid = str(user_id)
    existing = get_by_master(uid, master_id)
    content_json = json.dumps(content)
    extra_json = json.dumps(extra or {})
    conn = _connect()
    try:
        cur = conn.cursor()
        if existing:
            cur.execute(
                "UPDATE portfolio_published SET title = ?, content_json = ?, theme_json = ?, kind = ?, is_public = 1, updated_at = datetime('now') "
                "WHERE master_id = ? AND user_id = ?",
                (title, content_json, extra_json, kind, master_id, uid),
            )
            slug = existing["slug"]
        else:
            slug = _slugify(title, kind)
            cur.execute(
                "INSERT INTO portfolio_published (slug, master_id, user_id, title, content_json, theme_json, kind) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (slug, master_id, uid, title, content_json, extra_json, kind),
            )
        conn.commit()
    finally:
        conn.close()
    return get_by_master(uid, master_id)


def unpublish(user_id: str, master_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE portfolio_published SET is_public = 0, updated_at = datetime('now') WHERE master_id = ? AND user_id = ?",
            (master_id, str(user_id)),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_public(slug: str) -> Optional[dict]:
    """Public read (no auth): returns the snapshot and bumps the view counter."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_COLS} FROM portfolio_published WHERE slug = ? AND is_public = 1", (slug,))
        row = cur.fetchone()
        if not row:
            return None
        cur.execute("UPDATE portfolio_published SET view_count = view_count + 1 WHERE slug = ?", (slug,))
        conn.commit()
        # Re-fetch so the returned view_count reflects the increment above —
        # `row` was read before it, so it's stale by one.
        cur.execute(f"SELECT {_COLS} FROM portfolio_published WHERE slug = ? AND is_public = 1", (slug,))
        return _to_dict(cur.fetchone(), include_content=True)
    finally:
        conn.close()
