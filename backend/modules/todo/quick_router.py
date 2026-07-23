"""FastAPI router for Quick Daily tasks.

Endpoints:
  POST   /quick-tasks                         — Create a quick task for today
  GET    /quick-tasks/today                   — Get all quick tasks for today
  PATCH  /quick-tasks/{id}                    — Update a quick task
  DELETE /quick-tasks/{id}                    — Delete a quick task
  POST   /quick-tasks/{id}/move-to-smart      — Non-destructive: mark exported to Smart To-Do
  POST   /quick-tasks/{id}/move-to-plan       — Non-destructive: mark exported to Plan & Project
  POST   /quick-tasks/brain-dump-upload       — Upload handwriting image → vision AI → task list preview
  POST   /quick-tasks/bulk-create             — Bulk-confirm brain dump parsed tasks
  POST   /quick-tasks/ai-day-plan             — AI selects best tasks (Top 20% always first)
  POST   /quick-tasks/eisenhower-auto         — AI auto-assigns quadrants
  POST   /quick-tasks/end-of-day             — Archive completed, handle incomplete
"""

from __future__ import annotations

import json
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .quick_db import (
    create_quick_task,
    get_quick_tasks_for_date,
    get_quick_task,
    update_quick_task,
    delete_quick_task,
    mark_quick_task_exported,
    archive_completed_quick_tasks,
    move_quick_tasks_to_tomorrow,
    bulk_update_quadrants,
)
from .db import create_task, get_all_tasks
from .projects_db import create_project

router = APIRouter(prefix="/quick-tasks", tags=["quick-tasks"])


# ── Pydantic models ──────────────────────────────────────────────────────────

class QuickTaskCreate(BaseModel):
    title: str
    quadrant: str = "do_now"
    source: str = "manual"
    original_task_id: Optional[int] = None
    order_index: int = 0


class QuickTaskUpdate(BaseModel):
    title: Optional[str] = None
    done: Optional[int] = None          # 0 or 1
    quadrant: Optional[str] = None
    order_index: Optional[int] = None
    is_top_20: Optional[bool] = None    # ✅ Fixed: was missing
    pareto_score: Optional[float] = None  # ✅ Fixed: was missing


class AIDayPlanRequest(BaseModel):
    available_hours: float = 4.0
    model: str = "gemini"


class AIEisenhowerRequest(BaseModel):
    model: str = "gemini"


class BulkCreateQuickTasksRequest(BaseModel):
    tasks: List[dict]   # [{title, quadrant, time_estimate, context}]


class EndOfDayRequest(BaseModel):
    move_to_tomorrow: List[int] = []
    move_to_smart: List[int] = []
    discard: List[int] = []
    model: str = "gemini"


# ── AI helpers ───────────────────────────────────────────────────────────────

def _get_ai_helpers():
    """Reuse AI helpers from main todo router to avoid duplication."""
    from .router import _call_ai, _extract_json_array, _call_vision_ai, _image_to_base64_jpeg
    return _call_ai, _extract_json_array, _call_vision_ai, _image_to_base64_jpeg


_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

_BRAIN_DUMP_EXTRACT_PROMPT = """This is a handwritten brain dump — a person's unfiltered thoughts, tasks, and ideas.
Please:
1. Transcribe ALL handwritten text accurately, preserving lists and structure
2. Fix obvious misspellings but keep all abbreviations the person used
3. If multiple items are written, keep them clearly separated
Return the raw transcribed text only. No commentary. No markdown."""

_BRAIN_DUMP_PARSE_PROMPT_TEMPLATE = """You are a productivity coach parsing a handwritten brain dump into today's task list.
Today: {today}

Extracted handwriting text:
---
{text}
---

Convert every distinct task, action item, or intention into a structured quick task.
Ignore pure observations, feelings, or reflections that aren't actionable.

For each actionable item return:
- "title": Clean, actionable task title starting with a verb (max 60 chars)
- "quadrant": One of:
    "do_now"   (urgent + important — do today)
    "schedule" (important, not urgent — plan for later)
    "delegate" (urgent, not important — can be delegated)
    "eliminate"(neither — consider dropping)
- "time_estimate": "15m" | "30m" | "1h" | "2h" | null
- "context": Short additional note extracted from the writing, or null

Return ONLY a valid JSON array. No prose:
[
  {{
    "title": "Email project update to client",
    "quadrant": "do_now",
    "time_estimate": "15m",
    "context": "Mention the delay on feature X"
  }}
]"""


