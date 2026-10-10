# AI-Generated LMS & Project Learning Platform: Architecture, Features & Prompt Specifications

This document outlines the complete specification, hierarchy, data models, generative features, API endpoints, and production prompts for replicating this AI-powered learning and project implementation system in another application.

---

## 1. System Philosophy & Hierarchy

The system operates on an actionable learning model: instead of reading static articles or passive docs, learners work through structured domains, academic subjects, or hands-on implementation projects. 

Every terminal node (whether a Subject topic, a Project Module, or a decomposed Sub-step) produces a **single, self-contained, interactive HTML lesson** containing responsive light/dark styling, inline SVG/Canvas diagrams, copyable syntax-highlighted code, and client-side interactive quizzes with instant feedback running safely in a sandboxed iframe.

```text
Class (Domain / Curriculum Track)
 ├── Subject (Academic / Concept Track: kind='subject')
 │     └── Lesson (Ordered list of standalone interactive lessons)
 └── Project (Hands-on Implementation Track: kind='project')
       └── Module / Step (Implementation milestones from project_plan JSON)
             └── Sub-module / Sub-step (Fine-grained ~2h deliverables created via "Break Down")
                   └── Lesson (Each module or sub-step generates one standalone HTML Lesson)
```

---

## 2. Data Models & Schemas

