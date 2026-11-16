"""SQLite access for the per-user question workspace and quiz (tables in schema.py).

Every read and write is scoped by user_id: the `questions` rows are shared, these are not.
Twin: frontend/fe-apis/dailySession/questionStore.ts -- keep the two in sync.
"""

from __future__ import annotations

import json
import sqlite3
from typing import List, Optional

from modules.common.db import get_db_path


def fetch_question_for_quiz(question_id: int) -> Optional[dict]:
    """The fields the quiz prompt uses, or None when there is no such question (any owner: questions are shared)."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT question_text, category, sub_type, difficulty, topics FROM questions WHERE id = ?",
            (question_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "question_text": row["question_text"] or "",
            "category": row["category"] or "",
            "sub_type": row["sub_type"] or "",
            "difficulty": row["difficulty"] or "",
            "topics": [t for t in (row["topics"] or "").split(",") if t],
        }
    finally:
        conn.close()


def question_exists(question_id: int) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        return conn.execute("SELECT 1 FROM questions WHERE id = ?", (question_id,)).fetchone() is not None
    finally:
        conn.close()


def _workspace(conn: sqlite3.Connection, user_id: int, question_id: int) -> dict:
    """QuestionWorkspace: the saved answer and notes ('' / None when nothing is saved) and whether the question is on
    the user's review list."""
    row = conn.execute(
        "SELECT answer, notes, updated_at FROM question_workspace WHERE user_id = ? AND question_id = ?",
        (user_id, question_id),
    ).fetchone()
    in_review = (
        conn.execute(
            "SELECT 1 FROM question_review_list WHERE user_id = ? AND question_id = ?", (user_id, question_id)
        ).fetchone()
        is not None
    )
    return {
        "question_id": question_id,
        "answer": row[0] if row else "",
        "notes": row[1] if row else "",
        "updated_at": row[2] if row else None,
        "in_review": in_review,
    }


def fetch_workspace(user_id: int, question_id: int) -> dict:
    """This user's answer and notes for the question; empty strings and updated_at None when nothing is saved."""
    conn = sqlite3.connect(get_db_path())
    try:
        return _workspace(conn, user_id, question_id)
    finally:
        conn.close()


