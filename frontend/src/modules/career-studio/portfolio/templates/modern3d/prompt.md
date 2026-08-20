# Modern3D — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Modern3D should look like or contain, then ask Claude Code to
sync `Modern3DView.tsx` to match this file.

## Concept
The flagship interactive portfolio experience — a dark, cinematic single-page
site with a live Three.js hero, GSAP scroll reveals, a horizontal-scroll
project rail, and a desktop custom cursor. Unlike every other template (a CSS
background + the shared widget-card stack), this one owns its entire page
shell and is LIVE-BROWSER-ONLY: it's deliberately absent from
`../index.ts`'s `REGISTRY` (see that file's header comment) and is
special-cased directly in `../../PortfolioWidgetsView.tsx`. PDF/DOCX/HTML
export and the Template Designer's string preview can't run WebGL/GSAP, so
they fall back to a static soft-gradient card look instead
(`backend/modules/career_studio/portfolio/templates/modern3d.py`).

## Palette & type
Background `#050816`, body text `#e2e8f0`. Headings in "Space Grotesk"
(500–800 weight), body in "Inter". Accent color comes from the portfolio
theme (`ACCENT_HEX[theme.accent]`), paired with a fixed cyan (`#06b6d4`) as
the secondary color throughout (wireframe shell, gradients, timeline).

## Sections (in order, each only rendered if it has real content)
1. **Hero** — full-viewport. Rotating metallic icosahedron (Three.js,
   tilts toward the pointer) behind a centered name/role/tagline block.
   Optional "Available for work" badge. Name is GSAP-revealed
   character-by-character on mount and must always stay on one line,
   shrinking to fit at any viewport width (see the `useLayoutEffect` fit
   logic — don't remove the `white-space: nowrap` + `min-width: 0` flex fix,
   the name will silently stop shrinking on resize without both).
   CTA buttons: "Get in touch" (mailto) + first contact link.
2. **About** — plain paragraph.
3. **Skills** — flat wrapped pill grid, tilt-on-hover.
4. **Projects** — horizontal scroll-pinned rail on desktop (GSAP
   ScrollTrigger pin + scrub), plain vertical stack on mobile/reduced-motion.
   Each card gets a deterministic (hashed, not random) gradient cover band
   standing in for a real project image.
5. **Experience** — vertical timeline with an animated SVG line that draws
   in as you scroll; used for every items-based widget that isn't
   `projects` (education, certifications, etc. all land here too).
6. **Contact** — giant gradient-clip email link + social icon row.

## Interactions
Scroll progress bar (sticky, top of page). Section fade/slide-up reveals via
IntersectionObserver. Desktop-only custom cursor (lerped, `mix-blend-mode:
difference`) — skipped entirely on touch/coarse-pointer devices.
`prefers-reduced-motion` disables all of the above transitions/animations.

## Notes
- Section numbering (`01`, `02`, …) only counts sections that actually
  render, so a hidden/empty section doesn't leave a gap in the sequence —
  keep that pattern (`nextNum()`) if you add a section.
- The "modern3d" alias in the Template Designer's string preview
  (`../../templates-designer/templatePreview.ts`) and the backend PDF
  fallback are both static approximations, not a second implementation of
  this design — don't try to make them pixel-match, they exist only because
  those paths can't run JS.
