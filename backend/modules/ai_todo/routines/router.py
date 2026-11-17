"""FastAPI router for To-Do Routines: groups of things you tick off each day.

Dailies is the group every user has (on every day). A user adds groups of their own (Weekdays, Weekend, Deployment
eve) and gives each the weekdays it is on, or switches it on for one date. Items move freely between groups, out to
the To-Do (a task) or Quick Daily, and tasks / quick tasks move in.

Endpoints:
  GET    /todo/routines                          — Groups with their items (Dailies first; made on first read)
  POST   /todo/routines/groups                   — New group {name, days?}
  PATCH  /todo/routines/groups/{id}              — Rename, set days, switch on for a date (active_on)
  DELETE /todo/routines/groups/{id}              — Delete a group and its items (not Dailies)
  POST   /todo/routines/groups/{id}/items        — Add an item {title, priority?, notes?}
  PATCH  /todo/routines/items/{id}               — Edit, tick for a date (done_on), move to another group (group_id)
  DELETE /todo/routines/items/{id}               — Delete an item
  POST   /todo/routines/items/{id}/move-out      — Item -> a To-Do task (to='task', due_date?) or Quick Daily (to='quick')
  POST   /todo/tasks/{id}/move-to-routine        — To-Do task -> a group {group_id} (subtasks are deleted with it)
  POST   /todo/quick-tasks/{id}/move-to-routine  — Quick Daily task -> a group {group_id}

Every move is a real move: the source row is deleted, like the other To-Do moves. Dates (done_on, active_on,
due_date) are the browser's local YYYY-MM-DD, so "today" is the user's today wherever the server runs.

TypeScript twin: frontend/fe-apis/todo/routines/handlers.ts. Limits, status codes and error texts are copied
verbatim, so change both.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id

from ..quick.db import create_quick_task, delete_quick_task, get_quick_task
from ..schedules.rules import js_trim
from ..shared.patch import patch_updates
from ..tasks.db import create_task, delete_task, get_task
from .db import (
    count_groups,
    count_items,
    create_group,
    create_item,
    delete_group,
    delete_item,
    get_group,
    get_item,
    list_groups,
    update_group,
    update_item,
)

router = APIRouter(prefix="/todo", tags=["routines"], dependencies=[Depends(get_current_user_id)])

NAME_MAX = 60
TITLE_MAX = 200
NOTES_MAX = 2000
GROUPS_MAX = 30
ITEMS_MAX = 100
PRIORITIES = ("p1", "p2", "p3", "p4")
DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


class GroupCreate(BaseModel):
    name: str
    days: Optional[List[int]] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    days: Optional[List[int]] = None
    active_on: Optional[str] = None


GROUP_NULLABLE = frozenset({"days", "active_on"})


class ItemCreate(BaseModel):
    title: str
    priority: str = "p3"
    notes: Optional[str] = None


class ItemUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    done_on: Optional[str] = None
    group_id: Optional[int] = None


ITEM_NULLABLE = frozenset({"notes", "done_on"})


class MoveOutRequest(BaseModel):
    to: str
    due_date: Optional[str] = None


class MoveInRequest(BaseModel):
    group_id: int


# ── Validation (same texts as the TypeScript twin) ──────────────────────────


def _checked_name(value: Optional[str]) -> str:
    name = js_trim(value or "")
    if not name:
        raise HTTPException(status_code=400, detail="Give the group a name.")
    if len(name) > NAME_MAX:
        raise HTTPException(status_code=400, detail=f"Keep the name to {NAME_MAX} characters.")
    return name


def _checked_title(value: Optional[str]) -> str:
    title = js_trim(value or "")
    if not title:
        raise HTTPException(status_code=400, detail="Write what to do.")
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"Keep it to {TITLE_MAX} characters.")
    return title


def _checked_notes(value: Optional[str]) -> Optional[str]:
    notes = js_trim(value or "")
    if len(notes) > NOTES_MAX:
        raise HTTPException(status_code=400, detail=f"Keep notes to {NOTES_MAX} characters.")
    return notes or None


def _checked_priority(value: str) -> str:
    if value not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Priority must be p1, p2, p3 or p4.")
    return value


def _checked_days(value: Optional[List[int]]) -> Optional[List[int]]:
    if value is None:
        return None
    if any(d < 0 or d > 6 for d in value):
        raise HTTPException(status_code=400, detail="Days are 0 (Sunday) to 6 (Saturday).")
    return sorted(set(value)) or None


def _checked_date(value: Optional[str], field: str) -> Optional[str]:
    if value is None:
        return None
    if not DATE_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail=f"{field} must be a date like 2026-11-17.")
    return value


def _require_group(group_id: int, user_id: int) -> Dict[str, Any]:
    group = get_group(group_id, user_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Routine group not found")
    return group


def _require_item(item_id: int, user_id: int) -> Dict[str, Any]:
    item = get_item(item_id, user_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Routine item not found")
    return item


def _require_room(group_id: int, user_id: int) -> None:
    if count_items(group_id, user_id) >= ITEMS_MAX:
        raise HTTPException(status_code=400, detail=f"A group holds up to {ITEMS_MAX} items.")


def _carried(value: Any, limit: int) -> Optional[str]:
    """Text taken over from a task when it moves in: trimmed and cut to the routine's limit."""
    text = js_trim(value) if isinstance(value, str) else ""
    return text[:limit] or None


