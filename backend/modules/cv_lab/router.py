from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from modules.auth.dependencies import get_current_user_id
from modules.common.db import fetch_lab_sections, save_lab_section
from .seed import fetch_cv_topics, save_cv_topic


router = APIRouter(prefix="/cv", tags=["cv-lab"], dependencies=[Depends(get_current_user_id)])


class CVSubtopicIn(BaseModel):
    id: str
    name: str
    brief: str
    content: Optional[str] = None
    sourceUrl: Optional[str] = None


class CVTopicIn(BaseModel):
    id: str
    name: str
    brief: str
    category: str
    difficulty: str
    prerequisites: List[str] = Field(default_factory=list)
    subtopics: List[CVSubtopicIn] = Field(default_factory=list)


class LabSectionIn(BaseModel):
    name: str
    isCustom: bool = True


@router.get("/topics")
async def get_cv_topics() -> List[dict]:
    return fetch_cv_topics()


@router.post("/topics")
async def save_cv_topic_endpoint(payload: CVTopicIn) -> dict:
    save_cv_topic(payload.model_dump())
    return {"status": "success"}


@router.get("/sections")
async def get_cv_sections(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return fetch_lab_sections(user_id, "cv")


@router.post("/sections")
async def save_cv_section(payload: LabSectionIn, user_id: int = Depends(get_current_user_id)) -> dict:
    save_lab_section(user_id, "cv", payload.name)
    return {"status": "success"}
