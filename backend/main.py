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

# To-do module
from modules.todo.router import router as todo_router
from modules.todo.quick_router import router as quick_router
from modules.todo.projects_router import router as projects_router
from modules.todo.pareto_router import router as pareto_router


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Lab-Ninja API", version=__version__, lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(session_router)
app.include_router(dsa_router)
app.include_router(cv_router)
app.include_router(sd_router)
app.include_router(todo_router)
app.include_router(quick_router)
app.include_router(projects_router)
app.include_router(pareto_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "lab-ninja-api", "version": __version__}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)

# To run locally:
#   python main.py                                  (bootstraps uv automatically)
#   uv run uvicorn main:app --reload --port 8000     (with autoreload, from backend/)