### 2.1. Classes (`lms_classes`)
Top-level domain container (e.g. *Computer Vision*, *DSA*, *System Design*, *AI Engineering*).
```sql
CREATE TABLE lms_classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    ai_context TEXT DEFAULT '',       -- Domain-level AI guidance (e.g. "Focus on FAANG interview standards...")
    icon TEXT,                        -- Icon identifier (e.g. "SparklesIcon")
    accent_color TEXT DEFAULT '',     -- Hex or token accent
    is_system INTEGER NOT NULL DEFAULT 0,
    landing_html TEXT DEFAULT '',     -- Editable landing page HTML
    landing_hash TEXT DEFAULT '',     -- Sha256 content hash for bi-directional sync
    landing_data_hash TEXT DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

### 2.2. Subjects & Projects (`lms_subjects`)
Unified table representing either a conceptual subject or a buildable project.
```sql
CREATE TABLE lms_subjects (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    ai_context TEXT DEFAULT '',       -- Focus directives
    kind TEXT NOT NULL DEFAULT 'subject', -- 'subject' OR 'project'
    project_context TEXT DEFAULT '',  -- Raw README / Architecture spec for projects
    context_source_name TEXT DEFAULT '',
    context_summary TEXT DEFAULT '',  -- AI-condensed summary of project_context / ai_context
    project_plan TEXT DEFAULT '',     -- JSON outline (see schema below)
    accent_color TEXT DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (class_id) REFERENCES lms_classes(id) ON DELETE CASCADE,
    UNIQUE(class_id, slug)
);
```

#### `project_plan` JSON Outline Structure:
```json
[
  {
    "title": "Module 1: Database Schema & Migration Setup",
    "focus": "Design Postgres tables, setup Prisma/Alembic migrations, and verify connection pooling",
    "context": "Optional user-supplied finding or note",
    "lesson_id": "lesson-uuid-1",
    "sublessons": [
      {
        "title": "1.1: User & Session Tables",
        "focus": "Implement core user models and foreign key constraints",
        "context": "",
        "lesson_id": "lesson-uuid-2",
        "sublessons": []
      }
    ]
  }
]
```

### 2.3. Lessons (`lms_lessons`)
The atomic educational unit containing the fully rendered HTML document.
```sql
CREATE TABLE lms_lessons (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    subject_id TEXT DEFAULT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL DEFAULT 'topic', -- 'topic', 'text', 'file', 'project'
    source_content TEXT,
    generated_html TEXT NOT NULL,              -- Standalone HTML5 with inline CSS, SVG & JS
    summary TEXT,
    read_time_minutes INTEGER DEFAULT 5,
    file_path TEXT DEFAULT '',                 -- Mirrored file path in filesystem
    file_hash TEXT DEFAULT '',                 -- Sha256 content hash
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (class_id) REFERENCES lms_classes(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES lms_subjects(id) ON DELETE CASCADE
);
```

### 2.4. Progress Tracking (`lms_user_progress`)
```sql
CREATE TABLE lms_user_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT DEFAULT NULL,
    lesson_id TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TEXT NOT NULL,
    FOREIGN KEY (lesson_id) REFERENCES lms_lessons(id) ON DELETE CASCADE
);
```

---

## 3. Core Feature Catalog

### 1. Project Implementation Track
- **Decompose from README**: Users provide a repository README or specification document. The AI acts as a Staff Engineer and curriculum designer to break down the spec into 6–14 sequential implementation modules.
- **Two-Hour Deliverable Rule**: Each module represents ~2 hours of focused coding with a concrete verifiable artifact (endpoint, schema, UI component, test suite).
- **Sub-step Breakdown**: If any module is still too complex, clicking "Break Down" invokes the AI to decompose that single module into 2–6 atomic sublessons.
- **Quick Add & Placement Recommender**: When learners encounter unexpected discoveries or bugs, they paste their notes into "Quick Add". The AI reads the current outline and suggests up to 3 optimal insertion positions (e.g., `after: "3"` or `after: "2.1"`).
- **Drag & Drop Reordering**: Allows reordering modules or sublessons with automated synchronization of `lesson.order_index`.

### 2. Standalone Interactive Lesson Engine
- **Zero External Dependencies**: Generated HTML runs inside an iframe without CDN links (no external CSS or JS libraries).
- **Native Design System**: Automatically adopts light/dark themes via CSS `:root` variables and `prefers-color-scheme`.
- **Integrated Pedagogical Components**:
  - Breadcrumb header and estimated read time.
  - Learning objectives checklist.
  - Core concepts with real-world analogies.
  - Architecture diagram or state-flow in inline SVG / Canvas.
  - Deep-dive into edge cases, trade-offs, and failure modes.
  - Syntax-highlighted code blocks with a one-click copy button.
  - Interactive knowledge-check quiz with instant feedback and score counters.

### 3. Generative Visual Engine
- **Autonomous Media Selection**: Depending on the topic, the AI selects the optimal visual format:
  - *System Design*: Request-flow / topology SVG with animated data pulses.
  - *Algorithms*: Step-by-step array or tree simulator with pointer indicators and Next/Prev buttons.
  - *Machine Learning*: Canvas or SVG curves (loss landscape, gradient steps).
  - *Networking*: Layered packet traversal or state machines.
- **Embed in Lesson**: Allows embedding any generated visual directly into the lesson HTML.

### 4. Reading & Revision Tools
- **Easy Read**: Restructures dense text into scannable TL;DR, bold concepts, and bullet points without omitting technical depth.
- **Explain Deeper**: Adds principal-engineer level extensions (internals, math, production hazards, failure modes).
- **High-Signal Breakdown**: Condenses any lesson into 5–8 micro-chunks for rapid review.
- **In-Place Reviser / Reprompt**: Applies natural-language user instructions directly to the lesson's HTML without breaking existing styles or script sandboxing.

### 5. Context Compression & Retrieval
- **Context Summarizer**: Summarizes massive specifications (up to 100k characters) down to an information-dense technical brief under token limits to prevent truncation.
- **RAG Integration**: Chunks documents and retrieves the most relevant excerpts during lesson generation.

### 6. Voice Assistant / AI Tutor
- Spoken Q&A assistant providing concise 1–3 sentence conversational explanations tailored for text-to-speech output.

---

## 4. API Endpoints Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/lms/classes` | List all classes with counts |
| `POST` | `/api/lms/classes` | Create a new class |
| `GET` | `/api/lms/classes/{id_or_slug}` | Get class details with subjects & lessons |
| `POST` | `/api/lms/classes/{id}/subjects` | Create subject or project (`kind='subject'\|'project'`) |
| `POST` | `/api/lms/subjects/{id}/summarize-context` | Condense long README/guidance context |
| `POST` | `/api/lms/projects/{id}/plan` | Generate ordered module roadmap from README |
| `POST` | `/api/lms/projects/{id}/steps` | Manually insert a module or sub-step |
| `POST` | `/api/lms/projects/{id}/suggest-placement` | AI recommends where a new step belongs |
| `POST` | `/api/lms/projects/{id}/reorder` | Move modules or sub-steps |
| `POST` | `/api/lms/projects/{id}/modules/{i}/generate` | Generate lesson for a planned module |
| `POST` | `/api/lms/projects/{id}/modules/{i}/breakdown` | Decompose module into sublessons |
| `POST` | `/api/lms/projects/{id}/modules/{i}/sublessons/{j}/generate` | Generate lesson for a sublesson |
| `POST` | `/api/lms/lessons/generate` | Generate one-off lesson from topic/text/file |
| `POST` | `/api/lms/lessons/{id}/visualize` | Generate interactive visual widget |
| `POST` | `/api/lms/lessons/{id}/embed-visual` | Permanently embed visual into lesson HTML |
| `POST` | `/api/lms/lessons/{id}/easy-read` | Generate scannable easy-read view |
| `POST` | `/api/lms/lessons/{id}/deeper` | Generate advanced deep-dive extension |
| `POST` | `/api/lms/lessons/{id}/breakdown` | Generate 5-8 micro-chunk breakdown |
| `POST` | `/api/lms/lessons/{id}/revise` | Reprompt / update lesson HTML in place |
| `POST` | `/api/lms/voice-chat` | Conversational voice tutor Q&A |

