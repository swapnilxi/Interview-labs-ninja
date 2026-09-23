from __future__ import annotations

import io
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import HTMLResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from pypdf import PdfReader

from modules.auth.security import decode_token
from modules.common.ai_client import AISettings, call_ai_text, extract_json_object
from .visual_engine import generate_native_visual, build_structured_lesson_html
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
    reorder_lessons,
    search_lms,
    update_class,
    update_lesson,
    update_subject,
)

router = APIRouter(prefix="/api/lms", tags=["AI LMS"])

_bearer_optional = HTTPBearer(auto_error=False)


def _get_optional_user_id(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_optional),
) -> Optional[int]:
    """Extract user_id from Bearer token if present, otherwise return None."""
    if not creds:
        return None
    claims = decode_token(creds.credentials)
    if not claims:
        return None
    try:
        return int(claims["sub"])
    except (KeyError, ValueError):
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreateClassRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=500)
    icon: Optional[str] = Field(default="BookmarkIcon")


class UpdateClassRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)
    icon: Optional[str] = Field(default=None)


class CreateSubjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(default="", max_length=500)


class UpdateSubjectRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)


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
    return create_class(payload.name, payload.description, payload.icon)


@router.get("/classes/{class_id_or_slug}")
async def get_class_detail(class_id_or_slug: str) -> Dict[str, Any]:
    """Get class metadata with subjects and direct lessons."""
    cls = get_class_by_id_or_slug(class_id_or_slug)
    if not cls:
        raise HTTPException(status_code=404, detail="Class not found.")
    return cls


@router.patch("/classes/{class_id_or_slug}")
async def handle_update_class(class_id_or_slug: str, payload: UpdateClassRequest) -> Dict[str, Any]:
    """Update class name, description, or icon."""
    updated = update_class(class_id_or_slug, payload.name, payload.description, payload.icon)
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
    created = create_subject(class_id_or_slug, payload.name, payload.description)
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
    """Update subject name or description."""
    updated = update_subject(subject_id, payload.name, payload.description)
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
        if payload.subject_id:
            subj = get_subject_by_id_or_slug(payload.class_id, payload.subject_id)
            if subj:
                subj_name = subj["name"]
        html_content = build_structured_lesson_html(
            title=payload.title,
            class_name=cls_name,
            subject_name=subj_name,
            content=payload.summary or payload.title,
            raw_ai_output=html_content,
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
    user_id: Optional[int] = Depends(_get_optional_user_id),
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
    user_id: Optional[int] = Depends(_get_optional_user_id),
) -> Dict[str, Any]:
    """Retrieve authentic continue learning information."""
    data = get_continue_learning(user_id)
    return {"item": data}


@router.post("/lessons/{lesson_id}/view")
async def record_view_endpoint(
    lesson_id: str,
    user_id: Optional[int] = Depends(_get_optional_user_id),
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
    if subject_id:
        subj = get_subject_by_id_or_slug(cls["id"], subject_id)
        if not subj:
            raise HTTPException(status_code=404, detail="Selected subject not found in this class.")
        subject_name = subj["name"]
        subject_id = subj["id"]
    else:
        # If class is NOT 'other' and has subjects, subject is recommended
        if cls["slug"] != "other":
            # Check if this class has existing subjects
            existing_subjs = get_subjects_by_class(cls["id"])
            if existing_subjs:
                # Use first subject if none specified
                subject_id = existing_subjs[0]["id"]
                subject_name = existing_subjs[0]["name"]

    source_desc = f"Input Mode: {payload.input_type.upper()}"
    raw_content = payload.content.strip()

    suggested_title = payload.title or (
        raw_content[:80].splitlines()[0] if payload.input_type == "topic" else f"Lesson on {raw_content[:40]}..."
    )

    system_prompt = f"""You are a world-class technical educator, staff software engineer, and interactive curriculum designer at the level of ByteByteGo and NeetCode.
Your task is to transform the provided source learning material into a comprehensive, highly pedagogical, and INTERACTIVE standalone HTML lesson.

Target Context:
- Class: {cls['name']}
- Subject: {subject_name if subject_name else 'Core Module'}
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

2. AESTHETICS & DESIGN DIRECTION (ByteByteGo + NeetCode + Modern Tech Documentation):
   - Professional, technical, content-first, beautiful dark-mode first design (with auto-detecting light/dark CSS variables).
   - Use clean typography with system font stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif; code font: 'Fira Code', 'JetBrains Mono', monospace.
   - Rich contrast, subtle borders (#2d3748 or rgba(255,255,255,0.1)), rounded corners (8px-12px), soft shadows.
   - Visual callout boxes (Key Takeaway, Tip, Warning, Deep Dive).

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

4. CONTENT STRUCTURE:
   - Lesson Header: Class & Subject breadcrumb badge, Clear descriptive Title, Read Time badge (~5-10 min).
   - Learning Objectives: 3-4 bullet goals.
   - Core Concepts & Fundamentals: Intuitive explanation with real-world analogies.
   - Visual Architecture / Diagram: Clean inline SVG or interactive visual component illustrating the mental model.
   - Deep Dive & Mechanics: System trade-offs, edge cases, formulas/complexities if applicable.
   - Practical Code Examples: Clean syntax-highlighted code blocks with a working "Copy Code" button.
   - Interactive Knowledge Check / Quiz: At least 2 interactive multiple choice questions with clickable options that show immediate green/red feedback, explanation of why each choice is right or wrong, and a score counter.
   - Summary Table or Key Takeaways checklist.

5. SAFETY & INTERACTIVITY:
   - All interactive JavaScript (quiz clicks, copy buttons, tabs, visual controls) must be self-contained and run cleanly inside a sandboxed iframe without errors.
   - No external CDNs required (all styles and scripts are embedded).
"""

    raw_ai_html = ""
    try:
        raw_ai_html = call_ai_text(system_prompt, payload)
    except Exception as exc:
        raw_ai_html = ""

    clean_html = _clean_ai_html_output(raw_ai_html) if raw_ai_html else ""
    if not clean_html or "<html" not in clean_html.lower() or len(clean_html) < 800 or "quiz-section" not in clean_html:
        clean_html = build_structured_lesson_html(
            title=suggested_title,
            class_name=cls["name"],
            subject_name=subject_name,
            content=raw_content,
            raw_ai_output=raw_ai_html,
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

3. RESPONSE CONTRACT:
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
        raw_resp = call_ai_text(visual_prompt, payload)
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
