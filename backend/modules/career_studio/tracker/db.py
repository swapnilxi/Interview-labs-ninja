"""Persistence for the Job & People Tracker.

Saved job descriptions double as application records (the pipeline columns live on
job_descriptions); people are contacts in career_people. Every function is
user-scoped. TypeScript twin: frontend/fe-apis/career/db.ts ("Job & People Tracker").
"""

from __future__ import annotations

import json
from typing import Optional

from ..shared.db import _connect, _new_id
from ..job_match.db import _to_dict as job_to_dict, _COLS as JOB_COLS

PEOPLE_COLS = (
    "id, user_id, name, role, company, email, phone, linkedin_url, relationship, stage, "
    "job_id, notes, tags, last_contacted, next_follow_up, created_at, updated_at"
)

PERSON_FIELDS = (
    "name", "role", "company", "email", "phone", "linkedin_url", "relationship", "stage",
    "job_id", "notes", "last_contacted", "next_follow_up",
)
JOB_TRACKER_FIELDS = (
    "status", "priority", "applied_at", "deadline", "notes", "rating",
    "title", "company", "url", "location", "salary",
)


def _person_to_dict(r) -> dict:
    return {
        "id": r[0], "name": r[2], "role": r[3], "company": r[4], "email": r[5], "phone": r[6],
        "linkedin_url": r[7], "relationship": r[8], "stage": r[9], "job_id": r[10],
        "notes": r[11] or "", "tags": json.loads(r[12]) if r[12] else [],
        "last_contacted": r[13], "next_follow_up": r[14],
        "created_at": r[15], "updated_at": r[16],
    }


def list_people(user_id: str, stage: Optional[str] = None, relationship: Optional[str] = None,
                job_id: Optional[str] = None, q: Optional[str] = None) -> list[dict]:
    where = ["user_id = ?", "is_deleted = 0"]
    args: list = [str(user_id)]
    if stage:
        where.append("stage = ?")
        args.append(stage)
    if relationship:
        where.append("relationship = ?")
        args.append(relationship)
    if job_id:
        where.append("job_id = ?")
        args.append(job_id)
    if q:
        where.append("(instr(lower(name), lower(?)) > 0 OR instr(lower(COALESCE(company,'')), lower(?)) > 0)")
        args.extend([q, q])
    conn = _connect()
    try:
        rows = conn.execute(
            f"SELECT {PEOPLE_COLS} FROM career_people WHERE {' AND '.join(where)} ORDER BY updated_at DESC",
            args,
        ).fetchall()
        return [_person_to_dict(r) for r in rows]
    finally:
        conn.close()


def get_person(user_id: str, person_id: str) -> Optional[dict]:
    conn = _connect()
    try:
        r = conn.execute(
            f"SELECT {PEOPLE_COLS} FROM career_people WHERE id = ? AND user_id = ? AND is_deleted = 0",
            (person_id, str(user_id)),
        ).fetchone()
        return _person_to_dict(r) if r else None
    finally:
        conn.close()


def create_person(user_id: str, fields: dict) -> dict:
    pid = _new_id()
    values = {
        "name": "Unnamed", "role": None, "company": None, "email": None, "phone": None,
        "linkedin_url": None, "relationship": "recruiter", "stage": "lead", "job_id": None,
        "notes": "", "tags": [], "last_contacted": None, "next_follow_up": None,
        **fields,
    }
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO career_people (id, user_id, name, role, company, email, phone, linkedin_url, "
            "relationship, stage, job_id, notes, tags, last_contacted, next_follow_up) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (pid, str(user_id), values["name"], values["role"], values["company"], values["email"],
             values["phone"], values["linkedin_url"], values["relationship"], values["stage"],
             values["job_id"], values["notes"], json.dumps(values["tags"] or []),
             values["last_contacted"], values["next_follow_up"]),
        )
        conn.commit()
    finally:
        conn.close()
    return get_person(user_id, pid)


