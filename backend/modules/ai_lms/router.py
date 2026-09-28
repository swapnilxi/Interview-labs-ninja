from __future__ import annotations

import io
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader

from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings, call_ai_text, extract_json_object
from .visual_engine import (
    generate_native_visual,
    build_structured_lesson_html,
    PREMIUM_DESIGN_SYSTEM_PROMPT,
)
from .db import (
    create_class,
    create_lesson,
    create_subject,
    delete_class,
    delete_lesson,
    delete_subject,
    get_all_classes,
    get_class_by_id_or_slug,
    get_continue_learning,
    get_direct_lessons_by_class,
    get_lesson_by_id,
    get_lesson_navigation,
    get_lessons_by_subject,
    get_subject_by_id_or_slug,
    get_subjects_by_class,
    record_lesson_view,
    reorder_classes,
    reorder_lessons,
    reorder_subjects,
    search_lms,
    update_class,
    update_lesson,
    update_subject,
)

router = APIRouter(prefix="/api/lms", tags=["AI LMS"], dependencies=[Depends(get_current_user_id)])


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreateClassRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=1000)
    ai_context: Optional[str] = Field(default="", max_length=3000)
    icon: Optional[str] = Field(default="BookmarkIcon")


class UpdateClassRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    ai_context: Optional[str] = Field(default=None, max_length=3000)
    icon: Optional[str] = Field(default=None)


class CreateSubjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=1000)
    ai_context: Optional[str] = Field(default="", max_length=3000)


class UpdateSubjectRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    ai_context: Optional[str] = Field(default=None, max_length=3000)


class CreateLessonManualRequest(BaseModel):
    class_id: str
    subject_id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=200)
    generated_html: str = Field(..., min_length=10)
    summary: Optional[str] = Field(default="")
    read_time_minutes: Optional[int] = Field(default=5)


class UpdateLessonRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    generated_html: Optional[str] = Field(default=None, min_length=10)
    summary: Optional[str] = Field(default=None)
    order_index: Optional[int] = Field(default=None)


class ReorderClassesRequest(BaseModel):
    class_ids: List[str]


class ReorderSubjectsRequest(BaseModel):
    subject_ids: List[str]


class ReorderLessonsRequest(BaseModel):
    lesson_ids: List[str]


class GenerateLessonRequest(AISettings):
    class_id: str
    subject_id: Optional[str] = None
    input_type: str = "topic"  # "topic" | "text" | "file"
    content: str = Field(..., min_length=1)
    title: Optional[str] = None


class LessonVisualizeRequest(AISettings):
    concept: Optional[str] = None


class LessonEasyReadRequest(AISettings):
    pass


class LessonDeeperRequest(AISettings):
    pass


class LessonBreakdownRequest(AISettings):
    pass


class EmbedVisualRequest(BaseModel):
    visual_html: str = Field(..., min_length=10)
    title: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Classes Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/classes")
async def list_classes() -> List[Dict[str, Any]]:
    """List all classes with real computed subject and lesson counts."""
    return get_all_classes()


@router.post("/classes", status_code=status.HTTP_201_CREATED)
async def handle_create_class(payload: CreateClassRequest) -> Dict[str, Any]:
    """Create a new custom class."""
    return create_class(payload.name, payload.description, payload.icon, payload.ai_context)


@router.get("/classes/{class_id_or_slug}")
async def get_class_detail(class_id_or_slug: str) -> Dict[str, Any]:
    """Get class metadata with subjects and direct lessons."""
    cls = get_class_by_id_or_slug(class_id_or_slug)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found.")
    return cls


@router.patch("/classes/{class_id_or_slug}")
async def handle_update_class(class_id_or_slug: str, payload: UpdateClassRequest) -> Dict[str, Any]:
    """Update class name, description, ai_context, or icon."""
    updated = update_class(class_id_or_slug, payload.name, payload.description, payload.icon, payload.ai_context)
    if not updated:
        raise HTTPException(status_code=404, detail="Class not found.")
    return updated


@router.delete("/classes/{class_id_or_slug}")
async def handle_delete_class(class_id_or_slug: str) -> Dict[str, Any]:
    """Delete a custom class. System classes cannot be deleted."""
    success = delete_class(class_id_or_slug)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot delete class (system class or not found).")
    return {"status": "deleted", "id": class_id_or_slug}


# ─────────────────────────────────────────────────────────────────────────────
# Subjects Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/classes/{class_id_or_slug}/subjects")
async def list_subjects_for_class(class_id_or_slug: str) -> List[Dict[str, Any]]:
    """List all subjects within a class."""
    return get_subjects_by_class(class_id_or_slug)


