"""FastAPI router for Plan & Project module.

Endpoints:
  POST   /projects                          — Create a project
  GET    /projects                          — List all projects with stats
  PATCH  /projects/{id}                     — Update a project
  DELETE /projects/{id}                     — Delete project + nodes
  GET    /projects/{id}/tree                — Full project node tree
  POST   /projects/{id}/nodes               — Add a node
  POST   /project-nodes/{id}/dive-deeper    — AI strategic breakdown
  POST   /project-nodes/{id}/chunk          — AI actionable breakdown
  POST   /project-nodes/{id}/move-to-smart  — Export node to Smart To-Do
  POST   /project-nodes/{id}/move-to-quick  — Export node to Quick Daily
  POST   /projects/eisenhower-auto          — AI assigns quadrants to projects
  POST   /projects/{id}/ai-roadmap          — AI generates phased roadmap
"""

from __future__ import annotations

import json
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .projects_db import (
    create_project,
    get_all_projects,
    get_project,
    update_project,
    delete_project,
    get_project_node_tree,
    create_project_node,
    get_project_node,
    get_node_sibling_titles,
    update_project_node,
    delete_project_node,
    create_project_nodes_batch,
    bulk_update_project_quadrants,
)
from .db import create_task
from .quick_db import create_quick_task

router = APIRouter(tags=["projects"])


# ── Pydantic models ──────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "p3"
    color: Optional[str] = None
    icon: Optional[str] = None
    due_date: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    eisenhower_quadrant: Optional[str] = None
    due_date: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class NodeCreate(BaseModel):
    title: str
    parent_node_id: Optional[int] = None
    node_type: str = "topic"


class AIRequest(BaseModel):
    model: str = "gemini"


# ── AI helpers ───────────────────────────────────────────────────────────────

def _get_ai_helpers():
    from .router import _call_ai, _extract_json_array
    return _call_ai, _extract_json_array


# ── Project CRUD ─────────────────────────────────────────────────────────────

@router.post("/projects")
async def create_project_endpoint(payload: ProjectCreate) -> dict:
    return create_project(
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        color=payload.color,
        icon=payload.icon,
        due_date=payload.due_date,
    )


@router.get("/projects")
async def list_projects_endpoint() -> List[dict]:
    return get_all_projects()


@router.patch("/projects/{project_id}")
async def update_project_endpoint(project_id: int, payload: ProjectUpdate) -> dict:
    updates = payload.model_dump(exclude_none=True)
    project = update_project(project_id, **updates)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/projects/{project_id}")
async def delete_project_endpoint(project_id: int) -> dict:
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted", "id": project_id}


