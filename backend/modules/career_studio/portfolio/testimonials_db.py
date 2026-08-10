"""Visitor-submitted testimonials on a published portfolio.

Distinct from the owner-authored 'testimonials' portfolio widget — a visitor
submits here via an unauthenticated public endpoint; the owner approves or
rejects before anything appears on the public page. Kept as its own table
rather than merging into the widget's items[], so the two systems (owner
content vs. visitor submissions) never collide.
"""

from __future__ import annotations

from typing import Optional

from ..shared.db import _connect, _new_id

_COLS = "id, slug, master_id, user_id, name, quote, status, created_at, decided_at"


def _to_dict(r) -> dict:
    return {
        "id": r[0], "slug": r[1], "master_id": r[2], "name": r[4],
        "quote": r[5], "status": r[6], "created_at": r[7], "decided_at": r[8],
    }


def count_recent_pending(slug: str, since_minutes: int = 60) -> int:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM testimonial_submissions "
            "WHERE slug = ? AND status = 'pending' AND created_at >= datetime('now', ?)",
            (slug, f"-{since_minutes} minutes"),
        )
        return cur.fetchone()[0]
    finally:
        conn.close()


def submit(slug: str, master_id: str, owner_user_id: str, name: str, quote: str) -> dict:
    tid = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO testimonial_submissions (id, slug, master_id, user_id, name, quote) VALUES (?, ?, ?, ?, ?, ?)",
            (tid, slug, master_id, str(owner_user_id), name, quote),
        )
        conn.commit()
        cur.execute(f"SELECT {_COLS} FROM testimonial_submissions WHERE id = ?", (tid,))
        return _to_dict(cur.fetchone())
    finally:
        conn.close()


def list_for_master(owner_user_id: str, master_id: str, status: Optional[str] = None) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        if status:
            cur.execute(
                f"SELECT {_COLS} FROM testimonial_submissions WHERE master_id = ? AND user_id = ? AND status = ? ORDER BY created_at DESC",
                (master_id, str(owner_user_id), status),
            )
        else:
            cur.execute(
                f"SELECT {_COLS} FROM testimonial_submissions WHERE master_id = ? AND user_id = ? ORDER BY created_at DESC",
                (master_id, str(owner_user_id)),
            )
        return [_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def list_approved(master_id: str) -> list[dict]:
    """Public read — no owner scoping needed, only approved rows for this master."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_COLS} FROM testimonial_submissions WHERE master_id = ? AND status = 'approved' ORDER BY decided_at DESC",
            (master_id,),
        )
        return [_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def set_status(owner_user_id: str, testimonial_id: str, status: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE testimonial_submissions SET status = ?, decided_at = datetime('now') WHERE id = ? AND user_id = ?",
            (status, testimonial_id, str(owner_user_id)),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        cur.execute(f"SELECT {_COLS} FROM testimonial_submissions WHERE id = ?", (testimonial_id,))
        return _to_dict(cur.fetchone())
    finally:
        conn.close()


def delete(owner_user_id: str, testimonial_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM testimonial_submissions WHERE id = ? AND user_id = ?",
            (testimonial_id, str(owner_user_id)),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
