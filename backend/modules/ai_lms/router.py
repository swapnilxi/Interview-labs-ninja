from __future__ import annotations

import io
import os
import re
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pypdf import PdfReader

from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings, NoEmbeddingProviderError, call_ai_text, extract_json_object
from modules.common.rag import clear_index as rag_clear_index
from modules.common.rag import index_document as rag_index_document
from modules.common.rag import index_status as rag_index_status
from modules.common.rag import retrieve as rag_retrieve
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
    save_context_summary,
    save_project_plan,
    search_lms,
    update_class,
    update_lesson,
    update_subject,
)

router = APIRouter(prefix="/api/lms", tags=["AI LMS"], dependencies=[Depends(get_current_user_id)])


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Schemas
# ─────────────────────────────────────────────────────────────────────────────

# Stored README/context can be one or several whole uploaded docs; only a prefix of
# each is sent to the LLM, so storage can stay generous without blowing up prompt cost.
PROJECT_CONTEXT_MAX_CHARS = 400_000
PROJECT_CONTEXT_PROMPT_CHARS = 16_000
# Class/Subject ai_context can likewise now be built from multiple uploaded docs plus
# typed text; stored size is generous but only a prefix is ever sent per generation
# call, since (unlike project_context) it's re-included on EVERY lesson in that
# class/subject, not just once per project-plan/module call.
AI_CONTEXT_MAX_CHARS = 100_000
AI_CONTEXT_PROMPT_CHARS = 8_000
# RAG retrieval chunk size -- deliberately much smaller than the prompt-insertion
# budgets above, since these chunks are meant to be individually retrievable, precise
# excerpts (see rag/index endpoints + _retrieve_relevant_chunks), not one big blob.
RAG_CHUNK_CHAR_SIZE = 2_000
RAG_TOP_K = 5

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
    ai_context: Optional[str] = Field(default="", max_length=AI_CONTEXT_MAX_CHARS)
    kind: Literal["subject", "project"] = "subject"
    project_context: Optional[str] = Field(default="", max_length=PROJECT_CONTEXT_MAX_CHARS)
    # Comma-joined names of every file the context was extracted from (subject or
    # project) -- purely a display label ("From: a.pdf, b.docx"), not sent to the LLM.
    context_source_name: Optional[str] = Field(default="", max_length=2000)


class UpdateSubjectRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)
    ai_context: Optional[str] = Field(default=None, max_length=AI_CONTEXT_MAX_CHARS)
    project_context: Optional[str] = Field(default=None, max_length=PROJECT_CONTEXT_MAX_CHARS)
    context_source_name: Optional[str] = Field(default=None, max_length=2000)


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
    read_time_minutes: Optional[int] = Field(default=None, ge=1, le=240)


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


class ProjectPlanRequest(AISettings):
    pass


class ProjectModuleGenerateRequest(AISettings):
    pass


STEP_CONTEXT_MAX_CHARS = 60_000
STEP_CONTEXT_PROMPT_CHARS = 12_000


class ReorderProjectPlanRequest(BaseModel):
    # None = reorder top-level modules; otherwise reorder that module's sublessons.
    module_index: Optional[int] = None
    from_index: int
    to_index: int


class SuggestPlacementRequest(AISettings):
    context: str = Field(..., min_length=1, max_length=STEP_CONTEXT_MAX_CHARS)
    title: Optional[str] = Field(default="", max_length=200)


class AddProjectStepRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    focus: Optional[str] = Field(default="", max_length=1000)
    context: Optional[str] = Field(default="", max_length=STEP_CONTEXT_MAX_CHARS)
    # None = insert a top-level module; otherwise insert a sublesson into that module.
    module_index: Optional[int] = None
    # Index the new step takes in its list (clamped to the list's bounds).
    position: int = 0


class SummarizeContextRequest(AISettings):
    pass


class RagIndexRequest(AISettings):
    pass


class LessonVisualizeRequest(AISettings):
    concept: Optional[str] = None


class LessonEasyReadRequest(AISettings):
    pass


class LessonDeeperRequest(AISettings):
    pass


LESSON_REVISE_HTML_MAX_CHARS = 90_000


class LessonReviseRequest(AISettings):
    # "update" edits the existing HTML in place; "regenerate" rebuilds the lesson from its source.
    mode: Literal["update", "regenerate"] = "update"
    instruction: str = Field(default="", max_length=4000)


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
    created = create_subject(
        class_id_or_slug,
        payload.name,
        payload.description,
        payload.ai_context,
        kind=payload.kind,
        project_context=payload.project_context,
        context_source_name=payload.context_source_name,
    )
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
    updated = update_subject(
        subject_id,
        payload.name,
        payload.description,
        payload.ai_context,
        project_context=payload.project_context,
        context_source_name=payload.context_source_name,
    )
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


