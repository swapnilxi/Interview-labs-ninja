"""Database CRUD operations for the quick_tasks and quick_tasks_archive tables."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path


def _quick_task_row_to_dict(row: tuple) -> Dict[str, Any]:
    """Convert a quick_tasks row to a frontend-friendly dict."""
    return {
        "id": row[0],
        "title": row[1],
        "done": bool(row[2]),
        "quadrant": row[3],
        "date": row[4],
        "source": row[5],
        "original_task_id": row[6],
        "order_index": row[7],
        "created_at": row[8],
        "pareto_score": row[9] if len(row) > 9 else None,
        "is_top_20": bool(row[10]) if len(row) > 10 and row[10] is not None else False,
        "exported_task_id": row[11] if len(row) > 11 else None,
        "exported_project_id": row[12] if len(row) > 12 else None,
        "is_exported": bool(row[13]) if len(row) > 13 and row[13] is not None else False,
        "due_date": row[14] if len(row) > 14 else None,
        "time_estimate": row[15] if len(row) > 15 else None,
    }


_QT_COLUMNS = (
    "id, title, done, quadrant, date, source, original_task_id, order_index, created_at, "
    "pareto_score, is_top_20, exported_task_id, exported_project_id, is_exported, due_date, time_estimate"
)


def create_quick_task(
    title: str,
    task_date: Optional[str] = None,
    quadrant: str = "do_now",
    source: str = "manual",
    original_task_id: Optional[int] = None,
    order_index: int = 0,
    due_date: Optional[str] = None,
    time_estimate: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a new quick task and return it."""
    if not task_date:
        task_date = date.today().isoformat()
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            INSERT INTO quick_tasks (title, quadrant, date, source, original_task_id, order_index, due_date, time_estimate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (title, quadrant, task_date, source, original_task_id, order_index, due_date, time_estimate),
        )
        conn.commit()
        task_id = cursor.lastrowid
        cursor.execute(f"SELECT {_QT_COLUMNS} FROM quick_tasks WHERE id = ?", (task_id,))
        return _quick_task_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def get_quick_tasks_for_date(task_date: str) -> List[Dict[str, Any]]:
    """Fetch all quick tasks for a specific date."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_QT_COLUMNS} FROM quick_tasks WHERE date = ? ORDER BY order_index ASC, id ASC",
            (task_date,),
        )
        return [_quick_task_row_to_dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def update_quick_task(task_id: int, **fields) -> Optional[Dict[str, Any]]:
    """Update specific fields on a quick task."""
    allowed = {"title", "done", "quadrant", "order_index", "pareto_score", "is_top_20", "due_date", "time_estimate"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_quick_task(task_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE quick_tasks SET {set_clause} WHERE id = ?", values)
        conn.commit()
        cursor.execute(f"SELECT {_QT_COLUMNS} FROM quick_tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return _quick_task_row_to_dict(row) if row else None
    finally:
        conn.close()


def get_quick_task(task_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single quick task by ID."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_QT_COLUMNS} FROM quick_tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return _quick_task_row_to_dict(row) if row else None
    finally:
        conn.close()


def mark_quick_task_exported(
    task_id: int,
    exported_task_id: Optional[int] = None,
    exported_project_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Mark a quick task as exported to Smart To-Do or Plan & Project.

    Keeps the row in quick_tasks for historical reference but marks it
    is_exported=1 so the UI can visually dim/separate it.
    """
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """UPDATE quick_tasks
               SET is_exported = 1,
                   exported_task_id = ?,
                   exported_project_id = ?
               WHERE id = ?""",
            (exported_task_id, exported_project_id, task_id),
        )
        conn.commit()
        cursor.execute(f"SELECT {_QT_COLUMNS} FROM quick_tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return _quick_task_row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_quick_task(task_id: int) -> bool:
    """Delete a quick task. Returns True if deleted."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM quick_tasks WHERE id = ?", (task_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def archive_completed_quick_tasks(task_date: str) -> int:
    """Archive all completed quick tasks for a date. Returns count archived."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO quick_tasks_archive (original_id, title, quadrant, date, source, original_task_id)
            SELECT id, title, quadrant, date, source, original_task_id
            FROM quick_tasks WHERE date = ? AND done = 1
            """,
            (task_date,),
        )
        archived_count = cursor.rowcount
        cursor.execute("DELETE FROM quick_tasks WHERE date = ? AND done = 1", (task_date,))
        conn.commit()
        return archived_count
    finally:
        conn.close()


def move_quick_tasks_to_tomorrow(task_ids: List[int]) -> int:
    """Move specific quick tasks to tomorrow by updating their date."""
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in task_ids)
        cursor.execute(
            f"UPDATE quick_tasks SET date = ? WHERE id IN ({placeholders})",
            [tomorrow] + task_ids,
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def bulk_update_quadrants(updates: List[Dict[str, Any]]) -> None:
    """Batch update quadrant for multiple quick tasks."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for u in updates:
            cursor.execute(
                "UPDATE quick_tasks SET quadrant = ? WHERE id = ?",
                (u["quadrant"], u["task_id"]),
            )
        conn.commit()
    finally:
        conn.close()
