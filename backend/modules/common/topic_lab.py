"""Storage and routes shared by the topic labs (CV, System Design, Communication, Finance, Python, GenAI).

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

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id
from modules.common.db import delete_custom_lab_section, fetch_lab_sections, save_lab_section
from modules.common.owned_topics import (
    PREREQUISITES,
    TopicError,
    TopicShape,
    delete_owned,
    ensure_ownership,
    fetch_owned,
    is_admin_user,
    save_owned,
)

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
    # owner_id (NULL = shared with everyone) and the lab's overrides table: see common/owned_topics.py
    ensure_ownership(cursor, table, PREREQUISITES)


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


# ── Reads / writes ─────────────────────────────────────────────────────────────
# common/owned_topics.py holds them: the shared topics plus the caller's own, the caller's version of a shared one in its place, and an
# upsert that keeps an edited lesson's rowid (so it keeps its place in the lab's ordered path) and its is_custom flag.


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
    shared: bool = False  # admin only: make this topic everyone's instead of the caller's own


class TopicLabSectionIn(BaseModel):
    name: str
    isCustom: bool = True


def build_router(
    *,
    prefix: str,
    tag: str,
    table: str,
    section_lab: str,
    shape: TopicShape = PREREQUISITES,
    topic_model: type = TopicLabTopicIn,
) -> APIRouter:
    """`{prefix}/topics` (GET, POST, DELETE) and `{prefix}/sections` (GET, POST, DELETE), login required.

    A person sees the shared topics plus their own; what a save, a move and a delete do to shared and own topics is in
    common/owned_topics.py. A lab with its own topic fields passes its `shape` and the request model (`shared` included)."""
    _check_table(table)
    router = APIRouter(prefix=prefix, tags=[tag], dependencies=[Depends(get_current_user_id)])

    @router.get("/topics")
    async def get_topics(user_id: int = Depends(get_current_user_id)) -> List[dict]:
        return fetch_owned(table, shape, user_id)

    async def save_topic_endpoint(payload, user_id: int = Depends(get_current_user_id)) -> dict:
        data = payload.model_dump()
        shared = data.pop("shared")
        try:
            save_owned(table, shape, data, user_id, is_admin_user(user_id), shared)
        except TopicError as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))
        return {"status": "success"}

    # The request model differs per lab and this module postpones annotations, so FastAPI could not resolve `topic_model` by
    # name (it would treat `payload` as a query parameter): set the real classes.
    save_topic_endpoint.__annotations__ = {"payload": topic_model, "user_id": int, "return": dict}
    router.post("/topics")(save_topic_endpoint)

    @router.delete("/topics")
    async def delete_topic_endpoint(topic_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
        try:
            delete_owned(table, topic_id, user_id, is_admin_user(user_id))
        except TopicError as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))
        return {"status": "success"}

    @router.get("/sections")
    async def get_sections(user_id: int = Depends(get_current_user_id)) -> List[dict]:
        return fetch_lab_sections(user_id, section_lab)

    @router.post("/sections")
    async def save_section(payload: TopicLabSectionIn, user_id: int = Depends(get_current_user_id)) -> dict:
        save_lab_section(user_id, section_lab, payload.name)
        return {"status": "success"}

    @router.delete("/sections")
    async def delete_section(name: str, user_id: int = Depends(get_current_user_id)) -> dict:
        if not delete_custom_lab_section(user_id, section_lab, name):
            raise HTTPException(status_code=404, detail="Only a pattern or category you added can be removed")
        return {"status": "success"}

    return router
