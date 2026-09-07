# Career Studio — Architecture Notes

A self-contained "AI Career Studio" module (Milestone 1: **resume vertical slice** — builder,
immutable versioning, AI analyzer, AI section rewrite, AI copilot, and PDF/DOCX/text import).

It was specced against a generic stack (SQLAlchemy, a separate React-Router route table, shadcn,
a config registry, `/api/v1`, `{data,meta}` envelopes). This app uses **none** of those, so the
spec's intent was translated to the app's real conventions. See the table below.

## Assumptions vs. reality (what the translation changed)

| Spec assumed | This repo uses | Career Studio does |
|---|---|---|
| SQLAlchemy ORM + repositories | Raw `sqlite3`, `schema.register(cursor)` + hand CRUD | Raw sqlite3 CRUD (`db.py`, `versions.py`, `analysis_db.py`) |
| Separate `career_studio.db` | One shared `lab_ninja.sqlite3` via `common/db.py` | **Separate `career_studio.sqlite3`** with its own init (`db.init_career_db`) — decoupled for lift-and-shift |
| `/api/v1/career/` global prefix | No global prefix; each module owns its path | Router `prefix="/career"` |
| React Router route table | Next.js 15 App Router (file-based) | Pages under `src/app/career/**/page.tsx` |
| Zustand/Redux everywhere | Plain React state | **Zustand** only for the builder's draft/undo/autosave state (`store/resumeStore.ts`) |
| shadcn/MUI + config registry | Custom Tailwind + Heroicons; monolithic config | Tailwind semantic tokens + `@/components/ui/AppIcon` |
| `<CopilotSidebar>` | `common/LabCopilot.tsx` shell; `TodoCopilot` is wired | `CareerCopilot` reuses the shell, wired to `/career/copilot/ask` |
| `{data, meta}` envelope; keys in DB | Raw JSON; keys ride per-request via `AISettings` | Raw JSON; request models subclass `AISettings` |
| Admin roles / multi-tenant | JWT `get_current_user_id`, **no roles** | Mirrors the `todo` module (user_id scoping); admin deferred |

## Layout

As of 2026-08, the module is split into one subpackage per feature vertical, each
owning its own `db.py`/`router.py` (and `versions.py`/`templates/` where relevant),
plus a `shared/` subpackage for cross-vertical infrastructure:

```
career_studio/
├── shared/                connection primitives, DDL, rendering primitives, AI plumbing
│   ├── db.py              get_career_db_path(), _connect(), init_career_db(), _new_id()
│   ├── schema.py          register(cursor): DDL for every table in every vertical
│   ├── render.py          _e/_ACCENTS/_FONT_STACKS/_links/_md_escape, html_to_pdf()
│   ├── prompt_builder.py  pure prompt construction (analyzer / rewrite / copilot / import / …)
│   ├── llm.py             thin wrapper over modules.common.ai_client
│   ├── ai_runs.py         track_ai_run() context manager + insert_ai_run() (audit every AI call)
│   └── job_text.py        SSRF-guarded job-URL fetch (Greenhouse/Lever APIs) + job-text resolution,
│                          shared by the views and cover_letter verticals
├── resume/                profile/resume CRUD, versioning, router, and the resume export renderer
│   ├── db.py              resume_master/resume_sections CRUD — a Master Profile is a
│   │                      resume_master row with is_profile=1, so this is also the DB
│   │                      hub every other vertical (portfolio, cover-letter, job-match,
│   │                      views) reads/writes profile data through
│   ├── versions.py        immutable snapshots: snapshot / list / get / restore / clone / branch
│   ├── router.py          /career resume CRUD, sections, versioning, import
│   ├── render.py          render_resume_html/markdown/docx, resume_css_from_spec
│   └── templates/         one module per built-in resume template (classic.py, modern.py, …),
│                          each exporting css(accent_hex); __init__.py's REGISTRY/get_css()
│                          replace what used to be render.py's inline _TEMPLATE_CSS dict
├── portfolio/             portfolio/widget CRUD, versioning, router (+ public reader), testimonials
│   ├── db.py, versions.py, testimonials_db.py, router.py (router + public_router)
│   ├── render.py          render_portfolio_html, _render_widget
│   └── templates/         one module per built-in portfolio template (minimal.py, linkx.py, …),
│                          mirrors resume/templates/ — replaces the old _portfolio_template_css if-chain
├── cover_letter/          db.py, router.py, render.py — a letter is one text blob + lightweight
│                          immutable version history (not resume_sections/resume_versions)
├── job_match/             db.py (saved job descriptions), router.py (JD-tailoring preview/apply)
├── analysis/              db.py (resume_analysis persistence), router.py (analyzer, section
│                          rewrite SSE, copilot — spans resume + portfolio)
├── views/                 db.py (career_views: a live template-driven resume/portfolio over a
│                          profile), router.py (profile CRUD/import/enrich, view CRUD/export/
│                          publish/analytics, JD-tailor, "generate resume from job", job-match)
├── templates_designer/    db.py (user-designed template CRUD), presets.py (built-in preset
│                          specs), router.py — the Template Designer & Manager feature; a
│                          different concept from resume/portfolio's templates/ registries
│                          above (those are render implementations, this is user-facing CRUD)
└── publishing/            db.py — public frozen-snapshot publishing + versioned snapshot
                           history + analytics
```

