"""FastAPI router for the 80/20 (Pareto) Principle integration.

Endpoints:
  POST /pareto/analyze              — AI scores tasks in a scope, flags the top 20%
  GET  /pareto/top20                — all is_top_20 items, grouped by tab
  POST /pareto/reanalyze/{table}/{id} — re-score a single item (tasks | quick_tasks | project_nodes | projects)

Manually-pinned items (pareto_locked=1, set whenever a human toggles "Top 20%"
via the normal PATCH endpoints) are skipped by the bulk /analyze sweep so AI
re-analysis never silently overwrites a user's explicit override. The single-item
/reanalyze endpoint is itself an explicit user action, so it unlocks + re-scores.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date
from typing import Any, Dict, List

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from modules.common.db import get_db_path
from modules.common.ai_client import AISettings

router = APIRouter(prefix="/pareto", tags=["pareto"])

_VALID_TABLES = ("tasks", "quick_tasks", "project_nodes", "projects")


class AnalyzeRequest(AISettings):
    scope: str = "all"  # "smart", "quick", "plan", or "all"


def _get_ai_helpers():
    from .router import _call_ai, _extract_json_array
    return _call_ai, _extract_json_array


def _fetch_scope_items(cursor: sqlite3.Cursor, scope: str) -> List[Dict[str, Any]]:
    """Collect un-locked, not-done items for the requested scope."""
    items: List[Dict[str, Any]] = []

    if scope in ("smart", "all"):
        cursor.execute(
            "SELECT id, title, priority, due_date, intention, definition_of_done, time_estimate "
            "FROM tasks WHERE status != 'done' AND (pareto_locked IS NULL OR pareto_locked = 0)"
        )
        for row in cursor.fetchall():
            items.append({
                "table": "tasks", "id": row[0], "title": row[1], "priority": row[2],
                "due_date": row[3], "intention": row[4], "definition_of_done": row[5],
                "time_estimate": row[6],
            })

    if scope in ("quick", "all"):
        today_str = date.today().isoformat()
        cursor.execute(
            "SELECT id, title, quadrant FROM quick_tasks "
            "WHERE date = ? AND done = 0 AND (pareto_locked IS NULL OR pareto_locked = 0)",
            (today_str,),
        )
        for row in cursor.fetchall():
            items.append({"table": "quick_tasks", "id": row[0], "title": row[1], "quadrant": row[2]})

    if scope in ("plan", "all"):
        cursor.execute(
            "SELECT n.id, n.title, p.title, p.priority "
            "FROM project_nodes n JOIN projects p ON n.project_id = p.id "
            "WHERE p.status = 'active' AND (n.pareto_locked IS NULL OR n.pareto_locked = 0)"
        )
        for row in cursor.fetchall():
            items.append({
                "table": "project_nodes", "id": row[0], "title": row[1],
                "project_title": row[2], "project_priority": row[3],
            })

        cursor.execute(
            "SELECT id, title, priority, due_date, description FROM projects "
            "WHERE status = 'active' AND (pareto_locked IS NULL OR pareto_locked = 0)"
        )
        for row in cursor.fetchall():
            items.append({
                "table": "projects", "id": row[0], "title": row[1], "priority": row[2],
                "due_date": row[3], "description": (row[4] or "")[:150],
            })

    return items


@router.post("/analyze")
async def analyze_pareto_endpoint(payload: AnalyzeRequest) -> dict:
    """Score all non-done, un-locked tasks in the requested scope and flag the top 20%."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        items = _fetch_scope_items(cursor, payload.scope)
    finally:
        conn.close()

    if not items:
        return {"results": [], "message": "No un-locked tasks to analyze in this scope."}

    _call_ai, _extract_json_array = _get_ai_helpers()

    # Cap to avoid blowing the prompt token budget on very large scopes.
    batch = items[:60]
    prompt = f"""You are a productivity strategist applying the 80/20 Pareto Principle.
Analyze these tasks and identify which 20% will produce 80% of meaningful results.
Consider: strategic impact, dependency (other tasks blocked on this), alignment with stated
intentions, urgency vs importance, and which tasks remove the most friction.

Tasks:
{json.dumps(batch, indent=2)}

For each task return a pareto_score between 0.0 and 1.0 and a one-line reason.
is_top_20 should be true ONLY for roughly the top {max(1, len(batch) // 5)} tasks in this list.
Return ONLY JSON:
[
  {{ "table": "tasks", "id": 1, "pareto_score": 0.92, "is_top_20": true, "reason": "Unblocks 4 other tasks" }}
]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload)
        results = _extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Pareto Analysis failed: {exc}")

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for res in results:
            table = res.get("table")
            tid = res.get("id")
            score = res.get("pareto_score")
            top20 = 1 if res.get("is_top_20") else 0
            reason = res.get("reason")
            if table in _VALID_TABLES and tid and score is not None:
                cursor.execute(
                    f"UPDATE {table} SET pareto_score = ?, is_top_20 = ?, pareto_reason = ? "
                    f"WHERE id = ? AND (pareto_locked IS NULL OR pareto_locked = 0)",
                    (score, top20, reason, tid),
                )
        conn.commit()
    finally:
        conn.close()

    top20_count = sum(1 for r in results if r.get("is_top_20"))
    return {"results": results, "analyzed_count": len(results), "top20_count": top20_count}


@router.get("/top20")
async def get_top20_endpoint() -> dict:
    """Return all is_top_20=true items across all tables, grouped by tab."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM tasks "
            "WHERE is_top_20 = 1 AND status != 'done'"
        )
        smart = [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "tasks"}
            for r in cursor.fetchall()
        ]

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM quick_tasks "
            "WHERE is_top_20 = 1 AND done = 0"
        )
        quick = [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "quick_tasks"}
            for r in cursor.fetchall()
        ]

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM project_nodes WHERE is_top_20 = 1"
        )
        plan = [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "project_nodes"}
            for r in cursor.fetchall()
        ]

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM projects "
            "WHERE is_top_20 = 1 AND status = 'active'"
        )
        plan += [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "projects"}
            for r in cursor.fetchall()
        ]
    finally:
        conn.close()

    return {"smart": smart, "quick": quick, "plan": plan}


