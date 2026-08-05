"""User-designed resume/portfolio templates (Template Designer & Manager).

Each row is a user-owned template whose `spec` is the structured visual-knob
dict render.py compiles to PDF-safe CSS (see template_presets.py). Built-in
presets are seeded here per-user on first visit, so they're editable/deletable
like any custom template; the code presets stay a fallback so rendering never
breaks when a template is missing. Mirrors jobs_db.py's raw-sqlite idiom.
"""

from __future__ import annotations

import json
from typing import Optional

from .db import _connect, _new_id
from .template_presets import presets_for

_COLS = "id, user_id, kind, name, spec_json, source, created_at, updated_at"


def _to_dict(r) -> dict:
    return {
        "id": r[0],
        "kind": r[2],
        "name": r[3],
        "spec": json.loads(r[4]) if r[4] else {},
        "source": r[5],
        "created_at": r[6],
        "updated_at": r[7],
    }


def create_template(user_id: str, kind: str, name: str, spec: dict, source: str = "custom") -> dict:
    tid = _new_id()
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO career_templates (id, user_id, kind, name, spec_json, source) VALUES (?, ?, ?, ?, ?, ?)",
            (tid, str(user_id), kind, name, json.dumps(spec or {}), source),
        )
        conn.commit()
        cur.execute(f"SELECT {_COLS} FROM career_templates WHERE id = ?", (tid,))
        return _to_dict(cur.fetchone())
    finally:
        conn.close()


def list_templates(user_id: str, kind: Optional[str] = None) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        if kind:
            cur.execute(
                f"SELECT {_COLS} FROM career_templates WHERE user_id = ? AND kind = ? AND is_deleted = 0 ORDER BY created_at ASC",
                (str(user_id), kind),
            )
        else:
            cur.execute(
                f"SELECT {_COLS} FROM career_templates WHERE user_id = ? AND is_deleted = 0 ORDER BY kind, created_at ASC",
                (str(user_id),),
            )
        return [_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_template(user_id: str, template_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_COLS} FROM career_templates WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (template_id, str(user_id)),
        )
        row = cur.fetchone()
        return _to_dict(row) if row else None
    finally:
        conn.close()


def get_spec(user_id: str, template_id: Optional[str]) -> Optional[dict]:
    """Resolve a view's `template` value to a custom spec, or None if it isn't a
    (live) custom template id the user owns — callers then fall back to a named
    built-in / default."""
    if not template_id:
        return None
    row = get_template(str(user_id), template_id)
    return row["spec"] if row else None


def update_template(user_id: str, template_id: str, fields: dict) -> Optional[dict]:
    sets, vals = [], []
    if "name" in fields and fields["name"] is not None:
        sets.append("name = ?")
        vals.append(fields["name"])
    if "spec" in fields and fields["spec"] is not None:
        sets.append("spec_json = ?")
        vals.append(json.dumps(fields["spec"]))
    if not sets:
        return get_template(user_id, template_id)
    sets.append("updated_at = datetime('now')")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE career_templates SET {', '.join(sets)} WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (*vals, template_id, str(user_id)),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    finally:
        conn.close()
    return get_template(user_id, template_id)


def delete_template(user_id: str, template_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE career_templates SET is_deleted = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (template_id, str(user_id)),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _has_any(user_id: str) -> bool:
    """True if the user has EVER had templates (incl. soft-deleted), so seeding
    runs exactly once and deleting every preset doesn't resurrect them."""
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM career_templates WHERE user_id = ? LIMIT 1", (str(user_id),))
        return cur.fetchone() is not None
    finally:
        conn.close()


def seed_defaults(user_id: str) -> None:
    """Populate a user's library with the built-in presets, once. No-op if they
    already have (or once had) any templates."""
    if _has_any(user_id):
        return
    uid = str(user_id)
    conn = _connect()
    try:
        cur = conn.cursor()
        for kind in ("resume", "portfolio"):
            for p in presets_for(kind):
                cur.execute(
                    "INSERT INTO career_templates (id, user_id, kind, name, spec_json, source) VALUES (?, ?, ?, ?, ?, ?)",
                    (_new_id(), uid, kind, p["name"], json.dumps(p["spec"]), p["id"]),
                )
        conn.commit()
    finally:
        conn.close()
