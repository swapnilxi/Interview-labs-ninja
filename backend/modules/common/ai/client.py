"""Orchestration layer: picks a provider fallback order for a given model
choice and calls through modules.common.ai.providers, exposing the public
call_ai_text / call_ai_vision / stream_ai_text / test_provider_key surface
used by every module that needs an LLM call.

Split out of the single-file module this package replaces — see the package
docstring in modules/common/ai/__init__.py for the full picture.
"""

from __future__ import annotations

import json
import os
import urllib.request
from typing import List, Optional

from .providers import (
    _call_anthropic,
    _call_gemini,
    _call_ollama,
    _call_openai_compatible,
    _call_vertex,
    _embed_gemini,
    _embed_ollama,
    _embed_openai,
    _gemini_model_name,
    _is_ollama_choice,
    _is_vertex_choice,
    _ollama_model_name,
    _open_stream_generate_content,
    _vertex_access_token,
    _vertex_model_name,
)
from .settings import (
    AISettings,
    GROQ_MODELS,
    PROVIDER_DEFAULT_MODELS,
    _env_provider,
    env_default_model,
    model_provider_hint,
    resolve_model,
)


def test_provider_key(provider: str, api_key: str, base_url: str = "") -> tuple[bool, str]:
    """Make one minimal real call to a provider to confirm the given API key
    actually works — used by the Config page's per-key "Test Connection" button.
    Returns (ok, message); message is a short human-readable success/failure detail."""
    api_key = (api_key or "").strip()
    if not api_key:
        return False, "No key entered."
    probe = "Reply with exactly one word: OK"
    try:
        if provider == "gemini":
            _call_gemini(probe, api_key, "gemini-flash-latest", max_tokens=8)
        elif provider == "openai":
            _call_openai_compatible(probe, api_key, "https://api.openai.com/v1", "gpt-4o-mini", max_tokens=8)
        elif provider == "anthropic":
            _call_anthropic(probe, api_key, "claude-3-5-haiku-latest", max_tokens=8)
        elif provider == "deepseek":
            _call_openai_compatible(probe, api_key, "https://api.deepseek.com", "deepseek-chat", max_tokens=8)
        elif provider == "groq":
            _call_openai_compatible(probe, api_key, "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", max_tokens=8)
        elif provider == "openrouter":
            url = (base_url or "https://openrouter.ai/api/v1").rstrip("/")
            _call_openai_compatible(probe, api_key, url, "meta-llama/llama-3.3-70b-instruct", max_tokens=8)
        else:
            return False, f"Unknown provider: {provider}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
    return True, "Key works — got a response."


_PROVIDER_ORDERS = {
    # Vertex is an explicit, isolated path (own credentials + billing). Never fall
    # back to/from it, so a "vertex_gemini_*" choice can't silently bill AI Studio
    # and an AI Studio choice can't silently spend GCP credits.
    "vertex": ["vertex"],
    "openrouter": ["openrouter", "gemini", "deepseek", "groq", "openai", "anthropic", "custom", "ollama"],
    "gemini": ["gemini", "openrouter", "deepseek", "groq", "openai", "anthropic", "custom", "ollama"],
    "deepseek": ["deepseek", "openrouter", "gemini", "groq", "openai", "anthropic", "custom", "ollama"],
    "groq": ["groq", "openrouter", "gemini", "deepseek", "openai", "anthropic", "custom", "ollama"],
    "openai": ["openai", "openrouter", "gemini", "groq", "deepseek", "anthropic", "custom", "ollama"],
    "anthropic": ["anthropic", "openrouter", "gemini", "groq", "deepseek", "openai", "custom", "ollama"],
    "ollama": ["ollama"],
    "custom": ["custom", "openrouter", "gemini", "deepseek", "groq", "openai", "anthropic", "ollama"],
    None: ["gemini", "openrouter", "deepseek", "groq", "openai", "anthropic", "custom", "ollama"],
}

_SELF_ROUTED = ("vertex", "ollama", "custom")