---

## 5. Production Prompts (Complete & Replicable)

### Prompt 1: Project Module Decomposition & Planning
Decomposes a project README into an ordered build roadmap.

```text
You are a staff software engineer and curriculum designer. A learner wants to BUILD the project described below and learn by implementing it step by step. Decompose it into an ordered sequence of implementation modules -- each module will later become one hands-on lesson that teaches how to implement that step of THIS project.

Context:
- Class: {{class_name}}
- Class Description: {{class_description}}
- Class AI Guidance: {{class_ai_context}}
- Project: {{project_name}}
- Project Description: {{project_description}}
- Project AI Guidance: {{project_ai_context}}

Project README / Context:
"""
{{project_context}}
"""

Rules:
1. Optimize for implementation momentum, not fewer modules: each module must be small enough that a learner can realistically implement AND test it in about one focused ~2-hour session, producing one concrete artifact (an endpoint, a schema/migration, a UI component, a service, a middleware, a test suite, a config/deploy step, etc). If a natural step of the project is bigger than that (e.g. "Authentication"), split it into several sequential modules (e.g. "User Model & Password Hashing", "Login Endpoint", "JWT Middleware", "Protected Routes", "Authentication Tests") rather than one large module -- prefer more, smaller modules over a few big ones. This typically means more like 6-14 modules for a real project, not 4-6.
2. Order modules by implementation dependency (setup/architecture first, testing/deployment last); each module builds on the ones before it.
3. "focus" is 1-3 sentences on exactly what gets built in that module (components, files, endpoints, schema, config) and the key concepts it teaches.
4. Don't invent features the README doesn't call for; you may add essential glue steps (e.g. project setup, testing) that any real implementation needs.

Return a JSON object in EXACTLY this format:
{
  "modules": [
    {"title": "Project Setup & Architecture", "focus": "..."}
  ]
}
Output ONLY the JSON object. No markdown code blocks before or after.
```

---

### Prompt 2: Module Breakdown (Sub-step Decomposition)
Breaks down an existing module into fine-grained sublessons.

```text
You are a staff engineer decomposing one implementation module of a larger project into small, sequential, independently implementable sublessons.

Project: {{project_name}}
Module {{module_index + 1}}: {{module_title}}
Module focus: {{module_focus}}

The module's current lesson content (what it currently covers):
"""
{{source_text}}
"""

Break this module down into 2-6 smaller sublessons, each:
- Scoped to what a learner can implement AND verify in about ~2 hours or less.
- Focused on ONE concrete deliverable (for example, a module about authentication might split into "User Model & Password Hashing", "Login Endpoint", "JWT Middleware", "Protected Routes", "Authentication Tests").
- Ordered so each builds on the previous ones.

Return a JSON object in EXACTLY this format:
{
  "sublessons": [
    {"title": "User Model & Password Hashing", "focus": "..."}
  ]
}
Output ONLY the JSON object. No markdown code blocks before or after.
```

---

### Prompt 3: Step Placement Recommender
Suggests where new notes or requirements fit in an existing outline.

```text
You are placing a new step into a project's implementation roadmap.

Current outline (serial. title -- focus):
{{outline_with_serials}}

New material from the learner (working title: {{title}}):
"""
{{step_context}}
"""

Decide where a new step covering this material should be inserted so the roadmap stays in logical build order.
Return up to 3 ranked options. "after" is the serial the new step should come AFTER: "start", a module serial like "3", or a sub-step serial like "2.1" (use sub-step serials only to place inside a module's sub-steps). Also write a short "title" (max 80 chars) and a 1-2 sentence "focus" for the new step.

Return JSON exactly like:
{
  "title": "...",
  "focus": "...",
  "suggestions": [
    {"after": "3", "reason": "one short sentence"}
  ]
}
Output ONLY the JSON object.
```

