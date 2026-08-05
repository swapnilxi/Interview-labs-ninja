# Career Studio (frontend feature)

Self-contained "AI Career Studio" feature. Milestone 1 = the **resume vertical slice**: a
two-panel resume builder with autosave, immutable versioning, an AI analyzer, inline AI section
rewrite, an AI copilot, and PDF/DOCX/text import.

## Where things live

```
src/app/career/                     # Next.js App Router pages (thin server wrappers)
  page.tsx                          #   /career            → tabbed shell (CareerStudioTabs: Profiles·Resumes·Portfolios·Templates)
  view/[viewId]/page.tsx            #   /career/view/…     → resume/portfolio view editor (ViewEditor)

  # There used to be a second, parallel "standalone resume/portfolio" flow
  # (resume/, portfolio/ routes + ResumeBuilder.tsx/PortfolioBuilder.tsx et al.,
  # operating on a resume_master row directly, with no profile concept). It was
  # unreachable from any nav link and removed outright — profiles + views are
  # the only resume/portfolio model now. Cloning/branching a version correctly
  # produces another profile (not a resurrected standalone resume) — see
  # versions.py's clone_version.
  #
  # The Profile Editor ALSO has no route of its own — it renders as a
  # full-screen MODAL (see profileEditorStore.ts / ProfileEditorModal.tsx), so
  # it can open from anywhere (Profiles tab, ViewEditor's "Edit data" link,
  # ProfileSelector's pencil icon, a version's Clone/Branch) without leaving
  # whatever page you were on.

src/modules/career/                 # all client components
  CareerStudioTabs.tsx              # tabbed home: Profiles·Resumes·Portfolios·Templates + create-view modal
  ProfileEditor.tsx                 # Master Profile editor MODAL (reuses ResumeEditor/ResumePreview/resumeStore); toolbar has Import + Enrich + Version history + Undo/Redo + Copilot
  profileEditorStore.ts             # plain store (mirrors activeProfileStore.ts) driving the Profile Editor modal's open/close/which-profile state
  ProfileEditorModal.tsx            # thin host: subscribes to profileEditorStore, renders <ProfileEditor/> when open; mount once per page that can trigger it
  ProfileEnrichDialog.tsx           # merge ANOTHER document into an existing profile — AI classifies additions/duplicates/conflicts before anything is written
  ViewEditor.tsx                    # view editor: profile dropdown + edit-pencil, template, section toggles, iframe preview, export/share; resume views also get AI Analyze + Tailor
  ViewTailorPanel.tsx               # JD-tailor drawer for a resume view; applies as a new tailored profile+view or in place on the shared profile (checkpointed)
  TemplateDesigner.tsx              # Template Designer & Manager editor: visual knobs (font/accent/header/heading/density; portfolio bg) + live iframe preview
  templatePreview.ts                # client-side mirror of render.py that builds the designer's live-preview HTML
  ResumeEditor.tsx / SectionManager / SectionBlock / sectionEditors.tsx
  ResumePreview.tsx                 # live paper-style preview
  VersionTimeline.tsx               # checkpoint history (restore/clone/branch), mounted from ProfileEditor
  AnalysisPanel.tsx                 # AI analyzer report (masterId by default, or injected analyze/getAnalysis fns for the view flow)
  CareerCopilot.tsx                 # AI copilot (reuses the lab copilot shell)
  StreamingText.tsx                 # token-by-token stream renderer
  store/resumeStore.ts              # Zustand: draft, autosave, undo/redo, versioning actions
  types.ts

src/lib/services/careerService.ts   # typed client over /career/* (reuses apiFetch + AI settings)
src/lib/services/viewsService.ts    # typed client over /career/views/* (CRUD, export/publish, AI analyze + tailor/apply)
src/lib/services/templatesService.ts # typed client over /career/templates/* (user-designed template CRUD + duplicate)
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
