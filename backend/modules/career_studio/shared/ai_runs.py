"""Audit helper: time an AI call and write one ai_runs row.

Usage:
    with track_ai_run(user_id, "resume_analyze", settings.model):
        text = call_ai_text(prompt, settings)
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Optional

from .db import _connect, _new_id


def insert_ai_run(
    user_id: Optional[str],
    feature: str,
    provider: Optional[str],
    model: Optional[str],
    latency_ms: Optional[int],
    status: str,
    error: Optional[str] = None,
) -> None:
    conn = _connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO ai_runs (id, user_id, feature, provider, model, latency_ms, status, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (_new_id(), None if user_id is None else str(user_id), feature, provider, model, latency_ms, status, error),
        )
        conn.commit()
    finally:
        conn.close()


def provider_of(model: str) -> str:
    """Best-effort provider label from a model id (mirrors ai_client._provider_order)."""
    m = (model or "").lower()
    if m.startswith("gemini") or m.startswith("gemma"):
        return "gemini"
    if m.startswith("deepseek"):
        return "deepseek"
    if m.startswith("gpt"):
        return "openai"
    if m.startswith("claude"):
        return "anthropic"
    if m == "ollama" or m.startswith("ollama::"):
        return "ollama"
    if "llama" in m or "mixtral" in m or "gemma2" in m:
        return "groq"
    return "unknown"


@contextmanager
def track_ai_run(user_id: Optional[str], feature: str, model: str):
    start = time.monotonic()
    status = "success"
    error: Optional[str] = None
    try:
        yield
    except Exception as exc:  # noqa: BLE001 — we re-raise after logging
        status = "error"
        error = str(exc)
        raise
    finally:
        latency_ms = int((time.monotonic() - start) * 1000)
        try:
            insert_ai_run(user_id, feature, provider_of(model), model, latency_ms, status, error)
        except Exception:
            # Never let audit logging break the actual request.
            pass
