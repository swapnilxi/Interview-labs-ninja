# Lab-Ninja — LinkedIn Post Generator & Platform TODO

Tracks what's been implemented (with file references) and what's still worth
doing, organized by feature area. Checkboxes marked `[x]` are done and
verified end-to-end (browser + API); `[ ]` are proposed next steps, not yet
started.

---

## ✅ Implemented

### 1. LinkedIn Post Generator — Navigation & Structure

- [x] Replaced the side-drawer "Manage Template Library" pattern with a real
  page-level tab switcher: **Generate** / **Templates**, with a live count
  badge on the Templates tab.
  `frontend/src/modules/linkedin-post-generator/LinkedInPostGeneratorModule.tsx`
- [x] Deleted the now-unused `Drawer.tsx` component (was only used by this
  feature).
- [x] Added a gradient "hero" banner to the page header, matching the visual
  style already used by CV Lab / DSA Lab / System Design (`.lab-hero` +
  radial gradient wash + blurred orb + gradient icon badge), reusing the
  violet → primary accent already present in this feature's button/avatar.
  `frontend/src/app/linkedin-post-generator/page.tsx`

### 2. LinkedIn Post Generator — Templates Tab

- [x] Curated **Inspiration** library: 9 example high-performing LinkedIn
  posts across categories (Personal Story, Contrarian Take, Career
  Milestone, Lessons Learned, Listicle/Framework, Case Study, Thought
  Leadership, Achievement), each with a "why it works" breakdown, tags, and
  a suggested template type.
  `frontend/src/modules/linkedin-post-generator/inspirationPosts.ts`
- [x] Merged "My Templates" and "Inspiration" into a **single unified list**
  (no more sub-tab switcher) — sortable/filterable together, with
  color-coded chips: blue **Mine** vs amber **Inspiration**.
- [x] One-click "Save as My Template" from any inspiration post, prefilling
  title/tags/type into an editable "Save as Template" form.
- [x] Usability upgrades to the template list: copy-to-clipboard button per
  item, always-visible content preview snippet (no need to expand first),
  empty-state CTA.
- [x] **Category sub-tab**, reusing the same shared category system already
  used by the Generate tab (`GET/POST/DELETE /linkedin/categories`) —
  rendered as a filterable pill row with an inline "Manage" panel
  (add/delete), plus a category field on the New Template form, the edit
  form, and the Save-as-Template form.
  - Backend: `category` column added to `linkedin_templates`
    (`backend/modules/linkedin_post_generator/schema.py` migration,
    `store.py` fetch/save/update + new filter param, `router.py` Pydantic
    models + query param).
  - Frontend: `linkedinService.ts` types/params,
    `TemplateLibraryModule.tsx` UI.
- `frontend/src/modules/linkedin-post-generator/TemplateLibraryModule.tsx`

### 3. LinkedIn Post Generator — Generate Tab UX

- [x] **Edit / Preview toggle** on the generated post — Preview renders it as
  an actual LinkedIn-style card (avatar, name, like/comment/repost/send
  row).
- [x] **Character counter + length guidance** (flags too-short / too-long /
  "ideal engagement range" ~1300–2000 chars).
- [x] **Undo** (up to 10 steps) — Regenerate / Refine / Generate Alternative
  no longer destroy the previous draft irreversibly.
- [x] Loading skeleton while generating, and a save-confirmation flash
  instead of a silent save.
- `frontend/src/modules/linkedin-post-generator/LinkedInPostGeneratorModule.tsx`

### 4. Settings / Config — Ollama Model Selection

- [x] New backend endpoint `GET /settings/ollama-models` — queries the local
  Ollama instance's `/api/tags` and returns the list of pulled models.
  `backend/modules/daily_session/daily_session.py`
- [x] Main **Text Generation Model** / **Answer Evaluation Model** dropdowns
  now list each locally-pulled Ollama model as its own selectable option
  (`ollama::<model>`), instead of a single generic "Ollama — use configured
  model" entry. Fetched proactively on page load, not gated behind first
  selecting Ollama.
- [x] Fixed a real bug found along the way: settings defaulted to
  `ollamaModel: "llama3.2"`, which wasn't actually pulled — every
  Ollama-routed generation was silently 404ing.
