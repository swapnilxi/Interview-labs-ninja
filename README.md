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
  `backend/data/lab_ninja.sqlite3`.
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

### Admin portal & roles (added 2026-08-05)
- `users` now has a `role` column (`'user'` default / `'admin'`), added via the standard
  `PRAGMA table_info` + `ALTER TABLE` migration in `modules/auth/schema.py`.
- **Bootstrapping admins:** set `LABNINJA_ADMIN_EMAILS` (comma-separated) in the backend
  environment. On every startup, `promote_admins_from_env()` (called from `main.py`'s
  lifespan) promotes those emails to `admin` — idempotent, and only affects accounts that
  already exist. After the first admin exists, admins can promote/demote others from the
  portal UI, so the env var is really just the initial seed.
- **Backend:** `modules/auth/admin_router.py` (prefix `/admin`, every route behind the new
  `get_current_admin` dependency → 403 for non-admins, 401 for guests) exposes
  `GET /admin/stats`, `GET /admin/users?search=`, `PATCH /admin/users/{id}/role`,
  `POST /admin/users/{id}/reset-password`, `DELETE /admin/users/{id}`. User-scoped tables
  are discovered dynamically (any table with a `user_id` column), so resource counts and
  the delete-cascade pick up new modules automatically — there are no FK cascades on those
  tables, so `delete_user()` clears them manually. Two guardrails: you can't delete your own
  account via the API, and you can't demote/delete the last remaining admin.
- **Frontend:** `/admin` page → `modules/admin/AdminModule.tsx` (overview dashboard: stat
  cards, resource-usage breakdown, searchable users table with promote/demote, reset
  password, delete + confirmation modals) gated by `modules/admin/RequireAdmin.tsx`.
  `AuthContext` now exposes `isAdmin`; the Header/Sidebar show an **Admin** link only to
  admins. Service layer: `lib/services/adminService.ts` (all via `apiFetch`).
- Career Studio data lives in a **separate** `career_studio.sqlite3`, so it is intentionally
  **not** counted or cascaded by the admin portal (which only touches `lab_ninja.sqlite3`) —
  a known follow-up if cross-DB admin is ever needed.

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
- **Centralized Data Directory (`backend/data/`)**:
  All backend databases, file uploads, and persistence files are strictly centralized inside **`backend/data/`**:
  - `backend/data/lab_ninja.sqlite3`: Main app, Todo, DSA/CV/System Design labs & Swipe PDF database.
  - `backend/data/career_studio.sqlite3`: Career Studio module database.
  - `backend/data/uploads/`: Task & Goal file attachments.
  - `backend/data/pdf_uploads/`: Cloud PDF reader uploaded documents.
  - All database path resolvers (`get_db_path()` and `get_career_db_path()`) automatically resolve to `backend/data/`.
  
  **Git Tracking & Main DB Strategy**:
  - In `.gitignore`, the general rule `*.sqlite3` ignores temporary/local database files, but the primary application databases are explicitly tracked using the negation prefix `!` (`!backend/data/lab_ninja.sqlite3`, `!backend/data/career_studio.sqlite3`).
  - This ensures the production SQLite databases are committed to GitHub and bundled with deployments on Vercel.
  - On the frontend (`frontend/`), client-side data is managed strictly locally (IndexedDB / localStorage), while server-side data operations route to the centralized backend SQLite databases.
  - **Vercel Runtime Seeding**: Since Vercel serverless function filesystems are read-only (except `/tmp`), the FastAPI backend (`api/index.py`) seeds the bundled SQLite database to `/tmp/` on cold start so both reads and writes run smoothly during runtime.
- For any manual testing, **never** run scripts against the real DB directly. Set
  `LABNINJA_TEST_DB_PATH=/path/to/a/copy.sqlite3` (an override `get_db_path()` already
  supports) and copy `backend/data/lab_ninja.sqlite3` first. This is how all of the
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

## AI LMS Module (`/ai-lms`)

AI-generated learning content. Backend: `backend/modules/ai_lms/` (FastAPI, mirrored for
`nextjs-api` mode in `frontend/fe-apis/lms/`). Frontend: `frontend/src/modules/ai-lms/`.

### Content hierarchy

```
Class
 ├─ Subject   (lms_subjects.kind = 'subject')
 │    └─ Lesson                      # flat, ordered list of generated lessons
 └─ Project   (lms_subjects.kind = 'project')
      └─ Module / Step                # top-level entries of the project outline
           └─ Sub-step / Sub-module   # optional; created by "Break Down" or added by the user
                                      # (each one generates exactly one Lesson)
```

