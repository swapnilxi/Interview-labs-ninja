"""The web step shared by the Assistant chat and AI jobs with "search the web" on.

The model asks for a search by answering with `"web_search": "<query>"`; the server runs it through the read-only,
SSRF-guarded research module (modules/research/web.py) and asks again with the results in the prompt. One search per
answer, at most.

TypeScript twin: frontend/fe-apis/todo/agent/webStep.ts. Same limits and prompt text, change both.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from modules.research.web import research

from ..schedules.rules import js_slice, js_trim

QUERY_MAX = 200
PAGES_TO_READ = 3
RESULTS_IN_PROMPT = 5
SOURCES_MAX = 5


def search_query(value: Any) -> Optional[str]:
    """The query the model asked for, or None when it didn't ask (null, "", "null", not a string)."""
    if not isinstance(value, str):
        return None
    query = js_slice(js_trim(value), QUERY_MAX)
    return query if query and query.lower() not in ("null", "none") else None


async def run_search(query: str) -> List[Dict[str, Any]]:
    """Search results with page text for the top few; [] when the search is unavailable."""
    try:
        found = await asyncio.to_thread(research, query, PAGES_TO_READ)
    except Exception:
        return []
    return [r for r in found.get("results", []) if isinstance(r, dict)][:RESULTS_IN_PROMPT]


def web_block(query: str, results: List[Dict[str, Any]]) -> str:
    """The prompt section that hands the results to the model."""
    if not results:
        return f'You searched the web for "{query}" and found nothing usable. Answer without it and say so.\n\n'
    rows = [
        {"title": r.get("title") or "", "url": r.get("url") or "", "snippet": r.get("snippet") or "",
         "text": r.get("text") or ""}
        for r in results
    ]
    return f'Web results for "{query}" (JSON; use them for current facts and name the sites you used):\n{json.dumps(rows)}\n\n'


def sources_of(results: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """[{title, url}] for the UI."""
    out = []
    for r in results[:SOURCES_MAX]:
        url = r.get("url")
        if isinstance(url, str) and url.startswith("http"):
            out.append({"title": r.get("title") or url, "url": url})
    return out