@router.post("/classes/{class_id_or_slug}/subjects", status_code=status.HTTP_201_CREATED)
async def handle_create_subject(class_id_or_slug: str, payload: CreateSubjectRequest) -> Dict[str, Any]:
    """Create a subject under a specific class."""
    created = create_subject(class_id_or_slug, payload.name, payload.description, payload.ai_context)
    if not created:
        raise HTTPException(status_code=404, detail="Class not found.")
    return created


@router.get("/classes/{class_id_or_slug}/subjects/{subject_id_or_slug}")
async def get_subject_detail(class_id_or_slug: str, subject_id_or_slug: str) -> Dict[str, Any]:
    """Get subject details along with its ordered lesson list."""
    subj = get_subject_by_id_or_slug(class_id_or_slug, subject_id_or_slug)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return subj


@router.patch("/subjects/{subject_id}")
async def handle_update_subject(subject_id: str, payload: UpdateSubjectRequest) -> Dict[str, Any]:
    """Update subject name, description, or ai_context."""
    updated = update_subject(subject_id, payload.name, payload.description, payload.ai_context)
    if not updated:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return updated


@router.delete("/subjects/{subject_id}")
async def handle_delete_subject(subject_id: str) -> Dict[str, Any]:
    """Delete a subject and its associated lessons."""
    success = delete_subject(subject_id)
    if not success:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return {"status": "deleted", "id": subject_id}


# ─────────────────────────────────────────────────────────────────────────────
# Lessons Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/subjects/{subject_id}/lessons")
async def list_lessons_for_subject(subject_id: str) -> List[Dict[str, Any]]:
    """List metadata for all lessons in a subject ordered by order_index."""
    return get_lessons_by_subject(subject_id)


@router.get("/classes/{class_id_or_slug}/lessons")
async def list_direct_lessons_for_class(class_id_or_slug: str) -> List[Dict[str, Any]]:
    """List lessons directly under a class (where subject_id is null, e.g. Other)."""
    return get_direct_lessons_by_class(class_id_or_slug)


@router.post("/lessons", status_code=status.HTTP_201_CREATED)
async def handle_create_lesson(payload: CreateLessonManualRequest) -> Dict[str, Any]:
    """Manually create a lesson, ensuring full structured HTML."""
    html_content = payload.generated_html or ""
    if not html_content or len(html_content) < 500 or "<html" not in html_content.lower():
        cls = get_class_by_id_or_slug(payload.class_id)
        cls_name = cls["name"] if cls else "Engineering"
        subj_name = "General"
        subj_desc = ""
        subj_ai_ctx = ""
        if payload.subject_id:
            subj = get_subject_by_id_or_slug(payload.class_id, payload.subject_id)
            if subj:
                subj_name = subj["name"]
                subj_desc = subj.get("description", "") or ""
                subj_ai_ctx = subj.get("ai_context", "") or ""
        html_content = build_structured_lesson_html(
            title=payload.title,
            class_name=cls_name,
            subject_name=subj_name,
            content=payload.summary or payload.title,
            raw_ai_output=html_content,
            class_context=cls.get("ai_context", "") if cls else "",
            subject_context=subj_ai_ctx,
            class_description=cls.get("description", "") if cls else "",
            subject_description=subj_desc,
        )
    return create_lesson(
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        title=payload.title,
        source_type="manual",
        source_content="Manual entry",
        generated_html=html_content,
        summary=payload.summary or f"Manual lesson: {payload.title}",
        read_time_minutes=payload.read_time_minutes or 5,
    )