# ── Groups ──────────────────────────────────────────────────────────────────


@router.get("/routines")
async def list_routines_endpoint(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return list_groups(user_id)


@router.post("/routines/groups")
async def create_group_endpoint(payload: GroupCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    name = _checked_name(payload.name)
    days = _checked_days(payload.days)
    if count_groups(user_id) >= GROUPS_MAX:
        raise HTTPException(status_code=400, detail=f"You can have up to {GROUPS_MAX} routine groups.")
    return create_group(user_id, name, days)


@router.patch("/routines/groups/{group_id}")
async def update_group_endpoint(
    group_id: int, payload: GroupUpdate, user_id: int = Depends(get_current_user_id)
) -> dict:
    group = _require_group(group_id, user_id)
    updates = patch_updates(payload, GROUP_NULLABLE)
    if "name" in updates:
        updates["name"] = _checked_name(updates["name"])
    if "days" in updates:
        updates["days"] = _checked_days(updates["days"])
    if "active_on" in updates:
        updates["active_on"] = _checked_date(updates["active_on"], "active_on")
    if group["kind"] == "dailies" and ("days" in updates or "active_on" in updates):
        raise HTTPException(status_code=400, detail="Dailies are on every day.")
    updated = update_group(group_id, user_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Routine group not found")
    return updated


@router.delete("/routines/groups/{group_id}")
async def delete_group_endpoint(group_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    group = _require_group(group_id, user_id)
    if group["kind"] == "dailies":
        raise HTTPException(status_code=400, detail="Dailies can't be deleted.")
    delete_group(group_id, user_id)
    return {"status": "deleted", "id": group_id}


# ── Items ───────────────────────────────────────────────────────────────────


@router.post("/routines/groups/{group_id}/items")
async def create_item_endpoint(group_id: int, payload: ItemCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    _require_group(group_id, user_id)
    title = _checked_title(payload.title)
    priority = _checked_priority(payload.priority)
    notes = _checked_notes(payload.notes)
    _require_room(group_id, user_id)
    return create_item(user_id, group_id, title, priority, notes)


@router.patch("/routines/items/{item_id}")
async def update_item_endpoint(item_id: int, payload: ItemUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    item = _require_item(item_id, user_id)
    updates = patch_updates(payload, ITEM_NULLABLE)
    if "title" in updates:
        updates["title"] = _checked_title(updates["title"])
    if "priority" in updates:
        updates["priority"] = _checked_priority(updates["priority"])
    if "notes" in updates:
        updates["notes"] = _checked_notes(updates["notes"])
    if "done_on" in updates:
        updates["done_on"] = _checked_date(updates["done_on"], "done_on")
    if "group_id" in updates:
        if updates["group_id"] == item["group_id"]:
            del updates["group_id"]
        else:
            _require_group(updates["group_id"], user_id)
            _require_room(updates["group_id"], user_id)
    updated = update_item(item_id, user_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Routine item not found")
    return updated


@router.delete("/routines/items/{item_id}")
async def delete_item_endpoint(item_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not delete_item(item_id, user_id):
        raise HTTPException(status_code=404, detail="Routine item not found")
    return {"status": "deleted", "id": item_id}


# ── Moves between Routines and the rest of the To-Do ────────────────────────


@router.post("/routines/items/{item_id}/move-out")
async def move_item_out_endpoint(
    item_id: int, payload: MoveOutRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    item = _require_item(item_id, user_id)
    if payload.to == "task":
        due_date = _checked_date(payload.due_date, "due_date")
        task = create_task(
            user_id=user_id, title=item["title"], priority=item["priority"], context=item["notes"], due_date=due_date
        )
        delete_item(item_id, user_id)
        return {"status": "moved", "task": task}
    if payload.to == "quick":
        quick_task = create_quick_task(user_id=user_id, title=item["title"], source="moved_from_routine")
        delete_item(item_id, user_id)
        return {"status": "moved", "quick_task": quick_task}
    raise HTTPException(status_code=400, detail="Move it to 'task' or 'quick'.")


@router.post("/tasks/{task_id}/move-to-routine")
async def move_task_to_routine_endpoint(
    task_id: int, payload: MoveInRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    task = get_task(task_id, user_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    _require_group(payload.group_id, user_id)
    _require_room(payload.group_id, user_id)
    priority = task["priority"] if task["priority"] in PRIORITIES else "p3"
    item = create_item(
        user_id,
        payload.group_id,
        _carried(task["title"], TITLE_MAX) or "Untitled",
        priority,
        _carried(task["context"], NOTES_MAX),
    )
    delete_task(task_id, user_id)
    return {"status": "moved", "item": item}


@router.post("/quick-tasks/{task_id}/move-to-routine")
async def move_quick_task_to_routine_endpoint(
    task_id: int, payload: MoveInRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    quick_task = get_quick_task(task_id, user_id)
    if quick_task is None:
        raise HTTPException(status_code=404, detail="Quick task not found")
    _require_group(payload.group_id, user_id)
    _require_room(payload.group_id, user_id)
    item = create_item(
        user_id,
        payload.group_id,
        _carried(quick_task["title"], TITLE_MAX) or "Untitled",
        "p3",
        _carried(quick_task["context"], NOTES_MAX),
    )
    delete_quick_task(task_id, user_id)
    return {"status": "moved", "item": item}
