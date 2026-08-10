"""Database CRUD operations for the tasks table. All access is scoped to a user_id."""

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
        "last_activity_at": row[13],
        "is_recurring": bool(row[14]) if row[14] is not None else False,
        "recurrence_interval": row[15],
        "recurrence_custom_days": row[16],
        "recurrence_template_id": row[17],
        "intention": row[18],
        "definition_of_done": row[19],
        "eisenhower_quadrant": row[20] if len(row) > 20 else None,
        "pareto_score": row[21] if len(row) > 21 else None,
        "is_top_20": bool(row[22]) if len(row) > 22 and row[22] is not None else False,
        "pareto_reason": row[23] if len(row) > 23 else None,
        "pareto_locked": bool(row[24]) if len(row) > 24 and row[24] is not None else False,
    }


_TASK_COLUMNS = (
    "id, parent_id, title, status, priority, time_estimate, due_date, "
    "generation_type, depth_level, context, attachments, created_at, updated_at, "
    "last_activity_at, is_recurring, recurrence_interval, recurrence_custom_days, "
    "recurrence_template_id, intention, definition_of_done, eisenhower_quadrant, "
    "pareto_score, is_top_20, pareto_reason, pareto_locked"
)


def create_task(
    user_id: int,
    title: str,
    parent_id: Optional[int] = None,
    status: str = "backlog",
    priority: str = "p3",
    time_estimate: Optional[str] = None,
    due_date: Optional[str] = None,
    generation_type: str = "manual",
    context: Optional[str] = None,
    attachments: Optional[List[str]] = None,
    is_recurring: int = 0,
    recurrence_interval: Optional[str] = None,
    recurrence_custom_days: Optional[str] = None,
    recurrence_template_id: Optional[int] = None,
    intention: Optional[str] = None,
    definition_of_done: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a new task and return it as a dict."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # Calculate depth_level from parent (only if the parent belongs to this user)
        depth_level = 1
        if parent_id is not None:
            cursor.execute("SELECT depth_level FROM tasks WHERE id = ? AND user_id = ?", (parent_id, user_id))
            parent_row = cursor.fetchone()
            if parent_row:
                depth_level = parent_row[0] + 1
            else:
                parent_id = None

        attachments_json = json.dumps(attachments) if attachments else None
        now = datetime.utcnow().isoformat()

        cursor.execute(
            f"""
            INSERT INTO tasks (
                user_id, parent_id, title, status, priority, time_estimate, due_date,
                generation_type, depth_level, context, attachments,
                created_at, updated_at, last_activity_at, is_recurring,
                recurrence_interval, recurrence_custom_days, recurrence_template_id,
                intention, definition_of_done
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, parent_id, title, status, priority, time_estimate, due_date,
                generation_type, depth_level, context, attachments_json,
                now, now, now, is_recurring,
                recurrence_interval, recurrence_custom_days, recurrence_template_id,
                intention, definition_of_done,
            ),
        )
        conn.commit()
        task_id = cursor.lastrowid

        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE id = ?", (task_id,))
        return _task_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def get_task(task_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single task by ID, scoped to its owner."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        row = cursor.fetchone()
        return _task_row_to_dict(row) if row else None
    finally:
        conn.close()


def get_children(parent_id: int, user_id: int) -> List[Dict[str, Any]]:
    """Fetch direct children of a task."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_TASK_COLUMNS} FROM tasks WHERE parent_id = ? AND user_id = ? ORDER BY id ASC",
            (parent_id, user_id),
        )
        return [_task_row_to_dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_sibling_titles(parent_id: int, user_id: int) -> List[str]:
    """Fetch titles of all sibling tasks under the same parent. Used for AI context."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT title FROM tasks WHERE parent_id = ? AND user_id = ? ORDER BY id ASC",
            (parent_id, user_id),
        )
        return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()


def get_all_tasks(user_id: int) -> List[Dict[str, Any]]:
    """Fetch all of a user's tasks as a flat list."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY id ASC", (user_id,))
        return [_task_row_to_dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_task_tree(user_id: int) -> List[Dict[str, Any]]:
    """Fetch all tasks and assemble them into a nested tree structure."""
    all_tasks = get_all_tasks(user_id)

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


def get_active_tasks_for_copilot(user_id: int) -> Dict[str, Any]:
    """Get a smart summary for copilot — active tasks in detail, rest as counts.

    Returns dict with:
      - active_tree: nested tree of non-done tasks + tasks due within 7 days
      - summary: counts of done, backlog, total
    """
    all_tasks = get_all_tasks(user_id)
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
        else:
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


def update_task(task_id: int, user_id: int, **fields) -> Optional[Dict[str, Any]]:
    """Update specific fields on a task. Returns updated task or None."""
    allowed = {"title", "status", "priority", "time_estimate", "due_date",
               "context", "attachments", "parent_id", "is_recurring",
               "recurrence_interval", "recurrence_custom_days",
               "recurrence_template_id", "intention", "definition_of_done",
               "eisenhower_quadrant", "pareto_score", "is_top_20",
               "pareto_reason", "pareto_locked"}
    updates = {k: v for k, v in fields.items() if k in allowed}

    if not updates:
        return get_task(task_id, user_id)

    # 1. Fetch current task state before update to detect status transitions
    old_task = get_task(task_id, user_id)
    if not old_task:
        return None

    # Handle attachments serialization
    if "attachments" in updates and isinstance(updates["attachments"], list):
        updates["attachments"] = json.dumps(updates["attachments"])

    now = datetime.utcnow().isoformat()
    updates["updated_at"] = now
    updates["last_activity_at"] = now

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id, user_id]

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE tasks SET {set_clause} WHERE id = ? AND user_id = ?", values)
        conn.commit()
        if cursor.rowcount == 0:
            return None

        # 2. Recurrence check: if task status is changed to "done"
        old_status = old_task.get("status")
        new_status = updates.get("status")
        if old_status != "done" and new_status == "done":
            # Increment daily completions count
            increment_today_completions(user_id, 1)
            # Refresh task to verify current state
            cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            current_task = _task_row_to_dict(row) if row else None
            if current_task and current_task.get("is_recurring"):
                # Calculate next due date
                next_due = _calculate_next_due_date(
                    current_task.get("due_date"),
                    current_task.get("recurrence_interval") or "daily",
                    current_task.get("recurrence_custom_days")
                )
                # Clone the task tree
                new_task_id = clone_recurring_task(task_id, user_id, next_due)
                # Turn off recurrence on the completed task
                cursor.execute("UPDATE tasks SET is_recurring = 0 WHERE id = ?", (task_id,))
                conn.commit()
        elif old_status == "done" and new_status != "done":
            # Decrement daily completions count
            increment_today_completions(user_id, -1)

        cursor.execute(f"SELECT {_TASK_COLUMNS} FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return _task_row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_task(task_id: int, user_id: int) -> bool:
    """Delete a task and cascade to children. Returns True if deleted."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_children(parent_id: int, user_id: int) -> int:
    """Delete all children of a task (for regeneration). Returns count deleted."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM tasks WHERE parent_id = ? AND user_id = ?", (parent_id, user_id))
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def create_subtasks_batch(
    parent_id: int,
    user_id: int,
    subtasks: List[Dict[str, str]],
    generation_type: str,
) -> List[Dict[str, Any]]:
    """Insert multiple AI-generated subtasks under a parent. Returns created tasks."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # Get parent depth, context and Pareto top-20 status (only if owned by this user)
        cursor.execute(
            "SELECT depth_level, context, is_top_20 FROM tasks WHERE id = ? AND user_id = ?",
            (parent_id, user_id),
        )
        parent_row = cursor.fetchone()
        if not parent_row:
            return []

        parent_depth = parent_row[0]
        parent_context = parent_row[1]
        # Subtasks generated from a Top 20% task inherit an elevated base
        # Pareto score (0.5) instead of null, until they're re-analyzed themselves.
        inherited_pareto_score = 0.5 if parent_row[2] else None
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
                    user_id, parent_id, title, status, priority, time_estimate,
                    generation_type, depth_level, context, created_at, updated_at,
                    last_activity_at, pareto_score
                ) VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id, parent_id, title, priority, time_est,
                    generation_type, child_depth, parent_context,
                    now, now, now, inherited_pareto_score,
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
                "last_activity_at": now,
                "is_recurring": False,
                "recurrence_interval": None,
                "recurrence_custom_days": None,
                "recurrence_template_id": None,
                "intention": None,
                "definition_of_done": None,
                "pareto_score": inherited_pareto_score,
                "is_top_20": False,
                "pareto_reason": None,
                "pareto_locked": False,
                "children": [],
            })

        conn.commit()
        return created
    finally:
        conn.close()


def create_note(task_id: int, user_id: int, content: str, note_type: str = "manual") -> Optional[Dict[str, Any]]:
    """Insert a new note for a task and return it as a dict. Updates task last_activity_at.

    Returns None if the task doesn't exist or isn't owned by user_id.
    """
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        cursor.execute("SELECT id FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
        if cursor.fetchone() is None:
            return None

        now = datetime.utcnow().isoformat()
        cursor.execute(
            """
            INSERT INTO task_notes (task_id, user_id, content, note_type, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (task_id, user_id, content, note_type, now),
        )
        conn.commit()
        note_id = cursor.lastrowid

        # Update last_activity_at on the task
        cursor.execute(
            "UPDATE tasks SET last_activity_at = ?, updated_at = ? WHERE id = ?",
            (now, now, task_id),
        )
        conn.commit()

        return {
            "id": note_id,
            "task_id": task_id,
            "content": content,
            "note_type": note_type,
            "created_at": now,
        }
    finally:
        conn.close()


def get_task_notes(task_id: int, user_id: int) -> List[Dict[str, Any]]:
    """Retrieve all notes for a specific task ordered by creation time (newest first)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, task_id, content, note_type, created_at
            FROM task_notes
            WHERE task_id = ? AND user_id = ?
            ORDER BY created_at DESC
            """,
            (task_id, user_id),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r[0],
                "task_id": r[1],
                "content": r[2],
                "note_type": r[3],
                "created_at": r[4],
            }
            for r in rows
        ]
    finally:
        conn.close()


