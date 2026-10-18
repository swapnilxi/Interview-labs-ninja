"""SQLite access for Labs Projects and their saved sections (see schema.py).

Every function takes the caller's `user_id` and scopes every query by it, and every section query is
also scoped by its project: a project or section that belongs to someone else (or to another project)
is simply "not found". That is the isolation guarantee the rest of the feature leans on.
"""

from __future__ import annotations

import re
import sqlite3
from typing import List, Optional

from modules.common.db import get_db_path

STATUSES = ("active", "archived")
EXCERPT_CHARS = 220


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def _project_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "context": row["context"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "sectionCount": row["section_count"],
    }


_PROJECT_SELECT = """
    SELECT p.id, p.name, p.description, p.context, p.status, p.created_at, p.updated_at,
           (SELECT COUNT(*) FROM lab_project_sections s WHERE s.project_id = p.id) AS section_count
    FROM lab_projects p
"""

_MARKDOWN_NOISE = re.compile(r"```[^\n]*\n|```|[*_`#>|]+")


def make_excerpt(content: str) -> str:
    """The first few words of a section, with the Markdown punctuation stripped, for list views."""
    flat = _MARKDOWN_NOISE.sub(" ", content)
    flat = re.sub(r"\s+", " ", flat).strip()
    return flat if len(flat) <= EXCERPT_CHARS else flat[: EXCERPT_CHARS - 1].rstrip() + "…"


