# 🥷 Lab-Ninja Feature Status & Comprehensive Project TODO Tracker

This document serves as the master tracking board for the entire **Lab-Ninja** platform, covering the Daily Interview Coach, Specialized Engineering Labs, LLM Config System, and the AI To-Do App Productivity Suite.

*Last Updated: July 2026*

---

## 1. 🚀 Daily Session Coach & Interview Ninja Track

- [x] **Daily Question Generation**: Generates 10 structured questions per session (5 Core Interview Track: DSA, System Design, Scenario, Large-Scale, Behavioral; 5 Computer Vision Excellence Track).
- [x] **Resume File Upload Button**: File upload control (`.pdf`, `.docx`, `.txt`) in Daily Session setup form to extract resume text automatically via `pdfplumber` / `python-docx`.
- [x] **View All Questions View**: Carousel mode and grid "View All" overview toggle for quick scanning of daily questions.
- [x] **Session ID Format**: Standardized Session ID string format: `[week no.]/[date]/[month of the year]` (e.g., `W30/22/July`).
- [x] **Generate New Set Button**: Option to instantly reset and generate a fresh daily session.
- [x] **Dynamic AI Answer & Detailed Explanation Generator**: Dynamic LLM calls for "Show Answer with AI" and "Explain More with AI" using configured AI models.

---

## 2. ⚡ AI To-Do App Productivity Suite

### Core Architecture (3-Tab)
- [x] **Tab 1 — Quick Daily**: Eisenhower matrix + today's flat list + AI day plan
- [x] **Tab 2 — Smart To-Do**: Full task tree + Eisenhower matrix + AI Weekly Plan views
- [x] **Tab 3 — Plan & Project**: Projects, node tree, AI roadmap, Eisenhower matrix views
- [x] **Copilot Sidebar**: Context-aware Q&A across all 3 tabs

### Task Intelligence
- [x] **Infinite Task Tree**: Nested subtask breakdown with multi-level depth representation
- [x] **AI Strategic Dive Deeper & Actionable Chunk Breakdown**: Deep tree auto-breakdown
- [x] **AI Natural Language Fast Task Capture**: Parse raw text → title, priority, due date, context
- [x] **AI Eisenhower & Pareto Auto-Prioritizer**: Analyze tasks → Top 20% scores, matrix quadrants
- [x] **AI Definition of Done & Subtask Generator**: One-click success criteria + subtask checklists
- [x] **AI Smart Daily Schedule Planner**: Energy & focus-hours-aware time block schedule

### 🧠 Brain Dump — Handwriting Processing (NEW Jul 2026)
- [x] **Image Upload**: Accept .jpg/.png/.webp/.heic + scanned PDF brain dump photos
- [x] **Vision AI Extraction**: Gemini / Ollama LLaVA reads and transcribes handwritten notes
- [x] **AI Task Parser**: Extracted text → structured tasks (title, quadrant, time estimate, context)
- [x] **Interactive Preview**: Review all parsed tasks, edit titles/quadrants inline, select/deselect
- [x] **Bulk Save to Quick Daily**: Confirm → all selected tasks created as today's quick tasks
- [x] **Source Tracking**: Brain-dump tasks tagged `source: brain_dump` for filtering

### Cross-Tab Task Movement (FIXED Jul 2026)
- [x] **Non-Destructive Moves**: Tasks moved to Smart/Plan are now kept in Quick Daily as dimmed "moved out" entries (previously they were deleted — BUG FIXED)
- [x] **Quick → Smart To-Do**: Creates a full task, marks quick task `is_exported=1`
- [x] **Quick → Plan & Project**: Creates a new project, marks quick task `is_exported=1`
- [x] **Smart → Quick Daily**: Linked copy created in Quick Daily
- [x] **Move buttons in flat list panel**: Fixed — QuickTaskCard now receives move handlers in both matrix and flat list views (previously only matrix had them — BUG FIXED)

### 80/20 Pareto Integration
- [x] **Pareto Analysis Endpoint**: POST /pareto/analyze across all 3 tabs
- [x] **Top 20% Visual Indicators**: Gold ring + ⭐ badge on all task types
- [x] **AI Day Plan Top 20% Priority** (FIXED): Top 20% tasks always included first in AI plan
- [x] **Eisenhower Auto-Sort Top 20% Rule**: Top 20% tasks always placed in do_now/schedule only
- [x] **Per-Task Re-Scoring**: Individual pareto score update from TaskNode popover

### Quick Daily Features
- [x] **Distraction Inbox**: Floating instant capture (`Alt+D`) + conversion drawer
- [x] **End My Day Flow**: Archive completed, move to tomorrow/smart/discard + AI encouragement
- [x] **QuickTaskUpdate PATCH fix**: Now accepts `is_top_20` and `pareto_score` (FIXED)

### Pending / Future
- [ ] **Copilot Top 20% Context**: Copilot system prompt to include user's Top 20% task list
- [ ] **80/20 Analyze Button in FilterBar**: One-click analyze from Smart To-Do toolbar
- [ ] **⭐ Top 20% Filter Chip**: Filter task tree to show only top 20% tasks
- [ ] **Completion Dopamine**: Copilot proactive message on completing a Top 20% task


---

## 3. 🗄️ Persistence, Question Bank & Export Options

- [x] **SQLite Database Storage**: All generated questions, progress records, session answers, and tasks persisted in local SQLite databases.
- [x] **Question Bank Filters**: Retrieve and filter past questions by category (*All*, *Interview*, *CV Skill*), difficulty, topic, and date.
- [x] **Markdown Export (.md)**: Copy-paste ready markdown export for daily sessions and question bank selections.
- [x] **CSV Export (.csv)**: Structured CSV export for offline revision.

---

## 4. ⚙️ Config Tab & Multi-LLM Engine

- [x] **Provider Management**: UI for choosing custom AI models for question generation and answer evaluation.
- [x] **API Key Management**: Support for Gemini, OpenAI, DeepSeek, Groq, Anthropic, and local Ollama instances (`llama3.2`).
- [x] **Automatic Provider Fallback**: Fallback mechanism if a specific LLM provider is unavailable.

---

## 5. 🔬 Specialized Engineering Labs

- [x] **DSA Lab**: Data structures & algorithm problem solver & practice module.
- [x] **CV Lab**: Computer Vision specialized deep dive lab.
- [x] **System Design Lab**: Architecture diagramming & trade-off analysis suite.

---

## 🧭 Ongoing Improvement Ideas (Future Enhancements)

- [ ] **Voice-to-Text Task Audio Capture**: Direct browser microphone recording for instant task voice notes.
- [ ] **Calendar Integration**: Syncing AI daily schedules directly with Google Calendar / iCal.
- [x] **Offline Ollama Auto-Detector**: Auto-detect running local Ollama models on startup — live status badge (Online/Offline), model dropdown replaces text input when running, re-detects on URL change, manual re-detect button.
