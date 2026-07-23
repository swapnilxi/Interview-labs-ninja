"""FastAPI router for application configuration.

Endpoints:
  GET  /config/settings              — Fetch current settings
  POST /config/settings              — Save settings
  GET  /config/ollama-status         — Probe Ollama instance & return available models
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from modules.common.db import fetch_settings, save_settings

router = APIRouter(prefix="/config", tags=["config"])


class SettingsPayload(BaseModel):
    questionModel: str
    answerModel: str
    geminiKey: Optional[str] = ""
    openaiKey: Optional[str] = ""
    anthropicKey: Optional[str] = ""
    deepseekKey: Optional[str] = ""
    groqKey: Optional[str] = ""
    ollamaUrl: Optional[str] = "http://localhost:11434"
    ollamaModel: Optional[str] = "llama3.2"


@router.get("/settings")
async def get_settings() -> dict:
    return fetch_settings()


@router.post("/settings")
async def post_settings(payload: SettingsPayload) -> dict:
    save_settings(payload.model_dump())
    return {"status": "saved"}


@router.get("/ollama-status")
async def ollama_status(url: Optional[str] = None) -> dict:
    """Probe an Ollama server and return the list of pulled models.

    Args:
        url: Optional override URL (e.g. from the URL field before saving).
             Falls back to the saved setting if not provided.

    Returns:
        {
          "running": bool,
          "url": str,
          "models": [{"name": str, "size_gb": float, "modified": str}],
          "error": str | null   # human-readable if not running
        }
    """
    settings = fetch_settings()
    probe_url = (url or settings.get("ollamaUrl", "http://localhost:11434")).rstrip("/")

    # ── Probe /api/tags ──────────────────────────────────────────────────────
    tags_url = f"{probe_url}/api/tags"
    try:
        req = urllib.request.Request(tags_url, method="GET")
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read())
    except urllib.error.URLError as exc:
        return {
            "running": False,
            "url": probe_url,
            "models": [],
            "error": f"Could not connect: {exc.reason}",
        }
    except Exception as exc:
        return {
            "running": False,
            "url": probe_url,
            "models": [],
            "error": str(exc),
        }

    # ── Parse model list ─────────────────────────────────────────────────────
    raw_models = data.get("models", [])
    models = []
    for m in raw_models:
        size_bytes = m.get("size", 0)
        size_gb = round(size_bytes / 1_073_741_824, 1) if size_bytes else None
        models.append({
            "name": m.get("name", ""),
            "size_gb": size_gb,
            "modified": m.get("modified_at", ""),
        })

    return {
        "running": True,
        "url": probe_url,
        "models": models,
        "error": None,
    }
