# Isometric — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Isometric should look like, then ask Claude Code to sync
`isometric.tsx`'s `css()` to match this file.

## Concept
Bold, geometric, dimensional — a background built from overlapping diagonal
bands that reads like isometric cube faces. The most visually loud of the
light templates; a good fit for a design/product-engineering profile that
wants to stand out.

## Background
Six layered diagonal linear-gradients (30°/150°/60° angles) combining
accent-tinted bands with dark ink-tinted bands (`#1e2333` at low opacity),
tiled at 52x90px, positioned to interlock into a repeating isometric-cube
pattern. Base color is a light blue-grey (`#eef0f7`).

## Card
Near-opaque white (`rgba(255,255,255,.9)`) with a light blur, a soft white
border, and — the one card in this set with a bottom accent border instead of
a top one (`border-bottom: 3px solid`, ~25% opacity) — plus the deepest
shadow of the light templates for a "floating card" feel.

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — this file only supplies `css()`, a stylesheet self-scoped
  under `.pf-tpl-isometric` and keyed to the current accent color.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `isometric`. A matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/isometric.py` for
  PDF/DOCX export — keep both in sync if you change the pattern recipe here.