- A **Project** is an `lms_subjects` row with `kind='project'`. Its outline is JSON in
  `lms_subjects.project_plan`: `[{title, focus, context, lesson_id, sublessons: [...]}]`.
  The outline is only two levels deep (module -> sublesson). Every module/sub-step that has
  been generated points at an ordinary `lms_lessons` row via `lesson_id`, so the lesson
  viewer, navigation and downloads work the same as for Subjects.
- A module that has sub-steps is generated sub-step by sub-step, not as one lesson.
- `context` on a step is user-supplied notes/findings/documents (typed or uploaded); it is
  folded into that step's generation prompt (first 12k chars).
- The project **README / context** (`project_context`) is the source the AI plans the outline
  from. It can be AI-summarised (`context_summary`) and RAG-indexed (`backend/modules/common/rag/`).

### Project page UX

- Default view ("modules"): outline list + a **Quick add & generate** box. Paste/upload a
  finding; "Recommend placement" asks the AI where it fits (judged on module titles + focus),
  and clicking a position inserts the step there and generates its lesson.
- "+" gaps between rows add a module or sub-step by hand; rows drag-and-drop to reorder
  (modules among modules, sub-steps within their module).
- **Edit Project** switches the page to an in-page edit view (name, description, README /
  context + summary + search index) -- not a popup. The README editor only appears there.

### Project endpoints (`/api/lms/projects/{id}/...`)

`plan`, `modules/{i}/generate`, `modules/{i}/breakdown`, `modules/{i}/sublessons/{j}/generate`,
`steps` (insert), `reorder` (move), `suggest-placement` (AI recommendation). Any change to
these must be made in both `router.py` and `fe-apis/lms/index.ts`.

### Class folders (editable HTML)

Every class is mirrored to a folder you can edit in the IDE:

```
frontend/src/modules/ai-lms/classes/<class>/
  landingpage.html                         landing page (yours; see lms:auto below)
  class.json                               generated manifest: titles, order, ids, file hashes
  <subject>/lessons/<lesson>.html
  <project>/modules/<module>.html          a module's own lesson
  <project>/modules/<module>/<step>.html   sub-step lessons
  <project>/lessons/<lesson>.html          project lessons the outline doesn't list
  lessons/<lesson>.html                    lessons with no subject
```

- **The DB stays the store of record.** HTML lives in `lms_lessons.generated_html` and
  `lms_classes.landing_html`. The files are a second copy, kept in sync both ways by
  `backend/modules/ai_lms/class_folders.py` and its nextjs-api twin
  `frontend/fe-apis/lms/classFolders.ts`.
  - The two must write byte-identical files, so change both.
- **Edit a lesson or landing file in the IDE.** The edit is imported into the DB the next
  time the app reads it:
  - opening the lesson or landing page;
  - opening the class;
  - any LMS write;
  - a server start.

  In dev, the open page refreshes about 2 s after you save.
  - The DB version it replaced goes to `lms_html_backups`, which keeps the last 5 per lesson.
  - App writes (generate, revise, embed visual, in-app edit) rewrite the file.
- **Who wins:** each row stores the hash both sides last agreed on (`file_hash`, `landing_hash`).
  - Only the file changed: it is imported.
  - Only the DB changed: the file is rewritten.
  - Both changed: the file wins, and the DB version is backed up.

  The in-app editors send `base_hash`. If the file changed meanwhile they get a 409, with an
  "Overwrite" option.
- **landingpage.html** starts from `backend/modules/ai_lms/templates/landingpage.html`, and you
  can edit anything in it.
  - Only the regions between `<!-- lms:auto:NAME -->` and `<!-- /lms:auto:NAME -->` are
    re-rendered: name, description, stats, subjects, projects, lessons.
  - They re-render only when the class data they show changes. Delete a marker pair to freeze
    that region.
  - Links are relative file paths, so the page works when the folder is hosted on its own. In
    the app they open the matching routes.
- **Not synced:**
  - New `.html` files you create don't become lessons.
  - A lesson file deleted in the IDE is re-created from the DB; delete lessons in the app.
  - Files that aren't valid UTF-8 are skipped until fixed.
- **Export site** (class page and landing page) downloads `<class>.zip`. The zip contains the
  folder as a static site with an `index.html`, plus deploy files from
  `backend/modules/ai_lms/templates/deploy/`:
  - Vercel: `npx vercel deploy --prod`.
  - Google Cloud Run: `gcloud run deploy <name> --source .`, which builds an nginx
    `Dockerfile` serving on `$PORT`.

  The zip's README has the details.
