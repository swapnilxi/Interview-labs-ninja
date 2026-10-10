"""Self-service access requests: any logged-in user can ask for a role bump or a specific
permission; an admin reviews it from /admin/access-requests (see admin_router.py)."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from modules.auth import db as auth_db
from modules.auth.dependencies import KNOWN_PERMISSIONS, get_current_active_user

router = APIRouter(prefix="/access-requests", tags=["access-requests"])


class AccessRequestCreate(BaseModel):
    # 'user' is excluded -- it's a downgrade, not something to request.
    requested_role: str | None = Field(default=None, pattern="^(editor|admin|superadmin)$")
    permission: str | None = None
    message: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def _exactly_one(self) -> "AccessRequestCreate":
        if (self.requested_role is None) == (self.permission is None):
            raise ValueError("Set exactly one of requested_role or permission")
        if self.permission is not None and self.permission not in KNOWN_PERMISSIONS:
            raise ValueError(f"Unknown permission '{self.permission}'")
        return self


@router.post("", status_code=201)
async def create_access_request(payload: AccessRequestCreate, user: dict = Depends(get_current_active_user)) -> dict:
    if auth_db.has_pending_duplicate(user["id"], payload.requested_role, payload.permission):
        raise HTTPException(status_code=409, detail="You already have a pending request for that")
    try:
        return auth_db.create_access_request(
            user["id"], payload.requested_role, payload.permission, payload.message
        )
    except sqlite3.IntegrityError:
        # Race-safe backstop for the same partial-unique-index check above (same idiom as
        # signup's IntegrityError -> 409 in auth/router.py).
        raise HTTPException(status_code=409, detail="You already have a pending request for that")


@router.get("/me")
async def my_access_requests(user: dict = Depends(get_current_active_user)) -> list[dict]:
    return auth_db.list_access_requests_for_user(user["id"])