# ── Project Nodes ────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/tree")
async def get_project_tree_endpoint(project_id: int) -> List[dict]:
    p = get_project(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return get_project_node_tree(project_id)


@router.post("/projects/{project_id}/nodes")
async def create_node_endpoint(project_id: int, payload: NodeCreate) -> dict:
    p = get_project(project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return create_project_node(
        project_id=project_id,
        title=payload.title,
        parent_node_id=payload.parent_node_id,
        node_type=payload.node_type,
    )


@router.post("/project-nodes/{node_id}/dive-deeper")
async def dive_deeper_node_endpoint(node_id: int, payload: AIRequest) -> dict:
    """AI generates 3-5 strategic subtopics as child nodes."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    node = get_project_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    project = get_project(node["project_id"])
    siblings = get_node_sibling_titles(node["parent_node_id"], node["project_id"])

    prompt = f"""You are a strategic project planner. Break this topic into 3-5 strategic subtopics or phases.

Project: {project['title']}
Project Description: {project.get('description') or 'No description'}
Current Topic: {node['title']}
Existing Siblings: {', '.join(siblings) if siblings else 'None'}

Return ONLY a valid JSON array:
[
  {{"title": "Subtopic title", "node_type": "topic|phase|idea"}}
]
No extra text, no markdown blocks, just raw JSON array."""

    try:
        response_text = _call_ai(prompt, payload.model)
        subtopics = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Dive Deeper failed: {exc}")

    children = create_project_nodes_batch(
        project_id=node["project_id"],
        parent_node_id=node_id,
        nodes_data=subtopics,
        generation_type="dive_deeper",
    )
    return {"children": children}


@router.post("/project-nodes/{node_id}/chunk")
async def chunk_node_endpoint(node_id: int, payload: AIRequest) -> dict:
    """AI breaks node into 3-5 concrete action items."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    node = get_project_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    project = get_project(node["project_id"])

    prompt = f"""You are a task breakdown expert. Convert this project topic into 3-5 concrete, actionable tasks.

Project: {project['title']}
Topic: {node['title']}

Each action should be specific and completable. Return ONLY a valid JSON array:
[
  {{"title": "Action item title", "node_type": "action"}}
]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        actions = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Chunk failed: {exc}")

    children = create_project_nodes_batch(
        project_id=node["project_id"],
        parent_node_id=node_id,
        nodes_data=actions,
        generation_type="chunk",
    )
    return {"children": children}


@router.post("/project-nodes/{node_id}/move-to-smart")
async def move_node_to_smart_endpoint(node_id: int) -> dict:
    """Export project node as a Smart To-Do task."""
    node = get_project_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    project = get_project(node["project_id"])
    new_task = create_task(
        title=node["title"],
        context=f"From project: {project['title']}",
    )
    update_project_node(node_id, exported_to_smart_todo=1, exported_task_id=new_task["id"])
    return {"status": "exported", "task": new_task}


@router.post("/project-nodes/{node_id}/move-to-quick")
async def move_node_to_quick_endpoint(node_id: int) -> dict:
    """Export project node as today's quick task."""
    node = get_project_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    today_str = date.today().isoformat()
    qt = create_quick_task(
        title=node["title"],
        task_date=today_str,
        source="moved_from_plan",
    )
    update_project_node(node_id, exported_to_quick=1)
    return {"status": "exported", "quick_task": qt}


# ── AI Endpoints ─────────────────────────────────────────────────────────────

@router.post("/projects/eisenhower-auto")
async def eisenhower_auto_projects_endpoint(payload: AIRequest) -> dict:
    """AI assigns quadrants to all active projects."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    projects = get_all_projects()
    active = [p for p in projects if p["status"] == "active"]
    if not active:
        return {"assignments": []}

    project_list = [
        {"project_id": p["id"], "title": p["title"], "priority": p["priority"],
         "due_date": p["due_date"] or "none", "description": (p["description"] or "")[:100]}
        for p in active
    ]
    project_json = json.dumps(project_list, indent=2)

    prompt = f"""You are a strategic planning expert using the Eisenhower Matrix for projects.
Categorize each project:
- do_now: Urgent + Important
- schedule: Not Urgent + Important
- delegate: Urgent + Not Important
- eliminate: Not Urgent + Not Important

Projects:
{project_json}

Return ONLY a valid JSON array:
[
  {{"project_id": 1, "quadrant": "do_now", "reasoning": "Brief reason"}}
]"""

    try:
        response_text = _call_ai(prompt, payload.model)
        assignments = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Eisenhower sort failed: {exc}")

    bulk_update_project_quadrants(assignments)
    return {"assignments": assignments}


@router.post("/projects/{project_id}/ai-roadmap")
async def ai_roadmap_endpoint(project_id: int, payload: AIRequest) -> dict:
    """AI generates a phased roadmap for a project."""
    _call_ai, _extract_json_array = _get_ai_helpers()

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    existing_nodes = get_project_node_tree(project_id)
    node_titles = [n["title"] for n in existing_nodes] if existing_nodes else []

    prompt = f"""You are a project manager. Create a phased roadmap for this project.

Project: {project['title']}
Description: {project.get('description') or 'No description'}
Priority: {project['priority']}
Due date: {project.get('due_date') or 'Not set'}
Existing topics explored: {', '.join(node_titles[:10]) if node_titles else 'None'}

Return ONLY a valid JSON array of phases:
[
  {{
    "phase": "Phase 1: Research",
    "duration": "1 week",
    "key_tasks": ["Task 1", "Task 2"],
    "milestone": "Research report complete"
  }}
]
Create 3-5 phases. No extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        phases = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Roadmap failed: {exc}")

    return {"roadmap": phases}
