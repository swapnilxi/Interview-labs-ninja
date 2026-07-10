"""Database CRUD operations for the tasks table."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path


def _task_row_to_dict(row: tuple) -> Dict[str, Any]:
    """Convert a tasks row to a frontend-friendly dict."""
    return {
        "id": row[0],
        "parent_id": row[1],
        "title": row[2],
        "status": row[3],
        "priority": row[4],
        "time_estimate": row[5],
        "due_date": row[6],
        "generation_type": row[7],
        "depth_level": row[8],
        "context": row[9],
        "attachments": json.loads(row[10]) if row[10] else [],
        "created_at": row[11],
        "updated_at": row[12],
    }


_TASK_COLUMNS = (
    "id, parent_id, title, status, priority, time_estimate, due_date, "
    "generation_type, depth_level, context, attachments, created_at, updated_at"
)


def create_task(
    title: str,
    parent_id: Optional[int] = None,
    status: str = "backlog",
    priority: str = "p3",
    time_estimate: Optional[str] = None,
    due_date: Optional[str] = None,
    generation_type: str = "manual",
    context: Optional[str] = None,
    attachments: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Insert a new task and return it as a dict."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # Calculate depth_level from parent
        depth_level = 1
        if parent_id is not None:
            cursor.execute("SELECT depth_level FROM tasks WHERE id = ?", (parent_id,))
            parent_row = cursor.fetchone()
            if parent_row:
                depth_level = parent_row[0] + 1

        attachments_json = json.dumps(attachments) if attachments else None
        now = datetime.utcnow().isoformat()

        cursor.execute(
            f"""
            INSERT INTO tasks (
                parent_id, title, status, priority, time_estimate, due_date,
                generation_type, depth_level, context, attachments,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                parent_id, title, status, priority, time_estimate, due_date,
                generation_type, depth_level, context, attachments_json,
                now, now,
            ),
        )
        conn.commit()
        task_id = cursor.lastrowid

        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE id = ?", (task_id,))
        return _task_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def get_task(task_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single task by ID."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return _task_row_to_dict(row) if row else None
    finally:
        conn.close()


def get_children(parent_id: int) -> List[Dict[str, Any]]:
    """Fetch direct children of a task."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_TASK_COLUMNS} FROM tasks WHERE parent_id = ? ORDER BY id ASC",
            (parent_id,),
        )
        return [_task_row_to_dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_sibling_titles(parent_id: int) -> List[str]:
    """Fetch titles of all sibling tasks under the same parent. Used for AI context."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT title FROM tasks WHERE parent_id = ? ORDER BY id ASC",
            (parent_id,),
        )
        return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()


def get_all_tasks() -> List[Dict[str, Any]]:
    """Fetch all tasks as a flat list."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks ORDER BY id ASC")
        return [_task_row_to_dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_task_tree() -> List[Dict[str, Any]]:
    """Fetch all tasks and assemble them into a nested tree structure."""
    all_tasks = get_all_tasks()

    by_id: Dict[int, Dict[str, Any]] = {}
    for task in all_tasks:
        task["children"] = []
        by_id[task["id"]] = task

    roots: List[Dict[str, Any]] = []
    for task in all_tasks:
        pid = task["parent_id"]
        if pid is not None and pid in by_id:
            by_id[pid]["children"].append(task)
        else:
            roots.append(task)

    return roots


def get_active_tasks_for_copilot() -> Dict[str, Any]:
    """Get a smart summary for copilot — active tasks in detail, rest as counts.

    Returns dict with:
      - active_tree: nested tree of non-done tasks + tasks due within 7 days
      - summary: counts of done, backlog, total
    """
    all_tasks = get_all_tasks()
    now = datetime.utcnow()
    week_from_now = (now + timedelta(days=7)).isoformat()

    active = []
    done_count = 0
    backlog_count = 0

    for task in all_tasks:
        if task["status"] == "done":
            done_count += 1
        elif task["status"] == "backlog" and not task.get("due_date"):
            backlog_count += 1
            active.append(task)  # Still include backlog in active for context
        else:
            active.append(task)

    # Assemble active tasks into tree
    by_id: Dict[int, Dict[str, Any]] = {}
    for task in active:
        task["children"] = []
        by_id[task["id"]] = task

    roots: List[Dict[str, Any]] = []
    for task in active:
        pid = task["parent_id"]
        if pid is not None and pid in by_id:
            by_id[pid]["children"].append(task)
        elif pid is None:
            roots.append(task)

    return {
        "active_tree": roots,
        "summary": {
            "total": len(all_tasks),
            "done_count": done_count,
            "backlog_no_date_count": backlog_count,
            "active_count": len(active),
        },
    }


def update_task(task_id: int, **fields) -> Optional[Dict[str, Any]]:
    """Update specific fields on a task. Returns updated task or None."""
    allowed = {"title", "status", "priority", "time_estimate", "due_date",
               "context", "attachments", "parent_id"}
    updates = {k: v for k, v in fields.items() if k in allowed}

    if not updates:
        return get_task(task_id)

    # Handle attachments serialization
    if "attachments" in updates and isinstance(updates["attachments"], list):
        updates["attachments"] = json.dumps(updates["attachments"])

    updates["updated_at"] = datetime.utcnow().isoformat()

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
        conn.commit()
        if cursor.rowcount == 0:
            return None
        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return _task_row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_task(task_id: int) -> bool:
    """Delete a task and cascade to children. Returns True if deleted."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_children(parent_id: int) -> int:
    """Delete all children of a task (for regeneration). Returns count deleted."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM tasks WHERE parent_id = ?", (parent_id,))
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def create_subtasks_batch(
    parent_id: int,
    subtasks: List[Dict[str, str]],
    generation_type: str,
) -> List[Dict[str, Any]]:
    """Insert multiple AI-generated subtasks under a parent. Returns created tasks."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # Get parent depth and context
        cursor.execute("SELECT depth_level, context FROM tasks WHERE id = ?", (parent_id,))
        parent_row = cursor.fetchone()
        if not parent_row:
            return []

        parent_depth = parent_row[0]
        parent_context = parent_row[1]
        child_depth = parent_depth + 1
        now = datetime.utcnow().isoformat()

        created = []
        for sub in subtasks:
            title = sub.get("title", "Untitled")
            time_est = sub.get("time_estimate")
            priority = sub.get("priority", "p3")

            if priority not in ("p1", "p2", "p3", "p4"):
                priority = "p3"

            cursor.execute(
                """
                INSERT INTO tasks (
                    parent_id, title, status, priority, time_estimate,
                    generation_type, depth_level, context, created_at, updated_at
                ) VALUES (?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    parent_id, title, priority, time_est,
                    generation_type, child_depth, parent_context,
                    now, now,
                ),
            )
            task_id = cursor.lastrowid
            created.append({
                "id": task_id,
                "parent_id": parent_id,
                "title": title,
                "status": "backlog",
                "priority": priority,
                "time_estimate": time_est,
                "due_date": None,
                "generation_type": generation_type,
                "depth_level": child_depth,
                "context": parent_context,
                "attachments": [],
                "created_at": now,
                "updated_at": now,
                "children": [],
            })

        conn.commit()
        return created
    finally:
        conn.close()
