"""Technical resume template — monospace name/headings, left-bar section rule."""

from __future__ import annotations

_CSS = """
        body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; }
        .header { border-bottom: 2px solid {ACCENT}; padding-bottom: 8px; }
        .header .name { font-size: 20pt; font-family: 'Courier New', monospace; color: {ACCENT}; }
        .header .role { font-size: 11pt; font-family: 'Courier New', monospace; color: #444; }
        .sec h2 { font-size: 10.5pt; color: #111; font-family: 'Courier New', monospace; border-left: 3px solid {ACCENT}; padding-left: 6px; text-transform: none; letter-spacing: 0; }
    """


def css(accent_hex: str) -> str:
    return _CSS.replace("{ACCENT}", accent_hex)
