# Carbon — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Carbon should look like, then ask Claude Code to sync
`carbon.tsx`'s `css()` to match this file.

## Concept
Understated, textured, almost industrial — like brushed carbon fiber. The
most restrained of the light templates: no glow, no blur, just a subtle
woven texture and crisp cards. Good fit for a quiet, confident, no-frills
profile.

## Background
A repeating 45°-diagonal hairline pattern in the accent color at very low
opacity (`${accent}0d`, ~5%), 12px repeat, over a neutral light-grey base
(`#eef1f5`) — reads as a faint fabric weave rather than a visible grid.

## Card
Flat white card with a plain light-grey 1px border (`#e2e6ee`, not
accent-colored) and a fairly deep, neutral drop shadow with only a thin
accent tint. No top bar, no blur — the crispest, most "paper" card of the
light templates.

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — this file only supplies `css()`, a stylesheet self-scoped
  under `.pf-tpl-carbon` and keyed to the current accent color.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `carbon`. A matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/carbon.py` for PDF/DOCX
  export — keep both in sync if you change the texture recipe here.