- **CLI:** `uv run python -m modules.ai_lms.class_folders` (from `backend/`) forces a full sync.
  - `--prefer-db` lets the DB win every disagreement. Use it after copying newer `lms_*` tables
    onto an older checkout of the folders.
- **When it's off:**
  - No folder is touched when the DB is redirected (`LABNINJA_TEST_DB_PATH` or
    `LABNINJA_DB_DIR`) unless `LMS_CLASSES_DIR` names one.
  - Nothing is written on Vercel, whose filesystem is read-only.
  - On the Vercel deployment, `/api` is served by the Python function, which runs DB-only. After
    editing files, open the app (or run the CLI) before committing the DB.

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

## Labs Project (`/labs-project`)

A **project** is a named body of background (`context`: objectives, requirements, constraints, decisions) that the
three practice labs (CV, DSA, System Design) generate *for*. Pick a project in a lab and its sections and quiz are written
for that project; save the responses you like back into the project and they become **saved sections** that later
generations (in any lab) can build on. Everything is per user and login-required, like the lab sections themselves.

- **Data** (`lab_projects`, `lab_project_sections`; `backend/modules/lab_projects/schema.py`): a project has
  `name/description/context/status('active'|'archived')`; a section has `title/content/source_lab_id/source_lab_name/source_generation_id`
  (`'lab|topic|subtopic|section@generated-at'` of the lab page it was saved from). A saved section is a **copy**:
  regenerating or editing the lab page, or editing the project context, never changes it.
- **Delete policy**: deleting a project deletes its context and every section saved to it (the UI says how many and
  suggests Archive, which keeps everything but hides the project from the labs and refuses new sections, 409). Lab pages that
  were generated for the project keep their text.
- **API** (`/lab-projects`, `backend/modules/lab_projects/router.py`, twin `frontend/fe-apis/labProjects/`, route
  `src/app/api/lab-projects/[[...path]]`, rewrite in `next.config.mjs`): `GET/POST /`, `GET/PATCH/DELETE /{id}`,
  `GET/POST /{id}/sections` (`?q=` searches title + content, `?lab=` filters), `GET/PATCH/DELETE /{id}/sections/{sid}`. Someone
  else's project or section is a **404**, never a 403. Every query is scoped by `user_id`, and every section query also by its project.
- **Generation**: `POST /lab-sections/generate` and `/lab-sections/quiz/generate` take an optional `project_id`. The server loads the
  project (never trusts text from the request): 404 if it isn't the user's, 409 if archived. `lab_projects/knowledge.py` builds the
  prompt parts: the project block, the saved knowledge, and rules that make the answer *apply the lab's content to the project*
  (examples from the project's domain, a closing "Applying this to <project>" list, no invented requirements, explicit assumptions,
  and how to resolve conflicts: project context first, then the newer section, contradictions are mentioned, not hidden).
  With no `project_id` every prompt is byte-for-byte what it was before.
- **Retrieval** (`knowledge.py`): the core context is always sent; saved sections are *retrieved*: BM25 over the project's sections
  (title weighted x3, plural folding), matched against the page, section and the learner's words; a relevance cut-off, at most 4
  sections / 6,000 characters, long sections excerpted around the matching passages, exact duplicates collapsed, and the section
  copied from the very page being regenerated left out. Ties go to the newer section. No embeddings are used, so nothing extra is
  sent to a provider and results are deterministic.
- **Isolation**: `lab_section_content.project_id` and `lab_quiz_questions.project_id` record which project text was written for. An
  *update* of a stored body written for another project (or for none, when the request has a project) is turned into a fresh write, and a
  quiz only shows the model earlier questions from no project or the same project. Deleting a project leaves its id on those rows
  on purpose (ids are never reused), so that text is never picked up by anything else.
- **Prompts are twinned.** `lab_projects/knowledge.py` ↔ `fe-apis/labProjects/knowledge.ts` (with `text.ts` for Python's `len`/`strip`
  semantics) and `lab_sections/{router,quiz}.py` ↔ `fe-apis/labSections/{handlers,quiz}.ts` must stay byte-identical: change both and diff the
  prompts both backends send to a mock provider.
- **Frontend**: `src/modules/labs-project/` (page `/labs-project`: Projects list, Project Context, Project Sections, section detail;
  screens live in the URL: `?project=&tab=context|sections&section=&status=&new=1`), `src/modules/common/lab/project/` (shared store +
  `useLabProjects`, `ProjectSelector` in each lab's header, `SectionProjectBar` under each generated section with **Save to Project**,
  `SaveToProjectDialog`), `src/lib/services/labProjectsService.ts`. The selection is shared by all labs and kept in localStorage per user.
  `useLabSections`/`useLabQuiz` read it at click time (`resolveSelectedProject`); with a project selected even the labs' template
  sections go through the AI.
