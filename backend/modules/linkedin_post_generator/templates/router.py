from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from modules.common.db import delete_lab_section, fetch_lab_sections, save_lab_section

from .schema import CATEGORY_LAB
from .db import (
    count_templates_by_category,
    delete_template,
    duplicate_template,
    fetch_templates,
    update_template,
    save_template,
)

router = APIRouter(prefix="/linkedin", tags=["linkedin-post-generator"])

TemplateType = Literal["prompt", "reference_post", "creator_post", "writing_style", "post_structure", "custom"]


# ── Pydantic models ────────────────────────────────────────────────────────────

class CategoryIn(BaseModel):
    name: str


class TemplateIn(BaseModel):
    type: TemplateType
    title: str
    content: str
    description: Optional[str] = None
    styleAnalysis: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    tone: Optional[str] = None
    postType: Optional[str] = None
    isFavorite: bool = False
    category: Optional[str] = None


class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    description: Optional[str] = None
    styleAnalysis: Optional[str] = None
    tags: Optional[List[str]] = None
    tone: Optional[str] = None
    postType: Optional[str] = None
    isFavorite: Optional[bool] = None
    category: Optional[str] = None


# ── Categories ──────────────────────────────────────────────────────────────────

@router.get("/categories")
async def get_categories() -> List[dict]:
    # NOTE: linkedin_post_generator hasn't been migrated to per-user auth yet;
    # its categories remain global (user_id=None) — see fetch_lab_sections docstring.
    return fetch_lab_sections(None, CATEGORY_LAB)


@router.post("/categories")
async def add_category(payload: CategoryIn) -> dict:
    save_lab_section(None, CATEGORY_LAB, payload.name)
    return {"status": "success"}


@router.delete("/categories/{section_id}")
async def remove_category(section_id: int) -> dict:
    section = next((s for s in fetch_lab_sections(None, CATEGORY_LAB) if s["id"] == section_id), None)
    if section is None:
        raise HTTPException(status_code=404, detail="Category not found")

    in_use = count_templates_by_category(section["name"])
    if in_use:
        raise HTTPException(
            status_code=409,
            detail=f"{in_use} template{'s' if in_use != 1 else ''} still use this category. Reassign or delete them first.",
        )

    delete_lab_section(None, section_id)
    return {"status": "success"}


# ── Templates ───────────────────────────────────────────────────────────────────

@router.get("/templates")
async def get_templates(
    type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    favoritesOnly: bool = Query(default=False),
    category: Optional[str] = Query(default=None),
) -> List[dict]:
    return fetch_templates(type, search, favoritesOnly, category)


@router.post("/templates")
async def add_template(payload: TemplateIn) -> dict:
    template_id = save_template(payload.model_dump())
    return {"status": "success", "id": template_id}


@router.patch("/templates/{template_id}")
async def edit_template(template_id: int, payload: TemplateUpdate) -> dict:
    update_template(template_id, payload.model_dump(exclude_unset=True))
    return {"status": "success"}


@router.post("/templates/{template_id}/duplicate")
async def copy_template(template_id: int) -> dict:
    new_id = duplicate_template(template_id)
    if new_id is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "success", "id": new_id}


@router.delete("/templates/{template_id}")
async def remove_template(template_id: int) -> dict:
    delete_template(template_id)
    return {"status": "success"}
