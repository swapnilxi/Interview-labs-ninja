"""SwipeLearn: write a batch of cards with the AI model chosen in Config.

    POST /swipe-learn/generate   (login, like every AI endpoint)

The browser can also call Gemini itself with a key kept in that browser (guests do); this endpoint is the path that
works with any provider set up in Config, including the server's .env default. It only builds the prompt and runs
it: the client parses, cleans and de-duplicates the cards (frontend/src/modules/swipe-learn/services/geminiService.ts),
so both paths share one parser.

Twin: frontend/fe-apis/swipeLearn/index.ts (nextjs-api mode). The prompt is prompt.py <-> cardPrompt.ts.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings, call_ai_text

from .prompt import CardRequestError, build_card_prompt, normalize_card_request

router = APIRouter(prefix="/swipe-learn", tags=["swipe-learn"])

# Ten cards with their depth sections run to ~5k tokens; leave room so the JSON is never cut off mid-card.
_MAX_TOKENS = 8192
_NO_KEY_MARKER = "No API key configured"


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
    return {"text": text, "model": payload.model}
