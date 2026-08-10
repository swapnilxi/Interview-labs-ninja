"""Modern3D portfolio template — the live-browser-only Three.js/GSAP experience
(the frontend's Modern3DView.tsx) never runs server-side. xhtml2pdf has no JS
engine and can't render WebGL/backdrop-filter, so PDF/DOCX/HTML export falls
back to the same clean "modern" look used by that background id."""

from __future__ import annotations

from . import modern


def css(a: str) -> str:
    return modern.css(a)
