"""Read-only web research (login required).

    POST /research/search   {query, fetch?}  ->  {query, results: [{title, url, snippet, text}]}

Twin: frontend/fe-apis/research/index.ts (nextjs-api mode). The search/fetch/cleaning code is web.py <-> web.ts.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id

from .web import MAX_FETCH, MAX_QUERY_CHARS, research

router = APIRouter(prefix="/research", tags=["research"])


class SearchPayload(BaseModel):
    query: Any = None
    fetch: Any = 3


@router.post("/search")
async def search(payload: SearchPayload, user_id: int = Depends(get_current_user_id)) -> dict:
    if not isinstance(payload.query, str) or not payload.query.strip():
        raise HTTPException(status_code=422, detail="query: a non-empty string is required.")
    fetch = payload.fetch if isinstance(payload.fetch, int) and not isinstance(payload.fetch, bool) else 3
    return research(payload.query[:MAX_QUERY_CHARS], fetch=min(max(fetch, 0), MAX_FETCH))
