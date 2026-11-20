"""AI Interactive Workbooks: the third kind of content in a class, beside Subjects and Projects.

A workbook turns a book, chapter, PDF, Word file or pasted text into chapters of interactive exercises. The template
(`lms_workbooks.content_json`, written by the AI and then editable) is shared; every learner's answers and progress live
in their own `lms_workbook_progress` row and are never returned to anyone else, instructors and admins included.

Who sees what (checked here, never only in the browser):
- `private` workbook: its owner only. Any signed-in user may create one in any class they can open.
- `class` workbook (public): everyone who opens the class once it is `published`; instructors (the `ai_lms:edit`
  permission) also see its drafts and archived copies, and may edit it. Only an instructor may make a workbook public.
- A workbook someone may not see is a 404, never a 403, so its existence does not leak.

Twin: frontend/fe-apis/lms/workbooks.ts (nextjs-api mode). Same tables, limits, validation texts and status codes, so
change both. No FastAPI import on purpose: the router only turns `WorkbookError` into an HTTPException, and this module
runs against a database copy with a bare interpreter (backend/tests/lms_workbooks_test.py).
"""

from __future__ import annotations

import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional

from modules.common.db import get_db_path

from . import workbook_gen

VISIBILITIES = ("private", "class")
STATUSES = ("draft", "published", "archived")

TITLE_MAX = 120
DESCRIPTION_MAX = 1000
INSTRUCTIONS_MAX = 4000
SOURCE_NAME_MAX = 200
# About a 400-page book. Only slices of it are ever sent to the AI (one chapter's chunks per call).
SOURCE_MAX = 1_000_000
ICON_MAX = 40
DEFAULT_ICON = "BookOpenIcon"

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
_ICON_OK = re.compile(r"[A-Za-z0-9]+")

# Fields a summary (the class page's list) carries; the full read adds the template and, for an editor of the
# workbook, the source text and the generation instructions.
_SUMMARY_COLUMNS = (
    "id, class_id, owner_id, title, description, icon, source_name, visibility, status, template_version, "
    "content_json, created_at, updated_at"
)


class WorkbookError(Exception):
    """A request the caller can fix. `status_code` and `detail` go straight into the HTTP response."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# ── Schema ─────────────────────────────────────────────────────────────────────


def ensure_tables(cursor: sqlite3.Cursor) -> None:
    """CREATE TABLE IF NOT EXISTS for the workbook tables. Called from init_lms_db and before every query here."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lms_workbooks (
            id TEXT PRIMARY KEY,
            class_id TEXT NOT NULL,
            owner_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT 'BookOpenIcon',
            source_name TEXT NOT NULL DEFAULT '',
            source_text TEXT NOT NULL DEFAULT '',
            instructions TEXT NOT NULL DEFAULT '',
            content_json TEXT NOT NULL DEFAULT '',
            visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'class')),
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
            template_version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_workbooks_class ON lms_workbooks(class_id, visibility, status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_workbooks_owner ON lms_workbooks(owner_id);")
    # One learner's private workspace in one workbook: answers, ticks, XP ledger, last section. Only ever read with
    # `user_id = <the caller>`. `version` is what a save must quote, so a second tab cannot overwrite newer answers.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lms_workbook_progress (
            workbook_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            state_json TEXT NOT NULL DEFAULT '{}',
            summary_json TEXT NOT NULL DEFAULT '{}',
            version INTEGER NOT NULL DEFAULT 1,
            started_at TEXT NOT NULL,
            last_accessed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workbook_id, user_id)
        );
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lms_workbook_progress_user ON lms_workbook_progress(user_id);")


def purge_class(cursor: sqlite3.Cursor, class_id: str) -> None:
    """A deleted class takes its workbooks and everyone's progress in them with it (no FOREIGN KEY on these)."""
    ensure_tables(cursor)
    cursor.execute(
        "DELETE FROM lms_workbook_progress WHERE workbook_id IN (SELECT id FROM lms_workbooks WHERE class_id = ?)",
        (class_id,),
    )
    cursor.execute("DELETE FROM lms_workbooks WHERE class_id = ?", (class_id,))


# ── Helpers ────────────────────────────────────────────────────────────────────


