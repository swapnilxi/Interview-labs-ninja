"""Minimal ASGI app wrapped in the REAL backend NeonSyncMiddleware (server C)."""
import sqlite3, sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from modules.common.db import get_db_path
from modules.common.neon_sync import NeonSyncMiddleware

async def create(request):
    title = (await request.json())["title"]
    with sqlite3.connect(get_db_path()) as c:
        cur = c.execute("insert into tasks (user_id,title,status,priority,created_at,updated_at) values (8,?,'todo','medium',datetime('now'),datetime('now'))", (title,))
        return JSONResponse({"id": cur.lastrowid, "title": title})

async def count(request):
    with sqlite3.connect(get_db_path()) as c:
        n = c.execute("select count(*) from tasks where title = ?", (request.query_params["title"],)).fetchone()[0]
    return JSONResponse({"count": n})

app = NeonSyncMiddleware(Starlette(routes=[Route("/todo/tasks", create, methods=["POST"]), Route("/todo/count", count)]))