def get_note(note_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    """Retrieve a single note by ID, scoped to its owner."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, task_id, content, note_type, created_at
            FROM task_notes
            WHERE id = ? AND user_id = ?
            """,
            (note_id, user_id),
        )
        r = cursor.fetchone()
        if r:
            return {
                "id": r[0],
                "task_id": r[1],
                "content": r[2],
                "note_type": r[3],
                "created_at": r[4],
            }
        return None
    finally:
        conn.close()


def get_unprocessed_inbox_items(user_id: int) -> List[Dict[str, Any]]:
    """Retrieve all unprocessed items from the inbox."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, content, created_at
            FROM inbox
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,),
        )
        rows = cursor.fetchall()
        return [
            {
                "id": r[0],
                "content": r[1],
                "created_at": r[2]
            }
            for r in rows
        ]
    finally:
        conn.close()


def create_daily_plan(user_id: int, plan_date: str, available_hours: float, task_ids: List[int], reasoning: Dict[int, str]) -> Dict[str, Any]:
    """Create or replace a daily plan for a given user + date."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        task_ids_json = json.dumps(task_ids)
        reasoning_json = json.dumps(reasoning)
        now = datetime.utcnow().isoformat()

        cursor.execute(
            """
            INSERT INTO daily_plans (user_id, plan_date, available_hours, task_ids, reasoning, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM daily_plans WHERE user_id = ? AND plan_date = ?), ?), ?)
            ON CONFLICT(user_id, plan_date) DO UPDATE SET
                available_hours = excluded.available_hours,
                task_ids = excluded.task_ids,
                reasoning = excluded.reasoning,
                updated_at = excluded.updated_at
            """,
            (user_id, plan_date, available_hours, task_ids_json, reasoning_json, user_id, plan_date, now, now),
        )
        conn.commit()
        return {
            "plan_date": plan_date,
            "available_hours": available_hours,
            "task_ids": task_ids,
            "reasoning": reasoning,
        }
    finally:
        conn.close()


