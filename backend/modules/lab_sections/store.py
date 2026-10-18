"""SQLite access for saved lab-section content (see schema.py)."""

from __future__ import annotations

import json
import sqlite3
from typing import Dict, List, Optional

from modules.common.db import get_db_path


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "content": row["content"],
        "context": row["context"],
        "mode": row["mode"],
        "updatedAt": row["updated_at"],
        # The Labs Project this body was written for (None = no project).
        "projectId": row["project_id"],
    }


def fetch_section_project(user_id: int, lab: str, topic_id: str, subtopic_id: str, section_id: str) -> tuple:
    """(saved?, project_id) of the stored body for one page-section; project_id is None for a general one."""
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute(
            """
            SELECT project_id FROM lab_section_content
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND section_id = ?
            """,
            (user_id, lab, topic_id, subtopic_id, section_id),
        ).fetchone()
        return (True, row[0]) if row else (False, None)
    finally:
        conn.close()


def fetch_saved_sections(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> Dict[str, dict]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT section_id, content, context, mode, updated_at, project_id
            FROM lab_section_content
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
            """,
            (user_id, lab, topic_id, subtopic_id),
        ).fetchall()
        return {r["section_id"]: _row_to_dict(r) for r in rows}
    finally:
        conn.close()


def save_section(
    user_id: int,
    lab: str,
    topic_id: str,
    subtopic_id: str,
    section_id: str,
    content: str,
    context: str,
    mode: str,
    project_id: Optional[int] = None,
) -> dict:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(
            """
            INSERT INTO lab_section_content
                (user_id, lab_name, topic_id, subtopic_id, section_id, content, context, mode, project_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, lab_name, topic_id, subtopic_id, section_id) DO UPDATE SET
                content = excluded.content,
                context = excluded.context,
                mode = excluded.mode,
                project_id = excluded.project_id,
                updated_at = datetime('now')
            """,
            (user_id, lab, topic_id, subtopic_id, section_id, content, context, mode, project_id),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT content, context, mode, updated_at, project_id FROM lab_section_content
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND section_id = ?
            """,
            (user_id, lab, topic_id, subtopic_id, section_id),
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


def _quiz_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "q": row["question"],
        "options": json.loads(row["options_json"]),
        "answer": row["answer"],
        "explanation": row["explanation"],
    }


def fetch_quiz_questions(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> List[dict]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT id, question, options_json, answer, explanation FROM lab_quiz_questions
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
            ORDER BY id
            """,
            (user_id, lab, topic_id, subtopic_id),
        ).fetchall()
        return [_quiz_row(r) for r in rows]
    finally:
        conn.close()


def fetch_quiz_questions_for_prompt(
    user_id: int, lab: str, topic_id: str, subtopic_id: str, project_id: Optional[int]
) -> List[dict]:
    """The page's earlier questions the model may be shown as "already seen" for a generation under `project_id`.

    Those written for no project, plus those written for this same project: never another project's, so its
    wording can't leak into this one. With `project_id` None (no project) only the project-less ones.
    """
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT id, question, options_json, answer, explanation FROM lab_quiz_questions
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
              AND (project_id IS NULL OR project_id = ?)
            ORDER BY id
            """,
            (user_id, lab, topic_id, subtopic_id, project_id),
        ).fetchall()
        return [_quiz_row(r) for r in rows]
    finally:
        conn.close()


def add_quiz_questions(
    user_id: int,
    lab: str,
    topic_id: str,
    subtopic_id: str,
    questions: List[dict],
    project_id: Optional[int] = None,
) -> List[dict]:
    """Append questions to the page's quiz, skipping any whose text is already there. Returns the ones added."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        existing = {
            r["question"].strip().lower()
            for r in conn.execute(
                "SELECT question FROM lab_quiz_questions WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?",
                (user_id, lab, topic_id, subtopic_id),
            )
        }
        added: List[dict] = []
        for q in questions:
            key = q["q"].strip().lower()
            if key in existing:
                continue
            existing.add(key)
            cur = conn.execute(
                """
                INSERT INTO lab_quiz_questions
                    (user_id, lab_name, topic_id, subtopic_id, question, options_json, answer, explanation, project_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    lab,
                    topic_id,
                    subtopic_id,
                    q["q"],
                    json.dumps(q["options"]),
                    q["answer"],
                    q["explanation"],
                    project_id,
                ),
            )
            added.append({**q, "id": cur.lastrowid})
        conn.commit()
        return added
    finally:
        conn.close()


