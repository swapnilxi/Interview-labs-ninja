"""Shared AI-call helpers for every todo vertical. Thin re-export of
modules.common.ai_client, plus the one real local helper (image prep) that
used to live in tasks/router.py and every other vertical pulled in via a
deferred cross-import."""

from __future__ import annotations

import base64
import io

from fastapi import HTTPException

from modules.common.ai_client import (
    AISettings,
    call_ai_text as call_ai,
    call_ai_vision as call_vision_ai,
    stream_ai_text as stream_ai,
    extract_json_array as extract_json_array,
)


def image_to_base64_jpeg(content: bytes, ext: str) -> str:
    """Convert image bytes to base64-encoded JPEG. Handles HEIC conversion via Pillow."""
    from PIL import Image

    if ext == ".heic":
        # Pillow with pillow-heif plugin, or convert via raw bytes
        try:
            img = Image.open(io.BytesIO(content))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=90)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to convert HEIC image. Ensure pillow-heif is installed.")
    else:
        # Standard image — re-encode as JPEG for consistency
        try:
            img = Image.open(io.BytesIO(content))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=90)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception:
            # Fallback: send raw bytes as base64
            return base64.b64encode(content).decode("utf-8")
