"""
api/index.py — Vercel Python serverless entrypoint.

Vercel invokes this file as an AWS Lambda-style handler. `mangum` bridges
the ASGI interface of FastAPI to the Lambda event/context model.

Routes:  /api/**  (all traffic under /api is rewritten here via vercel.json)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# ── sys.path surgery so `backend/` and its `modules/` are importable ─────────
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
for p in (str(BACKEND_DIR), str(ROOT_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

# ── Copy bundled DBs to /tmp so FastAPI routes can write ─────────────────────
# Vercel mounts the git-tracked repo as read-only; /tmp is the only writable
# directory. We seed from the bundled file on cold start (empty /tmp) and reuse
# the writable copy on subsequent requests in the same warm instance.

import shutil  # noqa: E402

def _seed_db_to_tmp(db_name: str) -> str:
    """Copy the bundled sqlite DB to /tmp/<db_name>.sqlite3 if not already there."""
    tmp_path = f"/tmp/{db_name}.sqlite3"
    if not os.path.exists(tmp_path):
        candidates = [
            ROOT_DIR / "backend" / "data" / f"{db_name}.sqlite3",
            ROOT_DIR / "backend" / f"{db_name}.sqlite3",
        ]
        src = next((p for p in candidates if p.exists()), None)
        if src:
            shutil.copy2(src, tmp_path)
        # No src → FastAPI/SQLAlchemy/sqlite3 will create a blank DB at tmp_path
    return tmp_path

# lab_ninja — primary app DB (sessions, questions, auth, todos, etc.)
_lab_ninja_tmp = _seed_db_to_tmp("lab_ninja")
os.environ.setdefault("LABNINJA_TEST_DB_PATH", _lab_ninja_tmp)

# career_studio — separate DB for the Career Studio module
_career_tmp = _seed_db_to_tmp("career_studio")
os.environ.setdefault("CAREER_STUDIO_DB_PATH", _career_tmp)

# ── Import FastAPI app ────────────────────────────────────────────────────────
from backend.main import app  # noqa: E402

# ── Wrap with mangum for Vercel's Lambda runtime ─────────────────────────────
from mangum import Mangum  # noqa: E402

handler = Mangum(app, lifespan="auto")

