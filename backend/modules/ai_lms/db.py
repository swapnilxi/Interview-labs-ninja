from __future__ import annotations

import hashlib
import html as _html
import json
import re
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path


def slugify(text: str) -> str:
    """Convert text to a clean URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-") or "item"


def content_hash(text: Optional[str]) -> str:
    """sha256 hex of the UTF-8 bytes. Twin of contentHash() in fe-apis/lms/db.ts; the
    class-folder sync compares these, so both must hash identically."""
    return hashlib.sha256((text or "").encode("utf-8", errors="replace")).hexdigest()


# The one row of lms_module_landing: the AI LMS module-root landing page (see
# class_folders.py), which isn't tied to any single class.
MODULE_LANDING_ID = "home"


# Subject slugs that would collide with a static route segment
# (/classes/<c>/lesson/<l>, /classes/<c>/landing) or with the class folder's own
# lessons/ directory (see class_folders.py). Mirrored in fe-apis/lms/db.ts.
RESERVED_SUBJECT_SLUGS = {"lesson", "landing", "lessons"}


INITIAL_CLASSES = [
    {
        "id": "class-computer-vision",
        "name": "Computer Vision",
        "slug": "computer-vision",
        "description": "Computer vision, image understanding, segmentation, detection, OCR, and visual AI.",
        "ai_context": "Focus on deep learning vision architectures (YOLO, ViTs, SAM, ResNet), visual feature extraction, real-time inference latency, and PyTorch/OpenCV examples.",
        "icon": "EyeIcon",
        "is_system": 1,
    },
    {
        "id": "class-dsa-preparation",
        "name": "DSA Preparation",
        "slug": "dsa-preparation",
        "description": "Data structures, algorithms, coding patterns, complexity, and interview problem solving.",
        "ai_context": "Target LeetCode medium/hard patterns, time/space complexity derivations, edge cases, visual pointer diagrams, and idiomatic Python/TypeScript implementations.",
        "icon": "CpuChipIcon",
        "is_system": 1,
    },
    {
        "id": "class-system-design",
        "name": "System Design",
        "slug": "system-design",
        "description": "High-level design, distributed systems, architecture patterns, scalability, reliability, and trade-offs.",
        "ai_context": "Design for high-scale distributed systems (10M+ DAU, 99.99% SLA), CAP theorem trade-offs, consistency models, caching tiers, failure recovery, and architectural diagrams.",
        "icon": "ServerStackIcon",
        "is_system": 1,
    },
    {
        "id": "class-cloud-code-architect",
        "name": "Cloud Code Architect",
        "slug": "cloud-code-architect",
        "description": "Cloud architecture, agentic systems, cloud-native development, AI engineering, and implementation patterns.",
        "ai_context": "Focus on cloud-native patterns, Kubernetes, Terraform/IaC, serverless vs containers, microservices communication, observability, and resilient cloud architecture.",
        "icon": "CloudIcon",
        "is_system": 1,
    },
    {
        "id": "class-ai",
        "name": "AI",
        "slug": "ai",
        "description": "Generative AI, LLMs, RAG, agents, multi-agent systems, evaluation, and AI application development.",
        "ai_context": "Cover modern LLM stacks, multi-agent frameworks (LangGraph, CrewAI), RAG vector search, prompting techniques, hallucination mitigation, and model evaluation.",
        "icon": "SparklesIcon",
        "is_system": 1,
    },
    {
        "id": "class-leadership",
        "name": "Leadership",
        "slug": "leadership",
        "description": "Leadership, communication, execution, decision making, influence, and team management.",
        "ai_context": "Emphasize engineering leadership, architectural decision records (ADRs), stakeholder negotiation, technical debt management, and team velocity.",
        "icon": "UserGroupIcon",
        "is_system": 1,
    },
    {
        "id": "class-interview-preparation",
        "name": "Interview Preparation",
        "slug": "interview-preparation",
        "description": "Technical interviews, behavioral interviews, system design interviews, coding preparation, and interview strategy.",
        "ai_context": "Structure lessons around FAANG/top-tier tech interview standards, STAR behavioral framework, whiteboard communication, and common interview traps.",
        "icon": "AcademicCapIcon",
        "is_system": 1,
    },
    {
        "id": "class-other",
        "name": "Other",
        "slug": "other",
        "description": "Content that does not currently belong to a specific class.",
        "ai_context": "Provide clear, foundational explanations with intuitive analogies and hands-on examples.",
        "icon": "FolderIcon",
        "is_system": 1,
    },
]


INITIAL_INSTRUCTORS = [
    {
        "id": "inst-alex-xu",
        "name": "Dr. Alex Xu",
        "slug": "alex-xu",
        "type": "real",
        "title": "Lead Distributed Systems Architect & Author",
        "email": "alex.xu@lms-ninja.ai",
        "bio": "Ex-FAANG Principal Infrastructure Engineer specializing in large-scale system design, high availability architectures, and microservices.",
        "expertise": "System Design, Distributed Systems, Scalability, Database Architecture",
        "learning_style": "First-Principles & Tradeoffs",
        "learning_style_prompt": "Deconstruct every architectural design into core trade-offs (latency vs consistency, availability vs partition tolerance) with concrete numbers, SLAs, and component breakdown diagrams.",
        "ai_persona": "You are the AI Assistant & Digital Persona of Dr. Alex Xu. Answer system design queries with architectural rigor, trade-off analysis, SLA calculations, and real-world failure cases.",
        "ai_chatbot_enabled": 1,
        "rating": 4.9,
        "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250",
        "class_ids": ["class-system-design", "class-cloud-code-architect"],
    },
    {
        "id": "inst-neetcode-ai",
        "name": "NeetCode AI",
        "slug": "neetcode-ai",
        "type": "ai",
        "title": "Algorithmic & LeetCode AI Mentor",
        "email": "neetcode.ai@lms-ninja.ai",
        "bio": "Autonomous AI Instructor trained on 500+ data structures & algorithm patterns, LeetCode solutions, and time/space complexity proofs.",
        "expertise": "Data Structures, Dynamic Programming, Graph Algorithms, LeetCode Patterns",
        "learning_style": "FAANG Interviewer & Step-by-Step",
        "learning_style_prompt": "Evaluate code against high-bar tech interview standards. Stress time/space complexity derivations, visual two-pointer/sliding window diagrams, and edge cases.",
        "ai_persona": "You are NeetCode AI, an interactive algorithmic coach. Guide students step-by-step through data structures and coding patterns with visual steps and clean Python implementations.",
        "ai_chatbot_enabled": 1,
        "rating": 4.96,
        "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250",
        "class_ids": ["class-dsa-preparation", "class-interview-preparation"],
    },
    {
        "id": "inst-sarah-chen",
        "name": "Dr. Sarah Chen",
        "slug": "sarah-chen",
        "type": "real",
        "title": "Principal AI Research Scientist & Deep Learning Lead",
        "email": "sarah.chen@lms-ninja.ai",
        "bio": "Ph.D. in Computer Vision & Deep Learning from Stanford. Lead AI Research Director specializing in visual transformers & LLM fine-tuning.",
        "expertise": "Generative AI, Computer Vision, PyTorch, Transformers, Agentic LLMs",
        "learning_style": "Socratic Method",
        "learning_style_prompt": "Guide students through thought-provoking questions, helping them arrive at deep learning concepts and transformer attention math step-by-step.",
        "ai_persona": "You are the AI Teaching Assistant for Dr. Sarah Chen. Help students understand modern LLMs, computer vision architectures, and PyTorch implementations.",
        "ai_chatbot_enabled": 1,
        "rating": 4.98,
        "avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250",
        "class_ids": ["class-computer-vision", "class-ai"],
    },
]


def init_lms_db(conn: Optional[sqlite3.Connection] = None) -> None:
    """Initialize LMS SQLite tables and idempotently seed the initial 8 classes."""
    should_close = False
    if conn is None:
        db_path = get_db_path()
        conn = sqlite3.connect(db_path)
        should_close = True

    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # ── 1. Classes Table ───────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_classes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                description TEXT,
                ai_context TEXT DEFAULT '',
                icon TEXT,
                is_system INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_classes_slug ON lms_classes(slug);")

        # Check if ai_context column exists in lms_classes
        cursor.execute("PRAGMA table_info(lms_classes);")
        class_cols = [row[1] for row in cursor.fetchall()]
        if "ai_context" not in class_cols:
            cursor.execute("ALTER TABLE lms_classes ADD COLUMN ai_context TEXT DEFAULT '';")
        if "order_index" not in class_cols:
            cursor.execute("ALTER TABLE lms_classes ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;")
        # Class landing page: the HTML of classes/<class>/landingpage.html, plus the hash
        # the DB and the file last agreed on (see class_folders.py).
        if "landing_html" not in class_cols:
            cursor.execute("ALTER TABLE lms_classes ADD COLUMN landing_html TEXT DEFAULT '';")
        if "landing_hash" not in class_cols:
            cursor.execute("ALTER TABLE lms_classes ADD COLUMN landing_hash TEXT DEFAULT '';")
        # Hash of the class data the landing page's lms:auto blocks were last rendered from.
        if "landing_data_hash" not in class_cols:
            cursor.execute("ALTER TABLE lms_classes ADD COLUMN landing_data_hash TEXT DEFAULT '';")
        if "accent_color" not in class_cols:
            cursor.execute("ALTER TABLE lms_classes ADD COLUMN accent_color TEXT DEFAULT '';")

        # ── 2. Subjects Table ──────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_subjects (
                id TEXT PRIMARY KEY,
                class_id TEXT NOT NULL,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                description TEXT,
                ai_context TEXT DEFAULT '',
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (class_id) REFERENCES lms_classes(id) ON DELETE CASCADE,
                UNIQUE(class_id, slug)
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_subjects_class_id ON lms_subjects(class_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_subjects_order ON lms_subjects(order_index);")

        # Check if ai_context column exists in lms_subjects
        cursor.execute("PRAGMA table_info(lms_subjects);")
        subj_cols = [row[1] for row in cursor.fetchall()]
        if "ai_context" not in subj_cols:
            cursor.execute("ALTER TABLE lms_subjects ADD COLUMN ai_context TEXT DEFAULT '';")
        # Project track: a "project" is a subject row with kind='project' plus a README /
        # context doc and an AI-planned module outline, so it reuses lessons, routing,
        # navigation and the lesson viewer unchanged.
        if "kind" not in subj_cols:
            cursor.execute("ALTER TABLE lms_subjects ADD COLUMN kind TEXT NOT NULL DEFAULT 'subject';")
        if "project_context" not in subj_cols:
            cursor.execute("ALTER TABLE lms_subjects ADD COLUMN project_context TEXT DEFAULT '';")
        if "context_source_name" not in subj_cols:
            cursor.execute("ALTER TABLE lms_subjects ADD COLUMN context_source_name TEXT DEFAULT '';")
        if "project_plan" not in subj_cols:
            cursor.execute("ALTER TABLE lms_subjects ADD COLUMN project_plan TEXT DEFAULT '';")
        if "accent_color" not in subj_cols:
            cursor.execute("ALTER TABLE lms_subjects ADD COLUMN accent_color TEXT DEFAULT '';")
        # AI-generated condensed version of this row's long-form context (project_context
        # for a project, ai_context for a subject) -- an alternative to naively truncating
        # a long multi-document upload at prompt-build time. When present, generation
        # prompts use this instead of a raw prefix (see router.py's _generate_lesson_content).
        if "context_summary" not in subj_cols:
            cursor.execute("ALTER TABLE lms_subjects ADD COLUMN context_summary TEXT DEFAULT '';")

        # ── 3. Lessons Table ───────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_lessons (
                id TEXT PRIMARY KEY,
                class_id TEXT NOT NULL,
                subject_id TEXT DEFAULT NULL,
                title TEXT NOT NULL,
                slug TEXT NOT NULL,
                order_index INTEGER NOT NULL DEFAULT 0,
                source_type TEXT NOT NULL DEFAULT 'topic',
                source_content TEXT,
                generated_html TEXT NOT NULL,
                summary TEXT,
                read_time_minutes INTEGER DEFAULT 5,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (class_id) REFERENCES lms_classes(id) ON DELETE CASCADE,
                FOREIGN KEY (subject_id) REFERENCES lms_subjects(id) ON DELETE CASCADE
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_lessons_class_id ON lms_lessons(class_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_lessons_subject_id ON lms_lessons(subject_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_lessons_order ON lms_lessons(order_index);")

        # Class-folder sync bookkeeping: where this lesson's .html file was last written
        # (relative to the classes folder) and the hash the DB and the file last agreed on.
        cursor.execute("PRAGMA table_info(lms_lessons);")
        lesson_cols = [row[1] for row in cursor.fetchall()]
        if "file_path" not in lesson_cols:
            cursor.execute("ALTER TABLE lms_lessons ADD COLUMN file_path TEXT DEFAULT '';")
        if "file_hash" not in lesson_cols:
            cursor.execute("ALTER TABLE lms_lessons ADD COLUMN file_hash TEXT DEFAULT '';")

        # One-time repair: titles/summaries extracted from lesson HTML used to keep literal
        # entities (`&amp;`). Decode once; rows without an entity are left untouched.
        _entity = re.compile(r"&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);")
        cursor.execute("SELECT id, title, summary FROM lms_lessons WHERE title LIKE '%&%' OR summary LIKE '%&%';")
        for lesson_id, title, summary in cursor.fetchall():
            if _entity.search(title or "") or _entity.search(summary or ""):
                cursor.execute(
                    "UPDATE lms_lessons SET title = ?, summary = ? WHERE id = ?;",
                    (_html.unescape(title or ""), _html.unescape(summary or ""), lesson_id),
                )

        # Earlier versions of lesson/landing HTML that a file import replaced, so an IDE
        # edit can never silently destroy what the DB held (see class_folders.py).
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_html_backups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                rel_path TEXT DEFAULT '',
                html TEXT NOT NULL,
                reason TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_html_backups_entity ON lms_html_backups(entity_type, entity_id);")

        # ── 4. Instructors Tables ──────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_instructors (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL DEFAULT 'ai',
                title TEXT,
                bio TEXT,
                email TEXT,
                avatar TEXT,
                expertise TEXT DEFAULT '',
                learning_style TEXT DEFAULT '',
                learning_style_prompt TEXT DEFAULT '',
                ai_persona TEXT DEFAULT '',
                ai_chatbot_enabled INTEGER NOT NULL DEFAULT 1,
                rating REAL DEFAULT 4.9,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_instructors_slug ON lms_instructors(slug);")

        cursor.execute("PRAGMA table_info(lms_instructors);")
        inst_cols = [row[1] for row in cursor.fetchall()]
        if "type" not in inst_cols:
            cursor.execute("ALTER TABLE lms_instructors ADD COLUMN type TEXT NOT NULL DEFAULT 'ai';")
        if "learning_style" not in inst_cols:
            cursor.execute("ALTER TABLE lms_instructors ADD COLUMN learning_style TEXT DEFAULT '';")
        if "learning_style_prompt" not in inst_cols:
            cursor.execute("ALTER TABLE lms_instructors ADD COLUMN learning_style_prompt TEXT DEFAULT '';")
        if "ai_chatbot_enabled" not in inst_cols:
            cursor.execute("ALTER TABLE lms_instructors ADD COLUMN ai_chatbot_enabled INTEGER NOT NULL DEFAULT 1;")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_class_instructors (
                instructor_id TEXT NOT NULL,
                class_id TEXT NOT NULL,
                PRIMARY KEY (instructor_id, class_id),
                FOREIGN KEY (instructor_id) REFERENCES lms_instructors(id) ON DELETE CASCADE,
                FOREIGN KEY (class_id) REFERENCES lms_classes(id) ON DELETE CASCADE
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_class_inst_inst ON lms_class_instructors(instructor_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_class_inst_class ON lms_class_instructors(class_id);")

        # ── 5. User Progress Table ─────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_user_progress (
                id TEXT PRIMARY KEY,
                user_id INTEGER DEFAULT NULL,
                lesson_id TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                last_viewed_at TEXT NOT NULL,
                FOREIGN KEY (lesson_id) REFERENCES lms_lessons(id) ON DELETE CASCADE
            );
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_progress_user ON lms_user_progress(user_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_progress_lesson ON lms_user_progress(lesson_id);")

        # ── 6. Module-root Landing Page (singleton) ────────────────────────────
        # The AI LMS home/intro landing page (frontend/src/modules/ai-lms/classes/landingpage.html),
        # separate from any one class -- see class_folders.py's "Module-root landing page" section.
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lms_module_landing (
                id TEXT PRIMARY KEY,
                html TEXT NOT NULL DEFAULT '',
                hash TEXT NOT NULL DEFAULT '',
                data_hash TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            );
        """)
        now_landing = datetime.utcnow().isoformat() + "Z"
        cursor.execute(
            "INSERT INTO lms_module_landing (id, html, hash, data_hash, updated_at) "
            "SELECT ?, '', '', '', ? WHERE NOT EXISTS (SELECT 1 FROM lms_module_landing WHERE id = ?)",
            (MODULE_LANDING_ID, now_landing, MODULE_LANDING_ID),
        )

        # ── 7. Seed Initial Classes (Idempotent) ────────────────────────────────
        now_iso = datetime.utcnow().isoformat() + "Z"
        for item in INITIAL_CLASSES:
            cursor.execute(
                """
                INSERT INTO lms_classes (id, name, slug, description, ai_context, icon, is_system, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM lms_classes WHERE slug = ? OR id = ?)
                """,
                (
                    item["id"],
                    item["name"],
                    item["slug"],
                    item["description"],
                    item.get("ai_context", ""),
                    item["icon"],
                    item["is_system"],
                    now_iso,
                    now_iso,
                    item["slug"],
                    item["id"],
                ),
            )
            # Backfill initial ai_context if empty
            cursor.execute(
                """
                UPDATE lms_classes
                SET ai_context = ?
                WHERE slug = ? AND (ai_context IS NULL OR ai_context = '')
                """,
                (item.get("ai_context", ""), item["slug"])
            )

        # ── 7. Seed Initial Instructors (Idempotent) ───────────────────────────
        for inst in INITIAL_INSTRUCTORS:
            cursor.execute(
                """
                INSERT INTO lms_instructors (id, name, slug, type, title, bio, email, avatar, expertise, learning_style, learning_style_prompt, ai_persona, ai_chatbot_enabled, rating, created_at, updated_at)
                SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM lms_instructors WHERE slug = ? OR id = ?)
                """,
                (
                    inst["id"],
                    inst["name"],
                    inst["slug"],
                    inst.get("type", "ai"),
                    inst["title"],
                    inst["bio"],
                    inst["email"],
                    inst["avatar"],
                    inst["expertise"],
                    inst.get("learning_style", ""),
                    inst.get("learning_style_prompt", ""),
                    inst["ai_persona"],
                    inst.get("ai_chatbot_enabled", 1),
                    inst["rating"],
                    now_iso,
                    now_iso,
                    inst["slug"],
                    inst["id"],
                ),
            )
            cursor.execute(
                """
                UPDATE lms_instructors
                SET type = ?, learning_style = ?, learning_style_prompt = ?
                WHERE (id = ? OR slug = ?) AND (learning_style IS NULL OR learning_style = '')
                """,
                (inst.get("type", "ai"), inst.get("learning_style", ""), inst.get("learning_style_prompt", ""), inst["id"], inst["slug"])
            )
            for c_id in inst.get("class_ids", []):
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO lms_class_instructors (instructor_id, class_id)
                    VALUES (?, ?)
                    """,
                    (inst["id"], c_id)
                )

        conn.commit()
    finally:
        if should_close:
            conn.close()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


# ─────────────────────────────────────────────────────────────────────────────
# Class Operations
# ─────────────────────────────────────────────────────────────────────────────

def get_all_classes() -> List[Dict[str, Any]]:
    """Return all classes with dynamic subject_count and lesson_count."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                c.id, c.name, c.slug, c.description, c.ai_context, c.icon, c.accent_color, c.is_system, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM lms_subjects s WHERE s.class_id = c.id) AS subject_count,
                (SELECT COUNT(*) FROM lms_lessons l WHERE l.class_id = c.id) AS lesson_count
            FROM lms_classes c
            ORDER BY c.order_index ASC, c.is_system DESC, c.name ASC
        """)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_class_by_id_or_slug(identifier: str) -> Optional[Dict[str, Any]]:
    """Get class by either ID or slug, along with subjects and direct lessons."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                c.id, c.name, c.slug, c.description, c.ai_context, c.icon, c.accent_color, c.is_system, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM lms_subjects s WHERE s.class_id = c.id) AS subject_count,
                (SELECT COUNT(*) FROM lms_lessons l WHERE l.class_id = c.id) AS lesson_count
            FROM lms_classes c
            WHERE c.id = ? OR c.slug = ?
        """, (identifier, identifier))
        row = cursor.fetchone()
        if not row:
            return None

        class_data = dict(row)

        # Fetch subjects
        cursor.execute("""
            SELECT 
                s.id, s.class_id, s.name, s.slug, s.description, s.ai_context, s.kind, s.context_source_name, s.accent_color, s.order_index, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM lms_lessons l WHERE l.subject_id = s.id) AS lesson_count
            FROM lms_subjects s
            WHERE s.class_id = ?
            ORDER BY s.order_index ASC, s.name ASC
        """, (class_data["id"],))
        class_data["subjects"] = [dict(s) for s in cursor.fetchall()]

        # Fetch direct lessons (where subject_id IS NULL)
        cursor.execute("""
            SELECT 
                id, class_id, subject_id, title, slug, order_index, source_type, summary, read_time_minutes, created_at, updated_at
            FROM lms_lessons
            WHERE class_id = ? AND subject_id IS NULL
            ORDER BY order_index ASC, created_at ASC
        """, (class_data["id"],))
        class_data["direct_lessons"] = [dict(l) for l in cursor.fetchall()]

        return class_data


def create_class(name: str, description: Optional[str] = None, icon: Optional[str] = None, ai_context: Optional[str] = None, accent_color: Optional[str] = None) -> Dict[str, Any]:
    """Create a new custom class."""
    clean_name = name.strip()
    base_slug = slugify(clean_name)
    now_iso = datetime.utcnow().isoformat() + "Z"
    new_id = f"class-{uuid.uuid4().hex[:8]}"

    with _get_conn() as conn:
        cursor = conn.cursor()
        # Ensure unique slug
        cursor.execute("SELECT id FROM lms_classes WHERE slug = ?", (base_slug,))
        slug = base_slug
        suffix = 1
        while cursor.fetchone():
            slug = f"{base_slug}-{suffix}"
            suffix += 1
            cursor.execute("SELECT id FROM lms_classes WHERE slug = ?", (slug,))

        cursor.execute("""
            INSERT INTO lms_classes (id, name, slug, description, ai_context, icon, accent_color, is_system, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """, (new_id, clean_name, slug, description or "", ai_context or "", icon or "BookmarkIcon", accent_color or "", now_iso, now_iso))
        conn.commit()

    return get_class_by_id_or_slug(new_id)  # type: ignore


def update_class(identifier: str, name: Optional[str] = None, description: Optional[str] = None, icon: Optional[str] = None, ai_context: Optional[str] = None, accent_color: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Update class details."""
    cls = get_class_by_id_or_slug(identifier)
    if not cls:
        return None

    now_iso = datetime.utcnow().isoformat() + "Z"
    new_name = name.strip() if name is not None else cls["name"]
    new_desc = description if description is not None else cls["description"]
    new_icon = icon if icon is not None else cls["icon"]
    new_ai_ctx = ai_context if ai_context is not None else cls.get("ai_context", "")
    new_accent = accent_color if accent_color is not None else cls.get("accent_color", "")

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE lms_classes
            SET name = ?, description = ?, icon = ?, ai_context = ?, accent_color = ?, updated_at = ?
            WHERE id = ?
        """, (new_name, new_desc, new_icon, new_ai_ctx, new_accent, now_iso, cls["id"]))
        conn.commit()

    return get_class_by_id_or_slug(cls["id"])


def delete_class(identifier: str) -> bool:
    """Delete a custom class. System classes cannot be deleted."""
    cls = get_class_by_id_or_slug(identifier)
    if not cls or cls["is_system"] == 1:
        return False

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lms_classes WHERE id = ?", (cls["id"],))
        conn.commit()
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Subject Operations
# ─────────────────────────────────────────────────────────────────────────────

def get_subjects_by_class(class_identifier: str) -> List[Dict[str, Any]]:
    """Get all subjects for a class, ordered by order_index."""
    cls = get_class_by_id_or_slug(class_identifier)
    if not cls:
        return []

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                s.id, s.class_id, s.name, s.slug, s.description, s.ai_context, s.kind, s.context_source_name, s.accent_color, s.order_index, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM lms_lessons l WHERE l.subject_id = s.id) AS lesson_count
            FROM lms_subjects s
            WHERE s.class_id = ?
            ORDER BY s.order_index ASC, s.name ASC
        """, (cls["id"],))
        return [dict(r) for r in cursor.fetchall()]


