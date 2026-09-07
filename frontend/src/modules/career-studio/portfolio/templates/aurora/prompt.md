# Aurora — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Aurora should look like, then ask Claude Code to sync
`aurora.tsx`'s `css()` to match this file.

## Concept
Soft, dreamy, light-mode background — like looking at an aurora through frosted
glass. Calm and airy rather than bold; the accent color should feel like a
glow, not a block of color.

## Background
Three overlapping soft radial-gradient blooms on a very light violet/blue
base:
- top-left: the theme accent color, faint
- top-right: a fixed warm pink (`#f472b6`) glow, faint
- bottom-center: the theme accent color again, fainter still
- base wash: a light diagonal gradient from `#f6f5fc` to `#f0f2fb`

## Card
Frosted glass: semi-transparent white (`rgba(255,255,255,.72)`) with a strong
backdrop blur, a near-white 1px border, and a soft multi-layer shadow that
picks up a little of the accent color at the edges. No hard border color, no
top accent bar (that's Blueprint's move, not this one).

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — this file only supplies `css()`, a stylesheet self-scoped
  under `.pf-tpl-aurora` and keyed to the current accent color.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `aurora`. A matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/aurora.py` for PDF/DOCX
  export — keep both in sync if you change the background recipe here.
