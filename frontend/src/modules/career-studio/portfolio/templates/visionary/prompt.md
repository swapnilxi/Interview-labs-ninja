# Visionary — template prompt

Editable design spec for this portfolio template. Edit the sections below to
change what Visionary should look like or contain, then ask Claude Code to
sync `VisionaryView.tsx` to match this file.

## Concept
A cinematic, dark, glass-panel portfolio experience — cooler and more
"engineering studio" than Modern3D's warm metallic-icosahedron hero. Ported
from a hardcoded single-person Google AI Studio scaffold (see the file's own
header comment for exactly what was kept vs. dropped); the visual/motion
language survived the port, all content now comes from real widget data.
Like Modern3D, it owns its entire page shell and is LIVE-BROWSER-ONLY:
deliberately absent from `../index.ts`'s `REGISTRY`, special-cased directly
in `../../PortfolioWidgetsView.tsx`. PDF/DOCX/HTML export and the Template
Designer's string preview fall back to a static dark card look instead
(`backend/modules/career_studio/portfolio/templates/visionary.py`).

## Palette & type
Background `#020617` (near-black navy). Three fixed ambient blur "orbs"
(indigo top-left, cyan bottom-right, indigo mid-right) are the entire
background atmosphere — no gradients on the sections themselves. Fonts:
"Inter" (body), "Instrument Serif" italic (a single accent word inside
section headings, e.g. "Building digital *ecosystems.*"), "JetBrains Mono"
(all-caps labels, nav links, eyebrow section numbers, stat/skill pills).
Accent color comes from the portfolio theme; a fixed emerald (`#34d399`) is
reserved for "live/available" status indicators specifically, not
theme-swappable.

## Sections (in order, each only rendered if it has real content)
1. **Hero** — kicker line (live dot + "Available for work"/"Portfolio"),
   giant gradient-clip name (must stay on one line at any width — same
   `ResizeObserver` shrink-to-fit fix as Modern3D's hero, don't drop the
   `white-space: nowrap` + `min-width: 0` flex fix), role, tagline, a
   Three.js artifact (frosted-glass octahedron shell + wireframe icosahedron
   lattice + metallic core + 6 orbiting translucent accent-tinted panels +
   drifting particle field, tilts toward the pointer), then CTA buttons.
2. **About** — two-column: bio text (left) + a glass "facts card" (right)
   showing only real fields (role, location, email) — no fabricated stats.
3. **Skills** — flat mono pill row ("Stack & tools").
4. **Stats** (optional) — only renders if a `stats` widget has real data; a
   4-across glass card grid of value/label pairs. Never fabricate numbers
   here if the widget is empty — that was a hardcoded tech-badge ribbon in
   the source scaffold and is exactly the kind of thing that must not survive
   the port.
5. **Projects** — vertical stack of glass cards, each with a deterministic
   (hashed, not random) accent glow and a matching gradient "visual" panel
   standing in for a real project image, numbered index, title/subtitle/
   bullets.
6. **Experience** — interactive master-detail: a clickable list of
   company/role/period nodes on the left, a detail console on the right
   showing the selected node's bullets, with a deterministic accent glow per
   node (hashed from title, not a fixed category taxonomy — the source
   scaffold's `domain` field doesn't exist in our data model).
7. **Contact** — giant gradient-clip email link + social icon row. No
   contact form — the source scaffold's form had no real submit handler
   (fake success state only); don't reintroduce it without wiring a real
   backend.

## Interactions
Fixed nav bar, transparent over the hero, gains a blurred dark background
once scrolled (plain DOM class toggle, not React state, so scroll doesn't
re-render the page). Section fade/slide-up reveals via IntersectionObserver.
Custom cursor: small dot that lerp-follows the pointer and grows into a ring
over interactive elements — desktop fine-pointer only
(`(hover: hover) and (pointer: fine)`), absent on touch devices.

## Deliberately not ported (don't re-add without discussing scope first)
- The Web Audio ambient drone synth — pure decoration, unrelated to content.
- `InteractiveSimulators` — four bespoke mini-dashboards hand-tuned to the
  original scaffold's specific hardcoded projects; don't generalize.
- A resume/CV modal — this app already has a real resume/export feature
  elsewhere; don't duplicate it here.

## Notes
- Section numbering (`01`, `02`, …) only counts sections that actually
  render — keep the `nextNum()` pattern if you add a section.
- The "visionary" alias in the Template Designer's string preview
  (`../../templates-designer/templatePreview.ts`) and the backend PDF
  fallback are static approximations, not a second implementation — don't
  try to make them pixel-match, they exist only because those paths can't
  run JS.
