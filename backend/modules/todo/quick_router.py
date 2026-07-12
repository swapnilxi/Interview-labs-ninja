"""FastAPI router for Quick Daily tasks.

Endpoints:
  POST   /quick-tasks                  — Create a quick task for today
  GET    /quick-tasks/today            — Get all quick tasks for today
  PATCH  /quick-tasks/{id}             — Update a quick task
  DELETE /quick-tasks/{id}             — Delete a quick task
  POST   /quick-tasks/{id}/move-to-smart — Convert to full Smart To-Do task
  POST   /quick-tasks/{id}/move-to-plan  — Convert to project
  POST   /quick-tasks/ai-day-plan      — AI selects best tasks for available hours
  POST   /quick-tasks/eisenhower-auto  — AI auto-assigns quadrants
  POST   /quick-tasks/end-of-day       — Archive completed, handle incomplete
"""

from __future__ import annotations

import json
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .quick_db import (
    create_quick_task,
    get_quick_tasks_for_date,
    get_quick_task,
    update_quick_task,
    delete_quick_task,
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
    done: Optional[int] = None  # 0 or 1
    quadrant: Optional[str] = None
    order_index: Optional[int] = None


class AIDayPlanRequest(BaseModel):
    available_hours: float = 4.0
    model: str = "gemini"


class AIEisenhowerRequest(BaseModel):
    model: str = "gemini"


class EndOfDayRequest(BaseModel):
    move_to_tomorrow: List[int] = []
    move_to_smart: List[int] = []
    discard: List[int] = []
    model: str = "gemini"


# ── AI helpers (reuse from todo router) ──────────────────────────────────────

def _get_ai_helpers():
    """Import AI helpers from the todo router to avoid duplication."""
    from .router import _call_ai, _extract_json_array
    return _call_ai, _extract_json_array


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


# ── Move Endpoints ───────────────────────────────────────────────────────────

@router.post("/{task_id}/move-to-smart")
async def move_to_smart_endpoint(task_id: int) -> dict:
    """Convert quick task into a full Smart To-Do task."""
    qt = get_quick_task(task_id)
    if not qt:
        raise HTTPException(status_code=404, detail="Quick task not found")

    new_task = create_task(
        title=qt["title"],
        context=f"Moved from Quick Daily ({qt['date']})",
    )
    delete_quick_task(task_id)
    return {"status": "moved", "new_task_id": new_task["id"], "task": new_task}


@router.post("/{task_id}/move-to-plan")
async def move_to_plan_endpoint(task_id: int) -> dict:
    """Convert quick task into a new project."""
    qt = get_quick_task(task_id)
    if not qt:
        raise HTTPException(status_code=404, detail="Quick task not found")

    project = create_project(
        title=qt["title"],
        description=f"Created from Quick Daily task ({qt['date']})",
    )
    delete_quick_task(task_id)
    return {"status": "moved", "project_id": project["id"], "project": project}


# ── AI Endpoints ─────────────────────────────────────────────────────────────

@router.post("/ai-day-plan")
async def ai_day_plan_endpoint(payload: AIDayPlanRequest) -> dict:
    """AI selects best tasks for available hours from quick tasks + smart tasks."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    today_str = date.today().isoformat()
    quick_tasks = get_quick_tasks_for_date(today_str)
    all_smart = get_all_tasks()
    smart_urgent = [
        t for t in all_smart
        if t["status"] in ("in_progress",) or t["priority"] in ("p1", "p2")
        and t["status"] != "done"
    ]

    # Build task list for AI
    task_list = []
    for qt in quick_tasks:
        if not qt["done"]:
            task_list.append({
                "task_id": qt["id"],
                "source": "quick",
                "title": qt["title"],
                "quadrant": qt["quadrant"],
            })
    for st in smart_urgent[:10]:  # Limit to avoid token overflow
        task_list.append({
            "task_id": st["id"],
            "source": "smart",
            "title": st["title"],
            "priority": st["priority"],
            "time_estimate": st["time_estimate"] or "unknown",
        })

    if not task_list:
        return {"plan": [], "message": "No tasks available for planning."}

    task_json = json.dumps(task_list, indent=2)
    prompt = f"""You are a productivity coach. The user has {payload.available_hours} hours available today.
Here are their tasks from different sources:
{task_json}

Select the best tasks that fit within {payload.available_hours} hours. For each selected task, allocate time realistically.
Return ONLY a valid JSON array:
[
  {{"task_id": 1, "source": "quick|smart", "title": "...", "allocated_time": "30 mins", "reason": "Brief reason for selecting"}}
]
No extra text, just raw JSON array."""

    try:
        response_text = _call_ai(prompt, payload.model)
        plan = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Day Plan failed: {exc}")

    return {"plan": plan}


@router.post("/eisenhower-auto")
async def eisenhower_auto_endpoint(payload: AIEisenhowerRequest) -> dict:
    """AI auto-assigns quadrants to today's quick tasks."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    today_str = date.today().isoformat()
    tasks = get_quick_tasks_for_date(today_str)
    undone = [t for t in tasks if not t["done"]]

    if not undone:
        return {"assignments": [], "message": "No undone tasks to sort."}

    task_list = [{"task_id": t["id"], "title": t["title"]} for t in undone]
    task_json = json.dumps(task_list, indent=2)

    prompt = f"""You are a productivity expert using the Eisenhower Matrix.
Categorize each task into one of 4 quadrants:
- do_now: Urgent + Important — must be done today
- schedule: Not Urgent + Important — should be planned for later
- delegate: Urgent + Not Important — could be delegated or done quickly
- eliminate: Not Urgent + Not Important — consider dropping

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

    # Apply updates
    bulk_update_quadrants(assignments)

    return {"assignments": assignments}


@router.post("/end-of-day")
async def end_of_day_endpoint(payload: EndOfDayRequest) -> dict:
    """Archive completed tasks, handle incomplete based on user choices."""
    _call_ai, _ = _get_ai_helpers()

    today_str = date.today().isoformat()

    # 1. Archive completed tasks
    archived_count = archive_completed_quick_tasks(today_str)

    # 2. Move to tomorrow
    moved_tomorrow = 0
    if payload.move_to_tomorrow:
        moved_tomorrow = move_quick_tasks_to_tomorrow(payload.move_to_tomorrow)

    # 3. Move to Smart To-Do
    moved_smart = 0
    for tid in payload.move_to_smart:
        qt = get_quick_task(tid)
        if qt:
            create_task(title=qt["title"], context=f"Moved from Quick Daily ({qt['date']})")
            delete_quick_task(tid)
            moved_smart += 1

    # 4. Discard
    discarded = 0
    for tid in payload.discard:
        if delete_quick_task(tid):
            discarded += 1

    # 5. AI encouragement
    remaining = get_quick_tasks_for_date(today_str)
    total_done = archived_count
    total_remaining = len(remaining)

    prompt = f"""You are a productivity coach. The user is ending their day.
They completed {total_done} tasks today.
They moved {moved_tomorrow} tasks to tomorrow, {moved_smart} to their full task list, and discarded {discarded}.
Generate a short (1-2 sentences), encouraging summary of their day. Be positive and motivating."""

    try:
        encouragement = _call_ai(prompt, payload.model)
    except Exception:
        encouragement = f"Great work completing {total_done} tasks today! Tomorrow is a fresh start."

    return {
        "summary": encouragement.strip(),
        "archived_count": archived_count,
        "moved_tomorrow": moved_tomorrow,
        "moved_smart": moved_smart,
        "discarded": discarded,
    }
