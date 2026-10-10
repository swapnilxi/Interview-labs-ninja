"""Local text-to-speech via macOS's built-in `say` command -- zero setup, zero
model download, works immediately on any Mac with no dependencies. More
robotic-sounding than a neural TTS model (Piper/Kokoro), but simplest possible
local option and a reasonable default to start from. macOS-only by nature.

Which TTS backend a given deployment uses is a router-level decision
(modules/voice/router.py), driven by VOICE_TTS_PROVIDER.
"""

from __future__ import annotations

import os
import subprocess
import tempfile


def synthesize_speech_local(text: str) -> bytes:
    """Synthesize speech entirely on-device via macOS's `say` command.

    Raises RuntimeError if `say` isn't available (i.e. not running on macOS) or
    if the command itself fails.
    """
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name

    try:
        subprocess.run(
            ["say", "-o", tmp_path, "--data-format=LEI16@22050", text],
            check=True,
            timeout=30,
            capture_output=True,
        )
        with open(tmp_path, "rb") as f:
            return f.read()
    except FileNotFoundError as exc:
        raise RuntimeError("`say` is not available -- local TTS requires macOS.") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", "replace") if exc.stderr else str(exc)
        raise RuntimeError(f"`say` failed: {stderr}") from exc
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
