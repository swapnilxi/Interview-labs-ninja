"""FastAPI dependencies that resolve the caller's identity from a Bearer JWT."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from modules.auth.db import get_user_by_id
from modules.auth.security import decode_token

_bearer = HTTPBearer(auto_error=True)

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
    return user


def get_current_user_id(user: dict = Depends(get_current_user)) -> int:
    return user["id"]


# Role ladder: user < editor < admin < superadmin. "editor" may change LMS content only;
# admin additionally manages users; superadmin additionally manages admins/superadmins.
ROLES = ("user", "editor", "admin", "superadmin")
EDITOR_ROLES = frozenset({"editor", "admin", "superadmin"})
ADMIN_ROLES = frozenset({"admin", "superadmin"})


def can_edit(user: dict) -> bool:
    return user.get("role") in EDITOR_ROLES


def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    """Like get_current_user, but 403s unless the caller is an admin or superadmin."""
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


def get_current_editor(user: dict = Depends(get_current_user)) -> dict:
    """403s unless the caller is an editor, admin or superadmin."""
    if not can_edit(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor, admin or superadmin role required to edit",
        )
    return user
