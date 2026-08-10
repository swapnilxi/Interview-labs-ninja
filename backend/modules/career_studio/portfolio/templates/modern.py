"""Modern portfolio template — soft radial-gradient background, glassy card
with an accent-colored top border."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = (
        f"background-color:#f6f5fb;"
        f"background-image:"
        f"radial-gradient(560px circle at 88% -8%,{a}30,transparent 60%),"
        f"radial-gradient(520px circle at -10% 108%,{a}22,transparent 60%);"
    )
    return (
        f".shell{{{shell}{bg}}} "
        f".page{{background:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.9);border-top:3px solid {a};"
        f"box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 30px 60px -30px rgba(24,28,42,.22),0 14px 30px -20px {a}40;}}"
    )
