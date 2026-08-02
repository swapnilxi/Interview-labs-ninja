"""Auth endpoints: signup, login, logout, current-user profile."""

from __future__ import annotations

import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from modules.auth.db import create_user, get_profile, get_user_by_email, upsert_profile
from modules.auth.dependencies import get_current_user
from modules.auth.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ProfileUpdateRequest(BaseModel):
    text_generation_model: str | None = None
    answer_model: str | None = None
    ai_provider: str | None = None
    ollama_url: str | None = None
    ollama_model: str | None = None


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "created_at": user["created_at"],
    }


def _auth_response(user: dict) -> dict:
    token = create_access_token(user_id=user["id"], email=user["email"])
    return {"access_token": token, "token_type": "bearer", "user": _public_user(user)}


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest) -> dict:
    email = payload.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Invalid email address")
    try:
        user = create_user(email=email, password_hash=hash_password(payload.password), display_name=payload.display_name)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    return _auth_response(user)


@router.post("/login")
async def login(payload: LoginRequest) -> dict:
    email = payload.email.strip().lower()
    user = get_user_by_email(email)
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return _auth_response(user)


@router.post("/logout")
async def logout() -> dict:
    # JWTs are stateless — there's nothing to invalidate server-side. The client
    # simply discards its token. Kept as a real endpoint for a symmetric API.
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    return _public_user(user)


@router.get("/profile")
async def read_profile(user: dict = Depends(get_current_user)) -> dict:
    return get_profile(user["id"]) or {"user_id": user["id"]}


@router.put("/profile")
async def update_profile(payload: ProfileUpdateRequest, user: dict = Depends(get_current_user)) -> dict:
    return upsert_profile(user["id"], **payload.model_dump())
