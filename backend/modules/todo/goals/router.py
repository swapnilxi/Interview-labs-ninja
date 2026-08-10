"""FastAPI router for the Goals module (hierarchical yearly/quarterly/monthly/weekly/daily planning).

Endpoints:
  POST   /todo/goals                    — Create a goal node (at any level, parent optional)
  GET    /todo/goals/tree               — Full nested goal forest for the user
  PATCH  /todo/goals/{id}                — Update a goal node
  DELETE /todo/goals/{id}                — Delete a goal node (cascades to children)
  POST   /todo/goals/{id}/dive-deeper    — AI strategic breakdown (next level down)
  POST   /todo/goals/{id}/chunk          — AI actionable breakdown (daily action items)
  POST   /todo/goals/{id}/move-to-smart  — Export node to Smart To-Do
  POST   /todo/goals/{id}/move-to-quick  — Export node to Quick Daily
  POST   /todo/goals/{id}/move-to-plan   — Export node to Plan & Project
"""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id
from modules.common.ai_client import AISettings

from .db import (
    LEVEL_ORDER,
    create_goal_node,
    get_goal_tree,
    get_goal_node,
    get_goal_sibling_titles,
    update_goal_node,
    delete_goal_node,
    create_goal_nodes_batch,
)

router = APIRouter(prefix="/todo", tags=["goals"], dependencies=[Depends(get_current_user_id)])


# ── Pydantic models ──────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    title: str
    level: str = "daily"
    parent_id: Optional[int] = None
    description: Optional[str] = None
    priority: str = "p3"
    due_date: Optional[str] = None
    status: str = "backlog"


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    level: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    parent_id: Optional[int] = None
    order_index: Optional[int] = None


class GoalAIRequest(AISettings):
    pass


# ── AI helper access (deferred import, reused across todo verticals) ────────

def _get_ai_helpers():
    from ..shared.ai_helpers import call_ai as _call_ai, extract_json_array as _extract_json_array
    return _call_ai, _extract_json_array


def _next_level_down(level: str) -> str:
    if level in LEVEL_ORDER and level != LEVEL_ORDER[-1]:
        return LEVEL_ORDER[LEVEL_ORDER.index(level) + 1]
    return "daily"


# ── Goal CRUD ────────────────────────────────────────────────────────────────

