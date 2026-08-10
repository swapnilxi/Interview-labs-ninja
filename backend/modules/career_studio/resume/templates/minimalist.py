"""Minimalist resume template — muted, wide-spaced small-caps headings."""

from __future__ import annotations

_CSS = """
        body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #333; }
        .header { padding-bottom: 10px; }
        .header .name { font-size: 20pt; font-weight: 600; letter-spacing: 0.02em; }
        .header .role { font-size: 11pt; color: #777; }
        .header .contact { color: #888; }
        .sec { margin-top: 16px; }
        .sec h2 { font-size: 9pt; color: #9a9aa5; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 600; }
        .item-sub { color: #666; }
    """


def css(accent_hex: str) -> str:
    return _CSS.replace("{ACCENT}", accent_hex)
