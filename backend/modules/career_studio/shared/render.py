"""Rendering primitives shared across every Career Studio vertical (resume,
portfolio, cover letter): HTML escaping, the accent palette, font stacks, the
`_links` contact-line helper, Markdown escaping, and the PDF backend.
"""

from __future__ import annotations

import html
from typing import Any

# Accent palette shared with the portfolio theme vocabulary.
_ACCENTS = {
    "violet": "#7c3aed",
    "emerald": "#059669",
    "blue": "#2563eb",
    "rose": "#e11d48",
    "amber": "#d97706",
    "slate": "#334155",
}

_FONT_STACKS = {
    "serif": "Georgia, 'Times New Roman', serif",
    "sans": "Helvetica, Arial, sans-serif",
    "mono": "'Courier New', monospace",
}


def _e(v: Any) -> str:
    return html.escape("" if v is None else str(v))


def _links(items: list) -> str:
    out = []
    for l in items or []:
        if isinstance(l, dict):
            label = l.get("label") or l.get("url") or ""
            url = l.get("url") or ""
        else:
            label = url = str(l)
        if label:
            out.append(_e(label) if not url else f'<a href="{_e(url)}">{_e(label)}</a>')
    return " · ".join(out)


def _md_escape(v: Any) -> str:
    return "" if v is None else str(v).replace("*", "\\*").replace("_", "\\_")


def html_to_pdf(html_str: str) -> bytes:
    """Render HTML to PDF bytes with xhtml2pdf (pure-python, no system deps)."""
    import io

    from xhtml2pdf import pisa

    buf = io.BytesIO()
    result = pisa.CreatePDF(html_str, dest=buf, encoding="utf-8")
    if result.err:
        raise RuntimeError("PDF generation failed")
    return buf.getvalue()
