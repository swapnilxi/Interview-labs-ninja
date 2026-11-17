from __future__ import annotations

from modules.common.topic_lab import build_router

# Next.js twin (nextjs-api mode): frontend/fe-apis/labs/ — same paths, shapes and storage format; change both.
# The routes are the shared topic-lab ones (common/topic_lab.py): a person sees the shared topics plus their own.
router = build_router(prefix="/cv", tag="cv-lab", table="cv_topics", section_lab="cv")
