# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## Project shape

Monorepo: FastAPI backend (`backend/`) + Next.js 15 / TypeScript / Tailwind frontend
(`frontend/`, dev port **4028**, not the Next.js default 3000). Backend dev port is
**8082**. Backend deps via `uv` (`pyproject.toml` + `uv.lock`); frontend via `npm`.

This is a personal AI learning-and-experimentation app: a place to build and try out AI
labs/tools while learning both the subject matter and how to build with AI. It started
as an interview-prep app (Daily Session, DSA/CV/System Design Labs, Question Bank/
Review, Progress Dashboard, LinkedIn Post Generator) and has since grown a
Todo/Project/Quick-Task productivity suite (`ai_todo`, reachable at `/ai-todo`; old `/todo` redirects), a Career
Studio (`/career`), an AI-generated LMS (`ai_lms`, at `/ai-lms`), and a Swipe PDF
Reader — each added as its own experiment rather than a planned product roadmap, so
modules vary in polish and don't all share the same conventions. As of 2026-08-02 it
has a full login system — see the "Authentication & Multi-User Data" section in
`README.md` for the architecture, what's implemented, and known follow-ups. Read that
before touching auth, the data layer, or adding a new backend module. Each of the
larger bolted-on modules (To-Do, Career Studio, Swipe PDF Reader) has its own section
further down in `README.md` — check there before assuming a module's shape.

## Commands

- **Backend** (from `backend/`, deps resolved automatically by `uv`):
  - Run the API: `uv run uvicorn main:app --reload --port 8082` (or `uv run python
    main.py`, which also initializes the SQLite schema).
  - There is no pytest suite. `backend/tests/*_test.py` are standalone connectivity
    checks for individual AI providers, run directly and optionally passed a model
    name, e.g. `uv run python tests/gemini_test.py gemini-2.5-pro`. They read API keys
    from `backend/.env`.
- **Frontend** (from `frontend/`):
  - `npm run dev` — dev server on port 4028.
  - `npm run build` / `npm run start` — production build / serve.
  - `npm run lint` / `npm run lint:fix` — ESLint (Next.js config).
  - `npm run type-check` — `tsc --noEmit`.
  - `npm run format` — Prettier over `src/**/*.{ts,tsx,css,md,json}`.
  - No frontend test runner is configured. Verification is manual (see "Working style"
    below).
- **Both at once**: `./startup.sh` from the repo root (frees ports 8082/4028 first,
  then launches backend + `npm run dev` in the background; Ctrl+C stops both).

## Critical gotchas

- **Visual guideline: `VISUAL-GUIDELINES.md`** (repo root). Read it before any UI work: quiet neutral chrome, one accent
  (`--color-primary`) for the primary action / selection / progress, hue only where it means something, weights 400-600,
  sentence case, and the shared components (task cards, neutral chips, stat cards, empty states). Check new screens at
  390 and 1440 px, light and dark.

- **The live SQLite database is `backend/data/lab_ninja.sqlite3`** (`get_db_path()` in
  `backend/modules/common/db.py`; there is no fallback to any other location, only the
  test overrides below). It's tracked in git — `.gitignore` blanket-
  ignores `*.sqlite3` but re-includes this file and `career_studio.sqlite3` with `!`
  negation so the shipped DBs deploy with the app on Vercel.
- **Never run ad-hoc test scripts against the real DB.** `get_db_path()` honors
  `LABNINJA_TEST_DB_PATH` — copy the real file somewhere first, set that env var, and
  test against the copy. This is the established pattern for all backend verification
  in this repo; use it, don't invent a new one.
  **That variable only protects the Python backend.** The Next.js side (`fe-apis`,
  `nextjs-api` mode) ignores it: in local dev `src/lib/server/sqliteReader.ts` opens
  `backend/data/lab_ninja.sqlite3` *directly* (Next.js and FastAPI share one file), so a
  `next dev` run in that mode writes test rows into the tracked DB (this happened once and
  had to be restored from git). To test it, point `LABNINJA_DB_DIR` at a scratch folder
  that holds a copy named `lab_ninja.sqlite3`, and unset `DATABASE_URL` (set, it pushes
  snapshots to Neon). Auth in that mode uses the same file (so `LABNINJA_DB_DIR`
  protects it too); only on Vercel, where the repo is read-only, is a `/tmp` copy used. Run `git status backend/data` afterwards.
