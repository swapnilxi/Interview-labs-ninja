"""Career Studio portfolio API — mirrors router.py (resume) for portfolios + widgets.

Same /career prefix + JWT guard; user-scoped throughout.
"""

from __future__ import annotations

import re
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id

from . import db as pdb
from . import versions as pver
from . import render, testimonials_db
from ..publishing import db as publish_db
from ..resume import render as resume_render

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])

# Public, UNAUTHENTICATED router for shared portfolios (frozen snapshots only).
# Mirrors the daily_session public_router pattern; registered separately in main.py.
public_router = APIRouter(prefix="/career/public", tags=["career-studio-public"])


class PortfolioCreate(BaseModel):
    title: str = "Untitled Portfolio"


class PortfolioUpdate(BaseModel):
    title: Optional[str] = None
    theme: Optional[Any] = None


class WidgetCreate(BaseModel):
    widget_type: str
    title: Optional[str] = None
    content: Optional[Any] = None


class WidgetUpdate(BaseModel):
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


class PortfolioPublishRequest(BaseModel):
    custom_slug: Optional[str] = None


class TestimonialSubmit(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    quote: str = Field(..., min_length=1, max_length=1000)


# ── Portfolio CRUD ──────────────────────────────────────────────────────────────

@router.get("/portfolios")
async def list_portfolios(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return pdb.list_portfolios(str(user_id))


@router.post("/portfolios")
async def create_portfolio(payload: PortfolioCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    return pdb.create_portfolio(str(user_id), payload.title)


@router.get("/portfolios/{master_id}")
async def get_portfolio(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    p = pdb.get_portfolio_tree(str(user_id), master_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return p


@router.patch("/portfolios/{master_id}")
async def update_portfolio(master_id: str, payload: PortfolioUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    p = pdb.update_portfolio(str(user_id), master_id, payload.model_dump(exclude_unset=True))
    if p is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return p


@router.delete("/portfolios/{master_id}")
async def delete_portfolio(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not pdb.soft_delete_portfolio(str(user_id), master_id):
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return {"status": "success"}


# ── Publishing / sharing ────────────────────────────────────────────────────────

def _safe_filename(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", (title or "portfolio").strip()).strip("-").lower()
    return slug or "portfolio"


def _strip_html(text: str) -> str:
    """Visitor-submitted text is never trusted — strip any markup before storing."""
    return re.sub(r"(?s)<[^>]+>", "", text).strip()


@router.get("/portfolios/{master_id}/publish")
async def publish_status(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if pdb.get_portfolio_master(str(user_id), master_id) is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return publish_db.get_by_master(str(user_id), master_id) or {}


@router.post("/portfolios/{master_id}/publish")
async def publish_portfolio(master_id: str, payload: PortfolioPublishRequest = PortfolioPublishRequest(), user_id: int = Depends(get_current_user_id)) -> dict:
    """Freeze the current draft (visible widgets) into a public snapshot."""
    uid = str(user_id)
    p = pdb.get_portfolio_tree(uid, master_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    visible = [w for w in p["widgets"] if not w.get("is_hidden")]
    try:
        return publish_db.publish(uid, master_id, p.get("title") or "Portfolio", visible, p.get("theme") or {}, kind="portfolio", custom_slug=payload.custom_slug)
    except publish_db.SlugTakenError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/portfolios/{master_id}/publish")
async def unpublish_portfolio(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not publish_db.unpublish(str(user_id), master_id):
        raise HTTPException(status_code=404, detail="Not published")
    return {"status": "unpublished"}


@router.get("/portfolios/{master_id}/export")
async def export_portfolio(
    master_id: str,
    format: str = Query("html", pattern="^(html|pdf)$"),
    user_id: int = Depends(get_current_user_id),
):
    uid = str(user_id)
    p = pdb.get_portfolio_tree(uid, master_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    html_str = render.render_portfolio_html(p)
    fname = _safe_filename(p.get("title", "portfolio"))
    if format == "pdf":
        try:
            pdf = render.html_to_pdf(html_str)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'})
    return Response(html_str, media_type="text/html; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}.html"'})


# ── Public reader (NO AUTH — frozen snapshots only) ─────────────────────────────

@public_router.get("/portfolios/{slug}")
async def public_portfolio(slug: str, request: Request) -> dict:
    snap = publish_db.get_public(slug, referrer=request.headers.get("referer"))
    if snap is None or snap.get("kind") != "portfolio":
        raise HTTPException(status_code=404, detail="This portfolio isn't published (or the link is wrong).")
    snap["approved_testimonials"] = testimonials_db.list_approved(snap["master_id"])
    return snap


@public_router.post("/portfolios/{slug}/testimonials")
async def submit_testimonial(slug: str, payload: TestimonialSubmit) -> dict:
    """Unauthenticated: a visitor leaves a recommendation, held for owner
    approval. First unauthenticated POST route in this module — kept to a
    narrow shape (name + quote only) with a cheap per-slug rate limit."""
    snap = publish_db.get_by_slug(slug)
    if snap is None or snap.get("kind") != "portfolio":
        raise HTTPException(status_code=404, detail="This portfolio isn't published (or the link is wrong).")
    if testimonials_db.count_recent_pending(slug) >= 3:
        raise HTTPException(status_code=429, detail="Too many submissions for this portfolio right now — try again later.")
    name = _strip_html(payload.name)
    quote = _strip_html(payload.quote)
    if not name or not quote:
        raise HTTPException(status_code=400, detail="Name and recommendation can't be empty.")
    testimonial = testimonials_db.submit(slug, snap["master_id"], snap["user_id"], name, quote)
    return {"status": "submitted", "id": testimonial["id"]}


@public_router.get("/resumes/{slug}")
async def public_resume(slug: str, request: Request) -> dict:
    """Unauthenticated read of a published resume snapshot. Renders the frozen
    sections/template into the same standalone HTML the authenticated export
    produces, so the frontend just drops it into an iframe."""
    snap = publish_db.get_public(slug, referrer=request.headers.get("referer"))
    if snap is None or snap.get("kind") != "resume":
        raise HTTPException(status_code=404, detail="This resume isn't published (or the link is wrong).")
    resume = {"title": snap["title"], "sections": snap.get("sections", [])}
    html_str = resume_render.render_resume_html(resume, snap.get("template"), spec=snap.get("spec"))
    return {"slug": snap["slug"], "title": snap["title"], "html": html_str, "view_count": snap["view_count"]}


@public_router.get("/portfolios/{slug}/v/{version_number}")
async def public_portfolio_version(slug: str, version_number: int) -> dict:
    """A specific past snapshot, not the current published content — stays
    reachable even after the owner re-publishes with new content."""
    snap = publish_db.get_snapshot(slug, version_number)
    if snap is None or snap.get("kind") != "portfolio":
        raise HTTPException(status_code=404, detail="That portfolio version isn't available (or the link is wrong).")
    return snap


@public_router.get("/resumes/{slug}/v/{version_number}")
async def public_resume_version(slug: str, version_number: int) -> dict:
    snap = publish_db.get_snapshot(slug, version_number)
    if snap is None or snap.get("kind") != "resume":
        raise HTTPException(status_code=404, detail="That resume version isn't available (or the link is wrong).")
    resume = {"title": snap["title"], "sections": snap.get("sections", [])}
    html_str = resume_render.render_resume_html(resume, snap.get("template"), spec=snap.get("spec"))
    return {"slug": snap["slug"], "title": snap["title"], "html": html_str, "version_number": snap["version_number"]}


@public_router.get("/portfolios/{slug}/download")
async def public_portfolio_download(slug: str, format: str = Query("pdf", pattern="^(pdf|html)$")) -> Response:
    """Public, unauthenticated export of the CURRENT published snapshot — the
    first place a visitor can download anything from this module. Reads via
    get_by_slug (not get_public) so a download doesn't also count as a view."""
    snap = publish_db.get_by_slug(slug)
    if snap is None or snap.get("kind") != "portfolio":
        raise HTTPException(status_code=404, detail="This portfolio isn't published (or the link is wrong).")
    html_str = render.render_portfolio_html({"title": snap["title"], "theme": snap.get("theme") or {}, "widgets": snap.get("widgets", [])})
    fname = _safe_filename(snap.get("title") or "portfolio")
    publish_db.record_download(slug, snap["master_id"], snap["user_id"], format)
    if format == "pdf":
        try:
            pdf = render.html_to_pdf(html_str)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'})
    return Response(html_str, media_type="text/html; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}.html"'})


@public_router.get("/resumes/{slug}/download")
async def public_resume_download(slug: str, format: str = Query("pdf", pattern="^(pdf|html)$")) -> Response:
    snap = publish_db.get_by_slug(slug)
    if snap is None or snap.get("kind") != "resume":
        raise HTTPException(status_code=404, detail="This resume isn't published (or the link is wrong).")
    resume = {"title": snap["title"], "sections": snap.get("sections", [])}
    html_str = resume_render.render_resume_html(resume, snap.get("template"), spec=snap.get("spec"))
    fname = _safe_filename(snap.get("title") or "resume")
    publish_db.record_download(slug, snap["master_id"], snap["user_id"], format)
    if format == "pdf":
        try:
            pdf = render.html_to_pdf(html_str)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")
        return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'})
    return Response(html_str, media_type="text/html; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{fname}.html"'})


# ── Widgets ─────────────────────────────────────────────────────────────────────

@router.post("/portfolios/{master_id}/widgets")
async def add_widget(master_id: str, payload: WidgetCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    w = pdb.add_widget(str(user_id), master_id, payload.widget_type, payload.title, payload.content)
    if w is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return w


@router.patch("/portfolios/{master_id}/widgets/{widget_id}")
async def update_widget(master_id: str, widget_id: str, payload: WidgetUpdate, user_id: int = Depends(get_current_user_id)) -> dict:
    w = pdb.update_widget(str(user_id), master_id, widget_id, payload.model_dump(exclude_unset=True))
    if w is None:
        raise HTTPException(status_code=404, detail="Widget not found")
    return w


@router.delete("/portfolios/{master_id}/widgets/{widget_id}")
async def delete_widget(master_id: str, widget_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not pdb.delete_widget(str(user_id), master_id, widget_id):
        raise HTTPException(status_code=404, detail="Widget not found")
    return {"status": "success"}


@router.post("/portfolios/{master_id}/widgets/reorder")
async def reorder_widgets(master_id: str, payload: ReorderRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    p = pdb.reorder_widgets(str(user_id), master_id, payload.ordered_ids)
    if p is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return p


# ── Testimonials moderation (owner side; "master_id" here is whatever id
#    publish_db stored it under — a career_views id or a portfolio_master id,
#    both share the same portfolio_published/testimonial_submissions rows) ──────

@router.get("/portfolios/{master_id}/testimonials")
async def list_testimonials(master_id: str, status: Optional[str] = Query(None, pattern="^(pending|approved|rejected)$"), user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return testimonials_db.list_for_master(str(user_id), master_id, status)


@router.post("/portfolios/{master_id}/testimonials/{testimonial_id}/approve")
async def approve_testimonial(master_id: str, testimonial_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    t = testimonials_db.set_status(str(user_id), testimonial_id, "approved")
    if t is None:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    return t


@router.post("/portfolios/{master_id}/testimonials/{testimonial_id}/reject")
async def reject_testimonial(master_id: str, testimonial_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    t = testimonials_db.set_status(str(user_id), testimonial_id, "rejected")
    if t is None:
        raise HTTPException(status_code=404, detail="Testimonial not found")
    return t


@router.delete("/portfolios/{master_id}/testimonials/{testimonial_id}")
async def delete_testimonial(master_id: str, testimonial_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if not testimonials_db.delete(str(user_id), testimonial_id):
        raise HTTPException(status_code=404, detail="Testimonial not found")
    return {"status": "deleted"}


# ── Versioning ────────────────────────────────────────────────────────────────

@router.get("/portfolios/{master_id}/versions")
async def list_versions(master_id: str, user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return pver.list_versions(str(user_id), master_id)


@router.post("/portfolios/{master_id}/versions")
async def snapshot_version(master_id: str, payload: SnapshotRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    v = pver.snapshot_version(str(user_id), master_id, payload.label)
    if v is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return v


@router.get("/portfolio-versions/{version_id}")
async def get_version(version_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    v = pver.get_version(str(user_id), version_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return v


@router.post("/portfolios/{master_id}/versions/{version_id}/restore")
async def restore_version(master_id: str, version_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    p = pver.restore_version(str(user_id), master_id, version_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return p


@router.post("/portfolio-versions/{version_id}/clone")
async def clone_version(version_id: str, payload: CloneRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    p = pver.clone_version(str(user_id), version_id, payload.title)
    if p is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return p