def get_subject_by_id_or_slug(class_identifier: str, subject_identifier: str) -> Optional[Dict[str, Any]]:
    """Retrieve subject details by ID or slug within a class."""
    cls = get_class_by_id_or_slug(class_identifier)
    if not cls:
        return None

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                s.id, s.class_id, s.name, s.slug, s.description, s.ai_context, s.kind, s.context_source_name,
                s.project_context, s.project_plan, s.context_summary, s.order_index, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM lms_lessons l WHERE l.subject_id = s.id) AS lesson_count
            FROM lms_subjects s
            WHERE s.class_id = ? AND (s.id = ? OR s.slug = ?)
        """, (cls["id"], subject_identifier, subject_identifier))
        row = cursor.fetchone()
        if not row:
            return None
        subject = dict(row)
        subject["class"] = cls

        # Fetch ordered lessons for this subject (metadata only)
        cursor.execute("""
            SELECT 
                id, class_id, subject_id, title, slug, order_index, source_type, summary, read_time_minutes, created_at, updated_at
            FROM lms_lessons
            WHERE subject_id = ?
            ORDER BY order_index ASC, created_at ASC
        """, (subject["id"],))
        subject["lessons"] = [dict(l) for l in cursor.fetchall()]
        subject["project_plan"] = _parse_project_plan(subject.get("project_plan"), subject["lessons"])
        return subject


def _parse_plan_item(item: Dict[str, Any], lesson_ids: set) -> Optional[Dict[str, Any]]:
    """Normalize one module or sublesson entry: {title, focus, lesson_id, sublessons}."""
    title = str(item.get("title", "")).strip()
    if not title:
        return None
    lesson_id = item.get("lesson_id")
    raw_subs = item.get("sublessons")
    sublessons: List[Dict[str, Any]] = []
    if isinstance(raw_subs, list):
        for sub in raw_subs:
            if isinstance(sub, dict):
                parsed_sub = _parse_plan_item(sub, lesson_ids)
                if parsed_sub:
                    sublessons.append(parsed_sub)
    return {
        "title": title,
        "focus": str(item.get("focus") or "").strip(),
        # User-supplied notes/findings/pasted docs for this step (added via "Add step").
        "context": str(item.get("context") or "").strip(),
        "lesson_id": lesson_id if lesson_id in lesson_ids else None,
        # Populated on demand by the "Break Down" action (see db.py's save_project_plan
        # callers in router.py); a module with sublessons is generated sublesson-by-
        # sublesson instead of as one lesson.
        "sublessons": sublessons,
    }


def _parse_project_plan(raw: Optional[str], lessons: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Decode the stored module outline, dropping links to lessons that no longer exist
    (e.g. a module lesson the user deleted) so the UI shows that module/sublesson as not
    generated. Recurses into sublessons (see _parse_plan_item)."""
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(items, list):
        return []
    lesson_ids = {l["id"] for l in lessons}
    plan: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        parsed = _parse_plan_item(item, lesson_ids)
        if parsed:
            plan.append(parsed)
    return plan


