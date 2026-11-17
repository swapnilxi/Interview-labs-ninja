from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field
from modules.common.owned_topics import SYSTEM_DESIGN
from modules.common.topic_lab import build_router


# Next.js twin (nextjs-api mode): frontend/fe-apis/labs/ — same paths, shapes and storage format; change both.
# The routes are the shared topic-lab ones (common/topic_lab.py) with System Design's own topic fields (scale, isLLD).


class SDSubtopicIn(BaseModel):
    id: str
    name: str
    brief: str
    content: Optional[str] = None
    sourceUrl: Optional[str] = None


class SDTopicIn(BaseModel):
    id: str
    name: str
    brief: str
    category: str
    scale: str
    difficulty: str
    isLLD: bool = False
    subtopics: List[SDSubtopicIn] = Field(default_factory=list)
    shared: bool = False  # admin only: make this topic everyone's instead of the caller's own


router = build_router(
    prefix="/system-design",
    tag="system-design-lab",
    table="system_design_topics",
    section_lab="system_design",
    shape=SYSTEM_DESIGN,
    topic_model=SDTopicIn,
)
