"""Labs Projects: named projects the labs generate against, and the sections saved to them.

A project holds its own `context` (background, objectives, constraints...) and a list of saved
sections: responses the user explicitly chose to keep ("Save to Project") from any lab, each with the
lab it came from. The labs read the selected project through `knowledge.py` when they generate.

Deleting a project deletes its sections too (the UI asks first; archiving is the non-destructive way to
put a project away). Every route is scoped to the signed-in user: someone else's project or section is
a 404, never a 403, so ids can't be probed.

`frontend/fe-apis/labProjects/` is the Next.js twin of this module (nextjs-api mode); validation, limits
and error texts match, so change both together.
"""

from __future__ import annotations

import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from modules.auth.dependencies import get_current_user_id

from .store import (
    create_project,
    create_section,
    delete_project,
    delete_section,
    get_project,
    get_section,
    list_projects,
    list_sections,
    update_project,
    update_section,
)

router = APIRouter(prefix="/lab-projects", tags=["lab-projects"], dependencies=[Depends(get_current_user_id)])

NAME_MAX = 120
DESCRIPTION_MAX = 1000
CONTEXT_MAX = 12000
TITLE_MAX = 200
CONTENT_MAX = 60000
_LAB_ID = re.compile(r"^[a-z0-9_-]{1,50}$")


def _clean_name(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be empty")
    return value


class ProjectIn(BaseModel):
    name: str = Field(max_length=NAME_MAX)
    description: str = Field(default="", max_length=DESCRIPTION_MAX)
    context: str = Field(default="", max_length=CONTEXT_MAX)

    _name = field_validator("name")(_clean_name)


class ProjectPatch(BaseModel):
    """Any subset of the fields; a field that isn't sent is left alone."""

    name: Optional[str] = Field(default=None, max_length=NAME_MAX)
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX)
    context: Optional[str] = Field(default=None, max_length=CONTEXT_MAX)
    status: Optional[Literal["active", "archived"]] = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else _clean_name(value)


class SectionIn(BaseModel):
    title: str = Field(max_length=TITLE_MAX)
    content: str = Field(max_length=CONTENT_MAX)
    source_lab_id: str = Field(pattern=_LAB_ID.pattern)
    source_lab_name: str = Field(max_length=100)
    source_generation_id: Optional[str] = Field(default=None, max_length=300)

    _title = field_validator("title")(_clean_name)
    _lab_name = field_validator("source_lab_name")(_clean_name)

    @field_validator("content")
    @classmethod
    def _content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be empty")
        return value


class SectionPatch(BaseModel):
    title: Optional[str] = Field(default=None, max_length=TITLE_MAX)
    content: Optional[str] = Field(default=None, max_length=CONTENT_MAX)

    @field_validator("title")
    @classmethod
    def _title(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else _clean_name(value)

    @field_validator("content")
    @classmethod
    def _content(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("must not be empty")
        return value


def _changes(model: BaseModel) -> dict:
    """The fields the client actually sent (a sent null is treated as not sent)."""
    return {k: v for k, v in model.model_dump(exclude_unset=True).items() if v is not None}


def _project_or_404(user_id: int, project_id: int) -> dict:
    project = get_project(user_id, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


# ── Projects ──────────────────────────────────────────────────────────────────


@router.get("")
async def get_projects(
    status: Literal["active", "archived", "all"] = "all", user_id: int = Depends(get_current_user_id)
) -> dict:
    return {"projects": list_projects(user_id, status)}


@router.post("", status_code=201)
async def post_project(payload: ProjectIn, user_id: int = Depends(get_current_user_id)) -> dict:
    return create_project(user_id, payload.name, payload.description.strip(), payload.context.strip())


@router.get("/{project_id}")
async def get_one_project(project_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    return _project_or_404(user_id, project_id)


@router.patch("/{project_id}")
async def patch_project(project_id: int, payload: ProjectPatch, user_id: int = Depends(get_current_user_id)) -> dict:
    changes = {k: (v.strip() if isinstance(v, str) else v) for k, v in _changes(payload).items()}
    if not changes:
        return _project_or_404(user_id, project_id)
    project = update_project(user_id, project_id, changes)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


@router.delete("/{project_id}")
async def remove_project(project_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    """Deletes the project AND every section saved to it (there is no undo; archive instead to keep them)."""
    deleted = delete_project(user_id, project_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return {"ok": True, "deletedSections": deleted}


# ── Sections ──────────────────────────────────────────────────────────────────


@router.get("/{project_id}/sections")
async def get_sections(
    project_id: int,
    q: str = Query(default="", max_length=200),
    lab: str = Query(default="", max_length=50),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    _project_or_404(user_id, project_id)
    return {"sections": list_sections(user_id, project_id, q, lab)}


@router.post("/{project_id}/sections", status_code=201)
async def post_section(project_id: int, payload: SectionIn, user_id: int = Depends(get_current_user_id)) -> dict:
    project = _project_or_404(user_id, project_id)
    if project["status"] != "active":
        raise HTTPException(status_code=409, detail="This project is archived. Restore it to save sections to it.")
    return create_section(
        user_id,
        project_id,
        payload.title,
        payload.content,
        payload.source_lab_id,
        payload.source_lab_name.strip(),
        payload.source_generation_id,
    )


@router.get("/{project_id}/sections/{section_id}")
async def get_one_section(project_id: int, section_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    section = get_section(user_id, project_id, section_id)
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found.")
    return section


@router.patch("/{project_id}/sections/{section_id}")
async def patch_section(
    project_id: int, section_id: int, payload: SectionPatch, user_id: int = Depends(get_current_user_id)
) -> dict:
    changes = _changes(payload)
    section = update_section(user_id, project_id, section_id, changes) if changes else get_section(user_id, project_id, section_id)
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found.")
    return section


@router.delete("/{project_id}/sections/{section_id}")
async def remove_section(project_id: int, section_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not delete_section(user_id, project_id, section_id):
        raise HTTPException(status_code=404, detail="Section not found.")
    return {"ok": True}
