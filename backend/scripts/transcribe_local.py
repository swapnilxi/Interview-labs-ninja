"""CLI entrypoint for local Whisper transcription, invoked as a subprocess from
the Node.js/Next.js backend (see frontend/fe-apis/voice/localWhisper.ts) so it
can reuse the exact same model/code path as the Python backend's own local STT
(modules/common/voice/whisper_local.py), rather than needing a second ML stack
in Node.

Usage: uv run python scripts/transcribe_local.py <audio-file-path> [content-type]
Prints the transcript to stdout on success. On failure, prints "ERROR: <message>"
to stderr and exits non-zero.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.common.voice.whisper_local import transcribe_audio_local  # noqa: E402


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: transcribe_local.py <audio-file-path> [content-type]", file=sys.stderr)
        return 1

    audio_path = Path(sys.argv[1])
    content_type = sys.argv[2] if len(sys.argv) > 2 else "audio/webm"

    try:
        audio_bytes = audio_path.read_bytes()
        transcript = transcribe_audio_local(audio_bytes, content_type)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(transcript)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