def create_subject(
    class_identifier: str,
    name: str,
    description: Optional[str] = None,
    ai_context: Optional[str] = None,
    kind: str = "subject",
    project_context: Optional[str] = None,
    context_source_name: Optional[str] = None,
    accent_color: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Create a new subject (or project, when kind='project') under a class."""
    cls = get_class_by_id_or_slug(class_identifier)
    if not cls:
        return None

    clean_name = name.strip()
    base_slug = slugify(clean_name)
    if base_slug in RESERVED_SUBJECT_SLUGS:
        base_slug = f"{base_slug}-subject"
    now_iso = datetime.utcnow().isoformat() + "Z"
    new_id = f"subj-{uuid.uuid4().hex[:8]}"

    with _get_conn() as conn:
        cursor = conn.cursor()
        # Next order index
        cursor.execute("SELECT COALESCE(MAX(order_index), -1) + 1 FROM lms_subjects WHERE class_id = ?", (cls["id"],))
        next_order = cursor.fetchone()[0]

        # Unique slug within class
        cursor.execute("SELECT id FROM lms_subjects WHERE class_id = ? AND slug = ?", (cls["id"], base_slug))
        slug = base_slug
        suffix = 1
        while cursor.fetchone():
            slug = f"{base_slug}-{suffix}"
            suffix += 1
            cursor.execute("SELECT id FROM lms_subjects WHERE class_id = ? AND slug = ?", (cls["id"], slug))

        cursor.execute("""
            INSERT INTO lms_subjects (
                id, class_id, name, slug, description, ai_context, kind,
                project_context, context_source_name, accent_color, order_index, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, cls["id"], clean_name, slug, description or "", ai_context or "",
            "project" if kind == "project" else "subject",
            project_context or "", context_source_name or "", accent_color or "", next_order, now_iso, now_iso,
        ))
        conn.commit()

    return get_subject_by_id_or_slug(cls["id"], new_id)


