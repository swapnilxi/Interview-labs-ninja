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
from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user_id
from modules.common.db import get_db_path
from modules.common.ai import AISettings

router = APIRouter(prefix="/pareto", tags=["pareto"], dependencies=[Depends(get_current_user_id)])

_VALID_TABLES = ("tasks", "quick_tasks", "project_nodes", "projects")


class AnalyzeRequest(AISettings):
    scope: str = "all"  # "smart", "quick", "plan", or "all"


def _get_ai_helpers():
    from ..shared.ai_helpers import call_ai as _call_ai, extract_json_items as _extract_json_items
    return _call_ai, _extract_json_items


# One analysis scores at most this many items (a bigger scope is trimmed, as it always was).
_BATCH_LIMIT = 60
# If a reply is cut off, the items it never reached are sent again, at most this many calls in all.
_MAX_PASSES = 3


def _analysis_max_tokens(count: int) -> int:
    """Output budget for scoring `count` items in one reply.

    A scored item is ~45-60 output tokens (a pretty-printed JSON object plus a one-line reason). The default 2,048
    holds only ~35 of them: past that every provider silently cuts the reply off mid-array, and the answer used to
    fail with "No JSON array found in response" although most of the scores were already there.
    """
    return min(6000, 600 + 80 * count)


def _analysis_prompt(batch: List[Dict[str, Any]]) -> str:
    return f"""You are a productivity strategist applying the 80/20 Pareto Principle.
Analyze these tasks and identify which 20% will produce 80% of meaningful results.
Consider: strategic impact, dependency (other tasks blocked on this), alignment with stated
intentions, urgency vs importance, and which tasks remove the most friction.

Tasks:
{json.dumps(batch, indent=2)}

For each task return a pareto_score between 0.0 and 1.0 and a short reason (at most 12 words).
is_top_20 should be true ONLY for roughly the top {max(1, len(batch) // 5)} tasks in this list.
Return ONLY a JSON array with one object per task, no markdown and no extra text:
[
  {{ "table": "tasks", "id": 1, "pareto_score": 0.92, "is_top_20": true, "reason": "Unblocks 4 other tasks" }}
]"""


def _result_key(res: Dict[str, Any], pending: List[Dict[str, Any]]) -> tuple:
    """The (table, id) a scored result refers to. Models drop or mangle `table`; when the id is unique in the batch
    that is enough to tell which item was meant."""
    table = res.get("table")
    try:
        tid = int(res.get("id"))
    except (TypeError, ValueError):
        return (None, None)
    if table not in _VALID_TABLES:
        tables = {it["table"] for it in pending if it["id"] == tid}
        table = next(iter(tables)) if len(tables) == 1 else None
    return (table, tid)


def _fetch_scope_items(cursor: sqlite3.Cursor, scope: str, user_id: int) -> List[Dict[str, Any]]:
    """Collect un-locked, not-done items for the requested scope, owned by user_id."""
    items: List[Dict[str, Any]] = []

    if scope in ("smart", "all"):
        cursor.execute(
            "SELECT id, title, priority, due_date, intention, definition_of_done, time_estimate "
            "FROM tasks WHERE user_id = ? AND status != 'done' AND (pareto_locked IS NULL OR pareto_locked = 0)",
            (user_id,),
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
            "WHERE user_id = ? AND date = ? AND done = 0 AND (pareto_locked IS NULL OR pareto_locked = 0)",
            (user_id, today_str),
        )
        for row in cursor.fetchall():
            items.append({"table": "quick_tasks", "id": row[0], "title": row[1], "quadrant": row[2]})

    if scope in ("plan", "all"):
        cursor.execute(
            "SELECT n.id, n.title, p.title, p.priority "
            "FROM project_nodes n JOIN projects p ON n.project_id = p.id "
            "WHERE p.status = 'active' AND n.user_id = ? AND p.user_id = ? "
            "AND (n.pareto_locked IS NULL OR n.pareto_locked = 0)",
            (user_id, user_id),
        )
        for row in cursor.fetchall():
            items.append({
                "table": "project_nodes", "id": row[0], "title": row[1],
                "project_title": row[2], "project_priority": row[3],
            })

        cursor.execute(
            "SELECT id, title, priority, due_date, description FROM projects "
            "WHERE user_id = ? AND status = 'active' AND (pareto_locked IS NULL OR pareto_locked = 0)",
            (user_id,),
        )
        for row in cursor.fetchall():
            items.append({
                "table": "projects", "id": row[0], "title": row[1], "priority": row[2],
                "due_date": row[3], "description": (row[4] or "")[:150],
            })

    return items


