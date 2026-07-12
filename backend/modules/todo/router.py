"""FastAPI router for the To-Do module.

Endpoints:
  POST   /todo/tasks                     — Create a task
  GET    /todo/tasks/tree                — Full nested task tree
  GET    /todo/tasks/{id}/children       — Lazy-load children
  PATCH  /todo/tasks/{id}                — Update task fields
  DELETE /todo/tasks/{id}                — Delete task (cascade)
  POST   /todo/tasks/{id}/dive-deeper    — AI strategic breakdown
  POST   /todo/tasks/{id}/chunk          — AI actionable breakdown
  POST   /todo/tasks/{id}/regenerate     — Delete children + re-run AI
  POST   /todo/tasks/upload-context      — File upload + text extraction
  POST   /todo/copilot/ask              — Copilot productivity Q&A
"""

from __future__ import annotations

import base64
import json
import io
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from modules.common.db import fetch_settings
from .db import (
    create_subtasks_batch,
    create_task,
    delete_children,
    delete_task,
    get_active_tasks_for_copilot,
    get_children,
    get_sibling_titles,
    get_task,
    get_task_tree,
    update_task,
    get_all_tasks,
    create_note,
    get_task_notes,
    get_note,
    get_unprocessed_inbox_items,
    create_daily_plan,
    get_daily_plan,
    update_daily_plan_summary,
    update_daily_plan_tasks,
    create_inbox_item,
    delete_inbox_item,
    get_user_stats_summary,
    create_handwriting_extraction,
)

router = APIRouter(prefix="/todo", tags=["todo"])

_UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"


# ── Pydantic models ──────────────────────────────────────────────────────────


class TaskCreate(BaseModel):
    title: str
    parent_id: Optional[int] = None
    status: str = "backlog"
    priority: str = "p3"
    time_estimate: Optional[str] = None
    due_date: Optional[str] = None
    context: Optional[str] = None
    attachments: Optional[List[str]] = None
    is_recurring: int = 0
    recurrence_interval: Optional[str] = None
    recurrence_custom_days: Optional[str] = None
    intention: Optional[str] = None
    definition_of_done: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    time_estimate: Optional[str] = None
    due_date: Optional[str] = None
    context: Optional[str] = None
    attachments: Optional[List[str]] = None
    is_recurring: Optional[int] = None
    recurrence_interval: Optional[str] = None
    recurrence_custom_days: Optional[str] = None
    intention: Optional[str] = None
    definition_of_done: Optional[str] = None


class AIBreakdownRequest(BaseModel):
    model: str = "gemini"  # "ollama" or "gemini"


class RegenerateRequest(BaseModel):
    model: str = "gemini"


class CopilotAskRequest(BaseModel):
    question: str
    model: str = "gemini"


class NoteCreateRequest(BaseModel):
    content: str


class NoteAIRequest(BaseModel):
    model: str = "gemini"


class IntentionSuggestGeneralRequest(BaseModel):
    title: str
    context: Optional[str] = None
    model: str = "gemini"


class DailyKickstartRequest(BaseModel):
    available_hours: float
    model: str = "gemini"


class DailyPlanSaveRequest(BaseModel):
    available_hours: float
    task_ids: List[int]
    reasoning: dict


class DailyEndRequest(BaseModel):
    completed_task_ids: List[int]
    incomplete_reschedule: dict  # map of task_id (str) to "tomorrow" | "next_week" | "remove"
    model: str = "gemini"


class BrainDumpRequest(BaseModel):
    text: str
    model: str = "gemini"


class BulkSaveTask(BaseModel):
    temp_id: int
    parent_temp_id: Optional[int] = None
    title: str
    priority: str = "p3"
    time_estimate: Optional[str] = None
    context: Optional[str] = None


class BulkSaveRequest(BaseModel):
    tasks: List[BulkSaveTask]


class InboxCreateRequest(BaseModel):
    content: str







# ── AI utility helpers ────────────────────────────────────────────────────────


def _extract_json_array(text: str) -> List[dict]:
    """Extract the first JSON array from an LLM response string."""
    text = text.strip()
    text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in response")
    return json.loads(text[start : end + 1])


def _call_gemini(prompt: str, api_key: str, model: str = "gemini-2.0-flash") -> str:
    """Call Gemini and return raw text response."""
    safe_model = model.replace("gemini-2.5-flash", "gemini-2.0-flash").replace("gemini-2.5-pro", "gemini-1.5-pro")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{safe_model}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_ollama(prompt: str, base_url: str, model: str) -> str:
    """Call Ollama and return raw text response."""
    body = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return data.get("response", "")


def _call_ai(prompt: str, model_choice: str) -> str:
    """Route AI call to the appropriate provider."""
    settings = fetch_settings()

    if model_choice == "ollama":
        return _call_ollama(
            prompt,
            settings.get("ollamaUrl", "http://localhost:11434"),
            settings.get("ollamaModel", "llama3.2"),
        )
    else:
        api_key = settings.get("geminiKey", "")
        if not api_key:
            raise ValueError("No Gemini API key configured. Add one in Config.")
        return _call_gemini(prompt, api_key, settings.get("questionModel", "gemini-2.0-flash"))