def update_subject(
    subject_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    ai_context: Optional[str] = None,
    project_context: Optional[str] = None,
    context_source_name: Optional[str] = None,
    accent_color: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update subject name, description, ai_context, or (for projects) README context."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, class_id, name, description, ai_context, project_context, context_source_name, accent_color FROM lms_subjects WHERE id = ?",
            (subject_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None

        current = dict(row)
        now_iso = datetime.utcnow().isoformat() + "Z"
        new_name = name.strip() if name is not None else current["name"]
        new_desc = description if description is not None else current["description"]
        new_ai_ctx = ai_context if ai_context is not None else current.get("ai_context", "")
        new_project_ctx = project_context if project_context is not None else (current.get("project_context") or "")
        new_source_name = context_source_name if context_source_name is not None else (current.get("context_source_name") or "")
        new_accent = accent_color if accent_color is not None else (current.get("accent_color") or "")

        cursor.execute("""
            UPDATE lms_subjects
            SET name = ?, description = ?, ai_context = ?, project_context = ?, context_source_name = ?, accent_color = ?, updated_at = ?
            WHERE id = ?
        """, (new_name, new_desc, new_ai_ctx, new_project_ctx, new_source_name, new_accent, now_iso, subject_id))
        conn.commit()

        return get_subject_by_id_or_slug(current["class_id"], subject_id)


def delete_subject(subject_id: str) -> bool:
    """Delete a subject and cascade delete its lessons."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lms_subjects WHERE id = ?", (subject_id,))
        conn.commit()
        return cursor.rowcount > 0


def save_project_plan(subject_id: str, plan: List[Dict[str, Any]]) -> None:
    """Persist a project's implementation-module outline (list of {title, focus, lesson_id})."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    with _get_conn() as conn:
        conn.execute(
            "UPDATE lms_subjects SET project_plan = ?, updated_at = ? WHERE id = ?",
            (json.dumps(plan), now_iso, subject_id),
        )
        conn.commit()


def save_context_summary(subject_id: str, summary: str) -> None:
    """Persist an AI-condensed version of this row's long-form context. Cleared (empty
    string) reverts generation prompts to the raw-text-prefix behavior."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    with _get_conn() as conn:
        conn.execute(
            "UPDATE lms_subjects SET context_summary = ?, updated_at = ? WHERE id = ?",
            (summary, now_iso, subject_id),
        )
        conn.commit()


# Note: RAG chunk storage/retrieval used to live here as ai_lms-specific tables and
# functions. It's now modules/common/rag/ (chunk+embed+store+retrieve, generic over
# any (namespace, owner_id)) so other modules can reuse it too -- see
# modules/ai_lms/router.py's build_rag_index/clear_rag_index/_retrieve_relevant_chunks
# for how this module calls into it as namespace="ai_lms_subject".


# ─────────────────────────────────────────────────────────────────────────────
# Lesson Operations
# ─────────────────────────────────────────────────────────────────────────────

def get_lessons_by_subject(subject_id: str) -> List[Dict[str, Any]]:
    """Get metadata for all lessons in a subject ordered by order_index."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                id, class_id, subject_id, title, slug, order_index, source_type, summary, read_time_minutes, created_at, updated_at
            FROM lms_lessons
            WHERE subject_id = ?
            ORDER BY order_index ASC, created_at ASC
        """, (subject_id,))
        return [dict(r) for r in cursor.fetchall()]


def get_direct_lessons_by_class(class_identifier: str) -> List[Dict[str, Any]]:
    """Get metadata for all direct lessons under a class (where subject_id is null)."""
    cls = get_class_by_id_or_slug(class_identifier)
    if not cls:
        return []

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                id, class_id, subject_id, title, slug, order_index, source_type, summary, read_time_minutes, created_at, updated_at
            FROM lms_lessons
            WHERE class_id = ? AND subject_id IS NULL
            ORDER BY order_index ASC, created_at ASC
        """, (cls["id"],))
        return [dict(r) for r in cursor.fetchall()]


def get_lesson_by_id(
    lesson_id: str,
    class_identifier: Optional[str] = None,
    subject_identifier: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Get complete lesson record including generated_html.

    Lesson slugs are only unique per class in nextjs-api mode, so a lookup by slug should
    pass the class (and subject) it came from; an exact id match always wins. Before
    returning, any IDE edit of the lesson's .html file is pulled into the DB, so every
    caller (viewer, AI revise/embed, update_lesson) works on what's on disk."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                l.id, l.class_id, l.subject_id, l.title, l.slug, l.order_index, 
                l.source_type, l.source_content, l.generated_html, l.summary, 
                l.read_time_minutes, l.created_at, l.updated_at, l.file_path, l.file_hash,
                c.name as class_name, c.slug as class_slug,
                s.name as subject_name, s.slug as subject_slug, s.kind as subject_kind
            FROM lms_lessons l
            JOIN lms_classes c ON l.class_id = c.id
            LEFT JOIN lms_subjects s ON l.subject_id = s.id
            WHERE (l.id = ? OR l.slug = ?)
              AND (? = '' OR c.id = ? OR c.slug = ?)
              AND (? = '' OR s.id = ? OR s.slug = ?)
            ORDER BY CASE WHEN l.id = ? THEN 0 ELSE 1 END, l.created_at ASC
            LIMIT 1
        """, (
            lesson_id, lesson_id,
            class_identifier or "", class_identifier or "", class_identifier or "",
            subject_identifier or "", subject_identifier or "", subject_identifier or "",
            lesson_id,
        ))
        row = cursor.fetchone()
        if not row:
            return None
        lesson = dict(row)

    from .class_folders import refresh_lesson  # late import: class_folders imports this module

    lesson = refresh_lesson(lesson)
    lesson["content_hash"] = content_hash(lesson.get("generated_html"))
    return lesson


def create_lesson(
    class_id: str,
    subject_id: Optional[str],
    title: str,
    source_type: str,
    source_content: Optional[str],
    generated_html: str,
    summary: Optional[str] = None,
    read_time_minutes: int = 5,
) -> Dict[str, Any]:
    """Create a new lesson under a class and optional subject."""
    clean_title = title.strip()
    base_slug = slugify(clean_title)
    new_id = f"lesson-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.utcnow().isoformat() + "Z"

    with _get_conn() as conn:
        cursor = conn.cursor()

        # Compute next order index within the subject (or within class if no subject)
        if subject_id:
            cursor.execute(
                "SELECT COALESCE(MAX(order_index), -1) + 1 FROM lms_lessons WHERE subject_id = ?",
                (subject_id,),
            )
        else:
            cursor.execute(
                "SELECT COALESCE(MAX(order_index), -1) + 1 FROM lms_lessons WHERE class_id = ? AND subject_id IS NULL",
                (class_id,),
            )
        next_order = cursor.fetchone()[0]

        # Ensure slug uniqueness
        cursor.execute("SELECT id FROM lms_lessons WHERE slug = ?", (base_slug,))
        slug = base_slug
        suffix = 1
        while cursor.fetchone():
            slug = f"{base_slug}-{suffix}"
            suffix += 1
            cursor.execute("SELECT id FROM lms_lessons WHERE slug = ?", (slug,))

        cursor.execute("""
            INSERT INTO lms_lessons (
                id, class_id, subject_id, title, slug, order_index,
                source_type, source_content, generated_html, summary,
                read_time_minutes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id,
            class_id,
            subject_id,
            clean_title,
            slug,
            next_order,
            source_type,
            source_content or "",
            generated_html,
            summary or "",
            read_time_minutes,
            now_iso,
            now_iso,
        ))
        conn.commit()

    return get_lesson_by_id(new_id)  # type: ignore


def update_lesson(
    lesson_id: str,
    title: Optional[str] = None,
    generated_html: Optional[str] = None,
    summary: Optional[str] = None,
    order_index: Optional[int] = None,
    read_time_minutes: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Update lesson content or metadata."""
    current = get_lesson_by_id(lesson_id)
    if not current:
        return None

    now_iso = datetime.utcnow().isoformat() + "Z"
    new_title = title.strip() if title is not None else current["title"]
    new_html = generated_html if generated_html is not None else current["generated_html"]
    new_summary = summary if summary is not None else current["summary"]
    new_order = order_index if order_index is not None else current["order_index"]
    new_read_time = read_time_minutes if read_time_minutes is not None else current["read_time_minutes"]

    if new_html != current["generated_html"]:
        from .class_folders import record_backup  # late import: class_folders imports this module

        # The last few versions stay recoverable, whichever side (app or IDE) replaced them.
        record_backup("lesson", current["id"], current.get("file_path") or "", current["generated_html"], "replaced by an app edit")

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE lms_lessons
            SET title = ?, generated_html = ?, summary = ?, order_index = ?, read_time_minutes = ?, updated_at = ?
            WHERE id = ?
        """, (new_title, new_html, new_summary, new_order, new_read_time, now_iso, current["id"]))
        conn.commit()

    return get_lesson_by_id(current["id"])


def delete_lesson(lesson_id: str) -> bool:
    """Delete a lesson."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lms_lessons WHERE id = ? OR slug = ?", (lesson_id, lesson_id))
        conn.commit()
        return cursor.rowcount > 0


def reorder_classes(class_ids: List[str]) -> bool:
    """Batch reorder classes according to the order of IDs/slugs in the list."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    with _get_conn() as conn:
        cursor = conn.cursor()
        for idx, cid in enumerate(class_ids):
            cursor.execute(
                "UPDATE lms_classes SET order_index = ?, updated_at = ? WHERE id = ? OR slug = ?",
                (idx, now_iso, cid, cid),
            )
        conn.commit()
    return True


def reorder_subjects(subject_ids: List[str]) -> bool:
    """Batch reorder subjects according to the order of IDs/slugs in the list."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    with _get_conn() as conn:
        cursor = conn.cursor()
        for idx, sid in enumerate(subject_ids):
            cursor.execute(
                "UPDATE lms_subjects SET order_index = ?, updated_at = ? WHERE id = ? OR slug = ?",
                (idx, now_iso, sid, sid),
            )
        conn.commit()
    return True


def reorder_lessons(lesson_ids: List[str]) -> bool:
    """Batch reorder lessons according to the order of IDs in the list."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    with _get_conn() as conn:
        cursor = conn.cursor()
        for idx, lid in enumerate(lesson_ids):
            cursor.execute(
                "UPDATE lms_lessons SET order_index = ?, updated_at = ? WHERE id = ?",
                (idx, now_iso, lid),
            )
        conn.commit()
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Navigation & Progress Operations
# ─────────────────────────────────────────────────────────────────────────────

def get_lesson_navigation(lesson_id: str) -> Optional[Dict[str, Any]]:
    """Compute previous and next lessons strictly within the current subject or fallback class."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        return None

    with _get_conn() as conn:
        cursor = conn.cursor()
        if lesson["subject_id"]:
            cursor.execute("""
                SELECT id, slug, title, order_index
                FROM lms_lessons
                WHERE subject_id = ?
                ORDER BY order_index ASC, created_at ASC
            """, (lesson["subject_id"],))
        else:
            cursor.execute("""
                SELECT id, slug, title, order_index
                FROM lms_lessons
                WHERE class_id = ? AND subject_id IS NULL
                ORDER BY order_index ASC, created_at ASC
            """, (lesson["class_id"],))

        siblings = [dict(r) for r in cursor.fetchall()]

    curr_idx = -1
    for i, s in enumerate(siblings):
        if s["id"] == lesson["id"]:
            curr_idx = i
            break

    prev_lesson = siblings[curr_idx - 1] if curr_idx > 0 else None
    next_lesson = siblings[curr_idx + 1] if curr_idx < len(siblings) - 1 else None

    return {
        "current_index": curr_idx + 1,  # 1-indexed for display (e.g. Lesson 4 of 12)
        "total_lessons": len(siblings),
        "previous": prev_lesson,
        "next": next_lesson,
    }


def record_lesson_view(lesson_id: str, user_id: Optional[int] = None) -> None:
    """Record an authentic lesson view for Continue Learning."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    progress_id = f"prog-{uuid.uuid4().hex[:8]}"

    with _get_conn() as conn:
        cursor = conn.cursor()
        # Find existing progress row
        if user_id:
            cursor.execute("SELECT id FROM lms_user_progress WHERE user_id = ? AND lesson_id = ?", (user_id, lesson_id))
        else:
            cursor.execute("SELECT id FROM lms_user_progress WHERE user_id IS NULL AND lesson_id = ?", (lesson_id,))

        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE lms_user_progress SET last_viewed_at = ? WHERE id = ?",
                (now_iso, row["id"]),
            )
        else:
            cursor.execute("""
                INSERT INTO lms_user_progress (id, user_id, lesson_id, completed, last_viewed_at)
                VALUES (?, ?, ?, 0, ?)
            """, (progress_id, user_id, lesson_id, now_iso))
        conn.commit()


