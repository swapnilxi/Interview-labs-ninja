"""FastAPI router for application configuration.

Endpoints:
  GET  /config/ollama-status         — Probe Ollama instance & return available models
  POST /config/test-key              — Make one real call to a provider to confirm a key works

Note: there is intentionally no settings GET/POST here. AI provider keys and
model choices live only in the browser's localStorage (see
frontend/src/lib/services/settingsService.ts) and are sent with each AI
request — never persisted server-side. That's what lets one deployment be
shared by multiple people, each using their own keys. test-key is unauthenticated
for the same reason the Config page itself is guest-accessible — the key
being tested is the caller's own, supplied in the request body, never stored.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from modules.common.ai_client import test_provider_key

router = APIRouter(prefix="/config", tags=["config"])


class TestKeyRequest(BaseModel):
    provider: str
    api_key: str


@router.post("/test-key")
async def test_key(payload: TestKeyRequest) -> dict:
    ok, message = test_provider_key(payload.provider, payload.api_key)
    return {"ok": ok, "message": message}


@router.get("/ollama-status")
async def ollama_status(url: Optional[str] = None) -> dict:
    """Probe an Ollama server and return the list of pulled models.

    Args:
        url: Ollama base URL to probe, e.g. http://localhost:11434.

    Returns:
        {
          "running": bool,
          "url": str,
          "models": [{"name": str, "size_gb": float, "modified": str}],
          "error": str | null   # human-readable if not running
        }
    """
    probe_url = (url or "http://localhost:11434").rstrip("/")

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
