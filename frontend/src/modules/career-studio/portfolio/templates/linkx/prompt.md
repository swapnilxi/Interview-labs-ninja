# LinkX — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what LinkX should look like, then ask Claude Code to sync
`linkx.tsx`'s `css()` (and, if the actual link-button markup needs to change,
`../shared.tsx`'s `WidgetView` — see Notes) to match this file.

## Concept
A dark "link-in-bio" style single column, like Linktree/Beacons rather than a
traditional resume-shaped portfolio. Built around one avatar + headline +
a vertical stack of tappable link buttons. The only built-in template with
genuinely different widget markup, not just a different background/card.

## Background
Deep near-black, built from two soft radial glows (a violet bloom top-left,
a teal bloom top-right) over a dark diagonal base gradient
(`#0a0a0f` → `#150c26` → `#1a0a2e`).

## Layout
Single narrow column (max 460px), centered, transparent card (no card
background/border/shadow at all — the page background shows straight
through). Avatar has a spinning conic-gradient ring (accent → cyan → orange →
back to accent). Headline in white, subheadline in soft lavender-white at
~62% opacity.

## Link buttons
Each link/section item renders as a pill-shaped glassy button: translucent
white fill, subtle border, backdrop blur, icon chip on the left, title +
optional subtitle, badge/arrow on the right. Hover lifts the button and
brightens the border/shadow toward the accent color. A "featured" link gets a
gradient border (accent → cyan → orange) instead of the plain glass border.

## Notes
- Built on the shared widget shell (`../shared.tsx`'s `PortfolioTemplateShell`
  / `WidgetView`) — the background/card/link-button CSS lives here in
  `css()`, self-scoped under `.pf-tpl-linkx`, but the actual link-button
  *markup* (not just its styling) is a `template === 'linkx'` branch inside
  `WidgetView` in `../shared.tsx`, since it's a genuinely different content
  layout, not just a skin. Changing the link-button structure (not just
  colors/spacing) means editing `shared.tsx`, not just this file.
- Registered in `../index.ts`'s `REGISTRY` and `CSS_REGISTRY` under id
  `linkx`. A matching CSS-only module lives in the backend at
  `backend/modules/career_studio/portfolio/templates/linkx.py` for PDF/DOCX
  export — keep both in sync if you change the recipe here.
