"""PATCH-body handling shared by the ai_todo routers.

TypeScript twin: frontend/fe-apis/todo/_shared.ts (`patchUpdates`) — keep the two in sync.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable

from pydantic import BaseModel


def patch_updates(payload: BaseModel, nullable: Iterable[str]) -> Dict[str, Any]:
    """The columns a PATCH body asked to change.

    A field the client left out is never touched. A field sent as ``null`` is kept — and so
    written as NULL — only when it is in ``nullable``, i.e. "no due date" is a real value for
    that column; otherwise it is ignored, because a required column (title, status, ...) has
    no empty state. This replaces ``model_dump(exclude_none=True)``, which could not tell
    "left out" from "clear it", so a due date, once set, could never be removed.
    """
    allowed_null = set(nullable)
    sent = payload.model_dump(exclude_unset=True)
    return {key: value for key, value in sent.items() if value is not None or key in allowed_null}