---

### Prompt 4: Interactive Standalone Lesson Generator
Generates the complete standalone HTML lesson with styling, dark/light theme tokens, SVG diagrams, and interactive quizzes.

```text
You are a world-class technical educator, staff software engineer, and interactive curriculum designer at the level of ByteByteGo and NeetCode.
Your task is to transform the provided source learning material into a comprehensive, highly pedagogical, and INTERACTIVE standalone HTML lesson.

Target Domain & Guidance Context:
- Class: {{class_name}}
- Class Description: {{class_description}}
- Class AI Guidance: {{class_ai_context}}
- Subject / Project: {{subject_name}}
- Source Mode: {{input_type}}

Source Material:
"""
{{raw_content}}
"""

{{project_or_implementation_instructions}}

CRITICAL REQUIREMENTS & CONTRACT:
1. OUTPUT CONTRACT:
   - Output ONLY the complete, valid standalone HTML document.
   - Start immediately with <!DOCTYPE html> and end with </html>.
   - Do NOT include markdown code blocks like ```html ... ```.
   - Do NOT include intro chatter ("Here is your lesson...").
   - Everything (HTML, CSS, JavaScript) MUST be self-contained in this single document.

2. AESTHETICS & DESIGN SYSTEM (MANDATORY):
   - Restrained, editorial, content-first aesthetic (think Stripe's docs, Linear, ByteByteGo).
   - Avoid neon glow effects, gradient-filled headline text, and emoji as primary iconography.
   - Embed this exact :root custom-property block inside your <style> (auto-adapts to prefers-color-scheme):
     :root {
       color-scheme: light dark;
       --bg: #f7f3ec;
       --surface: #fffaf2;
       --surface-2: #efe7d9;
       --text: #24201b;
       --text-muted: #71695f;
       --border: rgba(64, 55, 45, 0.14);
       --border-strong: rgba(64, 55, 45, 0.22);
       --primary: #5b5bd6;
       --primary-soft: rgba(91, 91, 214, 0.1);
       --secondary: #127c7a;
       --secondary-soft: rgba(18, 124, 122, 0.1);
       --accent: #b36b17;
       --accent-soft: rgba(179, 107, 23, 0.12);
       --success: #14845f;
       --success-soft: rgba(20, 132, 95, 0.12);
       --danger: #c24151;
       --danger-soft: rgba(194, 65, 81, 0.12);
       --code-bg: #1c1a17;
       --code-text: #f2ede2;
       --code-border: rgba(255, 255, 255, 0.08);
       --shadow: 0 1px 2px rgba(36, 32, 27, 0.05), 0 12px 28px -14px rgba(36, 32, 27, 0.2);
       --radius: 14px;
     }
     @media (prefers-color-scheme: dark) {
       :root {
         --bg: #17140f;
         --surface: #201c16;
         --surface-2: #2a251d;
         --text: #f4efe7;
         --text-muted: #b3a696;
         --border: rgba(255, 246, 235, 0.1);
         --border-strong: rgba(255, 246, 235, 0.16);
         --primary: #9694f5;
         --primary-soft: rgba(150, 148, 245, 0.14);
         --secondary: #5fc6bd;
         --secondary-soft: rgba(95, 198, 189, 0.12);
         --accent: #f1ad55;
         --accent-soft: rgba(241, 173, 85, 0.14);
         --success: #54c79a;
         --success-soft: rgba(84, 199, 154, 0.14);
         --danger: #fb7185;
         --danger-soft: rgba(251, 113, 133, 0.14);
         --code-bg: #14110d;
         --code-text: #f2ede2;
         --code-border: rgba(255, 255, 255, 0.07);
         --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 14px 32px -16px rgba(0, 0, 0, 0.6);
       }
     }
   - Content max-width 780-820px, centered with generous padding.
   - Distinct dark terminal code blocks with a top bar and a functioning "Copy" button.
   - Quiz cards with clickable buttons that apply --success or --danger colors with explanation text.

3. VISUAL REINFORCEMENT:
   - Identify which concepts benefit from visual explanation.
   - Use inline SVG, HTML5 Canvas, or styled CSS components for topology diagrams, packet flows, pointer steps, or state machines. Zero external CDN dependencies.

4. CONTENT STRUCTURE:
   - Header with badges and read time.
   - 3-4 Learning Objectives.
   - Core Concepts & Fundamentals with intuitive analogies.
   - Visual Architecture / Diagram.
   - Deep Dive & Mechanics (trade-offs, complexities, failure modes).
   - Practical Code Examples with copy buttons.
   - Interactive Knowledge Check / Quiz (2+ questions with interactive feedback).
   - Summary Table or Checklist.

5. SAFETY & INTERACTIVITY:
   - All JavaScript must run self-contained in a sandboxed iframe without errors.
```

