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

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
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


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    time_estimate: Optional[str] = None
    due_date: Optional[str] = None
    context: Optional[str] = None
    attachments: Optional[List[str]] = None


class AIBreakdownRequest(BaseModel):
    model: str = "gemini"  # "ollama" or "gemini"


class RegenerateRequest(BaseModel):
    model: str = "gemini"


class CopilotAskRequest(BaseModel):
    question: str
    model: str = "gemini"


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


@router.post("/tasks/upload-context")
async def upload_context(file: UploadFile = File(...)) -> dict:
    """Accept .txt, .pdf, .docx uploads and extract plain text."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".txt", ".pdf", ".docx"):
        raise HTTPException(status_code=400, detail="Only .txt, .pdf, .docx files are supported")

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    file_path = _UPLOAD_DIR / file.filename
    content = await file.read()
    file_path.write_bytes(content)

    extracted_text = ""
    try:
        if ext == ".txt":
            extracted_text = content.decode("utf-8", errors="replace")

        elif ext == ".pdf":
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

        elif ext == ".docx":
            try:
                import docx
            except ImportError:
                raise HTTPException(status_code=500, detail="python-docx not installed")
            doc = docx.Document(str(file_path))
            extracted_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to extract text: {exc}")

    return {
        "filename": file.filename,
        "extracted_text": extracted_text.strip(),
        "char_count": len(extracted_text.strip()),
    }


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
        context_snippet = ""
        if task.get("context"):
            context_snippet = f' | Context: {task["context"][:80]}...'
        lines.append(
            f'{prefix}- [{status.upper()}] [{priority.upper()}] {task["title"]} '
            f'(Time: {time_est}, Due: {due}){context_snippet}'
        )
        children = task.get("children", [])
        if children:
            lines.append(_build_task_summary(children, indent + 1))
    return "\n".join(lines)


@router.post("/copilot/ask")
async def copilot_ask(payload: CopilotAskRequest) -> dict:
    """Answer productivity questions based on the user's task tree.

    Uses smarter context: only active tasks in detail, done/backlog summarized as counts.
    """
    copilot_data = get_active_tasks_for_copilot()
    active_tree = copilot_data["active_tree"]
    summary = copilot_data["summary"]

    task_summary = _build_task_summary(active_tree) if active_tree else "No active tasks."

    prompt = f"""You are a productivity copilot. Here are the user's current active tasks with priorities, statuses, time estimates, due dates, and subtask trees:

{task_summary}

Summary: {summary['total']} total tasks, {summary['done_count']} completed, {summary['backlog_no_date_count']} in backlog without due dates, {summary['active_count']} active.

Answer the user's question helpfully and concisely based on these tasks. Be specific — reference actual task names. Keep responses under 200 words unless the user asks for detail.

User's question: {payload.question}"""

    try:
        response_text = _call_ai(prompt, payload.model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI call failed: {exc}")

    return {"answer": response_text.strip()}