@router.get("/lessons/{lesson_id}")
async def get_lesson_detail(
    lesson_id: str,
    user_id: int = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """Retrieve full lesson details including generated HTML."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    # Record view automatically
    record_lesson_view(lesson["id"], user_id)
    return lesson


@router.patch("/lessons/{lesson_id}")
async def handle_update_lesson(lesson_id: str, payload: UpdateLessonRequest) -> Dict[str, Any]:
    """Update lesson title, HTML, summary, or order_index."""
    updated = update_lesson(
        lesson_id=lesson_id,
        title=payload.title,
        generated_html=payload.generated_html,
        summary=payload.summary,
        order_index=payload.order_index,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    return updated


@router.delete("/lessons/{lesson_id}")
async def handle_delete_lesson(lesson_id: str) -> Dict[str, Any]:
    """Delete a lesson."""
    success = delete_lesson(lesson_id)
    if not success:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    return {"status": "deleted", "id": lesson_id}


@router.post("/classes/reorder")
async def handle_reorder_classes(payload: ReorderClassesRequest) -> Dict[str, Any]:
    """Reorder a list of classes by order_index."""
    reorder_classes(payload.class_ids)
    return {"status": "reordered", "count": len(payload.class_ids)}


@router.post("/subjects/reorder")
async def handle_reorder_subjects(payload: ReorderSubjectsRequest) -> Dict[str, Any]:
    """Reorder a list of subjects by order_index."""
    reorder_subjects(payload.subject_ids)
    return {"status": "reordered", "count": len(payload.subject_ids)}


@router.post("/lessons/reorder")
async def handle_reorder_lessons(payload: ReorderLessonsRequest) -> Dict[str, Any]:
    """Reorder a list of lessons by order_index."""
    reorder_lessons(payload.lesson_ids)
    return {"status": "reordered", "count": len(payload.lesson_ids)}


@router.get("/lessons/{lesson_id}/navigation")
async def get_navigation_for_lesson(lesson_id: str) -> Dict[str, Any]:
    """Retrieve sequential previous & next lessons within current subject or class."""
    nav = get_lesson_navigation(lesson_id)
    if not nav:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    return nav


@router.get("/lessons/{lesson_id}/download")
async def download_lesson_html(lesson_id: str) -> Response:
    """Download the lesson as a standalone .html document with human-friendly filename."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    class_slug = lesson.get("class_slug") or "class"
    subject_slug = lesson.get("subject_slug") or ""
    lesson_slug = lesson.get("slug") or "lesson"

    if subject_slug:
        filename = f"{class_slug}-{subject_slug}-{lesson_slug}.html"
    else:
        filename = f"{class_slug}-{lesson_slug}.html"

    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "text/html; charset=utf-8",
    }
    return Response(content=lesson["generated_html"], media_type="text/html", headers=headers)


@router.get("/continue-learning")
async def get_continue_learning_data(
    user_id: int = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """Retrieve authentic continue learning information."""
    data = get_continue_learning(user_id)
    return {"item": data}


@router.post("/lessons/{lesson_id}/view")
async def record_view_endpoint(
    lesson_id: str,
    user_id: int = Depends(get_current_user_id),
) -> Dict[str, str]:
    """Explicitly record a lesson view."""
    record_lesson_view(lesson_id, user_id)
    return {"status": "ok"}


@router.get("/search")
async def search_endpoint(q: str = Query(..., min_length=1)) -> Dict[str, Any]:
    """Search across classes, subjects, and lessons."""
    return search_lms(q)


# ─────────────────────────────────────────────────────────────────────────────
# Source File Upload Extraction
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload-source")
async def upload_source_file(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Extract clean text content from an uploaded document (PDF, TXT, MD, DOCX)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = os.path.splitext(file.filename)[1].lower()
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    extracted_text = ""

    if ext == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            pages = [p.extract_text() or "" for p in reader.pages]
            extracted_text = "\n\n".join(pages).strip()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read PDF: {exc}")
    elif ext in (".txt", ".md", ".json", ".csv"):
        try:
            extracted_text = file_bytes.decode("utf-8", errors="replace").strip()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read text file: {exc}")
    elif ext == ".docx":
        try:
            import docx
            doc = docx.Document(io.BytesIO(file_bytes))
            extracted_text = "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()]).strip()
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read DOCX file: {exc}")
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Please upload a .pdf, .txt, .md, or .docx file.",
        )

    if not extracted_text:
        raise HTTPException(status_code=422, detail="No text content could be extracted from the file.")

    words = len(extracted_text.split())
    return {
        "filename": file.filename,
        "text": extracted_text,
        "word_count": words,
        "preview": extracted_text[:300] + ("..." if len(extracted_text) > 300 else ""),
    }


# ─────────────────────────────────────────────────────────────────────────────
# AI Lesson Generation
# ─────────────────────────────────────────────────────────────────────────────

def _clean_ai_html_output(raw_text: str) -> str:
    """Strip markdown code fence wrapper and extract pure HTML document."""
    text = raw_text.strip()

    # If wrapped in ```html ... ```
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()

    # Find <!DOCTYPE html> or <html>
    doc_idx = text.lower().find("<!doctype html")
    if doc_idx != -1:
        text = text[doc_idx:]
    else:
        html_idx = text.lower().find("<html")
        if html_idx != -1:
            text = text[html_idx:]

    # Find ending </html>
    end_idx = text.lower().rfind("</html>")
    if end_idx != -1:
        text = text[: end_idx + 7]

    return text.strip()


def _extract_title_from_html(html: str, fallback: str) -> str:
    """Extract title from <title> or <h1> tag."""
    t_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE)
    if t_match and t_match.group(1).strip():
        clean_title = t_match.group(1).strip()
        # Remove suffix like "| Lesson" or "- AI LMS"
        clean_title = re.split(r"[-|–—]", clean_title)[0].strip()
        if clean_title:
            return clean_title

    h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.IGNORECASE)
    if h1_match and h1_match.group(1).strip():
        # Strip internal tags
        clean_h1 = re.sub(r"<[^>]+>", "", h1_match.group(1)).strip()
        if clean_h1:
            return clean_h1

    return fallback