def _provider_order(model: str) -> List[str]:
    return list(_PROVIDER_ORDERS[model_provider_hint(model)])


def _preferred_env_provider(model: str) -> Optional[str]:
    """AI_PROVIDER when `model` is the env default (AISettings already resolved '' to it), else None."""
    provider = _env_provider()
    if not provider or provider in _SELF_ROUTED or model_provider_hint(model) in _SELF_ROUTED:
        return None
    return provider if model == env_default_model() else None


def _effective_order(model: str) -> List[str]:
    order = _provider_order(model)
    preferred = _preferred_env_provider(model)
    if not preferred:
        return order
    return [preferred] + [p for p in order if p != preferred]


def _gemini_model(model: str, exact: bool) -> str:
    return model if exact and model not in ("gemini", "gemma") else _gemini_model_name(model)


def call_ai_text(prompt: str, settings: AISettings, max_tokens: int = 2048) -> str:
    """Call the configured AI provider and return raw text.

    Falls back through other providers the caller has keys for (in relevance
    order for the requested model) if the primary choice fails. Ollama has no
    "key" and is always attempted as a last resort, so if it's the only thing
    that ran, its failure (almost always just "not running locally") is never
    allowed to drown out a real error from a provider the caller actually
    configured a key for.

    `max_tokens` defaults to a small budget suitable for short answers; callers
    generating a large document (e.g. a full lesson) should pass a much higher
    value explicitly -- 2048 tokens is not enough to complete one, and every
    provider here silently truncates mid-output rather than erroring, so an
    undersized budget looks like a valid-but-incomplete response, not a failure.
    """
    model = resolve_model(settings.model)
    preferred = _preferred_env_provider(model)
    errors: dict = {}

    for provider in _effective_order(model):
        exact = provider == preferred
        try:
            if provider == "vertex":
                return _call_vertex(prompt, _vertex_model_name(model), max_tokens=max_tokens)
            if provider == "gemini":
                gemini_key = settings.geminiKey or os.environ.get("GEMINI_API_KEY", "")
                if gemini_key:
                    gemini_model = _gemini_model(model, exact)
                    return _call_gemini(prompt, gemini_key, gemini_model, max_tokens=max_tokens)
            if provider == "openrouter":
                openrouter_key = settings.openrouterKey or os.environ.get("OPENROUTER_API_KEY", "")
                if openrouter_key:
                    openrouter_url = (settings.openrouterUrl or "https://openrouter.ai/api/v1").rstrip("/")
                    openrouter_model = model if exact or "/" in model else "meta-llama/llama-3.3-70b-instruct"
                    return _call_openai_compatible(prompt, openrouter_key, openrouter_url, openrouter_model, max_tokens=max_tokens)
            if provider == "deepseek":
                deepseek_key = settings.deepseekKey or os.environ.get("DEEPSEEK_API_KEY", "")
                if deepseek_key:
                    deepseek_model = model if exact or model.startswith("deepseek") else "deepseek-chat"
                    return _call_openai_compatible(prompt, deepseek_key, "https://api.deepseek.com", deepseek_model, max_tokens=max_tokens)
            if provider == "groq":
                groq_key = settings.groqKey or os.environ.get("GROQ_API_KEY", "")
                if groq_key:
                    groq_model = model if exact or model in GROQ_MODELS else "llama-3.3-70b-versatile"
                    return _call_openai_compatible(prompt, groq_key, "https://api.groq.com/openai/v1", groq_model, max_tokens=max_tokens)
            if provider == "openai":
                openai_key = settings.openaiKey or os.environ.get("OPENAI_API_KEY", "")
                if openai_key:
                    openai_model = model if exact or model.startswith("gpt") else "gpt-4o-mini"
                    return _call_openai_compatible(prompt, openai_key, "https://api.openai.com/v1", openai_model, max_tokens=max_tokens)
            if provider == "anthropic":
                anthropic_key = settings.anthropicKey or os.environ.get("ANTHROPIC_API_KEY", "")
                if anthropic_key:
                    anthropic_model = model if exact or model.startswith("claude") else PROVIDER_DEFAULT_MODELS["anthropic"]
                    return _call_anthropic(prompt, anthropic_key, anthropic_model, max_tokens=max_tokens)
            if provider == "custom":
                # Generic OpenAI-compatible endpoint (Together.ai, Fireworks, a local
                # LM Studio/vLLM server, etc.) for anything not natively named above.
                custom_key = settings.customKey or os.environ.get("CUSTOM_AI_API_KEY", "")
                custom_base_url = settings.customBaseUrl or os.environ.get("CUSTOM_AI_BASE_URL", "")
                custom_model = settings.customModel or os.environ.get("CUSTOM_AI_MODEL", "")
                if custom_key and custom_base_url and custom_model:
                    return _call_openai_compatible(prompt, custom_key, custom_base_url, custom_model, max_tokens=max_tokens)
            if provider == "ollama":
                return _call_ollama(prompt, settings.ollamaUrl, _ollama_model_name(model, settings.ollamaModel))
        except Exception as exc:
            errors[provider] = str(exc)

    if not errors:
        raise RuntimeError("No API key configured for this model. Add one in Config.")

    configured_failures = {p: e for p, e in errors.items() if p != "ollama"}
    if configured_failures:
        provider, detail = next(iter(configured_failures.items()))
        raise RuntimeError(f"{provider} failed: {detail}")
    raise RuntimeError(f"No API key configured, and Ollama isn't reachable: {errors['ollama']}")


