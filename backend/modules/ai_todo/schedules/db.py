"""Database operations for the To-Do Scheduler. All access is scoped to a user_id.

Tables (shared/schema.py): todo_schedules (one row per scheduled reminder / AI job) and todo_schedule_runs (one row
per occurrence that ran; UNIQUE(schedule_id, scheduled_for) is what stops a phone and an open tab running the same
occurrence twice).

TypeScript twin: frontend/fe-apis/todo/schedules/db.ts -- keep the two in sync (same SQL, same dict shapes).
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from modules.common.db import get_db_path

_SCHEDULE_COLUMNS = (
    "id, user_id, title, kind, message, rule, timezone, agent_context, add_tasks, enabled, source_text, "
    "last_run_at, last_status, last_output, created_at, updated_at"
)

_RUN_COLUMNS = (
    "id, schedule_id, user_id, scheduled_for, source, status, title, output, created_task_ids, started_at, finished_at"
)

# Columns update_schedule may write (the PATCH fields).
_UPDATABLE = {"title", "kind", "message", "rule", "timezone", "agent_context", "add_tasks", "enabled", "source_text"}


def _parse_json(value: Any, fallback: Any) -> Any:
    """json.loads on a TEXT column that may be NULL/empty/invalid."""
    if not isinstance(value, str) or not value:
        return fallback
    try:
        return json.loads(value)
    except ValueError:
        return fallback


def _schedule_row_to_dict(row: tuple) -> Dict[str, Any]:
    return {
        "id": row[0],
        "user_id": row[1],
        "title": row[2],
        "kind": row[3],
        "message": row[4],
        "rule": _parse_json(row[5], {}),
        "timezone": row[6],
        "agent_context": row[7],
        "add_tasks": bool(row[8]),
        "enabled": bool(row[9]),
        "source_text": row[10],
        "last_run_at": row[11],
        "last_status": row[12],
        "last_output": row[13],
        "created_at": row[14],
        "updated_at": row[15],
    }


def _run_row_to_dict(row: tuple) -> Dict[str, Any]:
    return {
        "id": row[0],
        "schedule_id": row[1],
        "user_id": row[2],
        "scheduled_for": row[3],
        "source": row[4],
        "status": row[5],
        "title": row[6],
        "output": row[7],
        "created_task_ids": _parse_json(row[8], []),
        "started_at": row[9],
        "finished_at": row[10],
    }


def create_schedule(
    user_id: int,
    title: str,
    rule: Dict[str, Any],
    kind: str = "reminder",
    message: Optional[str] = None,
    timezone: Optional[str] = None,
    agent_context: str = "tasks",
    add_tasks: bool = False,
    enabled: bool = True,
    source_text: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a schedule. `rule` is already canonical (rules.normalize_rule)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO todo_schedules
                (user_id, title, kind, message, rule, timezone, agent_context, add_tasks, enabled, source_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, title, kind, message, json.dumps(rule), timezone, agent_context,
                1 if add_tasks else 0, 1 if enabled else 0, source_text,
            ),
        )
        conn.commit()
        cursor.execute(f"SELECT {_SCHEDULE_COLUMNS} FROM todo_schedules WHERE id = ?", (cursor.lastrowid,))
        return _schedule_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def list_schedules(user_id: int) -> List[Dict[str, Any]]:
    """The user's schedules, newest first."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_SCHEDULE_COLUMNS} FROM todo_schedules WHERE user_id = ? ORDER BY id DESC", (user_id,))
        return [_schedule_row_to_dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_schedule(schedule_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_SCHEDULE_COLUMNS} FROM todo_schedules WHERE id = ? AND user_id = ?", (schedule_id, user_id)
        )
        row = cursor.fetchone()
        return _schedule_row_to_dict(row) if row else None
    finally:
        conn.close()