def _extract_summary_from_html(html: str, fallback: str) -> str:
    """Extract a brief 1-2 sentence summary from meta description or lead paragraph."""
    meta_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', html, re.IGNORECASE)
    if meta_match and meta_match.group(1).strip():
        return meta_match.group(1).strip()[:200]

    p_match = re.search(r"<p[^>]*class=[\"'].*?(?:lead|intro|summary).*?[\"'][^>]*>(.*?)</p>", html, re.IGNORECASE)
    if p_match and p_match.group(1).strip():
        return re.sub(r"<[^>]+>", "", p_match.group(1)).strip()[:200]

    p_first = re.search(r"<p[^>]*>(.*?)</p>", html, re.IGNORECASE)
    if p_first and p_first.group(1).strip():
        return re.sub(r"<[^>]+>", "", p_first.group(1)).strip()[:200]

    return fallback[:200]


@router.post("/lessons/generate", status_code=status.HTTP_201_CREATED)
async def generate_lesson(payload: GenerateLessonRequest) -> Dict[str, Any]:
    """Generate an interactive standalone HTML lesson using the configured AI provider."""
    # Verify class exists
    cls = get_class_by_id_or_slug(payload.class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Selected class not found.")

    subject_name = ""
    subject_id = payload.subject_id

    # If subject_id is provided, verify it exists under this class
    subject_desc = ""
    subject_ai_context = ""
    if subject_id:
        subj = get_subject_by_id_or_slug(cls["id"], subject_id)
        if not subj:
            raise HTTPException(status_code=404, detail="Selected subject not found in this class.")
        subject_name = subj["name"]
        subject_id = subj["id"]
        subject_desc = subj.get("description", "") or ""
        subject_ai_context = subj.get("ai_context", "") or ""
    else:
        # If class is NOT 'other' and has subjects, subject is recommended
        if cls["slug"] != "other":
            # Check if this class has existing subjects
            existing_subjs = get_subjects_by_class(cls["id"])
            if existing_subjs:
                # Use first subject if none specified
                subject_id = existing_subjs[0]["id"]
                subject_name = existing_subjs[0]["name"]
                subject_desc = existing_subjs[0].get("description", "") or ""
                subject_ai_context = existing_subjs[0].get("ai_context", "") or ""

    class_desc = cls.get("description", "") or ""
    class_ai_context = cls.get("ai_context", "") or ""

    source_desc = f"Input Mode: {payload.input_type.upper()}"
    raw_content = payload.content.strip()

    suggested_title = payload.title or (
        raw_content[:80].splitlines()[0] if payload.input_type == "topic" else f"Lesson on {raw_content[:40]}..."
    )

    class_context_section = f"\n- Class Description (for learners): {class_desc}" if class_desc else ""
    class_guidance_section = f"\n- Class AI Generation Guidance / Target Context: {class_ai_context}" if class_ai_context else ""
    subject_context_section = f"\n- Subject Description (for learners): {subject_desc}" if subject_desc else ""
    subject_guidance_section = f"\n- Subject AI Generation Guidance / Target Focus: {subject_ai_context}" if subject_ai_context else ""

    system_prompt = f"""You are a world-class technical educator, staff software engineer, and interactive curriculum designer at the level of ByteByteGo and NeetCode.
Your task is to transform the provided source learning material into a comprehensive, highly pedagogical, and INTERACTIVE standalone HTML lesson.

Target Domain & Guidance Context:
- Class: {cls['name']}{class_context_section}{class_guidance_section}
- Subject: {subject_name if subject_name else 'Core Module'}{subject_context_section}{subject_guidance_section}
- Source Mode: {payload.input_type}

Source Material:
\"\"\"
{raw_content}
\"\"\"

CRITICAL REQUIREMENTS & CONTRACT:
1. OUTPUT CONTRACT:
   - Output ONLY the complete, valid standalone HTML document.
   - Start immediately with <!DOCTYPE html> and end with </html>.
   - Do NOT include markdown code blocks like ```html ... ```.
   - Do NOT include intro chatter ("Here is your lesson...").
   - Everything (HTML, CSS, JavaScript) MUST be self-contained in this single document.

2. {PREMIUM_DESIGN_SYSTEM_PROMPT}

3. VISUALLY INTELLIGENT REINFORCEMENT (CRITICAL):
   - Do NOT rely only on written text and code. Determine which concepts benefit from visual explanation.
   - Use the BEST visual medium for the topic (using native inline SVG, HTML5 Canvas, or styled responsive CSS):
     * System Design / Architecture -> Clean inline SVG architecture diagram or request-flow with clients, load balancers, services, cache, and database.
     * Algorithms / DSA -> Interactive array/grid or pointer visualization (e.g. low/mid/high pointers, tree structure, or step simulation).
     * Machine Learning -> Visual loss curve, decision boundary, or neural network layer diagram.
     * Computer Vision / Images -> Feature map, convolutional kernel, or bounding box visualization.
     * Networking & Cloud -> Packet flow, protocol stack, or VPC network layout.
     * Leadership / Strategy -> Process decision flow or comparison matrix.
   - Do not force visuals into every section; use visuals where they accelerate intuition and clarity.
   - Style every diagram with the same CSS variables as the rest of the page (see design system above) so it reads as native content, not a pasted-in widget.

4. CONTENT STRUCTURE:
   - Lesson Header: Class & Subject breadcrumb badge, Clear descriptive Title, Read Time badge (~5-10 min).
   - Learning Objectives: 3-4 bullet goals.
   - Core Concepts & Fundamentals: Intuitive explanation with real-world analogies tailored to the Class and Subject domain.
   - Visual Architecture / Diagram: Clean inline SVG or interactive visual component illustrating the mental model.
   - Deep Dive & Mechanics: System trade-offs, edge cases, formulas/complexities if applicable.
   - Practical Code Examples: Clean syntax-highlighted code blocks with a working "Copy Code" button.
   - Interactive Knowledge Check / Quiz: At least 2 interactive multiple choice questions with clickable options that show immediate green/red feedback, explanation of why each choice is right or wrong, and a score counter.
   - Summary Table or Key Takeaways checklist.

5. SAFETY & INTERACTIVITY:
   - All interactive JavaScript (quiz clicks, copy buttons, tabs, visual controls) must be self-contained and run cleanly inside a sandboxed iframe without errors.
   - No external CDNs required (all styles and scripts are embedded).
"""

    try:
        raw_ai_html = call_ai_text(system_prompt, payload, max_tokens=16000)
    except Exception as exc:
        # Surface the real failure instead of silently substituting a generic,
        # topic-unaware template -- a lesson that looks legitimate but isn't actually
        # about what was asked for is worse than a visible error the user can retry.
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}")

    clean_html = _clean_ai_html_output(raw_ai_html)
    lower_html = clean_html.lower()
    # "quiz-section" used to be required here, but that's the *fallback* template's own
    # CSS class name (build_structured_lesson_html, used elsewhere for manual lessons)
    # -- the system prompt never asks the model to use that exact string, so real AI
    # output almost never matched and this discarded good generations nearly every call.
    has_content_markers = any(marker in lower_html for marker in ("quiz", "objective", "visual"))
    if not clean_html or "<html" not in lower_html or len(clean_html) < 800 or not has_content_markers:
        raise HTTPException(
            status_code=502,
            detail="The AI provider returned an incomplete or invalid response. Please try again.",
        )

    final_title = _extract_title_from_html(clean_html, suggested_title)
    final_summary = _extract_summary_from_html(clean_html, f"Interactive lesson on {final_title}")

    # Estimate read time based on word count
    word_count = len(re.sub(r"<[^>]+>", " ", clean_html).split())
    read_minutes = max(3, min(30, round(word_count / 180)))

    # Persist lesson to database
    lesson = create_lesson(
        class_id=cls["id"],
        subject_id=subject_id,
        title=final_title,
        source_type=payload.input_type,
        source_content=raw_content[:2000],  # store reference source
        generated_html=clean_html,
        summary=final_summary,
        read_time_minutes=read_minutes,
    )

    return lesson