@router.post("/goals")
async def create_goal_endpoint(payload: GoalCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    return create_goal_node(
        user_id=user_id,
        title=payload.title,
        level=payload.level,
        parent_id=payload.parent_id,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        status=payload.status,
    )


@router.get("/goals/tree")
async def get_goal_tree_endpoint(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return get_goal_tree(user_id)


@router.patch("/goals/{goal_id}")
async def update_goal_endpoint(goal_id: int, payload: GoalUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    updates = payload.model_dump(exclude_none=True)
    updated = update_goal_node(goal_id, user_id, **updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Goal not found")
    return updated


@router.delete("/goals/{goal_id}")
async def delete_goal_endpoint(goal_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not delete_goal_node(goal_id, user_id):
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"status": "deleted", "id": goal_id}


# ── AI Breakdown ─────────────────────────────────────────────────────────────

@router.post("/goals/{goal_id}/dive-deeper")
async def dive_deeper_goal_endpoint(goal_id: int, payload: GoalAIRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """AI generates 3-5 strategic sub-goals at the next level down (e.g. yearly -> quarterly)."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    node = get_goal_node(goal_id, user_id)
    if not node:
        raise HTTPException(status_code=404, detail="Goal not found")

    child_level = _next_level_down(node["level"])
    siblings = get_goal_sibling_titles(goal_id, user_id)

    prompt = f"""You are a strategic life/work planner. Break this {node['level']} goal into 3-5 concrete {child_level} sub-goals that move it forward.

Goal ({node['level']}): {node['title']}
Description: {node.get('description') or 'No description'}
Existing children already planned under this goal: {', '.join(siblings) if siblings else 'None'}

Generate NEW {child_level} sub-goals that complement (not repeat) the existing ones.
Return ONLY a valid JSON array:
[
  {{"title": "Sub-goal title", "description": "Optional one-line description"}}
]
No extra text, no markdown blocks, just raw JSON array."""

    try:
        response_text = _call_ai(prompt, payload)
        subgoals = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Dive Deeper failed: {exc}")

    if not subgoals:
        raise HTTPException(
            status_code=422,
            detail="AI didn't return any sub-goals for this one — try adding more detail to its description and breaking it down again.",
        )

    children = create_goal_nodes_batch(goal_id, user_id, subgoals[:5], "dive_deeper", child_level)
    return {"children": children}


@router.post("/goals/{goal_id}/chunk")
async def chunk_goal_endpoint(goal_id: int, payload: GoalAIRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """AI breaks a goal into 3-5 small, concrete, immediately-actionable daily steps."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    node = get_goal_node(goal_id, user_id)
    if not node:
        raise HTTPException(status_code=404, detail="Goal not found")

    prompt = f"""You are a task breakdown expert. Convert this {node['level']} goal into 3-5 small, concrete, immediately-actionable daily steps.

Goal ({node['level']}): {node['title']}
Description: {node.get('description') or 'No description'}

Each step should be specific and completable in a single day. Return ONLY a valid JSON array:
[
  {{"title": "Action item title", "description": "Optional one-line description"}}
]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload)
        steps = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Chunk failed: {exc}")

    if not steps:
        raise HTTPException(
            status_code=422,
            detail="AI couldn't find any actionable daily steps for this goal — try adding more detail to its description and chunking again.",
        )

    children = create_goal_nodes_batch(goal_id, user_id, steps[:5], "chunk", "daily")
    return {"children": children}


# ── Cross-module moves ───────────────────────────────────────────────────────

@router.post("/goals/{goal_id}/move-to-smart")
async def move_goal_to_smart_endpoint(goal_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    """Export a goal node as a Smart To-Do task."""
    node = get_goal_node(goal_id, user_id)
    if not node:
        raise HTTPException(status_code=404, detail="Goal not found")

    from ..tasks.db import create_task
    new_task = create_task(
        user_id=user_id,
        title=node["title"],
        context=node.get("description") or f"From goal: {node['title']}",
        priority=node["priority"],
        due_date=node.get("due_date"),
    )
    update_goal_node(goal_id, user_id, exported_to_smart_todo=1, exported_task_id=new_task["id"])
    return {"status": "exported", "task": new_task}


@router.post("/goals/{goal_id}/move-to-quick")
async def move_goal_to_quick_endpoint(goal_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    """Export a goal node as today's quick task."""
    node = get_goal_node(goal_id, user_id)
    if not node:
        raise HTTPException(status_code=404, detail="Goal not found")

    from ..quick.db import create_quick_task
    qt = create_quick_task(
        user_id=user_id,
        title=node["title"],
        task_date=date.today().isoformat(),
        source="moved_from_goal",
    )
    update_goal_node(goal_id, user_id, exported_to_quick=1, exported_quick_task_id=qt["id"])
    return {"status": "exported", "quick_task": qt}


@router.post("/goals/{goal_id}/move-to-plan")
async def move_goal_to_plan_endpoint(goal_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    """Export a goal node as a new project in Plan & Project."""
    node = get_goal_node(goal_id, user_id)
    if not node:
        raise HTTPException(status_code=404, detail="Goal not found")

    from ..projects.db import create_project
    project = create_project(
        user_id=user_id,
        title=node["title"],
        description=node.get("description") or f"Created from goal: {node['title']}",
        priority=node["priority"],
        due_date=node.get("due_date"),
    )
    update_goal_node(goal_id, user_id, exported_to_plan=1, exported_project_id=project["id"])
    return {"status": "exported", "project": project}
