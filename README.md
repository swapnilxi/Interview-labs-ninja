# Lab-Ninja (CV-Aware Interview Coach)

Lab-Ninja is a monorepo containing a FastAPI backend and a Next.js frontend for an
agent-powered interview coach for software and computer vision engineers. It:

- Uses a system prompt tailored for daily interview training.
- Generates 10 questions per day (5 Core Interview, 5 Computer Vision).
- Is CV / Job Description aware (inputs provided by the host UI).
- Persists all questions in SQLite for review and filtering.
- Supports a UI with two main tabs:
  - **Curate Questions**: choose topics and start a new daily session.
  - **Previous Questions**: review past questions with filters.

## Monorepo Layout

- Backend (FastAPI API server)
  - `backend/main.py`: FastAPI app exposing health, sessions, questions, and export endpoints.
  - `lab_ninja/db.py`: SQLite schema and helpers for sessions and
    questions, optimized for the Previous Questions tab filters.
  - `lab_ninja/export_md.py`: Markdown export utilities used when
    the user chooses to export a day's questions.
  - `lab_ninja/rubrics.md`: answer-evaluation rubrics by question
    sub-type.
- Frontend (Next.js + TypeScript + Tailwind)
  - `frontend/`: Next.js app (App Router, TypeScript, Tailwind) that can
    talk to the FastAPI backend.

## Backend Core Components

- `agent_config.lab_ninja.json`: configuration and system prompt
  for the Lab-Ninja agent, including output schema and topic
  selection rules.

You can integrate this package into any agent runtime or UI stack
(web, desktop, or CLI). The UI is responsible for:

- Collecting CV text or uploaded files.
- Collecting job descriptions (pasted or uploaded).
- Letting the user select or edit topics in the Curate Questions tab.
- Calling the agent with those inputs and then saving questions via
  `interview_ninja.db`.
- Using `lab_ninja.export_md.render_markdown_for_day` to
  generate Markdown when the user opts to export.

## Running Locally

### Quick Start (Start Both Frontend and Backend)

You can run both services concurrently using the startup script in the workspace root:

```bash
# 1. Make the script executable (one-time)
chmod +x startup.sh

# 2. Run both services
./startup.sh
```

To stop both services, simply press `Ctrl+C`.

### Backend (FastAPI)