def call_ai_vision(image_b64: str, prompt: str, settings: AISettings) -> str:
    """Vision-capable call for handwriting/image extraction (Gemini or Ollama/llava only)."""
    model = resolve_model(settings.model)
    if _is_ollama_choice(model):
        vision_model = model.split("::", 1)[1] if model.startswith("ollama::") else "llava"
        return _call_ollama(prompt, settings.ollamaUrl, vision_model, image_b64=image_b64, timeout=120)
    if _is_vertex_choice(model):
        return _call_vertex(prompt, _vertex_model_name(model), image_b64=image_b64, temperature=0.3, max_tokens=4096)
    if not settings.geminiKey:
        raise ValueError("No Gemini API key configured. Add one in Config.")
    gemini_model = _gemini_model_name(model)
    return _call_gemini(prompt, settings.geminiKey, gemini_model, image_b64=image_b64, temperature=0.3, max_tokens=4096)


def stream_ai_text(prompt: str, settings: AISettings):
    """Streaming generator (Gemini SSE or Ollama NDJSON only — used by the resume-task briefing)."""
    model = resolve_model(settings.model)

    if _is_ollama_choice(model):
        ollama_model = _ollama_model_name(model, settings.ollamaModel)
        url = f"{settings.ollamaUrl.rstrip('/')}/api/generate"
        body = json.dumps({"model": ollama_model, "prompt": prompt, "stream": True}).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                for line in resp:
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line.decode("utf-8").strip())
                        yield chunk.get("response", "")
                    except Exception:
                        pass
        except Exception as e:
            yield f"\n[Streaming error: {e}]"
        return

    if _is_vertex_choice(model):
        try:
            project = os.getenv("VERTEX_PROJECT_ID", "").strip()
            if not project:
                yield "Vertex is not configured. Set VERTEX_PROJECT_ID (and credentials) in backend/.env — see .env.example."
                return
            location = os.getenv("VERTEX_LOCATION", "us-central1").strip() or "us-central1"
            host = "aiplatform.googleapis.com" if location == "global" else f"{location}-aiplatform.googleapis.com"
            vertex_model = _vertex_model_name(model)
            url = (
                f"https://{host}/v1/projects/{project}/locations/{location}"
                f"/publishers/google/models/{vertex_model}:streamGenerateContent?alt=sse"
            )
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {_vertex_access_token()}"}
            with _open_stream_generate_content(url, headers, [{"role": "user", "parts": [{"text": prompt}]}], 0.7, 2048, 30) as resp:
                for line in resp:
                    line_str = line.decode("utf-8").strip()
                    if line_str.startswith("data:"):
                        try:
                            chunk = json.loads(line_str[5:].strip())
                            yield chunk["candidates"][0]["content"]["parts"][0]["text"]
                        except Exception:
                            pass
        except Exception as e:
            yield f"\n[Streaming error: {e}]"
        return

    # Non-streaming providers (OpenAI, Anthropic, Groq, DeepSeek) — or any case
    # where true Gemini streaming isn't available — fall back to a single
    # blocking call and yield the whole result at once, so every provider the
    # caller has configured works with the streaming endpoints (not just Gemini/
    # Vertex/Ollama). call_ai_text already handles cross-provider fallback.
    # GROQ_MODELS includes gemma2-9b-it, which the gemma prefix would otherwise send to Gemini SSE.
    _gemini_streamable = bool(settings.geminiKey) and _effective_order(model)[0] == "gemini" and model not in GROQ_MODELS
    if not _gemini_streamable:
        try:
            yield call_ai_text(prompt, settings)
        except Exception as e:  # noqa: BLE001
            yield f"\n[error: {e}]"
        return

    gemini_model = _gemini_model(model, _preferred_env_provider(model) == "gemini")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:streamGenerateContent?alt=sse&key={settings.geminiKey}"
    try:
        with _open_stream_generate_content(url, {"Content-Type": "application/json"}, [{"parts": [{"text": prompt}]}], 0.7, 2048, 30) as resp:
            for line in resp:
                line_str = line.decode("utf-8").strip()
                if line_str.startswith("data:"):
                    try:
                        chunk = json.loads(line_str[5:].strip())
                        yield chunk["candidates"][0]["content"]["parts"][0]["text"]
                    except Exception:
                        pass
    except Exception as e:
        yield f"\n[Streaming error: {e}]"