- [x] Fixed a second bug: the model picker was originally built with an HTML
  `<datalist>`, which Safari renders unreliably (no visible suggestions).
  Replaced with a real `<select>` dropdown (with a "type manually" fallback
  option) that works identically across browsers.
  `frontend/src/modules/config/ConfigModule.tsx`,
  `frontend/src/lib/services/settingsService.ts`

### 5. Header / Navigation

- [x] Removed **Progress** and **Question Bank** from the top header nav —
  kept in the sidebar (hamburger) menu only.
  `frontend/src/modules/common/Header.tsx`
- [x] API/DB status indicator condensed from two separate pills into a
  single compact chip (API on top, DB below), colored dot placed before the
  label text, with a hover tooltip for the full status.

---

## 🔜 Suggested Improvements

### Templates & Categories

- [ ] **Multi-category tagging** — templates currently support one category;
  consider allowing multiple (e.g. "Career" + "Leadership") the same way
  tags already work.
- [ ] **Faceted/combined filtering UI** — type tab + category tab + search +
  favorites-only are all independent right now; a single filter bar showing
  active filters as removable chips would scale better as the library
  grows.
- [ ] **Bulk actions** — multi-select templates for bulk delete/duplicate/
  re-tag/re-categorize.
- [ ] **Pagination or virtualization** for the template list once a user has
  saved dozens of templates (currently renders the full unfiltered list).
- [ ] **Inspiration library growth** — the 9 curated posts are static
  (hardcoded in `inspirationPosts.ts`). Consider making this data-driven
  (DB-backed or a small admin/CMS flow) so it can grow over time without a
  code change, and so categories can be curated centrally rather than
  loosely overlapping with the app's shared category list.
- [ ] **Template usage analytics** — track which templates/inspiration posts
  actually get selected in successful generations, to surface "your most
  effective templates" instead of pure recency/favorite ordering.
- [ ] **Template versioning** — editing a template overwrites it with no
  history; a lightweight version log (like the Undo stack in Generate)
  would help.

### Generate Tab

- [ ] **A/B comparison view** — right now Regenerate/Alternative replace the
  current draft one-at-a-time (with Undo as the only way back). A
  side-by-side comparison of 2–3 generated variants would be more useful
  for picking a winner.
- [ ] **Media/image support** — LinkedIn posts often include images; the
  generator is text-only today.
  [ ] **Publishing/scheduling integration** — currently the flow ends at
  "copy the text"; a direct LinkedIn API integration (or export to a
  scheduler) would close the loop.
- [ ] **Streaming generation** — long generations currently show a static
  skeleton rather than streaming tokens in as they arrive.
- [ ] **Smarter length guidance** — the ideal-length heuristic is a fixed
  1300–2000 char band; could be tuned per post type (e.g. listicles read
  differently than short story posts).

### Settings / Providers

- [ ] **Per-feature model overrides** — one global `textGenerationModel` /
  `answerModel` pair currently drives every feature (Daily Session, CV Lab,
  LinkedIn generator, etc.). Some users may want different models per
  feature.
- [ ] **"Test connection" button** per provider (Gemini/DeepSeek/Groq/
  OpenAI/Anthropic/Ollama) to validate an API key or reachability before
  saving, rather than discovering failures at generation time.
- [ ] **Live connection status for Ollama** — the model list is fetched once
  per page load; a small "reachable ✓ / unreachable ✗" indicator that
  updates on the same cadence as the API/DB header chip would be more
  informative.
- [ ] **Usage/cost tracking** across providers, especially useful once
  multiple paid providers are configured side by side.

### Navigation

- [ ] **Single source of truth for nav links** — `Header.tsx`
  (`navigationItems` array) and `Sidebar.tsx` (hardcoded `<Link>` blocks)
  currently maintain two separate lists by hand; worth consolidating into
  one shared config to avoid them drifting out of sync again.
- [ ] **Breadcrumbs** for nested pages (e.g. Templates → a specific
  template) once the template library grows past a flat list.

### Testing & Ops

- [ ] **Automated test coverage** — all verification this session was done
  via ad hoc Playwright scripts run manually against the dev servers;
  none of that is committed as a real test suite. Worth adding actual
  Playwright/unit tests for: the unified Templates list (filter
  combinations), the Ollama model dropdown (reachable/unreachable/no
  models), and the Generate tab's Undo stack.
- [ ] **Theme audit** — new components (gradient hero, preview card, status
  chip, category pills) have been checked in light mode during this
  session; a deliberate dark-mode pass would catch any contrast issues.