# ── CRUD Endpoints ───────────────────────────────────────────────────────────


@router.post("/tasks")
async def create_task_endpoint(payload: TaskCreate) -> dict:
    task = create_task(
        title=payload.title,
        parent_id=payload.parent_id,
        status=payload.status,
        priority=payload.priority,
        time_estimate=payload.time_estimate,
        due_date=payload.due_date,
        context=payload.context,
        attachments=payload.attachments,
    )
    return task


@router.get("/tasks/tree")
async def get_task_tree_endpoint() -> List[dict]:
    return get_task_tree()


@router.get("/tasks/{task_id}/children")
async def get_children_endpoint(task_id: int) -> List[dict]:
    return get_children(task_id)


@router.patch("/tasks/{task_id}")
async def update_task_endpoint(task_id: int, payload: TaskUpdate) -> dict:
    updates = payload.model_dump(exclude_none=True)
    task = update_task(task_id, **updates)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/tasks/{task_id}")
async def delete_task_endpoint(task_id: int) -> dict:
    if not delete_task(task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "deleted", "id": task_id}


# ── AI Breakdown Endpoints ───────────────────────────────────────────────────


def _build_ai_prompt(task: dict, breakdown_type: str) -> str:
    """Build the AI prompt with sibling awareness and context."""
    # Core instruction differs by type
    if breakdown_type == "dive_deeper":
        instruction = f'Break this task into 3–5 strategic subtasks or phases: "{task["title"]}".'
    else:
        instruction = f'Break this task into 3–5 small, concrete, immediately actionable steps: "{task["title"]}".'

    # Add sibling context to avoid duplicates (🟢 feedback #9)
    sibling_context = ""
    if task.get("parent_id"):
        siblings = get_sibling_titles(task["parent_id"])
        if siblings:
            sibling_list = "\n".join(f"  - {s}" for s in siblings)
            sibling_context = (
                f"\n\nThese subtasks already exist under the parent task. "
                f"Generate NEW subtasks that complement these without repeating them:\n{sibling_list}"
            )

    # Add task context
    context_addendum = ""
    if task.get("context"):
        context_addendum = (
            f'\n\nAdditional context about this task: {task["context"]}. '
            "Use this to make subtasks more specific and relevant."
        )

    # Add intention and definition of done context (Feature 5)
    if task.get("intention"):
        context_addendum += f"\nWhy this task matters: {task['intention']}"
    if task.get("definition_of_done"):
        context_addendum += f"\nThis task is done when: {task['definition_of_done']}"

    return (
        f"{instruction}{sibling_context}{context_addendum}\n\n"
        'Return ONLY a JSON array: [{"title": "...", "time_estimate": "...", "priority": "p1|p2|p3|p4"}]. '
        "No extra text."
    )


@router.post("/tasks/{task_id}/dive-deeper")
async def dive_deeper_endpoint(task_id: int, payload: AIBreakdownRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    prompt = _build_ai_prompt(task, "dive_deeper")

    try:
        raw_response = _call_ai(prompt, payload.model)
        subtasks_data = _extract_json_array(raw_response)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {exc}")

    created = create_subtasks_batch(task_id, subtasks_data[:5], "dive_deeper")
    return {"subtasks": created}


@router.post("/tasks/{task_id}/chunk")
async def chunk_endpoint(task_id: int, payload: AIBreakdownRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    prompt = _build_ai_prompt(task, "chunk")

    try:
        raw_response = _call_ai(prompt, payload.model)
        subtasks_data = _extract_json_array(raw_response)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {exc}")

    created = create_subtasks_batch(task_id, subtasks_data[:5], "chunk")
    return {"subtasks": created}


# ── Regenerate Endpoint (🔴 feedback #2) ─────────────────────────────────────


@router.post("/tasks/{task_id}/regenerate")
async def regenerate_endpoint(task_id: int, payload: RegenerateRequest) -> dict:
    """Delete existing children of a task and regenerate using AI.

    Reads the task's generation_type to determine whether to use dive_deeper or chunk.
    If the task is manual (root-level), defaults to dive_deeper.
    """
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Determine which type to regenerate
    gen_type = task.get("generation_type", "manual")
    breakdown_type = gen_type if gen_type in ("dive_deeper", "chunk") else "dive_deeper"

    # Delete existing children first
    deleted_count = delete_children(task_id)

    prompt = _build_ai_prompt(task, breakdown_type)

    try:
        raw_response = _call_ai(prompt, payload.model)
        subtasks_data = _extract_json_array(raw_response)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI regeneration failed: {exc}")

    created = create_subtasks_batch(task_id, subtasks_data[:5], breakdown_type)
    return {"subtasks": created, "deleted_count": deleted_count}


# ── Context Upload Endpoint ──────────────────────────────────────────────────

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

_HANDWRITING_PROMPT = """This is a photo or scan of handwritten notes. Please:
1. Transcribe ALL handwritten text exactly as written, preserving structure (bullet points, numbered lists, headings, underlines) where visible
2. Fix obvious spelling errors caused by handwriting ambiguity but preserve intentional abbreviations
3. If there are diagrams or drawings, describe them briefly in [brackets] and extract any text labels within them
4. Separate distinct sections with a blank line
5. At the end, add a "Key Points" section summarizing the most important items in 3-5 bullet points
Return plain text only. No markdown formatting."""


def _image_to_base64_jpeg(content: bytes, ext: str) -> str:
    """Convert image bytes to base64-encoded JPEG. Handles HEIC conversion via Pillow."""
    from PIL import Image

    if ext == ".heic":
        # Pillow with pillow-heif plugin, or convert via raw bytes
        try:
            img = Image.open(io.BytesIO(content))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=90)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to convert HEIC image. Ensure pillow-heif is installed.")
    else:
        # Standard image — re-encode as JPEG for consistency
        try:
            img = Image.open(io.BytesIO(content))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=90)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception:
            # Fallback: send raw bytes as base64
            return base64.b64encode(content).decode("utf-8")