@router.post("/analyze")
async def analyze_pareto_endpoint(payload: AnalyzeRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Score all non-done, un-locked tasks in the requested scope and flag the top 20%."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        items = _fetch_scope_items(cursor, payload.scope, user_id)
    finally:
        conn.close()

    if not items:
        return {"results": [], "message": "No un-locked tasks to analyze in this scope."}

    _call_ai, _extract_json_items = _get_ai_helpers()

    # Cap to avoid blowing the prompt token budget on very large scopes.
    batch = items[:_BATCH_LIMIT]
    wanted = {(it["table"], it["id"]) for it in batch}
    scored: Dict[tuple, Dict[str, Any]] = {}
    pending = batch
    for _ in range(_MAX_PASSES):
        try:
            response_text = _call_ai(_analysis_prompt(pending), payload, max_tokens=_analysis_max_tokens(len(pending)))
            found, complete = _extract_json_items(response_text)
        except Exception as exc:
            if scored:
                break  # keep what the earlier passes scored; the gap is reported in the response
            raise HTTPException(status_code=500, detail=f"AI Pareto Analysis failed: {exc}")
        before = len(scored)
        for res in found:
            key = _result_key(res, pending)
            if key in wanted and key not in scored:
                scored[key] = {**res, "table": key[0], "id": key[1]}
        pending = [it for it in pending if (it["table"], it["id"]) not in scored]
        # Go again only for a reply that was cut off and still got somewhere.
        if complete or not pending or len(scored) == before:
            break

    results = [scored[(it["table"], it["id"])] for it in batch if (it["table"], it["id"]) in scored]
    if not results:
        raise HTTPException(
            status_code=500,
            detail="AI Pareto Analysis failed: the AI's reply had no score for any of these tasks",
        )

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for res in results:
            table = res.get("table")
            tid = res.get("id")
            try:
                score = float(res.get("pareto_score"))
            except (TypeError, ValueError):
                continue
            top20 = 1 if res.get("is_top_20") else 0
            reason = res.get("reason")
            if table in _VALID_TABLES and tid:
                # table is re-checked against _VALID_TABLES right before interpolation —
                # never build this query from an unvalidated table name.
                cursor.execute(
                    f"UPDATE {table} SET pareto_score = ?, is_top_20 = ?, pareto_reason = ? "
                    f"WHERE id = ? AND user_id = ? AND (pareto_locked IS NULL OR pareto_locked = 0)",
                    (score, top20, reason, tid, user_id),
                )
        conn.commit()
    finally:
        conn.close()

    top20_count = sum(1 for r in results if r.get("is_top_20"))
    response: Dict[str, Any] = {"results": results, "analyzed_count": len(results), "top20_count": top20_count}
    missed = len(batch) - len(results)
    if missed > 0:
        response["partial"] = True
        response["message"] = f"The AI scored {len(results)} of {len(batch)} items; run the analysis again to retry the other {missed}."
    return response


@router.get("/top20")
async def get_top20_endpoint(user_id: int = Depends(get_current_user_id)) -> dict:
    """Return all is_top_20=true items across all tables, grouped by tab."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM tasks "
            "WHERE user_id = ? AND is_top_20 = 1 AND status != 'done'",
            (user_id,),
        )
        smart = [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "tasks"}
            for r in cursor.fetchall()
        ]

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM quick_tasks "
            "WHERE user_id = ? AND is_top_20 = 1 AND done = 0",
            (user_id,),
        )
        quick = [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "quick_tasks"}
            for r in cursor.fetchall()
        ]

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM project_nodes WHERE user_id = ? AND is_top_20 = 1",
            (user_id,),
        )
        plan = [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "project_nodes"}
            for r in cursor.fetchall()
        ]

        cursor.execute(
            "SELECT id, title, pareto_score, pareto_reason, pareto_locked FROM projects "
            "WHERE user_id = ? AND is_top_20 = 1 AND status = 'active'",
            (user_id,),
        )
        plan += [
            {"id": r[0], "title": r[1], "pareto_score": r[2], "reason": r[3], "locked": bool(r[4]), "table": "projects"}
            for r in cursor.fetchall()
        ]
    finally:
        conn.close()

    return {"smart": smart, "quick": quick, "plan": plan}


@router.post("/reanalyze/{table}/{item_id}")
async def reanalyze_single_endpoint(table: str, item_id: int, payload: AnalyzeRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Re-score a single item. Explicit single-item action, so it unlocks any manual pin."""
    if table not in _VALID_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {table} WHERE id = ? AND user_id = ?", (item_id, user_id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        columns = [desc[0] for desc in cursor.description]
        item_data = dict(zip(columns, row))
    finally:
        conn.close()

    _call_ai, _extract_json_items = _get_ai_helpers()

    prompt = f"""You are a productivity strategist. Evaluate this single task on a scale of 0.0 to 1.0 for its
Pareto (80/20) impact — strategic value, dependencies it unblocks, urgency vs importance, and friction removed.
A score > 0.8 means it is highly likely to be a Top 20% leverage task.

Task data:
{json.dumps(item_data, indent=2, default=str)}

Return ONLY JSON:
[{{ "pareto_score": 0.85, "is_top_20": true, "reason": "High impact due to..." }}]
No extra text."""

    try:
        response_text = _call_ai(prompt, payload, max_tokens=600)
        results, _complete = _extract_json_items(response_text)
        if not results:
            raise ValueError("No result returned")
        res = results[0]
        if res.get("pareto_score") is None:
            raise ValueError("the AI's answer had no pareto_score")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Pareto Analysis failed: {exc}")

    score = res.get("pareto_score")
    top20 = 1 if res.get("is_top_20") else 0
    reason = res.get("reason")

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE {table} SET pareto_score = ?, is_top_20 = ?, pareto_reason = ?, pareto_locked = 0 WHERE id = ? AND user_id = ?",
            (score, top20, reason, item_id, user_id),
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