- Requires [`uv`](https://docs.astral.sh/uv/) installed locally.
- From `backend/`, dependencies are managed via `pyproject.toml` / `uv.lock`; `uv run` installs
  them automatically into a local `.venv` on first use.
- Initialize the SQLite DB (one-time convenience):
  - `cd backend && uv run python main.py`
- Run the API server (for local dev):
  - `cd backend && uv run uvicorn main:app --reload --port 8082`

The API will be available at `http://localhost:8082` with an OpenAPI UI
at `http://localhost:8082/docs`.

### Frontend (Next.js)

- From the `frontend/` directory:
  - `npm install` (first time only, if needed)
  - `npm run dev`

By default the app runs at `http://localhost:4028`.

You can then wire the frontend to call the FastAPI endpoints under
`http://localhost:8082` for sessions, questions, and exports.

## Authentication & Multi-User Data (guest-first, login-optional)

**Status: implemented and browser-tested (2026-08-02). Read this before continuing the work.**

### The model
- **Guests (default, no login)** get full manual CRUD on the Todo app (tasks, quick-tasks,
  projects) with data stored **only in the browser** (IndexedDB) — nothing touches the
  backend. AI-powered features (dive deeper, brain dump, copilot, auto-prioritize, etc.)
  require login.
- **Logging in** unlocks: server-side persistence (SQLite, scoped per-user), all AI
  features across the whole app, and the interview-prep modules (Daily Session, DSA/CV/
  System Design Labs, Question Bank, Question Review, Progress Dashboard), which are
  fully login-gated since they're AI-driven and track per-user history.
- On first login/signup, whatever the guest built up locally is migrated into the new
  account automatically (`POST /todo/import`, id-remapped, one-shot).

### Backend
- New `backend/modules/auth/` package: JWT (PyJWT) + bcrypt (`passlib[bcrypt]`, pinned
  to `bcrypt<4.1` — newer bcrypt breaks passlib's backend detection). Set
  `LABNINJA_JWT_SECRET` in the environment for production/stable sessions; without it,
  a per-process ephemeral secret is used (fine for dev, invalidates tokens on restart).
- Every table that stores user data got a nullable `user_id` column (migrations already
  applied to the live DB) and every `/todo/*`, `/pareto/*`, `/dsa/*`, `/cv/*`,
  `/system-design/*`, `/daily-session*` endpoint now requires
  `Depends(get_current_user_id)` and scopes its queries accordingly. `linkedin_post_generator`
  was **intentionally left out of scope** (still global/unauthenticated) — flagged as a
  follow-up below.
- CORS origin defaults to `http://localhost:4028` (this repo's actual frontend dev port —
  **not** Next.js's generic 3000 default; don't "fix" this back to 3000). Override via
  `LABNINJA_CORS_ORIGINS` (comma-separated) in production.
- **The live database is `backend/modules/lab_ninja.sqlite3`**, not `backend/lab_ninja.sqlite3`
  — `get_db_path()`'s docstring is misleading, trust the code (`Path(__file__).resolve().parent.parent`
  from `modules/common/db.py` resolves to `modules/`). It's tracked in git now (see `.gitignore`)
  so it can be committed as a cross-machine backup.
- For any manual testing, **never** run scripts against the real DB directly. Set
  `LABNINJA_TEST_DB_PATH=/path/to/a/copy.sqlite3` (an override `get_db_path()` already
  supports) and copy `backend/modules/lab_ninja.sqlite3` first. This is how all of the
  migration/auth testing for this feature was verified without any risk to real data.

### Frontend
- `frontend/src/lib/auth/tokenStore.ts` (JWT in localStorage) + `frontend/src/lib/http/apiClient.ts`
  (shared authed fetch wrapper) + `frontend/src/contexts/AuthContext.tsx` (real signup/login/logout,
  replacing the old dummy-user stub).
- `frontend/src/lib/services/local/` — hand-rolled IndexedDB layer + adapters
  (`localTodoAdapter`, `localProjectAdapter`, `localQuickTaskAdapter`) implementing the
  manual-CRUD subset of `todoService`/`projectService`/`quickTaskService`. Each service
  now dispatches to local vs. remote based on `isLoggedIn()`; AI methods always go
  remote (401s for guests, which `apiClient.parseApiError` turns into a friendly
  "Log in to use this feature" message).
- `frontend/src/lib/services/migration.ts` — exports the guest's IndexedDB data and
  calls `/todo/import` on first login/signup.
- `frontend/src/modules/auth/AuthModule.tsx` + `app/login/page.tsx` — login/signup UI.
  `frontend/src/modules/auth/RequireAuth.tsx` — wraps the 7 gated interview-prep pages
  with a "log in to use this feature" screen for guests.
- Removed unused `@supabase/supabase-js` / `@supabase/ssr` (were installed but never
  wired up — dead code from an earlier direction).
- **2026-08-02 follow-up fix:** when auth was added to the CV/DSA/System-Design lab and
  Daily Session routers, several frontend call sites had bare `fetch()` with no auth
  header and started 401ing (`GenerateQuestionsPanel.tsx`, each lab module's
  subtopic/topic/section CRUD, `paretoService.ts`, `questionsService.ts`,
  `sessionService.ts`, `DailySessionModule.tsx`'s direct fetches) — all now routed
  through `apiFetch`. `ParetoSidebar` (visible on the guest-accessible Todo page) now
  skips its top-20 fetch entirely for guests instead of firing a call that always
  401s, showing a login prompt in its place. One endpoint, `GET /settings/ollama-models`,
  was moved off the authenticated `daily_session` router onto a new unauthenticated
  `public_router` in the same file — it's a pure local-Ollama-server proxy with no user
  data involved, used from the guest-accessible Config page, so it shouldn't have
  required login in the first place. **If you add a new frontend call to any endpoint
  under `/todo`, `/pareto`, `/dsa`, `/cv`, `/system-design`, or the `daily_session`
  router, use `apiFetch` from `frontend/src/lib/http/apiClient.ts` — plain `fetch()` to
  these will 401.**

### Known follow-ups (not done — pick up here)
- `linkedin_post_generator` module is **not** scoped to `user_id` and its page is **not**
  gated behind login — it still works exactly as it did before (global/shared), which is
  inconsistent with "everything else requires login." Decide whether to bring it in line.
- `ai-lms` page is a static "coming soon" placeholder with no backend calls — deliberately
  left ungated since there's nothing to protect yet.
- No formal automated test suite was added for the auth flow — verification so far is a
  one-off Playwright smoke script (guest CRUD → signup → migration → gated-module check,
  12/12 passing) plus manual backend `TestClient` checks. Consider turning either into a
  committed test suite.
- Mobile Sidebar auth affordance is functional but not polished; Header's `AuthStatus`
  on narrow screens is cramped.
- Guest stats (streak/completion count) are computed from local task timestamps as a
  best-effort approximation, not a dedicated increment-on-completion counter like the
  server side has — fine for the common case, but edits-after-completion can skew it.

## YouTube Exercise Generator (CV / DSA / System Design Labs)

Each of the three practice labs (CV, DSA, System Design) shares one "Generate Practice
Material" panel per topic, which has two modes:

- **Generate Questions** — the original mode; 5 AI-generated interview questions from
  the topic (+ optional context), saved to the shared Question Bank.
- **From YouTube Video** — paste a video URL and it fetches the transcript, combines it
  with any optional context notes, and asks the configured AI provider to produce a new
  **subtopic** (name + brief), a markdown mini-lab (theory recap + a few hands-on
  exercises), and 5 quiz questions. After reviewing the preview, "Add to Topic" persists
  the subtopic onto the current topic (so it appears in the sidebar and can be
  practiced like any other subtopic — same on-demand sections, same generator) and
  saves the questions to the Question Bank tagged under the new subtopic's name.

The video's transcript is always fetched via the unofficial `youtube-transcript-api`
library (no key required). An optional YouTube Data API key (set in Config) only adds
the video's title/description as extra prompt context — it cannot be used to fetch
transcripts for videos you don't own, since that's an API restriction, not a choice
made here. If auto-fetch fails (no captions available), the panel falls back to a
manual transcript-paste box.

### Backend layout

| File | Responsibility |
|---|---|
| `backend/modules/common/youtube_client.py` | Video ID extraction, transcript fetch, optional Data API metadata fetch. |
| `backend/modules/daily_session/daily_session.py` | `POST /lab/generate-questions` (existing) and `POST /lab/generate-from-youtube` (new) — builds the prompt and calls the configured AI provider. |
| `backend/modules/{cv_lab,dsa_lab,system_design_lab}/router.py` | Each lab's `*SubtopicIn` model accepts optional `content`/`sourceUrl` so a generated subtopic's lab content and video link persist alongside its name/brief in the existing `subtopics_json` blob (no schema migration needed). |

### Frontend layout

| File | Responsibility |
|---|---|
| `frontend/src/modules/common/GenerateQuestionsPanel.tsx` | Shared panel (used by all 3 labs) — tab UI, YouTube URL/context/manual-transcript inputs, preview, and the "Add to Topic & Save Questions" confirm action. |
| `frontend/src/modules/common/lab/MarkdownLite.tsx` | Minimal line-based markdown renderer used both for the generation preview and for displaying a saved subtopic's video-based lab content afterward. |
| `frontend/src/modules/{cv-lab/CVLabModule,dsa-lab/DSALabModule,system-design-lab/SystemDesignLabModule}.tsx` | Each wires `onAddSubtopic` to persist the generated subtopic to its own topics endpoint and renders `content`/`sourceUrl` on the subtopic's detail view. |
| `frontend/src/modules/config/ConfigModule.tsx` | Optional "YouTube Data API Key" field, with instructions for obtaining one. |

## To-Do Module (AI To-Do)

A full task-management feature lives alongside the interview-coach modules, reachable
at `/todo` in the frontend. It has three tabs — **Quick Daily** (flat day-list),
**Smart Todo** (infinitely-nestable task tree), and **Plan & Project** (multi-project
node trees with AI roadmaps) — plus a Copilot sidebar, a cross-tab "80/20" Pareto
analysis, and a floating Distraction Inbox for capturing off-task thoughts.

### Backend layout (`backend/modules/todo/`)

| File | Responsibility |
|---|---|
| `router.py` | Smart Todo: task CRUD, AI breakdown (dive/chunk/regenerate/DoD), notes, daily plan kickstart/save/end, brain-dump, inbox, stats, Eisenhower/weekly-plan, NLP task parsing, cross-module moves. Mounted at `/todo`. |
| `quick_router.py` | Quick Daily: quick-task CRUD, brain-dump image/handwriting upload, bulk create, AI day plan, Eisenhower auto-sort, end-of-day. Mounted at `/todo/quick-tasks`. |
| `projects_router.py` | Plan & Project: project CRUD, project-node tree CRUD, AI dive/chunk on nodes, AI roadmap generation, cross-module moves. Mounted at `/todo`. |
| `pareto_router.py` | 80/20 scoring shared across all three tabs (`analyze`, `top20`, `reanalyze`). Mounted at `/pareto` (note: **not** under `/todo`). |
| `db.py`, `quick_db.py`, `projects_db.py` | Raw SQLite access for `tasks`, `quick_tasks`/`quick_tasks_archive`, `projects`/`project_nodes` respectively. |
| `schema.py` | Shared Pydantic request models (`TaskCreate`/`TaskUpdate`/AI request shapes). |

Frontend service clients live in `frontend/src/lib/services/{todoService,quickTaskService,projectService,paretoService}.ts`,
and components in `frontend/src/modules/todo/`.

### Known gaps / tech debt

An end-to-end audit (2026-08-02) fixed a set of concrete bugs (creating a task used
to silently drop its recurrence/intention/DoD fields, `generate-dod` crashed on its
main success path, an AI-parsed Eisenhower sweep could 500 on a slightly malformed
LLM response, Copilot could silently drop active subtasks whose parent was marked
done, the attachment "✕" chip in Add Task submitted the form instead of removing the
file, etc. — see git history for the full list). The following are lower-priority
items that were identified but intentionally left as-is or only partially addressed;
worth picking up in a follow-up pass:

- **Blocking SQLite in async handlers.** Every route handler is `async def`, but all
  DB access is a fresh synchronous `sqlite3.connect()` call with no pooling and no
  `PRAGMA busy_timeout`. Fine at current load; under concurrent AI-streaming +
  write traffic this can serialize requests or throw `database is locked`.
- **Orphaned AI features with no UI entry point** (endpoints work, nothing calls
  them): `POST /todo/ai/smart-schedule` (energy-aware day schedule) and
  `POST /todo/tasks/{id}/suggest-intention` (AI intention/DoD suggestion for an
  *existing* task — only the pre-creation variant in Add Task is wired up).
- **`quick_tasks_archive` drops some fields on end-of-day** (`context`, `due_date`,
  `time_estimate`, export/pareto-reason fields aren't copied over), so archived
  quick tasks have less detail than they did live.
- **Three near-duplicate "detail modal" components** (`TaskDetailModal`,
  `QuickTaskDetailModal`, `ProjectNodeDetailModal`) hand-roll the same
  title/context/due-date/time-estimate/file-upload UI per entity type instead of
  one generic component — works correctly today, just a maintenance cost.
- **`WeeklyPlan` is preview-only** — the AI-generated Mon–Fri plan isn't persisted
  anywhere, so refreshing the Smart Todo tab loses it. May be intentional, but
  there's no UI indication that it's ephemeral.
- **Plan & Project "progress" is a proxy metric**, not real task completion —
  `project_nodes` has no done/status field, so the project card's progress ring
  shows the share of nodes already exported into actionable tasks (Smart
  Todo/Quick Daily), not how much work is actually finished.
- **Inconsistent CRUD error handling** — AI-action service calls throw and get
  surfaced to the user, but plain CRUD calls (`updateTask`, `deleteTask`, etc.)
  swallow failures with just a `console.error`, so a failed edit due to a network
  blip currently fails silently in the UI.

## Career Studio Module (`/career`)

A self-contained "AI Career Studio" reachable at `/career` (menu + submenu in the sidebar).
**Resume Builder**: a two-panel resume builder with debounced autosave, git-like immutable
**versioning** (snapshot / restore / clone / branch), an **AI analyzer** (ATS + dimension scores +
fixes), inline **AI section rewrite** (streamed), an **AI copilot** (reuses the labs' copilot
shell), and PDF/DOCX/text **import** (AI-structured with a diff preview).
**Portfolio Builder** (`/career/portfolio`): a widget-based one-page portfolio (hero, projects,
skills, stats, contact, …) with drag-drop reorder, theme (accent/font), live preview, the same
immutable versioning, an **AI portfolio analyzer** (design/UX/branding/recruiter-friendliness), and
the AI copilot.

It owns a **separate SQLite database** (`backend/modules/career_studio/career_studio.sqlite3`, raw
`sqlite3` — no ORM) so the module is lift-and-shift portable; see
`backend/modules/career_studio/ARCHITECTURE_NOTES.md` for the extraction guide and the full
"spec-vs-repo" translation table. It's **login-required** (mirrors the `todo` module's auth +
per-user scoping via `Depends(get_current_user_id)`); there's no guest/local-IndexedDB mode yet.

### Spec vs. reality (what we changed from the original spec)

The module was specced against a generic stack; we translated its intent to this repo's real
conventions. Full backend-focused version in `career_studio/ARCHITECTURE_NOTES.md`.

| # | Original spec assumed | Reality of this app | What we built |
|---|---|---|---|
| 1 | React Router, `routes.tsx`, `RouteObject[]` | Next.js 15 App Router (file-based) | Pages under `src/app/career/**/page.tsx` |
| 2 | SQLAlchemy ORM + repositories | Raw `sqlite3`, `schema.register(cursor)` + hand CRUD | Raw sqlite3 in `db.py`/`versions.py`/`analysis_db.py` |
| 3 | Separate `career_studio.db` (new engine) | Single shared `lab_ninja.sqlite3` | Kept it separate — `career_studio.sqlite3`, own `init_career_db()` |
| 4 | `/api/v1/career/` global prefix | No global prefix; each module owns its path | Router `prefix="/career"` |
| 5 | Zustand/Redux + React Query everywhere | Plain `useState`/`useEffect`, no store | Added Zustand (new dep) for builder state only |
| 6 | shadcn / MUI kit | Custom Tailwind tokens + Heroicons | Reused `bg-card`/`text-foreground`/`AppIcon` |
| 7 | `registerConfigSection()` registry | Monolithic Config page, no registry | Reuse `settingsService` values directly |
| 8 | New `<CopilotSidebar>` + `useCopilot()` | `LabCopilot` shell; `TodoCopilot` is the wired one | `CareerCopilot` reuses the shell → `/career/copilot/ask` |
| 9 | `{ data, meta }` envelope | Raw JSON objects | Raw JSON (`{"resume":…}`, bare arrays) |
| 10 | Provider registry reading keys from DB | Keys ride per-request via `AISettings`, never stored | Request models subclass `AISettings` |
| 11 | `get_current_user` + admin roles | JWT `get_current_user_id`; no roles | Mirrored `todo` (user_id scoping); admin deferred |
| 12 | Autosave every 1.5s → new immutable version | Mutable rows are the idiom | Mutable draft autosave; immutable checkpoints on demand |
| 13 | Own axios client with `/career` prefix | Shared `apiFetch`/`apiJson` (auto-attaches JWT) | Reused `apiFetch` — no new HTTP client |
| 14 | `bleach` / `DOMPurify` for HTML | Not installed | Not needed for resume slice; flagged for portfolio phase |
| 15 | PDF export (WeasyPrint/headless Chrome) | Neither installed | Deferred/flagged as roadmap blocker |
| 16 | Build all 10 phases at once | — | Scoped to the resume vertical slice; rest is a roadmap |

### Backend layout (`backend/modules/career_studio/`)

| File | Responsibility |
|---|---|
| `router.py` | `/career` resume CRUD, sections, versioning (snapshot/clone/branch/restore), import. |
| `portfolio_router.py` | `/career/portfolios` CRUD, widgets, versioning; portfolio analyzer lives in `analysis_router.py`. |
| `analysis_router.py` | `/career` AI resume + portfolio analyzers, streamed section rewrite, and copilot ask. |
| `db.py` / `versions.py` / `portfolio_db.py` / `portfolio_versions.py` / `analysis_db.py` | Raw-sqlite CRUD against the separate DB (resume + portfolio); immutable version snapshots; analysis + `ai_runs` audit log. |
| `schema.py` | `register(cursor)` DDL (called by `db.init_career_db()`, **not** `common/db.py`). |
| `prompt_builder.py` / `llm.py` / `ai_runs.py` | Pure prompts; thin wrapper over `common.ai_client`; per-call audit timer. |

Frontend service is `frontend/src/lib/services/careerService.ts` (reuses `apiFetch` + the AI-settings
helpers), Zustand store `frontend/src/modules/career/store/resumeStore.ts`, components under
`frontend/src/modules/career/`, pages under `frontend/src/app/career/`. See that module's `README.md`.

### Integration points (only existing files touched, all tagged `CAREER STUDIO INTEGRATION`)
Two lines in `backend/main.py` (include the routers + `init_career_db()` in the lifespan) and one
collapsible menu/submenu in `frontend/src/modules/common/Sidebar.tsx`. Everything else is new files.

### Roadmap (not built yet)
Job-Description Matcher, Cover Letters, GitHub/LinkedIn sync, publishing/hosting (`/u/{username}`),
comments, analytics, template marketplace, admin (needs a role system), PDF export (needs
WeasyPrint/headless Chrome), and HTML sanitization (needs `bleach`/DOMPurify, before rendering any
user-authored HTML). Built so far: **Resume Builder** and **Portfolio Builder**.

