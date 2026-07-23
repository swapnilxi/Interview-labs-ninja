"""Daily session module — manages practice sessions, question persistence, and progress tracking."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import date
from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from modules.common.db import (
    Category,
    create_session,
    fetch_questions,
    insert_questions,
    update_question_performance,
    save_session_progress,
    fetch_session_progress,
    fetch_progress_stats,
    fetch_settings,
    save_settings,
)
from modules.common.export_md import render_markdown_for_day


router = APIRouter(tags=["daily-session"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    difficulty_hint: Optional[str] = Field(
        default=None,
        description="Optional difficulty hint: easy, medium, hard, mixed.",
    )
    cv_present: bool = Field(
        default=False,
        description="True if CV text or file was provided for this session.",
    )
    jd_present: bool = Field(
        default=False,
        description="True if a job description was provided for this session.",
    )


class SessionCreateResponse(BaseModel):
    session_id: int
    session_date: str


class QuestionIn(BaseModel):
    section: Literal["A", "B"]
    number: int
    category: Category
    sub_type: str
    difficulty: str
    topics: List[str] = Field(default_factory=list)
    question_text: str
    question_type: Optional[str] = None


class QuestionOut(BaseModel):
    id: int
    session_id: int
    question_date: str
    section: str
    number: int
    category: Category
    sub_type: str
    difficulty: str
    topics: List[str]
    question_text: str
    user_performance: Optional[int] = None
    last_reviewed: Optional[str] = None
    question_type: Optional[str] = None


class QuestionBatchCreate(BaseModel):
    session_id: int
    questions: List[QuestionIn]


class PerformanceUpdatePayload(BaseModel):
    user_performance: int


class SessionAnswerIn(BaseModel):
    questionId: Optional[str] = None
    questionText: str
    answerText: str
    category: str
    difficulty: str
    questionType: str
    isCompleted: bool
    sessionDate: str


class UserSettingsSchema(BaseModel):
    textGenerationModel: str
    answerModel: str
    openaiKey: str = ''
    geminiKey: str = ''
    anthropicKey: str = ''
    deepseekKey: str = ''
    groqKey: str = ''
    ollamaUrl: str = 'http://localhost:11434'
    ollamaModel: str = 'llama3.2'


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionCreateResponse)
async def create_session_endpoint(payload: SessionCreate) -> SessionCreateResponse:
    session_date = date.today().isoformat()
    session_id = create_session(
        session_date=session_date,
        difficulty_hint=payload.difficulty_hint,
        cv_present=payload.cv_present,
        jd_present=payload.jd_present,
    )
    return SessionCreateResponse(session_id=session_id, session_date=session_date)


@router.post("/sessions/questions")
async def persist_questions(payload: QuestionBatchCreate) -> dict:
    if not payload.questions:
        raise HTTPException(status_code=400, detail="questions list must not be empty")

    ids = insert_questions(
        session_id=payload.session_id,
        questions=[q.model_dump() for q in payload.questions],
    )
    return {"inserted_ids": ids}


@router.get("/questions", response_model=List[QuestionOut])
async def list_questions(
    category: Optional[Category] = Query(default=None),
    session_date: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
) -> List[QuestionOut]:
    records = list(fetch_questions(category=category, session_date=session_date, topic=topic))

    out: List[QuestionOut] = []
    for r in records:
        topics = [t for t in (r.topics or "").split(",") if t]
        out.append(
            QuestionOut(
                id=r.id or 0,
                session_id=r.session_id,
                question_date=r.question_date,
                section=r.section,
                number=r.number,
                category=r.category,  # type: ignore[arg-type]
                sub_type=r.sub_type,
                difficulty=r.difficulty,
                topics=topics,
                question_text=r.question_text,
                user_performance=r.user_performance,
                last_reviewed=r.last_reviewed,
                question_type=r.question_type or r.sub_type,
            )
        )
    return out


@router.patch("/questions/{question_id}/performance")
async def update_performance_endpoint(
    question_id: int, payload: PerformanceUpdatePayload
) -> dict:
    update_question_performance(
        question_id=question_id,
        user_performance=payload.user_performance,
        last_reviewed=date.today().isoformat(),
    )
    return {"status": "success"}


@router.post("/session-progress")
async def save_session_progress_endpoint(payload: List[SessionAnswerIn]) -> dict:
    save_session_progress([item.model_dump() for item in payload])
    return {"status": "success"}


@router.get("/session-progress")
async def get_session_progress_endpoint(session_date: str = Query(...)) -> List[dict]:
    return fetch_session_progress(session_date)


@router.get("/session-progress/stats")
async def get_progress_stats_endpoint() -> dict:
    return fetch_progress_stats()


@router.get("/settings", response_model=UserSettingsSchema)
async def get_settings_endpoint() -> UserSettingsSchema:
    return UserSettingsSchema(**fetch_settings())


@router.post("/settings")
async def save_settings_endpoint(payload: UserSettingsSchema) -> dict:
    save_settings(payload.model_dump())
    return {"status": "success"}


@router.get("/settings/ollama-models")
async def list_ollama_models(url: str = Query(default="http://localhost:11434")) -> dict:
    req = urllib.request.Request(f"{url.rstrip('/')}/api/tags", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not reach Ollama at {url}: {exc}")
    return {"models": [m["name"] for m in data.get("models", [])]}


# ── Lab question generation ────────────────────────────────────────────────────

class GenerateQuestionsPayload(BaseModel):
    topic: str
    subtopic: Optional[str] = None
    lab: str = "general"
    context: Optional[str] = None
    count: int = 5


class GeneratedQuestionItem(BaseModel):
    text: str
    difficulty: str = "Medium"
    sub_type: str = "conceptual"


def _extract_json_array(text: str) -> List[dict]:
    """Extract the first JSON array from an LLM response string."""
    text = text.strip()
    # Strip markdown code fences
    text = re.sub(r"```[a-z]*\n?", "", text).strip("`").strip()
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in response")
    return json.loads(text[start : end + 1])


def _call_gemini(prompt: str, api_key: str, model: str = "gemini-2.0-flash") -> List[dict]:
    safe_model = model.replace("gemini-2.5-flash", "gemini-2.0-flash").replace("gemini-2.5-pro", "gemini-1.5-pro")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{safe_model}:generateContent?key={api_key}"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return _extract_json_array(text)


def _call_openai_compatible(prompt: str, api_key: str, base_url: str, model: str) -> List[dict]:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 2048,
    }).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    text = data["choices"][0]["message"]["content"]
    return _extract_json_array(text)


def _call_ollama(prompt: str, base_url: str, model: str) -> List[dict]:
    body = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return _extract_json_array(data.get("response", ""))


def _build_prompt(payload: GenerateQuestionsPayload) -> str:
    subject = payload.subtopic or payload.topic
    lab_map = {"cv": "Computer Vision", "dsa": "Data Structures & Algorithms", "system-design": "System Design"}
    domain = lab_map.get(payload.lab, payload.lab)
    ctx = f"\n\nAdditional context:\n{payload.context}" if payload.context else ""
    return f"""You are a senior technical interviewer specializing in {domain}.

