"""AI memory endpoints (login required; every row belongs to the caller).

    GET    /memory?module=        the facts, strongest first (Config page)
    GET    /memory/lines?module=&topic=   prompt-ready lines (for the browser's direct-to-provider paths)
    POST   /memory/events         record or strengthen one fact
    DELETE /memory/{id}           forget one fact
    DELETE /memory?module=        forget everything (or one module's facts)

Twin: frontend/fe-apis/memory/index.ts (nextjs-api mode).
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id

from . import store

router = APIRouter(prefix="/memory", tags=["memory"])


class MemoryEvent(BaseModel):
    module: Any = None
    topic: Any = ""
    kind: Any = None
    fact: Any = None


@router.get("")
async def list_memory(module: Optional[str] = Query(None), user_id: int = Depends(get_current_user_id)) -> dict:
    return {"facts": store.list_facts(user_id, module)}


@router.get("/lines")
async def memory_lines(
    module: str = Query(...), topic: str = Query(""), user_id: int = Depends(get_current_user_id)
) -> dict:
    return {"lines": store.memory_lines(user_id, module, topic)}


@router.post("/events")
async def add_event(payload: MemoryEvent, user_id: int = Depends(get_current_user_id)) -> dict:
    try:
        return store.record(user_id, payload.module, payload.topic, payload.kind, payload.fact)
    except store.MemoryInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.delete("/{fact_id}")
async def forget_one(fact_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not store.delete_fact(user_id, fact_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "success"}


@router.delete("")
async def forget_all(module: Optional[str] = Query(None), user_id: int = Depends(get_current_user_id)) -> dict:
    return {"deleted": store.clear(user_id, module)}
