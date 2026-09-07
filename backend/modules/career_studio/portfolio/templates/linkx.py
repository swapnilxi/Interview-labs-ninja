"""LinkX portfolio template — dark, link-in-bio style single column."""

from __future__ import annotations


def css(a: str) -> str:
    shell = "-webkit-print-color-adjust: exact; print-color-adjust: exact;"
    bg = "background:linear-gradient(180deg,#fbfbff 0%,#f2f0fa 100%);"
    # Selectors here are prefixed with the ancestor `.shell` (not just
    # `.page`/`.hero`) so they out-specificity — and reliably win over,
    # regardless of source order — the later base `.page{max-width:860px}`
    # / `.hero{background:{accent}}` rules in render_portfolio_html's css.
    return (
        f".shell{{{shell}{bg}}} "
        f".shell .page{{max-width:480px;background:rgba(255,255,255,.95);border:1px solid rgba(255,255,255,.9);"
        f"box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 26px 50px -26px rgba(24,28,42,.2),0 12px 24px -16px {a}38;}} "
        f".shell .hero{{background:transparent;color:#1f2430;padding:6px 4px 2px;}} "
        f".shell .hero h1{{font-size:22px;}} .shell .hero-sub,.shell .hero-tag{{color:#6b7280;}}"
    )
