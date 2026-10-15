"""A user's week-by-week DSA study plan: which question sits in which week.

The suggested plan itself lives in the frontend (frontend/src/modules/dsa-lab/weekPlan.ts); only a
user's own plan is stored here, as one JSON row. `frontend/fe-apis/dsaLab/` is the Next.js twin
(nextjs-api mode) -- keep the limits and messages in sync.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Dict, Optional

from modules.common.db import get_db_path

WEEK_CAP = 7  # most questions a single week may hold
MAX_WEEKS = 12


def validate_plan(weeks: int, assignments: Dict[str, int]) -> Optional[str]:
    """Return a human-readable problem with the plan, or None when it is fine."""
    counts: Dict[int, int] = {}
    for topic_id, week in assignments.items():
        if not topic_id or len(topic_id) > 200:
            return "Every question id must be 1-200 characters."
        if week < 1 or week > weeks:
            return f"'{topic_id}' is in week {week}, but the plan has weeks 1-{weeks}."
        counts[week] = counts.get(week, 0) + 1
    for week in sorted(counts):
        if counts[week] > WEEK_CAP:
            return f"Week {week} has {counts[week]} questions; a week holds at most {WEEK_CAP}."
    return None


def _row_to_plan(row: sqlite3.Row) -> dict:
    plan = json.loads(row["plan_json"])
    return {"weeks": plan["weeks"], "assignments": plan["assignments"], "updatedAt": row["updated_at"]}


def fetch_week_plan(user_id: int) -> Optional[dict]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT plan_json, updated_at FROM dsa_week_plans WHERE user_id = ?", (user_id,)).fetchone()
        return _row_to_plan(row) if row else None
    finally:
        conn.close()


def save_week_plan(user_id: int, weeks: int, assignments: Dict[str, int]) -> dict:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(
            """
            INSERT INTO dsa_week_plans (user_id, plan_json) VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET plan_json = excluded.plan_json, updated_at = datetime('now')
            """,
            (user_id, json.dumps({"weeks": weeks, "assignments": assignments})),
        )
        conn.commit()
        row = conn.execute("SELECT plan_json, updated_at FROM dsa_week_plans WHERE user_id = ?", (user_id,)).fetchone()
        return _row_to_plan(row)
    finally:
        conn.close()


def delete_week_plan(user_id: int) -> None:
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute("DELETE FROM dsa_week_plans WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