def now_iso() -> str:
    """YYYY-MM-DDTHH:MM:SS.mmmZ: the text JavaScript's toISOString() gives, so both twins store the same shape."""
    moment = datetime.now(timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        ensure_tables(conn.cursor())
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _resolve_class(conn: sqlite3.Connection, id_or_slug: str) -> Dict[str, str]:
    row = conn.execute("SELECT id, slug, name FROM lms_classes WHERE id = ? OR slug = ?", (id_or_slug, id_or_slug)).fetchone()
    if row is None:
        raise WorkbookError(404, "Class not found.")
    return {"id": row["id"], "slug": row["slug"], "name": row["name"]}


def clean_line(value: str) -> str:
    """One line: line breaks and tabs become spaces, other control characters go, the ends are trimmed."""
    return _CONTROL.sub("", re.sub(r"[\r\n\t]+", " ", value)).strip()


def clean_text(value: str) -> str:
    """Line breaks stay (as \\n) and so do tabs; other control characters go; the ends are trimmed."""
    return _CONTROL.sub("", re.sub(r"\r\n?", "\n", value)).strip()


def _text_field(payload: Dict[str, Any], key: str, label: str, limit: int, multiline: bool) -> Optional[str]:
    """The cleaned value of an optional text field, or None when the payload does not carry it."""
    if key not in payload or payload[key] is None:
        return None
    raw = payload[key]
    if not isinstance(raw, str):
        raise WorkbookError(422, f"{label} must be text.")
    value = clean_text(raw) if multiline else clean_line(raw)
    if len(value) > limit:
        raise WorkbookError(422, f"{label} can be at most {limit:,} characters.")
    return value


def _icon(payload: Dict[str, Any]) -> Optional[str]:
    if "icon" not in payload or payload["icon"] is None:
        return None
    raw = payload["icon"]
    if not isinstance(raw, str) or len(raw) > ICON_MAX or (raw and not _ICON_OK.fullmatch(raw)):
        raise WorkbookError(422, "Icon must be an icon name.")
    return raw or DEFAULT_ICON


def _choice(payload: Dict[str, Any], key: str, allowed: tuple, message: str) -> Optional[str]:
    if key not in payload or payload[key] is None:
        return None
    if payload[key] not in allowed:
        raise WorkbookError(422, message)
    return payload[key]


def _parse_content(raw: str) -> Optional[Dict[str, Any]]:
    """The stored template, or None while nothing is generated yet (or the stored text is unreadable)."""
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _whole(value: Any) -> bool:
    """A JSON whole number (true/false are not numbers here, as in the TypeScript twin)."""
    return isinstance(value, int) and not isinstance(value, bool)


def _whole_number(value: Any) -> Optional[int]:
    """A JSON whole number as int, else None (15.0 counts: JavaScript reads it as 15; true does not)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _section_count(content: Optional[Dict[str, Any]]) -> int:
    sections = (content or {}).get("sections")
    return len(sections) if isinstance(sections, list) else 0


def _sections(content: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sections = (content or {}).get("sections")
    return [item for item in sections if isinstance(item, dict)] if isinstance(sections, list) else []


def _all_written(content: Optional[Dict[str, Any]]) -> bool:
    """True when the workbook has chapters and every one of them is written (what publishing needs)."""
    sections = _sections(content)
    return bool(sections) and all(item.get("status") == "ready" for item in sections)


def _dump(content: Dict[str, Any]) -> str:
    """The stored JSON text, spelled the way JavaScript's JSON.stringify spells it."""
    return json.dumps(content, ensure_ascii=False, separators=(",", ":"))


def _can_view(row: sqlite3.Row, user_id: int, is_editor: bool) -> bool:
    if row["owner_id"] == user_id:
        return True
    if row["visibility"] != "class":
        return False
    return row["status"] == "published" or is_editor


def _can_edit(row: sqlite3.Row, user_id: int, is_editor: bool) -> bool:
    return row["owner_id"] == user_id or (is_editor and row["visibility"] == "class")


def _load(conn: sqlite3.Connection, workbook_id: str, user_id: int, is_editor: bool) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM lms_workbooks WHERE id = ?", (workbook_id,)).fetchone()
    if row is None or not _can_view(row, user_id, is_editor):
        raise WorkbookError(404, "Workbook not found.")
    return row


def _summary(conn: sqlite3.Connection, row: sqlite3.Row, user_id: int, is_editor: bool) -> Dict[str, Any]:
    content = _parse_content(row["content_json"])
    minutes = (content or {}).get("estimated_minutes")
    mine = conn.execute(
        "SELECT summary_json, last_accessed_at FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?",
        (row["id"], user_id),
    ).fetchone()
    progress = None
    if mine is not None:
        try:
            summary = json.loads(mine["summary_json"] or "{}")
        except ValueError:
            summary = {}
        percent = summary.get("percent") if isinstance(summary, dict) else None
        progress = {
            "percent": percent if _whole(percent) and 0 <= percent <= 100 else 0,
            "last_accessed_at": mine["last_accessed_at"],
        }
    return {
        "id": row["id"],
        "class_id": row["class_id"],
        "title": row["title"],
        "description": row["description"],
        "icon": row["icon"],
        "source_name": row["source_name"],
        "visibility": row["visibility"],
        "status": row["status"],
        "template_version": row["template_version"],
        "section_count": _section_count(content),
        "estimated_minutes": minutes if _whole(minutes) and minutes > 0 else None,
        "is_owner": row["owner_id"] == user_id,
        "can_edit": _can_edit(row, user_id, is_editor),
        "my_progress": progress,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _full(conn: sqlite3.Connection, workbook_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    row = _load(conn, workbook_id, user_id, is_editor)
    view = _summary(conn, row, user_id, is_editor)
    cls = conn.execute("SELECT slug, name FROM lms_classes WHERE id = ?", (row["class_id"],)).fetchone()
    view["class_slug"] = cls["slug"] if cls else ""
    view["class_name"] = cls["name"] if cls else ""
    view["content"] = _parse_content(row["content_json"])
    # The book's own text and the generation instructions are an editor's working material, not a learner's page.
    if view["can_edit"]:
        view["source_text"] = row["source_text"]
        view["instructions"] = row["instructions"]
    return view


# ── Endpoints' logic ───────────────────────────────────────────────────────────


def list_workbooks(class_id_or_slug: str, user_id: int, is_editor: bool) -> List[Dict[str, Any]]:
    """The workbooks of a class this user may see: their own (any state) first, then the class's, newest first."""
    with _db() as conn:
        cls = _resolve_class(conn, class_id_or_slug)
        rows = conn.execute(
            f"SELECT {_SUMMARY_COLUMNS} FROM lms_workbooks WHERE class_id = ? "
            "AND (owner_id = ? OR (visibility = 'class' AND (status = 'published' OR ? = 1))) "
            "ORDER BY CASE WHEN owner_id = ? THEN 0 ELSE 1 END, updated_at DESC, id",
            (cls["id"], user_id, 1 if is_editor else 0, user_id),
        ).fetchall()
        return [_summary(conn, row, user_id, is_editor) for row in rows]


def create_workbook(class_id_or_slug: str, user_id: int, is_editor: bool, payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise WorkbookError(422, "Send the workbook as a JSON object.")
    title = _text_field(payload, "title", "Title", TITLE_MAX, False)
    if not title:
        raise WorkbookError(422, "Give the workbook a title.")
    description = _text_field(payload, "description", "Description", DESCRIPTION_MAX, True) or ""
    instructions = _text_field(payload, "instructions", "Instructions", INSTRUCTIONS_MAX, True) or ""
    source_name = _text_field(payload, "source_name", "Source name", SOURCE_NAME_MAX, False) or ""
    source_text = _text_field(payload, "source_text", "Source text", SOURCE_MAX, True) or ""
    if not source_text:
        raise WorkbookError(422, "Add the learning material: upload a file or paste the text.")
    icon = _icon(payload) or DEFAULT_ICON
    visibility = _choice(payload, "visibility", VISIBILITIES, "Visibility must be 'private' or 'class'.") or "private"
    if visibility == "class" and not is_editor:
        raise WorkbookError(403, "Only an instructor or admin can share a workbook with the class.")

    with _db() as conn:
        cls = _resolve_class(conn, class_id_or_slug)
        workbook_id = f"wb-{uuid.uuid4().hex[:12]}"
        stamp = now_iso()
        conn.execute(
            "INSERT INTO lms_workbooks (id, class_id, owner_id, title, description, icon, source_name, source_text, "
            "instructions, content_json, visibility, status, template_version, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 'draft', 1, ?, ?)",
            (workbook_id, cls["id"], user_id, title, description, icon, source_name, source_text, instructions,
             visibility, stamp, stamp),
        )
        return _full(conn, workbook_id, user_id, is_editor)


def get_workbook(workbook_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    with _db() as conn:
        return _full(conn, workbook_id, user_id, is_editor)


def update_workbook(workbook_id: str, user_id: int, is_editor: bool, payload: Any) -> Dict[str, Any]:
    """Change the details, the source, the visibility or the status. Fields left out stay as they are."""
    if not isinstance(payload, dict):
        raise WorkbookError(422, "Send the changes as a JSON object.")
    changes: Dict[str, Any] = {}
    title = _text_field(payload, "title", "Title", TITLE_MAX, False)
    if title is not None:
        if not title:
            raise WorkbookError(422, "Give the workbook a title.")
        changes["title"] = title
    for key, label, limit, multiline in (
        ("description", "Description", DESCRIPTION_MAX, True),
        ("instructions", "Instructions", INSTRUCTIONS_MAX, True),
        ("source_name", "Source name", SOURCE_NAME_MAX, False),
    ):
        value = _text_field(payload, key, label, limit, multiline)
        if value is not None:
            changes[key] = value
    source_text = _text_field(payload, "source_text", "Source text", SOURCE_MAX, True)
    if source_text is not None:
        if not source_text:
            raise WorkbookError(422, "Add the learning material: upload a file or paste the text.")
        changes["source_text"] = source_text
    icon = _icon(payload)
    if icon is not None:
        changes["icon"] = icon
    visibility = _choice(payload, "visibility", VISIBILITIES, "Visibility must be 'private' or 'class'.")
    status = _choice(payload, "status", STATUSES, "Status must be 'draft', 'published' or 'archived'.")

    with _db() as conn:
        row = _load(conn, workbook_id, user_id, is_editor)
        if not _can_edit(row, user_id, is_editor):
            raise WorkbookError(403, "You can't change this workbook.")
        if visibility is not None and visibility != row["visibility"]:
            if visibility == "class" and not is_editor:
                raise WorkbookError(403, "Only an instructor or admin can share a workbook with the class.")
            changes["visibility"] = visibility
        if status is not None and status != row["status"]:
            # Publishing or archiving a shared workbook changes what the whole class sees.
            if (visibility or row["visibility"]) == "class" and not is_editor:
                raise WorkbookError(403, "Only an instructor or admin can share a workbook with the class.")
            if status == "published" and not _all_written(_parse_content(row["content_json"])):
                raise WorkbookError(409, "Write every chapter before publishing.")
            changes["status"] = status
        if changes:
            changes["updated_at"] = now_iso()
            assignments = ", ".join(f"{key} = ?" for key in changes)
            conn.execute(f"UPDATE lms_workbooks SET {assignments} WHERE id = ?", (*changes.values(), row["id"]))
        return _full(conn, row["id"], user_id, is_editor)


def delete_workbook(workbook_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    """Delete a workbook and every learner's progress in it."""
    with _db() as conn:
        row = _load(conn, workbook_id, user_id, is_editor)
        if not _can_edit(row, user_id, is_editor):
            raise WorkbookError(403, "You can't change this workbook.")
        conn.execute("DELETE FROM lms_workbook_progress WHERE workbook_id = ?", (row["id"],))
        conn.execute("DELETE FROM lms_workbooks WHERE id = ?", (row["id"],))
        return {"deleted": True, "id": row["id"]}


# ── Generation (the AI call itself is the router's; these prepare it and store its cleaned answer) ───────────────
#
# Both steps are split around the AI call so no database connection is held while the model writes: `*_job` checks
# the caller and returns the prompt, the router runs it, `save_*` checks again and stores the normalized answer.
# Only someone who may edit the workbook may generate it. A published workbook is what learners are working through,
# so it is never re-planned or rewritten in place: move it back to draft first.

_PUBLISHED_OUTLINE = "Move the workbook back to draft before planning its chapters again."
_PUBLISHED_SECTION = "Move the workbook back to draft before rewriting a chapter."


def _editable(conn: sqlite3.Connection, workbook_id: str, user_id: int, is_editor: bool) -> sqlite3.Row:
    row = _load(conn, workbook_id, user_id, is_editor)
    if not _can_edit(row, user_id, is_editor):
        raise WorkbookError(403, "You can't change this workbook.")
    return row


def _parts(row: sqlite3.Row) -> List[str]:
    parts = workbook_gen.split_source(row["source_text"] or "")
    if not parts:
        raise WorkbookError(422, "Add the learning material: upload a file or paste the text.")
    return parts


def outline_job(workbook_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    """The prompt that plans the chapters (step 1 of generating a workbook)."""
    with _db() as conn:
        row = _editable(conn, workbook_id, user_id, is_editor)
        if row["status"] == "published":
            raise WorkbookError(409, _PUBLISHED_OUTLINE)
        parts = _parts(row)
        prompt = workbook_gen.build_outline_prompt(row["title"], row["description"], row["instructions"], parts)
        return {"prompt": prompt, "max_tokens": workbook_gen.MAX_TOKENS["outline"]}


def save_outline(workbook_id: str, user_id: int, is_editor: bool, parsed: Any) -> Dict[str, Any]:
    """Store a new outline: every chapter pending, the template version moved on (so a chapter still being written
    for the previous outline is refused when it comes back)."""
    with _db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = _editable(conn, workbook_id, user_id, is_editor)
        if row["status"] == "published":
            raise WorkbookError(409, _PUBLISHED_OUTLINE)
        try:
            content = workbook_gen.normalize_outline(parsed, len(_parts(row)))
        except workbook_gen.GenerationError as err:
            raise WorkbookError(err.status_code, err.detail) from None
        conn.execute(
            "UPDATE lms_workbooks SET content_json = ?, template_version = template_version + 1, updated_at = ? "
            "WHERE id = ?",
            (_dump(content), now_iso(), row["id"]),
        )
        return _full(conn, row["id"], user_id, is_editor)


def _find_section(content: Optional[Dict[str, Any]], section_id: str) -> int:
    for position, item in enumerate(_sections(content)):
        if item.get("id") == section_id:
            return position
    raise WorkbookError(404, "Chapter not found.")


def section_job(workbook_id: str, section_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    """The prompt that writes one chapter (step 2, once per chapter), and the template version it belongs to."""
    with _db() as conn:
        row = _editable(conn, workbook_id, user_id, is_editor)
        content = _parse_content(row["content_json"])
        index = _find_section(content, section_id)
        sections = _sections(content)
        if row["status"] == "published":
            raise WorkbookError(409, _PUBLISHED_SECTION)
        parts = _parts(row)
        section = sections[index]
        start, end = section.get("from"), section.get("to")
        if not (_whole(start) and _whole(end) and 1 <= start <= end <= len(parts)):
            raise WorkbookError(409, "The learning material changed since the chapters were planned. Plan them again.")
        material, was_cut = workbook_gen.section_material(parts, start, end)
        prompt = workbook_gen.build_section_prompt(
            row["title"], row["description"], row["instructions"], sections, index, material, was_cut
        )
        return {
            "prompt": prompt,
            "max_tokens": workbook_gen.MAX_TOKENS["section"],
            "template_version": row["template_version"],
        }


def save_section(
    workbook_id: str, section_id: str, user_id: int, is_editor: bool, template_version: int, parsed: Any
) -> Dict[str, Any]:
    """Store one written chapter, unless the chapters were planned again while it was being written."""
    try:
        blocks = workbook_gen.normalize_section(parsed, section_id)
    except workbook_gen.GenerationError as err:
        raise WorkbookError(err.status_code, err.detail) from None
    with _db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = _editable(conn, workbook_id, user_id, is_editor)
        if row["template_version"] != template_version:
            raise WorkbookError(409, "The chapters were planned again while this one was being written. Write it again.")
        if row["status"] == "published":
            raise WorkbookError(409, _PUBLISHED_SECTION)
        content = _parse_content(row["content_json"]) or {}
        index = _find_section(content, section_id)
        sections = content["sections"]
        position = [i for i, item in enumerate(sections) if isinstance(item, dict)][index]
        sections[position] = {**sections[position], "status": "ready", "blocks": blocks}
        conn.execute(
            "UPDATE lms_workbooks SET content_json = ?, updated_at = ? WHERE id = ?",
            (_dump(content), now_iso(), row["id"]),
        )
        return _full(conn, row["id"], user_id, is_editor)


# ── Learner progress (each learner's own private workspace) ────────────────────
#
# One JSON document per (workbook, learner) that the browser owns: answers, ticks, quiz attempts, the last chapter
# opened and a `done` map of block ids. It is only ever read or written with `user_id = <the caller>`; the one
# exception is the instructors' learner list, which gets names, percentages and dates computed here and never the
# document. A save must quote the version it loaded, so a second tab or device holding an older copy is refused
# (409) instead of overwriting newer answers. The percentage is counted here from `done` and the workbook's current
# blocks, so a stale or hand-made document cannot claim blocks that do not exist.

STATE_MAX = 400_000
_LEARNER_ID = re.compile(r"[1-9][0-9]{0,11}")
_STALE = "Your answers were changed in another tab or on another device. Reload to get the latest."
_NOT_INSTRUCTOR = "Only an instructor or admin can see who is working through this workbook."
_NO_LEARNER = "This learner has no progress in this workbook."


def _block_ids(content: Optional[Dict[str, Any]]) -> List[str]:
    ids: List[str] = []
    for section in _sections(content):
        if section.get("status") != "ready" or not isinstance(section.get("blocks"), list):
            continue
        for block in section["blocks"]:
            if isinstance(block, dict) and isinstance(block.get("id"), str):
                ids.append(block["id"])
    return ids


def _progress_summary(content: Optional[Dict[str, Any]], state: Any) -> Dict[str, int]:
    ids = _block_ids(content)
    done_map = state.get("done") if isinstance(state, dict) else None
    done = sum(1 for block_id in ids if isinstance(done_map, dict) and done_map.get(block_id) is True)
    total = len(ids)
    return {"percent": (100 * done) // total if total else 0, "done": done, "total": total}


def _state_of(raw: Any) -> Dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _progress_view(row: sqlite3.Row, mine: Optional[sqlite3.Row]) -> Dict[str, Any]:
    content = _parse_content(row["content_json"])
    state = _state_of(mine["state_json"]) if mine is not None else {}
    return {
        "workbook_id": row["id"],
        "state": state,
        "version": mine["version"] if mine is not None else 0,
        "template_version": row["template_version"],
        "summary": _progress_summary(content, state),
        "started_at": mine["started_at"] if mine is not None else None,
        "last_accessed_at": mine["last_accessed_at"] if mine is not None else None,
    }


def _mine(conn: sqlite3.Connection, workbook_id: str, user_id: int) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?", (workbook_id, user_id)
    ).fetchone()


def get_progress(workbook_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    """The caller's own answers and progress (an empty document and version 0 before they start)."""
    with _db() as conn:
        row = _load(conn, workbook_id, user_id, is_editor)
        return _progress_view(row, _mine(conn, row["id"], user_id))


def save_progress(workbook_id: str, user_id: int, is_editor: bool, payload: Any) -> Dict[str, Any]:
    """Replace the caller's document, if `version` is the one stored (0 = nothing saved yet)."""
    if not isinstance(payload, dict):
        raise WorkbookError(422, "Send your answers as a JSON object.")
    version = _whole_number(payload.get("version"))
    if version is None or version < 0:
        raise WorkbookError(422, "Send the version you loaded.")
    state = payload.get("state")
    if not isinstance(state, dict):
        raise WorkbookError(422, "Send your answers as a JSON object.")
    text = _dump(state)
    if len(text) > STATE_MAX:
        raise WorkbookError(413, "Your answers are too large to save.")

    with _db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = _load(conn, workbook_id, user_id, is_editor)
        content = _parse_content(row["content_json"])
        if not _block_ids(content):
            raise WorkbookError(409, "This workbook has no written chapters yet.")
        mine = _mine(conn, row["id"], user_id)
        if (mine["version"] if mine is not None else 0) != version:
            raise WorkbookError(409, _STALE)
        stamp = now_iso()
        summary = _dump(_progress_summary(content, state))
        if mine is None:
            conn.execute(
                "INSERT INTO lms_workbook_progress (workbook_id, user_id, state_json, summary_json, version, "
                "started_at, last_accessed_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
                (row["id"], user_id, text, summary, stamp, stamp, stamp),
            )
        else:
            conn.execute(
                "UPDATE lms_workbook_progress SET state_json = ?, summary_json = ?, version = version + 1, "
                "last_accessed_at = ?, updated_at = ? WHERE workbook_id = ? AND user_id = ?",
                (text, summary, stamp, stamp, row["id"], user_id),
            )
        return _progress_view(row, _mine(conn, row["id"], user_id))


def reset_progress(workbook_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    """Delete the caller's own answers and progress in this workbook (nobody else's)."""
    with _db() as conn:
        row = _load(conn, workbook_id, user_id, is_editor)
        conn.execute("DELETE FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?", (row["id"], user_id))
        return _progress_view(row, None)


def _instructor_row(conn: sqlite3.Connection, workbook_id: str, user_id: int, is_editor: bool) -> sqlite3.Row:
    row = _load(conn, workbook_id, user_id, is_editor)
    if not (is_editor and row["visibility"] == "class"):
        raise WorkbookError(403, _NOT_INSTRUCTOR)
    return row


def list_learners(workbook_id: str, user_id: int, is_editor: bool) -> List[Dict[str, Any]]:
    """Who has started a class workbook: name, percentage and dates only. Never anyone's answers."""
    with _db() as conn:
        row = _instructor_row(conn, workbook_id, user_id, is_editor)
        content = _parse_content(row["content_json"])
        rows = conn.execute(
            "SELECT p.user_id, p.state_json, p.started_at, p.last_accessed_at, u.display_name, u.email "
            "FROM lms_workbook_progress p LEFT JOIN users u ON u.id = p.user_id "
            "WHERE p.workbook_id = ? ORDER BY p.last_accessed_at DESC, p.user_id",
            (row["id"],),
        ).fetchall()
        out = []
        for item in rows:
            name = clean_line(item["display_name"] or "") or clean_line(item["email"] or "") or f"Learner {item['user_id']}"
            out.append(
                {
                    "user_id": item["user_id"],
                    "name": name,
                    **_progress_summary(content, _state_of(item["state_json"])),
                    "started_at": item["started_at"],
                    "last_accessed_at": item["last_accessed_at"],
                }
            )
        return out


def reset_learner(workbook_id: str, learner_id: str, user_id: int, is_editor: bool) -> Dict[str, Any]:
    """An instructor resets one learner's progress in a class workbook. Every other learner's stays as it is."""
    with _db() as conn:
        row = _instructor_row(conn, workbook_id, user_id, is_editor)
        if not _LEARNER_ID.fullmatch(learner_id or ""):
            raise WorkbookError(404, _NO_LEARNER)
        deleted = conn.execute(
            "DELETE FROM lms_workbook_progress WHERE workbook_id = ? AND user_id = ?", (row["id"], int(learner_id))
        ).rowcount
        if not deleted:
            raise WorkbookError(404, _NO_LEARNER)
        return {"reset": True, "user_id": int(learner_id)}



# ── "Explain this to me" (nothing is saved) ────────────────────────────────────


def explain_job(workbook_id: str, user_id: int, is_editor: bool, payload: Any) -> Dict[str, Any]:
    """The prompt that explains one block of a written chapter again, for anyone who can see the workbook."""
    if not isinstance(payload, dict):
        raise WorkbookError(422, "Send the request as a JSON object.")
    block_id = payload.get("block_id")
    question = payload.get("question")
    if question is not None and not isinstance(question, str):
        raise WorkbookError(422, "Question must be text.")
    question = clean_line(question or "")
    if len(question) > workbook_gen.EXPLAIN_QUESTION_MAX:
        raise WorkbookError(422, f"Question can be at most {workbook_gen.EXPLAIN_QUESTION_MAX:,} characters.")
    with _db() as conn:
        row = _load(conn, workbook_id, user_id, is_editor)
        for section in _sections(_parse_content(row["content_json"])):
            if section.get("status") != "ready" or not isinstance(section.get("blocks"), list):
                continue
            for block in section["blocks"]:
                if isinstance(block, dict) and isinstance(block_id, str) and block.get("id") == block_id:
                    prompt = workbook_gen.build_explain_prompt(row["title"], section.get("title") or "", block, question)
                    return {"prompt": prompt, "max_tokens": workbook_gen.MAX_TOKENS["explain"]}
        raise WorkbookError(404, "That part of the workbook was not found.")