def mark_lesson_completed(lesson_id: str, completed: bool = True, user_id: Optional[int] = None) -> bool:
    """Mark a lesson as completed or in-progress."""
    now_iso = datetime.utcnow().isoformat() + "Z"
    with _get_conn() as conn:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("SELECT id FROM lms_user_progress WHERE user_id = ? AND lesson_id = ?", (user_id, lesson_id))
        else:
            cursor.execute("SELECT id FROM lms_user_progress WHERE user_id IS NULL AND lesson_id = ?", (lesson_id,))

        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE lms_user_progress SET completed = ?, last_viewed_at = ? WHERE id = ?",
                (1 if completed else 0, now_iso, row["id"]),
            )
        else:
            prog_id = f"prog-{uuid.uuid4().hex[:8]}"
            cursor.execute("""
                INSERT INTO lms_user_progress (id, user_id, lesson_id, completed, last_viewed_at)
                VALUES (?, ?, ?, ?, ?)
            """, (prog_id, user_id, lesson_id, 1 if completed else 0, now_iso))
        conn.commit()
    return True


def get_continue_learning(user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Retrieve the authentic last-viewed lesson and progress."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("""
                SELECT lesson_id, completed, last_viewed_at
                FROM lms_user_progress
                WHERE user_id = ?
                ORDER BY datetime(last_viewed_at) DESC
                LIMIT 1
            """, (user_id,))
        else:
            cursor.execute("""
                SELECT lesson_id, completed, last_viewed_at
                FROM lms_user_progress
                ORDER BY datetime(last_viewed_at) DESC
                LIMIT 1
            """)

        row = cursor.fetchone()
        if not row:
            # Fall back to most recently created lesson if any
            cursor.execute("SELECT id FROM lms_lessons ORDER BY datetime(created_at) DESC LIMIT 1")
            fallback = cursor.fetchone()
            if not fallback:
                return None
            target_lesson_id = fallback["id"]
            is_completed = 0
            last_viewed = None
        else:
            target_lesson_id = row["lesson_id"]
            is_completed = row["completed"] if "completed" in row.keys() else 0
            last_viewed = row["last_viewed_at"] if "last_viewed_at" in row.keys() else None

    lesson = get_lesson_by_id(target_lesson_id)
    if not lesson:
        return None

    nav = get_lesson_navigation(target_lesson_id)
    next_info = None
    if nav and nav.get("next"):
        next_info = {
            "id": nav["next"]["id"],
            "title": nav["next"]["title"],
            "slug": nav["next"]["slug"],
        }

    return {
        "lesson_id": lesson["id"],
        "lesson_title": lesson["title"],
        "lesson_slug": lesson["slug"],
        "class_id": lesson["class_id"],
        "class_name": lesson["class_name"],
        "class_slug": lesson["class_slug"],
        "subject_id": lesson["subject_id"],
        "subject_name": lesson["subject_name"],
        "subject_slug": lesson["subject_slug"],
        "current_index": nav["current_index"] if nav else 1,
        "total_lessons": nav["total_lessons"] if nav else 1,
        "completed": bool(is_completed),
        "next_lesson": next_info,
        "read_time_minutes": lesson.get("read_time_minutes", 5),
        "last_viewed_at": last_viewed,
    }


def get_recent_lessons(user_id: Optional[int] = None, limit: int = 5) -> List[Dict[str, Any]]:
    """Retrieve multiple recent lessons to allow quick switching across active learning tracks."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("""
                SELECT lesson_id, completed, last_viewed_at
                FROM lms_user_progress
                WHERE user_id = ?
                ORDER BY datetime(last_viewed_at) DESC
                LIMIT ?
            """, (user_id, limit))
        else:
            cursor.execute("""
                SELECT lesson_id, completed, last_viewed_at
                FROM lms_user_progress
                ORDER BY datetime(last_viewed_at) DESC
                LIMIT ?
            """, (limit,))
        rows = cursor.fetchall()

    results = []
    seen_ids = set()
    for row in rows:
        lid = row["lesson_id"]
        if lid in seen_ids:
            continue
        seen_ids.add(lid)
        lesson = get_lesson_by_id(lid)
        if not lesson:
            continue
        nav = get_lesson_navigation(lid)
        next_info = None
        if nav and nav.get("next"):
            next_info = {
                "id": nav["next"]["id"],
                "title": nav["next"]["title"],
                "slug": nav["next"]["slug"],
            }
        results.append({
            "lesson_id": lesson["id"],
            "lesson_title": lesson["title"],
            "lesson_slug": lesson["slug"],
            "class_id": lesson["class_id"],
            "class_name": lesson["class_name"],
            "class_slug": lesson["class_slug"],
            "subject_id": lesson["subject_id"],
            "subject_name": lesson["subject_name"],
            "subject_slug": lesson["subject_slug"],
            "current_index": nav["current_index"] if nav else 1,
            "total_lessons": nav["total_lessons"] if nav else 1,
            "completed": bool(row["completed"] if "completed" in row.keys() else 0),
            "next_lesson": next_info,
            "read_time_minutes": lesson.get("read_time_minutes", 5),
            "last_viewed_at": row["last_viewed_at"] if "last_viewed_at" in row.keys() else None,
        })
    return results


# ─────────────────────────────────────────────────────────────────────────────
# Search
# ─────────────────────────────────────────────────────────────────────────────

def search_lms(query: str) -> Dict[str, Any]:
    """Search across classes, subjects, and lesson titles."""
    term = f"%{query.strip()}%"
    with _get_conn() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, name, slug, description, icon, is_system
            FROM lms_classes
            WHERE name LIKE ? OR description LIKE ?
            LIMIT 6
        """, (term, term))
        classes = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT s.id, s.class_id, s.name, s.slug, s.description, s.kind, c.name as class_name, c.slug as class_slug
            FROM lms_subjects s
            JOIN lms_classes c ON s.class_id = c.id
            WHERE s.name LIKE ? OR s.description LIKE ?
            LIMIT 10
        """, (term, term))
        subjects = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT l.id, l.class_id, l.subject_id, l.title, l.slug, l.summary,
                   c.name as class_name, c.slug as class_slug,
                   s.name as subject_name, s.slug as subject_slug
            FROM lms_lessons l
            JOIN lms_classes c ON l.class_id = c.id
            LEFT JOIN lms_subjects s ON l.subject_id = s.id
            WHERE l.title LIKE ? OR l.summary LIKE ?
            LIMIT 15
        """, (term, term))
        lessons = [dict(r) for r in cursor.fetchall()]

    return {
        "query": query,
        "classes": classes,
        "subjects": subjects,
        "lessons": lessons,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Instructor Operations
# ─────────────────────────────────────────────────────────────────────────────

def get_all_instructors() -> List[Dict[str, Any]]:
    """Get all instructors with their assigned class details."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, slug, type, title, bio, email, avatar, expertise, learning_style, learning_style_prompt, ai_persona, ai_chatbot_enabled, rating, created_at, updated_at
            FROM lms_instructors
            ORDER BY type DESC, name ASC
        """)
        instructors = [dict(r) for r in cursor.fetchall()]

        for inst in instructors:
            cursor.execute("""
                SELECT c.id, c.name, c.slug, c.icon
                FROM lms_classes c
                JOIN lms_class_instructors ci ON ci.class_id = c.id
                WHERE ci.instructor_id = ?
                ORDER BY c.name ASC
            """, (inst["id"],))
            classes = [dict(r) for r in cursor.fetchall()]
            inst["assigned_classes"] = classes
            inst["assigned_class_ids"] = [c["id"] for c in classes]
            inst["expertise"] = [e.strip() for e in (inst["expertise"] or "").split(",") if e.strip()]

        return instructors