- **Two silent Tailwind traps** (`frontend/tailwind.config.js` is shared — don't change it to "fix" them, it would
  restyle every module). (1) The theme colours (`primary`, `muted`, `border`, `card`, …) are bare `var(--color-x)`
  strings, so an opacity modifier on them — `bg-muted/20`, `border-border/60`, `hover:bg-primary/90` — compiles to
  *nothing*, no warning. Use the `mix-*` utilities from `frontend/tailwind/mix-colors.js`: `mix-bg-muted/20`,
  `hover:mix-bg-primary/90`, `mix-border-*`, `mix-text-*`, `mix-ring-*`. Palette colours (`bg-amber-500/10`) are fine.
  (2) The spacing keys 6, 12, 18, 24, 36, 48, 72, 96, 144 are redefined in **pixels** (`px-6` = 6px, `w-12` = 12px):
  write `px-[1.5rem]`. The enforced area (To-Do, shared UI, the three labs, Daily Session, Labs Project, Config, SwipeLearn and
  the shared lab components: `TODO_ROOTS` in `frontend/scripts/check-tailwind-traps.mjs`) is clean and
  `npm run check:tailwind` (from `frontend/`) keeps it so. The same script also flags a palette colour with an off-scale
  alpha (`bg-white/12`), `shadow-xs` / `py-0.2`, and `mix-bg-amber-500/15` (`mix-*` only knows theme tokens). `-- --all`
  lists the rest of the app, which still has these traps.
- **Lab visual system (DSA, CV, System Design, Daily Session, Labs Project, Config).** Interactive colour in a lab is the
  Settings accent: use `--lab-accent*`, `lab-ink` (small text) and `lab-tint`; `--lab-cv`/`--lab-system` feed only
  `--lab-identity` (hero glow and `.lab-tile`), never buttons, rows, links or progress. Inside `.lab-shell`/`.lab-page`/
  `.dsa-type` `--color-border` is redefined to ONE hairline: use bare `border`; a dialog or popover that portals to
  `<body>` needs `lab-page` (DSA: `dsa-type`) on its panel or it shows the global border. Wiki/sidebar pieces live in
  `modules/labs/common/{WikiParts,LabSidebarParts,LabTags}`; pane collapsing is `useLabPanes`. Surfaces (hero, cards, panels, list shells) carry the **soft glow edge**: add `lab-edge` (+ `lab-edge-link` if it opens something) and
  drop `border-border`; it is a static lab-hue glow and corner wash, the accent on hover (tokens `--edge-*`, README "Lab visual system").
  Names wrap, they are never cut with an ellipsis (chips and one-line UI labels may truncate). `check:tailwind` enforces these folders; details in
  `README.md` ("Lab visual system").
- **`backend/modules/todo/` and `frontend/src/modules/todo/` are dead leftovers from
  the rename to `ai_todo`/`ai-todo`.** Nothing imports from either (check with grep
  before assuming otherwise) — `backend/main.py` only wires up `modules.ai_todo.*`, and
  every page under `frontend/src/app/ai-todo/` imports from `@/modules/ai-todo/*`. Edit
  `ai_todo` / `ai-todo`, not `todo`.
- **`career_studio` has its own separate database — `backend/data/career_studio.sqlite3`, not `lab_ninja.sqlite3`.** `get_career_db_path()` in
  `backend/modules/career_studio/shared/db.py` honors `CAREER_STUDIO_DB_PATH` (mirrors
  `LABNINJA_TEST_DB_PATH`'s pattern above, but it's a distinct env var for a distinct
  file). Testing any resume/portfolio/views/templates flow by copying only
  `lab_ninja.sqlite3` leaves the real career_studio data unprotected — copy both files
  and set both env vars.
