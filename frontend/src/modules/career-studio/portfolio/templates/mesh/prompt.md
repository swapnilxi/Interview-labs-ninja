# Mesh — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Mesh should look like, then ask Claude Code to sync `mesh.tsx`'s
`css()` to match this file.

## Concept
Vibrant, multi-color gradient mesh — the boldest of the "soft glow" family
(alongside Aurora). Where Aurora is calm and two-tone, Mesh leans into more
simultaneous colors for an energetic, creative-agency feel.

## Background
Four overlapping radial-gradient blooms on a light blue-violet base:
- top-left: the theme accent color
- top-right: a fixed cyan (`#22d3ee`) glow
- bottom-left: a fixed amber (`#f59e0b`) glow
- bottom-right: the theme accent color again, fainter
- base wash: light diagonal gradient from `#eef0f8` to `#eaf0fb`

## Card
Frosted glass, same recipe as Aurora: semi-transparent white
(`rgba(255,255,255,.74)`) with backdrop blur, near-white border, and a soft
shadow tinted by the accent color. No top accent bar.

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — this file only supplies `css()`, a stylesheet self-scoped
  under `.pf-tpl-mesh` and keyed to the current accent color.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `mesh`. A matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/mesh.py` for PDF/DOCX
  export — keep both in sync if you change the gradient recipe here.