# ─────────────────────────────────────────────────────────────────────────────
# Visual + Interactive Learning Upgrade
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/lessons/{lesson_id}/visualize")
async def visualize_lesson(lesson_id: str, payload: LessonVisualizeRequest) -> Dict[str, Any]:
    """Generate an interactive visual explanation (diagram, simulation, or chart) for a lesson concept."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    focus_concept = payload.concept.strip() if payload.concept else ""

    visual_prompt = f"""You are a world-class visual educator, interactive systems engineer, and technical illustrator at the level of ByteByteGo, 3Blue1Brown, and NeetCode.
Your task is to take the following lesson context and generate an intuitive, interactive, and visually stunning NATIVE WEB VISUALIZATION for the core concept.

Lesson Context:
- Title: {lesson['title']}
- Class: {lesson.get('class_name', '')}
- Subject: {lesson.get('subject_name', '') or 'General'}
- Specific Focus: {focus_concept if focus_concept else 'The most critical visual / architectural mechanism in this lesson'}
- Summary: {lesson.get('summary', '')}

VISUAL DECISION RULES:
1. Autonomously choose the BEST visual medium for this topic:
   - System Design / Architecture -> Request-flow / topology diagram with animated data pulses, labeled components, and clean inline SVG.
   - Algorithms & Data Structures -> Interactive step-by-step array or tree with pointer indicators (e.g. low, mid, high, active pointer) with interactive [Next Step], [Previous Step], and [Reset] buttons.
   - Machine Learning / Math -> Interactive HTML5 Canvas or SVG curve (e.g. loss landscape, gradient descent step, decision boundary) with a movable slider or click-to-step animation.
   - Networking & Systems -> Layered packet traversal or state machine with clickable states.
   - Process / Workflow -> High-clarity interactive timeline or branching decision tree.