- **Tests**: `cd backend && uv run python tests/lab_projects_test.py` (copy of the DB, fake model call): CRUD, isolation between users and projects,
  persistence, deletion, retrieval, project context in the prompts, the no-project prompt, update/regenerate behaviour, quiz scoping.
- **Not covered yet**: the "Generate Questions" / YouTube panel (feeds the global Question Bank, no `fe-apis` twin), the other
  modules (LinkedIn, Career, LMS), the static quizzes in the CV and System Design labs (there is nothing AI-written to adapt), and guests (the labs
  need a login anyway).

## To-Do Module (AI To-Do)

A full task-management feature lives alongside the interview-coach modules, reachable
at `/ai-todo` in the frontend (the old `/todo` page URL redirects there; `/todo/*` is the API). It has three tabs — **Quick Daily** (a day-list: new tasks start *Unsorted*, then you sort them into Eisenhower quadrants by dragging, the quadrant chip, or the optional *Prioritise* matrix view),
**Smart Todo** (infinitely-nestable task tree), and **Plan & Project** (multi-project
node trees with AI roadmaps) — plus a Copilot sidebar, a cross-tab "80/20" Pareto
analysis, and a floating Distraction Inbox for capturing off-task thoughts.

### Backend layout (`backend/modules/ai-todo/`)

| File | Responsibility |
|---|---|
| `router.py` | Smart Todo: task CRUD, AI breakdown (dive/chunk/regenerate/DoD), notes, daily plan kickstart/save/end, brain-dump, inbox, stats, Eisenhower/weekly-plan, NLP task parsing, cross-module moves. Mounted at `/todo`. |
| `quick_router.py` | Quick Daily: quick-task CRUD, brain-dump image/handwriting upload, bulk create, AI day plan, Eisenhower auto-sort, end-of-day. Mounted at `/todo/quick-tasks`. |
| `projects_router.py` | Plan & Project: project CRUD, project-node tree CRUD, AI dive/chunk on nodes, AI roadmap generation, cross-module moves. Mounted at `/todo`. |
| `projects/plan_router.py`, `projects/plan_db.py` | The project's **AI Planner** (see below): saved workspace (`project_plans`), clarifying questions, timeline check, plan generation, chat refinement, add-to-project. Mounted at `/todo`. Twin: `fe-apis/todo/projects/planHandlers.ts` + `planDb.ts`. |
| `pareto_router.py` | 80/20 scoring shared across all three tabs (`analyze`, `top20`, `reanalyze`). Mounted at `/pareto` (note: **not** under `/todo`). `analyze` sizes the AI's output budget to the item count (the shared 2,048-token default cuts a ~35+ item reply off mid-array), keeps the whole objects of a cut-off reply (`extract_json_items`), re-asks for the unscored rest (≤3 calls), and answers `partial: true` + `message` when some items still have no score. Ported to `fe-apis/todo/pareto/handlers.ts` — keep the two in step. |
| `db.py`, `quick_db.py`, `projects_db.py` | Raw SQLite access for `tasks`, `quick_tasks`/`quick_tasks_archive`, `projects`/`project_nodes` respectively. |
| `schema.py` | Shared Pydantic request models (`TaskCreate`/`TaskUpdate`/AI request shapes). |

### Project screens and the AI Planner

Every project has its own address (`/ai-todo?tab=plan&project=<id>`; the Back link returns to the list), and
`&section=planner` opens its **AI Planner** (`&step=brief|questions|timeline|plan` is the step). All addresses are
built in `modules/ai-todo/projects/projectUrls.ts`; the Roadmap view takes the same `project=` param.

The planner is a guided conversation, saved per project in the `project_plans` table (one JSON blob; the client
owns its shape and runs everything the AI returns through the normalizers in `projectPlannerService.ts`):

1. **Brief** — requirements typed in, plus plain-text documents (`.txt .md .csv .json`; PDF/Word text has to be pasted). The AI reads the first 60,000 characters (notes first, then documents in order).
2. **Questions** — the AI asks what it still needs; answers (or one-click suggestions) feed every later prompt; "ask follow-up questions" runs another round.
3. **Timeline** — start and end date, or start and a duration in weeks/months. The server works out the day count so the model never does date maths. "Is this timeline realistic?" returns a verdict (realistic / tight / unrealistic / generous), concerns, recommendations and, when it isn't realistic, a suggested duration you can apply in one click.
4. **Plan** — phases with dates (forced inside the chosen timeline), objectives, tasks, deliverables, milestones, risks, plus assumptions and success metrics, a timeline chart, and a **Plan with AI** chat that answers questions or edits the plan. The plan can be copied as Markdown or added to the project's Explorer tree (`/plan/apply`: phases as `phase` nodes with due date + context, tasks as `action` children).

