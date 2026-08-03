"""FastAPI backend for Lab-Ninja.

All business logic lives in pluggable modules under modules/.
This file is purely application wiring.
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
_VENV_DIR = _BACKEND_DIR / ".venv"

# Re-exec under `uv run` whenever this file is launched directly (e.g. `python
# main.py`) with an interpreter that isn't the project's uv-managed venv, so
# dependencies are always resolved correctly regardless of the ambient python.
if __name__ == "__main__" and Path(sys.prefix).resolve() != _VENV_DIR.resolve():
    try:
        os.execvp(
            "uv",
            ["uv", "run", "--project", str(_BACKEND_DIR), "python", str(_BACKEND_DIR / "main.py"), *sys.argv[1:]],
        )
    except FileNotFoundError:
        sys.exit("uv is required to run this project: https://docs.astral.sh/uv/")

from dotenv import load_dotenv

# Load backend/.env (if present) before anything reads os.environ below —
# LABNINJA_JWT_SECRET, LABNINJA_CORS_ORIGINS, etc. Real env vars still win
# over the file, so this is safe to layer under a deployment's actual config.
load_dotenv(_BACKEND_DIR / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from modules.common import __version__
from modules.common.db import init_db

# Config / settings module
from modules.common.config_router import router as config_router

# Lab modules
from modules.dsa_lab.router import router as dsa_router
from modules.cv_lab.router import router as cv_router
from modules.system_design_lab.router import router as sd_router

# Daily session module
from modules.daily_session.daily_session import router as session_router
from modules.daily_session.daily_session import public_router as session_public_router

# LinkedIn post generator module
from modules.linkedin_post_generator.router import router as linkedin_router

# To-do module
from modules.todo.router import router as todo_router
from modules.todo.quick_router import router as quick_router
from modules.todo.projects_router import router as projects_router
from modules.todo.pareto_router import router as pareto_router
from modules.todo.import_router import router as import_router

# Auth module
from modules.auth.router import router as auth_router

# CAREER STUDIO INTEGRATION — self-contained module with its own sqlite DB
from modules.career_studio.db import init_career_db
from modules.career_studio.router import router as career_router
from modules.career_studio.analysis_router import router as career_analysis_router


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    init_db()
    init_career_db()  # CAREER STUDIO INTEGRATION — creates career_studio.sqlite3 tables
    yield


app = FastAPI(title="Lab-Ninja API", version=__version__, lifespan=_lifespan)

_cors_origins_env = os.environ.get("LABNINJA_CORS_ORIGINS")
_cors_origins = (
    [origin.strip() for origin in _cors_origins_env.split(",") if origin.strip()]
    if _cors_origins_env
    else ["http://localhost:4028"]
)

app.add_middleware(
    CORSMiddleware,
    # Set LABNINJA_CORS_ORIGINS (comma-separated) to your deployed frontend's
    # real origin(s) in production, e.g. "https://your-app.vercel.app".
    allow_origins=_cors_origins,
    # Auth is a Bearer `Authorization` header, not a cookie/session, so
    # credentialed CORS isn't needed here.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(config_router)
app.include_router(session_router)
app.include_router(session_public_router)
app.include_router(dsa_router)
app.include_router(cv_router)
app.include_router(sd_router)
app.include_router(linkedin_router)
app.include_router(todo_router)
app.include_router(quick_router)
app.include_router(projects_router)
app.include_router(pareto_router)
app.include_router(import_router)

# CAREER STUDIO INTEGRATION
app.include_router(career_router)
app.include_router(career_analysis_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "lab-ninja-api", "version": __version__}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8082)))

# To run locally:
#   python main.py                                  (bootstraps uv automatically)
#   uv run uvicorn main:app --reload --port 8082     (with autoreload, from backend/)