Generate exactly {payload.count} interview questions about "{subject}" (topic: {payload.topic}).{ctx}

Requirements:
- Vary difficulty: mix Easy, Medium, Hard
- Mix question types: conceptual, implementation, system design, debugging, practical
- Each question should be specific, challenging, and interview-ready
- Do NOT number questions or add explanations

Respond with ONLY a valid JSON array (no markdown, no text outside the array):
[
  {{"text": "...", "difficulty": "Easy|Medium|Hard", "sub_type": "conceptual|implementation|system design|debugging|practical"}},
  {{"text": "...", "difficulty": "Medium", "sub_type": "implementation"}}
]"""


@router.post("/lab/generate-questions")
async def generate_lab_questions(payload: GenerateQuestionsPayload) -> dict:
    settings = fetch_settings()
    model = settings.get("textGenerationModel", "gemini-2.5-flash")
    prompt = _build_prompt(payload)

    provider_order: List[str] = []
    if model.startswith("gemini"):
        provider_order = ["gemini", "deepseek", "groq", "openai", "ollama"]
    elif model.startswith("deepseek"):
        provider_order = ["deepseek", "gemini", "groq", "openai", "ollama"]
    elif model in ("llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768"):
        provider_order = ["groq", "gemini", "deepseek", "openai", "ollama"]
    elif model.startswith("gpt"):
        provider_order = ["openai", "gemini", "groq", "deepseek", "ollama"]
    elif model.startswith("claude"):
        provider_order = ["anthropic", "gemini", "groq", "deepseek", "openai", "ollama"]
    elif model == "ollama":
        provider_order = ["ollama"]
    else:
        provider_order = ["gemini", "deepseek", "groq", "openai", "ollama"]

    last_error: Optional[str] = None
    for provider in provider_order:
        try:
            if provider == "gemini" and settings.get("geminiKey"):
                qs = _call_gemini(prompt, settings["geminiKey"], model)
                return {"questions": qs[:payload.count]}
            elif provider == "deepseek" and settings.get("deepseekKey"):
                qs = _call_openai_compatible(prompt, settings["deepseekKey"], "https://api.deepseek.com", model if model.startswith("deepseek") else "deepseek-chat")
                return {"questions": qs[:payload.count]}
            elif provider == "groq" and settings.get("groqKey"):
                groq_model = model if model in ("llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "mixtral-8x7b-32768") else "llama-3.3-70b-versatile"
                qs = _call_openai_compatible(prompt, settings["groqKey"], "https://api.groq.com/openai/v1", groq_model)
                return {"questions": qs[:payload.count]}
            elif provider == "openai" and settings.get("openaiKey"):
                qs = _call_openai_compatible(prompt, settings["openaiKey"], "https://api.openai.com/v1", model if model.startswith("gpt") else "gpt-4o-mini")
                return {"questions": qs[:payload.count]}
            elif provider == "ollama":
                qs = _call_ollama(prompt, settings.get("ollamaUrl", "http://localhost:11434"), settings.get("ollamaModel", "llama3.2"))
                return {"questions": qs[:payload.count]}
        except Exception as exc:
            last_error = str(exc)
            continue

    raise HTTPException(
        status_code=400,
        detail=f"No API key configured or all providers failed. Add a key in Config. Last error: {last_error}",
    )


@router.get("/export", response_model=str)
async def export_markdown(
    session_date: Optional[str] = Query(default=None),
) -> str:
    if session_date is None:
        session_date = date.today().isoformat()

    records = list(fetch_questions(session_date=session_date))
    if not records:
        raise HTTPException(status_code=404, detail="No questions found for this date")

    return render_markdown_for_day(records, session_date=session_date)
