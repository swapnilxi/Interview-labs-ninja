"""Job & People Tracker API — /career/tracker/*.

Mirrors frontend/fe-apis/career/handlers.ts ("Job & People Tracker"). Every route
requires the same Bearer JWT as the rest of Career Studio.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id
from ..job_match import db as jobs_db
from . import db

router = APIRouter(prefix="/career/tracker", tags=["career-tracker"], dependencies=[Depends(get_current_user_id)])


class PersonCreate(BaseModel):
    name: str
    role: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    relationship: str = "recruiter"
    stage: str = "lead"
    job_id: Optional[str] = None
    notes: str = ""
    tags: list[str] = []
    last_contacted: Optional[str] = None
    next_follow_up: Optional[str] = None


class PersonPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    relationship: Optional[str] = None
    stage: Optional[str] = None
    job_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None
    last_contacted: Optional[str] = None
    next_follow_up: Optional[str] = None


class JobCreate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    raw_text: str = ""
    status: str = "saved"
    priority: str = "medium"
    applied_at: Optional[str] = None
    deadline: Optional[str] = None
    notes: str = ""
    rating: int = 0


class JobPatch(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    applied_at: Optional[str] = None
    deadline: Optional[str] = None
    notes: Optional[str] = None
    rating: Optional[int] = None
    title: Optional[str] = None
    company: Optional[str] = None
    url: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None


@router.get("/summary")
async def tracker_summary(user_id: int = Depends(get_current_user_id)) -> dict:
    return db.summary(str(user_id))


@router.get("/jobs")
async def tracker_jobs(user_id: int = Depends(get_current_user_id)) -> list[dict]:
    return jobs_db.list_jobs(str(user_id))


@router.post("/jobs")
async def create_job(payload: JobCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    return db.create_tracked_job(str(user_id), payload.model_dump())


@router.patch("/jobs/{job_id}")
async def update_job(job_id: str, payload: JobPatch, user_id: int = Depends(get_current_user_id)) -> dict:
    fields = payload.model_dump(exclude_unset=True)
    updated = db.update_job_tracker(str(user_id), job_id, fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return updated


@router.get("/people")
async def list_people(
    stage: Optional[str] = None,
    relationship: Optional[str] = None,
    job_id: Optional[str] = None,
    q: Optional[str] = None,
    user_id: int = Depends(get_current_user_id),
) -> list[dict]:
    return db.list_people(str(user_id), stage=stage, relationship=relationship, job_id=job_id, q=q)


@router.post("/people")
async def create_person(payload: PersonCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    return db.create_person(str(user_id), payload.model_dump())


@router.get("/people/{person_id}")
async def get_person(person_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    person = db.get_person(str(user_id), person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.patch("/people/{person_id}")
async def update_person(person_id: str, payload: PersonPatch, user_id: int = Depends(get_current_user_id)) -> dict:
    updated = db.update_person(str(user_id), person_id, payload.model_dump(exclude_unset=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return updated


@router.delete("/people/{person_id}")
async def delete_person(person_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not db.delete_person(str(user_id), person_id):
        raise HTTPException(status_code=404, detail="Person not found")
    return {"status": "deleted"}
