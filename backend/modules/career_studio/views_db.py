"""Career views — a resume/portfolio is a LIVE, template-driven view over a
Master Profile. The view stores only which profile it reads, the template/theme,
and a section config (order + per-section hidden). Content always comes from the
profile at read time, so editing the profile updates every view referencing it.
"""

from __future__ import annotations

import json
from typing import Optional

from . import db
from .db import _connect, _new_id

_COLS = "id, user_id, profile_id, kind, title, template, accent, font, layout, config_json, is_deleted, created_at, updated_at"

_RESUME_DEFAULTS = {"template": "classic", "accent": None, "font": None, "layout": None}
_PORTFOLIO_DEFAULTS = {"template": "minimal", "accent": "violet", "font": "sans", "layout": "stack"}


def _meta(r) -> dict:
    return {
        "id": r[0],
        "profile_id": r[2],
        "kind": r[3],
        "title": r[4],
        "template": r[5],
        "accent": r[6],
        "font": r[7],
        "layout": r[8],
        "config": json.loads(r[9]) if r[9] else {"items": []},
        "created_at": r[11],
        "updated_at": r[12],
    }


def _seed_config(profile: dict) -> dict:
    return {"items": [{"section_id": s["id"], "hidden": bool(s.get("is_hidden"))} for s in profile.get("sections", [])]}


def create_view(user_id: str, profile_id: str, kind: str, title: Optional[str] = None, template: Optional[str] = None) -> Optional[dict]:
    uid = str(user_id)
    profile = db.get_profile(uid, profile_id)
    if profile is None:
        return None
    defaults = _PORTFOLIO_DEFAULTS if kind == "portfolio" else _RESUME_DEFAULTS
    vid = _new_id()
    default_title = title or (f"{profile['title']} — {'Portfolio' if kind == 'portfolio' else 'Resume'}")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO career_views (id, user_id, profile_id, kind, title, template, accent, font, layout, config_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (vid, uid, profile_id, kind, default_title, template or defaults["template"],
             defaults["accent"], defaults["font"], defaults["layout"], json.dumps(_seed_config(profile))),
        )
        conn.commit()
    finally:
        conn.close()
    return get_view(uid, vid)


def list_views(user_id: str, kind: Optional[str] = None) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        if kind:
            cur.execute(f"SELECT {_COLS} FROM career_views WHERE user_id = ? AND kind = ? AND is_deleted = 0 ORDER BY updated_at DESC", (str(user_id), kind))
        else:
            cur.execute(f"SELECT {_COLS} FROM career_views WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC", (str(user_id),))
        rows = cur.fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        m = _meta(r)
        m["section_count"] = len([i for i in m["config"].get("items", []) if not i.get("hidden")])
        m.pop("config", None)
        out.append(m)
    return out


def _get_meta(user_id: str, view_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT {_COLS} FROM career_views WHERE id = ? AND user_id = ? AND is_deleted = 0", (view_id, str(user_id)))
        row = cur.fetchone()
        return _meta(row) if row else None
    finally:
        conn.close()


def resolve_sections(view: dict, profile: dict) -> list[dict]:
    """Reconcile the view config against the profile's CURRENT sections: keep the
    configured order + hidden flags, append any new profile sections (visible),
    drop config entries whose section no longer exists. Returns full section
    dicts (with content) plus a `hidden` flag, in display order."""
    by_id = {s["id"]: s for s in profile.get("sections", [])}
    items = (view.get("config") or {}).get("items", [])
    ordered: list[dict] = []
    seen = set()
    for it in items:
        sid = it.get("section_id")
        s = by_id.get(sid)
        if s is None:
            continue
        ordered.append({**s, "hidden": bool(it.get("hidden"))})
        seen.add(sid)
    for s in profile.get("sections", []):
        if s["id"] not in seen:
            ordered.append({**s, "hidden": bool(s.get("is_hidden"))})
    return ordered


def get_view(user_id: str, view_id: str) -> Optional[dict]:
    uid = str(user_id)
    meta = _get_meta(uid, view_id)
    if meta is None:
        return None
    profile = db.get_profile(uid, meta["profile_id"])
    if profile is None:
        # Profile was deleted — surface the view but with no resolvable content.
        meta["profile_title"] = None
        meta["sections"] = []
        return meta
    resolved = resolve_sections(meta, profile)
    meta["profile_title"] = profile["title"]
    meta["sections"] = resolved
    # Persist any reconciliation (new/removed sections) back to config so the
    # editor and future reads agree.
    meta["config"] = {"items": [{"section_id": s["id"], "hidden": s["hidden"]} for s in resolved]}
    return meta


def update_view(user_id: str, view_id: str, fields: dict) -> Optional[dict]:
    uid = str(user_id)
    if _get_meta(uid, view_id) is None:
        return None
    sets, params = [], []
    for key in ("title", "template", "accent", "font", "layout", "profile_id"):
        if key in fields and fields[key] is not None:
            sets.append(f"{key} = ?")
            params.append(fields[key])
    if "config" in fields and fields["config"] is not None:
        sets.append("config_json = ?")
        params.append(json.dumps(fields["config"]))
    if not sets:
        return get_view(uid, view_id)
    sets.append("updated_at = datetime('now')")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(f"UPDATE career_views SET {', '.join(sets)} WHERE id = ? AND user_id = ?", (*params, view_id, uid))
        conn.commit()
    finally:
        conn.close()
    return get_view(uid, view_id)


# Resume section_type → portfolio widget_type. personal_info fans out to a hero
# + a contact widget; unknown types stay as-is (both renderers render items-based
# widgets generically).
def resolved_to_widgets(sections: list[dict]) -> list[dict]:
    """Materialize a portfolio view's widgets from resolved (visible) profile
    sections, so one profile drives both resume and portfolio outputs."""
    widgets: list[dict] = []
    order = 0

    def add(wid: str, wtype: str, title, content):
        nonlocal order
        widgets.append({"id": wid, "widget_type": wtype, "title": title, "content": content, "is_hidden": False, "sort_order": order})
        order += 1

    for s in sections:
        if s.get("hidden"):
            continue
        st = s.get("section_type")
        c = s.get("content") or {}
        sid = s["id"]
        if st == "personal_info":
            add(sid + "-hero", "hero", None, {"headline": c.get("name", ""), "subheadline": c.get("title", ""), "tagline": ""})
            if c.get("email") or c.get("phone") or c.get("location") or c.get("links"):
                add(sid + "-contact", "contact", s.get("title") or "Contact", {
                    "email": c.get("email", ""), "phone": c.get("phone", ""), "location": c.get("location", ""), "links": c.get("links", []),
                })
        elif st == "summary":
            add(sid, "about", s.get("title") or "About", {"text": c.get("text", "")})
        elif st == "skills":
            add(sid, "skills", s.get("title") or "Skills", {"groups": c.get("groups", [])})
        else:
            add(sid, st or "custom", s.get("title") or (st or "Section").title(), {"items": c.get("items", [])})
    return widgets


def delete_view(user_id: str, view_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE career_views SET is_deleted = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?", (view_id, str(user_id)))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
