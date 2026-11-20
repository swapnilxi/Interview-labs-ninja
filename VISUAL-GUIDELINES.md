# LabNinja visual guideline

The visual rules every screen follows, on desktop and phone. They grew out of the unslop passes of 2026-11-17 over
AI To-Do (the Smart tab above all), Daily Session and SwipeLearn, on top of the app-wide "Graphite & Fern" tokens in
`frontend/src/styles/tailwind.css`. When a module doc (README, `ai-to-do.md`) and this file disagree about looks, this
file wins; when a screen needs an exception, write it down here.

**Character:** calm, exact, a little warm. **World:** a study desk and a planner: paper-neutral surfaces, ink text, one
fern-green accent that follows the Settings colour.

## 1. Principles

1. **Quiet chrome, content carries the colour.** Navigation, toolbars, chips, icons and surfaces are neutral. Hue is
   for what it means: the primary action and the current selection (the accent), progress fills, status, priority and
   difficulty, results (correct / wrong), errors, and a topic's identity inside its own card (SwipeLearn).
2. **One primary action per view.** One filled accent button; everything else is secondary or quiet.
3. **Show a value only when it says something.** Defaults (Backlog, P3, an empty date) wait for hover, focus or "···",
   at the end of their line, so revealing them moves nothing.
4. **Group with space and surfaces, not with lines and colours.** Content sits on cards; controls sit on the page.
   More space between groups than inside them.
5. **Same thing, same look, in every module.** A chip, a count, a stat card or an empty state looks the same in
   To-Do, Daily Session and SwipeLearn.

## 2. Colour roles

| Role | Token | Use |
| --- | --- | --- |
| Page | `--color-background` | the page behind everything |
| Card | `--color-card` | content containers (task cards, session cards, the swipe card) |
| Fill / fill-strong | `--color-fill`, `--color-fill-strong` | soft controls: quiet buttons, chips, selected chip (strong) |
| Hairline | foreground at 8-12% (`mix-border-foreground/10`, `--color-separator`) | card borders, dividers, outlines |
| Text | `text-foreground` / secondary (`--ds-ink-2`) / `text-muted-foreground` | three roles only: primary, secondary, meta |
| Accent | `--color-primary` (fern; follows Settings) | primary button, selection, progress fill, today marker |
| Semantic | `--color-success` / `--color-warning` / `--color-error` / `--color-progress` / `--color-info` | status, priority, difficulty, results and errors, as a dot, a fill or the text of a message |

Never: hue-to-hue gradients, gradient text, glows or coloured shadows, radial washes behind content, a rainbow of
icon tiles, tinted chips that only decorate. A gradient is allowed only as a small tone shift inside one neutral.
**One exception: the labs** (section 9) carry a soft glow edge and a one-hue corner wash on their cards, by request.

## 3. Type

- **Family:** SF Pro on Apple devices, Inter elsewhere (`font-heading` for titles).
- **Scale:** page title 24 px desktop / 32 px phone large title, 600 · section title 18-22 px, 600 · card or group
  title 16 px, 600 · row title 15 px, 500 (a subtask 14 px, 400) · body 14-15 px, 400 · meta 12-13 px, 400, muted ·
  figures `tabular-nums`, 500-600.
- **Weights:** 400 and 500; 600 only for headings and figures; never 700 or more.
- Sentence case everywhere. No uppercase tracked labels, no italic for emphasis (a quotation in another language,
  like a Sanskrit verse, may stay italic). Negative tracking only on titles of 24 px and up.

## 4. Spacing and layout

- **4 px grid:** 4, 8, 12, 16, 24, 32, 48. Watch the Tailwind trap: `px-6`, `h-12`, `gap-24` … are pixels in this repo;
  write `px-[1.5rem]`. Opacity on theme colours needs `mix-*` (`mix-bg-foreground/[0.06]`). `npm run check:tailwind`.
- **Rhythm:** page gutter 16 px phone / 32 px desktop · between sections 24 px phone / 32 px desktop · between groups
  12-16 px · inside a group 4-8 px.
- **Containers:** To-Do up to 1440 px with the Copilot column; Daily Session 1200 px, header and content share one edge
  on every tab; SwipeLearn a 680 px reading column.
- **Bands:** a screen reads as a few bands, each with one job, for example capture → view switch → section header →
  search and filters → content. Never two controls that look alike on top of each other.

## 5. Components

- **Card:** card colour, 1 px hairline (8%), radius 16 px, `--shadow-card` at most. A list card has 4 px inset; its rows
  have radius 12 px (nested radius = outer - padding).
- **List row:** at least 44 px tall; title, then one quiet meta line; dividers between rows, never against the card's
  edge; hover = a 4% fill; secondary actions appear on hover or focus (`.todo-reveal`), always on touch after "···".
- **Hierarchy in a list:** a parent heads its card (16 px, 600); children are indented 24 px, lighter (14 px, 400) and
  hang from a 1 px guide line. No per-row colour rails.
- **Chips:** neutral fill, 500. Selected = `fill-strong` + a check icon; unselected = a hairline outline. A chip's
  colour, when it carries one, is a dot (difficulty, a topic, a status), never the chip itself.
- **Segmented control:** one per decision. The page's sections use underline tabs (To-Do) or the capsule (Daily
  Session); views inside a section use one segmented control.
- **Buttons:** primary = accent fill (one per view) · secondary = card + hairline · quiet = text with a fill on hover.
  Controls 8-10 px radius; chips and segmented controls are capsules.
- **Icons:** outline Heroicons through `AppIcon`, 16-18 px, in the text colour. `FlatIcon` (solid, meaning-coloured)
  only where the colour means something; pass `quiet` in chrome. Icon tiles are neutral (`--color-fill`). The icon rail's bottom group (install app, settings, theme, log out, hide) is flat outlined glyphs only, no tiles.
