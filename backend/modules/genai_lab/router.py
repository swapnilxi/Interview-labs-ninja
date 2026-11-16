from __future__ import annotations

from modules.common.topic_lab import build_router

from .schema import TABLE

# Next.js twin (nextjs-api mode): frontend/fe-apis/labs/ — same paths, shapes and storage format; change both.
router = build_router(prefix="/genai", tag="genai-lab", table=TABLE, section_lab="genai")
