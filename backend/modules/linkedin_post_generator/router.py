from __future__ import annotations

import io
from typing import List, Literal, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from modules.common.db import delete_lab_section, fetch_lab_sections, save_lab_section
from modules.common.ai_client import AISettings

from .llm import generate_json, generate_text
from .prompt_builder import build_analyze_prompt, build_generate_prompt, build_refine_prompt
from .schema import CATEGORY_LAB
from .store import (
    delete_template,
    duplicate_template,
    fetch_template,
    fetch_templates,
    fetch_templates_by_ids,
    save_template,
    update_template,
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


class GeneratePostPayload(AISettings):
    topic: str
    category: Optional[str] = None
    tone: Optional[str] = None
    postType: Optional[str] = None
    templateIds: List[int] = Field(default_factory=list)
    context: Optional[str] = None
    pdfText: Optional[str] = None
    variation: bool = False


class AnalyzePostPayload(AISettings):
    postText: str


class RefinePostPayload(AISettings):
    post: str
    action: Literal["improve_hook", "shorten", "expand", "change_tone"]
    tone: Optional[str] = None


# ── Categories ──────────────────────────────────────────────────────────────────

@router.get("/categories")
async def get_categories() -> List[dict]:
    return fetch_lab_sections(CATEGORY_LAB)


@router.post("/categories")
async def add_category(payload: CategoryIn) -> dict:
    save_lab_section(CATEGORY_LAB, payload.name, 1)
    return {"status": "success"}


@router.delete("/categories/{section_id}")
async def remove_category(section_id: int) -> dict:
    delete_lab_section(section_id)
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


# ── PDF context extraction ─────────────────────────────────────────────────────

@router.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)) -> dict:
    from pypdf import PdfReader

    data = await file.read()
    try:
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {exc}")
    return {"text": text.strip()}


# ── Generation ──────────────────────────────────────────────────────────────────

@router.post("/generate")
async def generate_post(payload: GeneratePostPayload) -> dict:
    templates = fetch_templates_by_ids(payload.templateIds)

    prompt = build_generate_prompt(
        topic=payload.topic,
        category=payload.category,
        context=payload.context,
        pdf_text=payload.pdfText,
        tone=payload.tone,
        post_type=payload.postType,
        templates=templates,
        variation=payload.variation,
    )
    try:
        text = generate_text(prompt, payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"post": text.strip()}


@router.post("/refine")
async def refine_post(payload: RefinePostPayload) -> dict:
    prompt = build_refine_prompt(post=payload.post, action=payload.action, tone=payload.tone)
    try:
        text = generate_text(prompt, payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"post": text.strip()}


# ── Analysis ────────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_post(payload: AnalyzePostPayload) -> dict:
    prompt = build_analyze_prompt(payload.postText)
    try:
        result = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "analysis": result.get("analysis", {}),
        "stylePrompt": result.get("stylePrompt", ""),
        "regeneratedPost": result.get("regeneratedPost", ""),
    }