def _call_gemini_vision(image_b64: str, prompt: str, api_key: str, model: str = "gemini-2.0-flash") -> str:
    """Call Gemini vision API with an image and text prompt."""
    safe_model = model.replace("gemini-2.5-flash", "gemini-2.0-flash").replace("gemini-2.5-pro", "gemini-1.5-pro")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{safe_model}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
            ]
        }],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_ollama_vision(image_b64: str, prompt: str, base_url: str, model: str = "llava") -> str:
    """Call Ollama vision API (llava) with an image and text prompt."""
    body = json.dumps({
        "model": model,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False,
    }).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data.get("response", "")


def _call_vision_ai(image_b64: str, prompt: str, model_choice: str) -> str:
    """Route vision AI call to the appropriate provider. Returns extracted text."""
    settings = fetch_settings()

    try:
        if model_choice == "ollama":
            return _call_ollama_vision(
                image_b64,
                prompt,
                settings.get("ollamaUrl", "http://localhost:11434"),
                "llava",
            )
        else:
            api_key = settings.get("geminiKey", "")
            if not api_key:
                raise ValueError("No Gemini API key configured. Add one in Config.")
            return _call_gemini_vision(
                image_b64,
                prompt,
                api_key,
                settings.get("questionModel", "gemini-2.0-flash"),
            )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read handwriting. Try a clearer photo with better lighting. Error: {exc}",
        )


def _is_scanned_pdf(file_path: str) -> bool:
    """Check if a PDF is scanned (image-based) by attempting text extraction.
    Returns True if very little text is found across pages."""
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            total_chars = 0
            for page in pdf.pages[:3]:  # Check first 3 pages
                text = page.extract_text() or ""
                total_chars += len(text.strip())
            # If fewer than 50 chars across first 3 pages, it's likely scanned
            return total_chars < 50
    except Exception:
        return False


