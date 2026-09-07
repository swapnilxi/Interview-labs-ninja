"""Visionary portfolio template — the live-browser-only Three.js/motion
experience (the frontend's visionary/VisionaryView.tsx) never runs
server-side. xhtml2pdf has no JS engine and can't render WebGL/backdrop-filter,
so PDF/DOCX/HTML export falls back to this static dark card treatment that
echoes the live page's indigo/cyan-on-near-black palette instead."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = (
        f"background-color:#020617;"
        f"background-image:"
        f"radial-gradient(560px circle at 88% -8%,{a}30,transparent 60%),"
        f"radial-gradient(520px circle at -10% 108%,#06b6d426,transparent 60%);"
    )
    return (
        f".shell{{{shell}{bg}color:#e2e8f0;}} "
        f".page{{background:rgba(15,23,42,.85);border:1px solid rgba(255,255,255,.08);border-top:3px solid {a};"
        f"box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 30px 60px -30px rgba(0,0,0,.5),0 14px 30px -20px {a}55;}}"
    )
