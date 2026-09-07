# Blueprint — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Blueprint should look like, then ask Claude Code to sync
`blueprint.tsx`'s `css()` to match this file.

## Concept
Technical, drafting-table look — like a page laid over architect's graph
paper. Should read as precise and engineering-minded, a good fit for
technical/systems-oriented profiles.

## Background
A fine grid of accent-tinted hairlines (1px, ~14% opacity) at 22px spacing,
both horizontal and vertical, over a very light blue-grey base (`#f6f8fc`).

## Card
Flat white card, square-ish (no heavy blur/glass effect — this template is
crisp, not soft), with a solid 3px accent-colored bar across the top edge and
a shadow that's mostly neutral with a thin accent tint at the base.

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — this file only supplies `css()`, a stylesheet self-scoped
  under `.pf-tpl-blueprint` and keyed to the current accent color.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `blueprint`. A matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/blueprint.py` for
  PDF/DOCX export — keep both in sync if you change the grid recipe here.
