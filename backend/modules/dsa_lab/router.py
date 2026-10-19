"""DSA lab routes (/dsa/*, login required): topics, sections, and the learner's week-by-week plans.

The week plan routes keep each user's saved plans ("plan profiles", at most 20; one may be active) and the
active one that the week view and the week organizer edit (`/dsa/week-plan`, `/dsa/week-plan/profiles/*`; the
storage, validation and the lazy migration of the old one-plan table are in week_plan.py). `POST
/dsa/week-plan/auto` is the AI auto organizer: it turns the learner's answers (timeline, questions per week,
level, goal, patterns...) into a plan with the model and returns it unsaved (prompt + normaliser in
auto_plan.py).

`frontend/fe-apis/dsaLab/` is the Next.js twin of the week plan routes only (nextjs-api mode): same paths,
status codes, shapes, messages and prompt, so change both together. Topics and sections have no twin.
"""

from __future__ import annotations
import re
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, BeforeValidator, Field, StrictInt, ValidationError
from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings, call_ai_text, extract_json_object
from modules.common.db import fetch_lab_sections, save_lab_section
from . import week_plan as store
from .auto_plan import auto_plan_max_tokens, build_auto_plan_prompt, normalize_auto_plan, validate_auto_request
from .seed import fetch_dsa_topics, save_dsa_topic
from .week_plan import MAX_ENTRIES, MAX_WEEKS, WeekPlanError, clean_name, clean_summary, normalize_plan, validate_plan


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


# ── Week plan ─────────────────────────────────────────────────────────────────


class WeekPlanIn(BaseModel):
    """A plan on the wire. `order` / `labels` are typed Any so validate_plan words their errors like the twin."""

    weeks: StrictInt = Field(ge=1, le=MAX_WEEKS)
    assignments: Dict[str, StrictInt] = Field(default_factory=dict, max_length=MAX_ENTRIES)
    order: Any = None
    labels: Any = None


class ActivePlanIn(WeekPlanIn):
    """PUT /week-plan: a plan plus, optionally, `profileId` -- the plan the caller believes is active (null = none).
    Sent (even as null) it is checked against the server's active plan; left out, the PUT writes to whatever is
    active. Typed Any so a bad value gets the message below, not Pydantic's."""

    profileId: Any = None


class ProfileIn(BaseModel):
    # Any-typed so the checks below (and their messages) decide, in the order the twin uses: the plan is an
    # object with the right types -> name -> summary -> validate_plan -> the DB checks. Only `activate: true`
    # activates; any other value means false.
    name: Any = None
    plan: Any = None
    summary: Any = None
    activate: Any = None


class ProfilePatch(BaseModel):
    """Any subset of the fields; a field that isn't sent is left alone, one that is sent (even as null) is
    checked like any other value (unknown keys are ignored). Same rules as the twin."""

    name: Any = None
    summary: Any = None
    plan: Any = None


class AutoPlanPayload(AISettings):
    answers: Any = None
    topics: Any = None


def _plain_int(value: Any) -> Any:
    # Plain digits only, like the twin's intParam: on its own Pydantic would also read "+1", " 1", "1_0"
    # and "1.0" as ids. Anything else is a 422.
    if isinstance(value, str) and not re.fullmatch(r"-?[0-9]+", value):
        raise ValueError("must be an integer")
    return value


ProfileId = Annotated[int, BeforeValidator(_plain_int)]


def _store(call, *args):
    """Run a week_plan store call, turning its refusals (404 / 409 / 422) into HTTP errors."""
    try:
        return call(*args)
    except WeekPlanError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from None


def _parse_plan(raw: Any) -> WeekPlanIn:
    """Type-check a plan nested in a profile body (Pydantic's own 422 shape, located under body.plan)."""
    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail="Field 'plan' must be an object.")
    try:
        return WeekPlanIn.model_validate(raw)
    except ValidationError as exc:
        errors = [{**err, "loc": ("body", "plan", *err["loc"])} for err in exc.errors(include_url=False)]
        raise RequestValidationError(errors) from None


def _checked(plan: WeekPlanIn) -> dict:
    """validate_plan (422 with its message) and then the normalised plan."""
    problem = validate_plan(plan.weeks, plan.assignments, plan.order, plan.labels)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    return normalize_plan(plan.weeks, plan.assignments, plan.order, plan.labels)


@router.get("/week-plan")
async def get_week_plan(user_id: int = Depends(get_current_user_id)) -> dict:
    """The active plan profile, or {"plan": null} when none is active (the frontend shows its suggested plan)."""
    return {"plan": store.fetch_active_plan(user_id)}


