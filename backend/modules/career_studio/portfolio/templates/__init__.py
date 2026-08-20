"""Registry of built-in portfolio templates — id -> css(accent_hex) -> str.

Each module owns its own background + card treatment; adding a new template
means adding a new module here and registering it below, with no changes to
render.py's dispatch logic. Unknown ids fall back to "minimal", matching the
previous if/elif chain's final fallthrough branch.
"""

from __future__ import annotations

from . import aurora, blueprint, carbon, dots, isometric, linkx, mesh, minimal, modern3d, visionary

REGISTRY = {
    "linkx": linkx.css,
    "modern3d": modern3d.css,
    "visionary": visionary.css,
    "minimal": minimal.css,
    "isometric": isometric.css,
    "aurora": aurora.css,
    "blueprint": blueprint.css,
    "dots": dots.css,
    "mesh": mesh.css,
    "carbon": carbon.css,
}


def get_css(template_id: str, accent_hex: str) -> str:
    fn = REGISTRY.get(template_id, REGISTRY["minimal"])
    return fn(accent_hex)
