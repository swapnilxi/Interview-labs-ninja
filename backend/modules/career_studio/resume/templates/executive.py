"""Executive resume template — solid accent-color header band."""

from __future__ import annotations

_CSS = """
        body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; }
        .header { background: {ACCENT}; padding: 16px 18px; }
        .header .name { font-size: 22pt; color: #fff; }
        .header .role { font-size: 12pt; color: #f4f0ff; }
        .header .contact { color: #ece7fb; font-size: 9.5pt; }
        .header .contact a { color: #ece7fb; }
        .sec h2 { font-size: 10.5pt; color: {ACCENT}; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 2px solid {ACCENT}; padding-bottom: 2px; }
    """


def css(accent_hex: str) -> str:
    return _CSS.replace("{ACCENT}", accent_hex)
