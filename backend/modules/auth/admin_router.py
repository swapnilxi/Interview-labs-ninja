"""Admin-only endpoints: system overview, user management, permission grants, and
access-request review.

Routes depend on `require_permission("users:manage")` or `require_permission("users:delete")`
(see modules/auth/dependencies.py), so a non-admin without that permission (or a guest) gets
403/401. Admin is granted via the LABNINJA_ADMIN_EMAILS env allow-list (see
modules/auth/db.promote_admins_from_env) or by another admin promoting a user through
PATCH /admin/users/{id}/role; a narrower users:manage/users:delete grant can also be given
directly, or via the access-request workflow below, without a full role change.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from modules.auth import db as auth_db
from modules.auth.dependencies import (
    ADMIN_EQUIVALENT_PERMISSIONS,
    KNOWN_PERMISSIONS,
    effective_permissions,
    require_permission,
)
from modules.auth.security import hash_password
from modules.common.db import get_db_path
from modules.common.neon_sync import download_snapshot, upload_snapshot

router = APIRouter(prefix="/admin", tags=["admin"])


class RoleUpdateRequest(BaseModel):
    role: str = Field(pattern="^(user|editor|admin|superadmin)$")


class PasswordResetRequest(BaseModel):
    password: str = Field(min_length=8)


class PermissionUpdateRequest(BaseModel):
    permission: str
    allowed: bool = True


class ReviewRequest(BaseModel):
    review_note: str = Field(default="", max_length=2000)


def _require_superadmin_for_admin_equivalent(admin: dict, permission: str) -> None:
    """Granting/revoking users:manage or users:delete is itself an admin-equivalent change --
    gated to superadmin-only so a users:manage holder can't grant themself (or anyone) more
    than they were given, the same way changing an admin-level role already is below."""
    if permission in ADMIN_EQUIVALENT_PERMISSIONS and admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can grant or revoke that permission")


@router.get("/stats")
async def get_stats(_admin: dict = Depends(require_permission("users:manage"))) -> dict:
    return auth_db.system_stats()


@router.get("/users")
async def get_users(
    search: str | None = Query(default=None),
    _admin: dict = Depends(require_permission("users:manage")),
) -> list[dict]:
    users = auth_db.list_users(search=search.strip() if search else None)
    for u in users:
        u["permissions"] = effective_permissions(u)
    return users


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    payload: RoleUpdateRequest,
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Only a superadmin may grant, revoke or touch admin-level roles; plain admins manage
    # user/editor accounts only.
    if admin["role"] != "superadmin" and (
        payload.role in ("admin", "superadmin") or target["role"] in ("admin", "superadmin")
    ):
        raise HTTPException(status_code=403, detail="Only a superadmin can change admin-level roles")
    # Guard against demoting the last remaining admin/superadmin (including
    # themselves), which would lock everyone out of the portal.
    if (
        payload.role not in ("admin", "superadmin")
        and target["role"] in ("admin", "superadmin")
        and auth_db.count_admins() <= 1
    ):
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
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] in ("admin", "superadmin") and admin["role"] != "superadmin" and target["id"] != admin["id"]:
        raise HTTPException(status_code=403, detail="Only a superadmin can reset an admin-level password")
    auth_db.set_user_password(user_id, hash_password(payload.password))
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: dict = Depends(require_permission("users:delete")),
) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account here")
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] in ("admin", "superadmin") and admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can delete an admin-level account")
    if target["role"] in ("admin", "superadmin") and auth_db.count_admins() <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining admin")
    auth_db.delete_user(user_id)
    return {"ok": True}


@router.post("/users/{user_id}/approve")
async def approve_user_account(
    user_id: int,
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] in ("admin", "superadmin") and admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can approve an admin-level account")
    updated = auth_db.set_user_status(user_id, "approved")
    return {"id": updated["id"], "email": updated["email"], "status": updated["status"]}


@router.post("/users/{user_id}/reject")
async def reject_user_account(
    user_id: int,
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot reject your own account here")
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] in ("admin", "superadmin") and admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can reject an admin-level account")
    if target["role"] in ("admin", "superadmin") and auth_db.count_admins() <= 1:
        raise HTTPException(status_code=400, detail="Cannot reject the last remaining admin")
    updated = auth_db.set_user_status(user_id, "rejected")
    return {"id": updated["id"], "email": updated["email"], "status": updated["status"]}


@router.post("/users/{user_id}/permissions")
async def grant_user_permission(
    user_id: int,
    payload: PermissionUpdateRequest,
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    if payload.permission not in KNOWN_PERMISSIONS:
        raise HTTPException(status_code=422, detail=f"Unknown permission '{payload.permission}'")
    _require_superadmin_for_admin_equivalent(admin, payload.permission)
    target = auth_db.get_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    auth_db.set_permission_override(user_id, payload.permission, payload.allowed, granted_by=admin["id"])
    return {"ok": True, "permission_overrides": auth_db.get_permission_overrides(user_id)}


@router.delete("/users/{user_id}/permissions/{permission}")
async def clear_user_permission(
    user_id: int,
    permission: str,
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    _require_superadmin_for_admin_equivalent(admin, permission)
    auth_db.clear_permission_override(user_id, permission)
    return {"ok": True, "permission_overrides": auth_db.get_permission_overrides(user_id)}


@router.get("/access-requests")
async def list_access_requests(
    status_filter: str | None = Query(default=None, alias="status", pattern="^(pending|approved|rejected)$"),
    _admin: dict = Depends(require_permission("users:manage")),
) -> list[dict]:
    requests = auth_db.list_access_requests(status=status_filter)
    users = {u["id"]: u for u in auth_db.list_users()}
    for r in requests:
        requester = users.get(r["user_id"])
        r["user_email"] = requester["email"] if requester else None
        r["user_display_name"] = requester["display_name"] if requester else None
        r["user_status"] = requester["status"] if requester else None
    return requests


@router.post("/access-requests/{request_id}/approve")
async def approve_access_request(
    request_id: int,
    payload: ReviewRequest,
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    req = auth_db.get_access_request_by_id(request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request was already {req['status']}")

    if req["requested_role"] is not None:
        # Reuse the role-change endpoint's own logic (superadmin/last-admin guards) by
        # calling it directly as a plain function -- Depends() defaults are only resolved
        # by the ASGI layer, so a direct call just needs real arguments.
        await update_user_role(req["user_id"], RoleUpdateRequest(role=req["requested_role"]), admin)
    else:
        _require_superadmin_for_admin_equivalent(admin, req["permission"])
        auth_db.set_permission_override(req["user_id"], req["permission"], True, granted_by=admin["id"])

    decided = auth_db.decide_access_request(request_id, "approved", admin["id"], payload.review_note)
    if decided is None:
        raise HTTPException(status_code=409, detail="Request was already decided")
    return decided


@router.post("/access-requests/{request_id}/deny")
async def deny_access_request(
    request_id: int,
    payload: ReviewRequest,
    admin: dict = Depends(require_permission("users:manage")),
) -> dict:
    req = auth_db.get_access_request_by_id(request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request was already {req['status']}")

    decided = auth_db.decide_access_request(request_id, "rejected", admin["id"], payload.review_note)
    if decided is None:
        raise HTTPException(status_code=409, detail="Request was already decided")
    return decided


def _require_superadmin(admin: dict) -> None:
    if admin["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can sync the production database")


@router.post("/db/push")
async def push_db_to_production(admin: dict = Depends(require_permission("users:manage"))) -> dict:
    """Push the current lab_ninja.sqlite3 to Neon as the latest snapshot. See
    modules/common/neon_sync.py -- this is the same upload the post-write middleware
    does automatically; this route lets an admin trigger it on demand (e.g. right after
    local changes they want live without waiting for the next write to a deployed
    instance)."""
    _require_superadmin(admin)
    ok = upload_snapshot("lab_ninja", get_db_path(), updated_by=f"admin-push:{admin['email']}")
    if not ok:
        raise HTTPException(status_code=503, detail="DATABASE_URL isn't configured, or the push to Neon failed")
    return {"status": "pushed"}


@router.post("/db/pull")
async def pull_db_from_production(admin: dict = Depends(require_permission("users:manage"))) -> dict:
    """Overwrite the local lab_ninja.sqlite3 with the latest Neon snapshot. Destructive
    to whatever's currently in the local file -- the admin UI confirms this before
    calling it."""
    _require_superadmin(admin)
    snapshot = download_snapshot("lab_ninja")
    if snapshot is None:
        raise HTTPException(status_code=503, detail="DATABASE_URL isn't configured, or Neon has no snapshot yet")
    db_path = get_db_path()
    with open(db_path, "wb") as f:
        f.write(snapshot)
    return {"status": "pulled"}
