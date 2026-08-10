"""Public publishing — frozen snapshots served without auth.

Publishing copies a view's current content into portfolio_published under a
stable, opaque (or user-chosen) slug. `kind` distinguishes what's actually
stored, since a portfolio's and a resume's content aren't shaped alike:
  - portfolio: content_json = widgets (list), theme_json = theme (dict)
  - resume:    content_json = sections (list), theme_json = {"template", "spec"}
The public reader (no auth) only ever sees this frozen snapshot, so unsaved
edits never leak until the user re-publishes.

Every publish() call ALSO inserts an immutable published_snapshots row,
numbered per master_id, so a link to a specific past snapshot
(/v/{version_number}) keeps working even after the "current" slug is
re-published — that table is pure history, never updated in place.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Optional

from ..shared.db import _connect, _new_id

_COLS = "slug, master_id, user_id, title, content_json, theme_json, view_count, is_public, created_at, updated_at, kind"
_SLUG_RE = re.compile(r"^[a-z0-9-]{3,60}$")
_SNAPSHOT_COLS = "id, slug, master_id, user_id, kind, version_number, title, content_json, theme_json, created_at"


class SlugTakenError(ValueError):
    pass


def _to_dict(r, include_content: bool = True) -> dict:
    kind = r[10] if len(r) > 10 else "portfolio"
    d = {
        "slug": r[0],
        "master_id": r[1],
        "user_id": r[2],
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


def _snapshot_to_dict(r, include_content: bool = True) -> dict:
    d = {
        "id": r[0],
        "slug": r[1],
        "master_id": r[2],
        "kind": r[4],
        "version_number": r[5],
        "title": r[6],
        "created_at": r[9],
    }
    if include_content:
        content = json.loads(r[7]) if r[7] else []
        extra = json.loads(r[8]) if r[8] else {}
        if d["kind"] == "resume":
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


def _slug_taken(cur, slug: str, master_id: str) -> bool:
    cur.execute("SELECT 1 FROM portfolio_published WHERE slug = ? AND master_id != ?", (slug, master_id))
    return cur.fetchone() is not None


def get_by_master(user_id: str, master_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_COLS} FROM portfolio_published WHERE master_id = ? AND user_id = ?", (master_id, str(user_id)))
        row = cur.fetchone()
        return _to_dict(row, include_content=False) if row else None
    finally:
        conn.close()


def publish(user_id: str, master_id: str, title: str, content: list, extra: dict, kind: str = "portfolio", custom_slug: Optional[str] = None) -> dict:
    """Upsert a published snapshot. Keeps the existing slug on re-publish unless
    `custom_slug` is given. Also inserts a new immutable published_snapshots row
    (version history), independent of the "current" slug/content above."""
    uid = str(user_id)
    existing = get_by_master(uid, master_id)
    content_json = json.dumps(content)
    extra_json = json.dumps(extra or {})

    conn = _connect()
    try:
        cur = conn.cursor()

        if custom_slug is not None:
            candidate = custom_slug.strip().lower()
            if not _SLUG_RE.match(candidate):
                raise ValueError("Slug must be 3-60 characters: lowercase letters, numbers, and hyphens only.")
            if _slug_taken(cur, candidate, master_id):
                raise SlugTakenError(f'The slug "{candidate}" is already taken — pick another.')
            slug = candidate
        else:
            slug = existing["slug"] if existing else _slugify(title, kind)

        if existing:
            cur.execute(
                "UPDATE portfolio_published SET slug = ?, title = ?, content_json = ?, theme_json = ?, kind = ?, is_public = 1, updated_at = datetime('now') "
                "WHERE master_id = ? AND user_id = ?",
                (slug, title, content_json, extra_json, kind, master_id, uid),
            )
        else:
            cur.execute(
                "INSERT INTO portfolio_published (slug, master_id, user_id, title, content_json, theme_json, kind) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (slug, master_id, uid, title, content_json, extra_json, kind),
            )

        cur.execute("SELECT COALESCE(MAX(version_number), 0) + 1 FROM published_snapshots WHERE master_id = ?", (master_id,))
        version_number = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO published_snapshots (id, slug, master_id, user_id, kind, version_number, title, content_json, theme_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (_new_id(), slug, master_id, uid, kind, version_number, title, content_json, extra_json),
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


def get_by_slug(slug: str) -> Optional[dict]:
    """Read-only lookup of the current published snapshot by slug — unlike
    get_public(), this has NO side effects (no view_count bump, no event row).
    Use for anything that isn't itself "a visitor viewed the page", e.g. a
    separate download action, which records its own 'download' event instead."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_COLS} FROM portfolio_published WHERE slug = ? AND is_public = 1", (slug,))
        row = cur.fetchone()
        return _to_dict(row, include_content=True) if row else None
    finally:
        conn.close()


