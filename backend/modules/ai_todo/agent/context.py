"""What the Assistant (and an AI job set to read "everything") knows about the person's To-Do workspace.

One compact snapshot, read straight from SQLite: counts, open tasks (soonest due first), what was finished lately,
today's Quick list, projects, goals and their schedules. It goes into the prompt as JSON, so the model answers
"what's overdue?" or writes a weekly report from real rows instead of guessing.

TypeScript twin: frontend/fe-apis/todo/agent/context.ts. Same SQL, same limits, same key order, so both backends send
byte-identical prompts. Change both.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from typing import Any, Dict, List

from modules.common.db import get_db_path

from ..schedules.rules import js_slice

OPEN_TASKS_MAX = 60
DONE_RECENT_MAX = 25
DONE_RECENT_DAYS = 14
QUICK_MAX = 30
PROJECTS_MAX = 20
GOALS_MAX = 30
SCHEDULES_MAX = 40
SCHEDULE_TEXT_MAX = 240


def days_before(today: str, days: int) -> str:
    """"YYYY-MM-DD" `days` before `today` (also "YYYY-MM-DD")."""
    return (date.fromisoformat(today) - timedelta(days=days)).isoformat()


def workspace_context(user_id: int, today: str) -> Dict[str, Any]:
    """The snapshot as a dict (key order is part of the prompt, keep it)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cur = conn.cursor()
        open_where = "user_id = ? AND status NOT IN ('done', 'not_done')"

        cur.execute(f"SELECT COUNT(*) FROM tasks WHERE {open_where}", (user_id,))
        open_count = cur.fetchone()[0]
        cur.execute(
            f"SELECT COUNT(*) FROM tasks WHERE {open_where} AND due_date IS NOT NULL AND due_date < ?",
            (user_id, today),
        )
        overdue = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM tasks WHERE {open_where} AND due_date = ?", (user_id, today))
        due_today = cur.fetchone()[0]
        cur.execute(
            "SELECT COALESCE(SUM(completed_count), 0) FROM user_stats WHERE user_id = ? AND date >= ?",
            (user_id, days_before(today, 6)),
        )
        done_7 = cur.fetchone()[0]

        cur.execute(
            f"""
            SELECT id, title, priority, due_date, status, parent_id FROM tasks
             WHERE {open_where}
             ORDER BY due_date IS NULL, due_date, priority, id
             LIMIT ?
            """,
            (user_id, OPEN_TASKS_MAX),
        )
        open_tasks = [
            {"id": r[0], "title": r[1], "priority": r[2], "due_date": r[3], "status": r[4], "parent_id": r[5]}
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT id, title, substr(updated_at, 1, 10) FROM tasks
             WHERE user_id = ? AND status = 'done' AND updated_at >= ?
             ORDER BY updated_at DESC, id DESC
             LIMIT ?
            """,
            (user_id, days_before(today, DONE_RECENT_DAYS), DONE_RECENT_MAX),
        )
        recently_done = [{"id": r[0], "title": r[1], "done_on": r[2]} for r in cur.fetchall()]

        cur.execute(
            """
            SELECT id, title, done, quadrant FROM quick_tasks
             WHERE user_id = ? AND date = ?
             ORDER BY order_index, id
             LIMIT ?
            """,
            (user_id, today, QUICK_MAX),
        )
        quick = [{"id": r[0], "title": r[1], "done": bool(r[2]), "quadrant": r[3]} for r in cur.fetchall()]

        cur.execute(
            """
            SELECT p.id, p.title, p.status, p.priority, p.due_date,
                   (SELECT COUNT(*) FROM project_nodes n WHERE n.project_id = p.id)
              FROM projects p
             WHERE p.user_id = ?
             ORDER BY CASE WHEN p.status = 'active' THEN 0 ELSE 1 END, p.id DESC
             LIMIT ?
            """,
            (user_id, PROJECTS_MAX),
        )
        projects = [
            {"id": r[0], "title": r[1], "status": r[2], "priority": r[3], "due_date": r[4], "items": r[5]}
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT id, title, level, status, due_date FROM goal_nodes
             WHERE user_id = ? AND depth_level <= 1
             ORDER BY depth_level, order_index, id
             LIMIT ?
            """,
            (user_id, GOALS_MAX),
        )
        goals = [
            {"id": r[0], "title": r[1], "level": r[2], "status": r[3], "due_date": r[4]} for r in cur.fetchall()
        ]

        return {
            "today": today,
            "counts": {
                "open_tasks": open_count,
                "overdue": overdue,
                "due_today": due_today,
                "completed_last_7_days": done_7,
            },
            "open_tasks": open_tasks,
            "recently_done": recently_done,
            "quick_list_today": quick,
            "projects": projects,
            "goals": goals,
        }
    finally:
        conn.close()


def schedules_context(user_id: int) -> List[Dict[str, Any]]:
    """The person's schedules as the Assistant sees them (it can pause, resume, delete or run them by id)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, title, kind, enabled, rule, message, agent_context, use_web, write_report, last_run_at,
                   last_status
              FROM todo_schedules
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT ?
            """,
            (user_id, SCHEDULES_MAX),
        )
        out = []
        for r in cur.fetchall():
            try:
                rule = json.loads(r[4]) if r[4] else {}
            except ValueError:
                rule = {}
            message = r[5] or ""
            out.append({
                "id": r[0],
                "title": r[1],
                "kind": r[2],
                "enabled": bool(r[3]),
                "rule": rule,
                "message": js_slice(message, SCHEDULE_TEXT_MAX),
                "reads": r[6] if r[2] == "agent" else None,
                "web": bool(r[7]),
                "report": bool(r[8]),
                "last_run_at": r[9],
                "last_status": r[10],
            })
        return out
    finally:
        conn.close()