def get_daily_plan(user_id: int, plan_date: str) -> Optional[Dict[str, Any]]:
    """Retrieve the daily plan for a specific user + date."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, plan_date, available_hours, task_ids, reasoning, summary
            FROM daily_plans
            WHERE user_id = ? AND plan_date = ?
            """,
            (user_id, plan_date),
        )
        row = cursor.fetchone()
        if row:
            return {
                "id": row[0],
                "plan_date": row[1],
                "available_hours": row[2],
                "task_ids": json.loads(row[3]) if row[3] else [],
                "reasoning": json.loads(row[4]) if row[4] else {},
                "summary": row[5],
            }
        return None
    finally:
        conn.close()


def update_daily_plan_summary(user_id: int, plan_date: str, summary: str) -> bool:
    """Save the AI day summary for a plan date."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            """
            UPDATE daily_plans
            SET summary = ?, updated_at = ?
            WHERE user_id = ? AND plan_date = ?
            """,
            (summary, now, user_id, plan_date),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def update_daily_plan_tasks(user_id: int, plan_date: str, task_ids: List[int]) -> bool:
    """Update task IDs list in a daily plan."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        task_ids_json = json.dumps(task_ids)
        now = datetime.utcnow().isoformat()
        cursor.execute(
            """
            UPDATE daily_plans
            SET task_ids = ?, updated_at = ?
            WHERE user_id = ? AND plan_date = ?
            """,
            (task_ids_json, now, user_id, plan_date),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def _calculate_next_due_date(current_due: Optional[str], interval: str, custom_days: Optional[str]) -> str:
    """Calculates the next due date based on recurrence interval settings."""
    from datetime import date, timedelta
    today = date.today()
    base_date = today
    if current_due:
        try:
            base_date = date.fromisoformat(current_due)
        except Exception:
            pass

    if interval == "daily":
        return (base_date + timedelta(days=1)).isoformat()
    elif interval == "weekly":
        return (base_date + timedelta(days=7)).isoformat()
    elif interval == "custom_days" and custom_days:
        day_map = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
        target_days = []
        for d in custom_days.lower().split(","):
            d_clean = d.strip()[:3]
            if d_clean in day_map:
                target_days.append(day_map[d_clean])

        if not target_days:
            return (base_date + timedelta(days=1)).isoformat()

        # Check candidate days 1 to 7
        for i in range(1, 8):
            candidate = base_date + timedelta(days=i)
            if candidate.weekday() in target_days:
                return candidate.isoformat()

    return (base_date + timedelta(days=1)).isoformat()


def clone_recurring_task(task_id: int, user_id: int, next_due_date: str) -> int:
    """Clones a recurring task and its complete child hierarchy recursively."""
    task = get_task(task_id, user_id)
    if not task:
        raise ValueError("Task not found")

    template_id = task.get("recurrence_template_id") or task["id"]

    new_task = create_task(
        user_id=user_id,
        title=task["title"],
        priority=task["priority"],
        time_estimate=task["time_estimate"],
        context=task["context"],
        due_date=next_due_date,
        parent_id=task["parent_id"],
        is_recurring=1,
        recurrence_interval=task.get("recurrence_interval"),
        recurrence_custom_days=task.get("recurrence_custom_days"),
        recurrence_template_id=template_id,
        intention=task.get("intention"),
        definition_of_done=task.get("definition_of_done"),
    )

    _clone_task_recursive(task["id"], new_task["id"], user_id)
    return new_task["id"]


def _clone_task_recursive(old_parent_id: int, new_parent_id: int, user_id: int):
    """Recursively clone all child subtasks to the new parent task."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_TASK_COLUMNS} FROM tasks WHERE parent_id = ? AND user_id = ?",
            (old_parent_id, user_id),
        )
        rows = cursor.fetchall()
        children = [_task_row_to_dict(row) for row in rows]
    finally:
        conn.close()

    for child in children:
        new_child = create_task(
            user_id=user_id,
            title=child["title"],
            priority=child["priority"],
            time_estimate=child["time_estimate"],
            context=child["context"],
            parent_id=new_parent_id,
            intention=child.get("intention"),
            definition_of_done=child.get("definition_of_done"),
        )
        _clone_task_recursive(child["id"], new_child["id"], user_id)


def create_inbox_item(user_id: int, content: str) -> Dict[str, Any]:
    """Create a new inbox/distraction item."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            """
            INSERT INTO inbox (user_id, content, created_at)
            VALUES (?, ?, ?)
            """,
            (user_id, content, now),
        )
        conn.commit()
        item_id = cursor.lastrowid
        return {"id": item_id, "content": content, "created_at": now}
    finally:
        conn.close()


def delete_inbox_item(inbox_id: int, user_id: int) -> bool:
    """Delete an item from the inbox."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            DELETE FROM inbox
            WHERE id = ? AND user_id = ?
            """,
            (inbox_id, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def increment_today_completions(user_id: int, delta: int = 1):
    """Increment or decrement completed count for today in user_stats table."""
    from datetime import date
    today_str = date.today().isoformat()
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        # Check if today's record exists
        cursor.execute("SELECT completed_count FROM user_stats WHERE user_id = ? AND date = ?", (user_id, today_str))
        row = cursor.fetchone()

        if row is not None:
            new_val = max(0, row[0] + delta)
            cursor.execute("UPDATE user_stats SET completed_count = ? WHERE user_id = ? AND date = ?", (new_val, user_id, today_str))
        else:
            new_val = max(0, delta)
            cursor.execute("INSERT INTO user_stats (user_id, date, completed_count, streak) VALUES (?, ?, ?, 0)", (user_id, today_str, new_val))

        conn.commit()
    finally:
        conn.close()


def get_user_stats_summary(user_id: int) -> dict:
    """Retrieve today's completions, active streak, and completion count for the last 7 days."""
    from datetime import date, timedelta
    today = date.today()
    today_str = today.isoformat()

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        # 1. Fetch completed count for last 30 days to compute active streak
        cursor.execute("SELECT date, completed_count FROM user_stats WHERE user_id = ? ORDER BY date DESC LIMIT 40", (user_id,))
        rows = cursor.fetchall()
        db_map = {r[0]: r[1] for r in rows}

        # Calculate streak
        streak = 0
        current_check = today

        # If today has completions, start counting from today.
        # If not, check if yesterday had completions to keep streak alive.
        if db_map.get(today_str, 0) > 0:
            streak = 1
            current_check = today - timedelta(days=1)
            while db_map.get(current_check.isoformat(), 0) > 0:
                streak += 1
                current_check -= timedelta(days=1)
        else:
            yesterday_str = (today - timedelta(days=1)).isoformat()
            if db_map.get(yesterday_str, 0) > 0:
                streak = 1
                current_check = today - timedelta(days=2)
                while db_map.get(current_check.isoformat(), 0) > 0:
                    streak += 1
                    current_check -= timedelta(days=1)

        # 2. Get last 7 days data
        last_7_days = []
        last_7_dates = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            d_str = d.isoformat()
            last_7_days.append(db_map.get(d_str, 0))
            last_7_dates.append(d.strftime("%a")) # e.g. "Mon"

        completed_today = db_map.get(today_str, 0)

        return {
            "completed_today": completed_today,
            "streak": streak,
            "last_7_days": last_7_days,
            "last_7_dates": last_7_dates,
        }
    finally:
        conn.close()


def create_handwriting_extraction(
    user_id: int,
    original_filename: str,
    extracted_text: str,
    vision_model_used: str,
    source: str = "task_context",
    task_id: Optional[int] = None,
    confidence_note: Optional[str] = None,
) -> Dict[str, Any]:
    """Save a handwriting extraction record."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        cursor.execute(
            """
            INSERT INTO handwriting_extractions
                (user_id, task_id, original_filename, extracted_text, vision_model_used, confidence_note, extracted_at, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, task_id, original_filename, extracted_text, vision_model_used, confidence_note, now, source),
        )
        conn.commit()
        return {
            "id": cursor.lastrowid,
            "task_id": task_id,
            "original_filename": original_filename,
            "extracted_text": extracted_text,
            "vision_model_used": vision_model_used,
            "confidence_note": confidence_note,
            "source": source,
            "extracted_at": now,
        }
    finally:
        conn.close()
