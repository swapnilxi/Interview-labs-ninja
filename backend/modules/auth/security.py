"""Password hashing and JWT issuance/verification for the auth module."""

from __future__ import annotations

import os
import secrets
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(days=30)


def _get_secret() -> str:
    secret = os.environ.get("LABNINJA_JWT_SECRET")
    if secret:
        return secret
    # Dev fallback only: generated once per process, so restarting the server
    # invalidates every previously-issued token. Never used if the env var is set.
    warnings.warn(
        "LABNINJA_JWT_SECRET is not set — using an ephemeral per-process secret. "
        "Set LABNINJA_JWT_SECRET before deploying, or logins won't survive a restart.",
        stacklevel=2,
    )
    global _EPHEMERAL_SECRET
    try:
        return _EPHEMERAL_SECRET
    except NameError:
        _EPHEMERAL_SECRET = secrets.token_hex(32)
        return _EPHEMERAL_SECRET


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _pwd_context.verify(password, password_hash)


def create_access_token(user_id: int, email: str) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + ACCESS_TOKEN_TTL,
    }
    return jwt.encode(claims, _get_secret(), algorithm=_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _get_secret(), algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