# ── CRUD Endpoints ───────────────────────────────────────────────────────────

@router.post("")
async def create_quick_task_endpoint(payload: QuickTaskCreate) -> dict:
    today_str = date.today().isoformat()
    task = create_quick_task(
        title=payload.title,
        task_date=today_str,
        quadrant=payload.quadrant,
        source=payload.source,
        original_task_id=payload.original_task_id,
        order_index=payload.order_index,
    )
    return task


@router.get("/today")
async def get_today_tasks_endpoint() -> List[dict]:
    today_str = date.today().isoformat()
    return get_quick_tasks_for_date(today_str)


@router.patch("/{task_id}")
async def update_quick_task_endpoint(task_id: int, payload: QuickTaskUpdate) -> dict:
    updates = payload.model_dump(exclude_none=True)
    task = update_quick_task(task_id, **updates)
    if not task:
        raise HTTPException(status_code=404, detail="Quick task not found")
    return task


@router.delete("/{task_id}")
async def delete_quick_task_endpoint(task_id: int) -> dict:
    if not delete_quick_task(task_id):
        raise HTTPException(status_code=404, detail="Quick task not found")
    return {"status": "deleted", "id": task_id}


# ── Move Endpoints (Non-Destructive) ─────────────────────────────────────────

@router.post("/{task_id}/move-to-smart")
async def move_to_smart_endpoint(task_id: int) -> dict:
    """Convert quick task into a full Smart To-Do task.

    ✅ Fixed: keeps the quick_tasks row (marks is_exported=1).
    Previously, this deleted the row.
    """
    qt = get_quick_task(task_id)
    if not qt:
        raise HTTPException(status_code=404, detail="Quick task not found")

    new_task = create_task(
        title=qt["title"],
        context=f"Moved from Quick Daily ({qt['date']})",
    )
    # Keep row — just mark as exported
    mark_quick_task_exported(task_id, exported_task_id=new_task["id"])
    return {"status": "moved", "new_task_id": new_task["id"], "task": new_task}


@router.post("/{task_id}/move-to-plan")
async def move_to_plan_endpoint(task_id: int) -> dict:
    """Convert quick task into a new project.

    ✅ Fixed: keeps the quick_tasks row (marks is_exported=1).
    Previously, this deleted the row.
    """
    qt = get_quick_task(task_id)
    if not qt:
        raise HTTPException(status_code=404, detail="Quick task not found")

    project = create_project(
        title=qt["title"],
        description=f"Created from Quick Daily task ({qt['date']})",
    )
    # Keep row — just mark as exported
    mark_quick_task_exported(task_id, exported_project_id=project["id"])
    return {"status": "moved", "project_id": project["id"], "project": project}


# ── Brain Dump — Handwriting Upload ──────────────────────────────────────────

