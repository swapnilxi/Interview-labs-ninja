"""HTTP-error formatting + JSON-extraction utilities shared across providers.

Split out of the single-file module this package replaces — see the package
docstring in modules/common/ai/__init__.py for the full picture.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import List


def _format_http_error(exc: urllib.error.HTTPError) -> str:
    """Fold the provider's own error message (e.g. Gemini's "prepayment credits
    are depleted" on a 429) into a readable string, instead of the bare
    "HTTP Error 429: Too Many Requests" urllib gives with the body discarded."""
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
    return f"HTTP {exc.code}: {detail}" if detail else f"HTTP Error {exc.code}: {exc.reason}"


def _urlopen_surfacing_errors(req, timeout: int = 60):
    """urllib.request.urlopen, but on an HTTP error raise with the provider's
    own error message folded in (see _format_http_error)."""
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(_format_http_error(exc)) from exc


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
