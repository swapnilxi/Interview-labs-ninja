"""Project question/topic lessons: endpoints, the operations table and the write transactions.

TWIN: frontend/fe-apis/lms/questionTopicHandlers.ts (same routes, bodies, status codes and error texts).
Pure helpers (prompts, validation, renderer): question_topics.py.

  POST   /api/lms/projects/{p}/question-topics/preview         AI: suggested title + section. Saves nothing.
  POST   /api/lms/projects/{p}/question-topics                  Generate (or regenerate with topic_id) a lesson.
  GET    /api/lms/projects/{p}/question-topics/operations/{op}  Status of one generate operation.
  PATCH  /api/lms/projects/{p}/question-topics/{t}              Rename and/or move to another section. No AI.
  DELETE /api/lms/projects/{p}/question-topics/{t}              Remove the topic and its lesson.

Duplicates: the client sends one operation_id per "Generate lesson" and reuses it on every retry (timeout, the
FastAPI -> Next.js fallback, a double click). The operation row is claimed in a short transaction, the AI runs
outside any lock, and the commit re-checks the row inside BEGIN IMMEDIATE: whichever run commits first wins and
every other run returns that same topic. The "User Questions Topics" section is created inside the same
transaction, so two first topics can't create it twice.

Sync: the claim and the commit are separate synced writes (modules/common/neon_sync.synced_write), so the AI call
never holds the sync lock and a compare-and-set conflict re-runs only the short, idempotent write.
Stale edits: every topic carries a version. PATCH may send base_version; a mismatch is a 409 with the current topic,
so an edit made on an old screen can't silently undo a newer move or rename from another device.
"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from modules.auth.dependencies import get_current_active_user, has_permission
from modules.common.ai import AISettings, call_ai_text
from modules.common.db import get_db_path
from modules.common.neon_sync import request_entry, synced_write

from . import question_topics as qt
from .db import get_all_classes, get_subject_by_id_or_slug, slugify
from .visual_engine import PREMIUM_DESIGN_TOKENS_CSS

OP_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
BUSY_SECONDS = 300
LESSON_TIMEOUT_S = 240
PREVIEW_TIMEOUT_S = 60

OPS_DDL = """
CREATE TABLE IF NOT EXISTS lms_topic_operations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id INTEGER,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    topic_id TEXT,
    lesson_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""


def ensure_tables(cursor: sqlite3.Cursor) -> None:
    cursor.execute(OPS_DDL)


class PreviewRequest(AISettings):
    input: str = ""


class GenerateRequest(AISettings):
    operation_id: str = ""
    input: str = ""
    input_type: str = ""
    title: str = ""
    section_id: str = ""
    guiding_question: str = ""
    topic_id: str = ""


class UpdateRequest(BaseModel):
    title: Optional[str] = None
    section_id: Optional[str] = None
    base_version: Optional[int] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path(), timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute(OPS_DDL)
    return conn


def _project_or_404(project_id: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    for cls in get_all_classes():
        subj = get_subject_by_id_or_slug(cls["id"], project_id)
        if subj and subj["id"] == project_id and subj.get("kind") == "project":
            return subj["class"], subj
    raise HTTPException(status_code=404, detail="Project not found.")


def _require_edit(user: Dict[str, Any], cls: Dict[str, Any]) -> None:
    """Same rule as every other project change: the ai_lms:edit permission, or owning the project's class."""
    if not has_permission(user, "ai_lms:edit") and cls.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="You can't change this project.")


def _load_plan(conn: sqlite3.Connection, project_id: str) -> List[Dict[str, Any]]:
    row = conn.execute("SELECT project_plan FROM lms_subjects WHERE id = ?", (project_id,)).fetchone()
    try:
        raw = json.loads(row["project_plan"]) if row and row["project_plan"] else []
    except (TypeError, ValueError):
        raw = []
    return qt.ensure_ids(raw if isinstance(raw, list) else [])


