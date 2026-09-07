"""Registry of built-in resume templates — id -> css(accent_hex) -> str.

Each module owns its own CSS; adding a new template means adding a new module
here and registering it below, with no changes to render.py's dispatch logic.
"""

from __future__ import annotations

from . import classic, compact, elegant, executive, minimalist, modern, technical

REGISTRY = {
    "classic": classic.css,
    "modern": modern.css,
    "compact": compact.css,
    "elegant": elegant.css,
    "executive": executive.css,
    "minimalist": minimalist.css,
    "technical": technical.css,
}


def get_css(template_id: str, accent_hex: str) -> str:
    fn = REGISTRY.get(template_id, REGISTRY["classic"])
    return fn(accent_hex)