- **The Android app lives in `app/`** (Capacitor project, `capacitor.config.ts`, `install_app.sh`; own `package.json`). Install/update on a phone with `./app/install_app.sh` (`--local` = Mac dev server, `--check` = report only). Its web half (`frontend/src/lib/reminders/native*.ts`) must stay in `frontend/` because Vercel bundles it. Never call `PushNotifications.register()` without `google-services.json`: it crashes the app natively, so `MainActivity` gates FCM behind a `LabNinjaFcm` user-agent token. Details: `README.md` ("Android app").
- **`backendFetch` (`src/lib/http/backendAvailability.ts`) times out after 5s by default.** Any call that waits on an
  AI provider must pass `timeoutMs: AI_TIMEOUT_MS` (5 min). Without it, Daily Session generation was always cut off
  and the page silently saved the same built-in questions every time; it no longer falls back on errors at all.
- **The build's JSX tagger (`@dhiwise/component-tagger`) cannot parse a JSX element that carries a type argument** (`<Segmented<T> prop />`): `tsc` accepts it, `next dev` fails with "Expected jsx identifier" on the next element. Make such a component non-generic and cast at the call site.
- **Frontend dev port is 4028.** Backend CORS defaults to `http://localhost:4028`
  (`backend/main.py`) — if you ever see CORS errors in local dev, check that default
  before assuming something else is wrong.
- **The app is login-only (since 2026-11-16).** Every page and every API endpoint on both
  backends needs a logged-in user. Public: login/signup/logout, the health checks (`/`,
  `/health`, `/api/health`), the published Career Studio pages (`/p/*`, `/r/*`) with their
  `/career/public/*` endpoints, and static files. Pages are guarded in one place,
  `AuthGate` in the root layout (`frontend/src/modules/auth/AuthGate.tsx`,
  `PUBLIC_PATH_PREFIXES`): a guest goes to `/login?next=<page>`. Backend: FastAPI uses
  `Depends(get_current_user_id)` (router-level where possible); fe-apis routes outside the
  shared dispatcher use `requireTodoUserId` / `userIdOrAuthError` (`fe-apis/todo/_shared.ts`).
- Every `/todo/*`, `/pareto/*`, `/dsa/*`, `/cv/*`, `/system-design/*`, and
  `daily_session` router endpoint requires a Bearer JWT
  (`Depends(get_current_user_id)` from `modules/auth/dependencies.py`).
  **Any frontend call to these must use `apiFetch` from
  `frontend/src/lib/http/apiClient.ts`, never plain `fetch()`** — a plain fetch to any
  of these silently 401s (this already happened once: `GenerateQuestionsPanel.tsx`, the
  three lab modules' topic/section/subtopic CRUD, and `paretoService`/`questionsService`/
  `sessionService` all shipped with bare `fetch()` calls when auth was rolled out, and
  had to be fixed after the fact). `linkedin_post_generator`, `/config/*` and
  `/api/pdf/*` were public until 2026-11-16 and need a login now too (`linkedin_post_generator`
  and the PDF documents are still global, not scoped per user). `GET /settings/ollama-models`
  (a local-Ollama proxy, no user data) is on the authenticated `daily_session` router now;
  its `public_router` is empty. The Config page is login-only like every other page.
- Guest mode for Todo/Project/Quick-Task data (browser IndexedDB,
  `frontend/src/lib/services/local/`) still exists in code: the data services
  (`todoService`/`projectService`/`quickTaskService`) dispatch to local vs. remote based
  on `isLoggedIn()` from `frontend/src/lib/auth/tokenStore.ts`. Since the app went
  login-only (2026-11-16) no guest reaches those pages, so the guest branch is unreachable
  (kept, not deleted; the first login still imports old guest data via `POST /todo/import`).
  Don't add guest branches to new methods.
