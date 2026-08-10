"""Database CRUD operations for the goal_nodes table. All access is scoped to a user_id.

Unlike project_nodes (which always belongs to a project), a goal_node's parent
is optional at any level — a user can start a goal at any time horizon
(main/yearly/quarterly/monthly/weekly/daily) without a parent above it.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path

LEVEL_ORDER = ["main", "yearly", "quarterly", "monthly", "weekly", "daily"]


def _goal_row_to_dict(row: tuple) -> Dict[str, Any]:
    return {
        "id": row[0],
        "user_id": row[1],
        "parent_id": row[2],
        "title": row[3],
        "description": row[4],
        "level": row[5],
        "status": row[6],
        "priority": row[7],
        "due_date": row[8],
        "generation_type": row[9],
        "depth_level": row[10],
        "order_index": row[11],
        "exported_to_smart_todo": bool(row[12]),
        "exported_task_id": row[13],
        "exported_to_quick": bool(row[14]),
        "exported_quick_task_id": row[15],
        "exported_to_plan": bool(row[16]),
        "exported_project_id": row[17],
        "created_at": row[18],
        "updated_at": row[19],
    }


_GOAL_COLUMNS = (
    "id, user_id, parent_id, title, description, level, status, priority, due_date, "
    "generation_type, depth_level, order_index, exported_to_smart_todo, exported_task_id, "
    "exported_to_quick, exported_quick_task_id, exported_to_plan, exported_project_id, "
    "created_at, updated_at"
)


def create_goal_node(
    user_id: int,
    title: str,
    level: str = "daily",
    parent_id: Optional[int] = None,
    description: Optional[str] = None,
    priority: str = "p3",
    due_date: Optional[str] = None,
    status: str = "backlog",
    order_index: int = 0,
) -> Dict[str, Any]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        depth_level = 0
        if parent_id:
            cursor.execute("SELECT depth_level FROM goal_nodes WHERE id = ? AND user_id = ?", (parent_id, user_id))
            parent_row = cursor.fetchone()
            if parent_row:
                depth_level = parent_row[0] + 1
            else:
                parent_id = None

        cursor.execute(
            """
            INSERT INTO goal_nodes
                (user_id, parent_id, title, description, level, status, priority, due_date, depth_level, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, parent_id, title, description, level, status, priority, due_date, depth_level, order_index),
        )
        conn.commit()
        gid = cursor.lastrowid
        cursor.execute(f"SELECT {_GOAL_COLUMNS} FROM goal_nodes WHERE id = ?", (gid,))
        return _goal_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def get_goal_tree(user_id: int) -> List[Dict[str, Any]]:
    """Fetch all goal nodes for a user and assemble into a nested forest."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_GOAL_COLUMNS} FROM goal_nodes WHERE user_id = ? ORDER BY order_index ASC, id ASC",
            (user_id,),
        )
        all_nodes = [_goal_row_to_dict(row) for row in cursor.fetchall()]

        node_map = {n["id"]: {**n, "children": []} for n in all_nodes}
        roots = []
        for n in all_nodes:
            node_with_children = node_map[n["id"]]
            if n["parent_id"] and n["parent_id"] in node_map:
                node_map[n["parent_id"]]["children"].append(node_with_children)
            else:
                roots.append(node_with_children)
        return roots
    finally:
        conn.close()


def get_goal_node(goal_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_GOAL_COLUMNS} FROM goal_nodes WHERE id = ? AND user_id = ?", (goal_id, user_id))
        row = cursor.fetchone()
        return _goal_row_to_dict(row) if row else None
    finally:
        conn.close()


def get_goal_sibling_titles(parent_id: Optional[int], user_id: int) -> List[str]:
    """Fetch sibling goal titles for AI context (avoid duplicate suggestions)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        if parent_id:
            cursor.execute(
                "SELECT title FROM goal_nodes WHERE parent_id = ? AND user_id = ?", (parent_id, user_id)
            )
        else:
            cursor.execute(
                "SELECT title FROM goal_nodes WHERE parent_id IS NULL AND user_id = ?", (user_id,)
            )
        return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()


def update_goal_node(goal_id: int, user_id: int, **fields) -> Optional[Dict[str, Any]]:
    allowed = {
        "title", "description", "level", "status", "priority", "due_date", "parent_id",
        "order_index", "exported_to_smart_todo", "exported_task_id", "exported_to_quick",
        "exported_quick_task_id", "exported_to_plan", "exported_project_id",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_goal_node(goal_id, user_id)

    set_parts = [f"{k} = ?" for k in updates] + ["updated_at = datetime('now')"]
    values = list(updates.values()) + [goal_id, user_id]

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE goal_nodes SET {', '.join(set_parts)} WHERE id = ? AND user_id = ?", values)
        conn.commit()
        return get_goal_node(goal_id, user_id)
    finally:
        conn.close()


def delete_goal_node(goal_id: int, user_id: int) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM goal_nodes WHERE id = ? AND user_id = ?", (goal_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def create_goal_nodes_batch(
    parent_id: int,
    user_id: int,
    nodes_data: List[Dict[str, Any]],
    generation_type: str,
    level: str,
) -> List[Dict[str, Any]]:
    """Batch insert goal nodes (for AI-generated breakdowns) under a common parent."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT depth_level FROM goal_nodes WHERE id = ? AND user_id = ?", (parent_id, user_id))
        parent_row = cursor.fetchone()
        if not parent_row:
            return []
        depth_level = parent_row[0] + 1

        results = []
        for i, nd in enumerate(nodes_data):
            cursor.execute(
                """
                INSERT INTO goal_nodes
                    (user_id, parent_id, title, description, level, generation_type, depth_level, order_index,
                     priority, due_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id, parent_id, nd["title"], nd.get("description"), level, generation_type,
                    depth_level, i, nd.get("priority", "p3"), nd.get("due_date"),
                ),
            )
            gid = cursor.lastrowid
            cursor.execute(f"SELECT {_GOAL_COLUMNS} FROM goal_nodes WHERE id = ?", (gid,))
            results.append(_goal_row_to_dict(cursor.fetchone()))

        conn.commit()
        return results
    finally:
        conn.close()
