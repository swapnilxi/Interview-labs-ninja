"""Classic resume template — serif, centered header, ruled section headings."""

from __future__ import annotations

_CSS = """
        body { font-family: 'Times New Roman', Georgia, serif; font-size: 11pt; }
        .header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 8px; }
        .header .name { font-size: 22pt; }
        .header .role { font-size: 12pt; color: #444; }
        .sec h2 { font-size: 11.5pt; color: #222; border-bottom: 1px solid #bbb; padding-bottom: 2px; }
    """


def css(accent_hex: str) -> str:
    return _CSS.replace("{ACCENT}", accent_hex)