def update_person(user_id: str, person_id: str, fields: dict) -> Optional[dict]:
    sets, args = [], []
    for key in PERSON_FIELDS:
        if key in fields:
            sets.append(f"{key} = ?")
            args.append(fields[key])
    if "tags" in fields:
        sets.append("tags = ?")
        args.append(json.dumps(fields["tags"] or []))
    if sets:
        sets.append("updated_at = datetime('now')")
        conn = _connect()
        try:
            conn.execute(
                f"UPDATE career_people SET {', '.join(sets)} WHERE id = ? AND user_id = ? AND is_deleted = 0",
                (*args, person_id, str(user_id)),
            )
            conn.commit()
        finally:
            conn.close()
    return get_person(user_id, person_id)


def delete_person(user_id: str, person_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.execute("UPDATE career_people SET is_deleted = 1 WHERE id = ? AND user_id = ?", (person_id, str(user_id)))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def create_tracked_job(user_id: str, fields: dict) -> dict:
    jid = _new_id()
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO job_descriptions (id, user_id, title, company, url, raw_text, status, priority, "
            "applied_at, deadline, notes, rating, location, salary) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (jid, str(user_id), fields.get("title"), fields.get("company"), fields.get("url"),
             fields.get("raw_text") or fields.get("title") or "", fields.get("status") or "saved",
             fields.get("priority") or "medium", fields.get("applied_at"), fields.get("deadline"),
             fields.get("notes") or "", fields.get("rating") or 0, fields.get("location"), fields.get("salary")),
        )
        conn.commit()
        r = conn.execute(f"SELECT {JOB_COLS} FROM job_descriptions WHERE id = ?", (jid,)).fetchone()
        return job_to_dict(r)
    finally:
        conn.close()


def update_job_tracker(user_id: str, job_id: str, fields: dict) -> Optional[dict]:
    sets, args = [], []
    for key in JOB_TRACKER_FIELDS:
        if key in fields:
            sets.append(f"{key} = ?")
            args.append(fields[key])
    if sets:
        sets.append("updated_at = datetime('now')")
        conn = _connect()
        try:
            conn.execute(
                f"UPDATE job_descriptions SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
                (*args, job_id, str(user_id)),
            )
            conn.commit()
        finally:
            conn.close()
    conn = _connect()
    try:
        r = conn.execute(f"SELECT {JOB_COLS} FROM job_descriptions WHERE id = ? AND user_id = ?", (job_id, str(user_id))).fetchone()
        return job_to_dict(r) if r else None
    finally:
        conn.close()


def summary(user_id: str) -> dict:
    uid = str(user_id)
    conn = _connect()
    try:
        jobs = conn.execute("SELECT status, COUNT(*) AS n FROM job_descriptions WHERE user_id = ? GROUP BY status", (uid,)).fetchall()
        people = conn.execute("SELECT stage, COUNT(*) AS n FROM career_people WHERE user_id = ? AND is_deleted = 0 GROUP BY stage", (uid,)).fetchall()
        upcoming = conn.execute(
            "SELECT id, title, company, deadline FROM job_descriptions WHERE user_id = ? "
            "AND deadline IS NOT NULL AND deadline >= date('now') ORDER BY deadline LIMIT 10", (uid,)
        ).fetchall()
        follow_ups = conn.execute(
            "SELECT id, name, company, next_follow_up FROM career_people WHERE user_id = ? "
            "AND is_deleted = 0 AND next_follow_up IS NOT NULL ORDER BY next_follow_up LIMIT 10", (uid,)
        ).fetchall()
    finally:
        conn.close()
    return {
        "jobs": {r[0]: r[1] for r in jobs},
        "people": {r[0]: r[1] for r in people},
        "upcoming_deadlines": [{"id": r[0], "title": r[1], "company": r[2], "deadline": r[3]} for r in upcoming],
        "follow_ups": [{"id": r[0], "name": r[1], "company": r[2], "next_follow_up": r[3]} for r in follow_ups],
    }
