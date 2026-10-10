"""Shared voice (STT/TTS) provider calls.

Backed by either Deepgram (cloud) or fully local models (MLX-Whisper for STT,
macOS `say` for TTS), selected via VOICE_STT_PROVIDER / VOICE_TTS_PROVIDER env
vars (values: "deepgram" | "local"; defaults to "deepgram" to preserve existing
behavior for anyone who hasn't opted in). Import from this package
(`from modules.common.voice import ...`), not from a submodule directly, so the
backing provider can change (per env var, or later per-request) without
touching callers.
"""

from __future__ import annotations

import os

from . import deepgram
from .local_tts import synthesize_speech_local
from .whisper_local import transcribe_audio_local

__all__ = ["transcribe_audio", "synthesize_speech", "get_tts_content_type"]


def transcribe_audio(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    provider = os.environ.get("VOICE_STT_PROVIDER", "deepgram").strip().lower()
    if provider == "local":
        return transcribe_audio_local(audio_bytes, content_type)
    return deepgram.transcribe_audio(audio_bytes, content_type)


def synthesize_speech(text: str) -> bytes:
    provider = os.environ.get("VOICE_TTS_PROVIDER", "deepgram").strip().lower()
    if provider == "local":
        return synthesize_speech_local(text)
    return deepgram.synthesize_speech(text)


def get_tts_content_type() -> str:
    """Content-Type of whatever synthesize_speech() currently returns -- audio
    format differs by provider (Deepgram: audio/mpeg, local `say`: audio/wav).
    A response mislabeled with the wrong Content-Type can fail to play in the
    browser even though the bytes themselves are fine."""
    provider = os.environ.get("VOICE_TTS_PROVIDER", "deepgram").strip().lower()
    if provider == "local":
        return "audio/wav"
    return "audio/mpeg"
