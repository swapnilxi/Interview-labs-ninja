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

# ── Point the DB at the bundled sqlite file in backend/data/ ─────────────────
# Vercel bundles the repo at /var/task — resolve from there.
# The LABNINJA_TEST_DB_PATH env var lets local tests override this.
if not os.environ.get("LABNINJA_TEST_DB_PATH"):
    _bundled_db = ROOT_DIR / "backend" / "data" / "lab_ninja.sqlite3"
    if _bundled_db.exists():
        os.environ["LABNINJA_TEST_DB_PATH"] = str(_bundled_db)

# ── Import FastAPI app ────────────────────────────────────────────────────────
from backend.main import app  # noqa: E402

# ── Wrap with mangum for Vercel's Lambda runtime ─────────────────────────────
from mangum import Mangum  # noqa: E402

handler = Mangum(app, lifespan="auto")

