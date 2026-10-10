# AI Bootcamp — categorized plan

Source material: `AI-Bootcamp-reference/` (a full standalone Next.js app, **read-only, never
edited** — confirmed via its own `todo.md`/`docs/TODO.md` that it's a fully-migrated rebrand of
a former astrology-consultation platform; "Instructors/Labs/Practice/Courses/Projects" are real,
intentional AI-Bootcamp product concepts there, not leftover cruft — but it still carries its own
NextAuth + Prisma + Stripe + cron backend, none of which fits this app).

Hard rule carried through every phase below: **lesson/project generation, HTML authoring, and the
class-folder DB sync stay exactly as the current app's** (`backend/modules/ai_lms/*`,
`SubjectDetailModule`/`ProjectDetailModule`/`LessonViewer`, `class_folders.py`). Everything in this
plan is a new visual layer + new common features sitting on top of that, never a replacement for it.
`classes/ai-bootcamp/` already has real synced content (2 subjects + 2 projects, see `class.json`) —
must keep working throughout.

## Scope decisions (confirmed with user, 2026-10-09)

- **OUT entirely:** the reference's own auth (NextAuth/bcrypt), Prisma/Postgres, Stripe payments,
  cron email reminders, WhatsApp/nodemailer, and its 5-tier role dashboards
  (user/subscriber/instructor/admin/super-admin). Labs-ninja has its own JWT auth and its own
  `user < editor < admin < superadmin` roles — not reusing a second, incompatible one.
- **IN, beyond the original ask:** events listing, blog, and mentor booking (scheduling only —
  **no real payments**, since labs-ninja has no monetization concept).
- **Booking and Blog are ai-lms-common, not ai-bootcamp-only** (user correction, 2026-10-09) —
  reachable from any class, not just this one.
- **Events placement: inferred common, not confirmed explicitly** — grouped with booking/blog
  since it's the same kind of account-wide feature rather than bootcamp-specific content. Flag
  here in case that's wrong; easy to move later since it's a self-contained new module either way.
- **fe-apis (nextjs-api/Vercel) parity: deliberately skipped for all new features below**, same as
  most other modules (`ai_todo`, `career_studio`, the interview labs — see CLAUDE.md "Dual
  deployment modes"). FastAPI-only (`backend/modules/ai_lms/*`) until/unless asked otherwise.

## Where new code lives

- **ai-bootcamp-only React module code:** `frontend/src/modules/ai-lms/classes/ai-bootcamp/_bootcamp/`
  — underscore-prefixed, confirmed safe: `class_folders.py`'s sync only ever touches paths listed
  in that class's `class.json` manifest (`_remove_stale`/`_prune` both iterate the manifest, never
  the real directory tree), and `_`/`.`-prefixed top-level folder names are already this codebase's
  own "not a synced class" convention (`_remove_deleted_classes` skips them by name). A brand new
  folder here is simply invisible to the sync — never read, written, or deleted by it.
- **New Next.js routes:** `frontend/src/app/ai-lms/classes/ai-bootcamp/**` — a literal/static
  sibling of the existing dynamic `frontend/src/app/ai-lms/classes/[classSlug]/**` tree. Next.js
  prefers the literal segment for every path under it, so `/ai-lms/classes/ai-bootcamp` and
  everything below it now resolves here; every *other* class keeps using the generic dynamic pages
  completely untouched. A `layout.tsx` at this level supplies the bootcamp header/footer/theme
  wrapper to every nested page. Nested pages are thin wrappers (like the existing ones) rendering
  the same underlying modules (`SubjectDetailModule`, `LessonViewerModule`, etc.) — reskinned, not
  reimplemented.