def get_instructor_by_id_or_slug(identifier: str) -> Optional[Dict[str, Any]]:
    """Get instructor by ID or slug."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, slug, type, title, bio, email, avatar, expertise, learning_style, learning_style_prompt, ai_persona, ai_chatbot_enabled, rating, created_at, updated_at
            FROM lms_instructors
            WHERE id = ? OR slug = ?
        """, (identifier, identifier))
        row = cursor.fetchone()
        if not row:
            return None

        inst = dict(row)
        cursor.execute("""
            SELECT c.id, c.name, c.slug, c.icon
            FROM lms_classes c
            JOIN lms_class_instructors ci ON ci.class_id = c.id
            WHERE ci.instructor_id = ?
            ORDER BY c.name ASC
        """, (inst["id"],))
        classes = [dict(r) for r in cursor.fetchall()]
        inst["assigned_classes"] = classes
        inst["assigned_class_ids"] = [c["id"] for c in classes]
        inst["expertise"] = [e.strip() for e in (inst["expertise"] or "").split(",") if e.strip()]

        return inst


def create_instructor(
    name: str,
    type: str = "ai",
    title: Optional[str] = None,
    bio: Optional[str] = None,
    email: Optional[str] = None,
    avatar: Optional[str] = None,
    expertise: Optional[str] = None,
    learning_style: Optional[str] = None,
    learning_style_prompt: Optional[str] = None,
    ai_persona: Optional[str] = None,
    ai_chatbot_enabled: int = 1,
    rating: float = 4.9,
    class_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a new instructor (Real or AI)."""
    clean_name = name.strip()
    base_slug = slugify(clean_name)
    now_iso = datetime.utcnow().isoformat() + "Z"
    new_id = f"inst-{uuid.uuid4().hex[:8]}"

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM lms_instructors WHERE slug = ?", (base_slug,))
        slug = base_slug
        suffix = 1
        while cursor.fetchone():
            slug = f"{base_slug}-{suffix}"
            suffix += 1
            cursor.execute("SELECT id FROM lms_instructors WHERE slug = ?", (slug,))

        cursor.execute("""
            INSERT INTO lms_instructors (id, name, slug, type, title, bio, email, avatar, expertise, learning_style, learning_style_prompt, ai_persona, ai_chatbot_enabled, rating, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            new_id, clean_name, slug, "real" if type == "real" else "ai",
            title or "", bio or "", email or "", avatar or "",
            expertise or "", learning_style or "", learning_style_prompt or "",
            ai_persona or "", 1 if ai_chatbot_enabled else 0, rating, now_iso, now_iso
        ))

        if class_ids:
            for c_id in class_ids:
                cursor.execute("""
                    INSERT OR IGNORE INTO lms_class_instructors (instructor_id, class_id)
                    VALUES (?, ?)
                """, (new_id, c_id))

        conn.commit()

    return get_instructor_by_id_or_slug(new_id)  # type: ignore


