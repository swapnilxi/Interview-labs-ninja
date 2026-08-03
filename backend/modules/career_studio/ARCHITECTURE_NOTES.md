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

```
career_studio/
├── schema.py          register(cursor): DDL for resume_master/versions/sections/analysis/ai_runs
├── db.py              get_career_db_path(), init_career_db(), resume + section CRUD (draft)
├── versions.py        immutable snapshots: snapshot / list / get / restore / clone / branch
├── analysis_db.py     resume_analysis + ai_runs persistence
├── ai_runs.py         track_ai_run() context manager (audit every AI call)
├── prompt_builder.py  pure prompt construction (analyzer / rewrite / copilot / import)
├── llm.py             thin wrapper over modules.common.ai_client
├── router.py          /career resume CRUD, sections, versioning, import
└── analysis_router.py /career analyzer, section rewrite (SSE), copilot
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

- `backend/main.py`: import + `include_router(career_router)` + `include_router(career_analysis_router)`;
  and `init_career_db()` in the lifespan (creates the separate DB's tables).
- `frontend/src/modules/common/Sidebar.tsx`: one collapsible menu + submenu (`CAREER_LINKS`).
- New frontend files live under `src/app/career/**` and `src/modules/career/**` + `careerService.ts`.
- **No** change to `common/db.py` (the separate DB owns its own init).

## Env vars

- `CAREER_STUDIO_DB_PATH` — override the sqlite file location (default: inside this folder).
  Reuses the app's `NEXT_PUBLIC_API_URL` on the frontend and the existing JWT auth; no other config.

## Extracting to a standalone service

1. Copy `backend/modules/career_studio/` + `frontend/src/modules/career/` + `careerService.ts`.
2. Replace the two auth imports (`modules.auth.dependencies.get_current_user_id`) and the AI client
   import (`modules.common.ai_client`) with the target app's equivalents — these are the only two
   external couplings, both by interface, not by DB.
3. Point `CAREER_STUDIO_DB_PATH` at the new home; the schema self-creates on boot.
4. Re-add the sidebar entry + the two `main.py` lines in the new host.

## Roadmap (not built in Milestone 1)

Portfolio Studio · Job-Description Matcher · Cover Letters · GitHub/LinkedIn sync · Publishing/hosting
(`/u/{username}`) · Comments · Analytics · Template marketplace · Admin (needs a role system) ·
PDF export (needs WeasyPrint/headless Chrome) · HTML sanitization (needs `bleach`/DOMPurify).
