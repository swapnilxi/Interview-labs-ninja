"""SQLite access for Guided Practice's saved state (see schema.py): one row per (user, lab, topic, subtopic).

`lab` is the second argument of every function ('dsa' or 'cv'; the router validates it), so the same topic id under two
labs is two independent pages with their own versions.

Twin: frontend/fe-apis/guidedPractice/db.ts (nextjs-api mode) -- the SQL and the version rule must stay identical.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Optional

from modules.common.db import get_db_path


def _parse_json(value: Any, fallback: Any = None) -> Any:
    """json.loads on a TEXT column that may be NULL, empty or invalid (twin: parseJson in fe-apis/todo/_shared.ts)."""
    if not isinstance(value, str) or not value:
        return fallback
    try:
        return json.loads(value)
    except ValueError:
        return fallback


def fetch_state(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> Optional[dict]:
    """The saved document of a page of `lab`, or None when the learner has not started it."""
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute(
            """
            SELECT version, state_json, summary_json, updated_at FROM guided_practice_state
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
            """,
            (user_id, lab, topic_id, subtopic_id),
        ).fetchone()
        if not row:
            return None
        return {
            "version": row[0],
            "state": _parse_json(row[1], None),
            "summary": _parse_json(row[2], None),
            "updatedAt": row[3],
        }
    finally:
        conn.close()


def fetch_summary(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> Optional[dict]:
    """Just the summary (what the topic page's card shows), or None when the page has not been started."""
    conn = sqlite3.connect(get_db_path())
    try:
        row = conn.execute(
            """
            SELECT summary_json, updated_at FROM guided_practice_state
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
            """,
            (user_id, lab, topic_id, subtopic_id),
        ).fetchone()
        return {"summary": _parse_json(row[0], None), "updatedAt": row[1]} if row else None
    finally:
        conn.close()


def save_state(
    user_id: int,
    lab: str,
    topic_id: str,
    subtopic_id: str,
    expected_version: int,
    state_json: str,
    summary_json: str,
) -> Optional[dict]:
    """Save a page's document and return {version, updatedAt}, or None when the save is refused.

    `expected_version` is the version the caller loaded (0 = it found nothing): a different stored version means
    another tab or device saved in between, and the save is refused rather than overwriting that progress.
    """
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute("BEGIN IMMEDIATE")
        if expected_version == 0:
            changes = conn.execute(
                """
                INSERT INTO guided_practice_state (user_id, lab_name, topic_id, subtopic_id, version, state_json, summary_json)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(user_id, lab_name, topic_id, subtopic_id) DO NOTHING
                """,
                (user_id, lab, topic_id, subtopic_id, state_json, summary_json),
            ).rowcount
            version = 1
        else:
            changes = conn.execute(
                """
                UPDATE guided_practice_state
                SET state_json = ?, summary_json = ?, version = version + 1, updated_at = datetime('now')
                WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ? AND version = ?
                """,
                (state_json, summary_json, user_id, lab, topic_id, subtopic_id, expected_version),
            ).rowcount
            version = expected_version + 1
        if not changes:
            conn.rollback()
            return None
        updated_at = conn.execute(
            """
            SELECT updated_at FROM guided_practice_state
            WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?
            """,
            (user_id, lab, topic_id, subtopic_id),
        ).fetchone()[0]
        conn.commit()
        return {"version": version, "updatedAt": updated_at}
    finally:
        conn.close()


def delete_state(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> None:
    """Forget a page's saved path and progress (the learner starts over). Idempotent."""
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute(
            "DELETE FROM guided_practice_state WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?",
            (user_id, lab, topic_id, subtopic_id),
        )
        conn.commit()
    finally:
        conn.close()
