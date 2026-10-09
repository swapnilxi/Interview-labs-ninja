"""A small, dependency-free rate limiter: fixed-window counters per caller, applied to
every HTTP request via RateLimitMiddleware (see main.py). Admin/superadmin are exempt;
everyone else (including guests, by IP) is capped. Only active in production by default --
see _enabled() -- so local development is never throttled.

Purely in-memory and per-process, which is the right tradeoff for this app's normal
deployment (a single long-running uvicorn process). If ever run on Vercel (api/index.py
wraps the app with Mangum for Lambda), each request may land on a different warm
container with its own memory, so the effective limit multiplies by however many
containers are concurrently warm there -- a known, accepted limitation, not a bug.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Optional

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from modules.auth.db import get_user_by_id
from modules.auth.security import decode_token

_WINDOW_SECONDS = 60
_EXEMPT_ROLES = frozenset({"admin", "superadmin"})
_SKIP_PATHS = frozenset({"/health"})

# key -> (window_start_epoch_seconds, count). Guarded by _lock; the critical section
# never awaits, so a plain threading.Lock is correct (and cheaper than asyncio.Lock,
# which is meant to yield to other coroutines -- the wrong primitive for a lock that
# must never be held across an await).
_buckets: dict[str, tuple[int, int]] = {}
_lock = threading.Lock()
_sweep_counter = 0


def _enabled() -> bool:
    override = os.environ.get("LABNINJA_RATE_LIMIT_ENABLED")
    if override is not None:
        return override.strip().lower() in ("1", "true", "on", "yes")
    # Reuses the same "are we deployed, not local dev" signal already used in
    # modules/ai_lms/class_folders.py's _writable().
    return bool(os.environ.get("VERCEL"))


def _limit_for(key: str) -> int:
    if key.startswith("user:"):
        return int(os.environ.get("LABNINJA_RATE_LIMIT_PER_MINUTE", "60"))
    return int(os.environ.get("LABNINJA_RATE_LIMIT_GUEST_PER_MINUTE", "20"))


def _header(scope: Scope, name: bytes) -> Optional[bytes]:
    for key, value in scope.get("headers", ()):
        if key.lower() == name:
            return value
    return None


def _client_ip(scope: Scope) -> str:
    forwarded = _header(scope, b"x-forwarded-for")
    if forwarded:
        return forwarded.decode("latin-1").split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


def _identify(scope: Scope) -> tuple[Optional[str], str]:
    """Returns (key, None) is never produced; returns (rate-limit key, role-for-logging).
    A valid token resolving to admin/superadmin yields a special "exempt" role."""
    auth = _header(scope, b"authorization")
    if auth and auth.lower().startswith(b"bearer "):
        token = auth[7:].decode("latin-1", errors="ignore")
        claims = decode_token(token)
        if claims is not None:
            try:
                user_id = int(claims["sub"])
            except (KeyError, ValueError):
                user_id = None
            if user_id is not None:
                user = get_user_by_id(user_id)
                if user is not None:
                    role = user.get("role", "user")
                    if role in _EXEMPT_ROLES:
                        return None, role
                    return f"user:{user_id}", role
    return f"ip:{_client_ip(scope)}", "guest"


def _check_and_increment(key: str) -> tuple[bool, int, int]:
    """Returns (allowed, remaining, retry_after_seconds)."""
    global _sweep_counter
    limit = _limit_for(key)
    now = int(time.time())
    window_start = (now // _WINDOW_SECONDS) * _WINDOW_SECONDS
    with _lock:
        _sweep_counter += 1
        if _sweep_counter % 500 == 0:
            for k, (start, _count) in list(_buckets.items()):
                if start < window_start:
                    del _buckets[k]
        start, count = _buckets.get(key, (window_start, 0))
        if start < window_start:
            start, count = window_start, 0
        count += 1
        _buckets[key] = (start, count)
    retry_after = _WINDOW_SECONDS - (now - start)
    return count <= limit, max(0, limit - count), max(1, retry_after)


class RateLimitMiddleware:
    """Pure ASGI middleware (not BaseHTTPMiddleware -- no body access is needed here, and
    BaseHTTPMiddleware's body-buffering machinery is pure overhead for a check that only
    ever reads headers). Added to the app BEFORE CORSMiddleware in main.py so CORS ends up
    the outermost layer and still decorates a 429 response (see Starlette's add_middleware:
    the last-added middleware wraps outermost)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Lifespan (startup/shutdown) and websocket scopes also flow through every user
        # middleware -- this must be the very first check, before anything else touches
        # `scope` as if it were an HTTP request, or app startup (init_db(), the
        # promote_*_from_env() calls) would never run.
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if not _enabled() or scope["method"] == "OPTIONS" or scope["path"] in _SKIP_PATHS:
            await self.app(scope, receive, send)
            return

        key, _role = _identify(scope)
        if key is None:
            await self.app(scope, receive, send)
            return

        allowed, remaining, retry_after = _check_and_increment(key)
        if not allowed:
            response = JSONResponse(
                {"detail": "Too many requests, please slow down."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        async def send_with_header(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-ratelimit-remaining", str(remaining).encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_header)
