"""Career Studio — Master Profiles + live template-driven views.

Same /career prefix + JWT guard. A user keeps one or more **profiles** (reusable
data), then spins up **views** (resumes/portfolios) that each pick a profile + a
template. Views store no content; they render live from the chosen profile, so
editing a profile updates every view that uses it.

Profile *content* editing reuses the existing resume section endpoints in
router.py (a profile is a resume_master row), so this router only owns profile
identity (list/create/delete) and the whole view lifecycle.
"""

from __future__ import annotations

import html
import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user_id
from modules.common.ai_client import AISettings

from . import db, jobs_db, publish_db, render, templates_db, versions, views_db
from .ai_runs import track_ai_run
from .analysis_db import get_latest_analysis, insert_analysis
from .llm import generate_json, generate_json_array
from .prompt_builder import (
    _stringify,
    build_analyze_prompt,
    build_enrichment_prompt,
    build_generate_with_gap_prompt,
    build_import_prompt,
    build_job_extraction_prompt,
    build_tailor_prompt,
    resume_to_text,
)

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])


# ── Profiles ────────────────────────────────────────────────────────────────────

class ProfileCreate(BaseModel):
    title: str = "My Profile"


class ProfileDuplicateRequest(BaseModel):
    title: Optional[str] = None


@router.get("/profiles")
async def list_profiles(include_archived: bool = False, user_id: int = Depends(get_current_user_id)) -> list[dict]:
    return db.list_profiles(str(user_id), include_archived=include_archived)