def update_schedule(schedule_id: int, user_id: int, **fields) -> Optional[Dict[str, Any]]:
    """Writes the known fields given and bumps updated_at. None when the schedule is not the user's."""
    sets: List[str] = []
    values: List[Any] = []
    for key, value in fields.items():
        if key not in _UPDATABLE:
            continue
        if key == "rule":
            value = json.dumps(value)
        elif key in ("add_tasks", "enabled"):
            value = 1 if value else 0
        sets.append(f"{key} = ?")
        values.append(value)

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        if sets:
            sets.append("updated_at = datetime('now')")
            cursor.execute(
                f"UPDATE todo_schedules SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
                values + [schedule_id, user_id],
            )
            conn.commit()
        cursor.execute(
            f"SELECT {_SCHEDULE_COLUMNS} FROM todo_schedules WHERE id = ? AND user_id = ?", (schedule_id, user_id)
        )
        row = cursor.fetchone()
        return _schedule_row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_schedule(schedule_id: int, user_id: int) -> bool:
    """Deletes the schedule and its runs. False when it is not the user's."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM todo_schedules WHERE id = ? AND user_id = ?", (schedule_id, user_id))
        if cursor.rowcount == 0:
            return False
        cursor.execute("DELETE FROM todo_schedule_runs WHERE schedule_id = ? AND user_id = ?", (schedule_id, user_id))
        conn.commit()
        return True
    finally:
        conn.close()


def claim_run(schedule_id: int, user_id: int, scheduled_for: str, source: str) -> Tuple[Dict[str, Any], bool]:
    """Takes the occurrence for this caller. Returns `(run, True)` when the caller should do the work (a new row, or
    a retry of one that failed or has been "running" for over 3 minutes), `(run, False)` when another device already
    did it or is doing it right now."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR IGNORE INTO todo_schedule_runs (schedule_id, user_id, scheduled_for, source)
            VALUES (?, ?, ?, ?)
            """,
            (schedule_id, user_id, scheduled_for, source),
        )
        claimed = cursor.rowcount > 0
        if not claimed:
            cursor.execute(
                """
                UPDATE todo_schedule_runs
                   SET status = 'running', source = ?, started_at = datetime('now'), finished_at = NULL
                 WHERE schedule_id = ? AND scheduled_for = ?
                   AND (status = 'error' OR (status = 'running' AND started_at < datetime('now', '-3 minutes')))
                """,
                (source, schedule_id, scheduled_for),
            )
            claimed = cursor.rowcount > 0
        conn.commit()
        cursor.execute(
            f"SELECT {_RUN_COLUMNS} FROM todo_schedule_runs WHERE schedule_id = ? AND scheduled_for = ?",
            (schedule_id, scheduled_for),
        )
        return _run_row_to_dict(cursor.fetchone()), claimed
    finally:
        conn.close()


def finish_run(
    run_id: int,
    schedule_id: int,
    status: str,
    title: Optional[str],
    output: Optional[str],
    created_task_ids: Optional[List[int]] = None,
    disable_once: bool = True,
) -> Dict[str, Any]:
    """Stores the result and copies it onto the schedule (last_*). A one-time schedule that ran successfully switches
    itself off (`disable_once`; False for a manual "Run now")."""
    created_task_ids = created_task_ids or []
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE todo_schedule_runs
               SET status = ?, title = ?, output = ?, created_task_ids = ?, finished_at = datetime('now')
             WHERE id = ?
            """,
            (status, title, output, json.dumps(created_task_ids) if created_task_ids else None, run_id),
        )
        cursor.execute(
            """
            UPDATE todo_schedules
               SET last_run_at = datetime('now'), last_status = ?, last_output = ?
             WHERE id = ?
            """,
            (status, output, schedule_id),
        )
        if status == "ok" and disable_once:
            cursor.execute(
                "UPDATE todo_schedules SET enabled = 0 WHERE id = ? AND json_extract(rule, '$.repeat') = 'once'",
                (schedule_id,),
            )
        conn.commit()
        cursor.execute(f"SELECT {_RUN_COLUMNS} FROM todo_schedule_runs WHERE id = ?", (run_id,))
        return _run_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def list_runs(schedule_id: int, user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    """The schedule's last runs, newest first."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT {_RUN_COLUMNS} FROM todo_schedule_runs
             WHERE schedule_id = ? AND user_id = ?
             ORDER BY id DESC LIMIT ?
            """,
            (schedule_id, user_id, limit),
        )
        return [_run_row_to_dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()
