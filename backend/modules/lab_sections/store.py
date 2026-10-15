"""SQLite access for saved lab-section content (see schema.py)."""

from __future__ import annotations

import json
import sqlite3
from typing import Dict, List

from modules.common.db import get_db_path


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "content": row["content"],
        "context": row["context"],
        "mode": row["mode"],
        "updatedAt": row["updated_at"],
    }


def fetch_saved_sections(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> Dict[str, dict]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT section_id, content, context, mode, updated_at
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
) -> dict:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(
            """
            INSERT INTO lab_section_content
                (user_id, lab_name, topic_id, subtopic_id, section_id, content, context, mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, lab_name, topic_id, subtopic_id, section_id) DO UPDATE SET
                content = excluded.content,
                context = excluded.context,
                mode = excluded.mode,
                updated_at = datetime('now')
            """,
            (user_id, lab, topic_id, subtopic_id, section_id, content, context, mode),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT content, context, mode, updated_at FROM lab_section_content
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


def add_quiz_questions(user_id: int, lab: str, topic_id: str, subtopic_id: str, questions: List[dict]) -> List[dict]:
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
                    (user_id, lab_name, topic_id, subtopic_id, question, options_json, answer, explanation)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, lab, topic_id, subtopic_id, q["q"], json.dumps(q["options"]), q["answer"], q["explanation"]),
            )
            added.append({**q, "id": cur.lastrowid})
        conn.commit()
        return added
    finally:
        conn.close()
