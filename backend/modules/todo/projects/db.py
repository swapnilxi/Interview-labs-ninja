"""Database CRUD operations for the projects and project_nodes tables. All access is scoped to a user_id."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

from modules.common.db import get_db_path


# ── Projects ──────────────────────────────────────────────────────────────────

def _project_row_to_dict(row: tuple) -> Dict[str, Any]:
    return {
        "id": row[0],
        "title": row[1],
        "description": row[2],
        "status": row[3],
        "priority": row[4],
        "eisenhower_quadrant": row[5],
        "due_date": row[6],
        "color": row[7],
        "icon": row[8],
        "created_at": row[9],
        "pareto_score": row[10] if len(row) > 10 else None,
        "is_top_20": bool(row[11]) if len(row) > 11 and row[11] is not None else False,
        "pareto_reason": row[12] if len(row) > 12 else None,
        "pareto_locked": bool(row[13]) if len(row) > 13 and row[13] is not None else False,
    }


_PROJECT_COLUMNS = (
    "id, title, description, status, priority, eisenhower_quadrant, "
    "due_date, color, icon, created_at, pareto_score, is_top_20, pareto_reason, pareto_locked"
)


def create_project(
    user_id: int,
    title: str,
    description: Optional[str] = None,
    priority: str = "p3",
    color: Optional[str] = None,
    icon: Optional[str] = None,
    due_date: Optional[str] = None,
    eisenhower_quadrant: str = "schedule",
) -> Dict[str, Any]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO projects (user_id, title, description, priority, color, icon, due_date, eisenhower_quadrant)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, title, description, priority, color, icon, due_date, eisenhower_quadrant),
        )
        conn.commit()
        pid = cursor.lastrowid
        cursor.execute(f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE id = ?", (pid,))
        return _project_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def get_all_projects(user_id: int) -> List[Dict[str, Any]]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE user_id = ? ORDER BY id DESC", (user_id,))
        projects = [_project_row_to_dict(row) for row in cursor.fetchall()]

        # Attach node counts and export stats per project
        for p in projects:
            cursor.execute(
                "SELECT COUNT(*) FROM project_nodes WHERE project_id = ? AND user_id = ?", (p["id"], user_id)
            )
            p["node_count"] = cursor.fetchone()[0]
            cursor.execute(
                "SELECT COUNT(*) FROM project_nodes WHERE project_id = ? AND user_id = ? AND exported_to_smart_todo = 1",
                (p["id"], user_id),
            )
            p["exported_count"] = cursor.fetchone()[0]
        return projects
    finally:
        conn.close()


def get_project(project_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        row = cursor.fetchone()
        return _project_row_to_dict(row) if row else None
    finally:
        conn.close()


def update_project(project_id: int, user_id: int, **fields) -> Optional[Dict[str, Any]]:
    allowed = {"title", "description", "status", "priority", "eisenhower_quadrant", "due_date", "color", "icon",
               "pareto_score", "is_top_20", "pareto_reason", "pareto_locked"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_project(project_id, user_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [project_id, user_id]

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE projects SET {set_clause} WHERE id = ? AND user_id = ?", values)
        conn.commit()
        cursor.execute(f"SELECT {_PROJECT_COLUMNS} FROM projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        return _project_row_to_dict(row) if row else None
    finally:
        conn.close()


def delete_project(project_id: int, user_id: int) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


# ── Project Nodes ─────────────────────────────────────────────────────────────

def _node_row_to_dict(row: tuple) -> Dict[str, Any]:
    return {
        "id": row[0],
        "project_id": row[1],
        "parent_node_id": row[2],
        "title": row[3],
        "node_type": row[4],
        "generation_type": row[5],
        "depth_level": row[6],
        "exported_to_smart_todo": bool(row[7]),
        "exported_task_id": row[8],
        "exported_to_quick": bool(row[9]),
        "order_index": row[10],
        "created_at": row[11],
        "pareto_score": row[12] if len(row) > 12 else None,
        "is_top_20": bool(row[13]) if len(row) > 13 and row[13] is not None else False,
        "eisenhower_quadrant": row[14] if len(row) > 14 and row[14] is not None else "schedule",
        "context": row[15] if len(row) > 15 else None,
        "due_date": row[16] if len(row) > 16 else None,
        "time_estimate": row[17] if len(row) > 17 else None,
        "intention": row[18] if len(row) > 18 else None,
        "definition_of_done": row[19] if len(row) > 19 else None,
        "pareto_reason": row[20] if len(row) > 20 else None,
        "pareto_locked": bool(row[21]) if len(row) > 21 and row[21] is not None else False,
    }


_NODE_COLUMNS = (
    "id, project_id, parent_node_id, title, node_type, generation_type, "
    "depth_level, exported_to_smart_todo, exported_task_id, exported_to_quick, "
    "order_index, created_at, pareto_score, is_top_20, eisenhower_quadrant, "
    "context, due_date, time_estimate, intention, definition_of_done, "
    "pareto_reason, pareto_locked"
)


def create_project_node(
    project_id: int,
    user_id: int,
    title: str,
    parent_node_id: Optional[int] = None,
    node_type: str = "topic",
    generation_type: str = "manual",
    order_index: int = 0,
) -> Optional[Dict[str, Any]]:
    """Create a node under a project. Returns None if the project isn't owned by user_id."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        if cursor.fetchone() is None:
            return None

        # Calculate depth_level (only from a parent node this user owns)
        depth_level = 1
        if parent_node_id:
            cursor.execute(
                "SELECT depth_level FROM project_nodes WHERE id = ? AND user_id = ?", (parent_node_id, user_id)
            )
            parent_row = cursor.fetchone()
            if parent_row:
                depth_level = parent_row[0] + 1
            else:
                parent_node_id = None

        cursor.execute(
            """
            INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type, depth_level, order_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, project_id, parent_node_id, title, node_type, generation_type, depth_level, order_index),
        )
        conn.commit()
        nid = cursor.lastrowid
        cursor.execute(f"SELECT {_NODE_COLUMNS} FROM project_nodes WHERE id = ?", (nid,))
        return _node_row_to_dict(cursor.fetchone())
    finally:
        conn.close()


def get_project_node_tree(project_id: int, user_id: int) -> List[Dict[str, Any]]:
    """Fetch all nodes and assemble into nested tree."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT {_NODE_COLUMNS} FROM project_nodes WHERE project_id = ? AND user_id = ? ORDER BY order_index ASC, id ASC",
            (project_id, user_id),
        )
        all_nodes = [_node_row_to_dict(row) for row in cursor.fetchall()]

        # Build tree
        node_map = {n["id"]: {**n, "children": []} for n in all_nodes}
        roots = []
        for n in all_nodes:
            node_with_children = node_map[n["id"]]
            if n["parent_node_id"] and n["parent_node_id"] in node_map:
                node_map[n["parent_node_id"]]["children"].append(node_with_children)
            else:
                roots.append(node_with_children)
        return roots
    finally:
        conn.close()


