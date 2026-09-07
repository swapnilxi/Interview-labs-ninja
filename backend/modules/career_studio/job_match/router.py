"""Career Studio — job descriptions + JD-driven resume tailoring.

Same /career prefix + auth guard as the other routers. Two capabilities:

1. Saved job descriptions (CRUD) — first-class entities so a resume can be
   tailored to a *job id* and the JD reused.
2. Tailoring — an AI pass that rewrites a resume's sections to target a job
   description. `POST .../tailor` PREVIEWS per-section rewrites (no mutation);
   `POST .../tailor/apply` commits them either in place (after an automatic
   safety checkpoint) or as a brand-new tailored copy (original untouched).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id
from modules.common.ai_client import AISettings

from ..resume import db
from ..resume import versions
from . import db as jobs_db
from ..shared.ai_runs import track_ai_run
from ..shared.llm import generate_json
from ..shared.prompt_builder import _stringify, build_tailor_prompt

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])


# ── Saved job descriptions ──────────────────────────────────────────────────────

class JobCreateRequest(BaseModel):
    raw_text: str
    title: Optional[str] = None
    company: Optional[str] = None
    url: Optional[str] = None
    structured: Optional[dict] = None


@router.get("/jobs")
async def list_jobs(user_id: int = Depends(get_current_user_id)) -> list[dict]:
    return jobs_db.list_jobs(str(user_id))


@router.post("/jobs")
async def create_job(payload: JobCreateRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    if not (payload.raw_text or "").strip():
        raise HTTPException(status_code=400, detail="Job description text is required")
    return jobs_db.create_job(str(user_id), payload.raw_text, payload.title, payload.company, payload.url, structured=payload.structured)


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    job = jobs_db.get_job(str(user_id), job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job description not found")
    return job


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not jobs_db.delete_job(str(user_id), job_id):
        raise HTTPException(status_code=404, detail="Job description not found")
    return {"status": "deleted"}


# ── Tailoring ───────────────────────────────────────────────────────────────────

class TailorRequest(AISettings):
    job_description_id: Optional[str] = None
    job_description: Optional[str] = None  # raw text alternative to an id
    notes: Optional[str] = None
    save_job: bool = False  # persist a raw job_description as a saved JD
    job_title: Optional[str] = None
    company: Optional[str] = None


class TailorUpdate(BaseModel):
    section_id: str
    title: Optional[str] = None
    content: dict


class TailorApplyRequest(BaseModel):
    updates: list[TailorUpdate]
    mode: str = "copy"  # "copy" (new tailored resume) | "in_place"
    new_title: Optional[str] = None
    job_label: Optional[str] = None


def _resolve_job_text(uid: str, payload: TailorRequest) -> tuple[str, Optional[dict]]:
    """Return (job_text, job_record|None). Optionally persists a raw JD."""
    if payload.job_description_id:
        job = jobs_db.get_job(uid, payload.job_description_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job description not found")
        return job["raw_text"], job
    text = (payload.job_description or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Provide a job_description or job_description_id")
    if payload.save_job:
        job = jobs_db.create_job(uid, text, payload.job_title, payload.company, None)
        return text, job
    return text, None


@router.post("/resumes/{master_id}/tailor")
async def tailor_resume(master_id: str, payload: TailorRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Preview per-section rewrites targeted to a job description. No mutation."""
    uid = str(user_id)
    resume = db.get_resume_tree(uid, master_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    job_text, job = _resolve_job_text(uid, payload)
    prompt = build_tailor_prompt(resume["sections"], job_text, payload.notes)
    try:
        with track_ai_run(uid, "resume_tailor", payload.model):
            result = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    by_id = {s["id"]: s for s in resume["sections"]}
    changes = []
    for upd in result.get("updates", []) or []:
        sid = upd.get("section_id")
        current = by_id.get(sid)
        if not current or "content" not in upd:
            continue
        changes.append({
            "section_id": sid,
            "section_type": current.get("section_type"),
            "title": upd.get("title") or current.get("title"),
            "before_text": _stringify(current.get("content")),
            "after_text": _stringify(upd.get("content")),
            "content": upd.get("content"),
            "rationale": upd.get("rationale"),
        })
    return {
        "summary": result.get("summary"),
        "keywords_added": result.get("keywords_added", []),
        "changes": changes,
        "job": job,
    }


@router.post("/resumes/{master_id}/tailor/apply")
async def apply_tailor(master_id: str, payload: TailorApplyRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    resume = db.get_resume_tree(uid, master_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not payload.updates:
        raise HTTPException(status_code=400, detail="No updates to apply")

    overrides = {u.section_id: u for u in payload.updates}

    if payload.mode == "in_place":
        # Safety checkpoint so the pre-tailoring resume is always recoverable.
        versions.snapshot_version(uid, master_id, label="Before tailoring", source="tailor")
        applied = 0
        for s in resume["sections"]:
            u = overrides.get(s["id"])
            if not u:
                continue
            fields: dict = {"content": u.content}
            if u.title is not None:
                fields["title"] = u.title
            if db.update_section(uid, master_id, s["id"], fields) is not None:
                applied += 1
        tree = db.get_resume_tree(uid, master_id)
        return {"mode": "in_place", "applied": applied, "resume": tree}

    # mode == "copy": build the tailored section set and fork a new resume.
    new_sections = []
    for s in resume["sections"]:
        u = overrides.get(s["id"])
        new_sections.append({
            "section_type": s.get("section_type", "custom"),
            "title": (u.title if (u and u.title is not None) else s.get("title")),
            "content": (u.content if u else s.get("content", {})),
            "sort_order": s.get("sort_order", 0),
            "is_hidden": s.get("is_hidden", False),
        })
    label = payload.job_label or "tailored"
    title = payload.new_title or f"{resume['title']} — {label}"
    new_resume = versions.create_resume_from_sections(uid, new_sections, title, branch_name=label)
    return {"mode": "copy", "applied": len(overrides), "resume": new_resume}
