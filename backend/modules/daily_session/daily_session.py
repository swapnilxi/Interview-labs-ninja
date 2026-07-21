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


import io
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import docx
except ImportError:
    docx = None

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

def format_session_code(dt: Optional[date] = None) -> str:
    if dt is None:
        dt = date.today()
    week_num = dt.isocalendar()[1]
    day_str = dt.strftime("%d")
    month_str = dt.strftime("%B")
    return f"W{week_num}/{day_str}/{month_str}"


class SessionCreateResponse(BaseModel):
    session_id: int
    session_date: str
    session_code: str


class AnswerGenerationRequest(BaseModel):
    question_text: str
    category: Optional[str] = "Interview"
    sub_type: Optional[str] = "General"
    action: Optional[str] = "answer"  # "answer" or "explain"


@router.post("/sessions", response_model=SessionCreateResponse)
async def create_session_endpoint(payload: SessionCreate) -> SessionCreateResponse:
    today_date = date.today()
    session_date = today_date.isoformat()
    session_id = create_session(
        session_date=session_date,
        difficulty_hint=payload.difficulty_hint,
        cv_present=payload.cv_present,
        jd_present=payload.jd_present,
    )
    session_code = format_session_code(today_date)
    return SessionCreateResponse(
        session_id=session_id,
        session_date=session_date,
        session_code=session_code,
    )


@router.post("/sessions/upload-resume")
async def upload_resume(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing")

    contents = await file.read()
    filename_lower = file.filename.lower()
    text = ""

    if filename_lower.endswith(".pdf"):
        if pdfplumber is None:
            raise HTTPException(status_code=500, detail="pdfplumber library not available")
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            pages_text = [page.extract_text() or "" for page in pdf.pages]
            text = "\n".join(pages_text)
    elif filename_lower.endswith(".docx"):
        if docx is None:
            raise HTTPException(status_code=500, detail="python-docx library not available")
        doc = docx.Document(io.BytesIO(contents))
        text = "\n".join([p.text for p in doc.paragraphs])
    else:
        # plain text or markdown
        try:
            text = contents.decode("utf-8")
        except UnicodeDecodeError:
            text = contents.decode("latin-1", errors="ignore")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Could not extract text from file")

    return {"filename": file.filename, "extracted_text": text, "length": len(text)}


@router.post("/sessions/generate-answer")
async def generate_dynamic_answer(payload: AnswerGenerationRequest) -> dict:
    settings = fetch_settings()
    model = settings.get("answerModel", "gemini-2.0-flash")

    if payload.action == "explain":
        prompt = f"""You are Interview-Ninja, an elite technical interviewer.
Provide a deep, step-by-step technical explanation for this question:

Question ({payload.category} - {payload.sub_type}):
{payload.question_text}

Format your response cleanly with:
1. High-level Summary (2-3 sentences)
2. In-Depth Technical Walkthrough / Code / Architecture
3. Key Trade-offs & Common Interviewer Follow-ups"""
    else:
        prompt = f"""You are Interview-Ninja, an elite technical interviewer.
Provide a concise, top-tier model answer for this interview question:

Question ({payload.category} - {payload.sub_type}):
{payload.question_text}

Provide:
1. Concise Direct Answer (3-4 bullet points or short paragraph)
2. Detailed Explanation / Code snippet / Algorithm steps if applicable."""

    # Call AI using settings
    last_err = None
    try:
        if settings.get("geminiKey"):
            safe_model = model.replace("gemini-2.5-flash", "gemini-2.0-flash").replace("gemini-2.5-pro", "gemini-1.5-pro")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{safe_model}:generateContent?key={settings['geminiKey']}"
            body = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.7, "maxOutputTokens": 2048},
            }).encode()
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            res_text = data["candidates"][0]["content"]["parts"][0]["text"]
            return {"answer": res_text, "model_used": safe_model}
    except Exception as e:
        last_err = str(e)

    # Fallback to local default / mock if API fails or no key
    return {
        "answer": f"Model Answer for '{payload.question_text}':\n\n1. Focus on core architectural patterns, time/space complexity, and edge cases.\n2. Key implementation details: ensure robust error handling and clear separation of concerns.",
        "note": f"Fallback applied. (Config note: {last_err or 'No API key set'})"
    }



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
    model = settings.get("questionModel", "gemini-2.5-flash")
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
