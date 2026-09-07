"""Carbon portfolio template — diagonal carbon-fiber-style hairline pattern."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = (
        f"background-color:#eef1f5;"
        f"background-image:repeating-linear-gradient(45deg,{a}0d 0,{a}0d 1px,transparent 1px,transparent 11px);"
    )
    return (
        f".shell{{{shell}{bg}}} "
        f".page{{background:#fff;border:1px solid #e2e6ee;"
        f"box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 20px 38px -22px rgba(24,28,42,.32),0 10px 20px -14px {a}30;}}"
    )