@router.post("/profiles")
async def create_profile(payload: ProfileCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    return db.create_profile(str(user_id), payload.title)


@router.get("/profiles/{profile_id}")
async def get_profile(profile_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    profile = db.get_profile(str(user_id), profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.post("/profiles/{profile_id}/duplicate")
async def duplicate_profile(profile_id: str, payload: ProfileDuplicateRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    duplicated = db.duplicate_profile(str(user_id), profile_id, payload.title)
    if duplicated is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return duplicated


@router.post("/profiles/{profile_id}/archive")
async def archive_profile(profile_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    updated = db.set_profile_archived(str(user_id), profile_id, True)
    if updated is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return updated


@router.post("/profiles/{profile_id}/unarchive")
async def unarchive_profile(profile_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    updated = db.set_profile_archived(str(user_id), profile_id, False)
    if updated is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return updated


class ProfileMetadataUpdate(BaseModel):
    description: Optional[str] = None
    primary_role: Optional[str] = None
    experience_level: Optional[str] = None
    target_industry: Optional[str] = None
    target_roles: Optional[list[str]] = None
    target_companies: Optional[list[str]] = None
    tech_stack: Optional[list[str]] = None
    tags: Optional[list[str]] = None


@router.patch("/profiles/{profile_id}/metadata")
async def update_profile_metadata(profile_id: str, payload: ProfileMetadataUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    fields = payload.model_dump(exclude_unset=True)
    updated = db.update_profile_metadata(str(user_id), profile_id, fields)
    if updated is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return updated


@router.post("/profiles/{profile_id}/touch")
async def touch_profile_endpoint(profile_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    db.touch_profile(str(user_id), profile_id)
    return {"status": "ok"}


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if db.get_profile(str(user_id), profile_id) is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.soft_delete_resume(str(user_id), profile_id)
    return {"status": "deleted"}


# ── Profile import (from an existing resume/profile, raw JSON, or AI-parsed text) ─
#
# One request shape drives three sources. `source` picks how sections are
# resolved; the resolved sections then either seed a NEW profile (POST
# /profiles/import), replace/append into an existing one (POST
# /profiles/{id}/import), or are returned for a diff preview (…/import/preview).

# Section types the profile/resume model understands; anything else is kept as a
# generic 'custom' section (the renderers handle items-based content generically).
_KNOWN_SECTION_TYPES = {
    "personal_info", "summary", "experience", "education", "skills", "projects",
    "certifications", "awards", "languages", "achievements", "research",
    "volunteer", "publications", "interests", "patents", "career_goals", "custom",
}

# Origin + confidence heuristics for profiles created via the /profiles/import
# endpoints: json/resume copies are exact, so high confidence; AI-parsed free text
# carries more inference risk, so lower confidence.
_IMPORT_ORIGIN = {"resume": "import_resume", "json": "import_json", "text": "import_text"}
_IMPORT_CONFIDENCE = {"resume": 95, "json": 100, "text": 70}


class ProfileImportRequest(AISettings):
    """AISettings is only consulted when source == 'text' (the AI parse); json /
    resume sources ignore the provider fields but inherit their harmless defaults."""
    source: str  # 'json' | 'text' | 'resume'
    title: Optional[str] = None            # new-profile title (create/preview)
    mode: str = "replace"                  # 'replace' | 'append' (import into existing)
    sections: Optional[list[dict]] = None  # source == 'json'
    raw_text: Optional[str] = None         # source == 'text'
    resume_id: Optional[str] = None        # source == 'resume' (any master the user owns)


_ITEM_SECTION_TYPES = {
    "experience", "education", "projects", "certifications", "awards",
    "achievements", "research", "volunteer", "custom",
}


def _coerce_item(raw_item, notes: list[str], section_label: str) -> dict:
    if not isinstance(raw_item, dict):
        notes.append(f'{section_label}: dropped a non-object entry in "items"')
        return {"title": "", "subtitle": "", "date": "", "bullets": []}
    bullets = raw_item.get("bullets")
    if not isinstance(bullets, list):
        if isinstance(bullets, str) and bullets.strip():
            bullets = [bullets.strip()]
        else:
            bullets = []
    bullets = [str(b) for b in bullets if isinstance(b, (str, int, float))]
    return {
        "title": str(raw_item.get("title") or ""),
        "subtitle": str(raw_item.get("subtitle") or ""),
        "date": str(raw_item.get("date") or ""),
        "bullets": bullets,
    }


def _coerce_content(section_type: str, raw_content: dict, notes: list[str], section_label: str) -> dict:
    """Enforce the per-type content shape this codebase's renderers expect
    (see db.default_content for the canonical empty shapes), coercing whatever
    was actually provided instead of trusting it blindly."""
    if section_type == "personal_info":
        links = raw_content.get("links")
        if not isinstance(links, list):
            links = []
        return {
            "name": str(raw_content.get("name") or ""),
            "title": str(raw_content.get("title") or ""),
            "email": str(raw_content.get("email") or ""),
            "phone": str(raw_content.get("phone") or ""),
            "location": str(raw_content.get("location") or ""),
            "links": [str(l) for l in links if isinstance(l, (str, int, float))],
        }
    if section_type == "summary":
        text = raw_content.get("text")
        if not isinstance(text, str):
            notes.append(f'{section_label}: "text" was not a string — coerced to empty')
            text = ""
        return {"text": text}
    if section_type == "skills":
        groups_raw = raw_content.get("groups")
        groups: list[dict] = []
        if isinstance(groups_raw, list):
            for g in groups_raw:
                if not isinstance(g, dict):
                    notes.append(f'{section_label}: dropped a non-object entry in "groups"')
                    continue
                items = g.get("items")
                items = [str(i) for i in items] if isinstance(items, list) else []
                groups.append({"name": str(g.get("name") or ""), "items": items})
        else:
            notes.append(f'{section_label}: "groups" was missing/invalid — defaulted to empty')
        return {"groups": groups}
    if section_type in _ITEM_SECTION_TYPES:
        items_raw = raw_content.get("items")
        if not isinstance(items_raw, list):
            notes.append(f'{section_label}: "items" was missing/invalid — defaulted to empty')
            items_raw = []
        return {"items": [_coerce_item(i, notes, section_label) for i in items_raw]}
    return raw_content


def _normalize_sections(raw: Optional[list]) -> tuple[list[dict], list[str]]:
    """Coerce arbitrary section dicts into the stored shape: a valid section_type,
    a title, and a properly-shaped content object — never trusting nested field
    shapes blindly. Returns (sections, mapping_notes) — notes describe anything
    coerced/renamed/dropped so the caller can show the user before saving."""
    out: list[dict] = []
    notes: list[str] = []
    for idx, s in enumerate(raw or []):
        label = f"Item {idx + 1}"
        if not isinstance(s, dict):
            notes.append(f"{label}: skipped — not a JSON object")
            continue
        st = str(s.get("section_type") or "custom").strip() or "custom"
        if st not in _KNOWN_SECTION_TYPES:
            notes.append(f'{label}: unrecognized section_type "{st}" — mapped to a Custom section')
            st = "custom"
        label = s.get("title") or st.replace("_", " ").title()
        raw_content = s.get("content")
        if not isinstance(raw_content, dict):
            notes.append(f'{label}: "content" was missing/invalid — defaulted to empty')
            raw_content = db.default_content(st)
        content = _coerce_content(st, raw_content, notes, label)
        out.append({
            "section_type": st,
            "title": s.get("title") or st.replace("_", " ").title(),
            "content": content,
            "is_hidden": bool(s.get("is_hidden", False)),
            "sort_order": s.get("sort_order", len(out)),
        })
    return out, notes


def _resolve_import_sections(uid: str, payload: "ProfileImportRequest") -> tuple[list[dict], list[str]]:
    src = payload.source
    if src == "json":
        if not payload.sections:
            raise HTTPException(status_code=400, detail="Provide 'sections' for a JSON import")
        return _normalize_sections(payload.sections)
    if src == "resume":
        if not payload.resume_id:
            raise HTTPException(status_code=400, detail="Provide 'resume_id' for a resume import")
        tree = db.get_resume_tree(uid, payload.resume_id)
        if tree is None:
            raise HTTPException(status_code=404, detail="Source resume/profile not found")
        return _normalize_sections(tree.get("sections", []))
    if src == "text":
        text = (payload.raw_text or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Provide 'raw_text' for a text import")
        prompt = build_import_prompt(text)
        try:
            with track_ai_run(uid, "profile_import_text", payload.model):
                sections = generate_json_array(prompt, payload)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return _normalize_sections(sections)
    raise HTTPException(status_code=400, detail="source must be 'json', 'text', or 'resume'")


def _default_import_title(payload: "ProfileImportRequest") -> str:
    return {"resume": "Imported Profile", "text": "Profile from Text", "json": "Imported Profile"}.get(
        payload.source, "Imported Profile"
    )


@router.post("/profiles/import/preview")
async def preview_profile_import(payload: ProfileImportRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Resolve sections from the chosen source WITHOUT mutating anything, so the
    UI can show a diff/confirm step (mirrors the resume /import/structure flow)."""
    sections, notes = _resolve_import_sections(str(user_id), payload)
    return {"sections": sections, "count": len(sections), "mapping_notes": notes}


@router.post("/profiles/import")
async def create_profile_from_import(payload: ProfileImportRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Create a NEW profile populated from an existing resume, raw JSON, or AI-parsed text."""
    uid = str(user_id)
    sections, _notes = _resolve_import_sections(uid, payload)
    if not sections:
        raise HTTPException(status_code=400, detail="No sections could be extracted from the source")
    return db.create_profile_from_sections(
        uid, sections, payload.title or _default_import_title(payload),
        origin=_IMPORT_ORIGIN.get(payload.source, "manual"),
        confidence_score=_IMPORT_CONFIDENCE.get(payload.source),
    )


@router.post("/profiles/{profile_id}/import")
async def import_into_profile(
    profile_id: str, payload: ProfileImportRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    """Replace or append an existing profile's content from a source. On 'replace'
    the profile is snapshotted first so the pre-import state is recoverable."""
    uid = str(user_id)
    if db.get_profile(uid, profile_id) is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if payload.mode not in ("replace", "append"):
        raise HTTPException(status_code=400, detail="mode must be 'replace' or 'append'")
    sections, _notes = _resolve_import_sections(uid, payload)
    if not sections:
        raise HTTPException(status_code=400, detail="No sections could be extracted from the source")
    if payload.mode == "replace":
        versions.snapshot_version(uid, profile_id, label="Before import", source="import")
    updated = db.replace_profile_sections(uid, profile_id, sections, payload.mode)
    if updated is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return updated


# ── Profile Enrichment: merge ANOTHER document into an existing profile, with
# AI-assisted duplicate/conflict detection — distinct from plain import's
# replace/append (which trusts the source wholesale and doesn't compare it
# against what's already there). Preview classifies incoming content as
# additions/duplicates/conflicts without mutating anything; apply commits only
# what the user accepted, snapshotting the profile first.

class ProfileEnrichRequest(AISettings):
    kind: str                              # 'resume'|'certificates'|'research_papers'|'project_documentation'|'github_readme'|'linkedin_export'|'context'|'json'
    source: str                            # 'json' | 'text' | 'resume' — resolution mechanics, same as ProfileImportRequest
    sections: Optional[list[dict]] = None  # source == 'json'
    raw_text: Optional[str] = None         # source == 'text' (also used for context/certificates/etc. — 'kind' is just the label)
    resume_id: Optional[str] = None        # source == 'resume'


@router.post("/profiles/{profile_id}/enrich/preview")
async def preview_profile_enrichment(
    profile_id: str, payload: ProfileEnrichRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    """Resolve the new document into sections, then ask the model to classify
    each piece against the profile's CURRENT sections. Nothing is mutated."""
    uid = str(user_id)
    profile = db.get_profile(uid, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    incoming, _notes = _resolve_import_sections(uid, payload)
    if not incoming:
        raise HTTPException(status_code=400, detail="No content could be extracted from that source")
    prompt = build_enrichment_prompt(profile.get("sections", []), incoming, payload.kind)
    try:
        with track_ai_run(uid, "profile_enrich", payload.model):
            result = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "additions": result.get("additions") or [],
        "duplicates": result.get("duplicates") or [],
        "conflicts": result.get("conflicts") or [],
    }


class EnrichAddition(BaseModel):
    section_type: str
    title: Optional[str] = None
    content: dict


class EnrichConflictResolution(BaseModel):
    existing_section_id: str
    content: dict
    title: Optional[str] = None


class ProfileEnrichApply(BaseModel):
    kind: str
    additions: list[EnrichAddition] = []
    conflict_resolutions: list[EnrichConflictResolution] = []


@router.post("/profiles/{profile_id}/enrich/apply")
async def apply_profile_enrichment(
    profile_id: str, payload: ProfileEnrichApply, user_id: int = Depends(get_current_user_id)
) -> dict:
    """Commit only the additions/conflict-resolutions the user accepted. The
    profile is snapshotted first so this is always recoverable."""
    uid = str(user_id)
    if db.get_profile(uid, profile_id) is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not payload.additions and not payload.conflict_resolutions:
        raise HTTPException(status_code=400, detail="Nothing to merge")
    versions.snapshot_version(uid, profile_id, label=f"Before enrichment: {payload.kind}", source="enrichment")
    source_tag = f"enrichment:{payload.kind}"
    added = 0
    for a in payload.additions:
        if db.add_section(uid, profile_id, a.section_type, a.title, a.content, source=source_tag) is not None:
            added += 1
    resolved = 0
    for c in payload.conflict_resolutions:
        fields: dict = {"content": c.content, "source": source_tag}
        if c.title is not None:
            fields["title"] = c.title
        if db.update_section(uid, profile_id, c.existing_section_id, fields) is not None:
            resolved += 1
    updated = db.get_profile(uid, profile_id)
    return {"profile": updated, "added": added, "resolved": resolved}


# ── Views ─────────────────────────────────────────────────────────────────────

class ViewCreate(BaseModel):
    profile_id: str
    kind: str  # 'resume' | 'portfolio'
    title: Optional[str] = None
    template: Optional[str] = None


class ConfigItem(BaseModel):
    section_id: str
    hidden: bool = False


class ViewConfig(BaseModel):
    items: list[ConfigItem] = []


class ViewUpdate(BaseModel):
    title: Optional[str] = None
    template: Optional[str] = None
    accent: Optional[str] = None
    font: Optional[str] = None
    layout: Optional[str] = None
    profile_id: Optional[str] = None
    config: Optional[ViewConfig] = None


@router.get("/views")
async def list_views(kind: Optional[str] = None, user_id: int = Depends(get_current_user_id)) -> list[dict]:
    return views_db.list_views(str(user_id), kind)


@router.post("/views")
async def create_view(payload: ViewCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    if payload.kind not in ("resume", "portfolio"):
        raise HTTPException(status_code=400, detail="kind must be 'resume' or 'portfolio'")
    view = views_db.create_view(str(user_id), payload.profile_id, payload.kind, payload.title, payload.template)
    if view is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return view


@router.get("/views/{view_id}")
async def get_view(view_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    view = views_db.get_view(str(user_id), view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    return view


@router.patch("/views/{view_id}")
async def update_view(view_id: str, payload: ViewUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    fields = payload.model_dump(exclude_unset=True)
    if "config" in fields and fields["config"] is not None:
        fields["config"] = payload.config.model_dump()
    view = views_db.update_view(str(user_id), view_id, fields)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    return view


@router.delete("/views/{view_id}")
async def delete_view(view_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not views_db.delete_view(str(user_id), view_id):
        raise HTTPException(status_code=404, detail="View not found")
    return {"status": "deleted"}


# ── Rendering / export ──────────────────────────────────────────────────────────

def _safe_filename(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", (title or "document").strip()).strip("-").lower()
    return slug or "document"


def _portfolio_theme(uid: str, view: dict) -> dict:
    """A view's `template` may be a user-designed template id — expand its spec
    into a portfolio theme; otherwise fall back to the view's own theme fields."""
    spec = templates_db.get_spec(uid, view.get("template"))
    if spec:
        return {"accent": spec.get("accent") or "violet", "font": spec.get("font") or "sans",
                "layout": spec.get("layout") or "stack", "template": spec.get("background") or "minimal"}
    return {"accent": view.get("accent") or "violet", "font": view.get("font") or "sans",
            "layout": view.get("layout") or "stack", "template": view.get("template") or "minimal"}


def _render_view_html(uid: str, view: dict) -> str:
    visible = [s for s in view.get("sections", []) if not s.get("hidden")]
    if view["kind"] == "portfolio":
        theme = _portfolio_theme(uid, view)
        widgets = views_db.resolved_to_widgets(view.get("sections", []))
        return render.render_portfolio_html({"title": view["title"], "theme": theme, "widgets": widgets})
    # Resume: a custom template id resolves to a spec; else the value is a
    # built-in template key (classic/modern/…), else the classic default.
    spec = templates_db.get_spec(uid, view.get("template"))
    resume = {"title": view["title"], "template_key": view.get("template") or "classic", "sections": visible}
    return render.render_resume_html(resume, view.get("template"), spec=spec)


@router.get("/views/{view_id}/export")
async def export_view(
    view_id: str,
    format: str = Query("html", pattern="^(html|pdf|markdown|docx)$"),
    user_id: int = Depends(get_current_user_id),
):
    uid = str(user_id)
    view = views_db.get_view(uid, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    if not view.get("sections"):
        raise HTTPException(status_code=400, detail="This view's profile is empty or was deleted.")
    fname = _safe_filename(view["title"])

    if format in ("markdown", "docx"):
        if format == "docx" and view["kind"] != "resume":
            raise HTTPException(status_code=400, detail="DOCX export is only available for resumes")
        visible = [s for s in view.get("sections", []) if not s.get("hidden")]
        resume = {"title": view["title"], "sections": visible}
        if format == "markdown":
            md = render.render_resume_markdown(resume)
            return Response(md, media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}.md"'})
        docx_bytes = render.render_resume_docx(resume)
        return Response(
            docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{fname}.docx"'},
        )

    html_str = _render_view_html(uid, view)
    if format == "pdf":
        try:
            pdf = render.html_to_pdf(html_str)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'})
    return Response(html_str, media_type="text/html; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}.html"'})


# ── Portfolio-view publishing (reuses publish_db, keyed by the view id) ─────────

@router.get("/views/{view_id}/publish")
async def view_publish_status(view_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if views_db.get_view(str(user_id), view_id) is None:
        raise HTTPException(status_code=404, detail="View not found")
    return publish_db.get_by_master(str(user_id), view_id) or {}


@router.post("/views/{view_id}/publish")
async def view_publish(view_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    view = views_db.get_view(uid, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    # Resolve a custom template's spec into a concrete theme/spec and SNAPSHOT
    # it into the published record, so the public reader stays self-contained
    # even if the template is later edited or deleted.
    if view["kind"] == "portfolio":
        theme = _portfolio_theme(uid, view)
        widgets = views_db.resolved_to_widgets(view.get("sections", []))
        return publish_db.publish(uid, view_id, view["title"], widgets, theme, kind="portfolio")
    visible = [s for s in view.get("sections", []) if not s.get("hidden")]
    spec = templates_db.get_spec(uid, view.get("template"))
    return publish_db.publish(uid, view_id, view["title"], visible, {"template": view.get("template") or "classic", "spec": spec}, kind="resume")


@router.delete("/views/{view_id}/publish")
async def view_unpublish(view_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not publish_db.unpublish(str(user_id), view_id):
        raise HTTPException(status_code=404, detail="Not published")
    return {"status": "unpublished"}


# ── AI: analyze + tailor, scoped to a view's visible sections ───────────────────

class ViewAnalyzeRequest(AISettings):
    job_description: Optional[str] = None


class ViewTailorRequest(AISettings):
    job_description_id: Optional[str] = None
    job_description: Optional[str] = None
    notes: Optional[str] = None
    save_job: bool = False
    job_title: Optional[str] = None
    company: Optional[str] = None


class ViewTailorApply(BaseModel):
    updates: list[dict]  # [{section_id, title?, content}]
    mode: str = "new_profile"  # 'new_profile' (new tailored profile + view) | 'in_place' (edit this profile)
    job_label: Optional[str] = None


def _visible_sections(view: dict) -> list[dict]:
    return [s for s in view.get("sections", []) if not s.get("hidden")]


@router.post("/views/{view_id}/analyze")
async def analyze_view(view_id: str, payload: ViewAnalyzeRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    view = views_db.get_view(uid, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    visible = _visible_sections(view)
    text = resume_to_text(visible)
    prompt = build_analyze_prompt(text, payload.job_description, sections=visible)
    try:
        with track_ai_run(uid, "view_analyze", payload.model):
            report = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return insert_analysis(uid, view_id, report, master_id=view_id)


@router.get("/views/{view_id}/analysis")
async def latest_view_analysis(view_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    if views_db.get_view(uid, view_id) is None:
        raise HTTPException(status_code=404, detail="View not found")
    return get_latest_analysis(uid, view_id) or {}


@router.post("/views/{view_id}/tailor")
async def tailor_view(view_id: str, payload: ViewTailorRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Preview per-section rewrites tailored to a job description. No mutation."""
    uid = str(user_id)
    view = views_db.get_view(uid, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    if payload.job_description_id:
        job = jobs_db.get_job(uid, payload.job_description_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job description not found")
        job_text = job["raw_text"]
    else:
        job_text = (payload.job_description or "").strip()
        if not job_text:
            raise HTTPException(status_code=400, detail="Provide a job_description or job_description_id")
        job = jobs_db.create_job(uid, job_text, payload.job_title, payload.company, None) if payload.save_job else None

    visible = _visible_sections(view)
    prompt = build_tailor_prompt(visible, job_text, payload.notes)
    try:
        with track_ai_run(uid, "view_tailor", payload.model):
            result = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    by_id = {s["id"]: s for s in view.get("sections", [])}
    changes = []
    for upd in result.get("updates", []) or []:
        cur = by_id.get(upd.get("section_id"))
        if not cur or "content" not in upd:
            continue
        changes.append({
            "section_id": upd["section_id"],
            "section_type": cur.get("section_type"),
            "title": upd.get("title") or cur.get("title"),
            "before_text": _stringify(cur.get("content")),
            "after_text": _stringify(upd.get("content")),
            "content": upd.get("content"),
            "rationale": upd.get("rationale"),
        })
    return {"summary": result.get("summary"), "keywords_added": result.get("keywords_added", []), "changes": changes, "job": job}


@router.post("/views/{view_id}/tailor/apply")
async def apply_tailor_view(view_id: str, payload: ViewTailorApply, user_id: int = Depends(get_current_user_id)) -> dict:
    uid = str(user_id)
    view = views_db.get_view(uid, view_id)
    if view is None:
        raise HTTPException(status_code=404, detail="View not found")
    if not payload.updates:
        raise HTTPException(status_code=400, detail="No updates to apply")
    profile = db.get_profile(uid, view["profile_id"])
    if profile is None:
        raise HTTPException(status_code=400, detail="This view's profile was deleted")
    overrides = {u["section_id"]: u for u in payload.updates if u.get("section_id")}

    if payload.mode == "in_place":
        # Snapshot the profile first so the pre-tailor data is recoverable, then
        # rewrite its sections — this affects EVERY view built on this profile.
        from . import versions
        versions.snapshot_version(uid, profile["id"], label="Before tailoring", source="tailor")
        applied = 0
        for s in profile["sections"]:
            u = overrides.get(s["id"])
            if not u:
                continue
            fields = {"content": u.get("content")}
            if u.get("title") is not None:
                fields["title"] = u["title"]
            if db.update_section(uid, profile["id"], s["id"], fields) is not None:
                applied += 1
        return {"mode": "in_place", "applied": applied, "view_id": view_id, "profile_id": profile["id"]}

    # mode == "new_profile": clone the profile with overrides, then a new view of
    # the same kind/template pointing at it (original profile + view untouched).
    label = payload.job_label or "tailored"
    new_sections = []
    for s in profile["sections"]:
        u = overrides.get(s["id"])
        new_sections.append({
            "section_type": s.get("section_type", "custom"),
            "title": (u.get("title") if (u and u.get("title") is not None) else s.get("title")),
            "content": (u.get("content") if u else s.get("content", {})),
            "sort_order": s.get("sort_order", 0),
            "is_hidden": s.get("is_hidden", False),
        })
    new_profile = db.create_profile_from_sections(
        uid, new_sections, f"{profile['title']} — {label}", origin="tailor", confidence_score=85,
    )
    new_view = views_db.create_view(uid, new_profile["id"], view["kind"], f"{view['title']} — {label}", view.get("template"))
    return {"mode": "new_profile", "applied": len(overrides), "profile_id": new_profile["id"], "view_id": new_view["id"]}


# ── Generate a resume from a job (link / description / text context / JSON) ───────
#
# One-step "make me a resume for this job": takes a source profile (the real
# data) + a job target, tailors the profile's sections to the job, and produces
# a NEW tailored profile plus a resume view pointing at it. The source profile is
# left untouched. Reuses the tailor prompt; job text can come from a URL we fetch,
# raw text (a pasted description or freeform context), or a JSON object.

_MAX_FETCH_BYTES = 2_000_000       # cap the download so a huge page can't OOM us
_MAX_JOB_TEXT_CHARS = 20_000       # cap what we feed the model


def _assert_public_http_url(url: str) -> None:
    """Block SSRF: this URL is fetched server-side, authenticated, on a
    multi-tenant deployment, and up to 20k chars of the response gets fed
    through an LLM whose output is handed back to the caller — a far richer
    read-oracle than a simple GET. Reject loopback/private/link-local/reserved
    targets (localhost, 127.0.0.1, 169.254.169.254 cloud metadata, RFC1918
    ranges, etc.) so a job link can't be used to probe internal infrastructure."""
    parsed = urllib.parse.urlsplit(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Job link must start with http:// or https://")
    hostname = parsed.hostname
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Couldn't resolve that job link's host")
    for family, _, _, _, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise HTTPException(status_code=400, detail="That job link points to a non-public address, which isn't allowed")


def _strip_html_to_text(fragment: str) -> str:
    # Unescape FIRST: some sources (e.g. Greenhouse's job API) return HTML
    # that's itself entity-escaped (literal "&lt;h2&gt;"), so stripping tags
    # before unescaping would find no real "<...>" to strip and leave the
    # escaped markup sitting in the output as text.
    unescaped = html.unescape(fragment or "")
    text = re.sub(r"(?s)<[^>]+>", " ", unescaped)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _api_get_json(url: str, timeout: int = 10) -> Optional[dict]:
    """GET a fixed, hardcoded (never user-supplied) API URL and parse JSON.
    Returns None on ANY failure so callers can fall back to generic scraping —
    a site-specific integration should never be a new way for this feature to
    break, only a way to make it better when it works."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; LabNinja Career Studio)"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed host, not user input)
            return json.loads(resp.read())
    except Exception:  # noqa: BLE001 — deliberately broad, this is a best-effort enhancement
        return None


def _fetch_greenhouse_job(url: str) -> Optional[str]:
    """Greenhouse publishes an official public job-board API for exactly this
    (developers.greenhouse.io/job-board.html) — calling it directly is more
    robust than scraping the rendered page, and is what it's meant for."""
    m = re.match(r"^https?://(?:www\.)?(?:job-boards|boards)\.greenhouse\.io/([^/?#]+)/jobs/(\d+)", url.strip(), re.IGNORECASE)
    if not m:
        return None
    board, job_id = m.group(1), m.group(2)
    data = _api_get_json(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job_id}")
    if not data or not data.get("content"):
        return None
    header = " · ".join(x for x in [data.get("title"), data.get("company_name")] if x)
    body = _strip_html_to_text(data["content"])
    return f"{header}\n\n{body}".strip() if header else body


def _fetch_lever_job(url: str) -> Optional[str]:
    """Lever publishes an official public postings API (github.com/lever/postings-api)."""
    m = re.match(r"^https?://(?:www\.)?jobs\.lever\.co/([^/?#]+)/([0-9a-fA-F-]+)", url.strip(), re.IGNORECASE)
    if not m:
        return None
    site, posting_id = m.group(1), m.group(2)
    data = _api_get_json(f"https://api.lever.co/v0/postings/{site}/{posting_id}?mode=json")
    if not data:
        return None
    body = data.get("descriptionPlain") or _strip_html_to_text(data.get("description") or "")
    if not body:
        return None
    return f"{data['text']}\n\n{body}".strip() if data.get("text") else body


# Tried in order; the first one whose URL pattern matches AND whose API call
# succeeds wins. Everything else (LinkedIn, Indeed, Wellfound, Ashby, plain
# company career pages, …) falls through to the generic HTML scraper below —
# several of those sites actively restrict automated access, so this
# deliberately does NOT attempt to work around that; it only adds real,
# documented public APIs for platforms that offer one.
_SITE_JOB_EXTRACTORS: list[Callable[[str], Optional[str]]] = [_fetch_greenhouse_job, _fetch_lever_job]


def _fetch_url_text(url: str) -> str:
    """Fetch a job posting URL and reduce it to readable plain text (no JS/CSS/tags)."""
    _assert_public_http_url(url)
    for extractor in _SITE_JOB_EXTRACTORS:
        site_text = extractor(url)
        if site_text and len(site_text) >= 40:
            return site_text[:_MAX_JOB_TEXT_CHARS]

    req = urllib.request.Request(
        url.strip(),
        headers={"User-Agent": "Mozilla/5.0 (compatible; LabNinja Career Studio)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (public-only, see _assert_public_http_url)
            charset = resp.headers.get_content_charset() or "utf-8"
            raw = resp.read(_MAX_FETCH_BYTES)
    except (urllib.error.URLError, ValueError, TimeoutError) as exc:
        raise HTTPException(status_code=400, detail=f"Couldn't fetch that link: {exc}")
    doc = raw.decode(charset, errors="replace")
    # Drop script/style/noscript blocks first (generic path only).
    doc = re.sub(r"(?is)<(script|style|noscript|template)[^>]*>.*?</\1>", " ", doc)
    text = _strip_html_to_text(doc)
    if len(text) < 40:
        raise HTTPException(status_code=400, detail="That link didn't yield readable job text — paste the description instead.")
    return text[:_MAX_JOB_TEXT_CHARS]


class JobExtractRequest(AISettings):
    job_source: str = "text"          # 'url' | 'text' | 'json'
    job_url: Optional[str] = None
    job_text: Optional[str] = None
    job_json: Optional[Any] = None


def _resolve_job_source_text(job_source: str, job_url: Optional[str], job_text: Optional[str], job_json: Optional[Any]) -> str:
    """Shared job-text resolver for any endpoint that takes a job_source/job_url/
    job_text/job_json shape (mirrors _resolve_generate_job_text, generalized so
    the new extraction endpoint doesn't need a GenerateResumeRequest specifically)."""
    if job_source == "url":
        if not (job_url or "").strip():
            raise HTTPException(status_code=400, detail="Provide a job link")
        return _fetch_url_text(job_url)
    if job_source == "json":
        if job_json is None:
            raise HTTPException(status_code=400, detail="Provide job JSON")
        text = _stringify(job_json).strip()
        if not text:
            raise HTTPException(status_code=400, detail="The job JSON had no readable content")
        return text[:_MAX_JOB_TEXT_CHARS]
    text = (job_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Paste the job description or some context")
    return text[:_MAX_JOB_TEXT_CHARS]


@router.post("/jobs/extract")
async def extract_job(payload: JobExtractRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Preview-only: resolve a job source to text, then extract a structured Job
    Profile via the LLM. Does NOT save anything — the caller reviews/edits the
    result and then calls POST /career/jobs (jobs_db.create_job, already extended
    to accept a `structured` dict) to persist it."""
    uid = str(user_id)
    job_text = _resolve_job_source_text(payload.job_source, payload.job_url, payload.job_text, payload.job_json)
    prompt = build_job_extraction_prompt(job_text)
    try:
        with track_ai_run(uid, "job_extract", payload.model):
            extracted = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"raw_text": job_text, "extraction": extracted}


class ProfileFromJobRequest(AISettings):
    job_source: str = "text"          # 'url' | 'text'
    job_url: Optional[str] = None
    job_text: Optional[str] = None
    title: Optional[str] = None


@router.post("/profiles/from-job")
async def create_profile_from_job(payload: ProfileFromJobRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Create a STARTER profile shaped for a job posting: extracts a structured Job
    Profile, then seeds Skills with the JD's required/preferred skills as a starting
    checklist, plus empty Personal Info/Summary/Experience/Education sections for the
    user to fill in with their REAL background. Never fabricates work history —
    this is a skeleton, not a generated candidate."""
    uid = str(user_id)
    job_text = _resolve_job_source_text(payload.job_source, payload.job_url, payload.job_text, None)
    prompt = build_job_extraction_prompt(job_text)
    try:
        with track_ai_run(uid, "profile_from_job", payload.model):
            extraction = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    skills_groups = []
    required = extraction.get("required_skills")
    if isinstance(required, list) and required:
        skills_groups.append({"name": "Required by this role", "items": [str(x) for x in required]})
    preferred = extraction.get("preferred_skills")
    if isinstance(preferred, list) and preferred:
        skills_groups.append({"name": "Preferred", "items": [str(x) for x in preferred]})

    role_title = extraction.get("title") or "New Role"
    placeholder_summary = (
        f"[Fill in a summary targeting the {role_title} role — see the Skills section "
        "below for a starting checklist pulled from this job posting.]"
    )
    sections = [
        {"section_type": "personal_info", "title": "Personal Info", "content": db.default_content("personal_info")},
        {"section_type": "summary", "title": "Summary", "content": {"text": placeholder_summary}},
        {"section_type": "skills", "title": "Skills", "content": {"groups": skills_groups}},
        {"section_type": "experience", "title": "Experience", "content": db.default_content("experience")},
        {"section_type": "education", "title": "Education", "content": db.default_content("education")},
    ]
    title = payload.title or f"{role_title} — Starter Profile"
    return db.create_profile_from_sections(uid, sections, title, origin="job_skeleton", confidence_score=None)


class GenerateResumeRequest(AISettings):
    profile_id: str
    job_source: str = "text"                 # 'url' | 'text' | 'json'
    job_url: Optional[str] = None            # job_source == 'url'
    job_text: Optional[str] = None           # 'text' — a pasted description OR freeform context
    job_json: Optional[Any] = None           # 'json' — a structured job object
    notes: Optional[str] = None              # extra candidate instructions for the rewrite
    target_role: Optional[str] = None        # actively steers tailoring wording toward this role
    target_company: Optional[str] = None     # actively steers tailoring wording toward this company
    template: Optional[str] = None           # resume template key (default 'classic')
    title: Optional[str] = None              # resume view title override
    save_job: bool = False                   # also persist the resolved JD to /career/jobs
    job_title: Optional[str] = None
    company: Optional[str] = None


def _resolve_generate_job_text(payload: "GenerateResumeRequest") -> str:
    src = payload.job_source
    if src == "url":
        if not (payload.job_url or "").strip():
            raise HTTPException(status_code=400, detail="Provide a job link")
        return _fetch_url_text(payload.job_url)
    if src == "json":
        if payload.job_json is None:
            raise HTTPException(status_code=400, detail="Provide job JSON")
        text = _stringify(payload.job_json).strip()
        if not text:
            raise HTTPException(status_code=400, detail="The job JSON had no readable content")
        return text[:_MAX_JOB_TEXT_CHARS]
    text = (payload.job_text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Paste the job description or some context")
    return text[:_MAX_JOB_TEXT_CHARS]


def _normalize_gap_analysis(raw: Optional[dict]) -> Optional[dict]:
    """Defensively fill in every gap_analysis key with a safe default. The LLM's JSON
    is never schema-validated (only parsed), so a model that drops a key despite the
    prompt's "EXACTLY these keys" instruction must not crash the frontend, which reads
    fields like `.missing_skills.length` with no optional chaining."""
    if not isinstance(raw, dict):
        return None
    return {
        "fit_score": raw.get("fit_score") if isinstance(raw.get("fit_score"), (int, float)) else 0,
        "matched_skills": raw.get("matched_skills") if isinstance(raw.get("matched_skills"), list) else [],
        "missing_skills": raw.get("missing_skills") if isinstance(raw.get("missing_skills"), list) else [],
        "missing_certifications": raw.get("missing_certifications") if isinstance(raw.get("missing_certifications"), list) else [],
        "ats_keywords_missing": raw.get("ats_keywords_missing") if isinstance(raw.get("ats_keywords_missing"), list) else [],
        "experience_gap": raw.get("experience_gap") if isinstance(raw.get("experience_gap"), str) else "",
        "recommendations": raw.get("recommendations") if isinstance(raw.get("recommendations"), list) else [],
    }


@router.post("/generate/resume")
async def generate_resume(payload: GenerateResumeRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Generate a job-tailored resume from a source profile + a job target."""
    uid = str(user_id)
    profile = db.get_profile(uid, payload.profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.get("sections"):
        raise HTTPException(status_code=400, detail="This profile has no content yet — add or import your details first.")

    job_text = _resolve_generate_job_text(payload)

    prompt = build_generate_with_gap_prompt(
        profile["sections"], job_text, payload.notes,
        target_role=payload.target_role, target_company=payload.target_company,
    )
    try:
        with track_ai_run(uid, "generate_resume", payload.model):
            result = generate_json(prompt, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    overrides = {u["section_id"]: u for u in (result.get("updates") or []) if u.get("section_id")}
    new_sections = []
    for s in profile["sections"]:
        u = overrides.get(s["id"])
        new_sections.append({
            "section_type": s.get("section_type", "custom"),
            "title": (u.get("title") if (u and u.get("title") is not None) else s.get("title")),
            "content": (u.get("content") if (u and u.get("content") is not None) else s.get("content", {})),
            "sort_order": s.get("sort_order", 0),
            "is_hidden": s.get("is_hidden", False),
        })

    _EXISTING_TYPES_FOR_JOB = {s.get("section_type") for s in profile["sections"]}
    _VALID_NEW_TYPES = {
        "certifications", "awards", "achievements", "research", "languages",
        "volunteer", "publications", "interests", "custom",
    }
    new_section_titles: list[str] = []
    for proposal in (result.get("new_sections") or []):
        if not isinstance(proposal, dict):
            continue
        st = proposal.get("section_type")
        if st not in _VALID_NEW_TYPES or st in _EXISTING_TYPES_FOR_JOB:
            continue  # skip anything not a recognized new-section type, or already present
        content = proposal.get("content")
        if not isinstance(content, dict):
            continue
        title = proposal.get("title") or st.replace("_", " ").title()
        new_sections.append({
            "section_type": st,
            "title": title,
            "content": content,
            "sort_order": len(new_sections),
            "is_hidden": False,
        })
        new_section_titles.append(title)
        _EXISTING_TYPES_FOR_JOB.add(st)  # a single proposal batch shouldn't add the same type twice

    label = (payload.job_title or payload.company or "tailored").strip() or "tailored"
    new_profile = db.create_profile_from_sections(
        uid, new_sections, f"{profile['title']} — {label}", origin="generate", confidence_score=85,
    )
    view_title = payload.title or f"{label} Resume"
    view = views_db.create_view(uid, new_profile["id"], "resume", view_title, payload.template)

    job = None
    if payload.save_job:
        job = jobs_db.create_job(
            uid, job_text, payload.job_title, payload.company,
            payload.job_url if payload.job_source == "url" else None,
        )

    return {
        "view": view,
        "profile_id": new_profile["id"],
        "summary": result.get("summary"),
        "keywords_added": result.get("keywords_added", []),
        "sections_tailored": len(overrides),
        "new_sections_added": new_section_titles,
        "gap_analysis": _normalize_gap_analysis(result.get("gap_analysis")),
        "job": job,
    }
