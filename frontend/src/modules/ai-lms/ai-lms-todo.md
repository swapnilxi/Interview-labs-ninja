# AI LMS Implementation Todo List

Track progress for building the AI-powered LMS (ByteByteGo / NeetCode / Modern AI SaaS aesthetic).
This checklist is updated dynamically throughout development.

---

## Phase 1: Repository & Architecture Inspection
- [x] Inspect existing frontend structure, routing, Next.js App Router conventions
- [x] Inspect existing backend structure (FastAPI, `backend/main.py`, `api/index.py`, `backend/modules/`)
- [x] Inspect existing database setup (`backend/data/lab_ninja.sqlite3`, `backend/modules/common/db.py`)
- [x] Inspect existing authentication & user resolution (`modules/auth/dependencies.py`, `apiClient.ts`, `tokenStore.ts`)
- [x] Inspect existing AI client infrastructure (`backend/modules/common/ai_client.py`, `settingsService.ts`)
- [x] Inspect existing file upload infrastructure (`pypdf`, `backend/modules/swipe_pdf_reader/`)
- [x] Inspect styling tokens, themes, typography, and UI icon system (`AppIcon`, Tailwind CSS)

---

## Phase 2: Database Schema & Migration & Seed Data
- [x] Create `backend/modules/ai_lms/schema.py` or `db.py`:
  - [x] `lms_classes` table (`id`, `name`, `slug`, `description`, `icon`, `is_system`, `created_at`, `updated_at`)
  - [x] `lms_subjects` table (`id`, `class_id`, `name`, `slug`, `description`, `order_index`, `created_at`, `updated_at`)
  - [x] `lms_lessons` table (`id`, `class_id`, `subject_id` [nullable!], `title`, `slug`, `order_index`, `source_type`, `source_content`, `generated_html`, `summary`, `read_time_minutes`, `created_at`, `updated_at`)
  - [x] `lms_user_progress` table (`id`, `user_id`, `lesson_id`, `completed`, `last_viewed_at`)
  - [x] Create database indexes on foreign keys, slugs, and order indices
- [x] Implement idempotent database seeding:
  - [x] Seed the 8 required initial classes (`Computer Vision`, `DSA Preparation`, `System Design`, `Cloud Code Architect`, `AI`, `Leadership`, `Interview Preparation`, `Other`)
  - [x] Ensure `Other` is marked as system fallback
  - [x] Prevent duplicate insertions on repeated startup/migrations
- [x] Connect `init_lms_db()` in `backend/modules/common/db.py` and `backend/main.py` lifespan

---

