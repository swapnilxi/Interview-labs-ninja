"""Compact resume template — tight margins/spacing for fitting more content."""

from __future__ import annotations

_CSS = """
        body { font-family: Helvetica, Arial, sans-serif; font-size: 9.5pt; }
        @page { margin: 1.1cm; }
        .header .name { font-size: 18pt; }
        .header .role { font-size: 10.5pt; color: #444; }
        .sec { margin-top: 9px; }
        .sec h2 { font-size: 10pt; color: #111; border-bottom: 1px solid #ddd; padding-bottom: 1px; }
        li, .summary, .skill { font-size: 9.5pt; }
    """


def css(accent_hex: str) -> str:
    return _CSS.replace("{ACCENT}", accent_hex)
