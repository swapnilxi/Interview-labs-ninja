# Changelog

## [Unreleased]

### Added — Career Studio module

A self-contained, login-required "AI Career Studio" at `/career` (collapsible sidebar menu +
submenu), with its **own** `career_studio.sqlite3` (raw sqlite3, own init — decoupled from the app's
`lab_ninja.sqlite3` for lift-and-shift portability). Only existing files touched: three
`include_router` + one `init_career_db()` line in `backend/main.py`, and one sidebar menu/submenu —
all tagged `CAREER STUDIO INTEGRATION`. AI keys ride per-request via `AISettings` (never stored);
auth mirrors the `todo` module (`get_current_user_id`, `user_id`-scoped rows); every AI call is
written to an `ai_runs` audit table. Added `zustand` (new dep) for the builders' draft/undo state.

**Resume Builder** (`/career/resume`)
- Two-panel editor + live preview; drag-drop sections (`@dnd-kit`); add/duplicate/hide/delete/reorder.
- Debounced (1.5 s) autosave with status indicator; session undo/redo; shortcuts (⌘S/⌘Z/⌘⇧Z/⌘/).
- Immutable **versioning**: snapshot / restore / clone / branch (`VersionTimeline`).
- **AI resume analyzer** (ATS + 8 dimension scores + weak-bullet/cliché/red-flag fixes), streamed
  inline section rewrite, AI copilot, and PDF/DOCX/text **import** (AI-structured with diff preview).

**Portfolio Builder** (`/career/portfolio`)
- Widget-based one-page builder: hero, about, projects, experience, education, skills, gallery,
  testimonials, stats, contact, custom.
- Drag-drop reorder, hide/duplicate/delete, **theme** (accent + font), autosave, undo/redo, live
  preview, and the same immutable versioning (snapshot / restore / clone).
- **AI portfolio analyzer** (design / UX / content / SEO / accessibility / personal-branding /
  recruiter-friendliness scores + fixes) and the reused AI copilot.

Backend: `career_studio/` — `schema.py`, `db.py`, `versions.py`, `portfolio_db.py`,
`portfolio_versions.py`, `analysis_db.py`, `ai_runs.py`, `prompt_builder.py`, `llm.py`, `router.py`,
`analysis_router.py`, `portfolio_router.py`. Frontend: `careerService.ts` / `portfolioService.ts`,
Zustand stores, and components under `src/modules/career/` + pages under `src/app/career/`.

### Fixed

- `src/modules/todo/TaskNode.tsx`: added the missing optional `revealDelays` prop (a pre-existing
  `tsc --noEmit` type error, unrelated to Career Studio).

See `backend/modules/career_studio/ARCHITECTURE_NOTES.md` for architecture + extraction notes.
