"""Career Studio portfolio API — mirrors router.py (resume) for portfolios + widgets.

Same /career prefix + JWT guard; user-scoped throughout.
"""

from __future__ import annotations

import re
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id

from . import portfolio_db as pdb
from . import portfolio_versions as pver
from . import publish_db, render

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


@router.get("/portfolios/{master_id}/publish")
async def publish_status(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    if pdb.get_portfolio_master(str(user_id), master_id) is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return publish_db.get_by_master(str(user_id), master_id) or {}


@router.post("/portfolios/{master_id}/publish")
async def publish_portfolio(master_id: str, user_id: int = Depends(get_current_user_id)) -> dict:
    """Freeze the current draft (visible widgets) into a public snapshot."""
    uid = str(user_id)
    p = pdb.get_portfolio_tree(uid, master_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    visible = [w for w in p["widgets"] if not w.get("is_hidden")]
    return publish_db.publish(uid, master_id, p.get("title") or "Portfolio", visible, p.get("theme") or {}, kind="portfolio")


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
async def public_portfolio(slug: str) -> dict:
    snap = publish_db.get_public(slug)
    if snap is None or snap.get("kind") != "portfolio":
        raise HTTPException(status_code=404, detail="This portfolio isn't published (or the link is wrong).")
    return snap


@public_router.get("/resumes/{slug}")
async def public_resume(slug: str) -> dict:
    """Unauthenticated read of a published resume snapshot. Renders the frozen
    sections/template into the same standalone HTML the authenticated export
    produces, so the frontend just drops it into an iframe."""
    snap = publish_db.get_public(slug)
    if snap is None or snap.get("kind") != "resume":
        raise HTTPException(status_code=404, detail="This resume isn't published (or the link is wrong).")
    resume = {"title": snap["title"], "sections": snap.get("sections", [])}
    html_str = render.render_resume_html(resume, snap.get("template"), spec=snap.get("spec"))
    return {"slug": snap["slug"], "title": snap["title"], "html": html_str, "view_count": snap["view_count"]}


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
