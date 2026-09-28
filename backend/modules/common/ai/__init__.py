"""Shared multi-provider AI client.

Every endpoint that calls an LLM accepts an `AISettings` payload straight from
the request. Provider keys resolve config-first: whatever the frontend sends
(sourced from the user's own browser localStorage / Config page) takes
priority; a key configured in this server's own backend/.env is used only as a
fallback when the client didn't supply one. Mirrors the same priority already
used on the Next.js side (frontend/fe-apis/lms/ai.ts's `settings.X || process.env.X`).
Note the tradeoff: on a deployment shared by multiple people, a visitor with no
key of their own now silently uses (and bills) whatever key is in this
server's .env, rather than failing with "no key configured" -- fine for a
single-user/local setup, worth knowing for a shared one. The model follows the
same rule: an explicit model id in the request wins, and an empty one resolves
via resolve_model() to the AI_PROVIDER / AI_MODEL default from the env.

This package replaces what used to be one single large file under
modules/common/. The split mirrors that file's original internal structure:
  - settings.py  — AISettings + GROQ_MODELS + env-default model resolution
  - utils.py     — JSON extraction + HTTP error formatting
  - providers.py — the per-provider _call_X implementations
  - client.py    — the public orchestration layer (call_ai_text /
                    call_ai_vision / stream_ai_text / test_provider_key)

External callers should import from this package (`from modules.common.ai
import ...`), exactly like they used to from the old single-file module.
"""

from __future__ import annotations

from .client import call_ai_text, call_ai_vision, stream_ai_text, test_provider_key
from .settings import AISettings, GROQ_MODELS, ai_default_info, resolve_model
from .utils import extract_json_array, extract_json_object

__all__ = [
    "AISettings",
    "GROQ_MODELS",
    "ai_default_info",
    "resolve_model",
    "call_ai_text",
    "call_ai_vision",
    "stream_ai_text",
    "extract_json_array",
    "extract_json_object",
    "test_provider_key",
]
