"""SwipeLearn: write a batch of cards with the AI model chosen in Config.

    POST /swipe-learn/generate   (login, like every AI endpoint)

The browser can also call Gemini itself with a key kept in that browser (guests do); this endpoint is the path that
works with any provider set up in Config, including the server's .env default. It only builds the prompt and runs
it: the client parses, cleans and de-duplicates the cards (frontend/src/modules/swipe-learn/services/geminiService.ts),
so both paths share one parser.

Twin: frontend/fe-apis/swipeLearn/index.ts (nextjs-api mode). The prompt is prompt.py <-> cardPrompt.ts.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings, call_ai_text
from modules.memory.store import memory_lines
from modules.research.web import research

from .prompt import CardRequestError, Source, build_card_prompt, normalize_card_request

router = APIRouter(prefix="/swipe-learn", tags=["swipe-learn"])

# Ten cards with their depth sections run to ~5k tokens; leave room so the JSON is never cut off mid-card.
_MAX_TOKENS = 8192
_NO_KEY_MARKER = "No API key configured"
MEMORY_MODULE = "swipe-learn"
_BROAD_TOPICS = ("mixed", "quiz")


def _research_query(req) -> str:
    """What to look up for a "What's new" batch: the deck's topic (or the focus) plus 'latest releases'."""
    label = "programming and AI" if req.topic.id in _BROAD_TOPICS else req.topic.label
    return f"{label} {req.focus} latest releases news {date.today().year}".replace("  ", " ").strip()


class GenerateCardsPayload(AISettings):
    # Validated by normalize_card_request (same rules as the TS twin), so they are left untyped here.
    topic: Any = None
    mixedTopics: Any = None
    subCategories: Any = None
    subCategory: Any = None
    format: Any = None
    count: Any = None
    focus: Any = None
    difficulty: Any = None
    aboutCard: Any = None
    avoidTitles: Any = None
    angles: Any = None
    seed: Any = None


@router.post("/generate")
async def generate_cards(payload: GenerateCardsPayload, user_id: int = Depends(get_current_user_id)) -> dict:
    raw = payload.model_dump(
        include={
            "topic", "mixedTopics", "subCategories", "subCategory", "format", "count",
            "focus", "difficulty", "aboutCard", "avoidTitles", "angles", "seed",
        }
    )
    try:
        req = normalize_card_request(raw)
    except CardRequestError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Personalise from the shared AI memory (modules/memory), then ground "What's new" cards in real pages.
    req.memory = memory_lines(user_id, MEMORY_MODULE, req.topic.id)
    found = []
    if req.format == "recent-dev" and req.about_card is None:
        found = [
            r for r in research(_research_query(req), fetch=3, max_results=5)["results"] if (r.get("text") or r.get("snippet"))
        ][:3]
        req.sources = [Source(title=r["title"] or r["url"], url=r["url"], text=r.get("text") or r.get("snippet", "")) for r in found]

    try:
        text = call_ai_text(build_card_prompt(req), payload, max_tokens=_MAX_TOKENS)
    except Exception as exc:
        message = str(exc)
        if _NO_KEY_MARKER in message:
            raise HTTPException(status_code=400, detail=message)
        raise HTTPException(status_code=502, detail=f"The AI call failed: {message}")

    if not (text or "").strip():
        raise HTTPException(status_code=502, detail="The AI returned an empty answer. Try again.")
    # `model` is the id the request resolved to (an empty choice means the server's .env default).
    return {
        "text": text,
        "model": payload.model,
        "sources": [{"title": src.title, "url": src.url} for src in req.sources],
        "memoryUsed": len(req.memory),
    }
