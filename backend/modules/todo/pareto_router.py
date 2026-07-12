"""FastAPI router for 80/20 Principle (Pareto) Integration."""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from modules.common.db import get_db_path

router = APIRouter(prefix="/pareto", tags=["pareto"])

class AnalyzeRequest(BaseModel):
    scope: str = "all"  # "smart", "quick", "plan", or "all"
    model: str = "gemini"


def _get_ai_helpers():
    from .router import _call_ai, _extract_json_array
    return _call_ai, _extract_json_array


@router.post("/analyze")
async def analyze_pareto_endpoint(payload: AnalyzeRequest) -> dict:
    """Analyze non-done tasks to identify the top 20% high-leverage ones."""
    conn = sqlite3.connect(get_db_path())
    cursor = conn.cursor()

    tasks_to_analyze = []

    try:
        # Collect tasks based on scope
        if payload.scope in ("smart", "all"):
            cursor.execute(
                "SELECT id, title, priority, due_date, intention, definition_of_done, time_estimate "
                "FROM tasks WHERE status != 'done'"
            )
            for row in cursor.fetchall():
                tasks_to_analyze.append({
                    "table": "tasks",
                    "id": row[0],
                    "title": row[1],
                    "priority": row[2],
                    "due_date": row[3],
                    "intention": row[4],
                    "definition_of_done": row[5],
                    "time_estimate": row[6],
                })

        if payload.scope in ("quick", "all"):
            from datetime import date
            today_str = date.today().isoformat()
            cursor.execute("SELECT id, title, quadrant FROM quick_tasks WHERE date = ? AND done = 0", (today_str,))
            for row in cursor.fetchall():
                tasks_to_analyze.append({
                    "table": "quick_tasks",
                    "id": row[0],
                    "title": row[1],
                    "quadrant": row[2]
                })

        if payload.scope in ("plan", "all"):
            cursor.execute(
                "SELECT n.id, n.title, p.title as project_title, p.priority "
                "FROM project_nodes n "
                "JOIN projects p ON n.project_id = p.id "
                "WHERE p.status = 'active'"
            )
            for row in cursor.fetchall():
                tasks_to_analyze.append({
                    "table": "project_nodes",
                    "id": row[0],
                    "title": row[1],
                    "project_title": row[2],
                    "project_priority": row[3],
                })
    finally:
        conn.close()

    if not tasks_to_analyze:
        return {"results": [], "message": "No tasks to analyze in the specified scope."}

    _call_ai, _extract_json_array = _get_ai_helpers()

    # To avoid token limits, if there are many tasks, we might need to batch, but for now we'll pass up to 50
    # and expect the AI to score them all.
    task_json = json.dumps(tasks_to_analyze[:50], indent=2)

    prompt = f"""You are a productivity strategist applying the 80/20 Pareto Principle.
Analyze these tasks and identify which 20% will produce 80% of meaningful results.
Consider: strategic impact, dependency, alignment with intentions, urgency vs importance, and friction removal.

Tasks:
{task_json}

For each task return a pareto_score between 0.0 and 1.0 and a one-line reason.
is_top_20 should be true ONLY for the top 20% of the tasks in this list (roughly {max(1, len(tasks_to_analyze[:50]) // 5)} tasks).
Return ONLY JSON:
[
  {{ "table": "tasks", "id": 1, "pareto_score": 0.92, "is_top_20": true, "reason": "Unblocks 4 other tasks" }}
]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        results = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Pareto Analysis failed: {exc}")

    # Update DB
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for res in results:
            table = res.get("table")
            tid = res.get("id")
            score = res.get("pareto_score")
            top20 = 1 if res.get("is_top_20") else 0
            if table and tid and score is not None:
                # Ensure we only update valid tables to prevent injection
                if table in ("tasks", "quick_tasks", "project_nodes"):
                    cursor.execute(
                        f"UPDATE {table} SET pareto_score = ?, is_top_20 = ? WHERE id = ?",
                        (score, top20, tid)
                    )
        conn.commit()
    finally:
        conn.close()

    return {"results": results}


@router.get("/top20")
async def get_top20_endpoint() -> dict:
    """Returns all is_top_20 = true tasks across all scopes."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        # smart
        cursor.execute("SELECT id, title, pareto_score FROM tasks WHERE is_top_20 = 1 AND status != 'done'")
        smart_tasks = [{"id": r[0], "title": r[1], "pareto_score": r[2]} for r in cursor.fetchall()]

        # quick
        cursor.execute("SELECT id, title, pareto_score FROM quick_tasks WHERE is_top_20 = 1 AND done = 0")
        quick_tasks = [{"id": r[0], "title": r[1], "pareto_score": r[2]} for r in cursor.fetchall()]

        # plan
        cursor.execute("SELECT id, title, pareto_score FROM project_nodes WHERE is_top_20 = 1")
        plan_nodes = [{"id": r[0], "title": r[1], "pareto_score": r[2]} for r in cursor.fetchall()]

    finally:
        conn.close()

    return {
        "smart": smart_tasks,
        "quick": quick_tasks,
        "plan": plan_nodes,
    }


@router.post("/reanalyze/{table}/{task_id}")
async def reanalyze_single_endpoint(table: str, task_id: int, payload: AnalyzeRequest) -> dict:
    """Re-scores a single task."""
    if table not in ("tasks", "quick_tasks", "project_nodes"):
        raise HTTPException(status_code=400, detail="Invalid table")

    conn = sqlite3.connect(get_db_path())
    task_data = None
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {table} WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")
        
        # We just need some basic context for the AI
        columns = [desc[0] for desc in cursor.description]
        task_data = dict(zip(columns, row))
    finally:
        conn.close()

    _call_ai, _extract_json_array = _get_ai_helpers()

    task_json = json.dumps(task_data, indent=2)
    prompt = f"""You are a productivity strategist. Evaluate this single task on a scale of 0.0 to 1.0 for its Pareto impact.
A score > 0.8 means it is highly likely to be a Top 20% leverage task.
Task data:
{task_json}

Return ONLY JSON:
[{{ "pareto_score": 0.85, "is_top_20": true, "reason": "High impact due to..." }}]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload.model)
        results = _extract_json_array(response_text)
        if not results:
            raise ValueError("No result returned")
        res = results[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Pareto Analysis failed: {exc}")

    score = res.get("pareto_score")
    top20 = 1 if res.get("is_top_20") else 0

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE {table} SET pareto_score = ?, is_top_20 = ? WHERE id = ?",
            (score, top20, task_id)
        )
        conn.commit()
    finally:
        conn.close()

    return {"status": "success", "pareto_score": score, "is_top_20": bool(top20), "reason": res.get("reason")}
