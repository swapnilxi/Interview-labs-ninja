"""LLM helpers for the LinkedIn post generator.

Thin wrapper over modules.common.ai — the caller (router.py) supplies
an AISettings instance sourced straight from the request body.
"""

from __future__ import annotations

from modules.common.ai import AISettings, call_ai_text, extract_json_object


def generate_text(prompt: str, settings: AISettings) -> str:
    return call_ai_text(prompt, settings)


def generate_json(prompt: str, settings: AISettings) -> dict:
    text = call_ai_text(prompt, settings)
    return extract_json_object(text)
