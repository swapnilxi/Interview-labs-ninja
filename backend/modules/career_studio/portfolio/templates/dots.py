"""Dots portfolio template — subtle dot-grid background."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = (
        f"background-color:#f4f5f9;"
        f"background-image:radial-gradient({a}26 1.4px,transparent 1.6px);"
        f"background-size:18px 18px;"
    )
    return (
        f".shell{{{shell}{bg}}} "
        f".page{{background:#fff;border:1px solid rgba(0,0,0,.04);"
        f"box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 24px 46px -24px rgba(24,28,42,.26),0 12px 22px -16px {a}30;}}"
    )