@router.post("/subjects/{subject_id}/summarize-context")
async def summarize_context(subject_id: str, payload: SummarizeContextRequest) -> Dict[str, Any]:
    """AI-condense this row's long-form context (project_context for a project,
    ai_context for a subject) into a compact, information-dense summary.

    Once stored, generation prompts prefer this summary over a raw-text prefix (see
    _generate_lesson_content / plan_project_modules), so a long multi-document upload's
    substance reaches the prompt instead of being silently cut off past the raw-prefix
    character budget -- the efficient alternative to standing up a vector-DB/RAG
    pipeline for what is, here, a small, fixed number of single-shot generation calls
    rather than open-ended conversational retrieval."""
    subj = get_subject_by_id_or_slug_any_class(subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    is_project = subj.get("kind") == "project"
    field_label = "project README / context" if is_project else "AI generation guidance context"
    raw_text = ((subj.get("project_context") if is_project else subj.get("ai_context")) or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail=f"No {field_label} to summarize yet.")

    target_chars = PROJECT_CONTEXT_PROMPT_CHARS if is_project else AI_CONTEXT_PROMPT_CHARS
    summarize_prompt = f"""You are condensing a long {field_label} so it can be used efficiently in future AI
prompts, without losing anything a downstream generation step would need.

Source text:
\"\"\"
{raw_text[:100_000]}
\"\"\"

Produce a dense, structured summary that:
1. Preserves every concrete fact a generator would need: goals, tech stack, constraints,
   APIs/endpoints, schemas, numbers, names, and scope boundaries -- do not vaguely
   paraphrase these away.
2. Cuts prose, repetition, and filler that doesn't change what gets built or how.
3. Uses short headed sections or bullets, not a single wall of text.
4. Stays well under {target_chars} characters.

Output ONLY the summary text. No preamble, no markdown code fences."""

    try:
        summary = call_ai_text(summarize_prompt, payload, max_tokens=4096).strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Summarization failed: {exc}")

    if not summary:
        raise HTTPException(status_code=502, detail="The AI provider returned an empty summary. Please try again.")

    save_context_summary(subj["id"], summary)
    return get_subject_by_id_or_slug(subj["class_id"], subj["id"])  # type: ignore


@router.delete("/subjects/{subject_id}/summarize-context")
async def clear_context_summary(subject_id: str) -> Dict[str, Any]:
    """Discard the stored AI summary, reverting generation prompts to a raw-text prefix."""
    subj = get_subject_by_id_or_slug_any_class(subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    save_context_summary(subj["id"], "")
    return get_subject_by_id_or_slug(subj["class_id"], subj["id"])  # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
# RAG: chunk + embed + retrieve a subject/project's raw context
#
# All the actual chunk/embed/store/retrieve logic lives in modules.common.rag --
# a generic pipeline any module can use for any (namespace, owner_id), not just
# this one (see that package's docstring). Everything below is ai_lms's thin
# domain-specific wrapper: it resolves a subject_id to its raw context text, does
# the one ai_lms-specific bit (splitting multi-file-upload text on its own
# "--- File: name ---" markers so a chunk never straddles two unrelated
# documents), and calls straight into the shared package for the rest.
#
# Indexing (POST /rag/index) is a user-triggered action, not automatic on every
# save, since it costs real embedding-API calls -- same reasoning as Summarize &
# Store being a button rather than running on every keystroke. Retrieval
# (_retrieve_relevant_chunks) runs automatically inside _generate_lesson_content
# whenever a subject/project has an index, pulling the chunks most relevant to
# THIS specific module/lesson (its title/focus, or its topic for a plain Subject
# lesson) as grounding material alongside the compressed context_summary -- the
# summary carries the big picture, retrieved chunks carry precise, sourced detail
# a compressed summary alone might not preserve.
# ─────────────────────────────────────────────────────────────────────────────

# Namespaces this table in the shared rag_chunks store from any other module's
# rows (see modules/common/rag's docstring on (namespace, owner_id)).
RAG_NAMESPACE = "ai_lms_subject"

_FILE_MARKER_RE = re.compile(r"^--- File: (.+?) ---$", re.MULTILINE)


def _split_into_file_sections(text: str) -> List[Tuple[str, str]]:
    """Split raw multi-file-upload text on its "--- File: name ---" markers (see
    extract_multiple_files on the frontend) into (source_label, text) sections, one
    per uploaded file -- passed to modules.common.rag.index_document so a chunk
    never straddles two unrelated documents. Falls back to one unlabeled section
    for plain typed text or a single-file upload."""
    matches = list(_FILE_MARKER_RE.finditer(text))
    if not matches:
        return [("", text.strip())]
    sections: List[Tuple[str, str]] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections.append((m.group(1).strip(), text[start:end].strip()))
    return sections


@router.post("/subjects/{subject_id}/rag/index")
async def build_rag_index(subject_id: str, payload: RagIndexRequest) -> Dict[str, Any]:
    """Chunk this row's raw long-form context and embed each chunk, replacing any
    previous index. Requires an embedding-capable provider (OpenAI key, Gemini key,
    or a reachable local Ollama) -- raises a clear, actionable 400 if none is
    configured, rather than a bare 500, since this is an optional enhancement on top
    of context_summary (which works with any provider), not a hard requirement."""
    subj = get_subject_by_id_or_slug_any_class(subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    is_project = subj.get("kind") == "project"
    field_label = "project README / context" if is_project else "AI generation guidance context"
    raw_text = ((subj.get("project_context") if is_project else subj.get("ai_context")) or "").strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail=f"No {field_label} to index yet.")

    sections = _split_into_file_sections(raw_text)
    try:
        chunk_count = rag_index_document(RAG_NAMESPACE, subj["id"], sections, payload, chunk_size=RAG_CHUNK_CHAR_SIZE)
    except NoEmbeddingProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding failed: {exc}")

    if chunk_count == 0:
        raise HTTPException(status_code=400, detail="Nothing to index -- the context is empty after cleanup.")

    updated = get_subject_by_id_or_slug(subj["class_id"], subj["id"])
    return {**updated, "rag_chunk_count": chunk_count}  # type: ignore


@router.delete("/subjects/{subject_id}/rag/index")
async def clear_rag_index(subject_id: str) -> Dict[str, Any]:
    """Drop this row's RAG index. Generation falls back to context_summary / a raw
    prefix, exactly as if it had never been indexed."""
    subj = get_subject_by_id_or_slug_any_class(subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    rag_clear_index(RAG_NAMESPACE, subj["id"])
    updated = get_subject_by_id_or_slug(subj["class_id"], subj["id"])
    return {**updated, "rag_chunk_count": 0}  # type: ignore


@router.get("/subjects/{subject_id}/rag/index")
async def get_rag_index_status(subject_id: str) -> Dict[str, Any]:
    """Chunk count for this row's RAG index (0 if never built) -- lets the UI show
    indexed/not-indexed status without fetching the whole subject."""
    subj = get_subject_by_id_or_slug_any_class(subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return {"subject_id": subj["id"], "rag_chunk_count": rag_index_status(RAG_NAMESPACE, subj["id"])}


def _retrieve_relevant_chunks(subject_id: str, query_text: str, ai: AISettings, top_k: int = RAG_TOP_K) -> List[Dict[str, Any]]:
    """Thin ai_lms-scoped wrapper over modules.common.rag.retrieve. Returns []
    (never raises) if nothing is indexed or embedding the query fails -- retrieval
    is a best-effort enhancement on top of context_summary, not a hard dependency
    of generation."""
    return rag_retrieve(RAG_NAMESPACE, subject_id, query_text, ai, top_k=top_k)


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
        read_time_minutes=payload.read_time_minutes,
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


def _generate_lesson_content(
    cls: Dict[str, Any],
    subj: Optional[Dict[str, Any]],
    input_type: str,
    raw_content: str,
    ai: AISettings,
    fallback_title: str,
    extra_instructions: str = "",
) -> Tuple[str, str, str, int]:
    """Run the lesson-generation prompt and validate the output.

    Shared by one-off lesson generation and project implementation modules, so both
    produce the same lesson schema. When `subj` is a project, its README/context is
    included in the prompt. Returns (html, title, summary, read_minutes); raises
    HTTPException(502) if the provider fails or returns unusable HTML.
    """
    subject_name = subj["name"] if subj else ""
    subject_desc = (subj.get("description") or "") if subj else ""
    is_project = bool(subj) and subj.get("kind") == "project"
    # A stored AI summary (see save_context_summary / the /summarize-context endpoint)
    # is preferred over a naive raw-text prefix when present -- it's denser, so more of
    # the source document's substance actually reaches the prompt within the same
    # character budget, instead of silently dropping everything past the prefix cutoff.
    context_summary = (subj.get("context_summary") or "").strip() if subj else ""
    subject_ai_context = (
        context_summary if (context_summary and not is_project) else ((subj.get("ai_context") or "") if subj else "")
    ).strip()[:AI_CONTEXT_PROMPT_CHARS]
    raw_project_context = (subj.get("project_context") or "").strip() if is_project else ""
    project_context = (context_summary if (context_summary and is_project) else raw_project_context)[
        :PROJECT_CONTEXT_PROMPT_CHARS
    ]

    class_desc = cls.get("description", "") or ""
    class_ai_context = (cls.get("ai_context", "") or "").strip()[:AI_CONTEXT_PROMPT_CHARS]

    subject_label = "Project" if is_project else "Subject"
    class_context_section = f"\n- Class Description (for learners): {class_desc}" if class_desc else ""
    class_guidance_section = f"\n- Class AI Generation Guidance / Target Context: {class_ai_context}" if class_ai_context else ""
    subject_context_section = f"\n- {subject_label} Description (for learners): {subject_desc}" if subject_desc else ""
    subject_guidance_section = f"\n- {subject_label} AI Generation Guidance / Target Focus: {subject_ai_context}" if subject_ai_context else ""
    project_context_section = (
        f'\n- Project README / Context (the project the learner is building):\n"""\n{project_context}\n"""'
        if project_context else ""
    )
    extra_section = f"\n{extra_instructions.strip()}\n" if extra_instructions.strip() else ""

    # RAG: pull the source-context chunks most relevant to THIS specific module/lesson
    # (best-effort -- [] if nothing's indexed, or if embedding the query fails, so this
    # never blocks generation). context_summary above carries the big picture; these
    # excerpts carry precise, sourced detail a compressed summary can drop.
    retrieved_chunks = _retrieve_relevant_chunks(subj["id"], f"{fallback_title}\n{raw_content[:1000]}", ai) if subj else []
    retrieved_context_section = ""
    if retrieved_chunks:
        excerpts = "\n\n".join(f"[{c['source_label'] or 'source'}]\n{c['content']}" for c in retrieved_chunks)
        retrieved_context_section = f"""

Retrieved Relevant Context (grounded excerpts from the actual source document(s) for
this specific module/lesson -- ground implementation-level specifics in these over
generic/invented detail wherever they apply):
\"\"\"
{excerpts}
\"\"\""""

    system_prompt = f"""You are a world-class technical educator, staff software engineer, and interactive curriculum designer at the level of ByteByteGo and NeetCode.
Your task is to transform the provided source learning material into a comprehensive, highly pedagogical, and INTERACTIVE standalone HTML lesson.

Target Domain & Guidance Context:
- Class: {cls['name']}{class_context_section}{class_guidance_section}
- {subject_label}: {subject_name if subject_name else 'Core Module'}{subject_context_section}{subject_guidance_section}{project_context_section}
- Source Mode: {input_type}

Source Material:
\"\"\"
{raw_content}
\"\"\"
{extra_section}{retrieved_context_section}
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
        raw_ai_html = call_ai_text(system_prompt, ai, max_tokens=16000)
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

    final_title = _extract_title_from_html(clean_html, fallback_title)
    final_summary = _extract_summary_from_html(clean_html, f"Interactive lesson on {final_title}")

    # Estimate read time based on word count
    word_count = len(re.sub(r"<[^>]+>", " ", clean_html).split())
    read_minutes = max(3, min(30, round(word_count / 180)))

    return clean_html, final_title, final_summary, read_minutes


@router.post("/lessons/generate", status_code=status.HTTP_201_CREATED)
async def generate_lesson(payload: GenerateLessonRequest) -> Dict[str, Any]:
    """Generate an interactive standalone HTML lesson using the configured AI provider."""
    # Verify class exists
    cls = get_class_by_id_or_slug(payload.class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Selected class not found.")

    subj: Optional[Dict[str, Any]] = None
    if payload.subject_id:
        # If subject_id is provided, verify it exists under this class
        subj = get_subject_by_id_or_slug(cls["id"], payload.subject_id)
        if not subj:
            raise HTTPException(status_code=404, detail="Selected subject not found in this class.")
    elif cls["slug"] != "other":
        # If class is NOT 'other' and has subjects, use the first one if none specified
        existing_subjs = get_subjects_by_class(cls["id"])
        if existing_subjs:
            subj = get_subject_by_id_or_slug(cls["id"], existing_subjs[0]["id"])

    raw_content = payload.content.strip()
    suggested_title = payload.title or (
        raw_content[:80].splitlines()[0] if payload.input_type == "topic" else f"Lesson on {raw_content[:40]}..."
    )

    clean_html, final_title, final_summary, read_minutes = _generate_lesson_content(
        cls, subj, payload.input_type, raw_content, payload, suggested_title
    )

    # Persist lesson to database
    return create_lesson(
        class_id=cls["id"],
        subject_id=subj["id"] if subj else None,
        title=final_title,
        source_type=payload.input_type,
        source_content=raw_content[:2000],  # store reference source
        generated_html=clean_html,
        summary=final_summary,
        read_time_minutes=read_minutes,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Project Track: README/context -> AI-planned implementation modules
#
# A project is an lms_subjects row with kind='project'. Its modules are ordinary
# lessons (subject_id = project id), so the lesson viewer, navigation, download,
# and breadcrumbs all work unchanged. The outline lives in lms_subjects.project_plan
# as [{title, focus, lesson_id}], linking each planned module to its lesson.
# ─────────────────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    subj = None
    lesson_owner = get_subject_by_id_or_slug_any_class(project_id)
    if lesson_owner:
        subj = lesson_owner
    if not subj or subj.get("kind") != "project":
        raise HTTPException(status_code=404, detail="Project not found.")
    return subj["class"], subj


def get_subject_by_id_or_slug_any_class(subject_id: str) -> Optional[Dict[str, Any]]:
    """Projects are addressed by id in the /projects routes, so resolve the class first."""
    for cls in get_all_classes():
        subj = get_subject_by_id_or_slug(cls["id"], subject_id)
        if subj and subj["id"] == subject_id:
            return subj
    return None


def _flatten_plan_lesson_ids(plan: List[Dict[str, Any]]) -> List[str]:
    """Walk the plan tree in display order: each module's own lesson (if any), then its
    sublessons (if it's been broken down), then the next module."""
    ids: List[str] = []
    for item in plan:
        if item.get("lesson_id"):
            ids.append(item["lesson_id"])
        for sub in item.get("sublessons") or []:
            if sub.get("lesson_id"):
                ids.append(sub["lesson_id"])
    return ids


def _sync_project_lesson_order(project: Dict[str, Any], plan: List[Dict[str, Any]]) -> None:
    """Keep module/sublesson lessons in outline order; any other lessons in the project follow."""
    planned_ids = _flatten_plan_lesson_ids(plan)
    current = [l["id"] for l in get_lessons_by_subject(project["id"])]
    extras = [lid for lid in current if lid not in planned_ids]
    reorder_lessons([lid for lid in planned_ids if lid in current] + extras)


def _step_context_section(item: Dict[str, Any]) -> str:
    """User-supplied notes/findings attached to a step, folded into its generation brief."""
    ctx = (item.get("context") or "").strip()[:STEP_CONTEXT_PROMPT_CHARS]
    if not ctx:
        return ""
    return f'\n\nUser-provided context for this step (findings/notes/docs -- treat as authoritative):\n"""\n{ctx}\n"""'


def _build_implementation_extra_instructions(project_name: str, position_label: str, focus: str) -> str:
    """The 'this is a real implementation step, not a theory chapter' prompt contract shared by
    module and sublesson generation. Scopes each lesson to ~2 hours of real, verifiable work."""
    return (
        "PROJECT TRACK INSTRUCTIONS (CRITICAL -- this is an IMPLEMENTATION lesson, not a theory chapter):\n"
        f"- This lesson is {position_label} of an implementation roadmap for the project \"{project_name}\". "
        "The learner's whole goal is to move the project forward by actually building this specific piece: "
        f"{focus}\n"
        "- Optimize for implementation momentum, not content volume. Scope this lesson to what a learner can "
        "realistically implement AND verify in about ONE ~2-hour session, ending with one concrete artifact "
        "(working code, an endpoint, a schema/migration, a UI component, a passing test suite, etc). Do not "
        "pad it into a long theory article, and do not repeat the project README back at the learner -- get "
        "to implementation fast.\n"
        "- Structure the lesson around: Goal (what's being built), Prerequisites (what should already exist "
        "from earlier steps), Implementation (concrete steps, file/folder changes, and real code for the "
        "project's actual stack), Commands to run, Validation (how the learner verifies it works), and a "
        "closing 'Done When' checklist (e.g. \"Endpoint created\", \"Tests passing\").\n"
        "- Assume earlier steps in the roadmap are already done; build on them without re-teaching or "
        "re-implementing them. Briefly point to what comes next at the end.\n"
        "- Use the project README as the source of truth for goals, stack, scope and constraints."
    )


@router.post("/projects/{project_id}/plan")
async def plan_project_modules(project_id: str, payload: ProjectPlanRequest) -> Dict[str, Any]:
    """Ask the LLM to decompose the project README/context into an ordered module outline.

    Replaces any existing outline. Module lessons already generated from the previous
    outline are deleted, since the new outline no longer refers to them."""
    cls, project = _get_project_or_404(project_id)
    raw_project_context = (project.get("project_context") or "").strip()
    if not raw_project_context:
        raise HTTPException(status_code=400, detail="Add a README / project context before generating modules.")
    # Prefer the stored AI summary when present -- denser, so more of the source
    # document's substance reaches the prompt within the same character budget.
    context_summary = (project.get("context_summary") or "").strip()
    project_context = context_summary or raw_project_context

    class_desc = cls.get("description") or ""
    class_ai_context = (cls.get("ai_context") or "").strip()[:AI_CONTEXT_PROMPT_CHARS]
    project_desc = project.get("description") or ""
    project_ai_context = (project.get("ai_context") or "").strip()[:AI_CONTEXT_PROMPT_CHARS]

    plan_prompt = f"""You are a staff software engineer and curriculum designer. A learner wants to BUILD the
project described below and learn by implementing it step by step. Decompose it into an ordered
sequence of implementation modules -- each module will later become one hands-on lesson that
teaches how to implement that step of THIS project.

Context:
- Class: {cls['name']}{f"{chr(10)}- Class Description: {class_desc}" if class_desc else ""}{f"{chr(10)}- Class AI Guidance: {class_ai_context}" if class_ai_context else ""}
- Project: {project['name']}{f"{chr(10)}- Project Description: {project_desc}" if project_desc else ""}{f"{chr(10)}- Project AI Guidance: {project_ai_context}" if project_ai_context else ""}

Project README / Context:
\"\"\"
{project_context[:PROJECT_CONTEXT_PROMPT_CHARS]}
\"\"\"

Rules:
1. Optimize for implementation momentum, not fewer modules: each module must be small enough
   that a learner can realistically implement AND test it in about one focused ~2-hour session,
   producing one concrete artifact (an endpoint, a schema/migration, a UI component, a service,
   a middleware, a test suite, a config/deploy step, etc). If a natural step of the project is
   bigger than that (e.g. "Authentication"), split it into several sequential modules (e.g. "User
   Model & Password Hashing", "Login Endpoint", "JWT Middleware", "Protected Routes",
   "Authentication Tests") rather than one large module -- prefer more, smaller modules over a
   few big ones. This typically means more like 6-14 modules for a real project, not 4-6.
2. Order modules by implementation dependency (setup/architecture first, testing/deployment
   last); each module builds on the ones before it.
3. "focus" is 1-3 sentences on exactly what gets built in that module (components, files,
   endpoints, schema, config) and the key concepts it teaches.
4. Don't invent features the README doesn't call for; you may add essential glue steps
   (e.g. project setup, testing) that any real implementation needs.

Return a JSON object in EXACTLY this format:
{{
  "modules": [
    {{"title": "Project Setup & Architecture", "focus": "..."}}
  ]
}}
Output ONLY the JSON object. No markdown code blocks before or after."""

    try:
        raw_resp = call_ai_text(plan_prompt, payload, max_tokens=4096)
        result = extract_json_object(raw_resp)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Module planning failed: {exc}")

    modules = result.get("modules") if isinstance(result, dict) else None
    plan = [
        {
            "title": str(m.get("title")).strip()[:200],
            "focus": str(m.get("focus") or "").strip(),
            "lesson_id": None,
            "sublessons": [],  # populated on demand via the "Break Down" action
        }
        for m in (modules or [])
        if isinstance(m, dict) and str(m.get("title") or "").strip()
    ]
    if not plan:
        raise HTTPException(status_code=502, detail="The AI provider returned no modules. Please try again.")

    _delete_plan_lessons(project.get("project_plan") or [])
    save_project_plan(project["id"], plan)
    return get_subject_by_id_or_slug(cls["id"], project["id"])  # type: ignore


def _delete_plan_lessons(plan: List[Dict[str, Any]]) -> None:
    """Delete every lesson a plan (module + nested sublessons) currently points to."""
    for item in plan:
        if item.get("lesson_id"):
            delete_lesson(item["lesson_id"])
        _delete_plan_lessons(item.get("sublessons") or [])


@router.post("/projects/{project_id}/steps")
async def add_project_step(project_id: str, payload: AddProjectStepRequest) -> Dict[str, Any]:
    """Insert a user-authored module/sublesson at any point in the outline (e.g. a finding or
    extra step discovered mid-project). Ungenerated; existing lessons stay linked by id."""
    cls, project = _get_project_or_404(project_id)
    plan: List[Dict[str, Any]] = project.get("project_plan") or []
    item = {"title": payload.title.strip(), "focus": (payload.focus or "").strip(), "context": (payload.context or "").strip(), "lesson_id": None, "sublessons": []}
    if not item["title"]:
        raise HTTPException(status_code=422, detail="Title is required.")
    if payload.module_index is None:
        pos = max(0, min(payload.position, len(plan)))
        plan.insert(pos, item)
    else:
        if payload.module_index < 0 or payload.module_index >= len(plan):
            raise HTTPException(status_code=404, detail="Module not found in this project's outline.")
        module = plan[payload.module_index]
        subs = list(module.get("sublessons") or [])
        subs.insert(max(0, min(payload.position, len(subs))), item)
        plan[payload.module_index] = {**module, "sublessons": subs}
    save_project_plan(project["id"], plan)
    _sync_project_lesson_order(project, plan)
    return get_subject_by_id_or_slug(cls["id"], project["id"])  # type: ignore


def _outline_with_serials(plan: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for i, m in enumerate(plan):
        lines.append(f"{i + 1}. {m['title']} -- {m.get('focus') or ''}".rstrip(" -"))
        for j, sub in enumerate(m.get("sublessons") or []):
            lines.append(f"   {i + 1}.{j + 1} {sub['title']} -- {sub.get('focus') or ''}".rstrip(" -"))
    return "\n".join(lines)


def _serial_to_target(after: str, plan: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Map 'insert after <serial>' ('start', '3' or '2.1') to a step-insert target."""
    after = str(after or "").strip().lower()
    if after in ("0", "start"):
        return {"label": "at the start", "module_index": None, "position": 0}
    try:
        if "." in after:
            mi, sj = (int(x) for x in after.split(".", 1))
            subs = (plan[mi - 1].get("sublessons") or []) if 1 <= mi <= len(plan) else []
            if 1 <= sj <= len(subs):
                return {"label": f"after {mi}.{sj}", "module_index": mi - 1, "position": sj}
            return None
        mi = int(after)
    except (ValueError, IndexError):
        return None
    if 1 <= mi <= len(plan):
        return {"label": f"after {mi}", "module_index": None, "position": mi}
    return None


@router.post("/projects/{project_id}/suggest-placement")
async def suggest_project_step_placement(project_id: str, payload: SuggestPlacementRequest) -> Dict[str, Any]:
    """Recommend where new context (finding/notes) belongs in the outline, judged on each
    module's title and focus. Returns up to 3 ranked insert targets plus a suggested title/focus."""
    _cls, project = _get_project_or_404(project_id)
    plan: List[Dict[str, Any]] = project.get("project_plan") or []
    if not plan:
        raise HTTPException(status_code=400, detail="Generate the module outline first.")
    prompt = f"""You are placing a new step into a project's implementation roadmap.

Current outline (serial. title -- focus):
{_outline_with_serials(plan)}

New material from the learner{f' (working title: {payload.title})' if payload.title else ''}:
\"\"\"
{payload.context[:STEP_CONTEXT_PROMPT_CHARS]}
\"\"\"

Decide where a new step covering this material should be inserted so the roadmap stays in logical build order.
Return up to 3 ranked options. "after" is the serial the new step should come AFTER: "start", a module serial like "3", or a sub-step serial like "2.1" (use sub-step serials only to place inside a module's sub-steps). Also write a short "title" (max 80 chars) and a 1-2 sentence "focus" for the new step.

Return JSON exactly like:
{{"title": "...", "focus": "...", "suggestions": [{{"after": "3", "reason": "one short sentence"}}]}}
Output ONLY the JSON object."""
    try:
        result = extract_json_object(call_ai_text(prompt, payload, max_tokens=1024))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Placement suggestion failed: {exc}")
    suggestions: List[Dict[str, Any]] = []
    for s in (result.get("suggestions") if isinstance(result, dict) else None) or []:
        target = _serial_to_target(s.get("after"), plan) if isinstance(s, dict) else None
        if target and not any(
            t["module_index"] == target["module_index"] and t["position"] == target["position"] for t in suggestions
        ):
            suggestions.append({**target, "reason": str(s.get("reason") or "").strip()})
    if not suggestions:
        raise HTTPException(status_code=502, detail="The AI returned no usable placement. Please try again.")
    return {
        "title": str(result.get("title") or "").strip()[:200],
        "focus": str(result.get("focus") or "").strip()[:1000],
        "suggestions": suggestions[:3],
    }


@router.post("/projects/{project_id}/reorder")
async def reorder_project_plan(project_id: str, payload: ReorderProjectPlanRequest) -> Dict[str, Any]:
    """Move one module (or one sublesson within a module) to a new position in the outline."""
    cls, project = _get_project_or_404(project_id)
    plan: List[Dict[str, Any]] = project.get("project_plan") or []
    if payload.module_index is None:
        target = plan
    else:
        if payload.module_index < 0 or payload.module_index >= len(plan):
            raise HTTPException(status_code=404, detail="Module not found in this project's outline.")
        target = list(plan[payload.module_index].get("sublessons") or [])
    if not (0 <= payload.from_index < len(target)) or not (0 <= payload.to_index < len(target)):
        raise HTTPException(status_code=422, detail="Index out of range.")
    target.insert(payload.to_index, target.pop(payload.from_index))
    if payload.module_index is not None:
        plan[payload.module_index] = {**plan[payload.module_index], "sublessons": target}
    save_project_plan(project["id"], plan)
    _sync_project_lesson_order(project, plan)
    return get_subject_by_id_or_slug(cls["id"], project["id"])  # type: ignore


@router.post("/projects/{project_id}/modules/{module_index}/generate")
async def generate_project_module(
    project_id: str, module_index: int, payload: ProjectModuleGenerateRequest
) -> Dict[str, Any]:
    """Generate (or regenerate in place) the lesson for one planned implementation module."""
    cls, project = _get_project_or_404(project_id)
    plan: List[Dict[str, Any]] = project.get("project_plan") or []
    if module_index < 0 or module_index >= len(plan):
        raise HTTPException(status_code=404, detail="Module not found in this project's outline.")

    module = plan[module_index]
    outline = "\n".join(
        f"{i + 1}. {m['title']}{' <- THIS MODULE' if i == module_index else ''}" for i, m in enumerate(plan)
    )
    module_brief = (
        f"Implementation Module {module_index + 1} of {len(plan)}: {module['title']}\n"
        f"Module focus: {module.get('focus') or module['title']}\n\n"
        f"Full project module outline:\n{outline}"
        f"{_step_context_section(module)}"
    )
    extra = _build_implementation_extra_instructions(
        project["name"],
        f"module {module_index + 1} of {len(plan)}",
        module.get("focus") or module["title"],
    )

    clean_html, final_title, final_summary, read_minutes = _generate_lesson_content(
        cls, project, "project", module_brief, payload, module["title"], extra_instructions=extra
    )

    existing_id = module.get("lesson_id")
    if existing_id and get_lesson_by_id(existing_id):
        lesson = update_lesson(existing_id, title=final_title, generated_html=clean_html, summary=final_summary)
    else:
        lesson = create_lesson(
            class_id=cls["id"],
            subject_id=project["id"],
            title=final_title,
            source_type="project",
            source_content=module_brief[:2000],
            generated_html=clean_html,
            summary=final_summary,
            read_time_minutes=read_minutes,
        )

    plan[module_index] = {**module, "lesson_id": lesson["id"]}  # type: ignore[index]
    save_project_plan(project["id"], plan)
    _sync_project_lesson_order(project, plan)

    return {
        "lesson": lesson,
        "project": get_subject_by_id_or_slug(cls["id"], project["id"]),
    }


@router.post("/projects/{project_id}/modules/{module_index}/breakdown")
async def break_down_project_module(
    project_id: str, module_index: int, payload: ProjectModuleGenerateRequest
) -> Dict[str, Any]:
    """User-triggered: break one already-generated module lesson into smaller, sequential,
    independently-implementable sublessons.

    This reuses the app's existing "AI analyzes a lesson and chunks it" idea (see
    /lessons/{id}/breakdown, used elsewhere for an ephemeral prose skim view) but adapts it for
    Projects: instead of a read-only skim, it proposes a small ordered list of implementable
    sublesson titles, each of which becomes its own real, standalone, navigable lesson once
    generated via generate_project_sublesson. The original /lessons/{id}/breakdown endpoint and
    its ephemeral behavior for ordinary Subject lessons are untouched by this."""
    cls, project = _get_project_or_404(project_id)
    plan: List[Dict[str, Any]] = project.get("project_plan") or []
    if module_index < 0 or module_index >= len(plan):
        raise HTTPException(status_code=404, detail="Module not found in this project's outline.")

    module = plan[module_index]
    lesson_id = module.get("lesson_id")
    lesson = get_lesson_by_id(lesson_id) if lesson_id else None
    if not lesson:
        raise HTTPException(status_code=400, detail="Generate this module's lesson before breaking it down.")

    source_text = re.sub(r"<[^>]+>", " ", lesson.get("generated_html") or "")
    source_text = re.sub(r"\s+", " ", source_text).strip()[:8000]

    breakdown_prompt = f"""You are a staff engineer decomposing one implementation module of a larger project
into small, sequential, independently implementable sublessons.

Project: {project['name']}
Module {module_index + 1}: {module['title']}
Module focus: {module.get('focus') or module['title']}

The module's current lesson content (what it currently covers):
\"\"\"
{source_text}
\"\"\"

Break this module down into 2-6 smaller sublessons, each:
- Scoped to what a learner can implement AND verify in about ~2 hours or less.
- Focused on ONE concrete deliverable (for example, a module about authentication might split
  into "User Model & Password Hashing", "Login Endpoint", "JWT Middleware", "Protected Routes",
  "Authentication Tests").
- Ordered so each builds on the previous ones.

Return a JSON object in EXACTLY this format:
{{
  "sublessons": [
    {{"title": "User Model & Password Hashing", "focus": "..."}}
  ]
}}
Output ONLY the JSON object. No markdown code blocks before or after."""

    try:
        raw_resp = call_ai_text(breakdown_prompt, payload, max_tokens=2048)
        result = extract_json_object(raw_resp)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Breakdown failed: {exc}")

    raw_subs = result.get("sublessons") if isinstance(result, dict) else None
    sublessons = [
        {
            "title": str(s.get("title")).strip()[:200],
            "focus": str(s.get("focus") or "").strip(),
            "lesson_id": None,
            "sublessons": [],
        }
        for s in (raw_subs or [])
        if isinstance(s, dict) and str(s.get("title") or "").strip()
    ]
    if not sublessons:
        raise HTTPException(status_code=502, detail="The AI provider returned no sublessons. Please try again.")

    # Replace whatever this module was previously broken down into (and their lessons), if any.
    _delete_plan_lessons(module.get("sublessons") or [])
    plan[module_index] = {**module, "sublessons": sublessons}
    save_project_plan(project["id"], plan)

    return get_subject_by_id_or_slug(cls["id"], project["id"])  # type: ignore


@router.post("/projects/{project_id}/modules/{module_index}/sublessons/{sub_index}/generate")
async def generate_project_sublesson(
    project_id: str, module_index: int, sub_index: int, payload: ProjectModuleGenerateRequest
) -> Dict[str, Any]:
    """Generate (or regenerate in place) the standalone lesson for one sublesson produced by
    Break Down. Mirrors generate_project_module one level deeper."""
    cls, project = _get_project_or_404(project_id)
    plan: List[Dict[str, Any]] = project.get("project_plan") or []
    if module_index < 0 or module_index >= len(plan):
        raise HTTPException(status_code=404, detail="Module not found in this project's outline.")

    module = plan[module_index]
    sublessons: List[Dict[str, Any]] = list(module.get("sublessons") or [])
    if sub_index < 0 or sub_index >= len(sublessons):
        raise HTTPException(status_code=404, detail="Sublesson not found in this module.")

    sub = sublessons[sub_index]
    sibling_outline = "\n".join(
        f"  {i + 1}. {s['title']}{' <- THIS SUBLESSON' if i == sub_index else ''}" for i, s in enumerate(sublessons)
    )
    module_brief = (
        f"Implementation Module {module_index + 1} of {len(plan)}: {module['title']} "
        f"(module focus: {module.get('focus') or module['title']})\n\n"
        f"Sublesson {sub_index + 1} of {len(sublessons)}: {sub['title']}\n"
        f"Sublesson focus: {sub.get('focus') or sub['title']}\n\n"
        f"This module's sublesson breakdown:\n{sibling_outline}"
        f"{_step_context_section(sub)}"
    )
    extra = _build_implementation_extra_instructions(
        project["name"],
        f'sublesson {sub_index + 1} of {len(sublessons)} in module "{module["title"]}"',
        sub.get("focus") or sub["title"],
    )

    clean_html, final_title, final_summary, read_minutes = _generate_lesson_content(
        cls, project, "project", module_brief, payload, sub["title"], extra_instructions=extra
    )

    existing_id = sub.get("lesson_id")
    if existing_id and get_lesson_by_id(existing_id):
        lesson = update_lesson(existing_id, title=final_title, generated_html=clean_html, summary=final_summary)
    else:
        lesson = create_lesson(
            class_id=cls["id"],
            subject_id=project["id"],
            title=final_title,
            source_type="project",
            source_content=module_brief[:2000],
            generated_html=clean_html,
            summary=final_summary,
            read_time_minutes=read_minutes,
        )

    sublessons[sub_index] = {**sub, "lesson_id": lesson["id"]}
    plan[module_index] = {**module, "sublessons": sublessons}
    save_project_plan(project["id"], plan)
    _sync_project_lesson_order(project, plan)

    return {
        "lesson": lesson,
        "project": get_subject_by_id_or_slug(cls["id"], project["id"]),
    }


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


@router.post("/lessons/{lesson_id}/revise")
async def revise_lesson(lesson_id: str, payload: LessonReviseRequest) -> Dict[str, Any]:
    """Reprompt a lesson: apply the learner's instruction to the lesson's existing HTML and
    return the full updated document as a PREVIEW -- nothing is saved until the client
    applies it via PATCH /lessons/{id}."""
    lesson = get_lesson_by_id(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")
    current_html = (lesson.get("generated_html") or "").strip()
    if payload.mode == "regenerate":
        cls = get_class_by_id_or_slug(lesson["class_id"])
        if not cls:
            raise HTTPException(status_code=404, detail="Lesson's class not found.")
        subj = get_subject_by_id_or_slug(cls["id"], lesson["subject_id"]) if lesson.get("subject_id") else None
        source = (lesson.get("source_content") or "").strip()
        if not source:
            source = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", current_html)).strip()[:8000]
        if not source:
            raise HTTPException(status_code=400, detail="Lesson has no source material to regenerate from.")
        extra = (
            "REGENERATION: a previous version of this lesson exists and the learner wants a fresh take."
            + (
                f"\nApply this instruction from the learner (it takes priority):\n{payload.instruction.strip()}"
                if payload.instruction.strip()
                else ""
            )
        )
        clean_html, final_title, final_summary, _ = _generate_lesson_content(
            cls, subj, lesson.get("source_type") or "text", source, payload, lesson["title"], extra_instructions=extra
        )
        return {"generated_html": clean_html, "title": final_title, "summary": final_summary}

    if len(payload.instruction.strip()) < 3:
        raise HTTPException(status_code=422, detail="Tell the AI what to change.")
    if not current_html:
        raise HTTPException(status_code=400, detail="Lesson has no content to update yet.")
    if len(current_html) > LESSON_REVISE_HTML_MAX_CHARS:
        raise HTTPException(status_code=400, detail="This lesson is too large to revise in one pass.")

    prompt = f"""You are updating an existing interactive HTML lesson according to the learner's instruction.

Learner's instruction:
\"\"\"
{payload.instruction.strip()}
\"\"\"

Current lesson HTML:
\"\"\"
{current_html}
\"\"\"

RULES:
1. Apply the instruction, and change as little else as possible: keep every section, diagram, quiz,
   script and style that the instruction does not touch -- exactly as it is.
2. Keep the same visual design, CSS variables and self-contained structure. Everything (HTML, CSS,
   JavaScript) stays in this single document with no external CDNs; scripts must still run in a
   sandboxed iframe.
3. If the instruction asks for new material, integrate it where it belongs and match the existing style.
4. Output ONLY the complete updated HTML document, starting with <!DOCTYPE html> and ending with </html>.
   No markdown code fences and no commentary."""

    try:
        raw = call_ai_text(prompt, payload, max_tokens=16000)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Lesson update failed: {exc}")
    clean_html = _clean_ai_html_output(raw)
    if not clean_html or "<html" not in clean_html.lower() or len(clean_html) < 800:
        raise HTTPException(
            status_code=502,
            detail="The AI provider returned an incomplete or invalid response. Please try again.",
        )
    return {
        "generated_html": clean_html,
        "title": _extract_title_from_html(clean_html, lesson["title"]),
        "summary": _extract_summary_from_html(clean_html, lesson.get("summary") or ""),
    }


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
