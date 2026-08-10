"""Persistence for AI analyzer reports and the ai_runs audit log."""

from __future__ import annotations

import json
from typing import Optional

from ..shared.db import _connect, _new_id

_ANALYSIS_COLS = "id, user_id, resume_version_id, master_id, job_description_id, report_json, overall_score, ats_score, created_at"


def _analysis_to_dict(r) -> dict:
    return {
        "id": r[0],
        "resume_version_id": r[2],
        "master_id": r[3],
        "job_description_id": r[4],
        "report": json.loads(r[5]) if r[5] else {},
        "overall_score": r[6],
        "ats_score": r[7],
        "created_at": r[8],
    }


def insert_analysis(
    user_id: str,
    resume_version_id: str,
    report: dict,
    *,
    master_id: Optional[str] = None,
    job_description_id: Optional[str] = None,
) -> dict:
    aid = _new_id()
    overall = report.get("overall_score")
    ats = report.get("ats_score")
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO resume_analysis
                (id, user_id, resume_version_id, master_id, job_description_id, report_json, overall_score, ats_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (aid, str(user_id), resume_version_id, master_id, job_description_id,
             json.dumps(report), _as_int(overall), _as_int(ats)),
        )
        conn.commit()
        cur.execute(f"SELECT {_ANALYSIS_COLS} FROM resume_analysis WHERE id = ?", (aid,))
        return _analysis_to_dict(cur.fetchone())
    finally:
        conn.close()


def get_latest_analysis(user_id: str, resume_version_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_ANALYSIS_COLS} FROM resume_analysis "
            "WHERE user_id = ? AND resume_version_id = ? ORDER BY created_at DESC LIMIT 1",
            (str(user_id), resume_version_id),
        )
        row = cur.fetchone()
        return _analysis_to_dict(row) if row else None
    finally:
        conn.close()


def _as_int(value) -> Optional[int]:
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None