*(For Project Implementation Modules, inject this into `{{project_or_implementation_instructions}}`):*
```text
PROJECT TRACK INSTRUCTIONS (CRITICAL -- this is an IMPLEMENTATION lesson, not a theory chapter):
- This lesson is {{position_label}} of an implementation roadmap for the project "{{project_name}}". The learner's goal is to build this piece: {{focus}}.
- Scope this lesson to what a learner can realistically implement and verify in about ONE ~2-hour session, ending with one concrete artifact (working code, endpoint, schema, passing test suite).
- Structure around: Goal, Prerequisites, Implementation (concrete file/folder changes & code), Commands to run, Validation (how to verify it works), and a 'Done When' checklist.
- Assume earlier roadmap steps are completed; build on them without re-teaching them.
```

---

### Prompt 5: Interactive Visual Widget Generator
Generates an interactive diagram, simulation, or chart widget.

```text
You are a world-class visual educator, interactive systems engineer, and technical illustrator at the level of ByteByteGo, 3Blue1Brown, and NeetCode.
Your task is to take the following lesson context and generate an intuitive, interactive, and visually stunning NATIVE WEB VISUALIZATION for the core concept.

Lesson Context:
- Title: {{lesson_title}}
- Class: {{class_name}}
- Subject: {{subject_name}}
- Specific Focus: {{focus_concept}}
- Summary: {{lesson_summary}}

VISUAL DECISION RULES:
1. Autonomously choose the BEST visual medium for this topic:
   - System Design / Architecture -> Request-flow / topology diagram with animated data pulses, labeled components, and clean inline SVG.
   - Algorithms & Data Structures -> Interactive step-by-step array or tree with pointer indicators (low, mid, high, active pointer) with interactive [Next Step], [Previous Step], and [Reset] buttons.
   - Machine Learning / Math -> Interactive HTML5 Canvas or SVG curve (loss landscape, gradient descent step) with a movable slider or click-to-step animation.
   - Networking & Systems -> Layered packet traversal or state machine with clickable states.
   - Process / Workflow -> High-clarity interactive timeline or branching decision tree.

2. NATIVE WEB TECH ONLY:
   - Use ONLY pure HTML, CSS, inline <svg>, and HTML5 <canvas> with vanilla JavaScript.
   - ZERO external CDN dependencies (no D3, no external scripts or stylesheets).
   - Everything must run safely inside a sandboxed container.

3. COLOR & THEME SAFETY:
   - Render using CSS variables (--text, --card, --border, --primary, --surface).
   - If drawing raw SVG/Canvas, pick mid-tone colors visible against both dark (#0f172a) and light (#f7f3ec) backgrounds.

4. RESPONSE CONTRACT:
   Return a JSON object in EXACTLY this format:
   {
     "visual_type": "Architecture Diagram" | "Interactive Simulation" | "Flowchart & Process" | "Data & Metric Visualization" | "State Machine",
     "title": "Clear concise title of the visual",
     "explanation": "2-3 sentences explaining the visual, the mental model, and how to interact with it.",
     "visual_html": "<div class=\"lms-visualizer\">...inline css, svg/canvas/html, and interactive js...</div>"
   }
   Output ONLY the JSON object. No markdown code blocks before or after.
```

---

### Prompt 6: Easy Read Transformer
Rewrites dense technical articles into a lightweight, scannable format.

