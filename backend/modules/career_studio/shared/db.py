"""Career Studio's shared connection primitives — raw sqlite3 against its OWN
database file, reused by every vertical's own db.py.

Mirrors the app's existing raw-sqlite idiom (see linkedin_post_generator/templates/db.py)
but points at a separate career_studio.sqlite3 so the module can be extracted to a
standalone service by copying this folder + its DB. Never imports the app's shared
DB module for connections; only the auth guard is reused (in the routers, by value).
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from pathlib import Path

from .schema import register

# ── Connection / init ──────────────────────────────────────────────────────────


def get_career_db_path() -> str:
    """The one career database: backend/data/career_studio.sqlite3.

    Only the explicit test overrides can point elsewhere (CAREER_STUDIO_DB_PATH / LABNINJA_DB_DIR);
    there is deliberately no fallback to any other location.
    """
    override = os.environ.get("CAREER_STUDIO_DB_PATH")
    if override:
        return override

    env_dir = os.environ.get("LABNINJA_DB_DIR")
    if env_dir:
        return str(Path(env_dir) / "career_studio.sqlite3")

    return str(Path(__file__).resolve().parent.parent.parent.parent / "data" / "career_studio.sqlite3")


def _connect() -> sqlite3.Connection:
    return sqlite3.connect(get_career_db_path())


def init_career_db() -> None:
    """Create the module's tables. Called once from main.py's lifespan."""
    conn = _connect()
    try:
        register(conn.cursor())
        conn.commit()
    finally:
        conn.close()


def _new_id() -> str:
    return uuid.uuid4().hex
