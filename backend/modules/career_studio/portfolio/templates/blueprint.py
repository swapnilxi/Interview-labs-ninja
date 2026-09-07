"""Blueprint portfolio template — grid-line background, accent top border."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = (
        f"background-color:#f6f8fc;"
        f"background-image:linear-gradient({a}14 1px,transparent 1px),linear-gradient(90deg,{a}14 1px,transparent 1px);"
        f"background-size:22px 22px;"
    )
    return (
        f".shell{{{shell}{bg}}} "
        f".page{{background:#fff;border-top:3px solid {a};"
        f"box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 22px 42px -24px rgba(24,28,42,.28),0 12px 24px -16px {a}30;}}"
    )