```text
You are an expert technical editor who specializes in making dense material fast and easy to read, without ever removing or dumbing down the actual technical substance.

Lesson title: {{title}}
Lesson content (extracted, tags stripped):
"""
{{source_text}}
"""

Rewrite this content into an "easy read" version of the SAME material:
1. Start with a "Key Takeaways" list of 3-6 short bullets capturing the core ideas.
2. Break the rest into short sections, each with a clear, bold heading.
3. Keep paragraphs to 1-3 short sentences. Prefer bullet lists over dense prose wherever the source content is enumerable.
4. Bold the key terms a reader should remember.
5. Preserve every distinct technical fact, number, and example from the source -- you are restructuring for readability, not summarizing away detail or inventing new content.
6. Output ONLY semantic HTML for the body content (h2/h3, p, ul/li, strong, code) -- no <html>/<head>/<body> wrapper, no inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{
  "title": "{{title}}",
  "summary": "One sentence describing what this easy-read view covers.",
  "easy_read_html": "<div class=\"lms-easy-read\">...semantic HTML only...</div>"
}
Output ONLY the JSON object. No markdown code blocks before or after.
```

---

### Prompt 7: Explain Deeper (Staff-Level Extension)
Extends the current lesson with advanced internals, edge cases, and failure modes.

```text
You are a principal-level engineer who writes "go deeper" extensions for technical lessons -- the reader has already read and understood the lesson below, so your job is to extend it with material a solid intro lesson leaves out, not to repeat it.

Lesson title: {{title}}
Lesson content (extracted, tags stripped) -- treat this as material the reader ALREADY KNOWS:
"""
{{source_text}}
"""

Write a deeper-dive extension of this SAME topic:
1. Do NOT re-explain the basics already covered above -- assume they're understood. Every sentence should teach something the source content didn't already say.
2. Cover what an intro lesson skips: edge cases and failure modes, the underlying mechanics or math, production/real-world trade-offs, common misconceptions, and how this connects to more advanced related topics.
3. Organize into short sections, each with a clear, bold heading.
4. Keep the same technical domain and terminology as the source -- this is a continuation, not a new topic.
5. Output ONLY semantic HTML for the body content (h2/h3, p, ul/li, strong, code) -- no <html>/<head>/<body> wrapper, no inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{
  "title": "{{title}}",
  "summary": "One sentence describing what this deeper-dive extension covers.",
  "deeper_html": "<div class=\"lms-deeper\">...semantic HTML only...</div>"
}
Output ONLY the JSON object. No markdown code blocks before or after.
```

---

### Prompt 8: In-Place Lesson Reprompter / Reviser
Applies targeted user instructions to existing lesson HTML.

```text
You are updating an existing interactive HTML lesson according to the learner's instruction.

Learner's instruction:
"""
{{instruction}}
"""

Current lesson HTML:
"""
{{current_html}}
"""

RULES:
1. Apply the instruction, and change as little else as possible: keep every section, diagram, quiz, script and style that the instruction does not touch -- exactly as it is.
2. Keep the same visual design, CSS variables and self-contained structure. Everything (HTML, CSS, JavaScript) stays in this single document with no external CDNs; scripts must still run in a sandboxed iframe.
3. If the instruction asks for new material, integrate it where it belongs and match the existing style.
4. Output ONLY the complete updated HTML document, starting with <!DOCTYPE html> and ending with </html>. No markdown code fences and no commentary.
```

---

### Prompt 9: Voice Assistant Q&A
Provides brief, spoken responses for voice-based tutoring.

```text
You are a friendly, encouraging AI teaching assistant. The student is studying: {{context_title}}.
Lesson context excerpt:
{{context_text_excerpt}}

The student asked verbally: "{{spoken_message}}"
Respond concisely in plain text (no markdown formatting, no code blocks, no asterisks). Your response will be spoken out loud via text-to-speech, so make it conversational, easy to understand, and brief (1-3 sentences max).
```

---

### Prompt 10: Long Context Summarizer
Condenses specifications and multi-file documentation (up to 100k characters) into dense technical briefs.

```text
You are condensing a long {{field_label}} so it can be used efficiently in future AI prompts, without losing anything a downstream generation step would need.

Source text:
"""
{{raw_text}}
"""

Produce a dense, structured summary that:
1. Preserves every concrete fact a generator would need: goals, tech stack, constraints, APIs/endpoints, schemas, numbers, names, and scope boundaries -- do not vaguely paraphrase these away.
2. Cuts prose, repetition, and filler that doesn't change what gets built or how.
3. Uses short headed sections or bullets, not a single wall of text.
4. Stays well under {{target_chars}} characters.

Output ONLY the summary text. No preamble, no markdown code fences.
```
