# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## Project shape

Monorepo: FastAPI backend (`backend/`) + Next.js 15 / TypeScript / Tailwind frontend
(`frontend/`, dev port **4028**, not the Next.js default 3000). Backend dev port is
**8082**. Backend deps via `uv` (`pyproject.toml` + `uv.lock`); frontend via `npm`.

Originally an interview-prep app (Daily Session, DSA/CV/System Design Labs, Question
Bank/Review, Progress Dashboard, LinkedIn Post Generator) with a Todo/Project/Quick-Task
productivity suite bolted on (`/todo`). As of 2026-08-02 it has a full login system —
see the "Authentication & Multi-User Data" section in `README.md` for the architecture,
what's implemented, and known follow-ups. Read that before touching auth, the data
layer, or adding a new backend module.

## Critical gotchas

- **The live SQLite database is `backend/modules/lab_ninja.sqlite3`** — not
  `backend/lab_ninja.sqlite3`. `get_db_path()` in `backend/modules/common/db.py` has a
  misleading docstring; trust the code. It's tracked in git (see `.gitignore`).
- **Never run ad-hoc test scripts against the real DB.** `get_db_path()` honors
  `LABNINJA_TEST_DB_PATH` — copy the real file somewhere first, set that env var, and
  test against the copy. This is the established pattern for all backend verification
  in this repo; use it, don't invent a new one.
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
- AI-powered endpoints/methods are login-required everywhere, on purpose — don't add
  guest-mode fallbacks for them without checking with the user first.

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
