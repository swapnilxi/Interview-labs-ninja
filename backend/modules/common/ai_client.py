"""Shared multi-provider AI client.

Every endpoint that calls an LLM accepts an `AISettings` payload straight from
the request — provider keys are supplied by the frontend (sourced from the
user's own browser localStorage) on every call and are never read from or
written to server-side storage. This is what lets multiple people share one
deployment while each using their own API keys.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from typing import List, Optional

from pydantic import BaseModel

GROQ_MODELS = ("llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768")


class AISettings(BaseModel):
    """AI provider selection + credentials. Supplied by the client on every request —
    request payloads that need an LLM call should inherit from this class."""

    model: str = "gemini-flash-latest"
    geminiKey: str = ""
    openaiKey: str = ""
    anthropicKey: str = ""
    deepseekKey: str = ""
    groqKey: str = ""
    ollamaUrl: str = "http://localhost:11434"
    ollamaModel: str = "llama3.2"


def _urlopen_surfacing_errors(req, timeout: int = 60):
    """urllib.request.urlopen, but on an HTTP error read the response body and
    fold the provider's own error message (e.g. Gemini's "prepayment credits are
    depleted" on a 429) into the raised exception, instead of letting urllib
    surface the bare "HTTP Error 429: Too Many Requests" with the body discarded.
    """
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", "replace").strip()
        except Exception:
            body = ""
        detail = ""
        if body:
            try:
                parsed = json.loads(body)
                detail = parsed.get("error", {}).get("message", "") if isinstance(parsed, dict) else ""
            except Exception:
                detail = ""
            detail = detail or body
        message = f"HTTP {exc.code}: {detail}" if detail else f"HTTP Error {exc.code}: {exc.reason}"
        raise RuntimeError(message) from exc


def extract_json_array(text: str) -> List[dict]:
    """Extract the first JSON array from an LLM response string."""
    text = text.strip()
    text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in response")
    return json.loads(text[start : end + 1])


def extract_json_object(text: str) -> dict:
    """Extract the first JSON object from an LLM response string."""
    text = text.strip()
    text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in response")
    return json.loads(text[start : end + 1])


def _call_gemini(
    prompt: str,
    api_key: str,
    model: str,
    image_b64: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    timeout: int = 60,
) -> str:
    parts: List[dict] = [{"text": prompt}]
    if image_b64:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": image_b64}})
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with _urlopen_surfacing_errors(req, timeout=timeout) as resp:
        data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


# ── Vertex AI (standard, OAuth2) ─────────────────────────────────────────────
# Separate path from the AI Studio Gemini call above. Standard Vertex is a normal
# GCP service billed to the project, so it's the ONLY path that spends Google
# Cloud trial ($300) credits. Auth is a service-account OAuth2 token, NOT an API
# key. Config lives server-side in the environment (see backend/.env.example),
# not in the per-request AISettings, since the credentials are the deployment's,
# not the end user's. Selected by a model id prefixed "vertex_gemini_".

_VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
_vertex_token_cache: dict = {"token": "", "exp": 0.0}


def _vertex_access_token() -> str:
    """Mint (and briefly cache) a Vertex OAuth2 access token from a service account.

    Honors GOOGLE_APPLICATION_CREDENTIALS (path to a service-account JSON). Falls
    back to Application Default Credentials (e.g. `gcloud auth application-default
    login`) if that env var is unset.
    """
    now = time.time()
    if _vertex_token_cache["token"] and _vertex_token_cache["exp"] - 60 > now:
        return _vertex_token_cache["token"]

    from google.auth.transport.requests import Request as _GoogleAuthRequest

    sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if sa_path:
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_file(sa_path, scopes=[_VERTEX_SCOPE])
    else:
        import google.auth
        creds, _ = google.auth.default(scopes=[_VERTEX_SCOPE])

    creds.refresh(_GoogleAuthRequest())
    _vertex_token_cache["token"] = creds.token
    _vertex_token_cache["exp"] = creds.expiry.timestamp() if creds.expiry else now + 3000
    return creds.token


def _call_vertex(
    prompt: str,
    model: str,
    image_b64: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    timeout: int = 60,
) -> str:
    project = os.getenv("VERTEX_PROJECT_ID", "").strip()
    if not project:
        raise RuntimeError("Vertex is not configured. Set VERTEX_PROJECT_ID (and credentials) in backend/.env — see .env.example.")
    location = os.getenv("VERTEX_LOCATION", "us-central1").strip() or "us-central1"
    host = "aiplatform.googleapis.com" if location == "global" else f"{location}-aiplatform.googleapis.com"

    parts: List[dict] = [{"text": prompt}]
    if image_b64:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": image_b64}})
    url = (
        f"https://{host}/v1/projects/{project}/locations/{location}"
        f"/publishers/google/models/{model}:generateContent"
    )
    body = json.dumps({
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {_vertex_access_token()}"},
        method="POST",
    )
    with _urlopen_surfacing_errors(req, timeout=timeout) as resp:
        data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_openai_compatible(prompt: str, api_key: str, base_url: str, model: str) -> str:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 2048,
    }).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with _urlopen_surfacing_errors(req, timeout=45) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


def _call_anthropic(prompt: str, api_key: str, model: str) -> str:
    body = json.dumps({
        "model": model,
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with _urlopen_surfacing_errors(req, timeout=45) as resp:
        data = json.loads(resp.read())
    return data["content"][0]["text"]


def _call_ollama(
    prompt: str,
    base_url: str,
    model: str,
    image_b64: Optional[str] = None,
    timeout: int = 60,
) -> str:
    body: dict = {"model": model, "prompt": prompt, "stream": False}
    if image_b64:
        body["images"] = [image_b64]
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read())
    return data.get("response", "")


def _is_ollama_choice(model: str) -> bool:
    return model == "ollama" or model.startswith("ollama::")


def _ollama_model_name(model: str, settings_model: str) -> str:
    if model.startswith("ollama::"):
        return model.split("::", 1)[1]
    return settings_model or "llama3.2"


def _gemini_model_name(model: str) -> str:
    """Resolve a model string to a real Gemini model id.

    Bare aliases like "gemini" or "gemma" (coarse provider choices that
    haven't been resolved to a specific id) are NOT valid Gemini API model
    names on their own — calling the API with them 404s. Only a string that
    actually looks like a specific id (e.g. "gemini-2.5-flash",
    "gemini-flash-latest") is passed through as-is.
    """
    if model not in ("gemini", "gemma") and (model.startswith("gemini") or model.startswith("gemma")):
        return model
    return "gemini-flash-latest"


_VERTEX_PREFIX = "vertex_gemini_"


def _is_vertex_choice(model: str) -> bool:
    return model.startswith(_VERTEX_PREFIX)


def _vertex_model_name(model: str) -> str:
    """Strip the "vertex_gemini_" prefix to the real Vertex model id.

    Accepts either the full id ("vertex_gemini_gemini-2.5-flash") or the short
    form ("vertex_gemini_2.5-flash"); the latter gets "gemini-" prepended.
    """
    name = model[len(_VERTEX_PREFIX):] if model.startswith(_VERTEX_PREFIX) else model
    if not (name.startswith("gemini") or name.startswith("gemma")):
        name = "gemini-" + name
    return name or "gemini-2.5-flash"


def _provider_order(model: str) -> List[str]:
    # Vertex is an explicit, isolated path (own credentials + billing). Never fall
    # back to/from it, so a "vertex_gemini_*" choice can't silently bill AI Studio
    # and an AI Studio choice can't silently spend GCP credits.
    if _is_vertex_choice(model):
        return ["vertex"]
    if model.startswith("gemini") or model.startswith("gemma"):
        return ["gemini", "deepseek", "groq", "openai", "anthropic", "ollama"]
    if model.startswith("deepseek"):
        return ["deepseek", "gemini", "groq", "openai", "anthropic", "ollama"]
    if model in GROQ_MODELS:
        return ["groq", "gemini", "deepseek", "openai", "anthropic", "ollama"]
    if model.startswith("gpt"):
        return ["openai", "gemini", "groq", "deepseek", "anthropic", "ollama"]
    if model.startswith("claude"):
        return ["anthropic", "gemini", "groq", "deepseek", "openai", "ollama"]
    if _is_ollama_choice(model):
        return ["ollama"]
    return ["gemini", "deepseek", "groq", "openai", "anthropic", "ollama"]


def call_ai_text(prompt: str, settings: AISettings) -> str:
    """Call the configured AI provider and return raw text.

    Falls back through other providers the caller has keys for (in relevance
    order for the requested model) if the primary choice fails. Ollama has no
    "key" and is always attempted as a last resort, so if it's the only thing
    that ran, its failure (almost always just "not running locally") is never
    allowed to drown out a real error from a provider the caller actually
    configured a key for.
    """
    model = settings.model or "gemini-flash-latest"
    errors: dict = {}

    for provider in _provider_order(model):
        try:
            if provider == "vertex":
                return _call_vertex(prompt, _vertex_model_name(model))
            if provider == "gemini" and settings.geminiKey:
                gemini_model = _gemini_model_name(model)
                return _call_gemini(prompt, settings.geminiKey, gemini_model)
            if provider == "deepseek" and settings.deepseekKey:
                deepseek_model = model if model.startswith("deepseek") else "deepseek-chat"
                return _call_openai_compatible(prompt, settings.deepseekKey, "https://api.deepseek.com", deepseek_model)
            if provider == "groq" and settings.groqKey:
                groq_model = model if model in GROQ_MODELS else "llama-3.3-70b-versatile"
                return _call_openai_compatible(prompt, settings.groqKey, "https://api.groq.com/openai/v1", groq_model)
            if provider == "openai" and settings.openaiKey:
                openai_model = model if model.startswith("gpt") else "gpt-4o-mini"
                return _call_openai_compatible(prompt, settings.openaiKey, "https://api.openai.com/v1", openai_model)
            if provider == "anthropic" and settings.anthropicKey:
                anthropic_model = model if model.startswith("claude") else "claude-3-5-sonnet-latest"
                return _call_anthropic(prompt, settings.anthropicKey, anthropic_model)
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
    model = settings.model or "gemini-flash-latest"
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
    model = settings.model or "gemini-flash-latest"

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
            body = json.dumps({
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
            }).encode()
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {_vertex_access_token()}"},
                method="POST",
            )
            with _urlopen_surfacing_errors(req, timeout=30) as resp:
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

    if not settings.geminiKey:
        yield "No Gemini API key configured. Add one in Config."
        return

    gemini_model = _gemini_model_name(model)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:streamGenerateContent?alt=sse&key={settings.geminiKey}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with _urlopen_surfacing_errors(req, timeout=30) as resp:
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