- **ai-lms-common additions:** `frontend/src/modules/ai-lms/components/` (shared card/theme
  primitives), new `frontend/src/modules/ai-lms/instructors/`, `.../preferences/`, `.../blog/`,
  `.../booking/` modules + matching `frontend/src/app/ai-lms/{instructors,preferences,blog,book,events,my-bookings}/**`
  routes (reachable regardless of which class you're in) + new backend files alongside
  `backend/modules/ai_lms/router.py`/`db.py` (new `instructors.py`/`blog.py`/`booking.py`/`events.py`,
  same idiom: `PRAGMA table_info` + `ALTER TABLE` in each one's own `register(cursor)`).
- **Build safety (done):** `frontend/tsconfig.json` and `.eslintrc.json` now exclude
  `src/modules/ai-lms/classes/*/AI-Bootcamp-reference` — without this, `tsc`/`next lint` would
  walk the entire foreign app (whose `next-auth`/`@prisma/client`/`stripe` imports aren't even
  installed here) on every type-check/build. Verified `npm run type-check` passes clean after the
  fix.

## Dependencies

Already present in `frontend/package.json` and reused as-is: `gsap`, `three` (+`@types/three`).
New, to add: `framer-motion` (header/menu/toast/card motion — used too pervasively in the ported
chrome to rewrite in gsap), `lenis` (smooth scroll, small). **Not** adding: `next-auth`,
`@prisma/client`, `stripe`, `bcryptjs`, `nodemailer`, `@anthropic-ai/sdk` (all backend-owned,
labs-ninja equivalents already exist or aren't needed — AI calls route through
`backend/modules/common/ai/` per CLAUDE.md, never a provider SDK directly).

---

## Bucket 1 — ai-bootcamp only

- [ ] **Theme tokens, scoped.** Port `tokens.css`/`cards.css`/`effects.css`/`animations.css`/
      `pills.css`/`scenes.css`/`reduced-motion.css` (+ the missing `base.css` the agent flagged),
      adapted palette, all selectors scoped under one wrapper class (e.g. `.ab-theme`) applied by
      the new `classes/ai-bootcamp/layout.tsx` — must never leak into the rest of the app (other
      classes, `/todo`, `/career`, etc.). Reference's glow-rim trick (`@property` + masked `::after`
      stacked gradients) is the core visual recipe; reference's literal orange/gold palette is
      replaceable.
- [ ] **Header + footer + nav, bootcamp-scoped.** Port `EditorialHeader`/`DesktopNav`/`MobileMenu`/
      `AccountMenu`/`MenuToggle`/`useHeaderScroll`/`nav-config` and `EditorialFooter`/`footer-links`,
      rewired onto the main app's real auth (`AuthContext`/`tokenStore`, not `next-auth`
      `useSession`/`signOut`) and real nav targets (this class's subjects/projects, Labs, Practice,
      Paths, + links out to the common Instructors/Blog/Book/Preferences pages). Applies only inside
      `classes/ai-bootcamp/layout.tsx`, not globally.
- [ ] **Landing page**, real React page (not the static `landingpage.html` mechanism — can't host
      framer-motion/three.js/gsap inside a hand-editable static HTML file). Section order from the
      reference home page, content rewritten for this class, wired to real data (subject/project/
      lesson counts via `lmsService`) instead of Prisma: Hero (with `HeroNeuralNetwork`/
      `HeroSphereClient`/`HeroNetworkFallback` three-scene — already AI-themed, not astrology —
      reuse, skip `OrbitField` which is still literal zodiac-wheel art) → CredentialMarquee →
      ServicesSection-equivalent (what this bootcamp teaches) → ProcessSection/ProcessScene (how it
      works — biggest single porting effort, pinned-scroll GSAP choreography) → LineageSection
      (program lineage/why-trust-this) → TestimonialsSection → FaqSection. The existing
      `landingpage.html`/`class.json` sync keeps running untouched underneath (still the data of
      record + still exportable as a static site) — this new page just becomes what the app
      actually routes to for this one class.
- [ ] **Courses (Subjects) list + detail, visual reskin only.** Reference's course-catalog-card-grid
      and course-detail (hero/meta-bar → numbered lesson outline with status icons → gated-materials
      card) layout pattern, stripped of all enrollment/password/Stripe gating, wired to real
      `lmsService` subject/lesson data. Underlying data/nav logic stays `SubjectDetailModule`'s.
- [ ] **Projects list + detail, visual reskin only.** Reference's tiered catalogue (by difficulty)
      + project-overview (`ModuleStepper` + module-card-grid + "the problem" prose) + per-module
      page pattern, adapted so the stepper is driven by this project's real `project_plan` outline
      (module/sublesson) instead of reference's hardcoded global 6-stage array. Underlying data/
      generation logic stays `ProjectDetailModule`'s.
