"""Generic voice endpoints — not tied to any specific module.

Thin HTTP wrapper over modules.common.voice: any authenticated module can POST
raw audio here for a transcript, or text here for synthesized speech, instead
of embedding its own Deepgram calling logic. This supersedes what used to be
ai_lms-only endpoints (`/api/lms/voice-stt`, `/api/lms/voice-tts`) — those were
never actually lesson-specific, just inlined in the wrong place. ai_lms's own
voice-chat endpoint (lesson-tutoring Q&A) is unrelated and still lives there.
"""

from __future__ import annotations

from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id
from modules.common.voice import get_tts_content_type, synthesize_speech, transcribe_audio

router = APIRouter(prefix="/api/voice", tags=["Voice"], dependencies=[Depends(get_current_user_id)])


class VoiceTTSRequest(BaseModel):
    text: str = Field(..., min_length=1)


@router.post("/stt")
async def stt_endpoint(request: Request) -> Dict[str, str]:
    """Transcribe recorded audio via Deepgram. Client sends the raw audio blob as the body."""
    audio_bytes = await request.body()
    content_type = request.headers.get("content-type", "audio/webm")
    try:
        text = transcribe_audio(audio_bytes, content_type)
    except RuntimeError as exc:
        # Missing DEEPGRAM_API_KEY — a server config problem, not a failed call.
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Deepgram STT failed: {exc}")
    return {"text": text}


@router.post("/tts")
async def tts_endpoint(payload: VoiceTTSRequest) -> Response:
    """Synthesize speech via Deepgram. Key stays server-side."""
    try:
        audio_bytes = synthesize_speech(payload.text)
    except RuntimeError as exc:
        # Missing DEEPGRAM_API_KEY — a server config problem, not a failed call.
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Deepgram TTS failed: {exc}")
    return Response(content=audio_bytes, media_type=get_tts_content_type())
