"""Modern resume template — sans-serif, left accent border on the header."""

from __future__ import annotations

_CSS = """
        body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; }
        .header { border-left: 5px solid {ACCENT}; padding: 4px 0 6px 12px; }
        .header .name { font-size: 21pt; color: {ACCENT}; }
        .header .role { font-size: 11.5pt; color: #333; }
        .sec h2 { font-size: 11pt; color: {ACCENT}; }
    """


def css(accent_hex: str) -> str:
    return _CSS.replace("{ACCENT}", accent_hex)
