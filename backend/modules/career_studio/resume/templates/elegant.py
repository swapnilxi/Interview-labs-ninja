"""Elegant resume template — serif, centered, letter-spaced headings."""

from __future__ import annotations

_CSS = """
        body { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; color: #2b2b2b; }
        .header { text-align: center; padding-bottom: 6px; }
        .header .name { font-size: 24pt; letter-spacing: 0.04em; font-weight: normal; }
        .header .role { font-size: 11pt; color: {ACCENT}; letter-spacing: 0.08em; text-transform: uppercase; }
        .header .contact { border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 4px 0; margin-top: 6px; display: inline-block; }
        .sec h2 { font-size: 11pt; color: {ACCENT}; text-align: center; }
    """


def css(accent_hex: str) -> str:
    return _CSS.replace("{ACCENT}", accent_hex)