def _section_row(row: sqlite3.Row, *, with_content: bool) -> dict:
    out = {
        "id": row["id"],
        "projectId": row["project_id"],
        "title": row["title"],
        "sourceLabId": row["source_lab_id"],
        "sourceLabName": row["source_lab_name"],
        "sourceGenerationId": row["source_generation_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "excerpt": make_excerpt(row["content"]),
    }
    if with_content:
        out["content"] = row["content"]
    return out


# ── Projects ──────────────────────────────────────────────────────────────────


def list_projects(user_id: int, status: str = "all") -> List[dict]:
    conn = _connect()
    try:
        where, args = "WHERE p.user_id = ?", [user_id]
        if status in STATUSES:
            where += " AND p.status = ?"
            args.append(status)
        rows = conn.execute(f"{_PROJECT_SELECT} {where} ORDER BY p.updated_at DESC, p.id DESC", args).fetchall()
        return [_project_row(r) for r in rows]
    finally:
        conn.close()


def get_project(user_id: int, project_id: int) -> Optional[dict]:
    conn = _connect()
    try:
        row = conn.execute(f"{_PROJECT_SELECT} WHERE p.user_id = ? AND p.id = ?", (user_id, project_id)).fetchone()
        return _project_row(row) if row else None
    finally:
        conn.close()


def create_project(user_id: int, name: str, description: str, context: str) -> dict:
    conn = _connect()
    try:
        cur = conn.execute(
            "INSERT INTO lab_projects (user_id, name, description, context) VALUES (?, ?, ?, ?)",
            (user_id, name, description, context),
        )
        conn.commit()
        project_id = cur.lastrowid
    finally:
        conn.close()
    return get_project(user_id, project_id)  # type: ignore[arg-type]


def update_project(user_id: int, project_id: int, changes: dict) -> Optional[dict]:
    """Apply `changes` (any of name, description, context, status). None if the project isn't the user's.

    Only the project row changes: its saved sections are separate rows and are never touched.
    """
    allowed = {k: v for k, v in changes.items() if k in ("name", "description", "context", "status")}
    conn = _connect()
    try:
        if allowed:
            sets = ", ".join(f"{k} = ?" for k in allowed)
            cur = conn.execute(
                f"UPDATE lab_projects SET {sets}, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
                [*allowed.values(), project_id, user_id],
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
    finally:
        conn.close()
    return get_project(user_id, project_id)


def delete_project(user_id: int, project_id: int) -> Optional[int]:
    """Delete a project and every section saved to it. Returns how many sections went, None if not found.

    Lab pages that were generated for the project keep their text and their (now dangling) project id,
    which is never reused, so that text is never revised or quoted by a generation for anything else.
    """
    conn = _connect()
    try:
        owned = conn.execute("SELECT 1 FROM lab_projects WHERE id = ? AND user_id = ?", (project_id, user_id)).fetchone()
        if not owned:
            return None
        deleted = conn.execute(
            "DELETE FROM lab_project_sections WHERE project_id = ? AND user_id = ?", (project_id, user_id)
        ).rowcount
        conn.execute("DELETE FROM lab_projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        conn.commit()
        return deleted
    finally:
        conn.close()


# ── Sections ──────────────────────────────────────────────────────────────────


def list_sections(user_id: int, project_id: int, q: str = "", lab: str = "") -> List[dict]:
    """A project's sections, newest first. `q` matches the title or the content, `lab` the source lab."""
    conn = _connect()
    try:
        where, args = "WHERE project_id = ? AND user_id = ?", [project_id, user_id]
        needle = q.strip()
        if needle:
            where += " AND (instr(lower(title), lower(?)) > 0 OR instr(lower(content), lower(?)) > 0)"
            args += [needle, needle]
        if lab:
            where += " AND source_lab_id = ?"
            args.append(lab)
        rows = conn.execute(
            f"SELECT * FROM lab_project_sections {where} ORDER BY updated_at DESC, id DESC", args
        ).fetchall()
        return [_section_row(r, with_content=False) for r in rows]
    finally:
        conn.close()


def list_sections_with_content(user_id: int, project_id: int) -> List[dict]:
    """Every section of the project including its text, newest first (the retrieval corpus)."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT * FROM lab_project_sections WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC, id DESC",
            (project_id, user_id),
        ).fetchall()
        return [_section_row(r, with_content=True) for r in rows]
    finally:
        conn.close()


def get_section(user_id: int, project_id: int, section_id: int) -> Optional[dict]:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT * FROM lab_project_sections WHERE id = ? AND project_id = ? AND user_id = ?",
            (section_id, project_id, user_id),
        ).fetchone()
        return _section_row(row, with_content=True) if row else None
    finally:
        conn.close()


def create_section(
    user_id: int,
    project_id: int,
    title: str,
    content: str,
    source_lab_id: str,
    source_lab_name: str,
    source_generation_id: Optional[str],
) -> dict:
    conn = _connect()
    try:
        cur = conn.execute(
            """
            INSERT INTO lab_project_sections
                (project_id, user_id, title, content, source_lab_id, source_lab_name, source_generation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (project_id, user_id, title, content, source_lab_id, source_lab_name, source_generation_id),
        )
        # Saving into a project is activity on it, so it floats to the top of the user's list.
        conn.execute(
            "UPDATE lab_projects SET updated_at = datetime('now') WHERE id = ? AND user_id = ?", (project_id, user_id)
        )
        conn.commit()
        section_id = cur.lastrowid
    finally:
        conn.close()
    return get_section(user_id, project_id, section_id)  # type: ignore[arg-type]


def update_section(user_id: int, project_id: int, section_id: int, changes: dict) -> Optional[dict]:
    allowed = {k: v for k, v in changes.items() if k in ("title", "content")}
    conn = _connect()
    try:
        if allowed:
            sets = ", ".join(f"{k} = ?" for k in allowed)
            cur = conn.execute(
                f"UPDATE lab_project_sections SET {sets}, updated_at = datetime('now') "
                "WHERE id = ? AND project_id = ? AND user_id = ?",
                [*allowed.values(), section_id, project_id, user_id],
            )
            conn.commit()
            if cur.rowcount == 0:
                return None
    finally:
        conn.close()
    return get_section(user_id, project_id, section_id)


def delete_section(user_id: int, project_id: int, section_id: int) -> bool:
    conn = _connect()
    try:
        cur = conn.execute(
            "DELETE FROM lab_project_sections WHERE id = ? AND project_id = ? AND user_id = ?",
            (section_id, project_id, user_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