@router.post("/reanalyze/{table}/{item_id}")
async def reanalyze_single_endpoint(table: str, item_id: int, payload: AnalyzeRequest) -> dict:
    """Re-score a single item. Explicit single-item action, so it unlocks any manual pin."""
    if table not in _VALID_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {table} WHERE id = ?", (item_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        columns = [desc[0] for desc in cursor.description]
        item_data = dict(zip(columns, row))
    finally:
        conn.close()

    _call_ai, _extract_json_array = _get_ai_helpers()

    prompt = f"""You are a productivity strategist. Evaluate this single task on a scale of 0.0 to 1.0 for its
Pareto (80/20) impact — strategic value, dependencies it unblocks, urgency vs importance, and friction removed.
A score > 0.8 means it is highly likely to be a Top 20% leverage task.

Task data:
{json.dumps(item_data, indent=2, default=str)}

Return ONLY JSON:
[{{ "pareto_score": 0.85, "is_top_20": true, "reason": "High impact due to..." }}]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload)
        results = _extract_json_array(response_text)
        if not results:
            raise ValueError("No result returned")
        res = results[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Pareto Analysis failed: {exc}")

    score = res.get("pareto_score")
    top20 = 1 if res.get("is_top_20") else 0
    reason = res.get("reason")

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE {table} SET pareto_score = ?, is_top_20 = ?, pareto_reason = ?, pareto_locked = 0 WHERE id = ?",
            (score, top20, reason, item_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "status": "success",
        "pareto_score": score,
        "is_top_20": bool(top20),
        "reason": reason,
    }