@router.post("/brain-dump-upload")
async def brain_dump_upload_endpoint(
    file: UploadFile = File(...),
    model: str = Form("gemini"),
) -> dict:
    """Accept a handwriting image/scan of a brain dump.

    Flow:
    1. Accept image file (.jpg/.png/.webp/.heic/.pdf)
    2. Use vision AI to extract the handwritten text
    3. Use text AI to parse extracted text into structured quick tasks
    4. Return: {extracted_text, parsed_tasks, count}
       — Frontend shows a preview; user confirms to bulk-save via /bulk-create
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    from pathlib import Path
    ext = Path(file.filename).suffix.lower()
    allowed_exts = _IMAGE_EXTENSIONS | {".pdf"}
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file '{ext}'. Upload a photo (.jpg, .png, .webp, .heic) or PDF scan.",
        )

    content = await file.read()

    # ── Step 1: Vision AI — extract handwriting text ──────────────────────
    _call_ai, _extract_json_array, _call_vision_ai, _image_to_base64_jpeg = _get_ai_helpers()

    today_str = date.today().isoformat()
    extracted_text = ""

    try:
        if ext == ".pdf":
            # Handle scanned PDF: convert pages to images
            import io
            import base64 as b64_mod
            try:
                from pdf2image import convert_from_bytes
            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="pdf2image not installed. Run: pip install pdf2image"
                )
            pages = convert_from_bytes(content, dpi=200)
            page_texts = []
            for i, page_img in enumerate(pages[:6]):  # Max 6 pages
                buf = io.BytesIO()
                page_img.save(buf, format="JPEG", quality=85)
                page_b64 = b64_mod.b64encode(buf.getvalue()).decode("utf-8")
                page_text = _call_vision_ai(page_b64, _BRAIN_DUMP_EXTRACT_PROMPT, model)
                page_texts.append(f"[Page {i+1}]\n{page_text}")
            extracted_text = "\n\n".join(page_texts)
        else:
            image_b64 = _image_to_base64_jpeg(content, ext)
            extracted_text = _call_vision_ai(image_b64, _BRAIN_DUMP_EXTRACT_PROMPT, model)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Vision AI failed to read the image. Try a clearer photo. Error: {exc}",
        )

    if not extracted_text or len(extracted_text.strip()) < 5:
        return {
            "extracted_text": "",
            "parsed_tasks": [],
            "count": 0,
            "warning": "No text detected in this image. Please try a clearer, well-lit photo.",
        }

    # ── Step 2: Text AI — parse extracted text into structured tasks ──────
    parse_prompt = _BRAIN_DUMP_PARSE_PROMPT_TEMPLATE.format(
        today=today_str,
        text=extracted_text.strip()[:3000],  # Guard against very long extractions
    )

    try:
        parse_response = _call_ai(parse_prompt, model)
        parsed_tasks = _extract_json_array(parse_response)
    except Exception as exc:
        # If parsing fails, still return the extracted text so the user isn't stuck
        return {
            "extracted_text": extracted_text.strip(),
            "parsed_tasks": [],
            "count": 0,
            "warning": f"Text extracted but task parsing failed: {exc}. You can manually add tasks.",
        }

    return {
        "extracted_text": extracted_text.strip(),
        "parsed_tasks": parsed_tasks,
        "count": len(parsed_tasks),
    }


@router.post("/bulk-create")
async def bulk_create_quick_tasks_endpoint(payload: BulkCreateQuickTasksRequest) -> dict:
    """Bulk-create quick tasks from confirmed brain dump preview.

    Called after user reviews and approves the brain dump parsed tasks.
    """
    today_str = date.today().isoformat()
    created = []
    for t in payload.tasks:
        task = create_quick_task(
            title=t.get("title", "Unnamed task"),
            task_date=today_str,
            quadrant=t.get("quadrant", "do_now"),
            source="brain_dump",
        )
        created.append(task)
    return {"created": created, "count": len(created)}


# ── AI Endpoints ─────────────────────────────────────────────────────────────

@router.post("/ai-day-plan")
async def ai_day_plan_endpoint(payload: AIDayPlanRequest) -> dict:
    """AI selects the best tasks for available hours.

    ✅ Fixed: Top 20% tasks (is_top_20=True) are always included first.
    """
    _call_ai, _extract_json_array, *_ = _get_ai_helpers()

    today_str = date.today().isoformat()
    quick_tasks = get_quick_tasks_for_date(today_str)
    all_smart = get_all_tasks()
    smart_urgent = [
        t for t in all_smart
        if t["status"] not in ("done",) and t["priority"] in ("p1", "p2")
    ]

    # ── Separate top 20% from regular tasks (top 20% always first) ────────
    top_20 = []
    regular = []

    for qt in quick_tasks:
        if qt["done"] or qt.get("is_exported"):
            continue
        entry = {
            "task_id": qt["id"],
            "source": "quick",
            "title": qt["title"],
            "quadrant": qt["quadrant"],
            "is_top_20": bool(qt.get("is_top_20")),
        }
        (top_20 if qt.get("is_top_20") else regular).append(entry)

    for st in smart_urgent[:10]:
        entry = {
            "task_id": st["id"],
            "source": "smart",
            "title": st["title"],
            "priority": st["priority"],
            "time_estimate": st.get("time_estimate") or "unknown",
            "is_top_20": bool(st.get("is_top_20")),
        }
        (top_20 if st.get("is_top_20") else regular).append(entry)

    task_list = top_20 + regular
    if not task_list:
        return {"plan": [], "message": "No tasks available for planning."}

    top20_note = (
        f"\nIMPORTANT: {len(top_20)} tasks are marked is_top_20=true — "
        "these are the highest-leverage Pareto tasks. Always include ALL of them first "
        "before selecting any other tasks.\n"
        if top_20 else ""
    )

    task_json = json.dumps(task_list, indent=2)
    prompt = f"""You are a productivity coach. The user has {payload.available_hours} hours available today.
{top20_note}
Tasks (Top 20% listed first):
{task_json}

