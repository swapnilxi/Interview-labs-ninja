"""Minimal portfolio template — plain light background, flat white cards. Also
the fallback style for any unrecognized template id."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    return (
        f".shell{{{shell}background:#f2f2f6;}} "
        f".page{{background:#fff;border:1px solid rgba(0,0,0,.05);"
        f"box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 22px 42px -26px rgba(24,28,42,.18),0 10px 20px -16px {a}30;}}"
    )