@router.put("/week-plan")
async def put_week_plan(payload: ActivePlanIn, user_id: int = Depends(get_current_user_id)) -> dict:
    """Save to the active profile; with none active, a new "My plan" profile is created and activated. When the
    body names a `profileId` that is not the active profile (or null while one is active) the save is a 409."""
    check_expected = "profileId" in payload.model_fields_set
    expected = payload.profileId
    if check_expected and expected is not None and (not isinstance(expected, int) or isinstance(expected, bool)):
        raise HTTPException(status_code=422, detail="Field 'profileId' must be an integer or null.")
    plan = _checked(payload)
    return {"plan": _store(store.save_active_plan, user_id, plan, expected, check_expected)}


@router.delete("/week-plan")
async def reset_week_plan(user_id: int = Depends(get_current_user_id)) -> dict:
    """Back to the suggested plan: every profile is deactivated, none deleted."""
    store.deactivate_all(user_id)
    return {"plan": None}


@router.get("/week-plan/profiles")
async def list_week_plan_profiles(user_id: int = Depends(get_current_user_id)) -> dict:
    return store.list_profiles(user_id)


@router.post("/week-plan/profiles", status_code=201)
async def create_week_plan_profile(payload: ProfileIn, user_id: int = Depends(get_current_user_id)) -> dict:
    plan_in = _parse_plan(payload.plan)
    name = _store(clean_name, payload.name)
    summary = "" if payload.summary is None else _store(clean_summary, payload.summary)
    plan = _checked(plan_in)
    return {"profile": _store(store.create_profile, user_id, name, plan, summary, payload.activate is True)}


@router.get("/week-plan/profiles/{profile_id}")
async def get_week_plan_profile(profile_id: ProfileId, user_id: int = Depends(get_current_user_id)) -> dict:
    return {"profile": _store(store.get_profile, user_id, profile_id)}


@router.patch("/week-plan/profiles/{profile_id}")
async def patch_week_plan_profile(
    profile_id: ProfileId, payload: ProfilePatch, user_id: int = Depends(get_current_user_id)
) -> dict:
    sent = payload.model_fields_set
    plan_in = _parse_plan(payload.plan) if "plan" in sent else None
    changes: Dict[str, Any] = {}
    if "name" in sent:
        changes["name"] = _store(clean_name, payload.name)
    if "summary" in sent:
        changes["summary"] = _store(clean_summary, payload.summary)
    if plan_in is not None:
        changes["plan"] = _checked(plan_in)
    return {"profile": _store(store.update_profile, user_id, profile_id, changes)}


@router.post("/week-plan/profiles/{profile_id}/activate")
async def activate_week_plan_profile(profile_id: ProfileId, user_id: int = Depends(get_current_user_id)) -> dict:
    return {"plan": _store(store.activate_profile, user_id, profile_id)}


@router.delete("/week-plan/profiles/{profile_id}")
async def delete_week_plan_profile(profile_id: ProfileId, user_id: int = Depends(get_current_user_id)) -> dict:
    return _store(store.delete_profile, user_id, profile_id)


@router.post("/week-plan/auto")
async def auto_week_plan(payload: AutoPlanPayload, user_id: int = Depends(get_current_user_id)) -> dict:
    """Plan the weeks with AI from the learner's answers. The plan is returned, not saved."""
    store.ensure_migrated(user_id)
    problem, request = validate_auto_request(payload.answers, payload.topics)
    if problem:
        raise HTTPException(status_code=422, detail=problem)
    answers, topics = request["answers"], request["topics"]

    try:
        reply = call_ai_text(
            build_auto_plan_prompt(answers, topics),
            payload,
            max_tokens=auto_plan_max_tokens(answers["weeks"], answers["perWeek"]),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured or all providers failed. Add a key in Config. Last error: {exc}",
        )
    if not (reply or "").strip():
        raise HTTPException(status_code=502, detail="The AI returned an empty response. Try again.")
    try:
        raw = extract_json_object(reply)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The AI response couldn't be parsed. Try again. ({exc})")

    plan, summary, stats = normalize_auto_plan(raw, [t["id"] for t in topics], answers["weeks"], answers["perWeek"])
    if not plan["assignments"]:
        raise HTTPException(status_code=502, detail="The AI didn't return a usable plan. Try again.")
    return {"plan": plan, "summary": summary, "stats": stats}
