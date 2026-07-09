"""Provider-fallback LLM helpers for the LinkedIn post generator.

Mirrors the provider-fallback pattern in modules/daily_session/daily_session.py,
but returns raw text (or a parsed JSON object) instead of a JSON array, since a
LinkedIn post is prose rather than a list of structured items.
"""

from __future__ import annotations

import json
import re
import urllib.request
from typing import List, Optional

from modules.common.db import fetch_settings


def _extract_json_object(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in response")
    return json.loads(text[start : end + 1])


def _call_gemini(prompt: str, api_key: str, model: str) -> str:
    safe_model = model.replace("gemini-2.5-flash", "gemini-2.0-flash").replace("gemini-2.5-pro", "gemini-1.5-pro")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{safe_model}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.85, "maxOutputTokens": 2048},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_openai_compatible(prompt: str, api_key: str, base_url: str, model: str) -> str:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.85,
        "max_tokens": 2048,
    }).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


def _call_ollama(prompt: str, base_url: str, model: str) -> str:
    body = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return data.get("response", "")


def _provider_order(model: str) -> List[str]:
    if model.startswith("gemini"):
        return ["gemini", "deepseek", "groq", "openai", "ollama"]
    if model.startswith("deepseek"):
        return ["deepseek", "gemini", "groq", "openai", "ollama"]
    if model in ("llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768"):
        return ["groq", "gemini", "deepseek", "openai", "ollama"]
    if model.startswith("gpt"):
        return ["openai", "gemini", "groq", "deepseek", "ollama"]
    if model.startswith("claude"):
        return ["gemini", "groq", "deepseek", "openai", "ollama"]
    if model == "ollama":
        return ["ollama"]
    return ["gemini", "deepseek", "groq", "openai", "ollama"]


def _raw_generate(prompt: str) -> str:
    settings = fetch_settings()
    model = settings.get("questionModel", "gemini-2.5-flash")
    last_error: Optional[str] = None

    for provider in _provider_order(model):
        try:
            if provider == "gemini" and settings.get("geminiKey"):
                return _call_gemini(prompt, settings["geminiKey"], model)
            if provider == "deepseek" and settings.get("deepseekKey"):
                deepseek_model = model if model.startswith("deepseek") else "deepseek-chat"
                return _call_openai_compatible(prompt, settings["deepseekKey"], "https://api.deepseek.com", deepseek_model)
            if provider == "groq" and settings.get("groqKey"):
                groq_model = model if model in ("llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768") else "llama-3.3-70b-versatile"
                return _call_openai_compatible(prompt, settings["groqKey"], "https://api.groq.com/openai/v1", groq_model)
            if provider == "openai" and settings.get("openaiKey"):
                openai_model = model if model.startswith("gpt") else "gpt-4o-mini"
                return _call_openai_compatible(prompt, settings["openaiKey"], "https://api.openai.com/v1", openai_model)
            if provider == "ollama":
                return _call_ollama(prompt, settings.get("ollamaUrl", "http://localhost:11434"), settings.get("ollamaModel", "llama3.2"))
        except Exception as exc:
            last_error = str(exc)
            continue

    raise RuntimeError(f"No API key configured or all providers failed. Add a key in Config. Last error: {last_error}")


def generate_text(prompt: str) -> str:
    return _raw_generate(prompt)


def generate_json(prompt: str) -> dict:
    text = _raw_generate(prompt)
    return _extract_json_object(text)
