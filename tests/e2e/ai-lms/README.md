# AI LMS end-to-end tests (Playwright, Chrome)

Covers: roles (user / editor / admin / superadmin), landing-page editing (manual + AI sections, AI page edits,
discard, HTML edit, stale/marker guards), projects (plan, modules, break-down, sub-lessons, steps, reorder),
AI lesson generate + revise, and plain users being view-only (UI and API).

Both backends are covered: the same scripts run against FastAPI and against the Next.js `fe-apis` layer.
The LLM is a local mock (`mock_llm.js`, OpenAI-compatible), wired in through the real "custom" provider path,
so no API keys are needed and **no real provider is called**. Blank the real keys in your shell as shown below.

## One-time
```
cd tests/e2e/ai-lms && npm install && npx playwright install chromium   # or use installed Chrome (default)
```

## Never run against the real data
Copy the DB first (CLAUDE.md "Critical gotchas") and redirect the class folders:

```
S=$(mktemp -d); cp backend/data/lab_ninja.sqlite3 $S/lab_ninja.sqlite3; mkdir $S/classes
node tests/e2e/ai-lms/mock_llm.js &                       # mock LLM on :9099
export GEMINI_API_KEY= DEEPSEEK_API_KEY= OPENROUTER_API_KEY= OPENAI_API_KEY= ANTHROPIC_API_KEY= GROQ_API_KEY= \
  AI_PROVIDER=custom AI_MODEL=mock CUSTOM_AI_API_KEY=k CUSTOM_AI_BASE_URL=http://localhost:9099/v1 CUSTOM_AI_MODEL=mock
```

Create the four accounts once (`user`, `editor`, `admin`, `superadmin` @test.com, password `Passw0rd!x`) via
`POST /auth/signup` (FastAPI) or `POST /api/auth/signup` (Next.js).

### FastAPI mode
```
(cd backend && LABNINJA_SUPERADMIN_EMAILS=superadmin@test.com LABNINJA_TEST_DB_PATH=$S/lab_ninja.sqlite3 \
   LMS_CLASSES_DIR=$S/classes uv run python -m uvicorn main:app --port 8082) &
(cd frontend && NEXT_PUBLIC_BACKEND_MODE=fastapi NEXT_PUBLIC_API_URL=http://localhost:8082 npm run dev) &
cd tests/e2e/ai-lms && LMS_CLASSES_DIR=$S/classes npm run test:lms && npm run test:project
```
(`admin@` is promoted by the first run via the superadmin account; promote it before running if you skip that.)

### Next.js (nextjs-api) mode
```
(cd frontend && LABNINJA_DB_DIR=$S LMS_CLASSES_DIR=$S/classes NEXT_PUBLIC_BACKEND_MODE=nextjs-api NPM_CONFIG_LOGLEVEL=warn npm run dev) &
cd tests/e2e/ai-lms && MODE=next DB=/tmp/lab_ninja.sqlite3 LMS_CLASSES_DIR=$S/classes npm run test:lms && MODE=next npm run test:project
```
In this mode auth reads `/tmp/lab_ninja.sqlite3` (not `LABNINJA_DB_DIR`), and there is no admin portal, so the
admin-UI checks are skipped and roles are set directly in `$DB` with `sqlite3`.
