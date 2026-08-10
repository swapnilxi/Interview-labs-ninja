from __future__ import annotations

import io
from typing import List, Literal, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from modules.common.ai_client import AISettings

from ..templates.db import fetch_templates_by_ids
from .llm import generate_json, generate_text
from .prompt_builder import build_analyze_prompt, build_generate_prompt, build_refine_prompt

router = APIRouter(prefix="/linkedin", tags=["linkedin-post-generator"])

_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


# ── Pydantic models ────────────────────────────────────────────────────────────

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


# ── PDF context extraction ─────────────────────────────────────────────────────

@router.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)) -> dict:
    from pypdf import PdfReader

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {_MAX_UPLOAD_BYTES // (1024 * 1024)}MB.")
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
