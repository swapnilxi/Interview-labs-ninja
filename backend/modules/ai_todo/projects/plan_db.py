"""Database access for a project's AI Planner workspace (`project_plans`) and for turning an accepted plan into
project nodes. All access is scoped to a user_id.

TypeScript twin: frontend/fe-apis/todo/projects/planDb.ts — keep the two in sync.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path

MAX_PHASES = 20
MAX_TASKS_PER_PHASE = 30
MAX_TITLE_CHARS = 200
MAX_CONTEXT_CHARS = 1500


def get_project_plan(project_id: int, user_id: int) -> Dict[str, Any]:
    """The saved planner workspace: {"state": {...} | None, "updated_at": str | None}."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT state, updated_at FROM project_plans WHERE project_id = ? AND user_id = ?", (project_id, user_id)
        )
        row = cursor.fetchone()
        if not row:
            return {"state": None, "updated_at": None}
        try:
            state = json.loads(row[0])
        except (TypeError, ValueError):
            state = None
        return {"state": state if isinstance(state, dict) else None, "updated_at": row[1]}
    finally:
        conn.close()


def save_project_plan(project_id: int, user_id: int, state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Replace the workspace. Returns None if the project isn't owned by user_id."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        if cursor.fetchone() is None:
            return None
        cursor.execute(
            """
            INSERT INTO project_plans (project_id, user_id, state, updated_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(project_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
            """,
            (project_id, user_id, json.dumps(state)),
        )
        conn.commit()
        cursor.execute("SELECT updated_at FROM project_plans WHERE project_id = ?", (project_id,))
        return {"state": state, "updated_at": cursor.fetchone()[0]}
    finally:
        conn.close()


def _text(value: Any, limit: int) -> str:
    return (value if isinstance(value, str) else "").strip()[:limit]


def apply_plan_to_project(project_id: int, user_id: int, phases: List[Dict[str, Any]]) -> Optional[Dict[str, int]]:
    """Add each plan phase to the project as a `phase` node (context = its description and milestone, due date =
    its end date) with its key tasks as `action` children. Appends after the nodes already there.
    Returns None if the project isn't owned by user_id."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        if cursor.fetchone() is None:
            return None

        cursor.execute(
            "SELECT COALESCE(MAX(order_index), -1) FROM project_nodes "
            "WHERE project_id = ? AND user_id = ? AND parent_node_id IS NULL",
            (project_id, user_id),
        )
        next_root_order = cursor.fetchone()[0] + 1

        phase_count = 0
        node_count = 0
        for phase in phases[:MAX_PHASES]:
            if not isinstance(phase, dict):
                continue
            name = _text(phase.get("name"), MAX_TITLE_CHARS)
            if not name:
                continue
            context_parts = [_text(phase.get("description"), MAX_CONTEXT_CHARS)]
            milestone = _text(phase.get("milestone"), MAX_TITLE_CHARS)
            if milestone:
                context_parts.append(f"Milestone: {milestone}")
            due_date = _text(phase.get("end_date"), 10) or None
            cursor.execute(
                """
                INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type,
                                           depth_level, order_index, context, due_date, time_estimate)
                VALUES (?, ?, NULL, ?, 'phase', 'manual', 1, ?, ?, ?, ?)
                """,
                (
                    user_id, project_id, name, next_root_order + phase_count,
                    "\n\n".join(p for p in context_parts if p) or None,
                    due_date,
                    _text(phase.get("duration"), 40) or None,
                ),
            )
            phase_id = cursor.lastrowid
            phase_count += 1
            node_count += 1

            tasks = phase.get("key_tasks")
            for index, task in enumerate((tasks if isinstance(tasks, list) else [])[:MAX_TASKS_PER_PHASE]):
                title = _text(task, MAX_TITLE_CHARS)
                if not title:
                    continue
                cursor.execute(
                    """
                    INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type,
                                               depth_level, order_index)
                    VALUES (?, ?, ?, ?, 'action', 'manual', 2, ?)
                    """,
                    (user_id, project_id, phase_id, title, index),
                )
                node_count += 1
        conn.commit()
        return {"phases": phase_count, "nodes": node_count}
    finally:
        conn.close()
