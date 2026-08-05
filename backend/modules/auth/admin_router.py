"""Admin-only endpoints: system overview + user management.

Every route depends on `get_current_admin`, so a non-admin (or guest) gets 403
(or 401 with no token). Admin is granted via the LABNINJA_ADMIN_EMAILS env
allow-list (see modules/auth/db.promote_admins_from_env) or by another admin
promoting a user through PATCH /admin/users/{id}/role.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from modules.auth import db as auth_db
from modules.auth.dependencies import get_current_admin
from modules.auth.security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])


class RoleUpdateRequest(BaseModel):
    role: str = Field(pattern="^(user|admin)$")


class PasswordResetRequest(BaseModel):
    password: str = Field(min_length=8)


@router.get("/stats")
async def get_stats(_admin: dict = Depends(get_current_admin)) -> dict:
    return auth_db.system_stats()


@router.get("/users")
async def get_users(
    search: str | None = Query(default=None),
    _admin: dict = Depends(get_current_admin),
) -> list[dict]:
    return auth_db.list_users(search=search.strip() if search else None)


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    payload: RoleUpdateRequest,
    admin: dict = Depends(get_current_admin),
) -> dict:
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Guard against an admin demoting the last remaining admin (including
    # themselves), which would lock everyone out of the portal.
    if payload.role != "admin" and target["role"] == "admin" and auth_db.count_admins() <= 1:
        raise HTTPException(status_code=400, detail="Cannot demote the last remaining admin")
    updated = auth_db.set_user_role(user_id, payload.role)
    return {
        "id": updated["id"],
        "email": updated["email"],
        "display_name": updated["display_name"],
        "role": updated["role"],
    }


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    payload: PasswordResetRequest,
    _admin: dict = Depends(get_current_admin),
) -> dict:
    if auth_db.get_user_by_id(user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    auth_db.set_user_password(user_id, hash_password(payload.password))
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: dict = Depends(get_current_admin),
) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account here")
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "admin" and auth_db.count_admins() <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining admin")
    auth_db.delete_user(user_id)
    return {"ok": True}
