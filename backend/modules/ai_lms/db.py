from __future__ import annotations

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

        # ── 4. User Progress Table ─────────────────────────────────────────────
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

        # ── 5. Seed Initial Classes (Idempotent) ────────────────────────────────
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
                c.id, c.name, c.slug, c.description, c.ai_context, c.icon, c.is_system, c.created_at, c.updated_at,
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
                c.id, c.name, c.slug, c.description, c.ai_context, c.icon, c.is_system, c.created_at, c.updated_at,
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
                s.id, s.class_id, s.name, s.slug, s.description, s.ai_context, s.order_index, s.created_at, s.updated_at,
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


def create_class(name: str, description: Optional[str] = None, icon: Optional[str] = None, ai_context: Optional[str] = None) -> Dict[str, Any]:
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
            INSERT INTO lms_classes (id, name, slug, description, ai_context, icon, is_system, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        """, (new_id, clean_name, slug, description or "", ai_context or "", icon or "BookmarkIcon", now_iso, now_iso))
        conn.commit()

    return get_class_by_id_or_slug(new_id)  # type: ignore


def update_class(identifier: str, name: Optional[str] = None, description: Optional[str] = None, icon: Optional[str] = None, ai_context: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Update class details."""
    cls = get_class_by_id_or_slug(identifier)
    if not cls:
        return None

    now_iso = datetime.utcnow().isoformat() + "Z"
    new_name = name.strip() if name is not None else cls["name"]
    new_desc = description if description is not None else cls["description"]
    new_icon = icon if icon is not None else cls["icon"]
    new_ai_ctx = ai_context if ai_context is not None else cls.get("ai_context", "")

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE lms_classes
            SET name = ?, description = ?, icon = ?, ai_context = ?, updated_at = ?
            WHERE id = ?
        """, (new_name, new_desc, new_icon, new_ai_ctx, now_iso, cls["id"]))
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
                s.id, s.class_id, s.name, s.slug, s.description, s.ai_context, s.order_index, s.created_at, s.updated_at,
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
                s.id, s.class_id, s.name, s.slug, s.description, s.ai_context, s.order_index, s.created_at, s.updated_at,
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
        return subject


def create_subject(class_identifier: str, name: str, description: Optional[str] = None, ai_context: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Create a new subject under a class."""
    cls = get_class_by_id_or_slug(class_identifier)
    if not cls:
        return None

    clean_name = name.strip()
    base_slug = slugify(clean_name)
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
            INSERT INTO lms_subjects (id, class_id, name, slug, description, ai_context, order_index, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (new_id, cls["id"], clean_name, slug, description or "", ai_context or "", next_order, now_iso, now_iso))
        conn.commit()

    return get_subject_by_id_or_slug(cls["id"], new_id)


def update_subject(subject_id: str, name: Optional[str] = None, description: Optional[str] = None, ai_context: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Update subject name, description, or ai_context."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, class_id, name, description, ai_context FROM lms_subjects WHERE id = ?", (subject_id,))
        row = cursor.fetchone()
        if not row:
            return None

        current = dict(row)
        now_iso = datetime.utcnow().isoformat() + "Z"
        new_name = name.strip() if name is not None else current["name"]
        new_desc = description if description is not None else current["description"]
        new_ai_ctx = ai_context if ai_context is not None else current.get("ai_context", "")

        cursor.execute("""
            UPDATE lms_subjects
            SET name = ?, description = ?, ai_context = ?, updated_at = ?
            WHERE id = ?
        """, (new_name, new_desc, new_ai_ctx, now_iso, subject_id))
        conn.commit()

        return get_subject_by_id_or_slug(current["class_id"], subject_id)


def delete_subject(subject_id: str) -> bool:
    """Delete a subject and cascade delete its lessons."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM lms_subjects WHERE id = ?", (subject_id,))
        conn.commit()
        return cursor.rowcount > 0


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


def get_lesson_by_id(lesson_id: str) -> Optional[Dict[str, Any]]:
    """Get complete lesson record including generated_html."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                l.id, l.class_id, l.subject_id, l.title, l.slug, l.order_index, 
                l.source_type, l.source_content, l.generated_html, l.summary, 
                l.read_time_minutes, l.created_at, l.updated_at,
                c.name as class_name, c.slug as class_slug,
                s.name as subject_name, s.slug as subject_slug
            FROM lms_lessons l
            JOIN lms_classes c ON l.class_id = c.id
            LEFT JOIN lms_subjects s ON l.subject_id = s.id
            WHERE l.id = ? OR l.slug = ?
        """, (lesson_id, lesson_id))
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)


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

    with _get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE lms_lessons
            SET title = ?, generated_html = ?, summary = ?, order_index = ?, updated_at = ?
            WHERE id = ?
        """, (new_title, new_html, new_summary, new_order, now_iso, current["id"]))
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


def get_continue_learning(user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Retrieve the authentic last-viewed lesson and progress."""
    with _get_conn() as conn:
        cursor = conn.cursor()
        if user_id:
            cursor.execute("""
                SELECT lesson_id, last_viewed_at
                FROM lms_user_progress
                WHERE user_id = ?
                ORDER BY datetime(last_viewed_at) DESC
                LIMIT 1
            """, (user_id,))
        else:
            cursor.execute("""
                SELECT lesson_id, last_viewed_at
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
        else:
            target_lesson_id = row["lesson_id"]

    lesson = get_lesson_by_id(target_lesson_id)
    if not lesson:
        return None

    nav = get_lesson_navigation(target_lesson_id)

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
    }


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
            SELECT s.id, s.class_id, s.name, s.slug, s.description, c.name as class_name, c.slug as class_slug
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
