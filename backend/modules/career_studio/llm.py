"""Thin wrapper over the shared multi-provider AI client.

The caller (routers) supplies an AISettings instance straight from the request
body — provider keys ride per-request and are never stored server-side. Mirrors
linkedin_post_generator/llm.py.
"""

from __future__ import annotations

from modules.common.ai_client import (
    AISettings,
    call_ai_text,
    extract_json_array,
    extract_json_object,
)


def generate_text(prompt: str, settings: AISettings) -> str:
    return call_ai_text(prompt, settings)


def generate_json(prompt: str, settings: AISettings) -> dict:
    return extract_json_object(call_ai_text(prompt, settings))


def generate_json_array(prompt: str, settings: AISettings) -> list[dict]:
    return extract_json_array(call_ai_text(prompt, settings))