def get_project_node(node_id: int, user_id: int) -> Optional[Dict[str, Any]]:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {_NODE_COLUMNS} FROM project_nodes WHERE id = ? AND user_id = ?", (node_id, user_id))
        row = cursor.fetchone()
        return _node_row_to_dict(row) if row else None
    finally:
        conn.close()


def get_node_sibling_titles(parent_node_id: Optional[int], project_id: int, user_id: int) -> List[str]:
    """Fetch sibling node titles for AI context."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        if parent_node_id:
            cursor.execute(
                "SELECT title FROM project_nodes WHERE parent_node_id = ? AND project_id = ? AND user_id = ?",
                (parent_node_id, project_id, user_id),
            )
        else:
            cursor.execute(
                "SELECT title FROM project_nodes WHERE parent_node_id IS NULL AND project_id = ? AND user_id = ?",
                (project_id, user_id),
            )
        return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()


def update_project_node(node_id: int, user_id: int, **fields) -> Optional[Dict[str, Any]]:
    allowed = {
        "title", "node_type", "exported_to_smart_todo", "exported_task_id", "exported_to_quick",
        "order_index", "pareto_score", "is_top_20", "eisenhower_quadrant",
        "context", "due_date", "time_estimate", "intention", "definition_of_done",
        "pareto_reason", "pareto_locked",
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_project_node(node_id, user_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [node_id, user_id]

    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE project_nodes SET {set_clause} WHERE id = ? AND user_id = ?", values)
        conn.commit()
        return get_project_node(node_id, user_id)
    finally:
        conn.close()


def delete_project_node(node_id: int, user_id: int) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.execute("DELETE FROM project_nodes WHERE id = ? AND user_id = ?", (node_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def create_project_nodes_batch(
    project_id: int,
    user_id: int,
    parent_node_id: Optional[int],
    nodes_data: List[Dict[str, Any]],
    generation_type: str = "dive_deeper",
) -> List[Dict[str, Any]]:
    """Batch insert project nodes (for AI-generated breakdowns)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        if cursor.fetchone() is None:
            return []

        depth_level = 1
        inherited_pareto_score = None
        if parent_node_id:
            cursor.execute(
                "SELECT depth_level, is_top_20 FROM project_nodes WHERE id = ? AND user_id = ?",
                (parent_node_id, user_id),
            )
            parent_row = cursor.fetchone()
            if parent_row:
                depth_level = parent_row[0] + 1
                # Subtasks generated from a Top 20% node inherit an elevated base
                # Pareto score (0.5) instead of null, until re-analyzed themselves.
                inherited_pareto_score = 0.5 if parent_row[1] else None

        results = []
        for i, nd in enumerate(nodes_data):
            cursor.execute(
                """
                INSERT INTO project_nodes (user_id, project_id, parent_node_id, title, node_type, generation_type, depth_level, order_index, pareto_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, project_id, parent_node_id, nd["title"], nd.get("node_type", "topic"), generation_type, depth_level, i, inherited_pareto_score),
            )
            nid = cursor.lastrowid
            cursor.execute(f"SELECT {_NODE_COLUMNS} FROM project_nodes WHERE id = ?", (nid,))
            results.append(_node_row_to_dict(cursor.fetchone()))

        conn.commit()
        return results
    finally:
        conn.close()


def bulk_update_project_quadrants(user_id: int, updates: List[Dict[str, Any]]) -> None:
    """Batch update eisenhower_quadrant for multiple projects (only ones this user owns)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for u in updates:
            project_id = u.get("project_id")
            quadrant = u.get("quadrant")
            if project_id and quadrant:
                cursor.execute(
                    "UPDATE projects SET eisenhower_quadrant = ? WHERE id = ? AND user_id = ?",
                    (quadrant, project_id, user_id),
                )
        conn.commit()
    finally:
        conn.close()


def get_all_flat_project_nodes(user_id: int) -> List[Dict[str, Any]]:
    """Fetch all tasks/subtasks across this user's active projects with project metadata."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                n.id, n.project_id, n.parent_node_id, n.title, n.node_type, n.generation_type,
                n.depth_level, n.exported_to_smart_todo, n.exported_task_id, n.exported_to_quick,
                n.order_index, n.created_at, n.pareto_score, n.is_top_20, n.eisenhower_quadrant,
                p.title as project_title, p.color as project_color, p.icon as project_icon
            FROM project_nodes n
            JOIN projects p ON n.project_id = p.id
            WHERE p.status = 'active' AND n.user_id = ? AND p.user_id = ?
            ORDER BY n.order_index ASC, n.id ASC
            """,
            (user_id, user_id),
        )
        nodes = []
        for row in cursor.fetchall():
            node_dict = _node_row_to_dict(row[:15])
            node_dict["project_title"] = row[15]
            node_dict["project_color"] = row[16]
            node_dict["project_icon"] = row[17]
            nodes.append(node_dict)
        return nodes
    finally:
        conn.close()


def bulk_update_node_quadrants(user_id: int, updates: List[Dict[str, Any]]) -> None:
    """Batch update eisenhower_quadrant for multiple project nodes (only ones this user owns)."""
    conn = sqlite3.connect(get_db_path())
    try:
        cursor = conn.cursor()
        for u in updates:
            nid = u.get("node_id") or u.get("id")
            quad = u.get("quadrant")
            if nid and quad:
                cursor.execute(
                    "UPDATE project_nodes SET eisenhower_quadrant = ? WHERE id = ? AND user_id = ?",
                    (quad, nid, user_id),
                )
        conn.commit()
    finally:
        conn.close()