@router.post("/tasks/upload-context")
async def upload_context(
    file: UploadFile = File(...),
    vision_model: str = Form("gemini"),
) -> dict:
    """Accept .txt, .pdf, .docx, and image (.jpg/.png/.webp/.heic) uploads and extract text.
    Image files use vision LLM for handwriting recognition."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(file.filename).suffix.lower()
    allowed = {".txt", ".pdf", ".docx"} | _IMAGE_EXTENSIONS
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted: .txt, .pdf, .docx, .jpg, .jpeg, .png, .webp, .heic",
        )

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = _UPLOAD_DIR / file.filename
    content = await file.read()
    file_path.write_bytes(content)

    extracted_text = ""
    is_handwriting = False
    confidence_note = None

    try:
        # ── Existing text-based extraction (unchanged) ────────────────────
        if ext == ".txt":
            extracted_text = content.decode("utf-8", errors="replace")

        elif ext == ".docx":
            try:
                import docx
            except ImportError:
                raise HTTPException(status_code=500, detail="python-docx not installed")
            doc = docx.Document(str(file_path))
            extracted_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())

        elif ext == ".pdf":
            # Check if scanned/image-based PDF
            if _is_scanned_pdf(str(file_path)):
                # Scanned PDF — process each page as image via vision LLM
                is_handwriting = True
                try:
                    from pdf2image import convert_from_path
                except ImportError:
                    raise HTTPException(status_code=500, detail="pdf2image not installed. Run: pip install pdf2image")

                pages = convert_from_path(str(file_path), dpi=200)
                page_texts = []
                for i, page_img in enumerate(pages):
                    buf = io.BytesIO()
                    page_img.save(buf, format="JPEG", quality=85)
                    page_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    page_text = _call_vision_ai(page_b64, _HANDWRITING_PROMPT, vision_model)
                    page_texts.append(f"--- Page {i + 1} ---\n{page_text}")

                extracted_text = "\n\n".join(page_texts)
                confidence_note = f"Scanned PDF processed via vision LLM ({len(pages)} pages)"
            else:
                # Text-based PDF — use existing pdfplumber extraction
                try:
                    import pdfplumber
                except ImportError:
                    raise HTTPException(status_code=500, detail="pdfplumber not installed")
                with pdfplumber.open(str(file_path)) as pdf:
                    pages_text = []
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            pages_text.append(page_text)
                    extracted_text = "\n\n".join(pages_text)

        # ── NEW: Image-based handwriting extraction ───────────────────────
        elif ext in _IMAGE_EXTENSIONS:
            is_handwriting = True
            image_b64 = _image_to_base64_jpeg(content, ext)
            extracted_text = _call_vision_ai(image_b64, _HANDWRITING_PROMPT, vision_model)

            # Check for empty/unclear results
            if not extracted_text or len(extracted_text.strip()) < 10:
                extracted_text = "No text detected in this image."
                confidence_note = "No text detected"
            elif any(kw in extracted_text.lower() for kw in ["unclear", "blurry", "cannot read", "illegible"]):
                confidence_note = "Some text may be unclear due to image quality. Please review carefully."

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {exc}")

    # Save handwriting extraction record
    if is_handwriting and extracted_text.strip():
        create_handwriting_extraction(
            original_filename=file.filename,
            extracted_text=extracted_text.strip(),
            vision_model_used=vision_model,
            source="task_context",
            confidence_note=confidence_note,
        )

    result = {
        "filename": file.filename,
        "extracted_text": extracted_text.strip(),
        "char_count": len(extracted_text.strip()),
    }
    if is_handwriting:
        result["is_handwriting"] = True
        if confidence_note:
            result["confidence_note"] = confidence_note
    return result



# ── Copilot Q&A Endpoint (🟢 feedback #12 — smarter context) ─────────────────


def _build_task_summary(tasks: List[dict], indent: int = 0) -> str:
    """Recursively build a text summary of the task tree for the copilot prompt."""
    lines = []
    prefix = "  " * indent
    for task in tasks:
        status = task.get("status", "backlog")
        priority = task.get("priority", "p3")
        time_est = task.get("time_estimate", "no estimate")
        due = task.get("due_date", "no due date")
        
        detail_pieces = []
        if task.get("context"):
            detail_pieces.append(f'Context: {task["context"][:100]}...')
        if task.get("intention"):
            detail_pieces.append(f'Why it matters: {task["intention"]}')
        if task.get("definition_of_done"):
            detail_pieces.append(f'Done when: {task["definition_of_done"]}')
            
        # Include last 3 notes
        notes = get_task_notes(task["id"])
        if notes:
            notes_str = "; ".join(f"[{n['note_type']}]: {n['content'][:50]}..." for n in notes[:3])
            detail_pieces.append(f'Recent Notes: {notes_str}')
            
        details = " | ".join(detail_pieces)
        details_str = f" | {details}" if details else ""
        
        lines.append(
            f'{prefix}- [{status.upper()}] [{priority.upper()}] {task["title"]} '
            f'(Time: {time_est}, Due: {due}){details_str}'
        )
        
        children = task.get("children", [])
        if children:
            lines.append(_build_task_summary(children, indent + 1))
    return "\n".join(lines)


@router.post("/copilot/ask")
async def copilot_ask(payload: CopilotAskRequest) -> dict:
    """Answer productivity questions based on the user's task tree and inbox context.

    Uses smarter context: active tasks detailed with notes/intentions, plus captured distractions.
    """
    copilot_data = get_active_tasks_for_copilot()
    active_tree = copilot_data["active_tree"]
    summary = copilot_data["summary"]

    task_summary = _build_task_summary(active_tree) if active_tree else "No active tasks."

    # Fetch captured inbox/distraction items for context
    inbox_items = get_unprocessed_inbox_items()
    inbox_summary = "\n".join(f"- {item['content']} (captured: {item['created_at']})" for item in inbox_items) if inbox_items else "No unprocessed items in inbox."

    prompt = f"""You are a productivity copilot. Here are the user's current active tasks with priorities, statuses, time estimates, due dates, intentions, definition of done criteria, recent activity/notes, and subtask trees:

{task_summary}

Summary: {summary['total']} total tasks, {summary['done_count']} completed, {summary['backlog_no_date_count']} in backlog without due dates, {summary['active_count']} active.

Inbox/Distractions Captured (needs processing later):
{inbox_summary}