def _save_plan(conn: sqlite3.Connection, project_id: str, plan: List[Dict[str, Any]]) -> None:
    now = _now()
    conn.execute("UPDATE lms_subjects SET project_plan = ?, updated_at = ? WHERE id = ?", (json.dumps(plan), now, project_id))
    # Lessons follow the outline order (modules, then their steps); lessons outside the outline go last.
    planned: List[str] = []
    for m in plan:
        if m.get("lesson_id"):
            planned.append(m["lesson_id"])
        for s in m.get("sublessons") or []:
            if s.get("lesson_id"):
                planned.append(s["lesson_id"])
    current = [r["id"] for r in conn.execute(
        "SELECT id FROM lms_lessons WHERE subject_id = ? ORDER BY order_index ASC, created_at ASC", (project_id,)
    )]
    ordered = [i for i in planned if i in current] + [i for i in current if i not in planned]
    for idx, lid in enumerate(ordered):
        conn.execute("UPDATE lms_lessons SET order_index = ?, updated_at = ? WHERE id = ?", (idx, now, lid))


def _lesson_brief(conn: sqlite3.Connection, lesson_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not lesson_id:
        return None
    row = conn.execute("SELECT id, slug, title FROM lms_lessons WHERE id = ?", (lesson_id,)).fetchone()
    return dict(row) if row else None


def _result(cls: Dict[str, Any], project_id: str, topic_id: str, op: Dict[str, Any], replayed: bool) -> Dict[str, Any]:
    conn = _conn()
    try:
        plan = _load_plan(conn, project_id)
        pos = qt.find_topic(plan, topic_id)
        if pos is None:
            raise HTTPException(status_code=404, detail="That topic no longer exists in this project.")
        module = plan[pos[0]]
        topic = qt.topic_view(module, module["sublessons"][pos[1]])
        lesson = _lesson_brief(conn, topic["lesson_id"])
    finally:
        conn.close()
    _cls, project = _project_or_404(project_id)
    return {
        "topic": topic,
        "lesson": lesson,
        "lesson_url": f"/ai-lms/classes/{cls['slug']}/{project['slug']}/{lesson['slug']}" if lesson else None,
        "operation": {"id": op["id"], "status": "done"},
        "replayed": replayed,
        "project": project,
    }


# ── Operation claim / fail / commit (each is one short transaction) ───────────────

def _claim(op_id: str, project_id: str, user_id: int, req_hash: str) -> Tuple[str, Dict[str, Any]]:
    conn = _conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM lms_topic_operations WHERE id = ?", (op_id,)).fetchone()
        now = _now()
        if row:
            op = dict(row)
            if op["project_id"] != project_id or op["request_hash"] != req_hash:
                conn.execute("ROLLBACK")
                return "conflict", op
            if op["status"] == "done":
                conn.execute("ROLLBACK")
                return "done", op
            fresh = (datetime.now(timezone.utc) - datetime.fromisoformat(op["updated_at"].replace("Z", "+00:00"))).total_seconds() < BUSY_SECONDS
            if op["status"] == "generating" and fresh:
                conn.execute("ROLLBACK")
                return "busy", op
            conn.execute(
                "UPDATE lms_topic_operations SET status = 'generating', error = NULL, updated_at = ? WHERE id = ?", (now, op_id)
            )
        else:
            conn.execute(
                "INSERT INTO lms_topic_operations (id, project_id, user_id, request_hash, status, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, 'generating', ?, ?)",
                (op_id, project_id, user_id, req_hash, now, now),
            )
        conn.execute("COMMIT")
        return "run", dict(conn.execute("SELECT * FROM lms_topic_operations WHERE id = ?", (op_id,)).fetchone())
    finally:
        conn.close()


def _fail(op_id: str, message: str) -> None:
    conn = _conn()
    try:
        conn.execute(
            "UPDATE lms_topic_operations SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status != 'done'",
            (message[:500], _now(), op_id),
        )
    finally:
        conn.close()


def _commit(
    op_id: str,
    cls_id: str,
    project_id: str,
    section_id: str,
    topic_id: str,
    title: str,
    user_input: str,
    input_type: str,
    html: str,
    summary: str,
    minutes: int,
) -> Dict[str, Any]:
    """Save the lesson + outline entry and mark the operation done, all in one transaction. Idempotent."""
    conn = _conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        op = dict(conn.execute("SELECT * FROM lms_topic_operations WHERE id = ?", (op_id,)).fetchone())
        if op["status"] == "done":
            conn.execute("ROLLBACK")
            return {"op": op, "replayed": True}
        plan = _load_plan(conn, project_id)
        now = _now()

        if topic_id:
            pos = qt.find_topic(plan, topic_id)
            if pos is None:
                conn.execute("ROLLBACK")
                raise HTTPException(status_code=404, detail="That topic no longer exists in this project.")
            module = plan[pos[0]]
            item = dict(module["sublessons"][pos[1]])
        else:
            if section_id:
                module = next((m for m in plan if m["id"] == section_id), None)
                if module is None:
                    conn.execute("ROLLBACK")
                    raise HTTPException(status_code=422, detail="That section is not part of this project.")
            else:
                module = qt.find_questions_section(plan)
                if module is None:
                    module = {
                        "id": "s-" + uuid.uuid4().hex[:12],
                        "kind": "questions",
                        "title": qt.USER_QUESTIONS_SECTION,
                        "focus": qt.USER_QUESTIONS_FOCUS,
                        "context": "",
                        "lesson_id": None,
                        "sublessons": [],
                        "videos": [],
                    }
                    plan.append(module)
            item = {
                "id": "q-" + uuid.uuid4().hex[:12],
                "kind": "question",
                "input_type": input_type,
                "original_input": user_input,
                "title": title,
                "focus": "",
                "context": "",
                "lesson_id": None,
                "sublessons": [],
                "videos": [],
                "version": 0,
                "created_at": now,
            }

        lesson_row = conn.execute("SELECT id FROM lms_lessons WHERE id = ?", (item.get("lesson_id") or "",)).fetchone()
        if lesson_row:
            conn.execute(
                "UPDATE lms_lessons SET title = ?, generated_html = ?, summary = ?, read_time_minutes = ?, updated_at = ? WHERE id = ?",
                (title, html, summary, minutes, now, lesson_row["id"]),
            )
            lesson_id = lesson_row["id"]
        else:
            lesson_id = f"lesson-{uuid.uuid4().hex[:8]}"
            base = slugify(title)
            slug, n = base, 1
            while conn.execute("SELECT 1 FROM lms_lessons WHERE slug = ?", (slug,)).fetchone():
                slug, n = f"{base}-{n}", n + 1
            order = conn.execute(
                "SELECT COALESCE(MAX(order_index), -1) + 1 FROM lms_lessons WHERE subject_id = ?", (project_id,)
            ).fetchone()[0]
            conn.execute(
                "INSERT INTO lms_lessons (id, class_id, subject_id, title, slug, order_index, source_type, source_content, "
                "generated_html, summary, read_time_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (lesson_id, cls_id, project_id, title, slug, order, "project-question", user_input, html, summary, minutes, now, now),
            )

        item.update(
            {"title": title, "lesson_id": lesson_id, "version": int(item.get("version") or 0) + 1, "updated_at": now}
        )
        if topic_id:
            module["sublessons"][pos[1]] = item  # type: ignore[index]
        else:
            module["sublessons"] = list(module.get("sublessons") or []) + [item]
        _save_plan(conn, project_id, plan)
        conn.execute(
            "UPDATE lms_topic_operations SET status = 'done', topic_id = ?, lesson_id = ?, error = NULL, updated_at = ? WHERE id = ?",
            (item["id"], lesson_id, now, op_id),
        )
        conn.execute("COMMIT")
        op.update({"status": "done", "topic_id": item["id"], "lesson_id": lesson_id})
        return {"op": op, "replayed": False}
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def _update(project_id: str, topic_id: str, title: Optional[str], section_id: Optional[str], base_version: Optional[int]):
    conn = _conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        plan = _load_plan(conn, project_id)
        pos = qt.find_topic(plan, topic_id)
        if pos is None:
            conn.execute("ROLLBACK")
            return 404, {"detail": "That topic no longer exists in this project."}
        mi, sj = pos
        item = dict(plan[mi]["sublessons"][sj])
        current = int(item.get("version") or 1)
        if base_version is not None and base_version != current:
            conn.execute("ROLLBACK")
            return 409, {
                "detail": "This topic was changed somewhere else since you opened it. Reload to see the latest version.",
                "topic": qt.topic_view(plan[mi], item),
            }
        changed = False
        if title is not None and title != item.get("title"):
            item["title"] = title
            changed = True
            if item.get("lesson_id"):
                conn.execute("UPDATE lms_lessons SET title = ?, updated_at = ? WHERE id = ?", (title, _now(), item["lesson_id"]))
        dest = mi
        if section_id is not None and section_id != plan[mi]["id"]:
            dest = next((i for i, m in enumerate(plan) if m["id"] == section_id), -1)
            if dest < 0:
                conn.execute("ROLLBACK")
                return 422, {"detail": "That section is not part of this project."}
            changed = True
        if changed:
            item["version"] = current + 1
            item["updated_at"] = _now()
            if dest == mi:
                plan[mi]["sublessons"][sj] = item
            else:
                plan[mi]["sublessons"] = [s for k, s in enumerate(plan[mi]["sublessons"]) if k != sj]
                plan[dest]["sublessons"] = list(plan[dest].get("sublessons") or []) + [item]  # appended: manual order stays
            _save_plan(conn, project_id, plan)
        conn.execute("COMMIT")
        return 200, {"topic": qt.topic_view(plan[dest], item)}
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def _delete(project_id: str, topic_id: str):
    conn = _conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        plan = _load_plan(conn, project_id)
        pos = qt.find_topic(plan, topic_id)
        if pos is None:
            conn.execute("ROLLBACK")
            return 404, {"detail": "That topic no longer exists in this project."}
        mi, sj = pos
        item = plan[mi]["sublessons"][sj]
        plan[mi]["sublessons"] = [s for k, s in enumerate(plan[mi]["sublessons"]) if k != sj]
        if item.get("lesson_id"):
            conn.execute("DELETE FROM lms_lessons WHERE id = ?", (item["lesson_id"],))
        _save_plan(conn, project_id, plan)
        conn.execute("COMMIT")
        return 200, {"status": "deleted", "id": topic_id}
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


# ── Request validation (same texts as the TS twin) ────────────────────────────────

def _valid_input(value: str) -> str:
    text = qt.clean_text(value, qt.INPUT_MAX + 1)
    if not text or len(text) > qt.INPUT_MAX:
        raise HTTPException(status_code=422, detail="Enter a question or topic (up to 2000 characters).")
    return text


def _valid_title(value: str) -> str:
    title = qt.clean_line(value, qt.TITLE_MAX + 1)
    if not title or len(title) > qt.TITLE_MAX:
        raise HTTPException(status_code=422, detail="Title is required (up to 120 characters).")
    return title


# ── Routes ────────────────────────────────────────────────────────────────────────

def register(router: APIRouter) -> None:
    @router.post("/projects/{project_id}/question-topics/preview")
    async def preview_question_topic(project_id: str, payload: PreviewRequest, user: dict = Depends(get_current_active_user)):
        cls, project = _project_or_404(project_id)
        _require_edit(user, cls)
        user_input = _valid_input(payload.input)
        plan = qt.ensure_ids(project.get("project_plan") or [])
        prompt = qt.build_preview_prompt(project, plan, user_input)
        try:
            raw = await run_in_threadpool(call_ai_text, prompt, payload, 1024, PREVIEW_TIMEOUT_S)
            parsed = qt.parse_json_object(raw)
        except Exception:
            raise HTTPException(
                status_code=502, detail="The AI could not suggest a title and section. Edit them yourself or try again."
            )
        return {**qt.normalize_preview(parsed, plan, user_input), "sections": qt.section_choices(plan)}

    @router.post("/projects/{project_id}/question-topics")
    async def generate_question_topic(
        project_id: str, payload: GenerateRequest, request: Request, user: dict = Depends(get_current_active_user)
    ):
        cls, project = _project_or_404(project_id)
        _require_edit(user, cls)
        if not OP_ID_RE.match(payload.operation_id or ""):
            raise HTTPException(status_code=422, detail="operation_id is required (8-64 letters, digits, - or _).")
        user_input = _valid_input(payload.input)
        title = _valid_title(payload.title)
        input_type = payload.input_type if payload.input_type in ("question", "topic") else qt.guess_input_type(user_input)
        section_id = (payload.section_id or "").strip()
        topic_id = (payload.topic_id or "").strip()
        guiding = qt.clean_line(payload.guiding_question, 300)

        plan = qt.ensure_ids(project.get("project_plan") or [])
        if topic_id:
            pos = qt.find_topic(plan, topic_id)
            if pos is None:
                raise HTTPException(status_code=404, detail="That topic no longer exists in this project.")
            section_title = plan[pos[0]].get("title") or ""
        elif section_id:
            module = next((m for m in plan if m["id"] == section_id), None)
            if module is None:
                raise HTTPException(status_code=422, detail="That section is not part of this project.")
            section_title = module.get("title") or ""
        else:
            section_title = qt.USER_QUESTIONS_SECTION

        req_hash = qt.request_hash(project_id, user_input, input_type, title, section_id, topic_id)
        body = payload.model_dump()
        replay = request_entry("POST", request.url.path, dict(request.headers), json.dumps(body).encode())
        state, op = await synced_write(
            "lab_ninja", lambda: _claim(payload.operation_id, project_id, user["id"], req_hash), replay
        )
        if state == "conflict":
            raise HTTPException(status_code=409, detail="This operation id was already used for a different request.")
        if state == "busy":
            return JSONResponse(
                status_code=409,
                content={"detail": "This lesson is still being generated.", "operation": {"id": op["id"], "status": "generating"}},
            )
        if state == "done":
            return _result(cls, project_id, op["topic_id"], op, True)

        prompt = qt.build_lesson_prompt(project, plan, section_title, user_input, input_type, title, guiding)
        lesson = None
        error = "The AI could not write this lesson. Your input is kept; try again."
        for attempt in range(2):
            try:
                raw = await run_in_threadpool(call_ai_text, prompt, payload, 8000, LESSON_TIMEOUT_S)
                lesson = qt.normalize_lesson(qt.parse_json_object(raw), input_type, guiding)
                break
            except qt.LessonShapeError as exc:
                error = str(exc)
                prompt = qt.build_lesson_prompt(project, plan, section_title, user_input, input_type, title, guiding) + (
                    f"\n\nYour previous reply was rejected: {error} Return the complete JSON object."
                )
            except Exception:
                error = "The AI could not write this lesson. Your input is kept; try again."
        if lesson is None:
            await synced_write("lab_ninja", lambda: _fail(payload.operation_id, error), None)
            raise HTTPException(status_code=502, detail=error)

        html = qt.render_lesson_html(lesson, title, user_input, input_type, project["name"], section_title, PREMIUM_DESIGN_TOKENS_CSS)
        saved = await synced_write(
            "lab_ninja",
            lambda: _commit(
                payload.operation_id, cls["id"], project_id, section_id, topic_id, title, user_input, input_type, html,
                qt.lesson_summary(lesson, title), qt.read_minutes(lesson),
            ),
            replay,
        )
        return _result(cls, project_id, saved["op"]["topic_id"], saved["op"], saved["replayed"])

    @router.get("/projects/{project_id}/question-topics/operations/{op_id}")
    async def get_question_topic_operation(project_id: str, op_id: str, user: dict = Depends(get_current_active_user)):
        cls, _project = _project_or_404(project_id)
        conn = _conn()
        try:
            row = conn.execute("SELECT * FROM lms_topic_operations WHERE id = ? AND project_id = ?", (op_id, project_id)).fetchone()
        finally:
            conn.close()
        if not row or (row["user_id"] != user["id"] and not has_permission(user, "ai_lms:edit")):
            raise HTTPException(status_code=404, detail="Operation not found.")
        if row["status"] == "done":
            return _result(cls, project_id, row["topic_id"], dict(row), True)
        return {"operation": {"id": row["id"], "status": row["status"], "error": row["error"]}}

    @router.patch("/projects/{project_id}/question-topics/{topic_id}")
    async def update_question_topic(
        project_id: str, topic_id: str, payload: UpdateRequest, user: dict = Depends(get_current_active_user)
    ):
        cls, _project = _project_or_404(project_id)
        _require_edit(user, cls)
        title = _valid_title(payload.title) if payload.title is not None else None
        section_id = payload.section_id.strip() if isinstance(payload.section_id, str) else None
        status, body = await run_in_threadpool(_update, project_id, topic_id, title, section_id, payload.base_version)
        if status != 200:
            return JSONResponse(status_code=status, content=body)
        _cls, project = _project_or_404(project_id)
        return {**body, "project": project}

    @router.delete("/projects/{project_id}/question-topics/{topic_id}")
    async def delete_question_topic(project_id: str, topic_id: str, user: dict = Depends(get_current_active_user)):
        cls, _project = _project_or_404(project_id)
        _require_edit(user, cls)
        status, body = await run_in_threadpool(_delete, project_id, topic_id)
        return body if status == 200 else JSONResponse(status_code=status, content=body)