2. NATIVE WEB TECH ONLY:
   - Use ONLY pure HTML, CSS, inline <svg>, and HTML5 <canvas> with vanilla JavaScript.
   - ZERO external CDN dependencies (no D3, no external scripts or stylesheets).
   - Everything must run safely inside a sandboxed container.

3. COLOR & THEME SAFETY (CRITICAL): This visual renders inside a page that supports BOTH
   light and dark mode via prefers-color-scheme. Any element you style must stay clearly
   readable in both:
   - Prefer CSS classes with `color: var(--text)`, `background: var(--card)`,
     `border-color: var(--border)` etc. over raw hex values, so the visual adapts
     automatically via the page's existing light/dark CSS variables.
   - If you draw raw SVG fills/strokes or Canvas colors that can't reference a CSS
     variable, choose mid-tone, moderately saturated colors (e.g. a blue like #4f7cff,
     not #0f172a or #f8fafc) that stay visible against BOTH a dark (#0f172a) and a light
     (#f7f3ec) background -- never rely on near-black or near-white for a shape's own
     fill/stroke, and never render text in a color that could match its background in
     either theme.

4. RESPONSE CONTRACT:
   Return a JSON object in EXACTLY this format:
   {{
     "visual_type": "Architecture Diagram" | "Interactive Simulation" | "Flowchart & Process" | "Data & Metric Visualization" | "State Machine",
     "title": "Clear concise title of the visual",
     "explanation": "2-3 sentences explaining the visual, the mental model, and how to interact with it.",
     "visual_html": "<div class=\\"lms-visualizer\\">...inline css, svg/canvas/html, and interactive js...</div>"
   }}
   Output ONLY the JSON object. No markdown code blocks before or after.
"""

    try:
        raw_resp = call_ai_text(visual_prompt, payload, max_tokens=8192)
        result = extract_json_object(raw_resp)
        if not result.get("visual_html"):
            raise ValueError("No visual_html in AI response")
        return {
            "visual_type": result.get("visual_type", "Interactive Visualization"),
            "title": result.get("title", f"Visual: {lesson['title']}"),
            "explanation": result.get("explanation", "Interactive visual demonstration of this core concept."),
            "visual_html": result.get("visual_html", ""),
        }
    except Exception as exc:
        print(f"[AI-LMS] Model visual generation notice: {exc}. Using native visual engine.")
        return generate_native_visual(lesson, focus_concept)


@router.post("/lessons/{lesson_id}/easy-read")
async def easy_read_lesson(lesson_id: str, payload: LessonEasyReadRequest) -> Dict[str, Any]:
    """Rewrite a lesson's existing content into a lighter, less text-heavy format:
    a short TL;DR, clear section headers, short paragraphs, and bullets in place of
    dense prose. Restructures the lesson's own content -- never invents new material."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    source_text = re.sub(r"<[^>]+>", " ", lesson.get("generated_html") or "")
    source_text = re.sub(r"\s+", " ", source_text).strip()[:8000]
    if not source_text:
        raise HTTPException(status_code=400, detail="Lesson has no content to simplify yet.")

    easy_read_prompt = f"""You are an expert technical editor who specializes in making dense material fast
and easy to read, without ever removing or dumbing down the actual technical substance.

Lesson title: {lesson['title']}
Lesson content (extracted, tags stripped):
\"\"\"
{source_text}
\"\"\"

Rewrite this content into an "easy read" version of the SAME material:
1. Start with a "Key Takeaways" list of 3-6 short bullets capturing the core ideas.
2. Break the rest into short sections, each with a clear, bold heading.
3. Keep paragraphs to 1-3 short sentences. Prefer bullet lists over dense prose wherever
   the source content is enumerable (steps, comparisons, properties, examples).
4. Bold the key terms a reader should remember.
5. Preserve every distinct technical fact, number, and example from the source -- you are
   restructuring for readability, not summarizing away detail or inventing new content.
6. Output ONLY semantic HTML for the body content (h2/h3, p, ul/li, strong, code) -- no
   <html>/<head>/<body> wrapper, no inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{{
  "title": "Lesson title, unchanged or lightly cleaned up",
  "summary": "One sentence describing what this easy-read view covers.",
  "easy_read_html": "<div class=\\"lms-easy-read\\">...semantic HTML only...</div>"
}}
Output ONLY the JSON object. No markdown code blocks before or after."""

    try:
        raw_resp = call_ai_text(easy_read_prompt, payload, max_tokens=8192)
        result = extract_json_object(raw_resp)
        if not result.get("easy_read_html"):
            raise ValueError("No easy_read_html in AI response")
        return {
            "title": result.get("title", lesson["title"]),
            "summary": result.get("summary", "A lighter, scannable version of this lesson."),
            "easy_read_html": result.get("easy_read_html", ""),
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Easy Read generation failed: {exc}")


@router.post("/lessons/{lesson_id}/deeper")
async def deeper_lesson(lesson_id: str, payload: LessonDeeperRequest) -> Dict[str, Any]:
    """Extend a lesson with a "go deeper" continuation: assumes the reader already
    understands the current lesson and adds genuinely new depth -- it never just
    repeats or rephrases what's already there."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    source_text = re.sub(r"<[^>]+>", " ", lesson.get("generated_html") or "")
    source_text = re.sub(r"\s+", " ", source_text).strip()[:8000]
    if not source_text:
        raise HTTPException(status_code=400, detail="Lesson has no content to go deeper on yet.")

    deeper_prompt = f"""You are a principal-level engineer who writes "go deeper" extensions for
technical lessons -- the reader has already read and understood the lesson below, so your job
is to extend it with material a solid intro lesson leaves out, not to repeat it.

Lesson title: {lesson['title']}
Lesson content (extracted, tags stripped) -- treat this as material the reader ALREADY KNOWS:
\"\"\"
{source_text}
\"\"\"

Write a deeper-dive extension of this SAME topic:
1. Do NOT re-explain the basics already covered above -- assume they're understood. Every
   sentence should teach something the source content didn't already say.
2. Cover what an intro lesson skips: edge cases and failure modes, the underlying mechanics
   or math, production/real-world trade-offs, common misconceptions, and how this connects to
   more advanced related topics.
3. Organize into short sections, each with a clear, bold heading.
4. Keep the same technical domain and terminology as the source -- this is a continuation,
   not a new topic.
5. Output ONLY semantic HTML for the body content (h2/h3, p, ul/li, strong, code) -- no
   <html>/<head>/<body> wrapper, no inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{{
  "title": "Lesson title, unchanged or lightly cleaned up",
  "summary": "One sentence describing what this deeper-dive extension covers.",
  "deeper_html": "<div class=\\"lms-deeper\\">...semantic HTML only...</div>"
}}
Output ONLY the JSON object. No markdown code blocks before or after."""

    try:
        raw_resp = call_ai_text(deeper_prompt, payload, max_tokens=8192)
        result = extract_json_object(raw_resp)
        if not result.get("deeper_html"):
            raise ValueError("No deeper_html in AI response")
        return {
            "title": result.get("title", lesson["title"]),
            "summary": result.get("summary", "A deeper dive into this lesson's material."),
            "deeper_html": result.get("deeper_html", ""),
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Explain Deeper generation failed: {exc}")


@router.post("/lessons/{lesson_id}/breakdown")
async def breakdown_lesson(lesson_id: str, payload: LessonBreakdownRequest) -> Dict[str, Any]:
    """Condense a lesson into a small number of short, high-signal chunks -- unlike Easy
    Read (which restructures for scannability but preserves every detail), this actively
    trims down to only the most essential, impactful point per chunk."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    source_text = re.sub(r"<[^>]+>", " ", lesson.get("generated_html") or "")
    source_text = re.sub(r"\s+", " ", source_text).strip()[:8000]
    if not source_text:
        raise HTTPException(status_code=400, detail="Lesson has no content to break down yet.")

    breakdown_prompt = f"""You are an expert at distilling dense technical material into a small
number of short, punchy, high-signal chunks for a reader who wants the essence fast.

Lesson title: {lesson['title']}
Lesson content (extracted, tags stripped):
\"\"\"
{source_text}
\"\"\"

Break this lesson down into 5-8 small chunks, in the same logical order as the source:
1. Each chunk = one short, bold micro-heading (a few words) + at most 2-3 sentences covering
   ONE idea -- the single most important point from that part of the lesson.
2. Actively trim: cut supporting detail, caveats, and examples that aren't essential to
   understanding the core idea. This is a condensed, high-impact skim version, not a
   restructuring that keeps everything -- prioritize clarity and brevity over completeness.
3. Every chunk should be independently readable and feel like a complete, standalone thought.
4. Output ONLY semantic HTML for the body content: a series of short <section> or <div>
   blocks each with one heading + a short paragraph. No <html>/<head>/<body> wrapper, no
   inline styles, no scripts.

Return a JSON object in EXACTLY this format:
{{
  "title": "Lesson title, unchanged or lightly cleaned up",
  "summary": "One sentence describing what this breakdown covers.",
  "chunk_count": 6,
  "breakdown_html": "<div class=\\"lms-breakdown\\">...semantic HTML only...</div>"
}}
Output ONLY the JSON object. No markdown code blocks before or after."""

    try:
        raw_resp = call_ai_text(breakdown_prompt, payload, max_tokens=8192)
        result = extract_json_object(raw_resp)
        if not result.get("breakdown_html"):
            raise ValueError("No breakdown_html in AI response")
        return {
            "title": result.get("title", lesson["title"]),
            "summary": result.get("summary", "A condensed, high-impact breakdown of this lesson."),
            "chunk_count": result.get("chunk_count"),
            "breakdown_html": result.get("breakdown_html", ""),
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Breakdown generation failed: {exc}")


@router.post("/lessons/{lesson_id}/embed-visual")
async def embed_visual_in_lesson(lesson_id: str, payload: EmbedVisualRequest) -> Dict[str, Any]:
    """Permanently embed a generated visual explanation into the lesson document."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    current_html = lesson["generated_html"]
    widget_title = payload.title or "Visual Explanation"

    visual_block = f"""
<!-- LMS Visual Reinforcement Component -->
<section class="lms-embedded-visual" style="margin: 2.5rem 0; padding: 1.5rem; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 1rem;">
  <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #38bdf8;"></span>
    <h3 style="margin: 0; color: #38bdf8; font-size: 1.1rem; font-weight: 700;">✨ Visual Reinforcement: {widget_title}</h3>
  </div>
  {payload.visual_html}
</section>
"""

    if "</body>" in current_html:
        updated_html = current_html.replace("</body>", f"{visual_block}\n</body>")
    else:
        updated_html = current_html + visual_block

    updated = update_lesson(lesson["id"], generated_html=updated_html)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to save visual to lesson.")
    return updated


# ─────────────────────────────────────────────────────────────────────────────
# Voice Assistant (spoken Q&A about the current lesson)
#
# Lesson-tutoring-specific: builds a prompt referencing "the lesson" the
# student is viewing, so it stays in ai_lms. The raw Deepgram STT/TTS calls
# that used to be proxied here too were never actually lesson-specific and
# have moved to the generic modules.voice package (POST /api/voice/stt,
# /api/voice/tts — see modules/voice/router.py) so any module can reuse them.
# Mirrors frontend/src/app/api/lms/voice-chat/route.ts (the Next.js path used
# when NEXT_PUBLIC_BACKEND_MODE=fastapi isn't set) so the voice assistant
# works identically under either backend.
# ─────────────────────────────────────────────────────────────────────────────

class VoiceChatRequest(AISettings):
    message: str = Field(..., min_length=1)
    contextTitle: Optional[str] = ""
    contextText: Optional[str] = ""


@router.post("/voice-chat")
async def voice_chat(payload: VoiceChatRequest) -> Dict[str, str]:
    """Answer a spoken question about the current lesson in 1-3 short sentences."""
    prompt = f"""You are a friendly, encouraging AI teaching assistant. The student is studying: {payload.contextTitle}.
Lesson context excerpt:
{(payload.contextText or "")[:2000]}

The student asked verbally: "{payload.message}"
Respond concisely in plain text (no markdown formatting, no code blocks, no asterisks). Your response will be spoken out loud via text-to-speech, so make it conversational, easy to understand, and brief (1-3 sentences max)."""
    try:
        response = call_ai_text(prompt, payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    spoken_text = re.sub(r"[*#_`]", "", response).strip()
    return {"text": spoken_text}
