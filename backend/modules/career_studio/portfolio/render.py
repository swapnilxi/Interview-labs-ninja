"""Portfolio → standalone HTML rendering for export (widgets + print/PDF).

Mirrors resume/render.py's approach: one HTML generator serves every export
path (browser "Save as PDF", .html download, server-side PDF).
"""

from __future__ import annotations

import re

from ..shared.render import _ACCENTS, _e, _links
from .templates import get_css as _get_template_css


def _initials(name: str) -> str:
    """First+last initials for a LinkX avatar bubble."""
    parts = [p for p in re.split(r"\s+", (name or "").strip()) if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][0].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _render_widget(w: dict, accent_hex: str, template: str = "modern3d") -> str:
    wtype = w.get("widget_type")
    c = w.get("content") or {}
    heading = w.get("title") or (wtype or "Section").title()
    is_linkx = template == "linkx"

    if wtype == "hero":
        if not (c.get("headline") or c.get("subheadline") or c.get("tagline")):
            return ""
        avatar_url = c.get("avatar_url")
        avatar_inner = f'<img src="{_e(avatar_url)}" alt="">' if avatar_url else _e(_initials(c.get("headline") or ""))
        avail = '<p class="avail-pill">Open to work</p>' if c.get("available") else ""
        if is_linkx:
            return (
                f'<div class="hero"><div class="avatar">{avatar_inner}</div>'
                f'<h1>{_e(c.get("headline") or "Your Name")}</h1>'
                + (f'<p class="hero-sub">{_e(c.get("subheadline"))}</p>' if c.get("subheadline") else "")
                + (f'<p class="hero-tag">{_e(c.get("tagline"))}</p>' if c.get("tagline") else "")
                + avail + "</div>"
            )
        cta = f'<div class="cta">{_e(c.get("ctaLabel"))}</div>' if c.get("ctaLabel") else ""
        return (
            f'<div class="hero">' + (f'<div class="avatar">{avatar_inner}</div>' if avatar_url else "")
            + f'<h1>{_e(c.get("headline") or "Your Name")}</h1>'
            + (f'<p class="hero-sub">{_e(c.get("subheadline"))}</p>' if c.get("subheadline") else "")
            + (f'<p class="hero-tag">{_e(c.get("tagline"))}</p>' if c.get("tagline") else "")
            + avail + cta + "</div>"
        )

    if wtype in ("about", "custom"):
        if not c.get("text"):
            return ""
        return f'<section class="w"><h2>{_e(heading)}</h2><p class="para">{_e(c.get("text"))}</p></section>'

    if wtype == "skills":
        groups = c.get("groups", []) or []
        chips = [s for g in groups for s in (g.get("items", []) or []) if s]
        if not chips:
            return ""
        inner = "".join(f'<span class="chip">{_e(s)}</span>' for s in chips)
        return f'<section class="w"><h2>{_e(heading)}</h2><div class="chips">{inner}</div></section>'

    if wtype == "stats":
        items = c.get("items", []) or []
        cells = [it for it in items if it.get("value") or it.get("label")]
        if not cells:
            return ""
        tds = "".join(f'<td class="stat"><div class="stat-v">{_e(it.get("value"))}</div><div class="stat-l">{_e(it.get("label"))}</div></td>' for it in cells)
        return f'<section class="w"><table class="stats"><tr>{tds}</tr></table></section>'

    if wtype == "contact":
        if is_linkx:
            bits = [c.get("email"), c.get("phone"), c.get("location")]
            meta = " · ".join(_e(b) for b in bits if b)
            link_items = [l for l in (c.get("links") or []) if (isinstance(l, dict) and (l.get("url") or l.get("label"))) or (not isinstance(l, dict) and l)]
            if not meta and not link_items:
                return ""
            def _link_btn(l):
                if not isinstance(l, dict):
                    return f'<a class="link-btn" href="{_e(l)}">{_e(l)}</a>'
                label = _e(l.get("label") or l.get("url") or "")
                sub = f'<span class="link-sub"> — {_e(l.get("subtitle"))}</span>' if l.get("subtitle") else ""
                tag = '<span class="featured-tag">★ Featured</span> ' if l.get("featured") else ""
                badge = f' <span class="link-badge">{_e(l.get("badge"))}</span>' if l.get("badge") else ""
                return f'<a class="link-btn" href="{_e(l.get("url") or "")}">{tag}{label}{sub}{badge}</a>'
            btns = "".join(_link_btn(l) for l in link_items)
            meta_html = f'<p class="contact-meta">{meta}</p>' if meta else ""
            return f'<section class="w">{meta_html}{btns}</section>'
        bits = [c.get("email"), c.get("phone"), c.get("location")]
        line = " · ".join(_e(b) for b in bits if b)
        links = _links(c.get("links", []))
        joined = " · ".join(x for x in [line, links] if x)
        if not joined:
            return ""
        return f'<section class="w"><h2>{_e(heading)}</h2><p class="para">{joined}</p></section>'

    # items-based (projects, experience, education, gallery, testimonials)
    items = c.get("items", []) or []
    blocks = []
    for it in items:
        t = it.get("title", "")
        sub = it.get("subtitle", "")
        date = it.get("date", "")
        bullets = "".join(f"<li>{_e(b)}</li>" for b in (it.get("bullets", []) or []) if b)
        bullets = f"<ul>{bullets}</ul>" if bullets else ""
        head = f'<div class="p-head"><b>{_e(t)}</b>' + (f' — <span>{_e(sub)}</span>' if sub else "") + (f'<span class="p-date">{_e(date)}</span>' if date else "") + "</div>"
        if t or sub or bullets:
            blocks.append(f'<div class="p-item">{head}{bullets}</div>')
    if not blocks:
        return ""
    return f'<section class="w"><h2>{_e(heading)}</h2>{"".join(blocks)}</section>'