def update_instructor(
    instructor_id: str,
    name: Optional[str] = None,
    type: Optional[str] = None,
    title: Optional[str] = None,
    bio: Optional[str] = None,
    email: Optional[str] = None,
    avatar: Optional[str] = None,
    expertise: Optional[str] = None,
    learning_style: Optional[str] = None,
    learning_style_prompt: Optional[str] = None,
    ai_persona: Optional[str] = None,
    ai_chatbot_enabled: Optional[int] = None,
    rating: Optional[float] = None,
    class_ids: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Update an instructor's details and class assignments."""
    inst = get_instructor_by_id_or_slug(instructor_id)
    if not inst:
        return None

    now_iso = datetime.utcnow().isoformat() + "Z"
    new_name = name.strip() if name is not None else inst["name"]
    new_type = type if type is not None else inst.get("type", "ai")
    new_title = title if title is not None else inst["title"]
    new_bio = bio if bio is not None else inst["bio"]
    new_email = email if email is not None else inst["email"]
    new_avatar = avatar if avatar is not None else inst["avatar"]
    new_expertise = expertise if expertise is not None else (", ".join(inst["expertise"]) if isinstance(inst["expertise"], list) else inst["expertise"])
    new_learning_style = learning_style if learning_style is not None else inst.get("learning_style", "")
    new_learning_style_prompt = learning_style_prompt if learning_style_prompt is not None else inst.get("learning_style_prompt", "")
    new_ai_persona = ai_persona if ai_persona is not None else inst["ai_persona"]
    new_ai_chatbot_enabled = ai_chatbot_enabled if ai_chatbot_enabled is not None else inst.get("ai_chatbot_enabled", 1)
    new_rating = rating if rating is not None else inst["rating"]

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE lms_instructors
            SET name = ?, type = ?, title = ?, bio = ?, email = ?, avatar = ?, expertise = ?, learning_style = ?, learning_style_prompt = ?, ai_persona = ?, ai_chatbot_enabled = ?, rating = ?, updated_at = ?
            WHERE id = ?
        """, (
            new_name, new_type, new_title, new_bio, new_email, new_avatar,
            new_expertise, new_learning_style, new_learning_style_prompt, new_ai_persona, new_ai_chatbot_enabled, new_rating, now_iso, inst["id"]
        ))

        if class_ids is not None:
            cursor.execute("DELETE FROM lms_class_instructors WHERE instructor_id = ?", (inst["id"],))
            for c_id in class_ids:
                cursor.execute("""
                    INSERT OR IGNORE INTO lms_class_instructors (instructor_id, class_id)
                    VALUES (?, ?)
                """, (inst["id"], c_id))

        conn.commit()

    return get_instructor_by_id_or_slug(inst["id"])


def delete_instructor(instructor_id: str) -> bool:
    """Delete an instructor."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lms_instructors WHERE id = ? OR slug = ?", (instructor_id, instructor_id))
        conn.commit()
        return cursor.rowcount > 0