- **Counts:** quiet text next to their label (`Tasks 31 open`, `Saved 2`), not filled pills. The one exception is a
  notification badge on an icon.
- **Stat cards:** a label, the number, a short note. No icons, no sparklines.
- **Empty state:** one muted icon, a title, one sentence, at most one action.
- **Progress:** a thin bar with the accent fill (success once complete); the day strip marks today with an accent ring.

## 6. Motion

Name the transition (`transition-colors`, `transition-[opacity]`, `transition-[transform,opacity]`), 120-200 ms, one
ease-out curve. No `transition-all`, no hover lift or scale on cards, no glows. Loops only for live states (loading,
recording, a streaming answer).

## 7. Copy

Sentence case; no exclamation marks in interface text; no greetings (the date is the eyebrow or the title); short labels
(`Search tasks`, not `Search anything...`); `…` for something in progress; no trailing period on labels, buttons and
one-line messages. A companion character (Deepu) may speak in its own voice inside its bubble.

## 8. Phones

The same hierarchy with fewer things at rest: defaults and secondary actions move behind "···", labels may become
icons (with an `aria-label`), segmented controls keep their words. 16 px gutters, 40 px or larger tap targets, no
horizontal page scroll, room above the floating tab bar and the mic button. Check at 390 px and 1440 px, light and dark.

## 9. Module notes

- **AI To-Do:** Smart tab = capture card → one view switch (Tree · List · Focus · Matrix · Week) → "Tasks" header with
  progress as a quiet line → search and Filters → task cards (`.todo-group`). Depth is indentation plus `.todo-branch`;
  `.todo-rail` is only the labs' active-row rail. Matrices use `EisenhowerMatrix tone="calm"`. Details: `ai-to-do.md`.
- **Daily Session:** the `ds-*` skin (`daily-session.css`) keeps its tones for meaning only: icon tiles, chips and the
  streak / XP pills are neutral; a selected chip shows a check; stat cards are numbers; the header eyebrow is the date.
- **SwipeLearn:** the card banner carries the topic's hue (the screen's one moment); topics appear as `.swipe-dot`
  everywhere else; the deck's actions are neutral rounds with Save as the one accent button.
- **Labs (DSA, CV, System Design, Communication, Finance, Python, GenAI, Labs home, Labs Project):** the one place with a glow, because the
  flat hairlines made the cards impossible to tell apart. `.lab-edge` = a hairline tinted with the lab's identity hue, a 3px halo ring,
  a faint outer glow and a corner wash of the same hue (the hero's wash at about half strength); `lab-edge-link` turns the edge to the
  accent on hover and focus, the glow and wash grow, and the card lifts in z-order only (it never moves). The edge is static (no pulse). Only surfaces get it (hero, cards, panels, list shells, the side
  panes' dividing edge), never chips, rows, inputs or dialogs; `.lab-card-muted` stays flat as the quiet tier. The rows inside the index panels (`WikiIndexNav`) are tiles (7% fill, 22% hairline, 8 px gap) so they read as separate items; hover = the accent tint. The line and the separators carry the card on a
  dimmed screen (measured, see README "Lab visual system"); the outer glow stays subtle on purpose: to make something more visible, raise
  the line, not the aura. **Moving rim:** only the main title surfaces (every
  lab hero and the topic / week plan / project headers, `lab-rim`) have a travelling silver arc (silver and its shades, never the lab hue), paused at rest and running on hover
  or focus, still under reduced motion. **Hero palette:** a lab has three hues (`--lab-identity`, `-2`, `-3`) used for the hero's
  wash, icon tile, progress fill and stat numbers (difficulty keeps red/amber/green); hue only, never on a control. Tokens
  `--edge-*` and `--lab-identity-*` in `tailwind.css`.
- **Guided Practice (`labs/guided`, DSA and CV):** the one screen with its own accent, purple `#9172EC`, because its brief asked
  for it; `.gp-accent` re-points `--color-primary` and the `--lab-accent*` tokens (a `var()` alias resolves where it is declared, so
  both must be redeclared), and anything portalled to `<body>` carries `gp-accent` itself. Everything else is this guideline: solid
  grouped cards with hairlines (material, i.e. blur, only on the title bar, reward banners and sheets), the journey line through the
  phases as the signature and the three activity rings (one hue in three weights) as the moment, iOS switches and segmented controls,
  44 px buttons on touch screens (larger hit areas on the small controls), no hue gradients; its cards (`.gp-card`) carry the labs' soft glow edge and corner
  wash in the purple, a locked phase none. The dark
  ink on a purple fill is deliberate: white on `#9172EC` is 3.6:1.

- **AI LMS Workbooks (`ai-lms/workbooks`):** the one LMS area with its own accent, soft sage `#4f9d8b`, and a gentle pastel
  wash (mint, peach, lilac) behind a workbook's title and in its cards' corners, because its brief asked for it (2026-11-19).
  `.wb-accent` re-points `--color-primary` inside it only (`styles/workbook.css`); a filled button carries dark ink (white on
  the sage is 3.3:1). Everything else is this guideline: neutral chips, hue only for meaning, weights 400-600, sentence case.

## 10. Before you ship a screen

- [ ] One primary action; the accent appears only on it, the selection and progress
- [ ] No gradients, glows, coloured shadows, emoji in the interface, or tinted decoration (the labs' `lab-edge` surfaces excepted)
- [ ] Weights 400-600, sentence case, three text roles, tabular figures
- [ ] Spacing on the 4 px grid; groups closer inside than between
- [ ] Defaults hidden at rest; nothing moves when they appear
- [ ] Rendered at 390 and 1440 px, light and dark; no console errors, no horizontal scroll; `npm run check:tailwind`
