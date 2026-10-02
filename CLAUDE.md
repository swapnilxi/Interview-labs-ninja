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
Todo/Project/Quick-Task productivity suite (`ai_todo`, reachable at `/todo`), a Career
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

- **The live SQLite database is `backend/data/lab_ninja.sqlite3`** (`get_db_path()` in
  `backend/modules/common/db.py`; falls back to the legacy `backend/modules/`
  location if `backend/data/` doesn't exist, so don't be surprised if you see both
  paths referenced in old code/history). It's tracked in git — `.gitignore` blanket-
  ignores `*.sqlite3` but re-includes this file and `career_studio.sqlite3` with `!`
  negation so the shipped DBs deploy with the app on Vercel.
- **Never run ad-hoc test scripts against the real DB.** `get_db_path()` honors
  `LABNINJA_TEST_DB_PATH` — copy the real file somewhere first, set that env var, and
  test against the copy. This is the established pattern for all backend verification
  in this repo; use it, don't invent a new one.
- **`backend/modules/todo/` and `frontend/src/modules/todo/` are dead leftovers from
  the rename to `ai_todo`/`ai-todo`.** Nothing imports from either (check with grep
  before assuming otherwise) — `backend/main.py` only wires up `modules.ai_todo.*`, and
  every page under `frontend/src/app/todo/` imports from `@/modules/ai-todo/*`. Edit
  `ai_todo` / `ai-todo`, not `todo`.
- **`career_studio` has its own separate database — `backend/modules/career_studio/career_studio.sqlite3`, not `lab_ninja.sqlite3`.** `get_career_db_path()` in
  `backend/modules/career_studio/shared/db.py` honors `CAREER_STUDIO_DB_PATH` (mirrors
  `LABNINJA_TEST_DB_PATH`'s pattern above, but it's a distinct env var for a distinct
  file). Testing any resume/portfolio/views/templates flow by copying only
  `lab_ninja.sqlite3` leaves the real career_studio data unprotected — copy both files
  and set both env vars.
- **Frontend dev port is 4028.** Backend CORS defaults to `http://localhost:4028`
  (`backend/main.py`) — if you ever see CORS errors in local dev, check that default
  before assuming something else is wrong.
- Every `/todo/*`, `/pareto/*`, `/dsa/*`, `/cv/*`, `/system-design/*`, and
  `daily_session` router endpoint requires a Bearer JWT
  (`Depends(get_current_user_id)` from `modules/auth/dependencies.py`).
  **Any frontend call to these must use `apiFetch` from
  `frontend/src/lib/http/apiClient.ts`, never plain `fetch()`** — a plain fetch to any
  of these silently 401s (this already happened once: `GenerateQuestionsPanel.tsx`, the
  three lab modules' topic/section/subtopic CRUD, and `paretoService`/`questionsService`/
  `sessionService` all shipped with bare `fetch()` calls when auth was rolled out, and
  had to be fixed after the fact). `linkedin_post_generator` is the one module
  deliberately left unauthenticated/global — don't "fix" that without checking with the
  user first, it was an explicit scope decision. `GET /settings/ollama-models` lives on
  `daily_session.py`'s `public_router` (no auth) rather than its main `router`, since
  it's a local-Ollama proxy with no user data, used from the guest-accessible Config
  page — don't move it back onto the authenticated router.
- Guests never call the backend for Todo/Project/Quick-Task data — that lives in
  browser IndexedDB (`frontend/src/lib/services/local/`). Data services
  (`todoService`/`projectService`/`quickTaskService`) dispatch to local vs. remote based
  on `isLoggedIn()` from `frontend/src/lib/auth/tokenStore.ts`. When adding a new
  manual-CRUD method to one of these services, add the guest-mode branch too — don't
  let it silently become login-required.
- **AI LMS hierarchy:** Class > Subject (-> Lessons) or Project (-> Module/Step -> Sub-step,
  each generating one Lesson). A Project is an `lms_subjects` row with `kind='project'`; its
  outline lives in `project_plan` JSON. Both levels of outline items carry `{title, focus,
  context, lesson_id, sublessons}`. Project endpoints exist in both `backend/modules/ai_lms/router.py`
  and `frontend/fe-apis/lms/index.ts` -- change both. Details in `README.md` ("AI LMS Module").
- AI-powered endpoints/methods are login-required everywhere, on purpose — don't add
  guest-mode fallbacks for them without checking with the user first.

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
  a *subset* of backend modules (currently: auth, `ai_lms`, PDF upload/reader, voice,
  config env-prefill). `fe-apis` is not a thin proxy; it's its own DB/business-logic
  layer, so a change to `ai_lms`/auth/pdf/voice behavior in the Python backend does
  **not** automatically apply in `nextjs-api` mode — the `fe-apis/` equivalent needs
  the matching change too, or the two modes will silently diverge.
- Most modules (`ai_todo`, `career_studio`, the interview labs, `daily_session`,
  `linkedin_post_generator`) have **no** `fe-apis` equivalent — they only work in
  `fastapi` mode. Don't assume feature parity between modes without checking whether a
  module has a `frontend/src/app/api/**` + `frontend/fe-apis/**` counterpart.

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
