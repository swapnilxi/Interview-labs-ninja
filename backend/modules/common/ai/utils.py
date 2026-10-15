"""HTTP-error formatting + JSON-extraction utilities shared across providers.

Split out of the single-file module this package replaces — see the package
docstring in modules/common/ai/__init__.py for the full picture.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import List, Tuple


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


# ── Lenient extraction: use whatever objects a reply managed to deliver ──────────
#
# extract_json_array is all-or-nothing. That is the wrong failure mode for the one-object-per-item answers (the 80/20
# analysis scores up to 60 tasks in one reply): every provider silently cuts a reply off at max_tokens, so a long
# answer arrives as `[ {..}, {..}, {` with no closing bracket and the strict parser throws "No JSON array found" for
# results that were all there. Models also answer a one-item request with a bare `{..}` instead of `[{..}]`.
# extract_json_items keeps every object that arrived whole and says whether the reply was complete.

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _clean_reply(text: str) -> str:
    """Drop a reasoning block (<think>…</think>, or an unfinished one) and markdown fences."""
    text = _THINK_BLOCK.sub("", text or "")
    open_think = text.lower().find("<think>")
    if open_think != -1:  # the model never got past its reasoning: nothing to parse
        text = text[:open_think]
    return re.sub(r"```[a-zA-Z]*\n?", "", text).strip().strip("`").strip()


def _balanced_end(text: str, start: int) -> int:
    """Index of the bracket that closes the `[` or `{` at `start` (string literals are skipped); -1 if it never closes."""
    close = "]" if text[start] == "[" else "}"
    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 0:
                return i if ch == close else -1
    return -1


def _salvage_objects(text: str, start: int) -> List[dict]:
    """The objects that arrived whole inside the `[` at `start`, which was never closed (a reply cut off mid-list)."""
    items: List[dict] = []
    i = start + 1
    while i < len(text):
        ch = text[i]
        if ch == "{":
            end = _balanced_end(text, i)
            if end == -1:  # the object the reply stopped in the middle of
                break
            try:
                obj = json.loads(text[i : end + 1])
            except ValueError:
                obj = None
            if isinstance(obj, dict):
                items.append(obj)
            i = end + 1
        elif ch == "]":
            break
        else:
            i += 1
    return items


def _excerpt(text: str, limit: int = 120) -> str:
    one_line = " ".join(text.split())
    return one_line if len(one_line) <= limit else one_line[:limit].rstrip() + "…"


def extract_json_items(text: str) -> Tuple[List[dict], bool]:
    """Pull the JSON objects out of an LLM reply that was supposed to be an array of them.

    Returns `(items, complete)`:
      * a complete `[ {..}, {..} ]` anywhere in the reply → all of it, complete=True;
      * a list that was cut off (no closing bracket) → the objects that arrived whole, complete=False;
      * a single bare `{..}` (models often drop the brackets for one item) → `[obj]`, complete=True.
    Raises ValueError, in words a user can act on, when there is nothing to use. The text it reports is what the
    AI actually said, so "No JSON array found" no longer hides an empty reply, a refusal or a cut-off.
    """
    cleaned = _clean_reply(text)
    if not cleaned:
        raise ValueError("the AI returned an empty reply")

    cut_off = False
    for i, ch in enumerate(cleaned):
        if ch != "[":
            continue
        end = _balanced_end(cleaned, i)
        if end != -1:
            try:
                value = json.loads(cleaned[i : end + 1])
            except ValueError:
                continue  # "[note]" in some prose, not JSON
            if isinstance(value, list) and all(isinstance(v, dict) for v in value):
                return value, True
            continue
        if cleaned[i + 1 :].lstrip().startswith("{"):  # an unclosed list of objects: the reply stopped mid-list
            items = _salvage_objects(cleaned, i)
            if items:
                return items, False
            cut_off = True
            break

    if not cut_off:
        for i, ch in enumerate(cleaned):
            if ch != "{":
                continue
            end = _balanced_end(cleaned, i)
            if end == -1:
                continue
            try:
                value = json.loads(cleaned[i : end + 1])
            except ValueError:
                continue
            if isinstance(value, dict):
                return [value], True

    if cut_off:
        raise ValueError("the AI's reply was cut off before it finished its first result (too much asked in one reply)")
    raise ValueError(f"the AI's reply had no JSON list in it (it began: \u201c{_excerpt(cleaned)}\u201d)")
