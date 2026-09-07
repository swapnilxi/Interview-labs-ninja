"""Career Studio — Cover Letter Generator.

Generates a full letter from a profile's real sections + a job target (link,
pasted description, or JSON), following the same job-source shape as Job
Match/Generate Resume (see shared/job_text.py's resolve_job_source_text, reused
here rather than duplicated). A letter is a single text blob with its own
lightweight immutable-version history (cover_letter/db.py) — deliberately not
resume_versions/resume_sections, since there's no section tree here.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id
from modules.common.ai_client import AISettings

from . import db as cover_letter_db
from . import render
from ..job_match import db as jobs_db
from ..resume import db
from ..shared.ai_runs import track_ai_run
from ..shared.llm import generate_json
from ..shared.prompt_builder import build_cover_letter_prompt
from ..shared.job_text import resolve_job_source_text as _resolve_job_source_text, safe_filename as _safe_filename

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])


class CoverLetterGenerate(AISettings):
    profile_id: str
    job_source: str = "text"          # 'url' | 'text' | 'json'
    job_url: Optional[str] = None
    job_text: Optional[str] = None
    job_json: Optional[Any] = None
    tone: str = "professional"        # 'professional' | 'enthusiastic' | 'concise'
    notes: Optional[str] = None
    title: Optional[str] = None
    save_job: bool = False
    job_title: Optional[str] = None
    company: Optional[str] = None


@router.post("/cover-letters")
async def generate_cover_letter(payload: CoverLetterGenerate, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    profile = db.get_profile(uid, payload.profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.get("sections"):
        raise HTTPException(status_code=400, detail="This profile has no content yet — add or import your details first.")

    job_text = _resolve_job_source_text(payload.job_source, payload.job_url, payload.job_text, payload.job_json)
    prompt = build_cover_letter_prompt(profile["sections"], job_text, tone=payload.tone, notes=payload.notes)
    try:
        with track_ai_run(uid, "cover_letter_generate", payload.model):
            result = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    content_text = (result.get("content_text") or "").strip()
    if not content_text:
        raise HTTPException(status_code=400, detail="The AI response didn't include letter content — try again.")

    job = None
    job_description_id = None
    if payload.save_job:
        job = jobs_db.create_job(
            uid, job_text, payload.job_title, payload.company,
            payload.job_url if payload.job_source == "url" else None,
        )
        job_description_id = job["id"]

    label = (payload.job_title or payload.company or "").strip()
    title = payload.title or (f"Cover Letter — {label}" if label else "Cover Letter")
    letter = cover_letter_db.create_letter(uid, payload.profile_id, title, payload.tone, content_text, job_description_id)
    return {"letter": letter, "summary": result.get("summary"), "job": job}


@router.get("/cover-letters")
async def list_cover_letters(user_id: int = Depends(get_current_user_id)) -> list[dict]:
    return cover_letter_db.list_letters(str(user_id))


@router.get("/cover-letters/{letter_id}")
async def get_cover_letter(letter_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    letter = cover_letter_db.get_letter(str(user_id), letter_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    return letter


class CoverLetterUpdate(BaseModel):
    title: Optional[str] = None
    tone: Optional[str] = None
    content_text: Optional[str] = None


@router.patch("/cover-letters/{letter_id}")
async def update_cover_letter(letter_id: str, payload: CoverLetterUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    letter = cover_letter_db.update_letter(str(user_id), letter_id, payload.model_dump(exclude_unset=True))
    if letter is None:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    return letter


@router.delete("/cover-letters/{letter_id}")
async def delete_cover_letter(letter_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not cover_letter_db.delete_letter(str(user_id), letter_id):
        raise HTTPException(status_code=404, detail="Cover letter not found")
    return {"status": "deleted"}


class VersionLabel(BaseModel):
    label: Optional[str] = None


@router.post("/cover-letters/{letter_id}/versions")
async def snapshot_cover_letter(letter_id: str, payload: VersionLabel, user_id: int = Depends(get_current_user_id)) -> dict:
    version = cover_letter_db.snapshot_version(str(user_id), letter_id, payload.label)
    if version is None:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    return version


@router.get("/cover-letters/{letter_id}/versions")
async def list_cover_letter_versions(letter_id: str, user_id: int = Depends(get_current_user_id)) -> list[dict]:
    return cover_letter_db.list_versions(str(user_id), letter_id)


@router.post("/cover-letters/{letter_id}/versions/{version_id}/restore")
async def restore_cover_letter_version(letter_id: str, version_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    letter = cover_letter_db.restore_version(str(user_id), letter_id, version_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Cover letter or version not found")
    return letter


@router.get("/cover-letters/{letter_id}/export")
async def export_cover_letter(
    letter_id: str,
    format: str = Query("html", pattern="^(html|pdf|markdown|docx)$"),
    user_id: int = Depends(get_current_user_id),
):
    uid = str(user_id)
    letter = cover_letter_db.get_letter(uid, letter_id)
    if letter is None:
        raise HTTPException(status_code=404, detail="Cover letter not found")
    fname = _safe_filename(letter["title"])

    if format == "markdown":
        return Response(render.render_cover_letter_markdown(letter), media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}.md"'})
    if format == "docx":
        return Response(
            render.render_cover_letter_docx(letter),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{fname}.docx"'},
        )
    html_str = render.render_cover_letter_html(letter)
    if format == "pdf":
        try:
            pdf = render.html_to_pdf(html_str)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'})
    return Response(html_str, media_type="text/html; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}.html"'})
