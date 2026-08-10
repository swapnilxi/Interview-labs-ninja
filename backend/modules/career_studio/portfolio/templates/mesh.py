"""Mesh portfolio template — multi-color radial-gradient mesh background."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = (
        f"background:"
        f"radial-gradient(closest-side at 0% 0%,{a}30,transparent),"
        f"radial-gradient(closest-side at 100% 18%,#22d3ee33,transparent),"
        f"radial-gradient(closest-side at 28% 92%,#f59e0b2e,transparent),"
        f"radial-gradient(closest-side at 92% 100%,{a}26,transparent),#eef0f8;"
    )
    return (
        f".shell{{{shell}{bg}}} "
        f".page{{background:rgba(255,255,255,.86);border:1px solid #fff;"
        f"box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 28px 56px -28px rgba(24,28,42,.24),0 14px 30px -18px {a}59;}}"
    )