Answer the user's question helpfully and concisely based on these tasks and distractions. Be specific — reference actual task or distraction names. Keep responses under 200 words unless the user asks for detail."""

    try:
        response_text = _call_ai(prompt, payload.model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI call failed: {exc}")

    return {"answer": response_text.strip()}



# ── Notes Endpoints ─────────────────────────────────────────────────────────

@router.get("/tasks/{task_id}/notes")
async def get_notes_endpoint(task_id: int) -> List[dict]:
    return get_task_notes(task_id)


@router.post("/tasks/{task_id}/notes")
async def create_note_endpoint(task_id: int, payload: NoteCreateRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    note = create_note(task_id, payload.content, "manual")
    return note


@router.post("/tasks/{task_id}/notes/explain")
async def explain_task_endpoint(task_id: int, payload: NoteAIRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    notes = get_task_notes(task_id)
    notes_context = ""
    if notes:
        notes_context = "\nExisting Notes:\n" + "\n".join(f"- {n['content']}" for n in notes)

    intention_context = f"\nIntention: {task['intention']}" if task.get("intention") else ""
    dod_context = f"\nDefinition of Done: {task['definition_of_done']}" if task.get("definition_of_done") else ""

    prompt = f"""You are a productivity assistant.
Generate a clear, detailed explanation of this task — what it involves, why it matters, what skills or knowledge are needed, and potential challenges. Write it as a helpful briefing for someone starting this task fresh.

Task Title: {task['title']}
Task Context: {task.get('context') or 'No additional context.'}{intention_context}{dod_context}{notes_context}

Provide a comprehensive, professional explanation. Make it directly useful, structured with clear paragraphs or bullets, and keep it under 300 words."""

    try:
        explanation = _call_ai(prompt, payload.model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {exc}")

    note = create_note(task_id, explanation.strip(), "ai_explanation")
    return note


@router.post("/tasks/{task_id}/notes/{note_id}/expand")
async def expand_note_endpoint(task_id: int, note_id: int, payload: NoteAIRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    note = get_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    prompt = f"""You are a productivity assistant.
The user wrote this quick note while working: '{note['content']}' for the task: '{task['title']}'.
Expand this note into a detailed explanation of what this means, why this decision was made, and what implications it has for the task.

Write a clean, detailed, and professional expansion under 150 words."""

    try:
        expanded_content = _call_ai(prompt, payload.model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {exc}")

    new_note = create_note(task_id, expanded_content.strip(), "ai_expansion")
    return new_note


@router.post("/tasks/{task_id}/notes/summarize")
async def summarize_notes_endpoint(task_id: int, payload: NoteAIRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    notes = get_task_notes(task_id)
    if not notes:
        return {"summary": "No notes available to summarize."}

    notes_text = "\n".join(f"[{n['created_at']}] ({n['note_type']}): {n['content']}" for n in notes)

    prompt = f"""You are a productivity assistant.
Summarize all these notes for the task '{task['title']}' into a concise decision log — key decisions made, insights gained, blockers encountered, and the current state of the task.

Notes:
{notes_text}

Provide a concise, bulleted summary under 200 words."""

    try:
        summary_text = _call_ai(prompt, payload.model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {exc}")

    return {"summary": summary_text.strip()}


@router.post("/tasks/{task_id}/suggest-intention")
async def suggest_intention_endpoint(task_id: int, payload: NoteAIRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    prompt = f"""You are a productivity coach.
For the task: "{task['title']}"
Task Context: {task.get('context') or 'None'}

Suggest:
1. An intention (why does this task matter? what is the value or motivation?)
2. A definition of done (what does completed state look like?)

Return ONLY a JSON object:
{{"intention": "motivation/why", "definition_of_done": "conditions of completion"}}
No markdown formatting, no comments, no extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        import re
        text = response_text.strip()
        text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object found in response")
        result = json.loads(text[start : end + 1])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI suggest failed: {exc}")

    return result


@router.post("/tasks/suggest-intention")
async def suggest_intention_general_endpoint(payload: IntentionSuggestGeneralRequest) -> dict:
    prompt = f"""You are a productivity coach.
For the task: "{payload.title}"
Task Context: {payload.context or 'None'}

Suggest:
1. An intention (why does this task matter? what is the value or motivation?)
2. A definition of done (what does completed state look like?)

Return ONLY a JSON object:
{{"intention": "motivation/why", "definition_of_done": "conditions of completion"}}
No markdown formatting, no comments, no extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        import re
        text = response_text.strip()
        text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object found in response")
        result = json.loads(text[start : end + 1])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI suggest failed: {exc}")

    return result


def _stream_gemini(prompt: str, api_key: str, model: str = "gemini-2.0-flash"):
    """Streams responses from the Gemini API."""
    safe_model = model.replace("gemini-2.5-flash", "gemini-2.0-flash").replace("gemini-2.5-pro", "gemini-1.5-pro")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{safe_model}:streamGenerateContent?alt=sse&key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }).encode()
    
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            for line in resp:
                line_str = line.decode("utf-8").strip()
                if line_str.startswith("data:"):
                    try:
                        data_json = json.loads(line_str[5:].strip())
                        chunk_text = data_json["candidates"][0]["content"]["parts"][0]["text"]
                        yield chunk_text
                    except Exception:
                        pass
    except Exception as e:
        yield f"\n[Streaming error: {e}]"


def _stream_ollama(prompt: str, base_url: str, model: str):
    """Streams responses from the local Ollama API."""
    url = f"{base_url.rstrip('/')}/api/generate"
    body = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": True
    }).encode()
    
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            for line in resp:
                if line:
                    try:
                        data_json = json.loads(line.decode("utf-8").strip())
                        chunk_text = data_json.get("response", "")
                        yield chunk_text
                    except Exception:
                        pass
    except Exception as e:
        yield f"\n[Streaming error: {e}]"


def _stream_ai(prompt: str, model_choice: str):
    """Route AI stream to the chosen model choice."""
    settings = fetch_settings()
    if model_choice == "ollama":
        yield from _stream_ollama(
            prompt,
            settings.get("ollamaUrl", "http://localhost:11434"),
            settings.get("ollamaModel", "llama3.2"),
        )
    else:
        api_key = settings.get("geminiKey", "")
        if not api_key:
            yield "No Gemini API key configured. Add one in Config."
            return
        yield from _stream_gemini(
            prompt,
            api_key,
            settings.get("questionModel", "gemini-2.0-flash"),
        )


@router.get("/tasks/{task_id}/resume")
async def resume_task_endpoint(task_id: int, model: str = "gemini") -> StreamingResponse:
    """Stream an AI briefing for resuming a task inactive for 2+ days."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    children = get_children(task_id)
    completed_subtasks = [c["title"] for c in children if c["status"] == "done"]
    remaining_subtasks = [c["title"] for c in children if c["status"] != "done"]

    notes = get_task_notes(task_id)
    recent_notes = "\n".join(f"- [{n['note_type']}]: {n['content']}" for n in notes[:5])

    from datetime import datetime
    last_act = task.get("last_activity_at") or task.get("created_at")
    days_inactive = 2
    if last_act:
        try:
            dt = datetime.fromisoformat(last_act)
            delta = datetime.utcnow() - dt
            days_inactive = max(0, delta.days)
        except Exception:
            pass

    prompt = f"""You are a productivity coach. Rebuild the user's context for this task they haven't worked on in {days_inactive} days.

Task: {task['title']}
Why it matters (Intention): {task.get('intention') or 'Not specified.'}
Done when (Definition of Done): {task.get('definition_of_done') or 'Not specified.'}
Context: {task.get('context') or 'No context notes.'}
Subtasks completed: {', '.join(completed_subtasks) if completed_subtasks else 'None'}
Subtasks remaining: {', '.join(remaining_subtasks) if remaining_subtasks else 'None'}
Recent notes & timeline activity:
{recent_notes or 'No notes logged.'}

Generate a "Where You Left Off" briefing in exactly 3 sections:
1. Quick Summary (2 sentences max summarizing current state)
2. What's Done So Far (bullet points of what is complete)
3. Suggested First Step to get back into it (1 clear, small, immediate action)

Keep the briefing clean, actionable, and under 250 words."""

    return StreamingResponse(_stream_ai(prompt, model), media_type="text/plain")


# ── Daily Kickstart Endpoints ────────────────────────────────────────────────

@router.get("/daily/plan")
async def get_daily_plan_endpoint() -> dict:
    from datetime import date
    today_str = date.today().isoformat()
    plan = get_daily_plan(today_str)
    if not plan:
        return {"status": "none", "plan": None}
    
    # Hydrate tasks
    hydrated_tasks = []
    for tid in plan["task_ids"]:
        t = get_task(tid)
        if t:
            hydrated_tasks.append(t)
    plan["tasks"] = hydrated_tasks
    return {"status": "active", "plan": plan}


@router.post("/daily/kickstart")
async def daily_kickstart_endpoint(payload: DailyKickstartRequest) -> dict:
    # Get all pending tasks (non-Done)
    all_tasks = get_all_tasks()
    pending = [t for t in all_tasks if t["status"] != "done"]
    
    if not pending:
        return {"tasks": [], "raw_ai_response": ""}

    task_list = []
    for t in pending:
        task_list.append({
            "id": t["id"],
            "title": t["title"],
            "priority": t["priority"],
            "due_date": t["due_date"] or "none",
            "time_estimate": t["time_estimate"] or "none",
            "intention": t.get("intention") or "none",
            "definition_of_done": t.get("definition_of_done") or "none"
        })
    task_list_str = json.dumps(task_list, indent=2)

    prompt = f"""You are a productivity coach. The user has {payload.available_hours} hours today.
Here are their pending tasks with priorities, due dates, time estimates, intentions, and definition of done criteria:
{task_list_str}

Select 3-5 tasks that best fit their available time of {payload.available_hours} hours. Prioritize overdue tasks, high priority (p1/p2) tasks, and tasks with imminent due dates.
Return ONLY a valid JSON array:
[
  {{"task_id": 123, "reason": "Reason for selecting this task in one short line."}}
]
No extra text, no markdown block, just raw JSON array."""

    try:
        response_text = _call_ai(prompt, payload.model)
        subtasks_data = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Daily Kickstart failed: {exc}")

    # Map suggestions back to active tasks
    suggestions = []
    pending_map = {t["id"]: t for t in pending}
    for item in subtasks_data:
        tid = item.get("task_id")
        if tid in pending_map:
            suggestions.append({
                "task": pending_map[tid],
                "reason": item.get("reason", "Curated for your day.")
            })
            
    # Also return other alternatives in case user wants to swap
    alternatives = []
    suggested_ids = {s["task"]["id"] for s in suggestions}
    for t in pending:
        if t["id"] not in suggested_ids:
            alternatives.append(t)

    return {
        "suggestions": suggestions,
        "alternatives": alternatives
    }


@router.post("/daily/plan")
async def save_daily_plan_endpoint(payload: DailyPlanSaveRequest) -> dict:
    from datetime import date
    today_str = date.today().isoformat()
    plan = create_daily_plan(
        plan_date=today_str,
        available_hours=payload.available_hours,
        task_ids=payload.task_ids,
        reasoning=payload.reasoning,
    )
    # Hydrate tasks
    hydrated_tasks = []
    for tid in plan["task_ids"]:
        t = get_task(tid)
        if t:
            hydrated_tasks.append(t)
    plan["tasks"] = hydrated_tasks
    return plan


@router.post("/daily/end")
async def daily_end_endpoint(payload: DailyEndRequest) -> dict:
    from datetime import date, timedelta
    today_str = date.today().isoformat()
    
    # 1. Update due dates for rescheduled tasks
    for tid_str, action in payload.incomplete_reschedule.items():
        try:
            tid = int(tid_str)
            if action == "tomorrow":
                due = (date.today() + timedelta(days=1)).isoformat()
                update_task(tid, due_date=due)
            elif action == "next_week":
                due = (date.today() + timedelta(days=7)).isoformat()
                update_task(tid, due_date=due)
        except Exception:
            pass

    # 2. Get task titles for Completed vs Incomplete
    completed_titles = []
    incomplete_titles = []
    for cid in payload.completed_task_ids:
        t = get_task(cid)
        if t: completed_titles.append(t["title"])
    for iid_str in payload.incomplete_reschedule.keys():
        try:
            t = get_task(int(iid_str))
            if t: incomplete_titles.append(t["title"])
        except Exception:
            pass

    prompt = f"""You are a productivity coach. The user is finishing their work day.
They completed the following tasks today:
{", ".join(completed_titles) if completed_titles else "None"}

They did not complete these planned tasks:
{", ".join(incomplete_titles) if incomplete_titles else "None"}

Generate a short (1-2 sentences), highly encouraging and positive summary of their day. Keep it positive and motivating."""

    try:
        encouragement = _call_ai(prompt, payload.model)
    except Exception as exc:
        encouragement = f"Great work completing {len(completed_titles)} tasks today. Tomorrow is a new start!"

    # 3. Save AI Day Summary
    update_daily_plan_summary(today_str, encouragement.strip())

    # 4. Remove rescheduled/removed tasks from today's daily_plan task list
    plan = get_daily_plan(today_str)
    if plan:
        rem_set = {int(k) for k in payload.incomplete_reschedule.keys()}
        new_task_ids = [tid for tid in plan["task_ids"] if tid not in rem_set]
        update_daily_plan_tasks(today_str, new_task_ids)

    return {
        "summary": encouragement.strip(),
        "completed_count": len(completed_titles),
        "incomplete_count": len(incomplete_titles),
    }


# ── Brain Dump Endpoints ─────────────────────────────────────────────────────

@router.post("/brain-dump")
async def brain_dump_endpoint(payload: BrainDumpRequest) -> dict:
    prompt = f"""You are a productivity coach. Parse the following messy text dump into structured tasks:
"{payload.text}"

Identify individual tasks, priorities (p1-p4, where p1 is highest), time estimates (e.g. 30m, 2h, 4h), short context, and hierarchical relationships.
If a task is a subtask or detail of another task in the list, set parent_temp_id to the temp_id of that parent task.

Return ONLY a valid JSON array:
[
  {{
    "temp_id": 1,
    "parent_temp_id": null,
    "title": "Task title",
    "priority": "p1|p2|p3|p4",
    "time_estimate": "30m|1h|2h",
    "context": "Context detail"
  }}
]
No extra text, no markdown blocks, just raw JSON array."""

    try:
        response_text = _call_ai(prompt, payload.model)
        tasks_data = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Brain Dump failed: {exc}")

    return {"tasks": tasks_data}


@router.post("/tasks/bulk")
async def bulk_save_endpoint(payload: BulkSaveRequest) -> dict:
    """Save a list of tasks topologically to respect parent-child relationships."""
    temp_to_db = {}
    unprocessed = list(payload.tasks)
    max_loops = len(unprocessed) * 3
    loops = 0

    while unprocessed and loops < max_loops:
        loops += 1
        current = unprocessed.pop(0)

        parent_temp = current.parent_temp_id
        if parent_temp is None:
            db_task = create_task(
                title=current.title,
                priority=current.priority,
                time_estimate=current.time_estimate,
                context=current.context,
            )
            temp_to_db[current.temp_id] = db_task["id"]
        else:
            if parent_temp in temp_to_db:
                db_parent_id = temp_to_db[parent_temp]
                db_task = create_task(
                    title=current.title,
                    priority=current.priority,
                    time_estimate=current.time_estimate,
                    context=current.context,
                    parent_id=db_parent_id,
                )
                temp_to_db[current.temp_id] = db_task["id"]
            else:
                unprocessed.append(current)

    # Backup for disconnected nodes
    if unprocessed:
        for current in unprocessed:
            create_task(
                title=current.title,
                priority=current.priority,
                time_estimate=current.time_estimate,
                context=current.context,
            )

    return {"status": "success", "count": len(payload.tasks)}


# ── Distraction Capture (Inbox) Endpoints ────────────────────────────────────

@router.post("/inbox")
async def create_inbox_item_endpoint(payload: InboxCreateRequest) -> dict:
    item = create_inbox_item(payload.content.strip())
    return item


@router.get("/inbox")
async def get_inbox_items_endpoint() -> List[dict]:
    items = get_unprocessed_inbox_items()
    return items


@router.delete("/inbox/{inbox_id}")
async def delete_inbox_item_endpoint(inbox_id: int) -> dict:
    success = delete_inbox_item(inbox_id)
    if not success:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    return {"status": "deleted", "id": inbox_id}


@router.get("/stats")
async def get_stats_endpoint() -> dict:
    return get_user_stats_summary()


# ── Smart To-Do: Eisenhower + Weekly Plan + Cross-tab Move ────────────────────


class EisenhowerAutoRequest(BaseModel):
    model: str = "gemini"


class WeeklyPlanRequest(BaseModel):
    model: str = "gemini"


@router.post("/tasks/eisenhower-auto")
async def eisenhower_auto_tasks_endpoint(payload: EisenhowerAutoRequest) -> dict:
    """AI assigns Eisenhower quadrants to all non-done tasks."""
    all_tasks = get_all_tasks()
    pending = [t for t in all_tasks if t["status"] != "done"]
    if not pending:
        return {"assignments": []}

    task_list = [
        {
            "task_id": t["id"],
            "title": t["title"],
            "priority": t["priority"],
            "due_date": t["due_date"] or "none",
            "status": t["status"],
            "intention": t.get("intention") or "none",
        }
        for t in pending[:30]  # Limit to avoid token overflow
    ]
    task_json = json.dumps(task_list, indent=2)

    prompt = f"""You are a productivity expert using the Eisenhower Matrix.
Categorize each task into one of 4 quadrants:
- do_now: Urgent + Important
- schedule: Not Urgent + Important
- delegate: Urgent + Not Important
- eliminate: Not Urgent + Not Important

Consider priority level (p1 is highest), due dates, status, and intention.

Tasks:
{task_json}

Return ONLY a valid JSON array:
[
  {{"task_id": 1, "quadrant": "do_now"}}
]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        assignments = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Eisenhower sort failed: {exc}")

    # Apply updates
    import sqlite3
    from modules.common.db import get_db_path
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for a in assignments:
            cursor.execute(
                "UPDATE tasks SET eisenhower_quadrant = ? WHERE id = ?",
                (a["quadrant"], a["task_id"]),
            )
        conn.commit()
    finally:
        conn.close()

    return {"assignments": assignments}


@router.post("/tasks/ai-weekly-plan")
async def ai_weekly_plan_endpoint(payload: WeeklyPlanRequest) -> dict:
    """AI generates a structured Mon-Fri weekly plan."""
    all_tasks = get_all_tasks()
    pending = [t for t in all_tasks if t["status"] != "done"]
    if not pending:
        return {"weekly_plan": {}}

    task_list = [
        {
            "task_id": t["id"],
            "title": t["title"],
            "priority": t["priority"],
            "time_estimate": t["time_estimate"] or "unknown",
            "due_date": t["due_date"] or "none",
            "status": t["status"],
        }
        for t in pending[:25]
    ]
    task_json = json.dumps(task_list, indent=2)

    prompt = f"""You are a productivity coach. Create a structured weekly execution plan (Monday through Friday).
Distribute these tasks across the 5 weekdays, considering priority, due dates, and estimated time.
Aim for 3-5 hours of focused work per day.

Tasks:
{task_json}

Return ONLY a valid JSON object (not an array):
{{
  "monday": [{{"task_id": 1, "title": "...", "allocated_time": "1h"}}],
  "tuesday": [...],
  "wednesday": [...],
  "thursday": [...],
  "friday": [...]
}}
No extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        # Extract JSON object
        import re
        text = response_text.strip()
        text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("No JSON object found")
        weekly_plan = json.loads(text[start:end + 1])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Weekly Plan failed: {exc}")

    return {"weekly_plan": weekly_plan}


@router.post("/tasks/{task_id}/move-to-quick")
async def move_task_to_quick_endpoint(task_id: int) -> dict:
    """Add a Smart To-Do task to today's Quick Daily."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    from datetime import date as date_mod
    from .quick_db import create_quick_task
    qt = create_quick_task(
        title=task["title"],
        task_date=date_mod.today().isoformat(),
        source="moved_from_smart",
        original_task_id=task_id,
    )
    return {"status": "moved", "quick_task": qt}


@router.post("/tasks/{task_id}/move-to-plan")
async def move_task_to_plan_endpoint(task_id: int) -> dict:
    """Create a project from a Smart To-Do task."""
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    from .projects_db import create_project
    project = create_project(
        title=task["title"],
        description=task.get("context") or f"Created from task: {task['title']}",
        priority=task["priority"],
    )
    return {"status": "moved", "project": project}




