"""Career Studio portfolio API — mirrors router.py (resume) for portfolios + widgets.

Same /career prefix + JWT guard; user-scoped throughout.
"""

from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id

from . import portfolio_db as pdb
from . import portfolio_versions as pver

router = APIRouter(prefix="/career", tags=["career-studio"], dependencies=[Depends(get_current_user_id)])


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
