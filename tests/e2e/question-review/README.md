# Question Review end-to-end tests (Playwright, Chromium)

Covers `/question-review?id=<n>` (`frontend/src/modules/question-review/`):

| Script | Tests |
| --- | --- |
| `guards.e2e.js` | a guest lands on `/login?next=…` and comes back after logging in; 14 review endpoints answer 401 without a token; "Question not found" for an unknown id; a forced 500 on the question shows "Try again", which recovers; a forced 500 on the workspace blocks saving and Retry recovers (the typed text is kept and saved); phone width (390px): no sideways scroll, the question and the pane switcher fit the first screen |
| `workspace.e2e.js` | Answer: auto-save + reload, Evaluate, STAR "Use as my answer", the mic button is there; AI tutor: start, send, mock reply; Quiz: generate, a wrong answer, "Generate more" sends `missed`, Reset behind its confirm (Cancel, then Clear); Notes: auto-save + reload, "Add to To-Do" creates a task (checked through the To-Do API, then deleted) |
| `navigation.e2e.js` | Mastered: toggle, reload, per-user isolation with two accounts; Review list: bookmark persists, the Question Bank "Review list" filter shows it, previous / next with `from=review`, un-bookmark; Keyboard: J/K and ←/→, `1`-`4`, `?`, and typing in the answer box never navigates; Layout: Focus / Split persists across reload (1280px) and falls back to Focus below 1024px |
| `study.e2e.js` | Quick review: content, Listen (play → Pause → Resume, speed chip), Regenerate behind its confirm; Breakdown: Mark as read persists, reopening resumes at the first unread lesson; Dive deep: Go deeper twice, hidden at depth 3 (and the API refuses a 4th level); Send to SwipeLearn: the link's `from/qid/label/focus`, then `/swipe-learn?topic=<slug>` with cards written by the mock |

Each test creates its own questions (a new session for the test account), so tests are independent and the suite
can run any number of times in a row. Review-list tests empty the account's review list first and last.

The LLM is a local mock (`mock_llm.js`, OpenAI-compatible, port **4596**), wired in through the real "custom"
provider path: the browser's Config settings (`localStorage['labninja.ai-settings.v1']`: `textGenerationModel:
'custom'`, `customBaseUrl: http://localhost:4596/v1`) ride along with every AI request, and each test account's
profile is saved with the model `custom` so a profile pull cannot switch it back. The mock recognises each prompt
(evaluate-answer, learn-chat, expand-answer/STAR, quiz generate, quick / breakdown / deep study, deep expand,
SwipeLearn cards) and answers valid JSON, so **no real provider is called** and the results are deterministic. The
scripts start the mock themselves when the port is free (or reuse one started with `npm run mock`). Listen is
silenced: the server voice (`/api/voice/tts`) is answered 503 and `speechSynthesis` is stubbed. The mic is only
checked for presence (no audio).

## One-time
```
cd tests/e2e/question-review && npm install    # playwright 1.65.0
npx playwright install chromium               # if its Chromium is not cached yet (PW_CHANNEL=chrome uses installed Chrome)
```

## Never run against the real data
Copy the DB first (CLAUDE.md "Critical gotchas"). The suite writes sessions, questions, workspaces, quizzes, study
items and review marks for its two accounts (`qr-e2e-a@test.com`, `qr-e2e-b@test.com`, password `Passw0rd!x`; created
on the first run, idempotently, through `POST /auth/signup` or `POST /api/auth/signup`).

```
S=$(mktemp -d); cp backend/data/lab_ninja.sqlite3 $S/lab_ninja.sqlite3
export GEMINI_API_KEY= DEEPSEEK_API_KEY= OPENROUTER_API_KEY= OPENAI_API_KEY= ANTHROPIC_API_KEY= GROQ_API_KEY=
```

### FastAPI mode
New FastAPI accounts are `pending` until approved. Pass `DB=$S/lab_ninja.sqlite3` and the suite approves its accounts
there with `sqlite3` (as the LMS suite sets roles), or pass `ADMIN_EMAIL` / `ADMIN_PASSWORD` of a superadmin to approve
them through `POST /admin/users/{id}/approve`.
```
(cd backend && LABNINJA_TEST_DB_PATH=$S/lab_ninja.sqlite3 uv run python -m uvicorn main:app --port 8082) &
(cd frontend && NEXT_PUBLIC_BACKEND_MODE=fastapi NEXT_PUBLIC_API_URL=http://localhost:8082 npm run dev) &
cd tests/e2e/question-review && DB=$S/lab_ninja.sqlite3 npm test
```

### Next.js (nextjs-api) mode
`LABNINJA_DB_DIR` redirects the Next.js side (auth included) to the copy; unset `DATABASE_URL` so nothing is pushed
to Neon. Accounts start approved in this mode.
```
(cd frontend && env -u DATABASE_URL LABNINJA_DB_DIR=$S NEXT_PUBLIC_BACKEND_MODE=nextjs-api npm run dev) &
cd tests/e2e/question-review && MODE=next npm test
```
Afterwards: `git status backend/data` must show nothing new.

### Options (environment)
| Variable | Default | |
| --- | --- | --- |
| `MODE` | (FastAPI) | `next` = nextjs-api mode (API calls go to `$BASE_URL/api/...`) |
| `BASE_URL` | `http://localhost:4028` | the Next.js app (e.g. a scratch server on 4029) |
| `API_URL` | `http://localhost:8082` | FastAPI, in FastAPI mode |
| `MOCK_PORT` / `MOCK_URL` | `4596` / `http://localhost:4596/v1` | the mock LLM |
| `E2E_USER_A`, `E2E_USER_B`, `E2E_PASSWORD` | see above | the two test accounts |
| `DB` / `ADMIN_EMAIL`, `ADMIN_PASSWORD` | | FastAPI only: how pending accounts get approved |
| `GREP` | | run only the tests whose name matches (regex) |
| `SHOTS_DIR` | `./shots` | screenshots (`FAIL-*.png` for a failed test) and `results-*.json` |
| `HEADED`, `PW_CHANNEL`, `TEST_TIMEOUT_MS` | , `chromium`, `240000` | |

`npm test` runs all four scripts (`run_all.js`) and prints one summary; `npm run test:guards` (`:workspace`,
`:navigation`, `:study`) runs one. Exit code 1 = a test failed, 2 = a script crashed.

**Verified:** nextjs-api mode only (2026-11-16, against a scratch `next dev` on a DB copy): all tests passed on two
consecutive runs. FastAPI mode has not been run yet (no `uv` on the machine it was written on); the requests, paths and
prompts it relies on are the twins' shared ones.
