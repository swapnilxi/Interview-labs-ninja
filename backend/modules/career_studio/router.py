"""Career Studio HTTP API — resume CRUD, sections, versioning, and import.

Mounted at /career and guarded by the app's existing JWT auth (mirrors the todo
module): the router-level dependency enforces a valid Bearer token, and each
endpoint injects the caller's user_id so every row stays user-scoped.
"""

from __future__ import annotations

import io
from typing import Any, List, Optional

import re

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id
from modules.common.ai_client import AISettings

from . import db, render, versions
from .ai_runs import track_ai_run
from .llm import generate_json_array
from .prompt_builder import build_import_prompt

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


# ── Pydantic models ─────────────────────────────────────────────────────────────

class ResumeCreate(BaseModel):
    title: str = "Untitled Resume"


class ResumeUpdate(BaseModel):
    title: str


class TemplateUpdate(BaseModel):
    template_key: str


class SectionCreate(BaseModel):
    section_type: str
    title: Optional[str] = None
    content: Optional[Any] = None


class SectionUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[Any] = None
    is_hidden: Optional[bool] = None
    sort_order: Optional[int] = None


class ReorderRequest(BaseModel):
    ordered_ids: List[str] = Field(default_factory=list)


class SnapshotRequest(BaseModel):
    label: Optional[str] = None


class CloneRequest(BaseModel):
    title: Optional[str] = None


class BranchRequest(BaseModel):
    branch_name: str


class ImportStructureRequest(AISettings):
    raw_text: str


# ── Resume CRUD ─────────────────────────────────────────────────────────────────

@router.get("/resumes")
async def list_resumes(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return db.list_resumes(str(user_id))


@router.post("/resumes")
async def create_resume(payload: ResumeCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    return db.create_resume(str(user_id), payload.title)


@router.get("/resumes/{master_id}")
async def get_resume(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    resume = db.get_resume_tree(str(user_id), master_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.patch("/resumes/{master_id}")
async def update_resume(master_id: str, payload: ResumeUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    resume = db.update_resume(str(user_id), master_id, payload.title)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.patch("/resumes/{master_id}/template")
async def set_template(master_id: str, payload: TemplateUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    resume = db.set_resume_template(str(user_id), master_id, payload.template_key)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


@router.delete("/resumes/{master_id}")
async def delete_resume(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not db.soft_delete_resume(str(user_id), master_id):
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"status": "success"}


def _safe_filename(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", (title or "resume").strip()).strip("-").lower()
    return slug or "resume"


@router.get("/resumes/{master_id}/export")
async def export_resume(
    master_id: str,
    format: str = Query("html", pattern="^(html|pdf)$"),
    template: Optional[str] = None,
    user_id: int = Depends(get_current_user_id),
):
    """Render the resume to a standalone HTML file or a server-generated PDF.

    The SAME HTML backs the browser 'Save as PDF' path (client prints it), the
    .html download, and the server PDF (xhtml2pdf). `template` overrides the
    resume's saved template_key for a one-off export.
    """
    resume = db.get_resume_tree(str(user_id), master_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    html_str = render.render_resume_html(resume, template)
    fname = _safe_filename(resume.get("title", "resume"))
    if format == "pdf":
        try:
            pdf = render.html_to_pdf(html_str)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'},
        )
    return Response(
        content=html_str,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}.html"'},
    )


# ── Sections (mutable draft) ────────────────────────────────────────────────────

@router.post("/resumes/{master_id}/sections")
async def add_section(master_id: str, payload: SectionCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    section = db.add_section(str(user_id), master_id, payload.section_type, payload.title, payload.content)
    if section is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return section


@router.patch("/resumes/{master_id}/sections/{section_id}")
async def update_section(master_id: str, section_id: str, payload: SectionUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    fields = payload.model_dump(exclude_unset=True)
    section = db.update_section(str(user_id), master_id, section_id, fields)
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


@router.delete("/resumes/{master_id}/sections/{section_id}")
async def delete_section(master_id: str, section_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not db.delete_section(str(user_id), master_id, section_id):
        raise HTTPException(status_code=404, detail="Section not found")
    return {"status": "success"}


@router.post("/resumes/{master_id}/sections/reorder")
async def reorder_sections(master_id: str, payload: ReorderRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    resume = db.reorder_sections(str(user_id), master_id, payload.ordered_ids)
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


# ── Versioning (immutable checkpoints) ──────────────────────────────────────────

@router.get("/resumes/{master_id}/versions")
async def list_versions(master_id: str, user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return versions.list_versions(str(user_id), master_id)


@router.post("/resumes/{master_id}/versions")
async def snapshot_version(master_id: str, payload: SnapshotRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    version = versions.snapshot_version(str(user_id), master_id, payload.label)
    if version is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return version


@router.get("/versions/{version_id}")
async def get_version(version_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    version = versions.get_version(str(user_id), version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.post("/resumes/{master_id}/versions/{version_id}/restore")
async def restore_version(master_id: str, version_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    resume = versions.restore_version(str(user_id), master_id, version_id)
    if resume is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return resume


@router.post("/versions/{version_id}/clone")
async def clone_version(version_id: str, payload: CloneRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    resume = versions.clone_version(str(user_id), version_id, payload.title)
    if resume is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return resume


@router.post("/versions/{version_id}/branch")
async def branch_version(version_id: str, payload: BranchRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    resume = versions.branch_version(str(user_id), version_id, payload.branch_name)
    if resume is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return resume


# ── Import (PDF / DOCX / text → structured sections) ────────────────────────────

@router.post("/import/extract")
async def import_extract(file: UploadFile = File(...), user_id: int = Depends(get_current_user_id)) -> dict:
    """Extract raw text from an uploaded resume file (no AI). Frontend then calls /import/structure."""
    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {_MAX_UPLOAD_BYTES // (1024 * 1024)}MB.")
    name = (file.filename or "").lower()
    content_type = file.content_type or ""
    try:
        if name.endswith(".pdf") or "pdf" in content_type:
            text = _extract_pdf(data)
        elif name.endswith(".docx") or "word" in content_type or "officedocument" in content_type:
            text = _extract_docx(data)
        else:
            text = data.decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Failed to read file: {exc}")
    return {"text": text.strip()}


@router.post("/import/structure")
async def import_structure(payload: ImportStructureRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Use the LLM to turn extracted resume text into structured sections for a diff preview."""
    prompt = build_import_prompt(payload.raw_text)
    try:
        with track_ai_run(str(user_id), "resume_import_structure", payload.model):
            sections = generate_json_array(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"sections": sections}


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _extract_docx(data: bytes) -> str:
    import docx  # python-docx

    document = docx.Document(io.BytesIO(data))
    return "\n".join(p.text for p in document.paragraphs)