Select tasks fitting within {payload.available_hours} hours. Include ALL top 20% tasks first, then fill remaining time with others.
Return ONLY a valid JSON array:
[
  {{"task_id": 1, "source": "quick|smart", "title": "...", "allocated_time": "30 mins", "reason": "Brief reason"}}
]
No extra text, just raw JSON array."""

    try:
        response_text = _call_ai(prompt, payload.model)
        plan = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Day Plan failed: {exc}")

    return {"plan": plan, "top_20_count": len(top_20)}


@router.post("/eisenhower-auto")
async def eisenhower_auto_endpoint(payload: AIEisenhowerRequest) -> dict:
    """AI auto-assigns quadrants to today's quick tasks."""
    _call_ai, _extract_json_array, *_ = _get_ai_helpers()

    today_str = date.today().isoformat()
    tasks = get_quick_tasks_for_date(today_str)
    undone = [t for t in tasks if not t["done"] and not t.get("is_exported")]

    if not undone:
        return {"assignments": [], "message": "No undone tasks to sort."}

    task_list = [
        {"task_id": t["id"], "title": t["title"], "is_top_20": bool(t.get("is_top_20"))}
        for t in undone
    ]
    task_json = json.dumps(task_list, indent=2)

    prompt = f"""You are a productivity expert using the Eisenhower Matrix.
Categorize each task into one of 4 quadrants:
- do_now: Urgent + Important — must be done today
- schedule: Not Urgent + Important — plan for later
- delegate: Urgent + Not Important — delegate or do quickly
- eliminate: Not Urgent + Not Important — consider dropping

RULE: Any task with is_top_20=true must be placed in "do_now" or "schedule" only.

Tasks:
{task_json}

Return ONLY a valid JSON array:
[
  {{"task_id": 1, "quadrant": "do_now", "reasoning": "Brief reason"}}
]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        assignments = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Eisenhower sort failed: {exc}")

    bulk_update_quadrants(assignments)
    return {"assignments": assignments}


@router.post("/end-of-day")
async def end_of_day_endpoint(payload: EndOfDayRequest) -> dict:
    """Archive completed tasks, handle incomplete based on user choices."""
    _call_ai, *_ = _get_ai_helpers()

    today_str = date.today().isoformat()

    # 1. Archive completed tasks
    archived_count = archive_completed_quick_tasks(today_str)

    # 2. Move to tomorrow
    moved_tomorrow = 0
    if payload.move_to_tomorrow:
        moved_tomorrow = move_quick_tasks_to_tomorrow(payload.move_to_tomorrow)

    # 3. Move to Smart To-Do (non-destructive)
    moved_smart = 0
    for tid in payload.move_to_smart:
        qt = get_quick_task(tid)
        if qt:
            new_task = create_task(title=qt["title"], context=f"Moved from Quick Daily ({qt['date']})")
            mark_quick_task_exported(tid, exported_task_id=new_task["id"])
            moved_smart += 1

    # 4. Discard
    discarded = 0
    for tid in payload.discard:
        if delete_quick_task(tid):
            discarded += 1

    # 5. AI day-end encouragement
    prompt = f"""You are a productivity coach. The user is ending their day.
They completed {archived_count} tasks today.
They moved {moved_tomorrow} tasks to tomorrow, {moved_smart} to their full task list, and discarded {discarded}.
Write a short (1-2 sentences), warm, encouraging summary. Be positive and motivating."""

    try:
        encouragement = _call_ai(prompt, payload.model)
    except Exception:
        encouragement = f"Great work completing {archived_count} tasks today! Tomorrow is a fresh start."

    return {
        "summary": encouragement.strip(),
        "archived_count": archived_count,
        "moved_tomorrow": moved_tomorrow,
        "moved_smart": moved_smart,
        "discarded": discarded,
    }
