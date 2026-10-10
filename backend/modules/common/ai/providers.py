"""Per-provider call implementations: Gemini (AI Studio + Vertex), OpenAI-
compatible (OpenAI/DeepSeek/Groq/OpenRouter/custom), Anthropic, and Ollama.

Split out of the single-file module this package replaces — see the package
docstring in modules/common/ai/__init__.py for the full picture.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import List, Optional

from .utils import _format_http_error, _urlopen_surfacing_errors


def _generation_config(temperature: float, max_tokens: int, thinking: bool) -> dict:
    """thinkingBudget: 0 disables Gemini 2.5's hidden reasoning tokens. Without
    this, a "thinking" model can spend the entire max_tokens budget on invisible
    reasoning and return an empty/truncated `text` part — every task here
    (structured JSON, rewrites, short answers) is well served by a direct
    answer, not chain-of-thought. Not every model/alias accepts the field
    though (some "-latest" aliases 400 on it even though the concrete model
    they resolve to wouldn't) — callers retry once with thinking=False on a
    400 before giving up, so this never becomes a hard requirement."""
    cfg = {"temperature": temperature, "maxOutputTokens": max_tokens}
    if thinking:
        cfg["thinkingConfig"] = {"thinkingBudget": 0}
    return cfg


def _post_generate_content(url: str, headers: dict, contents: list, temperature: float, max_tokens: int, timeout: int) -> dict:
    """POST to a Gemini-shaped generateContent endpoint (AI Studio or Vertex),
    trying thinkingConfig first and silently retrying without it if the
    model/alias rejects the field with a 400 (see _generation_config). Raises
    RuntimeError with the provider's own message on a non-recoverable error."""
    for thinking in (True, False):
        body = json.dumps({"contents": contents, "generationConfig": _generation_config(temperature, max_tokens, thinking)}).encode()
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if thinking and exc.code == 400:
                continue
            raise RuntimeError(_format_http_error(exc)) from exc


def _open_stream_generate_content(url: str, headers: dict, contents: list, temperature: float, max_tokens: int, timeout: int):
    """Like _post_generate_content, but for :streamGenerateContent — opens the
    connection (trying thinkingConfig first, retrying once without it on a 400)
    and returns the open response for the caller to iterate lines from. A 400
    from a bad/unsupported generationConfig field surfaces at open time, before
    any body streams, so the same retry-on-400 approach applies here."""
    for thinking in (True, False):
        body = json.dumps({"contents": contents, "generationConfig": _generation_config(temperature, max_tokens, thinking)}).encode()
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as exc:
            if thinking and exc.code == 400:
                continue
            raise RuntimeError(_format_http_error(exc)) from exc


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
    data = _post_generate_content(url, {"Content-Type": "application/json"}, [{"parts": parts}], temperature, max_tokens, timeout)
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
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {_vertex_access_token()}"}
    data = _post_generate_content(url, headers, [{"role": "user", "parts": parts}], temperature, max_tokens, timeout)
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_openai_compatible(prompt: str, api_key: str, base_url: str, model: str, max_tokens: int = 2048) -> str:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": max_tokens,
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


def _call_anthropic(prompt: str, api_key: str, model: str, max_tokens: int = 2048) -> str:
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
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


# ── Embeddings (for RAG-style retrieval, e.g. modules/ai_lms's context indexing) ──
# A separate, smaller provider order than text generation: Anthropic has no public
# embeddings API at all, and the other OpenAI-compatible providers wired up above
# (DeepSeek/Groq/OpenRouter/custom) aren't included here since they'd each need their
# own embedding-specific model name, which AISettings doesn't carry (only a chat
# model per provider). OpenAI, Gemini, and Ollama each have a well-known, stable
# embedding model id, so those three are enough to cover the common cases.

def _embed_openai(texts: List[str], api_key: str, model: str = "text-embedding-3-small") -> List[List[float]]:
    body = json.dumps({"model": model, "input": texts}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with _urlopen_surfacing_errors(req, timeout=60) as resp:
        data = json.loads(resp.read())
    # Preserve input order via each item's own "index" -- providers aren't
    # guaranteed to return them in request order.
    ordered = sorted(data["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in ordered]


def _embed_gemini(texts: List[str], api_key: str, model: str = "gemini-embedding-001") -> List[List[float]]:
    embeddings: List[List[float]] = []
    for text in texts:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={api_key}"
        body = json.dumps({"model": f"models/{model}", "content": {"parts": [{"text": text}]}}).encode()
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with _urlopen_surfacing_errors(req, timeout=60) as resp:
            data = json.loads(resp.read())
        embeddings.append(data["embedding"]["values"])
    return embeddings


def _embed_ollama(texts: List[str], base_url: str, model: str = "nomic-embed-text", timeout: int = 60) -> List[List[float]]:
    embeddings: List[List[float]] = []
    for text in texts:
        body = json.dumps({"model": model, "prompt": text}).encode()
        req = urllib.request.Request(
            f"{base_url.rstrip('/')}/api/embeddings",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
        embeddings.append(data["embedding"])
    return embeddings
