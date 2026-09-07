"""Saved job descriptions — raw sqlite3 against the module's own DB.

A job description is a first-class, user-scoped entity so a resume can be
"tailored to a job id" and the same JD reused across analyze/tailor runs.
Mirrors db.py's idiom (own _connect via db.py, user_id filtering everywhere).

Beyond raw_text, a job can carry a structured extraction (location, employment
type, required/preferred skills, responsibilities, benefits, experience level,
education, certifications, salary) — all optional, all nullable, populated by
the /career/jobs/extract preview + user confirmation (see views_router.py).
List-shaped fields are stored as JSON TEXT, parsed back out in _to_dict.
"""

from __future__ import annotations

import json
from typing import Optional

from ..shared.db import _connect, _new_id

_COLS = (
    "id, user_id, title, company, url, raw_text, created_at, updated_at, "
    "location, employment_type, experience_level, education, salary, "
    "required_skills, preferred_skills, responsibilities, benefits, certifications, "
    "extraction_confidence"
)

_JSON_LIST_FIELDS = ("required_skills", "preferred_skills", "responsibilities", "benefits", "certifications")


def _to_dict(r) -> dict:
    return {
        "id": r[0],
        "title": r[2],
        "company": r[3],
        "url": r[4],
        "raw_text": r[5],
        "created_at": r[6],
        "updated_at": r[7],
        "location": r[8],
        "employment_type": r[9],
        "experience_level": r[10],
        "education": r[11],
        "salary": r[12],
        "required_skills": json.loads(r[13]) if r[13] else [],
        "preferred_skills": json.loads(r[14]) if r[14] else [],
        "responsibilities": json.loads(r[15]) if r[15] else [],
        "benefits": json.loads(r[16]) if r[16] else [],
        "certifications": json.loads(r[17]) if r[17] else [],
        "extraction_confidence": r[18],
    }


def create_job(
    user_id: str,
    raw_text: str,
    title: Optional[str] = None,
    company: Optional[str] = None,
    url: Optional[str] = None,
    structured: Optional[dict] = None,
) -> dict:
    """`structured`, if provided, is a dict of any of the extraction fields
    (location/employment_type/experience_level/education/salary as plain strings;
    required_skills/preferred_skills/responsibilities/benefits/certifications as
    lists; extraction_confidence as an int) — all optional, all ignored if absent."""
    uid = str(user_id)
    jid = _new_id()
    s = structured or {}
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO job_descriptions ("
            "id, user_id, title, company, url, raw_text, "
            "location, employment_type, experience_level, education, salary, "
            "required_skills, preferred_skills, responsibilities, benefits, certifications, "
            "extraction_confidence"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                jid, uid, title, company, url, raw_text or "",
                s.get("location"), s.get("employment_type"), s.get("experience_level"),
                s.get("education"), s.get("salary"),
                json.dumps(s.get("required_skills")) if s.get("required_skills") else None,
                json.dumps(s.get("preferred_skills")) if s.get("preferred_skills") else None,
                json.dumps(s.get("responsibilities")) if s.get("responsibilities") else None,
                json.dumps(s.get("benefits")) if s.get("benefits") else None,
                json.dumps(s.get("certifications")) if s.get("certifications") else None,
                s.get("extraction_confidence"),
            ),
        )
        conn.commit()
        cur.execute(f"SELECT {_COLS} FROM job_descriptions WHERE id = ?", (jid,))
        return _to_dict(cur.fetchone())
    finally:
        conn.close()


def list_jobs(user_id: str) -> list[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_COLS} FROM job_descriptions WHERE user_id = ? ORDER BY updated_at DESC",
            (str(user_id),),
        )
        return [_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_job(user_id: str, job_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_COLS} FROM job_descriptions WHERE id = ? AND user_id = ?",
            (job_id, str(user_id)),
        )
        row = cur.fetchone()
        return _to_dict(row) if row else None
    finally:
        conn.close()


def delete_job(user_id: str, job_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM job_descriptions WHERE id = ? AND user_id = ?", (job_id, str(user_id)))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