## Phase 3: Backend API Layer (FastAPI)
- [x] Create `backend/modules/ai_lms/router.py`:
  - [x] **Classes API**:
    - [x] `GET /api/lms/classes` (list all classes with subject and lesson counts)
    - [x] `POST /api/lms/classes` (create custom class)
    - [x] `GET /api/lms/classes/{class_id_or_slug}` (retrieve class metadata with subjects and lessons)
    - [x] `PATCH /api/lms/classes/{class_id_or_slug}` (update name/description)
    - [x] `DELETE /api/lms/classes/{class_id_or_slug}` (delete class, guard system classes)
  - [x] **Subjects API**:
    - [x] `GET /api/lms/classes/{class_id_or_slug}/subjects` (list subjects with lesson counts)
    - [x] `POST /api/lms/classes/{class_id_or_slug}/subjects` (create subject)
    - [x] `GET /api/lms/subjects/{subject_id}` (get subject details)
    - [x] `PATCH /api/lms/subjects/{subject_id}` (update name/description)
    - [x] `DELETE /api/lms/subjects/{subject_id}` (delete subject and cascade lessons)
  - [x] **Lessons API**:
    - [x] `GET /api/lms/subjects/{subject_id}/lessons` (list lessons in subject ordered by `order_index`)
    - [x] `GET /api/lms/classes/{class_id_or_slug}/lessons` (direct class lessons for `Other` / unassigned)
    - [x] `POST /api/lms/lessons` (create manual lesson)
    - [x] `GET /api/lms/lessons/{lesson_id}` (get full lesson including HTML content)
    - [x] `PATCH /api/lms/lessons/{lesson_id}` (update title, order_index, html, summary)
    - [x] `DELETE /api/lms/lessons/{lesson_id}` (delete lesson)
    - [x] `POST /api/lms/lessons/reorder` (batch reorder lessons)
    - [x] `GET /api/lms/lessons/{lesson_id}/navigation` (get prev/next within current subject or class)
    - [x] `GET /api/lms/lessons/{lesson_id}/download` (download standalone HTML with clean filename)
    - [x] `GET /api/lms/continue-learning` (get user's authentic last-viewed lesson)
    - [x] `POST /api/lms/lessons/{lesson_id}/view` (record lesson view for continue learning)
  - [x] **AI Generation API**:
    - [x] `POST /api/lms/lessons/generate` (takes `class_id`, `subject_id` [optional], `input_type` [topic/text/file], `content`, `AISettings`)
    - [x] System prompt engineering enforcing:
      - Complete standalone HTML document (`<!DOCTYPE html><html><head><style>...</style></head><body>...<script>...</script></body></html>`)
      - Interactive components (quizzes with instant feedback, interactive code snippets, tabs/diagrams)
      - Technical, ByteByteGo-inspired visual clarity and educational diagrams (SVG/HTML)
      - Strict output contract: ONLY the raw HTML, no markdown fences or intro chatter
  - [x] **File Upload Extraction**:
    - [x] `POST /api/lms/upload-source` (upload PDF / txt / md / docx to extract text for generation)
- [x] Register LMS router in `backend/main.py`

---

## Phase 4: Frontend State & Client Services
- [x] Create `frontend/src/modules/ai-lms/types.ts`:
  - [x] `LmsClass`, `LmsSubject`, `LmsLesson`, `LmsNavigation`, `GenerateLessonPayload`, `ContinueLearningData`
- [x] Create `frontend/src/modules/ai-lms/services/lmsService.ts`:
  - [x] Methods for class, subject, lesson CRUD, generate, reorder, view tracking, and download
  - [x] Integrates with `defaultAIRequestFields()` and `apiFetch()` / `apiJson()`

---

## Phase 5: Reusable UI Components (Modern Technical Learning Aesthetic)
- [x] `SearchBar.tsx` (scannable search across classes, subjects, and lesson titles)
- [x] `ContinueLearningBanner.tsx` (shows real last-viewed lesson, progress indicator, quick resume button)
- [x] `ClassCard.tsx` (ByteByteGo / NeetCode inspired card, icon, name, description, subject & lesson counts, hover state)
- [x] `SubjectCard.tsx` (module card with lesson count, sequence preview)
- [x] `LessonCard.tsx` & `LessonList.tsx` (numbered technical list `01`, `02`, title, read time, view state, reorder handle)
- [x] `LessonViewer.tsx`:
  - [x] Sandboxed `iframe` rendering standalone generated HTML safely
  - [x] Top bar with breadcrumbs (`AI LMS / Class / Subject / Lesson`)
  - [x] Previous & Next navigation controls with title previews
  - [x] Download HTML button (`system-design-cap-theorem.html`)
  - [x] Edit / Delete action controls with confirmation
- [x] `GenerateLessonForm.tsx`:
  - [x] Source modes: Topic, Text, File Upload
  - [x] Class dropdown with "+ New Class" modal
  - [x] Subject dropdown with "+ New Subject" modal (optional for `Other` class)
  - [x] Context preservation (creating a class/subject selects it without losing input)
  - [x] Animated generation progress indicator (`Analyzing content` -> `Designing lesson` -> `Creating interactive content` -> `Saving lesson`)
  - [x] Duplicate submission prevention
- [x] `CreateClassModal.tsx` & `CreateSubjectModal.tsx` (clean dialogs with instant creation)
- [x] `ManualLessonModal.tsx` (create or edit lesson directly with HTML/text editor)
- [x] `EmptyState.tsx` (polished educational empty states)
- [x] `ConfirmDialog.tsx` (safe confirmation dialog for deletions)

---

## Phase 6: LMS Pages & Information Architecture
- [x] `frontend/src/app/ai-lms/page.tsx` (Main LMS Home: Hero header, search, continue learning, class grid, stats, generate CTA)
- [x] `frontend/src/app/ai-lms/generate/page.tsx` (Full-page generate lesson experience)
- [x] `frontend/src/app/ai-lms/classes/[classSlug]/page.tsx` (Class page: class banner, subject cards, direct lessons for `Other`, create subject, generate)
- [x] `frontend/src/app/ai-lms/classes/[classSlug]/[subjectSlug]/page.tsx` (Subject page: ordered lesson list, duration, create/generate lesson)
- [x] `frontend/src/app/ai-lms/classes/[classSlug]/[subjectSlug]/[lessonSlug]/page.tsx` (Lesson viewer page: sandboxed iframe, prev/next, download)
- [x] `frontend/src/app/ai-lms/classes/[classSlug]/lesson/[lessonSlug]/page.tsx` (Direct lesson viewer for `Other` class with no subject)
- [x] Add URL alias `/lms` -> `/ai-lms` in `next.config.mjs`

---

## Phase 7: Security & Sandboxing Verification
- [x] Configure `iframe` with `sandbox="allow-scripts"` (isolated from parent DOM, cookies, auth tokens, localStorage)
- [x] Validate HTML output parser & sanitizer safeguards
- [x] Verify no parent credential leaks

---

## Phase 8: End-to-End Verification & Testing
- [x] Test Initial Database Seeding (all 8 classes present, no duplicates on reload)
- [x] Test Flow 1 (Topic): Generate "CAP Theorem" under "System Design" -> "Distributed Systems"
- [x] Test Flow 2 (Text): Generate lesson from long technical notes under "DSA Preparation"
- [x] Test Flow 3 (File): Upload document -> generate lesson
- [x] Test Flow 4 (Other): Generate lesson under "Other" with NO subject
- [x] Test Flow 5 (Manual): Create lesson manually via editor
- [x] Test Flow 6 (Navigation): Verify sequential Previous / Next within subject
- [x] Test Flow 7 (Download): Verify standalone `.html` download with clean human-readable filename
- [x] Test Flow 8 (Persistence): Page refresh maintains all created classes, subjects, lessons, and HTML
- [x] Final visual inspection: Ensure design matches ByteByteGo/NeetCode modern technical standard

---

## Feature Update: Visual + Interactive Learning Experiences
- [x] **Step 1: Visually Intelligent Lesson Generation**
  - [x] Upgrade system prompt in `backend/modules/ai_lms/router.py` to auto-detect and generate high-impact visual reinforcement (inline SVG architecture diagrams, CSS flows, process diagrams, or interactive canvas simulations) where pedagogical value is highest
- [x] **Step 2 & 3: AI Visualizer Backend Engine (`/api/lms/lessons/{id}/visualize`)**
  - [x] Implement `POST /api/lms/lessons/{id}/visualize` with AI decision logic
  - [x] Contextual prompt: AI determines the optimal medium (Architecture flow, Interactive Array/Pointer, Loss Curve/Plot, State Machine, Packet/Network Diagram, Process Timeline)
  - [x] Native Web Visuals: Self-contained SVG, Canvas, or interactive HTML/CSS/JS with zero external CDN dependencies
  - [x] Resilient native visual engine fallback (`backend/modules/ai_lms/visual_engine.py`) protecting against upstream AI provider outages or rate limits
  - [x] Implement `POST /api/lms/lessons/{id}/embed-visual` to permanently integrate the visual into the lesson document
- [x] **Step 4: Frontend Service & Types**
  - [x] Update `types.ts` with `VisualExplanationResult`
  - [x] Add `visualizeLesson(lessonId, concept?)` and `embedVisualInLesson(lessonId, payload)` to `lmsService.ts`
- [x] **Step 5: Lesson Viewer Experience (`[ 📖 Read ]` / `[ ✨ Visualize ]`)**
  - [x] Add `[ 📖 Read ]` and `[ ✨ Visualize ]` segmented switcher in `LessonViewer.tsx`
  - [x] Create interactive Visualizer panel (`VisualizerPanel.tsx`) with instant visual rendering, interactive simulator, prompt refinement, and "Embed into Lesson" action
  - [x] Sandboxed iframe rendering for visual simulations
- [x] **Step 6: End-to-End Verification**
  - [x] Verify System Design topic (generates architecture / request flow diagram)
  - [x] Verify Algorithm topic (generates interactive array / pointer simulation)
  - [x] Verify Machine Learning topic (generates interactive Canvas loss curve)
  - [x] Verify Download HTML includes embedded visualizations
  - [x] Verify TypeScript (`tsc --noEmit`) and production build (`npm run build`) pass with 0 errors