## Data model & versioning

- `resume_master` → one per resume; points at `current_draft_id` (mutable working copy) and
  `current_version_id` (latest immutable checkpoint).
- The **draft** = `resume_sections` under `current_draft_id`. Autosave (frontend, 1.5 s debounce)
  UPDATEs these in place — matching the todo module's mutable-row idiom.
- A **checkpoint** = an immutable `resume_versions` row (`is_immutable=1`) whose section content is
  frozen into `content_json` and never updated. `clone` forks it into a new master; `branch` is a
  named clone; `restore` overwrites the draft from a checkpoint.
- Every row is user-scoped (`user_id` = the JWT user id as a string; value-only, no cross-DB FK).

## Integration points (the ONLY existing files touched — all tagged `CAREER STUDIO INTEGRATION`)

- `backend/main.py`: one import + `include_router(...)` per vertical router (`resume`, `analysis`,
  `portfolio` + its `public_router`, `job_match`, `views`, `templates_designer`, `cover_letter`);
  and `init_career_db()` (from `shared/db.py`) in the lifespan (creates the separate DB's tables).
- `frontend/src/modules/common/Sidebar.tsx`: one collapsible menu + submenu (`CAREER_LINKS`).
- New frontend files live under `src/app/career/**` and `src/modules/career-studio/**` (its own
  `shared/`/`resume/`/`portfolio/`/etc. subfolders — see the frontend module's own README) +
  `careerService.ts`/`viewsService.ts`/`templatesService.ts`/`portfolioService.ts`/`coverLetterService.ts`.
- **No** change to `common/db.py` (the separate DB owns its own init).

## Env vars

- `CAREER_STUDIO_DB_PATH` — override the sqlite file location (default: `career_studio/career_studio.sqlite3`,
  resolved from `shared/db.py` regardless of which vertical's code is asking).
  Reuses the app's `NEXT_PUBLIC_API_URL` on the frontend and the existing JWT auth; no other config.

## Extracting to a standalone service

1. Copy `backend/modules/career_studio/` (all subpackages) + `frontend/src/modules/career-studio/`
   + the 5 `lib/services/*.ts` files above.
2. Replace the two auth imports (`modules.auth.dependencies.get_current_user_id`) and the AI client
   import (`modules.common.ai_client`) with the target app's equivalents — these are the only two
   external couplings, both by interface, not by DB. Every internal import between career_studio
   subpackages is a relative import (`from ..shared.db import ...`, `from ..resume import db`, etc.),
   so the whole folder moves as one self-contained unit.
3. Point `CAREER_STUDIO_DB_PATH` at the new home; the schema self-creates on boot.
4. Re-add the sidebar entry + the `main.py` import/include_router lines (8 routers) in the new host.

## Built

- **Resume Builder** (`router.py`, `db.py`, `versions.py`) — CRUD, sections, immutable versioning, import.
- **Portfolio Builder** (`portfolio_router.py`, `portfolio_db.py`, `portfolio_versions.py`) — widget CRUD,
  theme, immutable versioning; portfolio analyzer in `analysis_router.py`.
- Shared AI: resume/portfolio analyzers, streamed section rewrite, copilot, `ai_runs` audit log.

## Roadmap (not built yet)

Job-Description Matcher · Cover Letters · GitHub/LinkedIn sync · Publishing/hosting (`/u/{username}`) ·
Comments · Analytics · Template marketplace · Admin (needs a role system) · PDF export (needs
WeasyPrint/headless Chrome) · HTML sanitization (needs `bleach`/DOMPurify).
