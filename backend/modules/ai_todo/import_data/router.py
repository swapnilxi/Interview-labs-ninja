"""Guest -> account migration: bulk-import a browser-local dataset for a newly logged-in user.

Runs as a single transaction so a partial failure can't half-populate the account.
Client-supplied ids ("client_id") are throwaway local ids minted in the browser;
this endpoint remaps them to real server ids and returns the mapping so the
frontend can reconcile its local store with the server.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id
from modules.common.db import get_db_path

router = APIRouter(prefix="/todo", tags=["import"], dependencies=[Depends(get_current_user_id)])


class ImportNote(BaseModel):
    client_id: Optional[int] = None
    content: str
    note_type: str = "manual"
    created_at: Optional[str] = None


class ImportTask(BaseModel):
    client_id: int
    parent_client_id: Optional[int] = None
    title: str
    status: str = "backlog"
    priority: str = "p3"
    time_estimate: Optional[str] = None
    due_date: Optional[str] = None
    context: Optional[str] = None
    intention: Optional[str] = None
    definition_of_done: Optional[str] = None
    is_recurring: bool = False
    recurrence_interval: Optional[str] = None
    eisenhower_quadrant: Optional[str] = None
    attachments: Optional[List[str]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    notes: List[ImportNote] = []


class ImportProjectNode(BaseModel):
    client_id: int
    parent_client_id: Optional[int] = None
    title: str
    node_type: str = "topic"
    order_index: int = 0
    context: Optional[str] = None
    due_date: Optional[str] = None
    time_estimate: Optional[str] = None
    created_at: Optional[str] = None


class ImportProject(BaseModel):
    client_id: int
    title: str
    description: Optional[str] = None
    status: str = "active"
    priority: str = "p3"
    color: Optional[str] = None
    icon: Optional[str] = None
    due_date: Optional[str] = None
    created_at: Optional[str] = None
    nodes: List[ImportProjectNode] = []


class ImportQuickTask(BaseModel):
    client_id: int
    title: str
    done: bool = False
    quadrant: str = "do_now"
    date: str
    source: str = "manual"
    created_at: Optional[str] = None


class ImportDailyPlan(BaseModel):
    date: str
    available_hours: float
    task_client_ids: List[int] = []
    reasoning: Optional[Dict[str, str]] = None


class ImportInboxItem(BaseModel):
    content: str


class ImportRequest(BaseModel):
    tasks: List[ImportTask] = []
    projects: List[ImportProject] = []
    quick_tasks: List[ImportQuickTask] = []
    daily_plans: List[ImportDailyPlan] = []
    inbox: List[ImportInboxItem] = []


def _now() -> str:
    return datetime.utcnow().isoformat()


@router.post("/import")
async def import_guest_data(payload: ImportRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    conn = sqlite3.connect(get_db_path())
    id_map: Dict[str, Dict[str, int]] = {"tasks": {}, "projects": {}, "quick_tasks": {}}
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")

        # ── Tasks: insert parents before children (topological, like bulk_save) ──
        unprocessed = list(payload.tasks)
        max_loops = len(unprocessed) * 3 + 1
        loops = 0
        while unprocessed and loops < max_loops:
            loops += 1
            current = unprocessed.pop(0)
            if current.parent_client_id is not None and current.parent_client_id not in id_map["tasks"]:
                unprocessed.append(current)
                continue

            parent_id = id_map["tasks"].get(current.parent_client_id) if current.parent_client_id is not None else None
            depth_level = 1
            if parent_id is not None:
                cursor.execute("SELECT depth_level FROM tasks WHERE id = ?", (parent_id,))
                row = cursor.fetchone()
                depth_level = (row[0] + 1) if row else 1

            now = _now()
            cursor.execute(
                """
                INSERT INTO tasks (
                    user_id, parent_id, title, status, priority, time_estimate, due_date,
                    generation_type, depth_level, context, attachments, created_at, updated_at,
                    last_activity_at, is_recurring, recurrence_interval, intention,
                    definition_of_done, eisenhower_quadrant
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id, parent_id, current.title, current.status, current.priority,
                    current.time_estimate, current.due_date, depth_level, current.context,
                    json.dumps(current.attachments) if current.attachments else None,
                    current.created_at or now, current.updated_at or now, now,
                    1 if current.is_recurring else 0, current.recurrence_interval,
                    current.intention, current.definition_of_done, current.eisenhower_quadrant,
                ),
            )
            server_id = cursor.lastrowid
            id_map["tasks"][current.client_id] = server_id

            for note in current.notes:
                cursor.execute(
                    "INSERT INTO task_notes (task_id, user_id, content, note_type, created_at) VALUES (?, ?, ?, ?, ?)",
                    (server_id, user_id, note.content, note.note_type, note.created_at or now),
                )

        # Any tasks whose parent_client_id never resolved (bad/missing reference):
        # import as root-level rather than silently dropping the user's data.
        for orphan in unprocessed:
            now = _now()
            cursor.execute(
                """
                INSERT INTO tasks (user_id, parent_id, title, status, priority, generation_type, depth_level, created_at, updated_at, last_activity_at)
                VALUES (?, NULL, ?, ?, ?, 'manual', 1, ?, ?, ?)
                """,
                (user_id, orphan.title, orphan.status, orphan.priority, now, now, now),
            )
            id_map["tasks"][orphan.client_id] = cursor.lastrowid

        # ── Projects + nodes ──────────────────────────────────────────────────
        for proj in payload.projects:
            now = _now()
            cursor.execute(
                """
                INSERT INTO projects (user_id, title, description, status, priority, color, icon, due_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, proj.title, proj.description, proj.status, proj.priority, proj.color, proj.icon, proj.due_date, proj.created_at or now),
            )
            project_id = cursor.lastrowid
            id_map["projects"][proj.client_id] = project_id

            node_id_map: Dict[int, int] = {}
            unprocessed_nodes = list(proj.nodes)
            node_loops = 0
            node_max_loops = len(unprocessed_nodes) * 3 + 1
            while unprocessed_nodes and node_loops < node_max_loops:
                node_loops += 1
                node = unprocessed_nodes.pop(0)
                if node.parent_client_id is not None and node.parent_client_id not in node_id_map:
                    unprocessed_nodes.append(node)
                    continue

                parent_node_id = node_id_map.get(node.parent_client_id) if node.parent_client_id is not None else None
                depth_level = 1
                if parent_node_id is not None:
                    cursor.execute("SELECT depth_level FROM project_nodes WHERE id = ?", (parent_node_id,))
                    row = cursor.fetchone()
                    depth_level = (row[0] + 1) if row else 1

                node_now = _now()
                cursor.execute(
                    """
                    INSERT INTO project_nodes (
                        user_id, project_id, parent_node_id, title, node_type, generation_type,
                        depth_level, order_index, context, due_date, time_estimate, created_at
                    ) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id, project_id, parent_node_id, node.title, node.node_type,
                        depth_level, node.order_index, node.context, node.due_date,
                        node.time_estimate, node.created_at or node_now,
                    ),
                )
                node_id_map[node.client_id] = cursor.lastrowid

        # ── Quick tasks ───────────────────────────────────────────────────────
        for qt in payload.quick_tasks:
            now = _now()
            cursor.execute(
                """
                INSERT INTO quick_tasks (user_id, title, done, quadrant, date, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, qt.title, 1 if qt.done else 0, qt.quadrant, qt.date, qt.source, qt.created_at or now),
            )
            id_map["quick_tasks"][qt.client_id] = cursor.lastrowid

        # ── Daily plans (remap task_client_ids -> server task ids) ──────────────
        for plan in payload.daily_plans:
            resolved_task_ids = [id_map["tasks"][cid] for cid in plan.task_client_ids if cid in id_map["tasks"]]
            reasoning = plan.reasoning or {}
            now = _now()
            cursor.execute(
                """
                INSERT INTO daily_plans (user_id, plan_date, available_hours, task_ids, reasoning, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, plan_date) DO UPDATE SET
                    available_hours = excluded.available_hours,
                    task_ids = excluded.task_ids,
                    reasoning = excluded.reasoning,
                    updated_at = excluded.updated_at
                """,
                (user_id, plan.date, plan.available_hours, json.dumps(resolved_task_ids), json.dumps(reasoning), now, now),
            )

        # ── Inbox ────────────────────────────────────────────────────────────
        for item in payload.inbox:
            cursor.execute(
                "INSERT INTO inbox (user_id, content, created_at) VALUES (?, ?, ?)",
                (user_id, item.content, _now()),
            )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {
        "id_map": {
            "tasks": {str(k): v for k, v in id_map["tasks"].items()},
            "projects": {str(k): v for k, v in id_map["projects"].items()},
            "quick_tasks": {str(k): v for k, v in id_map["quick_tasks"].items()},
        },
        "imported": {
            "tasks": len(id_map["tasks"]),
            "projects": len(id_map["projects"]),
            "quick_tasks": len(id_map["quick_tasks"]),
            "daily_plans": len(payload.daily_plans),
            "inbox": len(payload.inbox),
        },
    }
