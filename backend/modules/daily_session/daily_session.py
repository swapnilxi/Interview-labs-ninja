"""Daily session module — manages practice sessions, question persistence, and progress tracking."""

from __future__ import annotations

import json
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
)
from modules.common.export_md import render_markdown_for_day
from modules.common.ai_client import AISettings, call_ai_text, extract_json_array


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


import io
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import docx
except ImportError:
    docx = None

from fastapi import File, UploadFile


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


class AnswerGenerationRequest(AISettings):
    question_text: str
    category: Optional[str] = None
    sub_type: Optional[str] = None
    question_type: Optional[str] = None
    action: str = "answer"


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


# ── Endpoints ─────────────────────────────────────────────────────────────────

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

    # Call AI using the caller-supplied provider settings
    try:
        res_text = call_ai_text(prompt, payload)
        return {"answer": res_text, "model_used": payload.model}
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

class GenerateQuestionsPayload(AISettings):
    topic: str
    subtopic: Optional[str] = None
    lab: str = "general"
    context: Optional[str] = None
    count: int = 5


class GeneratedQuestionItem(BaseModel):
    text: str
    difficulty: str = "Medium"
    sub_type: str = "conceptual"


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
    prompt = _build_prompt(payload)
    try:
        response_text = call_ai_text(prompt, payload)
        questions = extract_json_array(response_text)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured or all providers failed. Add a key in Config. Last error: {exc}",
        )
    return {"questions": questions[:payload.count]}


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
