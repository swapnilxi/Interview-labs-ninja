"""AI provider selection/credentials model.

Split out of the single-file module this package replaces — see the package
docstring in modules/common/ai/__init__.py for the full picture.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

GROQ_MODELS = ("llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768")

PROVIDER_DEFAULT_MODELS = {
    "gemini": "gemini-flash-latest",
    "vertex": "vertex_gemini_gemini-2.5-flash",
    "deepseek": "deepseek-chat",
    "groq": "llama-3.3-70b-versatile",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-5",
    "openrouter": "openrouter/auto",
    "ollama": "ollama",
    "custom": "custom",
}
AI_PROVIDERS = tuple(PROVIDER_DEFAULT_MODELS)
FALLBACK_MODEL = "deepseek-chat"


def _env_provider() -> Optional[str]:
    provider = os.environ.get("AI_PROVIDER", "").strip().lower()
    return provider if provider in PROVIDER_DEFAULT_MODELS else None


def env_default_model() -> str:
    """Model id used when a request doesn't name one, from AI_PROVIDER / AI_MODEL in the env."""
    provider = _env_provider()
    model = os.environ.get("AI_MODEL", "").strip()
    if model:
        if provider == "ollama" and model != "ollama" and not model.startswith("ollama::"):
            return "ollama::" + model
        if provider == "vertex" and not model.startswith("vertex_gemini_"):
            return "vertex_gemini_" + model
        if provider == "custom":
            return "custom"
        return model
    if provider:
        return PROVIDER_DEFAULT_MODELS[provider]
    return FALLBACK_MODEL


def model_provider_hint(model: str) -> Optional[str]:
    """Provider a model id names by its own prefix (checked in _provider_order's order), or None."""
    if model.startswith("vertex_gemini_"):
        return "vertex"
    # Before the "/" check: pulled Ollama models can be named like hf.co/org/model.
    if model == "ollama" or model.startswith("ollama::"):
        return "ollama"
    if "/" in model or model.startswith("openrouter"):
        return "openrouter"
    if model.startswith("gemini") or model.startswith("gemma"):
        return "gemini"
    if model.startswith("deepseek"):
        return "deepseek"
    if model in GROQ_MODELS:
        return "groq"
    if model.startswith("gpt"):
        return "openai"
    if model.startswith("claude"):
        return "anthropic"
    if model == "custom":
        return "custom"
    return None


def resolve_model(requested: Optional[str]) -> str:
    """An explicit model id from the request wins; empty/None falls back to env_default_model()."""
    requested = (requested or "").strip()
    return requested or env_default_model()


def ai_default_info() -> dict:
    """Non-secret summary of the env-derived default (provider/model names only)."""
    raw_provider = os.environ.get("AI_PROVIDER", "").strip()
    raw_model = os.environ.get("AI_MODEL", "").strip()
    provider = _env_provider()
    warnings = []
    if raw_provider and provider is None:
        # Only echo short values, so a secret pasted into the wrong variable is never exposed.
        shown = f" '{raw_provider}'" if len(raw_provider) <= 20 else ""
        warnings.append(f"Unknown AI_PROVIDER{shown} — ignored. Valid: {', '.join(AI_PROVIDERS)}")
    if raw_model and provider is None and model_provider_hint(raw_model) is None:
        warnings.append(
            f"AI_MODEL '{raw_model}' doesn't identify a provider on its own — set AI_PROVIDER too "
            "(otherwise it's tried on Gemini first)"
        )
    if raw_model:
        source = "AI_MODEL"
    elif provider:
        source = "AI_PROVIDER"
    else:
        source = "builtin"
    warning = ". ".join(warnings) if warnings else None
    return {"provider": provider, "model": env_default_model(), "source": source, "warning": warning}


class AISettings(BaseModel):
    """AI provider selection + credentials. Supplied by the client on every request —
    request payloads that need an LLM call should inherit from this class."""

    model: str = Field(default="", validate_default=True)
    geminiKey: str = ""
    openaiKey: str = ""
    anthropicKey: str = ""
    deepseekKey: str = ""
    groqKey: str = ""
    openrouterKey: str = ""
    openrouterUrl: str = "https://openrouter.ai/api/v1"
    # Generic OpenAI-compatible endpoint (Together.ai, Fireworks, a local LM
    # Studio/vLLM server, etc.) for anything not natively named above.
    customKey: str = ""
    customBaseUrl: str = ""
    customModel: str = ""
    ollamaUrl: str = "http://localhost:11434"
    ollamaModel: str = "llama3.2"

    @field_validator("model", mode="before")
    @classmethod
    def _resolve_model(cls, v: Any) -> Any:
        # Non-str values pass through so pydantic still rejects them with a 422.
        return resolve_model(v) if v is None or isinstance(v, str) else v
