# Minimal — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Minimal should look like, then ask Claude Code to sync
`minimal.tsx`'s `css()` to match this file.

## Concept
The plainest, most neutral template — flat light background, flat white
cards, nothing decorative. This is also the system-wide fallback: any
template id that doesn't resolve to a real template (typo, removed template,
unset) renders as Minimal (see `../index.ts`'s `getTemplate()`/`getCss()`).
Keep it genuinely minimal — resist the urge to add texture or glow here,
that's what the other templates are for.

## Background
Flat neutral light grey (`#f2f2f6`), no gradient, no texture.

## Card
Flat white card, faint neutral border (`rgba(0,0,0,.05)`), no top bar, no
blur — just a soft neutral shadow with a light accent tint at the base.

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — this file only supplies `css()`, a stylesheet self-scoped
  under `.pf-tpl-minimal` and keyed to the current accent color.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `minimal`, and used as the fallback value in both `getTemplate()` and
  `getCss()` — don't remove this template or those fallbacks break. A
  matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/minimal.py` (also that
  backend registry's fallback) for PDF/DOCX export — keep both in sync if you
  change anything here.
