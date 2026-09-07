"""Isometric portfolio template — diagonal geometric pattern background."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    pattern = (
        f"background-color:#eef0f7;"
        f"background-image:"
        f"linear-gradient(30deg,{a}38 12%,transparent 12.5%,transparent 87%,{a}38 87.5%,{a}38),"
        f"linear-gradient(150deg,{a}38 12%,transparent 12.5%,transparent 87%,{a}38 87.5%,{a}38),"
        f"linear-gradient(30deg,{a}38 12%,transparent 12.5%,transparent 87%,{a}38 87.5%,{a}38),"
        f"linear-gradient(150deg,{a}38 12%,transparent 12.5%,transparent 87%,{a}38 87.5%,{a}38),"
        f"linear-gradient(60deg,#1e233326 25%,transparent 25.5%,transparent 75%,#1e233326 75%,#1e233326),"
        f"linear-gradient(60deg,#1e233326 25%,transparent 25.5%,transparent 75%,#1e233326 75%,#1e233326);"
        f"background-size:52px 90px;background-position:0 0,0 0,26px 45px,26px 45px,0 0,26px 45px;"
    )
    return (
        f".shell{{{shell}{pattern}}} "
        f".page{{background:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.8);border-bottom:3px solid {a}40;"
        f"box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 30px 60px -28px rgba(24,28,42,.45),0 14px 26px -18px {a}55;}}"
    )
