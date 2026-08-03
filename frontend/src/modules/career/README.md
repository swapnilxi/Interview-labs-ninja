# Career Studio (frontend feature)

Self-contained "AI Career Studio" feature. Milestone 1 = the **resume vertical slice**: a
two-panel resume builder with autosave, immutable versioning, an AI analyzer, inline AI section
rewrite, an AI copilot, and PDF/DOCX/text import.

## Where things live

```
src/app/career/                     # Next.js App Router pages (thin server wrappers)
  page.tsx                          #   /career            → dashboard (CareerModule)
  resume/page.tsx                   #   /career/resume     → builder start screen
  resume/[masterId]/page.tsx        #   /career/resume/:id → builder

src/modules/career/                 # all client components
  CareerModule.tsx                  # dashboard: list/create/delete resumes
  ResumeBuilder.tsx                 # orchestrator: toolbar + editor + preview + copilot + drawers
  ResumeEditor.tsx / SectionManager / SectionBlock / sectionEditors.tsx
  ResumePreview.tsx                 # live paper-style preview
  VersionTimeline.tsx               # checkpoint history (restore/clone/branch)
  AnalysisPanel.tsx                 # AI analyzer report
  ImportDialog.tsx                  # upload → AI-structure → diff → apply
  CareerCopilot.tsx                 # AI copilot (reuses the lab copilot shell)
  StreamingText.tsx                 # token-by-token stream renderer
  store/resumeStore.ts              # Zustand: draft, autosave, undo/redo, versioning actions
  types.ts

src/lib/services/careerService.ts   # typed client over /career/* (reuses apiFetch + AI settings)
```

## Data flow

- **Server data**: `careerService` wraps the shared `apiFetch`/`apiJson` (auto-attaches the JWT).
  AI calls spread `defaultAIRequestFields()` from `settingsService` (keys from localStorage,
  per-request, never stored server-side).
- **Client/draft state**: `useResumeStore` (Zustand). Editing a section updates local state
  optimistically and schedules a debounced (1.5 s) PATCH — the toolbar shows `Saving… / Saved ✓`.
- **Versioning**: `⌘S` (or the Save-version button) snapshots the draft into an **immutable**
  checkpoint. `VersionTimeline` restores/clones/branches those.
- **Reuse**: theme via Tailwind semantic tokens (`bg-card`, `text-foreground`, `border-border`),
  icons via `@/components/ui/AppIcon` (Heroicons v2), copilot via the labs' copilot shell.

## How to add …

- **a section type** → add an entry to `SECTION_LIBRARY` in `types.ts`; add a placeholder in
  `SectionBlock.tsx` (`ITEM_PLACEHOLDERS`); if it needs a bespoke editor, add one in
  `sectionEditors.tsx` and branch on it in `SectionBlock.renderEditor()`. The preview handles the
  generic `items` / `groups` / `text` shapes automatically.
- **an AI action** → add a method to `careerService.ts` (POST body includes
  `...defaultAIRequestFields()`), a backend endpoint in `career_studio/analysis_router.py`, and a
  prompt in `career_studio/prompt_builder.py`.

See `backend/modules/career_studio/ARCHITECTURE_NOTES.md` for the backend + the lift-and-shift guide.
