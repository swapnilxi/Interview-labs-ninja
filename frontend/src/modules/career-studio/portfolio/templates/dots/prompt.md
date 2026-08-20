# Dots — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Dots should look like, then ask Claude Code to sync `dots.tsx`'s
`css()` to match this file.

## Concept
Friendly, playful, polka-dot texture — a lighter, more approachable feel than
the grid-based templates (Blueprint, Isometric). Good default for a
generalist/creative profile that wants some texture without heavy theming.

## Background
A regular field of small accent-colored dots (radial-gradient dot, ~1.4px
radius, ~15% opacity) at 18px spacing, over a neutral light-grey base
(`#f4f5f9`).

## Card
Flat white card, faint neutral border (`rgba(0,0,0,.04)`), no top bar, no
blur — a soft-but-crisp shadow with a light accent tint.

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — this file only supplies `css()`, a stylesheet self-scoped
  under `.pf-tpl-dots` and keyed to the current accent color.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `dots`. A matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/dots.py` for PDF/DOCX
  export — keep both in sync if you change the dot-field recipe here.
