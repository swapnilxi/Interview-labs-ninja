# fe-apis/todo — To-Do suite for nextjs-api mode

TypeScript twin of `backend/modules/ai_todo` (Smart To-Do, Quick Daily, Plan & Project,
Goals, 80/20 Pareto, guest-data import). It exists so the To-Do page works on the
zero-external-server deployment (`NEXT_PUBLIC_BACKEND_MODE=nextjs-api`, which is what
Vercel runs). **Any change to the Python module must be mirrored here** — the frontend
calls the same `/todo/*` and `/pareto/*` paths in both modes.

## Request flow

```
browser  /todo/tasks/tree            (apiFetch, base URL '' in nextjs-api mode)
  -> next.config.mjs rewrite         /todo/:path+ -> /api/todo/:path+   (/pareto/:path* likewise)
  -> src/app/api/todo/[...path]/route.ts
  -> index.ts handleTodo()           GET as-is; writes wrapped in withNeonSync
  -> router.ts dispatch()            match method+path, auth, call handler, shape errors
  -> <module>/handlers*.ts           ports of the FastAPI endpoints
  -> <module>/db.ts                  ports of the Python db.py functions
```

The bare `/todo` URL is *not* an API path: it redirects to the `/ai-todo` page.

## Layout (Python source -> TS file)

| Python | TypeScript |
|---|---|
| `shared/schema.py` | `schema.ts` (`ensureTodoSchema`, run once per process from `withTodoDb`) |
| `tasks/db.py`, `quick/db.py`, `projects/db.py`, `goals/db.py` | `<module>/db.ts` |
| `tasks/router.py` (task CRUD … `/tasks/{id}/resume`) | `tasks/handlersCore.ts` |
| `tasks/router.py` (`/daily/*` … `/ai/smart-schedule`) | `tasks/handlersPlanning.ts` |
| `quick/router.py`, `projects/router.py`, `goals/router.py` | `<module>/handlers.ts` |
| `pareto/router.py` | `pareto/handlers.ts` (mounted at `/pareto`, not `/todo`) |
| `import_data/router.py` | `importData/handlers.ts` |
| `modules/common/ai`, `modules/auth/dependencies.py` | `_shared.ts` |

## Contracts

**db.ts functions** (signatures were generated from the Python ones):
- name: snake_case → camelCase (`create_task` → `createTask`);
- params without a default stay positional, in Python order;
- params **with** a default go in one trailing `opts` object with the Python snake_case keys
  (`createTask(userId, title, { parent_id, priority })` ≙ `create_task(user_id, title, parent_id=..., priority=...)`);
- `**fields` → a positional `fields: Row`;
- return the same dict shapes Python returns (the frontend reads these keys).
- Synchronous, and use `withTodoDb` (re-entrant: nested db calls share one connection).

**Handlers** are entries in a module's `routes: TodoRoute[]`:
`{ method, path: '/tasks/:task_id/notes', handler: async (ctx) => ..., status? }`.
- Return a plain object/array (sent as JSON) or a `Response` (e.g. plain text).
- `throw new HttpError(status, detail)` wherever Python raises `HTTPException` — same status, same `detail` text.
- Missing required body fields → `HttpError(422, ...)` (Pydantic validation).
- `ctx.intParam('task_id')` for int path params; `ctx.json()` for the body; `ctx.query` for query strings.
- AI requests: `aiSettings(body)` (or `aiSettings(ctx.query)` for GET) → `callAi(prompt, settings)`;
  prompts are copied verbatim from Python so both backends answer alike.
- Auth (401/403 for missing token / unapproved account) is done by the dispatcher for every route.

## Known, intentional differences from FastAPI

- 422 validation errors return `{ "detail": "<one readable message>" }` instead of Pydantic's
  list of error objects (the frontend shows `detail` to the user).
- `/tasks/:task_id/resume` returns the whole briefing as one text body rather than streaming it.