class NoEmbeddingProviderError(RuntimeError):
    """Raised by embed_texts when no embedding-capable provider is configured or
    reachable. Distinct from a plain RuntimeError so callers can catch it
    specifically and degrade gracefully (e.g. skip RAG indexing) instead of
    surfacing a generic failure."""


def embed_texts(texts: List[str], settings: AISettings) -> List[List[float]]:
    """Embed a batch of texts, trying each embedding-capable provider the caller has
    a key for: OpenAI, then Gemini, then a local Ollama (no key needed, tried last —
    same "always attempt, but never let its failure drown out a real provider
    error" treatment call_ai_text gives it). Anthropic has no embeddings API, and
    the other OpenAI-compatible providers (DeepSeek/Groq/OpenRouter/custom) aren't
    wired up here since they'd each need their own embedding model id, which
    AISettings doesn't carry.

    Raises NoEmbeddingProviderError (not a generic RuntimeError) if nothing worked,
    so callers -- e.g. the RAG indexing endpoint -- can turn that into a clear,
    actionable message instead of a bare 500.
    """
    if not texts:
        return []

    errors: dict = {}

    openai_key = settings.openaiKey or os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        try:
            return _embed_openai(texts, openai_key)
        except Exception as exc:
            errors["openai"] = str(exc)

    gemini_key = settings.geminiKey or os.environ.get("GEMINI_API_KEY", "")
    if gemini_key:
        try:
            return _embed_gemini(texts, gemini_key)
        except Exception as exc:
            errors["gemini"] = str(exc)

    try:
        return _embed_ollama(texts, settings.ollamaUrl)
    except Exception as exc:
        errors["ollama"] = str(exc)

    detail = "; ".join(f"{k}: {v}" for k, v in errors.items()) if errors else "no provider configured"
    raise NoEmbeddingProviderError(
        f"No embedding-capable provider is configured or reachable ({detail}). RAG "
        "indexing needs an OpenAI key, a Gemini key, or a running local Ollama with "
        "an embedding model pulled (e.g. `ollama pull nomic-embed-text`)."
    )
