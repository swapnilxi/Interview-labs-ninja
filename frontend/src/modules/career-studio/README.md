# Career Studio (frontend feature)

Self-contained "AI Career Studio" feature — resume/profile builder, portfolio builder,
Template Designer, cover letters, job matching, and public sharing. As of 2026-08, the
module is organized into one folder per feature vertical (mirrors the backend's
`backend/modules/career_studio/` layout) instead of one flat folder of ~40 files.

## Where things live

```
src/app/career/                     # Next.js App Router pages (thin server wrappers)
  page.tsx                          #   /career            → tabbed shell (CareerStudioTabs)
  view/[viewId]/page.tsx            #   /career/view/…     → resume/portfolio view editor (ViewEditor).
                          #   ViewEditor mirrors the view's `template` field into a
                          #   `?template=<id>` query param (e.g. `?template=modern3d`) so the
                          #   URL alone identifies which template is in use — it self-corrects
                          #   on load/template-switch, so callers don't need to set it when
                          #   navigating here (see the `useEffect` near the top of ViewEditor.tsx).
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
  portfolio/              # PortfolioWidgetsView (delegates to the template registry, plus the
                          #   Modern3D/Visionary special-cases), WidgetBlock, WidgetPalette,
                          #   widgetEditors.tsx, store/portfolioStore.ts
    templates/            #   one self-contained COMPONENT per built-in portfolio template
                          #   (minimal/, linkx/, isometric/, aurora/, blueprint/, dots/, mesh/,
                          #   carbon/) — each owns its own CSS (a `css(accentHex)` export) and a
                          #   default React component rendering the full page shell + widget
                          #   list. `shared.tsx` holds the genuinely-common bits (the
                          #   widget-content renderers, base CSS, page shell) so they aren't
                          #   duplicated eight times; `index.ts`'s REGISTRY/getTemplate()/
                          #   getCss() replace what used to be one big portfolioTemplateCss()
                          #   switch statement. `modern3d/` (Modern3DView.tsx) and `visionary/`
                          #   (VisionaryView.tsx) live in this folder too but are deliberately
                          #   absent from the registry — each is a full live Three.js page
                          #   component (GSAP scroll reveals + custom cursor for Modern3D;
                          #   glass-panel/motion + custom cursor for Visionary), handled
                          #   directly in PortfolioWidgetsView. Both hero names auto-shrink
                          #   (ResizeObserver measuring scrollWidth vs clientWidth, paired with
                          #   a `min-width: 0` fix on their flex container) so any name length
                          #   stays on one line at any viewport width instead of wrapping.
                          #
                          #   Every template folder also has a sibling `prompt.md` — an
                          #   editable design spec in plain English (concept, palette, sections,
                          #   what's deliberately excluded). To change a template's look, edit
                          #   its `prompt.md` first, then ask Claude Code to sync the
                          #   implementation to match, rather than hand-editing the component
                          #   directly — keeps the spec and the code from drifting apart.
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
                          #   CareerCopilot.tsx — the cross-vertical integration/shell layer.
                          #   ViewEditor's left Controls panel is collapsible (chevron toggle
                          #   pinned to the panel/preview border) so the live preview can use
                          #   the full width.
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
  `backend/modules/career_studio/portfolio/templates/` so export/PDF gets the same look. Add a
  `prompt.md` alongside it describing the design (see any existing template's for the format).
  If the template needs to be a full live page component instead of a CSS treatment (own Three.js
  scene, own scroll/motion system — see `modern3d/`/`visionary/`), skip the registry entirely and
  special-case it in `PortfolioWidgetsView.tsx` instead, and give it a static CSS fallback in the
  backend registry for PDF/export + the Template Designer's string preview (alias it to `minimal`
  in `templates-designer/templatePreview.ts`'s `cssTemplateId`, matching the existing two).
- **a built-in resume template** → add a new folder under `resume/templates/<id>/` exporting
  `TEMPLATE = { id, name, desc }`, then register it in `resume/templates/index.ts`'s `LIST`. Add the
  matching backend module under `backend/modules/career_studio/resume/templates/`.

See `backend/modules/career_studio/ARCHITECTURE_NOTES.md` for the backend + the lift-and-shift guide.