- **To-Do Routines** (`/ai-todo?tab=routines`, Dailies + routine groups, ticked per local date) and pinned tasks on
  Today: `backend/modules/ai_todo/routines/` ↔ `frontend/fe-apis/todo/routines/` (same limits and error texts), plus
  `tasks.pinned` in both tasks twins. Dailies ticks start over at 8 am local (`tickDay`, frontend only), other groups
  at midnight. README: "Routines and pinned tasks".
- **To-Do Scheduler** (`/ai-todo?tab=schedule`): `backend/modules/ai_todo/schedules/` ↔ `frontend/fe-apis/todo/schedules/`
  (prompts byte-identical), and rule validation `frontend/src/lib/schedules/scheduleRules.ts` (`normalizeRule`) ↔
  `schedules/rules.py` (same error texts, same stored JSON). Runs happen on the device (web engine + the native Android
  plugin in `app/android/.../scheduler/`), never on a server cron. The tab is now the **Assistant** (chat + voice):
  `backend/modules/ai_todo/agent/` ↔ `frontend/fe-apis/todo/agent/` (`POST /todo/agent/chat`, workspace snapshot, web
  step; prompts byte-identical, the endpoint never writes: the browser applies the actions). Details: README.md
  ("Assistant and Scheduler").
- **Labs: one page, config per lab (`frontend/src/modules/labs/`).** `common/` = everything labs share; one folder per lab
  holds only what is specific to it. CV, System Design, Communication, Finance, Python and GenAI & AI are ALL rendered by
  `common/TopicLab.tsx` from their `<lab>/labConfig.ts` (`TopicLabConfig<T>`: `sectionDefs`, `defaultContent`, `fallbackTopics`,
  `customTopic`, `topicTags`/`wikiMetrics` for extra topic fields): extend the config, never copy the page. **DSA keeps its own
  page on purpose** (week plan, organizer, approaches) but uses the `common/` parts. A lab's section prompts have ONE source (its
  `sectionDefs.ts`/`labConfig.ts`, data only), which `common/labSectionDefaults.ts` imports for the Config page. Backend
  `modules/common/topic_lab.py` + thin `<lab>_lab/` wrappers; seed topics in `<lab>_lab/topics.json` (ASCII only). Every lab is
  listed once in `common/labCatalog.ts` (`/labs`, the sidebar Labs menu, the phone Labs sheet). `modules/common/copilot/CopilotChat.tsx`
  stays shared with non-lab modules. Adding a lab = its two folders + a short list of registrations: README "Lab code layout" > "Adding a lab".
  README: "Lab code layout" and "Labs home and the Learning Labs".
