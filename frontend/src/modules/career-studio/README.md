# Career Studio (frontend feature)

Self-contained "AI Career Studio" feature — resume/profile builder, portfolio builder,
Template Designer, cover letters, job matching, and public sharing. As of 2026-08, the
module is organized into one folder per feature vertical (mirrors the backend's
`backend/modules/career_studio/` layout) instead of one flat folder of ~40 files.

## Where things live

```
src/app/career/                     # Next.js App Router pages (thin server wrappers)
  page.tsx                          #   /career            → tabbed shell (CareerStudioTabs)
  view/[viewId]/page.tsx            #   /career/view/…     → resume/portfolio view editor (ViewEditor)
src/app/p/[slug]/**, src/app/r/[slug]/**   #   /p/{slug}, /r/{slug} → public portfolio/resume pages

src/modules/career-studio/
  shared/                # types.ts, activeProfileStore.ts, exportUtils.ts, ErrorBanner.tsx,
                          #   StreamingText.tsx, portfolioTemplates.ts (ACCENT_HEX + initials()
                          #   only — the old portfolioTemplateCss() switch moved into
                          #   portfolio/templates/, see below)
  profile/               # ProfileEditor(Modal), ProfileSelector, ProfileMetadataPanel,
                          #   ProfileImportDialog, ProfileEnrichDialog, CreateProfileWizard,
                          #   profileEditorStore.ts
  resume/                # ResumeEditor, SectionManager, SectionBlock, sectionEditors.tsx,
                          #   ResumePreview, VersionTimeline, AnalyzerPanel, AnalysisPanel,
                          #   store/resumeStore.ts
    templates/           #   one self-contained data module per built-in resume template
                          #   (classic/, modern/, compact/, elegant/, executive/,
                          #   minimalist/, technical/) — each exports { id, name, desc };
                          #   index.ts's LIST/REGISTRY replaces what used to be two
                          #   independently hand-maintained copies of the same array
                          #   (views/ViewEditor.tsx and views/CareerStudioTabs.tsx).
                          #   Resumes are styled via a continuous knob system (font/
                          #   density/headerStyle/heading rules), not discrete per-
                          #   template markup, so unlike portfolio/templates/ below,
                          #   these are metadata modules, not rendering components —
                          #   the actual CSS-from-spec logic stays one shared function
                          #   in templates-designer/templatePreview.ts (mirrors the
                          #   backend's resume_css_from_spec).
  portfolio/              # PortfolioWidgetsView (delegates to the template registry),
                          #   Modern3DView, WidgetBlock, WidgetPalette, widgetEditors.tsx,
                          #   store/portfolioStore.ts
    templates/            #   one self-contained COMPONENT per built-in portfolio template
                          #   (minimal/, modern/, linkx/, isometric/, aurora/, blueprint/,
                          #   dots/, mesh/, carbon/) — each owns its own CSS (a `css(accentHex)`
                          #   export) and a default React component rendering the full page
                          #   shell + widget list. `shared.tsx` holds the genuinely-common
                          #   bits (the widget-content renderers, base CSS, page shell) so
                          #   they aren't duplicated nine times; `index.ts`'s REGISTRY/
                          #   getTemplate()/getCss() replace what used to be one big
                          #   portfolioTemplateCss() switch statement. `modern3d` is
                          #   deliberately absent from the registry — it bypasses this
                          #   whole system via Modern3DView (a live Three.js/GSAP page),
                          #   handled directly in PortfolioWidgetsView.
  cover-letter/            # CoverLetterPanel.tsx
  job-match/               # JobMatchPanel.tsx, GapAnalysisResult.tsx
  templates-designer/      # TemplateDesigner.tsx (the visual knob editor), TemplatePreviewThumb.tsx
                          #   (gallery cards), templatePreview.ts (client-side mirror of
                          #   render.py's HTML for the live iframe preview) — the Template
                          #   Designer & Manager feature (user-authored/duplicated templates);
                          #   a different concept from resume/portfolio's templates/ folders
                          #   above (those are built-in render implementations, this is the
                          #   user-facing CRUD + knob-editing UI)
  views/                   # CareerStudioTabs.tsx (home shell), ViewEditor.tsx, ViewTailorPanel.tsx,
                          #   CareerCopilot.tsx — the cross-vertical integration/shell layer
  public/                  # PublicPortfolioClient.tsx, PublicResumeClient.tsx

src/lib/services/careerService.ts     # typed client over /career/* (reuses apiFetch + AI settings)
src/lib/services/viewsService.ts      # typed client over /career/views/* (CRUD, export/publish, AI analyze + tailor/apply)
src/lib/services/templatesService.ts  # typed client over /career/templates/* (user-designed template CRUD + duplicate)
src/lib/services/portfolioService.ts  # typed client over /career/portfolios/*
src/lib/services/coverLetterService.ts # typed client for cover-letter generation + versions
```

Only `types.ts` and four "entry" components (`views/CareerStudioTabs.tsx`, `views/ViewEditor.tsx`,
`public/PublicPortfolioClient.tsx`, `public/PublicResumeClient.tsx`) are imported from outside this
module (by the 6 App Router pages above and the 5 `lib/services/*.ts` files) — everything else moves
freely within the module without touching external code, as long as those paths stay stable.

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

- **a section type** → add an entry to `SECTION_LIBRARY` in `shared/types.ts`; add a placeholder in
  `resume/SectionBlock.tsx` (`ITEM_PLACEHOLDERS`); if it needs a bespoke editor, add one in
  `resume/sectionEditors.tsx` and branch on it in `SectionBlock.renderEditor()`. The preview handles the
  generic `items` / `groups` / `text` shapes automatically.
- **an AI action** → add a method to `lib/services/careerService.ts` (POST body includes
  `...defaultAIRequestFields()`), a backend endpoint in `career_studio/analysis/router.py`, and a
  prompt in `career_studio/shared/prompt_builder.py`.
- **a built-in portfolio template** → add a new folder under `portfolio/templates/<id>/` exporting
  a `css(accentHex)` function and a default component built on `PortfolioTemplateShell` (see any
  existing template for the pattern), then register it in `portfolio/templates/index.ts`'s
  `REGISTRY`/`CSS_REGISTRY`. Add the matching backend module under
  `backend/modules/career_studio/portfolio/templates/` so export/PDF gets the same look.
- **a built-in resume template** → add a new folder under `resume/templates/<id>/` exporting
  `TEMPLATE = { id, name, desc }`, then register it in `resume/templates/index.ts`'s `LIST`. Add the
  matching backend module under `backend/modules/career_studio/resume/templates/`.

See `backend/modules/career_studio/ARCHITECTURE_NOTES.md` for the backend + the lift-and-shift guide.
