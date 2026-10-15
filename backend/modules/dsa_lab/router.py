from __future__ import annotations
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from modules.auth.dependencies import get_current_user_id
from modules.common.db import fetch_lab_sections, save_lab_section
from .seed import fetch_dsa_topics, save_dsa_topic
from .week_plan import MAX_WEEKS, delete_week_plan, fetch_week_plan, save_week_plan, validate_plan


router = APIRouter(prefix="/dsa", tags=["dsa-lab"], dependencies=[Depends(get_current_user_id)])


class DSASubtopicIn(BaseModel):
    id: str
    name: str
    brief: str
    content: Optional[str] = None
    sourceUrl: Optional[str] = None


class DSATopicIn(BaseModel):
    id: str
    name: str
    brief: str
    category: str
    difficulty: str
    prerequisites: List[str] = Field(default_factory=list)
    subtopics: List[DSASubtopicIn] = Field(default_factory=list)


class LabSectionIn(BaseModel):
    name: str
    isCustom: bool = True


@router.get("/topics")
async def get_dsa_topics() -> List[dict]:
    return fetch_dsa_topics()


@router.post("/topics")
async def save_dsa_topic_endpoint(payload: DSATopicIn) -> dict:
    save_dsa_topic(payload.model_dump())
    return {"status": "success"}


@router.get("/sections")
async def get_dsa_sections(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return fetch_lab_sections(user_id, "dsa")


@router.post("/sections")
async def save_dsa_section(payload: LabSectionIn, user_id: int = Depends(get_current_user_id)) -> dict:
    save_lab_section(user_id, "dsa", payload.name)
    return {"status": "success"}


class WeekPlanIn(BaseModel):
    weeks: int = Field(ge=1, le=MAX_WEEKS)
    assignments: Dict[str, int] = Field(default_factory=dict, max_length=500)


@router.get("/week-plan")
async def get_week_plan(user_id: int = Depends(get_current_user_id)) -> dict:
    """The user's own week plan, or {"plan": null} if they never changed the suggested one."""
    return {"plan": fetch_week_plan(user_id)}


@router.put("/week-plan")
async def put_week_plan(payload: WeekPlanIn, user_id: int = Depends(get_current_user_id)) -> dict:
    problem = validate_plan(payload.weeks, payload.assignments)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    return {"plan": save_week_plan(user_id, payload.weeks, payload.assignments)}


@router.delete("/week-plan")
async def reset_week_plan(user_id: int = Depends(get_current_user_id)) -> dict:
    """Back to the suggested plan."""
    delete_week_plan(user_id)
    return {"plan": None}
