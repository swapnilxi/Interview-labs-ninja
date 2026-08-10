"""Career Studio AI endpoints — resume analyzer, section rewrite (streaming), copilot.

Same /career prefix + auth guard as router.py. Every AI request body inherits
AISettings so provider keys ride per-request (never stored). Each call is timed
into the ai_runs audit table.
"""

from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id
from modules.common.ai_client import AISettings, stream_ai_text

from ..resume import db
from ..portfolio import db as pdb
from ..shared.ai_runs import provider_of, track_ai_run, insert_ai_run
from .db import get_latest_analysis, insert_analysis
from ..shared.llm import generate_json, generate_text
from ..shared.prompt_builder import (
    _stringify,
    build_analyze_prompt,
    build_copilot_prompt,
    build_portfolio_analyze_prompt,
    build_section_analysis_prompt,
    build_section_rewrite_prompt,
    portfolio_to_text,
    resume_to_text,
)

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])


class AnalyzeResumeRequest(AISettings):
    job_description: Optional[str] = None


class AnalyzeResumeSectionsRequest(AISettings):
    job_description: Optional[str] = None
    job_title: Optional[str] = None


class SectionRewriteRequest(AISettings):
    instruction: Optional[str] = None
    job_description: Optional[str] = None


class AnalyzePortfolioRequest(AISettings):
    pass


class CareerCopilotAskRequest(AISettings):
    question: str
    master_id: Optional[str] = None


# ── Resume analyzer ─────────────────────────────────────────────────────────────

@router.post("/resumes/{master_id}/analyze")
async def analyze_resume(master_id: str, payload: AnalyzeResumeRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    resume = db.get_resume_tree(uid, master_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    resume_text = resume_to_text(resume["sections"])
    prompt = build_analyze_prompt(resume_text, payload.job_description)
    try:
        with track_ai_run(uid, "resume_analyze", payload.model):
            report = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return insert_analysis(uid, resume["current_draft_id"], report, master_id=master_id)


@router.post("/resumes/{master_id}/analyze/sections")
async def analyze_resume_sections(master_id: str, payload: AnalyzeResumeSectionsRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Section-by-section breakdown (Summary/Skills/Experience/Education/Projects,
    each with good/improve/suggested_rewrite) — distinct from the flat
    dimension-score report at POST /analyze. Preview-only, not persisted; the
    caller applies a rewrite by PATCHing that section's content directly."""
    uid = str(user_id)
    resume = db.get_resume_tree(uid, master_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    visible = [s for s in resume["sections"] if not s.get("is_hidden") and s.get("section_type") != "personal_info"]
    if not visible:
        raise HTTPException(status_code=400, detail="This resume has no sections to analyze yet.")
    prompt = build_section_analysis_prompt(resume["sections"], payload.job_description, payload.job_title)
    try:
        with track_ai_run(uid, "resume_analyze_sections", payload.model):
            report = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    by_id = {s["id"]: s for s in resume["sections"]}
    sections_out = []
    for item in report.get("sections", []) or []:
        src = by_id.get(item.get("section_id"))
        if not src:
            continue
        sections_out.append({
            "section_id": src["id"],
            "section_type": src.get("section_type"),
            "title": src.get("title"),
            "good": item.get("good") or [],
            "improve": item.get("improve") or [],
            "suggested_rewrite": item.get("suggested_rewrite"),
        })
    return {
        "overall_score": report.get("overall_score"),
        "overall_summary": report.get("overall_summary", ""),
        "sections": sections_out,
    }


@router.get("/resumes/{master_id}/analysis")
async def latest_analysis(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    master = db.get_master(uid, master_id)
    if master is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return get_latest_analysis(uid, master["current_draft_id"]) or {}


# ── Portfolio analyzer (stored in the shared analysis table) ────────────────────

@router.post("/portfolios/{master_id}/analyze")
async def analyze_portfolio(master_id: str, payload: AnalyzePortfolioRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    portfolio = pdb.get_portfolio_tree(uid, master_id)
    if portfolio is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    text = portfolio_to_text(portfolio["widgets"])
    prompt = build_portfolio_analyze_prompt(text)
    try:
        with track_ai_run(uid, "portfolio_analyze", payload.model):
            report = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return insert_analysis(uid, portfolio["current_draft_id"], report, master_id=master_id)


@router.get("/portfolios/{master_id}/analysis")
async def latest_portfolio_analysis(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    master = pdb.get_portfolio_master(uid, master_id)
    if master is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return get_latest_analysis(uid, master["current_draft_id"]) or {}


# ── Inline section rewrite (streams tokens) ─────────────────────────────────────

@router.post("/sections/{section_id}/rewrite")
async def rewrite_section(section_id: str, payload: SectionRewriteRequest, user_id: int = Depends(get_current_user_id)):
    uid = str(user_id)
    section = db.get_section(uid, section_id)
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    current_text = _stringify(section.get("content"))
    prompt = build_section_rewrite_prompt(
        section["section_type"], section.get("title"), current_text, payload.instruction,
        job_description=payload.job_description,
    )

    def _generate():
        start = time.monotonic()
        status, error = "success", None
        try:
            for chunk in stream_ai_text(prompt, payload):
                yield chunk
        except Exception as exc:  # noqa: BLE001
            status, error = "error", str(exc)
            yield f"\n[error: {exc}]"
        finally:
            latency_ms = int((time.monotonic() - start) * 1000)
            insert_ai_run(uid, "section_rewrite", provider_of(payload.model), payload.model, latency_ms, status, error)

    return StreamingResponse(_generate(), media_type="text/plain")


# ── Copilot (backs the reused lab copilot sidebar) ──────────────────────────────

@router.post("/copilot/ask")
async def copilot_ask(payload: CareerCopilotAskRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    context = None
    if payload.master_id:
        resume = db.get_resume_tree(uid, payload.master_id)
        if resume:
            context = resume_to_text(resume["sections"])
    prompt = build_copilot_prompt(payload.question, context)
    try:
        with track_ai_run(uid, "copilot", payload.model):
            answer = generate_text(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"answer": answer.strip()}