def save_workspace(user_id: int, question_id: int, answer: Optional[str], notes: Optional[str]) -> dict:
    """Partial upsert: a field passed as None keeps its saved value. Nothing to change = nothing written."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        if answer is not None or notes is not None:
            current = conn.execute(
                "SELECT answer, notes FROM question_workspace WHERE user_id = ? AND question_id = ?",
                (user_id, question_id),
            ).fetchone()
            new_answer = answer if answer is not None else (current["answer"] if current else "")
            new_notes = notes if notes is not None else (current["notes"] if current else "")
            conn.execute(
                """
                INSERT INTO question_workspace (user_id, question_id, answer, notes, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(user_id, question_id) DO UPDATE SET
                    answer = excluded.answer, notes = excluded.notes, updated_at = excluded.updated_at
                """,
                (user_id, question_id, new_answer, new_notes),
            )
            conn.commit()
        return _workspace(conn, user_id, question_id)
    finally:
        conn.close()


def _quiz_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "q": row["q"],
        "options": json.loads(row["options"]),
        "answer": row["answer"],
        "explanation": row["explanation"],
    }


def fetch_question_quiz(user_id: int, question_id: int) -> List[dict]:
    """This user's quiz items for the question, oldest first."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT id, q, options, answer, explanation FROM question_quiz
            WHERE user_id = ? AND question_id = ?
            ORDER BY id
            """,
            (user_id, question_id),
        ).fetchall()
        return [_quiz_item(r) for r in rows]
    finally:
        conn.close()


def add_question_quiz(user_id: int, question_id: int, questions: List[dict], cap: int) -> List[dict]:
    """Append items, skipping any whose stem is already stored and stopping at `cap` stored items. Returns the added."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        stems = [
            r["q"]
            for r in conn.execute(
                "SELECT q FROM question_quiz WHERE user_id = ? AND question_id = ?", (user_id, question_id)
            )
        ]
        existing = {s.strip().lower() for s in stems}
        stored = len(stems)
        added: List[dict] = []
        for q in questions:
            if stored >= cap:
                break
            key = q["q"].strip().lower()
            if key in existing:
                continue
            existing.add(key)
            cur = conn.execute(
                """
                INSERT INTO question_quiz (user_id, question_id, q, options, answer, explanation)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, question_id, q["q"], json.dumps(q["options"]), q["answer"], q["explanation"]),
            )
            stored += 1
            added.append({"id": cur.lastrowid, **q})
        conn.commit()
        return added
    finally:
        conn.close()


def clear_question_quiz(user_id: int, question_id: int) -> None:
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute("DELETE FROM question_quiz WHERE user_id = ? AND question_id = ?", (user_id, question_id))
        conn.commit()
    finally:
        conn.close()


# ── Study content (quick review, breakdown, deep dive) ────────────────────────
# `content` is the item's JSON without `kind` / `updated_at`, which come from the row.


def _study_item(kind: str, content: str, updated_at: str) -> dict:
    return {"kind": kind, **json.loads(content), "updated_at": updated_at}


def fetch_study(user_id: int, question_id: int, kinds: tuple) -> dict:
    """{kind: item or None} for every kind in `kinds`."""
    out: dict = {k: None for k in kinds}
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT kind, content, updated_at FROM question_study WHERE user_id = ? AND question_id = ?",
            (user_id, question_id),
        ).fetchall()
        for r in rows:
            if r["kind"] in out:
                out[r["kind"]] = _study_item(r["kind"], r["content"], r["updated_at"])
        return out
    finally:
        conn.close()


def fetch_study_item(user_id: int, question_id: int, kind: str) -> Optional[dict]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT content, updated_at FROM question_study WHERE user_id = ? AND question_id = ? AND kind = ?",
            (user_id, question_id, kind),
        ).fetchone()
        return _study_item(kind, row["content"], row["updated_at"]) if row else None
    finally:
        conn.close()


def save_study(user_id: int, question_id: int, kind: str, content: dict) -> dict:
    """Insert or replace this user's item of `kind` for the question. Returns it as stored."""
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute(
            """
            INSERT INTO question_study (user_id, question_id, kind, content, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, question_id, kind) DO UPDATE SET
                content = excluded.content, updated_at = excluded.updated_at
            """,
            (user_id, question_id, kind, json.dumps(content)),
        )
        conn.commit()
    finally:
        conn.close()
    return fetch_study_item(user_id, question_id, kind)  # type: ignore[return-value]


# ── Review list ("Add to review") ─────────────────────────────────────────────


def review_state(user_id: int, question_id: int) -> dict:
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute(
            "SELECT added_at FROM question_review_list WHERE user_id = ? AND question_id = ?", (user_id, question_id)
        ).fetchone()
        return {"question_id": question_id, "in_review": row is not None, "added_at": row[0] if row else None}
    finally:
        conn.close()


def add_to_review(user_id: int, question_id: int) -> dict:
    """Idempotent: adding again keeps the first added_at."""
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute(
            "INSERT OR IGNORE INTO question_review_list (user_id, question_id, added_at) VALUES (?, ?, datetime('now'))",
            (user_id, question_id),
        )
        conn.commit()
    finally:
        conn.close()
    return review_state(user_id, question_id)


def remove_from_review(user_id: int, question_id: int) -> dict:
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute("DELETE FROM question_review_list WHERE user_id = ? AND question_id = ?", (user_id, question_id))
        conn.commit()
    finally:
        conn.close()
    return {"question_id": question_id, "in_review": False, "added_at": None}


def fetch_review_list(user_id: int) -> List[dict]:
    """This user's review list, newest first (questions deleted since are left out)."""
    conn = sqlite3.connect(get_db_path())
    try:
        rows = conn.execute(
            """
            SELECT r.question_id, r.added_at FROM question_review_list r
            JOIN questions q ON q.id = r.question_id
            WHERE r.user_id = ?
            ORDER BY r.added_at DESC, r.rowid DESC
            """,
            (user_id,),
        ).fetchall()
        return [{"question_id": r[0], "added_at": r[1]} for r in rows]
    finally:
        conn.close()