- **Lab management** (`<lab path>/manage` for all seven labs, shared parts in `frontend/src/modules/labs/common/management/`): a lab is one entry in
  `labManagement.ts` (`LAB_MANAGEMENT`) plus a six-line `app/<lab>/manage/page.tsx`; it gets *Lab management* (section prompts, lab-wide context,
  groups and topics) and *Topic management* (one topic's group, visibility and context) as pages with their own URLs, not modals. `SectionPromptEditor`
  is one editor used as a page and as the lab pages' quick dialog. **Topics are per user in every lab:** `<lab>_topics.owner_id` (NULL = shared) +
  `<lab>_topic_overrides`; `POST /<lab>/topics` takes `shared` (admin only), `DELETE /<lab>/topics` and `DELETE /<lab>/sections` exist. One
  implementation per backend (`backend/modules/common/owned_topics.py` ↔ `fetchOwned`/`saveOwned`/`deleteOwned` in `frontend/fe-apis/labs/index.ts`):
  change both. A topic's own context is a `lab_section_settings` row with section id `topic:<id>` (no table). New create/edit flows get a page and an
  address, not a dialog (Labs Project's New project is `/labs-project/new`). README: "Lab management".
- **AI LMS hierarchy:** Class > Subject (-> Lessons) or Project (-> Module/Step -> Sub-step,
  each generating one Lesson). A Project is an `lms_subjects` row with `kind='project'`; its
  outline lives in `project_plan` JSON. Both levels of outline items carry `{title, focus,
  context, lesson_id, sublessons}`. Project endpoints exist in both `backend/modules/ai_lms/router.py`
  and `frontend/fe-apis/lms/index.ts` -- change both. Details in `README.md` ("AI LMS Module").
- **Video links** (labs: personal `lab_page_videos`; AI LMS: shared `lms_videos` + a `videos` list inside each project outline entry): URL rules are `frontend/src/lib/video/videoLinks.ts` <-> `backend/modules/common/video_links.py` (same accept/refuse and texts, change both), endpoints in both twins (`ai_lms/videos.py` <-> `fe-apis/lms/videos.ts`, `lab_sections/videos.py` <-> `fe-apis/labSections/videos.ts`). YouTube embeds use `www.youtube.com/embed` on purpose (private videos), created only after Play. README "Video links".
- **Roles: user < editor < admin < superadmin.** Every non-GET `/api/lms/*` request needs editor+
  (`_require_editor_for_writes` in `ai_lms/router.py`; allowlist `_NON_EDIT_WRITES` for per-user progress and
  preview-only AI calls). A new LMS write endpoint is gated automatically; a new preview-only one must be added to
  the allowlist. Only a superadmin can grant/revoke admin-level roles. First superadmin: `LABNINJA_SUPERADMIN_EMAILS`.
  `fe-apis` has the same gate in `requireUserId` (`fe-apis/lms/index.ts`, same allowlist) — keep the two in sync.
  Role/landing-editor checks: `tests/e2e/ai-lms/` (Playwright, README there) and `backend/tests/lms_roles_test.py`.
- **AI LMS class membership, updates and practice reminders:** `classes/<c>/membership` (PUT/DELETE, allowlisted for non-editors) and `classes/<c>/notifications` (POST, editor+, deliberately not allowlisted) + `GET /notifications` live in both twins (`ai_lms/updates.py` ↔ `fe-apis/lms/updates.ts`, same texts and codes; only the Next.js layer pushes). A class practice reminder is a Scheduler reminder marked `source_text = 'lms-class:<slug>'` (`lib/schedules/classReminders.ts`); never show the marker. README: "Class membership, updates and practice reminders".
- AI-powered endpoints/methods are login-required everywhere, on purpose — don't add
  guest-mode fallbacks for them without checking with the user first.
- **AI LMS class folders (`frontend/src/modules/ai-lms/classes/`) are synced both ways with
  the DB.**
  - The sync lives in `backend/modules/ai_lms/class_folders.py` and
    `frontend/fe-apis/lms/classFolders.ts`, which must write byte-identical files. Change both,
    and diff their output trees from two DB copies to check.
  - Tests that copy the DB must also set `LMS_CLASSES_DIR` to a scratch folder. With a
    redirected DB and no `LMS_CLASSES_DIR`, the layer turns itself off and never touches the
    repo folder.
  - Templates (landing page, export deploy files) live in `backend/modules/ai_lms/templates/`.
  - Details are in README.md ("Class folders").

## AI provider layer (`backend/modules/common/ai/`)

Every module that calls an LLM (`daily_session`, the three labs, `ai_todo`, `ai_lms`,
`career_studio`, `linkedin_post_generator`) goes through this shared package rather than
calling a provider SDK directly:

- `settings.py` — `AISettings` Pydantic model (provider, model, api_key, base_url, etc.)
  that request bodies subclass; `GROQ_MODELS` list.
- `providers.py` — one `_call_<provider>` function per backend (Gemini, OpenAI-
  compatible incl. DeepSeek/Groq/OpenRouter/custom, Anthropic, Vertex, Ollama).
- `client.py` — the public surface (`call_ai_text`, `call_ai_vision`, `stream_ai_text`,
  `test_provider_key`). `_provider_order()` picks a same-request fallback chain keyed
  off the chosen model name (e.g. a `gemini-*` choice tries Gemini first, then falls
  back through OpenRouter/DeepSeek/Groq/OpenAI/Anthropic/custom/Ollama) — **except**
  Vertex, which is always an isolated single-provider path (own GCP credentials/
  billing) that never falls back to or from anything else.
- **API keys and model choices are never persisted server-side.** They live in the
  browser's `localStorage` (`frontend/src/lib/services/settingsService.ts`) and ride
  along with each AI request as part of the `AISettings`-shaped payload — this is what
  lets one deployment be shared by multiple people, each using their own keys/quota.
  Don't add a "save API key to the DB" feature without checking with the user first.
- **Default provider from `.env`: `AI_PROVIDER` (+ optional `AI_MODEL`).** An empty
  `model` in a request means "use the server's .env default" — that's what the Config
  page's "Use .env default" option sends, and it's the default for new browsers
  (`USE_ENV_DEFAULT_MODEL = ''` in `settingsService.ts`). Resolution is
  `resolve_model()` in `modules/common/ai/settings.py` (applied by an `AISettings.model`
  validator, so every request body sees the resolved id) and its twin `resolveModel()`
  in `frontend/fe-apis/ai/defaults.ts`; when the env default is used, `AI_PROVIDER` is
  tried first with `AI_MODEL` sent as-is. Keep the two twins in sync. Each backend reads
  its own `.env` (`backend/.env` in fastapi mode, `frontend/.env` in nextjs-api mode);
  `GET /config/ai-default` reports what the active backend resolves to. An explicit
  model picked in Config always wins.
- **Provider-call behaviour that must match in both twins** (`providers.py`/`utils.py` ↔ `fe-apis/ai/providers.ts`): a connection that
  cannot be made (refused, reset, DNS, a dropped SYN) is retried twice after 1 s and 2 s, only when it fails within 20 s, and the final
  error names the cause (`fetch failed (UND_ERR_CONNECT_TIMEOUT)`; Node hides it in `err.cause`); an OpenAI-compatible reply with no
  text is a *failure* (so the next provider is tried), retried once with +8192 tokens when `finish_reason` is `length` (a reasoning model
  spent the budget thinking), and otherwise explained in the error; Gemini is called with `thinkingBudget: 0` and retried without it on a
  400. `call_ai_text(..., timeout=)` ↔ `callAIText(..., timeoutMs)`: callers with long answers (Guided Practice: 240 s) must pass one, the
  Python defaults are 45-60 s. Node's own ceiling is 5 minutes (undici header timeout), so a longer timeout needs streaming, not a bigger number.
- Generic STT/TTS (Deepgram) lives separately in `modules/common/voice/` + the thin
  `modules/voice/router.py` (`/api/voice/stt`, `/api/voice/tts`, both authenticated) —
  shared across any module needing voice, not tied to `ai_lms` even though that's
  where voice-chat tutoring first appeared.

## Dual deployment modes: FastAPI vs. Next.js serverless (`fe-apis/`)

The frontend can run two ways, switched via `NEXT_PUBLIC_BACKEND_MODE`
(`resolveApiBaseUrl()` in `frontend/src/lib/http/apiClient.ts`):

- **`fastapi` (default in local dev)** — the frontend calls the real FastAPI backend at
  `NEXT_PUBLIC_API_URL` (`http://localhost:8082` locally). This is the primary,
  fully-featured backend; most modules only exist here.
- **`nextjs-api`** — for a zero-external-server Vercel deployment. Requests route to
  Next.js App Router handlers under `frontend/src/app/api/**`, which call into
  **`frontend/fe-apis/`** — a separate, hand-maintained TypeScript reimplementation of
  a *subset* of backend modules (currently: auth, `ai_lms`, the `ai_todo` suite incl.
  `/pareto`, PDF upload/reader, voice, config env-prefill). `fe-apis` is not a thin proxy;
  it's its own DB/business-logic layer, so a change to `ai_lms`/`ai_todo`/auth/pdf/voice
  behavior in the Python backend does **not** automatically apply in `nextjs-api` mode —
  the `fe-apis/` equivalent needs the matching change too, or the two modes will silently
  diverge. `ai_todo`'s twin is `frontend/fe-apis/todo/` (one catch-all route per prefix,
  `src/app/api/{todo,pareto}/[...path]`); its README maps each Python file to its TS port.
- **The labs have two small twins**, nothing else of theirs does: `backend/modules/lab_sections/`
  (AI-written lab sections like DSA "Approaches", context regenerate, AI quizzes, the per-page
  "Mark as complete" state, and each user's per-section generation settings: prompt, add-on, standing
  context, `'*'` = the lab-wide row; `/lab-sections/*`) ↔ `frontend/fe-apis/labSections/` (its catch-all route
  must export every verb the twin serves: a missing `PUT` was a 405 until the progress check caught
  it), and the DSA week plan (`/dsa/week-plan/*`: the active plan, named plan profiles and the AI
  `POST /dsa/week-plan/auto`, in `dsa_lab/`) ↔ `frontend/fe-apis/dsaLab/` (its route file must export
  GET/POST/PUT/PATCH/DELETE and `next.config.mjs` rewrites `/dsa/week-plan/:path*`; the rest of `/dsa/*`
  has no twin). Prompts, limits and error texts are copied verbatim, so change both; see README
  ("DSA Week Plan, Organizer and Auto Organizer"). To
  check them: point both at a mock OpenAI-compatible provider (`customBaseUrl`), send the same requests
  to each, and diff statuses, bodies and the prompts the mock received.
- **Labs Project** is the third lab twin: `backend/modules/lab_projects/` (`/lab-projects/*`: projects and the
  sections saved to them) ↔ `frontend/fe-apis/labProjects/`. `lab_sections` takes an optional `project_id`
  (JSON integer only), loads the project server-side scoped to the user, and adds the project block through
  `lab_projects/knowledge.py` ↔ `fe-apis/labProjects/knowledge.ts`; both the retrieval (BM25) and every prompt
  string must stay byte-identical across the pair. Isolation rules live in README.md ("Labs Project"): never
  null `lab_section_content.project_id` / `lab_quiz_questions.project_id` on a project delete, and always scope
  section queries by user *and* project. `backend/tests/lab_projects_test.py` covers it.
- **Guided Practice** is the fourth lab twin: `backend/modules/guided_practice/` ↔ `frontend/fe-apis/guidedPractice/`
  (`/guided-practice/*`, one set of endpoints for every guided lab; page code in `frontend/src/modules/labs/guided/`, routes
  `/dsa-lab/guided-practice` and `/cv-lab/guided-practice`). It stores one document per user, lab, topic and subtopic
  (`guided_practice_state`, saved with a version, a stale save is a 409) and runs AI prompts that return raw text (the browser
  parses it). **A path is written in pages** (`POST /outline` = the plan, `POST /phase` = one phase of five full questions, also used by Regenerate
  phase and Generate more) so no single answer can be cut off; a planned phase that is not written yet is `Phase.pending` and must never count as done. **The prompts (`prompts.ts` ↔ `prompts.py`) must stay byte-identical**: run
  `cd backend && uv run python tests/guided_practice_prompts_test.py` (5,679 cases, every builder x branch x lab, through both
  builders; needs Node 22.18+), not by eye. A new lab = `guided/labs.ts` + `GUIDED_LABS`/`PROFILES` on both servers + a route + a
  `guidedPractice` flag in its `TopicLabConfig`. The page has its own purple accent (`.gp-accent`, VISUAL-GUIDELINES.md "Module
  notes"); AI results and progress are applied through `useGuidedStore.mutate` (never from a stale closure). Exercises run in the
  browser (Pyodide, `public/runner/python-worker.js`); the AI's own tests are verified against its reference solution first. The game
  rules (`parse.ts`, `tree.ts`, `xp.ts`) are pure: `npm run test:guided` (from `frontend/`) checks them. README: "Guided Practice".
- **Data twins for the rest of the labs and Daily Session** (so nextjs-api mode shows the SQLite data):
  `fe-apis/labs` = topics + sections of DSA/CV/System Design (`/dsa/topics|sections` share the
  `api/dsa/[...path]` route with the week plan; `/cv/*`, `/system-design/*`) and of the Learning Labs (`/communication/*`,
  `/finance/*`, `/python/*`, which seed from the same `backend/modules/<lab>_lab/topics.json` FastAPI reads); `fe-apis/dailySession` = sessions,
  questions, session progress and stats, plus the answer coach (`fe-apis/dailySession/coach.ts` ↔ `daily_session.py` / `evaluation.py`: generate-answer, evaluate-answer, expand-answer, learn-chat; prompts and rubrics verbatim, change both) and the labs' Generate Practice panel (`fe-apis/dailySession/labGenerate.ts` ↔ `daily_session.py`: `POST /lab/generate-questions`
  and `/lab/generate-from-youtube`, prompts verbatim; the twin never downloads captions, it always asks for a pasted transcript)
  (not convert-flashcards, upload-resume, deck import, export, or
  `POST /questions/clear-duplicates`, login-only since 2026-11-16); `fe-apis/account` = `GET/PUT /auth/profile` and `/access-requests`. Each has a
  `next.config.mjs` rewrite and an `outputFileTracingIncludes` entry — every `/api/**` route that opens the database
  needs one, or a Vercel function ships without the file and serves an empty DB. Verified the twin way (same requests
  to both on DB copies, bodies diffed).
- **SwipeLearn** has one endpoint, `POST /swipe-learn/generate` (writes cards with the Config model):
  `backend/modules/swipe_learn/` ↔ `frontend/fe-apis/swipeLearn/`; its prompt `prompt.py` ↔
  `src/modules/swipe-learn/services/cardPrompt.ts` (byte-identical, also used by the browser's direct-Gemini path).
  README ("SwipeLearn Module").
- **Shared AI memory and web research** (both login-required, both have a twin): `backend/modules/memory/` ↔
  `frontend/fe-apis/memory/` (+ `src/lib/services/memoryService.ts`) and `backend/modules/research/` ↔
  `frontend/fe-apis/research/`. Memory = short per-user facts in the `ai_memory` table (module, topic, kind, fact,
  weight that fades with a 30-day half-life, capped per module); modules `remember()` events and the server puts the
  strongest few into that module's prompt (SwipeLearn, Daily Session so far). To give another module memory: record
  facts where the signal happens, and add `memory_lines(user_id, module, topic)` to its prompt on both sides.
  Research = read-only DuckDuckGo search + page fetch; **it fetches URLs for users, so every request goes through the
  SSRF guard (`check_public_url` / `checkPublicUrl`, public IPs only, redirects re-checked) — keep both twins' guards
  identical and never add a code path that fetches without it.** Constants, cleaning and parsing in each pair must
  match; verify twins by sending the same requests to both. README ("AI memory and web research").
- Still FastAPI-only: `career_studio`, `linkedin_post_generator`, the admin user-management routes (`/admin/*` except
  db push/pull), Daily Session's convert-flashcards / upload-resume, and the local-Ollama helpers. Don't assume feature parity between modes
  without checking whether a module has a `frontend/src/app/api/**` + `frontend/fe-apis/**` counterpart.

## Working style for this repo

- Backend schema migrations follow one idiom throughout: `PRAGMA table_info(<table>)`
  check + `ALTER TABLE ... ADD COLUMN` inside each module's `register(cursor)`, called
  from `init_db()`. Match it rather than introducing a new migration mechanism.
- No test suite exists yet (backend or frontend). Verification has been done via
  `FastAPI TestClient` scripts (backend) and a one-off Playwright smoke script
  (frontend, in a scratch dir — not committed). If you add real tests, this is a gap
  worth closing.
- Before declaring a frontend change done, actually run it: start both dev servers and
  drive it in a browser (Playwright via a scratch npm install works fine in this
  environment; `chromium-cli` was not available). Type-checking alone has already
  missed real bugs here (a CORS port mismatch, a stale-closure bug, an endpoint that
  silently required login with no guest fallback) that only showed up at runtime.
