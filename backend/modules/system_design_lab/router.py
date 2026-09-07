from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from modules.auth.dependencies import get_current_user_id
from modules.common.db import fetch_lab_sections, save_lab_section
from .seed import fetch_system_design_topics, save_system_design_topic


router = APIRouter(prefix="/system-design", tags=["system-design-lab"], dependencies=[Depends(get_current_user_id)])


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


class LabSectionIn(BaseModel):
    name: str
    isCustom: bool = True


@router.get("/topics")
async def get_system_design_topics() -> List[dict]:
    return fetch_system_design_topics()


@router.post("/topics")
async def save_system_design_topic_endpoint(payload: SDTopicIn) -> dict:
    save_system_design_topic(payload.model_dump())
    return {"status": "success"}


@router.get("/sections")
async def get_system_design_sections(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return fetch_lab_sections(user_id, "system_design")


@router.post("/sections")
async def save_system_design_section(payload: LabSectionIn, user_id: int = Depends(get_current_user_id)) -> dict:
    save_lab_section(user_id, "system_design", payload.name)
    return {"status": "success"}