AI results are saved the moment they arrive; typing is saved ~1 s after you stop. The planner is login-only, like every AI feature: guests keep their projects and Explorer but see a sign-in prompt in the planner. It is mirrored in `fe-apis/todo/projects/plan*.ts` (prompts, limits and error texts are copied verbatim, so change both).

Frontend service clients live in `frontend/src/lib/services/{todoService,quickTaskService,projectService,projectPlannerService,paretoService}.ts`,
and components in `frontend/src/modules/ai-todo/`.

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
- **CRUD error handling** — AI-action service calls throw and get surfaced to the
  user. Plain CRUD calls (`updateTask`, `deleteTask`, etc.) still return `null`/`false`
  instead of throwing, but as of 2026-10-14 a failed *logged-in* request now shows a
  toast with the real reason (`reportFailure()` in `lib/services/mutationFeedback.ts`;
  the To-Do page mounts `ToastHost`), and optimistic edits roll back. Still open:
  failures from the guest IndexedDB adapters are only logged to the console.
  Dialogs/menus in this area use `components/ui/Modal` and `components/ui/Popover`
  (portals) — never render an overlay inside a hover-lifted `.todo-lit` card.

## Career Studio Module (`/career`)

A self-contained "AI Career Studio" reachable at `/career` (menu + submenu in the sidebar). The
landing page is a **tabbed shell** (`CareerStudioTabs.tsx`) — **Profiles · Generate · Resumes ·
Portfolios · Template Designer**.

**Master Profiles → live views.** A user keeps one or more **Master Profiles** (`is_profile=1` rows
in `resume_master`) — the single place they fill their real data (personal info, experience,
projects, skills, plus metadata like role/seniority/target industry/companies/tags). A resume or
portfolio is a **view** (`career_views` table): it stores *no content*, only the profile it reads, a
template/theme, and a section config (order + per-section hidden). Rendering pulls the profile's
current content, so **editing a profile updates every view built from it**. There is no standalone
resume/portfolio flow anymore — the pre-profile `/career/resume`, `/career/portfolio` routes and
`ResumeBuilder.tsx`/`PortfolioBuilder.tsx` were unreachable from any nav link and have been removed
outright; profiles + views are the only model now.

- **Profile Selector** (`ProfileSelector.tsx`) — an IDE-workspace-style dropdown mounted on every
  page that operates on a profile (Generate, the profile editor, the view editor); rename/
  duplicate/archive/delete happen inline, no page nav needed. `activeProfileStore.ts` (localStorage)
  remembers the last-used profile across pages.
- **Profile Editor** — `ProfileEditor.tsx`, hosted as a full-screen modal (`ProfileEditorModal.tsx` +
  `profileEditorStore.ts`) rather than a route, so opening it never unmounts the host page. Reuses
  the resume section editor/preview/store; toolbar has Import, Enrich, Version history, Undo/Redo,
  Copilot. A collapsible **Profile Details** panel (`ProfileMetadataPanel.tsx`) edits the metadata
  fields above and autosaves via `PATCH /career/profiles/{id}/metadata`.
- **Profile import** (`ProfileImportDialog.tsx`) — from an existing resume/profile, pasted JSON (with
  per-section shape validation + human-readable mapping notes shown before saving), or freeform text
  the AI structures. Can create a new profile or import into an existing one (replace or append).
