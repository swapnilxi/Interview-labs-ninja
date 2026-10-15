"""FastAPI dependencies that resolve the caller's identity from a Bearer JWT."""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from modules.auth.db import get_permission_overrides, get_user_by_id
from modules.auth.security import decode_token

_bearer = HTTPBearer(auto_error=True)
_optional_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    claims = decode_token(creds.credentials)
    if claims is None:
        raise _CREDENTIALS_ERROR
    try:
        user_id = int(claims["sub"])
    except (KeyError, ValueError):
        raise _CREDENTIALS_ERROR
    user = get_user_by_id(user_id)
    if user is None:
        raise _CREDENTIALS_ERROR
    user["permission_overrides"] = get_permission_overrides(user_id)
    return user


def get_current_active_user(user: dict = Depends(get_current_user)) -> dict:
    """Like get_current_user, but 403s for an account that isn't approved yet (or was
    rejected). Signing up and /auth/me stay reachable regardless of status (see
    modules/auth/router.py) so the frontend can always tell the caller why they're
    blocked; everything else gates through here."""
    account_status = user.get("status", "approved")
    if account_status == "pending":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account is pending admin approval.")
    if account_status != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account was not approved.")
    return user


def get_current_user_id(user: dict = Depends(get_current_active_user)) -> int:
    return user["id"]


def get_optional_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer)) -> Optional[dict]:
    if not creds:
        return None
    claims = decode_token(creds.credentials)
    if not claims or "sub" not in claims:
        return None
    try:
        user_id = int(claims["sub"])
    except (KeyError, ValueError):
        return None
    user = get_user_by_id(user_id)
    if user:
        user["permission_overrides"] = get_permission_overrides(user_id)
    return user


def get_optional_user_id(user: Optional[dict] = Depends(get_optional_user)) -> Optional[int]:
    return user["id"] if user else None


# Role ladder: user < editor < admin < superadmin. "editor" may change LMS content only;
# admin additionally manages users; superadmin additionally manages admins/superadmins.
ROLES = ("user", "editor", "admin", "superadmin")
EDITOR_ROLES = frozenset({"editor", "admin", "superadmin"})
ADMIN_ROLES = frozenset({"admin", "superadmin"})


def can_edit(user: dict) -> bool:
    return user.get("role") in EDITOR_ROLES


def get_current_admin(user: dict = Depends(get_current_active_user)) -> dict:
    """Like get_current_user, but 403s unless the caller is an admin or superadmin."""
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


def get_current_editor(user: dict = Depends(get_current_active_user)) -> dict:
    """403s unless the caller is an editor, admin or superadmin."""
    if not can_edit(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor, admin or superadmin role required to edit",
        )
    return user


# ── Per-user permission overrides on top of the role ladder ─────────────────────────────
#
# A permission key is a free-form "module:action" string (e.g. "ai_lms:edit"). Each role
# implies a default set; a row in user_permissions can override one key per user to grant
# a permission a role doesn't imply, or revoke one it does (see modules/auth/db.py). This
# lets e.g. a plain "user" edit ai_lms content without being a global "editor", or an
# "admin" keep "users:manage" while losing "users:delete".
#
# users:manage/users:delete are themselves admin-equivalent capabilities -- granting or
# revoking either is gated to superadmin-only wherever it's exposed, the same way changing
# an admin-level role already is (see admin_router.py).
ADMIN_EQUIVALENT_PERMISSIONS = frozenset({"users:manage", "users:delete"})
KNOWN_PERMISSIONS = frozenset({"ai_lms:edit", *ADMIN_EQUIVALENT_PERMISSIONS})
DEFAULT_PERMISSIONS: dict[str, frozenset[str]] = {
    "editor": frozenset({"ai_lms:edit"}),
    "admin": frozenset({"ai_lms:edit"} | ADMIN_EQUIVALENT_PERMISSIONS),
    "superadmin": frozenset({"ai_lms:edit"} | ADMIN_EQUIVALENT_PERMISSIONS),
}


def has_permission(user: dict, permission: str) -> bool:
    overrides = user.get("permission_overrides") or {}
    if permission in overrides:
        return overrides[permission]
    return permission in DEFAULT_PERMISSIONS.get(user.get("role", "user"), frozenset())


def effective_permissions(user: dict) -> list[str]:
    """The merged (role default + overrides) permission set, for exposing to the client."""
    return sorted(p for p in KNOWN_PERMISSIONS if has_permission(user, p))


def require_permission(permission: str):
    """Dependency factory: 403s unless the caller holds `permission` (by role default or
    an explicit grant override)."""

    def _dependency(user: dict = Depends(get_current_active_user)) -> dict:
        if not has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"'{permission}' permission required",
            )
        return user

    return _dependency