def render_portfolio_html(portfolio: dict) -> str:
    theme = portfolio.get("theme") or {}
    accent_hex = _ACCENTS.get(theme.get("accent"), _ACCENTS["violet"])
    serif = theme.get("font") == "serif"
    layout = theme.get("layout", "stack")
    template = theme.get("template", "modern3d")
    font_stack = "Georgia, 'Times New Roman', serif" if serif else "-apple-system, Helvetica, Arial, sans-serif"
    card = "background:#fff;border:1px solid #ececf1;border-radius:12px;padding:20px 22px;" if layout == "card" else ""
    centered = "text-align:center;" if layout == "centered" else ""

    widgets = sorted([w for w in portfolio.get("widgets", []) if not w.get("is_hidden")], key=lambda w: w.get("sort_order", 0))
    body = "".join(_render_widget(w, accent_hex, template) for w in widgets) or '<p class="para">This portfolio is empty.</p>'
    title = _e(portfolio.get("title") or "Portfolio")

    css = f"""
    @page {{ size: A4; margin: 1.4cm; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: #1f2430; font-family: {font_stack}; line-height: 1.5; }}
    .shell {{ padding: 28px 16px; }}
    {_get_template_css(template, accent_hex)}
    .page {{ max-width: 860px; margin: 0 auto; padding: 28px 24px; border-radius: 16px; }}
    .w {{ {card} margin-bottom: 22px; {centered} }}
    h1 {{ margin: 0; }}
    h2 {{ color: {accent_hex}; font-size: 18px; margin: 0 0 10px; }}
    .hero {{ background: {accent_hex}; color: #fff; border-radius: 14px; padding: 44px 28px; text-align: center; margin-bottom: 24px; }}
    .hero h1 {{ font-size: 30px; }}
    .hero-sub {{ font-size: 17px; opacity: .92; margin: 6px 0 0; }}
    .hero-tag {{ opacity: .85; margin: 10px auto 0; max-width: 520px; }}
    .avatar {{ width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 20px; color: #fff; background: {accent_hex}; box-shadow: 0 8px 20px -8px {accent_hex}99; }}
    .avatar img {{ width: 100%; height: 100%; object-fit: cover; }}
    .avail-pill {{ display: inline-block; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: rgba(16,185,129,.15); color: #059669; margin: 8px 0 0; }}
    .contact-meta {{ text-align: center; font-size: 12px; color: #6b7280; margin: 0 0 14px; }}
    .link-btn {{ display: block; text-align: center; padding: 12px 18px; margin-bottom: 10px; border-radius: 999px; border: 1.5px solid {accent_hex}; color: {accent_hex}; font-weight: 600; font-size: 14px; text-decoration: none; }}
    .link-sub {{ font-weight: 400; opacity: .75; }}
    .link-badge {{ font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: {accent_hex}22; }}
    .featured-tag {{ font-size: 10.5px; font-weight: 700; }}
    .cta {{ display: inline-block; margin-top: 16px; background: rgba(255,255,255,.2); padding: 8px 16px; border-radius: 8px; font-weight: 600; }}
    .para {{ margin: 0; white-space: pre-wrap; }}
    .chip {{ display: inline-block; background: {accent_hex}1a; color: {accent_hex}; border-radius: 999px; padding: 3px 10px; font-size: 13px; margin: 0 4px 4px 0; }}
    .stats {{ width: 100%; border-collapse: collapse; }}
    .stat {{ text-align: center; }}
    .stat-v {{ font-size: 24px; font-weight: bold; color: {accent_hex}; }}
    .stat-l {{ font-size: 12px; color: #6b7280; }}
    .p-item {{ margin-bottom: 12px; }}
    .p-date {{ color: #6b7280; font-size: 12px; float: right; }}
    ul {{ margin: 6px 0 0 18px; padding: 0; }}
    li {{ margin-bottom: 3px; }}
    a {{ color: {accent_hex}; text-decoration: none; }}
    """
    return (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>{title}</title><style>{css}</style></head>"
        f"<body class='shell'><div class='page'>{body}</div></body></html>"
    )


# Re-exported so callers that do `from . import render` (this module) and then
# `render.html_to_pdf(...)` keep working unchanged after the render.py split —
# html_to_pdf itself is generic and lives in shared/render.py.
from ..shared.render import html_to_pdf  # noqa: E402,F401
