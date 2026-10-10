"""Local speech-to-text via MLX-Whisper — runs entirely on-device (Apple Silicon,
accelerated via MLX), so no network call, no per-request cost, and no audio ever
leaves the machine. Requires `ffmpeg` on PATH (used internally to decode whatever
format the browser recorded in, e.g. webm/opus) and the `mlx-whisper` package.

This module only knows how to do the local path -- see .deepgram for the cloud
alternative. Which one a given deployment uses is a router-level decision
(modules/voice/router.py), driven by VOICE_STT_PROVIDER.
"""

from __future__ import annotations

import os
import tempfile

# "base" balances accuracy and speed well on Apple Silicon; "tiny" is faster but
# noticeably worse on technical vocabulary, "small" is more accurate but a bigger
# download and slower. Override via env var without a code change if needed.
_DEFAULT_MODEL_REPO = "mlx-community/whisper-base-mlx"

_EXT_BY_CONTENT_TYPE = {
    "wav": ".wav",
    "mp4": ".m4a",
    "m4a": ".m4a",
    "ogg": ".ogg",
    "webm": ".webm",
}


def transcribe_audio_local(audio_bytes: bytes, content_type: str = "audio/webm") -> str:
    """Transcribe audio entirely on-device via MLX-Whisper.

    Raises RuntimeError with a clear, actionable message if `mlx_whisper` isn't
    installed or ffmpeg can't decode the audio -- callers should treat this the
    same way as a Deepgram failure (surface it, don't swallow it).
    """
    try:
        import mlx_whisper
    except ImportError as exc:
        raise RuntimeError(
            "mlx-whisper is not installed. Run `uv add mlx-whisper` in backend/."
        ) from exc

    model_repo = os.environ.get("VOICE_STT_LOCAL_MODEL", "") or _DEFAULT_MODEL_REPO

    ext = ".webm"
    for marker, mapped_ext in _EXT_BY_CONTENT_TYPE.items():
        if marker in content_type:
            ext = mapped_ext
            break

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        result = mlx_whisper.transcribe(tmp_path, path_or_hf_repo=model_repo)
        return (result.get("text") or "").strip()
    except Exception as exc:
        raise RuntimeError(f"Local transcription failed: {exc}") from exc
    finally:
        os.unlink(tmp_path)
