"""Template Designer & Manager — CRUD over user-designed resume/portfolio
templates. Same /career prefix + JWT guard as the rest of Career Studio.

A template's `spec` is the structured visual-knob dict the designer edits and
render.py compiles to CSS (see template_presets.py). Listing seeds the built-in
presets on first visit so a user always starts with a full, editable library.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id

from . import db as templates_db

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])


class TemplateCreate(BaseModel):
    kind: str  # 'resume' | 'portfolio'
    name: str = "My Template"
    spec: dict = {}


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    spec: Optional[dict] = None


class TemplateDuplicate(BaseModel):
    name: Optional[str] = None


def _require_kind(kind: str) -> None:
    if kind not in ("resume", "portfolio"):
        raise HTTPException(status_code=400, detail="kind must be 'resume' or 'portfolio'")


@router.get("/templates")
async def list_templates(kind: Optional[str] = Query(None), user_id: int = Depends(get_current_user_id)) -> list[dict]:
    if kind:
        _require_kind(kind)
    templates_db.seed_defaults(str(user_id))  # seed/backfill any built-in presets this user has never had
    return templates_db.list_templates(str(user_id), kind)


@router.post("/templates")
async def create_template(payload: TemplateCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    _require_kind(payload.kind)
    name = (payload.name or "My Template").strip() or "My Template"
    return templates_db.create_template(str(user_id), payload.kind, name, payload.spec or {})


@router.get("/templates/{template_id}")
async def get_template(template_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    tpl = templates_db.get_template(str(user_id), template_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.patch("/templates/{template_id}")
async def update_template(template_id: str, payload: TemplateUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    fields = payload.model_dump(exclude_unset=True)
    tpl = templates_db.update_template(str(user_id), template_id, fields)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not templates_db.delete_template(str(user_id), template_id):
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "deleted"}


@router.post("/templates/{template_id}/duplicate")
async def duplicate_template(template_id: str, payload: TemplateDuplicate, user_id: int = Depends(get_current_user_id)) -> dict:
    src = templates_db.get_template(str(user_id), template_id)
    if src is None:
        raise HTTPException(status_code=404, detail="Template not found")
    name = (payload.name or f"{src['name']} copy").strip() or f"{src['name']} copy"
    return templates_db.create_template(str(user_id), src["kind"], name, src["spec"], source="custom")
