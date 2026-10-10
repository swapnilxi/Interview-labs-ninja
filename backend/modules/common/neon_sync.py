"""Keeps a local SQLite file durable across Vercel's ephemeral /tmp by storing the
whole file as a blob in Neon Postgres (table `sqlite_snapshots`), instead of rewriting
every module's SQLite-flavored SQL against a second dialect.

No-ops everywhere if DATABASE_URL isn't set, so local dev (no Neon configured) behaves
exactly as before this module existed. See backend/scripts/db_backup.py for the CLI
wrapper around the same two operations, and ai-lms-feature persistence plan for context.
"""

from __future__ import annotations

import os

from starlette.types import ASGIApp, Receive, Scope, Send

_DDL = """
CREATE TABLE IF NOT EXISTS sqlite_snapshots (
    db_name TEXT PRIMARY KEY,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
)
"""


def _database_url() -> str | None:
    return os.environ.get("DATABASE_URL") or None


def _connect():
    import psycopg

    return psycopg.connect(_database_url())


def download_snapshot(db_name: str) -> bytes | None:
    """Return the latest stored bytes for db_name, or None if Neon isn't configured
    or has nothing stored yet (e.g. before the first push)."""
    if not _database_url():
        return None
    try:
        with _connect() as conn:
            conn.execute(_DDL)
            row = conn.execute(
                "SELECT data FROM sqlite_snapshots WHERE db_name = %s", (db_name,)
            ).fetchone()
            return bytes(row[0]) if row else None
    except Exception as exc:  # pragma: no cover - network/driver errors, never fatal
        print(f"[neon_sync] download_snapshot({db_name!r}) failed: {exc}")
        return None


def upload_snapshot(db_name: str, file_path: str, updated_by: str = "auto-write") -> bool:
    """Push the given local sqlite file's current bytes to Neon as the latest
    snapshot. Returns whether it succeeded; never raises."""
    if not _database_url():
        return False
    try:
        with open(file_path, "rb") as f:
            data = f.read()
        with _connect() as conn:
            conn.execute(_DDL)
            conn.execute(
                """
                INSERT INTO sqlite_snapshots (db_name, data, updated_at, updated_by)
                VALUES (%s, %s, now(), %s)
                ON CONFLICT (db_name) DO UPDATE
                SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
                """,
                (db_name, data, updated_by),
            )
            conn.commit()
        return True
    except Exception as exc:  # pragma: no cover - network/driver errors, never fatal
        print(f"[neon_sync] upload_snapshot({db_name!r}) failed: {exc}")
        return False


class NeonSyncMiddleware:
    """Pure ASGI middleware (see RateLimitMiddleware's docstring for why pure-ASGI
    over BaseHTTPMiddleware): after any non-GET request that completes with a 2xx/3xx
    status, pushes the current lab_ninja.sqlite3 to Neon so the next cold start (which
    may land on a different, unrelated /tmp) picks up what was just written instead of
    the stale git-committed file. No-ops (via upload_snapshot) when DATABASE_URL isn't
    configured, so local dev pays no cost."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return
        if not _database_url():
            await self.app(scope, receive, send)
            return

        status_holder: dict[str, int | None] = {"status": None}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
            await send(message)

        await self.app(scope, receive, send_wrapper)

        status = status_holder["status"]
        if status is not None and status < 400:
            from modules.common.db import get_db_path

            upload_snapshot("lab_ninja", get_db_path())