- [ ] **Labs page**, built on real lesson/project content: port `LabBench` (parameter-driven form +
      step checklist, 100% client-side, no backend needed) as an optional interactive panel
      attachable to a lesson or project step — this is the one genuinely reusable, low-effort piece
      of reference's "Labs" feature. Catalog page = reference's `CatalogueCard` grid pattern.
- [ ] **Practice page — larger, later item.** Reference's `PracticeRunner`/`SkillGraph` are a real
      MCQ-drill-with-mastery-tracking engine, hard-wired to its own `PracticeQuestion`/`Skill`/
      `UserSkill` schema. Porting the UI is cheap; porting the *feature* means designing an
      equivalent schema+endpoints from scratch (ai_lms has nothing like it today — note labs-ninja's
      *other* labs (CV/DSA/System-Design) have an unrelated Question-Bank system, not reusable here
      without its own integration work). Scope as its own follow-up, not bundled into the initial
      push.
- [ ] **Paths page** (learning-path/roadmap view across this class's own subjects/projects) —
      reference's `/paths` pattern, bootcamp-specific content.
- [ ] Port `primitives.tsx` (`PageHeader`/`CatalogueCard`/`DifficultyPill`/`MetaPill`/`ProgressBar`/
      `StatTile`/`EmptyState`) and the `Icon.tsx` AI/learning icon vocabulary first — nearly every
      page above is built out of these two files.

## Bucket 2 — ai-lms common (all classes)

- [ ] **Glow/gradient theme + card style — finish what's already in flight.** `accent_color` is
      already on `lms_classes`/`lms_subjects` end-to-end (db.py/router.py/types.ts), with
      `ColorPickerInput.tsx` wired into all four create/edit modals and `color-mix()`-based styling
      already on `ClassCard`/`SubjectCard`/`ClassDetailModule`/`SubjectDetailModule`. Remaining work:
      adapt reference's glow-rim/hover-lift/corner-gradient-bar *visual recipe* onto this **existing
      per-entity mechanism** — reference's own `[data-accent]` system is a different, global
      single-theme-switch architecture (per research) and is *not* what we want here; don't adopt
      its architecture, only its look.
- [ ] **Instructor management** (new). Backend: `lms_instructors` table (name, slug, avatar_url,
      bio, specialties, `ai_chat_enabled`, `ai_system_prompt`, `ai_greeting`, `ai_sample_questions`)
      + CRUD gated like other LMS writes (`_require_editor_for_writes`). Frontend: directory +
      detail page at `/ai-lms/instructors`, admin management panel (reference's `AdminMentors.tsx`
      layout: status/search row + row-list + actions — minus the approval-workflow/role-promotion
      business logic, since there's no public "apply to be an instructor" flow planned here, just
      editor/admin-authored profiles). Optional AI persona chat **must** go through
      `backend/modules/common/ai/client.py` (`call_ai_text`/`stream_ai_text`), never a direct
      provider SDK call like reference's own `lib/ai/*` — keeps it inside the existing
      multi-provider/fallback/API-key-in-request architecture.
- [ ] **Profile preference management** (new). Appearance preferences page (reference's
      `AppearanceSettingsForm` card layout is a good visual reference), client-side only
      (`localStorage`, consistent with CLAUDE.md's "never persist API keys/settings server-side"
      rule and with how `settingsService.ts` already works) — **not** a duplicate of the existing
      global Config page, scoped to ai-lms learning preferences (e.g. default accent, maybe default
      AI model shortcut). Confirm exact field list before building the backend half, if any turns
      out to need one.
- [ ] **Blog** (new, user correction: common not bootcamp-only). `lms_blog_posts` table
      (title/slug/excerpt/body/cover_image/author/published/published_at), editor/admin-authored,
      public list+detail at `/ai-lms/blog`. Reference's blog pages exist but weren't deep-read this
      pass (out of the two research agents' scope) — re-check `(marketing)/blog/**` +
      `api/blog/**` layout before building the frontend.
- [ ] **Booking** (new, user correction: common not bootcamp-only; **scheduling only, no
      payments**). `lms_instructor_availability` (instructor_id, starts_at, ends_at) +
      `lms_bookings` (instructor_id, slot ref, user_id, status pending/confirmed/cancelled, notes) —
      no price/Stripe fields at all. Frontend: reference's 3-step booking wizard UX
      (service→slot→details, minus service/price) at `/ai-lms/book`, plus `/ai-lms/my-bookings`.
      Reference's double-booking-race fix (`assertSlotStillFree()` inside a transaction) is worth
      copying as a pattern regardless of ORM.
- [ ] **Events** (new, placement inferred — see note above). `lms_events` table
      (title/slug/description/starts_at/ends_at/location/link_url) + optional interest/RSVP table,
      editor/admin-authored, public list+detail at `/ai-lms/events`.
- [ ] Common nav: surface Instructors/Blog/Book/Events/Preferences links somewhere reachable from
      the plain `/ai-lms` home and from every class, not just bootcamp's reskinned header — exact
      placement (ai-lms home page section vs. a persistent sub-nav) TBD when this phase starts.

## Explicitly excluded (reference features with no equivalent here, not being built)

NextAuth/credentials auth, Prisma/Postgres, Stripe checkout + subscription billing, cron email
reminders, WhatsApp Business API, 5-tier role dashboards (user/subscriber/instructor/admin/super-
admin — labs-ninja keeps its own 4-tier `user/editor/admin/superadmin`), password-protected
"secret circle" classes, natal-chart/astrology-era features (already dead in the reference itself).

---

## Phased implementation order

- [x] **Phase 0a — build safety.** Exclude `AI-Bootcamp-reference/` from `tsconfig.json` +
      `.eslintrc.json`; verified `npm run type-check` clean.
- [x] **Phase 0b — shared foundation.** Done, in `frontend/src/modules/ai-lms/ui/`:
      `framer-motion`+`lenis` added as deps (gsap/three were already present, reused as-is);
      `ab-theme.css` (scoped tokens/card-glow/reveal/pill system under `.ab-theme`, dark-only —
      the reference's light-mode token swap and `[data-accent]` global switcher were deliberately
      not ported, see the file's header comment); new `ab-*`-prefixed Tailwind color/font/radius
      tokens in `tailwind.config.js` (checked for collisions first — `fontFamily.heading` and the
      built-in `black`/`orange` palette were already taken, hence the prefix); `Icon.tsx` (as
      `AbIcon`), `primitives.tsx`, `Button`/`Modal`/`Toast`/`Avatar`/`SectionHeading`/`Skeleton`/
      `AccordionFAQ`/`RouteFallback` (as `Ab*`). Toast/RouteFallback use the app's existing
      `@/components/ui/AppIcon` instead of adding `lucide-react`. `Modal`'s scroll-lock is
      body-overflow-only for now (reference also pauses Lenis via `SmoothScrollProvider`, not
      ported yet — Phase 5). `Avatar` drops reference's hardcoded per-name illustration branch.
      Verified `npm run type-check` and `next lint` clean.
- [ ] **Phase 1 — ai-lms common backend + pages.** Finish accent/glow card theme; Instructors
      (backend+directory+detail+admin panel); Profile preferences; Blog; Booking; Events. (Largest
      phase — each is close to a small CRUD feature of its own.)
- [ ] **Phase 2 — ai-bootcamp shell.** Static route tree under `classes/ai-bootcamp/`, scoped
      `layout.tsx` (header/footer/theme wrapper), new landing page wired to real class data.
- [ ] **Phase 3 — ai-bootcamp courses/projects reskin**, reusing existing Subject/Project data and
      generation logic untouched.
- [ ] **Phase 4 — ai-bootcamp Labs (LabBench) + Practice (scoped down or deferred) + Paths.**
- [ ] **Phase 5 — polish.** Motion/parallax/reveal effects, any of the "nice to have, later" pieces
      (`StarJourney`, a non-astrology hero variant beyond the already-AI-themed neural network).

Keep checking items off here as work lands — this file is the living plan, not a one-time snapshot.