def get_public(slug: str, referrer: Optional[str] = None) -> Optional[dict]:
    """Public read (no auth): returns the snapshot, bumps the view counter, and
    records a 'view' analytics event (best-effort referrer capture)."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_COLS} FROM portfolio_published WHERE slug = ? AND is_public = 1", (slug,))
        row = cur.fetchone()
        if not row:
            return None
        cur.execute("UPDATE portfolio_published SET view_count = view_count + 1 WHERE slug = ?", (slug,))
        cur.execute(
            "INSERT INTO view_events (id, slug, master_id, user_id, event_type, referrer) VALUES (?, ?, ?, ?, 'view', ?)",
            (_new_id(), slug, row[1], row[2], (referrer or None)),
        )
        conn.commit()
        # Re-fetch so the returned view_count reflects the increment above —
        # `row` was read before it, so it's stale by one.
        cur.execute(f"SELECT {_COLS} FROM portfolio_published WHERE slug = ? AND is_public = 1", (slug,))
        return _to_dict(cur.fetchone(), include_content=True)
    finally:
        conn.close()


def record_download(slug: str, master_id: str, user_id: str, fmt: str) -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO view_events (id, slug, master_id, user_id, event_type, format) VALUES (?, ?, ?, ?, 'download', ?)",
            (_new_id(), slug, master_id, str(user_id), fmt),
        )
        conn.commit()
    finally:
        conn.close()


# ── Versioned public URLs ────────────────────────────────────────────────────────


def get_snapshot(slug: str, version_number: int) -> Optional[dict]:
    """Public read of a specific historical snapshot by (current slug, version).
    Snapshots are looked up by slug match at ANY point in that slug's history,
    so an old link stays valid even after the current content moves on."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_SNAPSHOT_COLS} FROM published_snapshots WHERE slug = ? AND version_number = ?",
            (slug, version_number),
        )
        row = cur.fetchone()
        return _snapshot_to_dict(row, include_content=True) if row else None
    finally:
        conn.close()


def list_snapshots(user_id: str, master_id: str) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_SNAPSHOT_COLS} FROM published_snapshots WHERE master_id = ? AND user_id = ? ORDER BY version_number DESC",
            (master_id, str(user_id)),
        )
        return [_snapshot_to_dict(r, include_content=False) for r in cur.fetchall()]
    finally:
        conn.close()


# ── Analytics ─────────────────────────────────────────────────────────────────────


def analytics_summary(user_id: str) -> list[dict]:
    """Per-published-view totals (views, downloads by format, top referrers),
    sorted by views descending — the 'popular resume/portfolio' ranking."""
    uid = str(user_id)
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT slug, master_id, title, kind, view_count, is_public, updated_at FROM portfolio_published WHERE user_id = ?",
            (uid,),
        )
        published = cur.fetchall()
        out = []
        for slug, master_id, title, kind, view_count, is_public, updated_at in published:
            cur.execute(
                "SELECT format, COUNT(*) FROM view_events WHERE master_id = ? AND event_type = 'download' GROUP BY format",
                (master_id,),
            )
            downloads_by_format = {fmt or "unknown": count for fmt, count in cur.fetchall()}
            cur.execute(
                "SELECT referrer, COUNT(*) AS n FROM view_events WHERE master_id = ? AND event_type = 'view' AND referrer IS NOT NULL "
                "GROUP BY referrer ORDER BY n DESC LIMIT 5",
                (master_id,),
            )
            top_referrers = [{"referrer": r, "count": n} for r, n in cur.fetchall()]
            out.append({
                "slug": slug,
                "master_id": master_id,
                "title": title,
                "kind": kind,
                "view_count": view_count,
                "is_public": bool(is_public),
                "updated_at": updated_at,
                "downloads": sum(downloads_by_format.values()),
                "downloads_by_format": downloads_by_format,
                "top_referrers": top_referrers,
            })
        out.sort(key=lambda x: x["view_count"], reverse=True)
        return out
    finally:
        conn.close()
