"""Aurora portfolio template — soft multi-color radial-gradient glow background."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = (
        f"background:"
        f"radial-gradient(closest-side at 18% 12%,{a}33,transparent),"
        f"radial-gradient(closest-side at 84% 6%,#f472b636,transparent),"
        f"radial-gradient(closest-side at 60% 100%,{a}26,transparent),#f4f4fb;"
    )
    return (
        f".shell{{{shell}{bg}}} "
        f".page{{background:rgba(255,255,255,.85);border:1px solid #fff;"
        f"box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 28px 56px -28px rgba(24,28,42,.24),0 14px 30px -18px {a}66;}}"
    )
