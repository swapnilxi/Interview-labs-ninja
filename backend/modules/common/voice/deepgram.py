"""Deepgram STT/TTS calling logic — the raw HTTP work only.

These functions do the raw work and raise plain exceptions on failure
(RuntimeError for missing config, whatever urllib raises for a failed HTTP
call). They deliberately do NOT know about FastAPI/HTTPException — that
translation happens in whichever router calls them (see
modules/voice/router.py for the generic HTTP surface, and
modules/ai_lms/router.py's voice_chat for the one endpoint that stays
lesson-specific).

Extracted from what used to be inlined in ai_lms/router.py's voice_stt and
voice_tts endpoints, so any module can reuse the same Deepgram calls.
"""

from __future__ import annotations

import json
import os
import urllib.request


def transcribe_audio(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    """Transcribe audio via Deepgram. Raises RuntimeError if DEEPGRAM_API_KEY is
    unset, or the underlying exception if the Deepgram call itself fails."""
    api_key = os.environ.get("DEEPGRAM_API_KEY", "")
    if not api_key:
        raise RuntimeError("Deepgram is not configured on the server.")

    dg_request = urllib.request.Request(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
        data=audio_bytes,
        headers={"Authorization": f"Token {api_key}", "Content-Type": content_type},
        method="POST",
    )
    with urllib.request.urlopen(dg_request, timeout=30) as resp:
        data = json.loads(resp.read())

    return (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("transcript", "")
    )


def synthesize_speech(text: str) -> bytes:
    """Synthesize speech via Deepgram. Same error-raising contract as above."""
    api_key = os.environ.get("DEEPGRAM_API_KEY", "")
    if not api_key:
        raise RuntimeError("Deepgram is not configured on the server.")

    body = json.dumps({"text": text}).encode()
    dg_request = urllib.request.Request(
        "https://api.deepgram.com/v1/speak?model=aura-asteria-en",
        data=body,
        headers={"Authorization": f"Token {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(dg_request, timeout=30) as resp:
        return resp.read()