- **Profile enrichment** (`ProfileEnrichDialog.tsx`) — merges one *additional* document into an
  existing profile (distinct from import's replace/append): classifies each piece of new content as
  an addition, a duplicate (skipped), or a conflict (needs a decision) before writing anything, and
  snapshots the profile first so a bad merge is always recoverable.
- **Guided "+ Create New Profile" wizard** (`CreateProfileWizard.tsx`) — 5 methods (Manual / from a
  Resume / Describe-yourself / JSON / **From a job posting**, `POST /career/profiles/from-job`); the
  job-posting method builds a skills-seeded skeleton with empty experience/education fields — it
  never fabricates a candidate's background. The resume/JSON/text methods hand off to
  `ProfileImportDialog` rather than reimplementing import.
- **Generate tab** — pick a profile and a job (link, pasted description, freeform context, or JSON),
  optionally set a **target role/company** (pre-filled from the profile's metadata) to steer wording
  independently of the posting's own title/company, and get back a **new** tailored profile + resume
  — the source profile is untouched. Comes with a gap-analysis panel (fit score, matched/missing
  skills, ATS keywords, experience gap, recommendations) and, when the job implies something the
  profile genuinely lacks (e.g. Certifications), a **new proposed section** — under a strict
  no-fabrication rule (real content or an empty placeholder, never invented credentials).
  `POST /career/jobs/extract` separately pulls a structured breakdown (company, role, location,
  employment type, skills, responsibilities, benefits, salary, certs) out of a posting for preview +
  confirm before it's saved as a reusable job description.

Each view editor (`/career/view/{id}`) has the profile dropdown (switch data source) with an edit
pencil (opens the Profile Editor modal in place), a **template picker**, per-section show/hide +
reorder, a **live iframe preview** (the backend-rendered HTML, byte-identical to the export), and
export actions (HTML, PDF, DOCX, Markdown, public share link).

## Swipe PDF Reader Module (`/swipe-pdf-reader`)

A local-first document reader that converts PDFs and study notes into swipeable micro-learning cards.

- **Dual Storage & Processing Workflows**:
  - **📱 Open PDF Locally (100% Offline & Private)**: Extracted off-main-thread via PDF.js Web Worker (`pdfExtractWorker.ts`), saved to IndexedDB (`labninja-swipe-pdf`), zero network requests sent.
  - **☁️ Upload PDF to Cloud (Synced Across Devices)**: Multipart upload to FastAPI (`POST /api/pdf/upload`), parsed server-side with `pypdf`, saved to `backend/data/pdf_uploads/` and SQLite database (`pdf_documents` and `pdf_chunks` in `backend/data/lab_ninja.sqlite3`).
- **Formatting Preservation**: Preserves paragraph breaks, line breaks, bullet lists, page transitions, and section headers.
- **Card Deck Capabilities**: Swipe navigation, bookmarking, reading progress resume, search, jump-to-chunk, and storage quota manager.

## Vercel Deployment & Backend Modes

The application can be deployed freely on Vercel as a self-contained Next.js application or run connected to the FastAPI backend:

- **Nextjs-api mode (`NEXT_PUBLIC_BACKEND_MODE=Nextjs-api`)**:
  - Automatically routes API calls to Next.js serverless route handlers under `src/app/api/...` and relative URLs (`/api/...`).
  - Allows hosting the frontend freely on Vercel with zero external server dependencies.
- **FastAPI mode (`NEXT_PUBLIC_API_URL=http://localhost:8082`)**:
  - Connects to the FastAPI Python server running on port 8082.
- **Vercel Monorepo Settings**:
  - Includes root `package.json` with Node 20 engine declaration and root `vercel.json` / `frontend/vercel.json` routing.

Resume views additionally get an **AI Analyze** panel (ATS + dimension scores + fixes,
optional job-description input) and a **Tailor to a Job** drawer (`ViewTailorPanel.tsx`): previews a
per-section before/after diff against a saved job description, applied either **in place** (with an
automatic safety checkpoint) or as a **new tailored profile + view** (original untouched).

**Template Designer** (`TemplateDesigner.tsx`) — a visual-knob editor (font, accent, header/heading
style, density for resumes; background pattern for portfolios) with a live iframe preview
(`templatePreview.ts` mirrors `render.py` client-side) over user-owned, CRUD-able templates
(`templates_router.py` / `templates_db.py`). Built-in presets (`template_presets.py`) seed each
user's library on first visit — so they're editable/deletable like any custom template — and stay as
a code fallback so rendering never breaks when a template is missing.

**Portfolio Builder**: a widget-based one-page portfolio (hero, projects, skills, stats, contact, …)
rendered by `PortfolioWidgetsView.tsx` (pure props, no store — shared by both the editor's live
preview and the public page) with drag-drop reorder, theme (accent/font), **layout templates**
(stack / centered / cards), and 4 **visual style templates** (Minimal, Isometric 3D-pattern, Aurora
gradient-mesh, Blueprint grid — `portfolioTemplates.ts`, stored in `theme.template`), the same
immutable versioning, an **AI portfolio analyzer** (design/UX/branding/recruiter-friendliness), and
the AI copilot. **Share & Export** — **publish** a frozen public snapshot to an unauthenticated
`/p/{slug}` page (`PublicPortfolioClient.tsx`; copyable link, view counter, unpublish), and export as
**HTML / PDF** (browser or server, via `exportUtils.ts` + `render.py`). The visual templates render
identically across the live preview, the public page, and the export; pattern backgrounds gracefully
degrade to a flat fill in server PDFs (xhtml2pdf has no gradient support).

It owns a **separate SQLite database** (`backend/data/career_studio.sqlite3`, raw
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
| 11 | `get_current_user` + admin roles | JWT `get_current_user_id` | Mirrored `todo` (user_id scoping). App-wide admin roles exist now (see the Admin portal section above), but they're a separate concern — Career Studio data has no role-based access of its own; every resource is still strictly owner-only. |
| 12 | Autosave every 1.5s → new immutable version | Mutable rows are the idiom | Mutable draft autosave; immutable checkpoints on demand |
| 13 | Own axios client with `/career` prefix | Shared `apiFetch`/`apiJson` (auto-attaches JWT) | Reused `apiFetch` — no new HTTP client |
| 14 | `bleach` / `DOMPurify` for HTML | Not installed | Renderer + public page escape all user content (`html.escape` server-side, React text nodes client-side); no raw-HTML injection, so a sanitizer isn't needed yet |
| 15 | PDF export (WeasyPrint/headless Chrome) | Neither installed | Shipped via **xhtml2pdf** (pure-python, no system deps) for server PDFs, plus browser print + HTML download — user picks per-export |
| 16 | Build all 10 phases at once | — | Scoped to the resume vertical slice; rest is a roadmap |

### Backend layout (`backend/modules/career_studio/`)

| File | Responsibility |
|---|---|
| `router.py` | `/career` resume CRUD, sections, versioning (snapshot/clone/branch/restore), template selection, import, and **resume export** (`/export?format=html\|pdf`). |
| `portfolio_router.py` | `/career/portfolios` CRUD, widgets, versioning, **publish/unpublish + export**, and the **unauthenticated `public_router`** (`/career/public/portfolios/{slug}`). Portfolio analyzer lives in `analysis_router.py`. |
| `tailor_router.py` | Saved job descriptions CRUD (`/career/jobs`) + JD-driven resume **tailoring** (`/tailor` preview, `/tailor/apply` in-place or new-copy). |
| `views_router.py` / `views_db.py` | **Master Profiles** (`/career/profiles`: CRUD, duplicate/archive/unarchive, metadata, import/import-preview, enrich/enrich-preview, `from-job`) + live **views** (`/career/views`: CRUD, export, publish, analyze, tailor/tailor-apply) + **Generate** (`/career/generate/resume`) + job extraction (`/career/jobs/extract`). Live section reconciliation against the profile; `resolved_to_widgets()` maps profile sections → portfolio widgets. |
| `templates_router.py` / `templates_db.py` / `template_presets.py` | `/career/templates` CRUD (+ duplicate) over user-owned Template Designer specs; `template_presets.py` seeds the built-in presets into each user's library on first visit and doubles as a code fallback. |
| `analysis_router.py` | `/career` AI resume + portfolio analyzers, streamed section rewrite, and copilot ask. |
| `render.py` | Standalone HTML renderer for resume templates + portfolio layouts, shared by browser-print / HTML-download / server-PDF; `html_to_pdf()` via xhtml2pdf. |
| `db.py` / `versions.py` / `portfolio_db.py` / `portfolio_versions.py` / `analysis_db.py` / `jobs_db.py` / `publish_db.py` | Raw-sqlite CRUD against the separate DB (resume + portfolio + jobs + published snapshots); immutable version snapshots; analysis + `ai_runs` audit log. |
| `schema.py` | `register(cursor)` DDL (called by `db.init_career_db()`, **not** `common/db.py`). Now also creates `job_descriptions` + `portfolio_published` and adds the `template_key` columns. |
| `prompt_builder.py` / `llm.py` / `ai_runs.py` | Pure prompts (analyze / rewrite / copilot / import / **tailor**); thin wrapper over `common.ai_client`; per-call audit timer. |

Frontend service is `frontend/src/lib/services/careerService.ts` (reuses `apiFetch` + the AI-settings
helpers), Zustand store `frontend/src/modules/career/store/resumeStore.ts`, components under
`frontend/src/modules/career/`, pages under `frontend/src/app/career/`. See that module's `README.md`.

### Integration points (only existing files touched, all tagged `CAREER STUDIO INTEGRATION`)
A few lines in `backend/main.py` (include the seven routers — resume, analysis, portfolio, the
unauthenticated portfolio `public_router`, `tailor_router`, `views_router`, and `templates_router` —
plus `init_career_db()` in the lifespan) and one collapsible menu/submenu in
`frontend/src/modules/common/Sidebar.tsx`. The public share page lives at
`frontend/src/app/p/[slug]/page.tsx`. Everything else is new files. Backend gains one dependency:
**`xhtml2pdf`** (pure-python HTML→PDF).

### Recently added (2026-08-05)
Two batches landed on the same day: a profile-driven rebuild, then a follow-up pass that made
profiles the primary workflow rather than an editor accessory.

- **Profile-driven rebuild:** one or more **Master Profiles** hold reusable data; resumes and
  portfolios are **live, template-driven views** over a chosen profile (edit the profile → every
  view updates). New tabbed `/career` shell, a profile dropdown + edit-pencil and section
  show/hide/reorder per view, and an iframe live preview that is byte-identical to the export.
  Backend: `career_views` table, `is_profile` flag, `views_router.py` / `views_db.py`. The earlier
  unified dashboard (`CareerDashboard.tsx`) was superseded by the tabs, and the pre-profile
  standalone resume/portfolio builders were later removed once nothing linked to them.
- **Profile Selector, wizard, import, and enrichment**: `ProfileSelector.tsx` (inline rename/
  duplicate/archive/delete, no nav) plus a guided 5-method **create-profile wizard**
  (`CreateProfileWizard.tsx`, including a skills-only skeleton from a job posting), a hardened
  **import** dialog (resume/JSON/AI-structured text, with per-section validation + mapping notes),
  and a separate **enrichment** flow (`ProfileEnrichDialog.tsx`) that classifies incoming content as
  addition/duplicate/conflict before merging, with an automatic snapshot first.
- **Profile metadata** (`origin`, `primary_role`, `experience_level`, `target_industry`,
  `target_roles`/`target_companies`/`tags`, `confidence_score`, `last_used_at`) — editable via a
  collapsible **Profile Details** panel, and used to pre-fill and steer the Generate tab.
- **Generate tab**: one-step "tailor my profile to this job" (link/description/context/JSON) →
  a new tailored profile + resume, a gap-analysis panel (fit score, matched/missing skills, ATS
  keywords, recommendations), and JD-driven **new-section proposals** under a strict
  no-fabrication rule. Structured job extraction (`POST /career/jobs/extract`) previews a parsed
  breakdown of a posting before it's saved.
- **Unsaved-changes guard**: switching profiles or navigating away mid-autosave-debounce now prompts
  Save/Discard/Cancel; covers the Profile Editor's own controls and browser-level unload, not
  arbitrary Header/Sidebar nav clicks.
- **Template Designer**: a visual-knob editor over user-owned, CRUD-able resume/portfolio templates
  with a live preview and built-in presets that seed each user's library.
- **Job-Description tailoring** (view-scoped): `job_descriptions` entity, `/career/jobs` CRUD, and
  `/career/views/{id}/tailor` (preview) + `/tailor/apply` (in-place with auto-checkpoint, or a new
  tailored profile + view).
- **Resume templates + export** (HTML / browser-PDF / server-PDF) via a shared `render.py`.
- **Portfolio publishing** to a public `/p/{slug}` page (frozen snapshot, view counter, unpublish) +
  HTML/PDF export + layout templates + **4 visual style templates** (Minimal, Isometric 3D-pattern,
  Aurora, Blueprint).
- **Bug fixes**: streamed section rewrite now works for **all** providers (not just Gemini/Vertex/
  Ollama — `stream_ai_text` falls back to a blocking call); the analyzer UI finally has a
  **job-description input**; undo/redo no longer desyncs after add/delete/restore (history clears on
  structural changes); a `gap_analysis` field missing from the LLM's response no longer crashes the
  Generate tab (defaults added); plus small cleanups (dead `useState` initializer, reorder guard).

**Explicitly excluded per user instruction:** AI Interview mode. **Deferred, not built:**
multi-document import + enrichment across more than one extra document at a time (today's
enrichment flow merges one document at a time), a real automated test suite for this module (or the
repo generally — see "Working style" in this file's header), wiring the create-profile wizard into
`ProfileSelector`'s own quick-create shortcut (kept as a fast blank-create path), and role/tag badges
on `ProfileSelector` rows (skipped over layout risk).

### Roadmap (not built yet)
Cover letters, GitHub/LinkedIn sync, per-user public username hosting (`/u/{username}`), comments,
analytics dashboards, a template marketplace (sharing/browsing other users' designed templates —
today's Template Designer library is per-user only), richer resume templates (two-column), and
finer-grained multi-document profile enrichment (dedup + conflict resolution across more than one
document per merge). HTML sanitization (`bleach`/DOMPurify) is still worth adding **before** any
feature that renders raw user-authored HTML — today all rendered content is escaped/text-only.