def fetch_progress(user_id: int, lab: str) -> List[dict]:
    """Every page of the lab the user has marked complete, oldest first."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT topic_id, subtopic_id, completed_at FROM lab_page_progress
            WHERE user_id = ? AND lab_name = ?
            ORDER BY completed_at, id
            """,
            (user_id, lab),
        ).fetchall()
        return [{"topicId": r["topic_id"], "subtopicId": r["subtopic_id"], "completedAt": r["completed_at"]} for r in rows]
    finally:
        conn.close()


def set_progress(user_id: int, lab: str, topic_id: str, subtopic_id: str, completed: bool) -> dict:
    """Mark a page complete or not. Idempotent; completing twice keeps the first completion time."""
    conn = sqlite3.connect(get_db_path())
    try:
        completed_at = None
        if completed:
            conn.execute(
                """
                INSERT INTO lab_page_progress (user_id, lab_name, topic_id, subtopic_id) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, lab_name, topic_id, subtopic_id) DO NOTHING
                """,
                (user_id, lab, topic_id, subtopic_id),
            )
            completed_at = conn.execute(
                "SELECT completed_at FROM lab_page_progress WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?",
                (user_id, lab, topic_id, subtopic_id),
            ).fetchone()[0]
        else:
            conn.execute(
                "DELETE FROM lab_page_progress WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?",
                (user_id, lab, topic_id, subtopic_id),
            )
        conn.commit()
        return {"topicId": topic_id, "subtopicId": subtopic_id, "completed": completed, "completedAt": completed_at}
    finally:
        conn.close()


def fetch_settings(user_id: int, lab: str) -> Dict[str, dict]:
    """The user's customised sections for a lab, keyed by section id ('*' = the lab-wide row)."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT section_id, prompt, addon, context, updated_at FROM lab_section_settings WHERE user_id = ? AND lab_name = ?",
            (user_id, lab),
        ).fetchall()
        return {
            r["section_id"]: {"prompt": r["prompt"], "addon": r["addon"], "context": r["context"], "updatedAt": r["updated_at"]}
            for r in rows
        }
    finally:
        conn.close()


def save_settings(user_id: int, lab: str, section_id: str, prompt: str, addon: str, context: str) -> dict:
    """Save one section's settings; all three fields empty removes the row (back to the defaults)."""
    prompt, addon, context = prompt.strip(), addon.strip(), context.strip()
    conn = sqlite3.connect(get_db_path())
    try:
        if not (prompt or addon or context):
            conn.execute(
                "DELETE FROM lab_section_settings WHERE user_id = ? AND lab_name = ? AND section_id = ?",
                (user_id, lab, section_id),
            )
            conn.commit()
            return {"sectionId": section_id, "prompt": "", "addon": "", "context": "", "updatedAt": None}
        conn.execute(
            """
            INSERT INTO lab_section_settings (user_id, lab_name, section_id, prompt, addon, context)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, lab_name, section_id) DO UPDATE SET
                prompt = excluded.prompt,
                addon = excluded.addon,
                context = excluded.context,
                updated_at = datetime('now')
            """,
            (user_id, lab, section_id, prompt, addon, context),
        )
        conn.commit()
        updated_at = conn.execute(
            "SELECT updated_at FROM lab_section_settings WHERE user_id = ? AND lab_name = ? AND section_id = ?",
            (user_id, lab, section_id),
        ).fetchone()[0]
        return {"sectionId": section_id, "prompt": prompt, "addon": addon, "context": context, "updatedAt": updated_at}
    finally:
        conn.close()


def reset_settings(user_id: int, lab: str, section_id: str | None = None) -> dict:
    """Reset one section's settings ('*' = just the lab-wide row), or every setting of the lab ('all' / None)."""
    conn = sqlite3.connect(get_db_path())
    try:
        if section_id and section_id != "all":
            conn.execute(
                "DELETE FROM lab_section_settings WHERE user_id = ? AND lab_name = ? AND section_id = ?",
                (user_id, lab, section_id),
            )
        else:
            conn.execute(
                "DELETE FROM lab_section_settings WHERE user_id = ? AND lab_name = ?",
                (user_id, lab),
            )
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

