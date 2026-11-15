"""Storage and routes shared by the topic labs that keep the CV Lab's shape (Communication Lab, Finance Lab).

Each lab has its own `<lab>_topics` table with exactly `cv_topics`' columns, its sidebar categories in the shared
`lab_sections` table (lab_name = the lab's key), and its seed topics in a `topics.json` beside its module. The
Next.js twin (frontend/fe-apis/labs/) serves the same routes from the same table and seeds from the same JSON
file, so a change to the storage format here must be mirrored there (CLAUDE.md, "Dual deployment modes").

Stored JSON columns are written with `json.dumps` defaults; keep the seed files ASCII-only so the TS port's
`pyJsonDumps` writes byte-identical text.
"""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id
from modules.common.db import fetch_lab_sections, get_db_path, save_lab_section

_TABLE_NAME = re.compile(r"^[a-z_]+_topics$")


def _check_table(table: str) -> str:
    # Table names come from code, never from a request; this guards the f-string SQL below anyway.
    if not _TABLE_NAME.match(table):
        raise ValueError(f"invalid topic table name: {table!r}")
    return table


# ── Schema + seed ──────────────────────────────────────────────────────────────


def create_topics_table(cursor: sqlite3.Cursor, table: str) -> None:
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS {_check_table(table)} (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            brief TEXT NOT NULL,
            category TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            prerequisites_json TEXT NOT NULL DEFAULT '[]',
            subtopics_json TEXT NOT NULL DEFAULT '[]',
            is_custom INTEGER NOT NULL DEFAULT 0
        )
    """)


def load_seed_topics(path: Path) -> List[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def seed_topics(cursor: sqlite3.Cursor, table: str, topics: List[dict]) -> None:
    """Insert every seed topic whose id is not in the table yet.

    Unlike the CV seed (which stops once any seeded row exists), this runs on every init_db(), so a topic added
    to topics.json later still appears. An existing row is never touched: the user may have added subtopics to it.
    """
    for topic in topics:
        cursor.execute(
            f"""
            INSERT OR IGNORE INTO {_check_table(table)} (
                id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                topic["id"],
                topic["name"],
                topic["brief"],
                topic["category"],
                topic["difficulty"],
                json.dumps(topic.get("prerequisites", [])),
                json.dumps(topic.get("subtopics", [])),
            ),
        )


# ── Reads / writes (same behaviour as cv_lab/seed.py) ──────────────────────────


def fetch_topics(table: str) -> List[dict]:
    """All topics of one lab, seeded first, then the custom ones in the order they were added."""
    conn = sqlite3.connect(get_db_path())
    try:
        rows = conn.execute(
            f"""
            SELECT id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
            FROM {_check_table(table)}
            ORDER BY is_custom ASC, rowid ASC
            """
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        try:
            prereqs = json.loads(r[5])
        except Exception:
            prereqs = []
        try:
            subtopics = json.loads(r[6])
        except Exception:
            subtopics = []
        out.append({
            "id": r[0],
            "name": r[1],
            "brief": r[2],
            "category": r[3],
            "difficulty": r[4],
            "prerequisites": prereqs,
            "subtopics": subtopics,
            "isCustom": bool(r[7]),
        })
    return out


def save_topic(table: str, topic: dict) -> None:
    """Insert a new (custom) topic, or update an existing one in place.

    An upsert, not CV's INSERT OR REPLACE: REPLACE deletes and re-inserts the row, which gives it a new rowid and so
    moves an edited lesson (for example one that just got a subtopic) to the end of the lab's ordered path. An
    existing row keeps its rowid and its is_custom flag.
    """
    table = _check_table(table)
    conn = sqlite3.connect(get_db_path())
    try:
        conn.execute(
            f"""
            INSERT INTO {table} (
                id, name, brief, category, difficulty, prerequisites_json, subtopics_json, is_custom
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                brief = excluded.brief,
                category = excluded.category,
                difficulty = excluded.difficulty,
                prerequisites_json = excluded.prerequisites_json,
                subtopics_json = excluded.subtopics_json
            """,
            (
                topic["id"],
                topic["name"],
                topic["brief"],
                topic["category"],
                topic["difficulty"],
                json.dumps(topic.get("prerequisites", [])),
                json.dumps(topic.get("subtopics", [])),
            ),
        )
        conn.commit()
    finally:
        conn.close()


# ── Routes ─────────────────────────────────────────────────────────────────────


class TopicLabSubtopicIn(BaseModel):
    id: str
    name: str
    brief: str
    content: Optional[str] = None
    sourceUrl: Optional[str] = None


class TopicLabTopicIn(BaseModel):
    id: str
    name: str
    brief: str
    category: str
    difficulty: str
    prerequisites: List[str] = Field(default_factory=list)
    subtopics: List[TopicLabSubtopicIn] = Field(default_factory=list)


class TopicLabSectionIn(BaseModel):
    name: str
    isCustom: bool = True


def build_router(*, prefix: str, tag: str, table: str, section_lab: str) -> APIRouter:
    """GET/POST `{prefix}/topics` and `{prefix}/sections`, login required (the CV router's routes and shapes)."""
    _check_table(table)
    router = APIRouter(prefix=prefix, tags=[tag], dependencies=[Depends(get_current_user_id)])

    @router.get("/topics")
    async def get_topics() -> List[dict]:
        return fetch_topics(table)

    @router.post("/topics")
    async def save_topic_endpoint(payload: TopicLabTopicIn) -> dict:
        save_topic(table, payload.model_dump())
        return {"status": "success"}

    @router.get("/sections")
    async def get_sections(user_id: int = Depends(get_current_user_id)) -> List[dict]:
        return fetch_lab_sections(user_id, section_lab)

    @router.post("/sections")
    async def save_section(payload: TopicLabSectionIn, user_id: int = Depends(get_current_user_id)) -> dict:
        save_lab_section(user_id, section_lab, payload.name)
        return {"status": "success"}

    return router
