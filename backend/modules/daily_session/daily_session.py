"""Daily session module — manages practice sessions, question persistence, and progress tracking."""

from __future__ import annotations

import io
import json
import random
import re
import sqlite3
import time
import urllib.request
from datetime import date
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id
from modules.common.db import (
    Category,
    create_session,
    fetch_questions,
    fetch_question_by_id,
    insert_questions,
    clear_duplicate_questions,
    import_quick_practice_questions,
    get_db_path,
    update_question_performance,
    save_session_progress,
    fetch_session_progress,
    fetch_progress_stats,
    fetch_recent_sessions,
)
from modules.daily_session.dedup import QuestionIndex
from modules.daily_session import question_store
from modules.daily_session.question_quiz import (
    MAX_QUIZ_ANSWER_CHARS,
    MAX_QUIZ_PER_QUESTION,
    MAX_WORKSPACE_FIELD_CHARS,
    QUIZ_MAX_TOKENS,
    build_question_quiz_prompt,
)
from modules.daily_session.question_study import (
    EXPAND_MAX_TOKENS,
    MAX_DEPTH,
    STUDY_KINDS,
    STUDY_LABELS,
    STUDY_MAX_TOKENS,
    as_index,
    build_expand_prompt,
    build_study_prompt,
    clean_layer,
    normalize_study,
    parse_study_reply,
)
from modules.daily_session.tutor_memory import (
    MAX_MISSED,
    MAX_MISSED_CHARS,
    MEMORY_MODULE,
    missed_quiz_facts,
    weak_spot_facts,
)
from modules.lab_sections.quiz import normalize_questions
from modules.memory import store as memory_store
from modules.common.export_md import render_markdown_for_day
from modules.common.ai import AISettings, call_ai_text, extract_json_array, extract_json_object
from modules.daily_session.evaluation import (
    EvaluateRequest,
    ExpandRequest,
    ConvertFlashcardsRequest,
    LearnChatRequest,
    convert_flashcards,
    learn_turn,
    evaluate_answer,
    expand_answer,
)
from modules.common.youtube_client import extract_video_id, fetch_transcript, fetch_video_metadata


# The data routes (sessions, questions, session-progress) have a Next.js twin for nextjs-api mode:
# frontend/fe-apis/dailySession/ (see its header for what is and isn't ported). Change both together.
router = APIRouter(tags=["daily-session"], dependencies=[Depends(get_current_user_id)])

# Every Daily Session endpoint requires login now (the app is login-only), including the question list/detail,
# clear-duplicates, import-deck and the local-Ollama model list, which used to live here without auth. This router
# is kept, empty, only because main.py still includes it; put new routes on `router`.
public_router = APIRouter(tags=["daily-session"])


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


class GenerateSessionQuestionsRequest(AISettings):
    difficulty: Optional[str] = "Mixed"
    cv_present: Optional[bool] = False
    jd_present: Optional[bool] = False
    cv_text: Optional[str] = None
    jd_text: Optional[str] = None
    # Topics picked on the setup screen: preset labels (see _TOPIC_SLOTS) and/or free-text custom topics.
    topics: Optional[List[str]] = None


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
async def create_session_endpoint(
    payload: SessionCreate, user_id: int = Depends(get_current_user_id)
) -> SessionCreateResponse:
    today_date = date.today()
    session_date = today_date.isoformat()
    session_id = create_session(
        user_id=user_id,
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


_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB


@router.get("/sessions/recent")
async def recent_sessions_endpoint(limit: int = Query(default=10, ge=1, le=50), user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return fetch_recent_sessions(user_id=user_id, limit=limit)


@router.post("/sessions/upload-resume")
async def upload_resume(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing")

    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large. Max size is {_MAX_UPLOAD_BYTES // (1024 * 1024)}MB.")
    filename_lower = file.filename.lower()
    text = ""

    if filename_lower.endswith(".pdf"):
        if pdfplumber is None:
            raise HTTPException(status_code=500, detail="pdfplumber library not available")
        try:
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                pages_text = [page.extract_text() or "" for page in pdf.pages]
                text = "\n".join(pages_text)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read this PDF ({type(exc).__name__}) — it may be corrupted, password-protected, "
                "or use a format we can't parse. Try re-exporting it, or paste the resume text directly.",
            )
    elif filename_lower.endswith(".docx"):
        if docx is None:
            raise HTTPException(status_code=500, detail="python-docx library not available")
        try:
            doc = docx.Document(io.BytesIO(contents))
            text = "\n".join([p.text for p in doc.paragraphs])
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read this DOCX ({type(exc).__name__}) — it may be corrupted or password-protected. "
                "Try re-exporting it, or paste the resume text directly.",
            )
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
        prompt = f"""You are Lab Ninja, an elite technical interviewer.
Provide a deep, step-by-step technical explanation for this question:

Question ({payload.category} - {payload.sub_type}):
{payload.question_text}

Format your response cleanly with:
1. High-level Summary (2-3 sentences)
2. In-Depth Technical Walkthrough / Code / Architecture
3. Key Trade-offs & Common Interviewer Follow-ups"""
    else:
        prompt = f"""You are Lab Ninja, an elite technical interviewer.
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



@router.post("/sessions/evaluate-answer")
async def evaluate_answer_endpoint(payload: EvaluateRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """Score an answer against a per-question-type rubric and coach the candidate."""
    if not payload.answer_text.strip() and not (payload.code_text or "").strip():
        raise HTTPException(status_code=400, detail="Write an answer (or some code) first, then ask for an evaluation.")
    try:
        result = evaluate_answer(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Evaluation failed: {exc}")
    # Tutor memory: the 1-2 weak spots it found, keyed by the question type so other questions of it see them.
    _remember_facts(user_id, payload.sub_type or "", weak_spot_facts(result))
    return result


@router.post("/sessions/learn-chat")
async def learn_chat_endpoint(payload: LearnChatRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    """One turn of AI Learn Chat: a Socratic tutor that teaches a topic in depth, then wraps up."""
    if not payload.question_text.strip():
        raise HTTPException(status_code=400, detail="question_text is required")
    if payload.messages and payload.messages[-1].role != "learner":
        raise HTTPException(status_code=400, detail="It is the learner's turn: the last message must be from the learner.")
    try:
        # Tutor memory: weak spots remembered from earlier questions of this type (and the strongest others).
        return learn_turn(payload, _memory_lines(user_id, payload.sub_type or ""))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Tutor unavailable: {exc}")


@router.post("/sessions/convert-flashcards")
async def convert_flashcards_endpoint(payload: ConvertFlashcardsRequest) -> dict:
    """Restructure arbitrary pasted study material into flashcards (no new content is written)."""
    if len(payload.text) > 60000:
        raise HTTPException(status_code=413, detail="That is too much text for one conversion (60,000 characters max). Split it up.")
    try:
        return convert_flashcards(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Conversion failed: {exc}")


@router.post("/sessions/expand-answer")
async def expand_answer_endpoint(payload: ExpandRequest) -> dict:
    """Expand a rough draft (or write a model answer if empty) into a complete, corrected answer."""
    try:
        return expand_answer(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Expansion failed: {exc}")


DIVERSE_QUESTIONS_CATALOG = [
    # Interview Section A (DSA / Sys Design / Bugs / Behavioral)
    {"section": "A", "category": "interview", "sub_type": "Data Structures", "difficulty": "hard", "topics": ["DSA", "LRU Cache"], "question_text": "Implement a LRU Cache with O(1) time complexity for both get and put operations.", "question_type": "Data Structures"},
    {"section": "A", "category": "interview", "sub_type": "Data Structures", "difficulty": "medium", "topics": ["DSA", "Sliding Window"], "question_text": "Find the length of the longest substring without repeating characters in O(n) time.", "question_type": "Data Structures"},
    {"section": "A", "category": "interview", "sub_type": "Data Structures", "difficulty": "hard", "topics": ["DSA", "Trie"], "question_text": "Design an autocomplete search suggestion system using a Prefix Tree (Trie) supporting frequency ranking.", "question_type": "Data Structures"},
    {"section": "A", "category": "interview", "sub_type": "Data Structures", "difficulty": "hard", "topics": ["DSA", "Monotonic Stack"], "question_text": "Given an array of integers representing asteroid sizes and directions, calculate the state of asteroids after all collisions.", "question_type": "Data Structures"},
    {"section": "A", "category": "interview", "sub_type": "System Design (Mid-Scale)", "difficulty": "medium", "topics": ["System Design", "Rate Limiter"], "question_text": "Design a rate limiter backend service that limits requests per user id to 100 requests per minute.", "question_type": "System Design (Mid-Scale)"},
    {"section": "A", "category": "interview", "sub_type": "System Design (Mid-Scale)", "difficulty": "medium", "topics": ["System Design", "URL Shortener"], "question_text": "Design a scalable URL shortener service (like TinyURL) handling 100M new URLs per month with 10:1 read-to-write ratio.", "question_type": "System Design (Mid-Scale)"},
    {"section": "A", "category": "interview", "sub_type": "System Design (Mid-Scale)", "difficulty": "hard", "topics": ["System Design", "Leaderboard"], "question_text": "Design a real-time gaming leaderboard system displaying top 100 players updated every 2 seconds with millions of players.", "question_type": "System Design (Mid-Scale)"},
    {"section": "A", "category": "interview", "sub_type": "Scenario-Based Bug", "difficulty": "hard", "topics": ["ML", "Covariate Shift"], "question_text": "Your production ML model is suffering from covariate shift between training and client deployment. How would you debug and fix this?", "question_type": "Scenario-Based Bug"},
    {"section": "A", "category": "interview", "sub_type": "Scenario-Based Bug", "difficulty": "hard", "topics": ["Distributed Systems", "Race Condition"], "question_text": "During flash sales, two users simultaneously purchase the last inventory item due to distributed race conditions. How do you reproduce and resolve this?", "question_type": "Scenario-Based Bug"},
    {"section": "A", "category": "interview", "sub_type": "Scenario-Based Bug", "difficulty": "hard", "topics": ["Memory Leak", "Async IO"], "question_text": "A high-throughput WebSocket microservice experiences memory bloat that triggers OOM kills every 48 hours. How do you isolate the leak?", "question_type": "Scenario-Based Bug"},
    {"section": "A", "category": "interview", "sub_type": "Large-Scale System Design", "difficulty": "hard", "topics": ["System Design", "Distributed Systems"], "question_text": "Design a distributed search indexing and ranking system like Elasticsearch that can handle 10,000 document additions per second.", "question_type": "Large-Scale System Design"},
    {"section": "A", "category": "interview", "sub_type": "Large-Scale System Design", "difficulty": "hard", "topics": ["System Design", "Notification Engine"], "question_text": "Design a global real-time notifications engine supporting WebSockets, Push notifications, and priority queuing across 50 million active users.", "question_type": "Large-Scale System Design"},
    {"section": "A", "category": "interview", "sub_type": "Leadership", "difficulty": "medium", "topics": ["Behavioral", "Conflict Resolution"], "question_text": "Describe a situation where you had a significant disagreement with a product manager regarding technical debt. How did you resolve it?", "question_type": "Leadership"},
    {"section": "A", "category": "interview", "sub_type": "Leadership", "difficulty": "medium", "topics": ["Behavioral", "Incident Management"], "question_text": "Walk me through how you handled a major P0 production outage that affected 30% of user traffic under tight pressure.", "question_type": "Leadership"},

    # Vision Section B (Classical CV / Deep Learning / Training / Dataset / Optimization)
    {"section": "B", "category": "cv_skill", "sub_type": "Classical CV", "difficulty": "medium", "topics": ["CV", "Camera Geometry"], "question_text": "Explain the mathematical difference between intrinsic and extrinsic camera matrices and how they are estimated.", "question_type": "Classical CV"},
    {"section": "B", "category": "cv_skill", "sub_type": "Classical CV", "difficulty": "medium", "topics": ["CV", "Feature Extraction"], "question_text": "Explain the difference between SIFT, SURF, and ORB feature extractors in terms of rotation, scale invariance, and licensing.", "question_type": "Classical CV"},
    {"section": "B", "category": "cv_skill", "sub_type": "Classical CV", "difficulty": "medium", "topics": ["CV", "Epipolar Geometry"], "question_text": "Derive the epipolar constraint equation x'^T * F * x = 0 and explain the geometric meaning of the epipole.", "question_type": "Classical CV"},
    {"section": "B", "category": "cv_skill", "sub_type": "Deep Learning Vision", "difficulty": "hard", "topics": ["CV", "Object Detection"], "question_text": "What is the role of Anchor Boxes in object detectors like Faster R-CNN? How do you optimize their sizes for custom datasets?", "question_type": "Deep Learning Vision"},
    {"section": "B", "category": "cv_skill", "sub_type": "Deep Learning Vision", "difficulty": "hard", "topics": ["CV", "Vision Transformers"], "question_text": "Compare the inductive biases of Convolutional Neural Networks (CNNs) versus Vision Transformers (ViTs) on small vs large vision datasets.", "question_type": "Deep Learning Vision"},
    {"section": "B", "category": "cv_skill", "sub_type": "Deep Learning Vision", "difficulty": "hard", "topics": ["CV", "Diffusion Models"], "question_text": "Explain the forward and reverse process in DDPM (Denoising Diffusion Probabilistic Models) and how score matching is used.", "question_type": "Deep Learning Vision"},
    {"section": "B", "category": "cv_skill", "sub_type": "CV Training Strategy", "difficulty": "hard", "topics": ["CV", "Quantization"], "question_text": "Describe the trade-offs of using post-training quantization vs quantization-aware training for mobile CNN inference.", "question_type": "CV Training Strategy"},
    {"section": "B", "category": "cv_skill", "sub_type": "CV Training Strategy", "difficulty": "hard", "topics": ["CV", "Contrastive Learning"], "question_text": "How does self-supervised contrastive learning (e.g. SimCLR or CLIP) avoid representational collapse without negative pairs?", "question_type": "CV Training Strategy"},
    {"section": "B", "category": "cv_skill", "sub_type": "Dataset Quality", "difficulty": "medium", "topics": ["CV", "Segmentation"], "question_text": "How do you detect and handle labeling bias in a semantic segmentation dataset of street scenes?", "question_type": "Dataset Quality"},
    {"section": "B", "category": "cv_skill", "sub_type": "Dataset Quality", "difficulty": "medium", "topics": ["CV", "Synthetic Data"], "question_text": "How do you validate domain transfer gap when augmenting training sets with synthetic 3D photorealistic render images?", "question_type": "Dataset Quality"},
    {"section": "B", "category": "cv_skill", "sub_type": "CV Optimization", "difficulty": "hard", "topics": ["CV", "Edge Inference"], "question_text": "How would you optimize inference latency for a transformer-based object detection model on edge devices like Jetson Nano?", "question_type": "CV Optimization"},
    {"section": "B", "category": "cv_skill", "sub_type": "CV Optimization", "difficulty": "hard", "topics": ["CV", "TensorRT"], "question_text": "Explain how TensorRT layer fusion and FP16/INT8 kernel tuning work under the hood to achieve sub-millisecond vision pipeline latency.", "question_type": "CV Optimization"},
    # More variety so several sessions a day never repeat
    {"section": 'A', "category": 'interview', "sub_type": 'Data Structures', "difficulty": 'medium', "topics": ['DSA', 'Heap'], "question_text": 'Find the k-th largest element in an unsorted array. Compare a heap-based approach with Quickselect in time and space.', "question_type": 'Data Structures'},
    {"section": 'A', "category": 'interview', "sub_type": 'Data Structures', "difficulty": 'medium', "topics": ['DSA', 'Union-Find'], "question_text": 'Count the number of connected components in an undirected graph given as an edge list, and explain how union-find with path compression and union by rank achieves near-constant amortized time.', "question_type": 'Data Structures'},
    {"section": 'A', "category": 'interview', "sub_type": 'Data Structures', "difficulty": 'hard', "topics": ['DSA', 'Intervals'], "question_text": 'Given a stream of meeting intervals, design a structure that tells you in O(log n) whether a new meeting conflicts with an existing one.', "question_type": 'Data Structures'},
    {"section": 'A', "category": 'interview', "sub_type": 'Data Structures', "difficulty": 'hard', "topics": ['DSA', 'Dynamic Programming'], "question_text": 'Given two strings, compute the minimum edit distance. Explain the DP recurrence, then reduce the space from O(mn) to O(min(m, n)).', "question_type": 'Data Structures'},
    {"section": 'A', "category": 'interview', "sub_type": 'Data Structures', "difficulty": 'medium', "topics": ['DSA', 'Binary Search'], "question_text": 'Search for a target in a rotated sorted array in O(log n), and explain how duplicates change the worst case.', "question_type": 'Data Structures'},
    {"section": 'A', "category": 'interview', "sub_type": 'System Design (Mid-Scale)', "difficulty": 'medium', "topics": ['System Design', 'Notifications'], "question_text": 'Design a notification service that sends email, SMS and push messages with per-user preferences and retries, handling 10 million notifications per day.', "question_type": 'System Design (Mid-Scale)'},
    {"section": 'A', "category": 'interview', "sub_type": 'System Design (Mid-Scale)', "difficulty": 'medium', "topics": ['System Design', 'File Upload'], "question_text": 'Design a file upload and sharing service (like a simple Dropbox) that supports resumable uploads of files up to 5 GB.', "question_type": 'System Design (Mid-Scale)'},
    {"section": 'A', "category": 'interview', "sub_type": 'System Design (Mid-Scale)', "difficulty": 'hard', "topics": ['System Design', 'Feature Flags'], "question_text": 'Design a feature-flag service used by 200 microservices, where a flag change must reach every service within 5 seconds without a deploy.', "question_type": 'System Design (Mid-Scale)'},
    {"section": 'A', "category": 'interview', "sub_type": 'System Design (Mid-Scale)', "difficulty": 'medium', "topics": ['System Design', 'Job Scheduler'], "question_text": 'Design a distributed job scheduler that runs millions of cron-style jobs exactly once even when workers crash.', "question_type": 'System Design (Mid-Scale)'},
    {"section": 'A', "category": 'interview', "sub_type": 'System Design (Mid-Scale)', "difficulty": 'medium', "topics": ['System Design', 'Autocomplete'], "question_text": 'Design a search autocomplete service that returns the top 5 suggestions within 50 ms for 20,000 queries per second.', "question_type": 'System Design (Mid-Scale)'},
    {"section": 'A', "category": 'interview', "sub_type": 'Scenario-Based Bug', "difficulty": 'hard', "topics": ['Debugging', 'Database'], "question_text": "After a release, one API endpoint's p99 latency jumped from 120 ms to 4 s while the average barely moved. How do you find the cause?", "question_type": 'Scenario-Based Bug'},
    {"section": 'A', "category": 'interview', "sub_type": 'Scenario-Based Bug', "difficulty": 'hard', "topics": ['Debugging', 'Caching'], "question_text": "Users occasionally see another user's data after you added a shared response cache. How do you investigate and fix it?", "question_type": 'Scenario-Based Bug'},
    {"section": 'A', "category": 'interview', "sub_type": 'Scenario-Based Bug', "difficulty": 'medium', "topics": ['Debugging', 'Connection Pool'], "question_text": 'A service starts throwing connection pool timeouts under moderate load, though the database CPU is idle. Walk through your diagnosis.', "question_type": 'Scenario-Based Bug'},
    {"section": 'A', "category": 'interview', "sub_type": 'Scenario-Based Bug', "difficulty": 'hard', "topics": ['Debugging', 'Messaging'], "question_text": 'A queue consumer processes some messages twice, causing duplicate charges. How do you find the cause and make processing safe?', "question_type": 'Scenario-Based Bug'},
    {"section": 'A', "category": 'interview', "sub_type": 'Scenario-Based Bug', "difficulty": 'medium', "topics": ['Debugging', 'Clock Skew'], "question_text": 'Scheduled jobs on one node run at the wrong time and token validation randomly fails across services. What could be happening and how do you confirm it?', "question_type": 'Scenario-Based Bug'},
    {"section": 'A', "category": 'interview', "sub_type": 'Large-Scale System Design', "difficulty": 'hard', "topics": ['System Design', 'Video'], "question_text": 'Design a global video streaming platform: upload, transcoding, adaptive bitrate delivery and recommendations for 100 million daily viewers.', "question_type": 'Large-Scale System Design'},
    {"section": 'A', "category": 'interview', "sub_type": 'Large-Scale System Design', "difficulty": 'hard', "topics": ['System Design', 'Logging'], "question_text": 'Design a log ingestion and search pipeline that handles 1 million events per second with 30 days of searchable retention.', "question_type": 'Large-Scale System Design'},
    {"section": 'A', "category": 'interview', "sub_type": 'Large-Scale System Design', "difficulty": 'hard', "topics": ['System Design', 'Ride Hailing'], "question_text": 'Design the dispatch system of a ride-hailing service: matching riders to nearby drivers in real time across a city.', "question_type": 'Large-Scale System Design'},
    {"section": 'A', "category": 'interview', "sub_type": 'Large-Scale System Design', "difficulty": 'hard', "topics": ['System Design', 'Crawler'], "question_text": 'Design a web crawler that fetches a billion pages while respecting politeness limits and avoiding duplicate content.', "question_type": 'Large-Scale System Design'},
    {"section": 'A', "category": 'interview', "sub_type": 'Large-Scale System Design', "difficulty": 'hard', "topics": ['System Design', 'Collaboration'], "question_text": 'Design a collaborative document editor where many people edit the same document at once, covering conflict resolution and offline edits.', "question_type": 'Large-Scale System Design'},
    {"section": 'A', "category": 'interview', "sub_type": 'Leadership', "difficulty": 'medium', "topics": ['Behavioral', 'Mentoring'], "question_text": 'Tell me about a time you mentored an engineer who was struggling. What did you do and what changed?', "question_type": 'Leadership'},
    {"section": 'A', "category": 'interview', "sub_type": 'Leadership', "difficulty": 'medium', "topics": ['Behavioral', 'Influence'], "question_text": 'Describe a time you had to influence a decision without having authority over the people involved.', "question_type": 'Leadership'},
    {"section": 'A', "category": 'interview', "sub_type": 'Leadership', "difficulty": 'medium', "topics": ['Behavioral', 'Failure'], "question_text": 'Tell me about a project that failed or missed its goal. What was your part, and what did you change afterwards?', "question_type": 'Leadership'},
    {"section": 'A', "category": 'interview', "sub_type": 'Leadership', "difficulty": 'hard', "topics": ['Behavioral', 'Prioritisation'], "question_text": 'Describe a time you had to cut scope on a project with a fixed deadline. How did you decide what to drop and how did you communicate it?', "question_type": 'Leadership'},
    {"section": 'A', "category": 'interview', "sub_type": 'Leadership', "difficulty": 'medium', "topics": ['Behavioral', 'Ambiguity'], "question_text": 'Tell me about a time you were given a vague problem with no clear owner. How did you turn it into a plan?', "question_type": 'Leadership'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Classical CV', "difficulty": 'medium', "topics": ['CV', 'Optical Flow'], "question_text": 'Explain the brightness constancy assumption behind Lucas-Kanade optical flow and when it fails.', "question_type": 'Classical CV'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Classical CV', "difficulty": 'medium', "topics": ['CV', 'RANSAC'], "question_text": 'How does RANSAC estimate a homography in the presence of outliers, and how do you choose the number of iterations?', "question_type": 'Classical CV'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Classical CV', "difficulty": 'medium', "topics": ['CV', 'Edge Detection'], "question_text": 'Walk through the steps of the Canny edge detector and explain the role of hysteresis thresholding.', "question_type": 'Classical CV'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Classical CV', "difficulty": 'hard', "topics": ['CV', 'Stereo'], "question_text": 'Explain how depth is recovered from a rectified stereo pair and what limits its accuracy at long range.', "question_type": 'Classical CV'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Classical CV', "difficulty": 'medium', "topics": ['CV', 'Image Filtering'], "question_text": 'Compare Gaussian, median and bilateral filtering for denoising. When would you choose each?', "question_type": 'Classical CV'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Deep Learning Vision', "difficulty": 'medium', "topics": ['CV', 'Segmentation'], "question_text": 'Compare semantic, instance and panoptic segmentation, and describe an architecture suited to each.', "question_type": 'Deep Learning Vision'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Deep Learning Vision', "difficulty": 'hard', "topics": ['CV', 'Detection'], "question_text": 'Explain how YOLO-style single-stage detectors differ from two-stage detectors in speed and accuracy, and how focal loss helps.', "question_type": 'Deep Learning Vision'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Deep Learning Vision', "difficulty": 'hard', "topics": ['CV', 'GANs'], "question_text": 'Why is GAN training unstable, and what techniques (for example spectral normalization or Wasserstein loss) address it?', "question_type": 'Deep Learning Vision'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Deep Learning Vision', "difficulty": 'medium', "topics": ['CV', 'Batch Norm'], "question_text": 'Explain what batch normalization does during training versus inference, and why it can hurt with very small batches.', "question_type": 'Deep Learning Vision'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Deep Learning Vision', "difficulty": 'hard', "topics": ['CV', 'Depth Estimation'], "question_text": 'How would you train a monocular depth estimation network without ground-truth depth labels?', "question_type": 'Deep Learning Vision'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Training Strategy', "difficulty": 'medium', "topics": ['CV', 'Transfer Learning'], "question_text": 'How do you decide which layers to freeze or fine-tune when adapting an ImageNet-pretrained model to a small medical-imaging dataset?', "question_type": 'CV Training Strategy'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Training Strategy', "difficulty": 'hard', "topics": ['CV', 'Distillation'], "question_text": 'Explain knowledge distillation for a vision model and what the temperature parameter controls.', "question_type": 'CV Training Strategy'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Training Strategy', "difficulty": 'medium', "topics": ['CV', 'Augmentation'], "question_text": 'Design a data augmentation policy for a defect-detection model where defects are rare and small. What augmentations could hurt?', "question_type": 'CV Training Strategy'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Training Strategy', "difficulty": 'hard', "topics": ['CV', 'Mixed Precision'], "question_text": 'How does mixed-precision training work, and what is loss scaling for?', "question_type": 'CV Training Strategy'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Training Strategy', "difficulty": 'medium', "topics": ['CV', 'Learning Rate'], "question_text": 'Compare step decay, cosine annealing and one-cycle learning-rate schedules, and when warmup is needed.', "question_type": 'CV Training Strategy'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Dataset Quality', "difficulty": 'medium', "topics": ['CV', 'Label Noise'], "question_text": 'How do you detect and reduce label noise in a large image-classification dataset?', "question_type": 'Dataset Quality'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Dataset Quality', "difficulty": 'medium', "topics": ['CV', 'Class Imbalance'], "question_text": 'Your detector sees 1,000 background images for every defect image. Compare resampling, loss reweighting and hard-example mining.', "question_type": 'Dataset Quality'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Dataset Quality', "difficulty": 'hard', "topics": ['CV', 'Data Leakage'], "question_text": 'How can train/test leakage occur in video or medical-image datasets, and how do you split the data to prevent it?', "question_type": 'Dataset Quality'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Dataset Quality', "difficulty": 'medium', "topics": ['CV', 'Annotation'], "question_text": 'How would you measure and improve annotator agreement for bounding-box labels?', "question_type": 'Dataset Quality'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'Dataset Quality', "difficulty": 'hard', "topics": ['CV', 'Distribution Shift'], "question_text": 'A model trained on daytime images fails at night. How do you diagnose the gap and close it with data?', "question_type": 'Dataset Quality'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Optimization', "difficulty": 'medium', "topics": ['CV', 'ONNX'], "question_text": 'What problems commonly appear when exporting a PyTorch vision model to ONNX and running it in another runtime, and how do you validate equivalence?', "question_type": 'CV Optimization'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Optimization', "difficulty": 'hard', "topics": ['CV', 'Throughput'], "question_text": 'How do you raise GPU throughput of an image-inference service: batching, pre-processing on GPU, and stream concurrency?', "question_type": 'CV Optimization'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Optimization', "difficulty": 'medium', "topics": ['CV', 'NMS'], "question_text": 'Why can non-maximum suppression become a latency bottleneck, and how can you reduce its cost?', "question_type": 'CV Optimization'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Optimization', "difficulty": 'hard', "topics": ['CV', 'Profiling'], "question_text": 'How do you tell whether a vision model layer is memory-bound or compute-bound, and what do you change in each case?', "question_type": 'CV Optimization'},
    {"section": 'B', "category": 'cv_skill', "sub_type": 'CV Optimization', "difficulty": 'hard', "topics": ['CV', 'Video'], "question_text": 'Design an efficient real-time video inference pipeline that decodes, pre-processes and runs a model on 30 camera streams.', "question_type": 'CV Optimization'}
]


# Random angles per slot so successive generations explore different ground.
_SLOT_FOCUS = {
    "Data Structures": ["heaps and priority queues", "tries", "graphs and BFS/DFS", "sliding window", "union-find", "monotonic stack", "interval scheduling", "LRU/LFU caches", "binary search on answer", "dynamic programming", "two pointers", "segment trees"],
    "System Design (Mid-Scale)": ["URL shortener", "rate limiter", "notification service", "chat app", "file upload service", "feature-flag service", "job scheduler", "search autocomplete", "booking system", "leaderboard"],
    "Scenario-Based Bug": ["memory leak in a long-running service", "deadlock under load", "flaky cache invalidation", "slow database query after a deploy", "race condition in payments", "clock skew across services", "connection pool exhaustion", "silent data corruption", "retry storm"],
    "Large-Scale System Design": ["global video streaming", "distributed log pipeline", "multi-region database", "real-time ad bidding", "ride-hailing dispatch", "web crawler", "metrics/monitoring platform", "collaborative document editing", "ML feature store"],
    "Leadership": ["conflict with a peer", "missed deadline", "mentoring a struggling engineer", "pushing back on a roadmap", "owning a production incident", "driving a risky migration", "influencing without authority", "ambiguous requirements"],
    "Classical CV": ["camera calibration", "SIFT/ORB feature matching", "optical flow", "stereo depth", "homography and RANSAC", "edge and corner detection", "morphological operations", "structure from motion", "histogram equalization"],
    "Deep Learning Vision": ["ResNet skip connections", "YOLO vs two-stage detectors", "U-Net segmentation", "attention in ViTs", "GAN training instability", "NeRF", "SAM / foundation models", "depth estimation", "pose estimation", "vision-language models"],
    "CV Training Strategy": ["transfer learning", "learning-rate schedules", "mixed-precision training", "knowledge distillation", "curriculum learning", "augmentation policy", "few-shot adaptation", "loss design for imbalance", "pruning"],
    "Dataset Quality": ["noisy labels", "class imbalance", "annotation guidelines", "dataset drift", "train/test leakage", "active learning", "inter-annotator agreement", "long-tail classes"],
    "CV Optimization": ["ONNX export pitfalls", "batching for throughput", "NMS cost", "memory-bound vs compute-bound layers", "video pipeline decoding", "model quantization on mobile", "GPU memory profiling", "streaming inference"],
}
_SECTION_A = ["Data Structures", "System Design (Mid-Scale)", "Scenario-Based Bug", "Large-Scale System Design", "Leadership"]
_SECTION_B = ["Classical CV", "Deep Learning Vision", "CV Training Strategy", "Dataset Quality", "CV Optimization"]


_SLOT_BRIEF = {
    "Data Structures": ("A", 1, "Data Structures / Algorithm: a concrete problem with input/output and a complexity angle"),
    "System Design (Mid-Scale)": ("A", 2, "Mid-Scale System Design: one service, clear requirements, trade-offs"),
    "Scenario-Based Bug": ("A", 3, "Scenario-Based Production Bug: symptoms are given, the candidate finds root cause and fix"),
    "Large-Scale System Design": ("A", 4, "Large-Scale Distributed Architecture: scale numbers, failure modes, consistency"),
    "Leadership": ("A", 5, "Behavioral / Engineering Leadership: a specific situation, not a generic 'tell me about yourself'"),
    "Classical CV": ("B", 1, "Classical / Geometric Computer Vision"),
    "Deep Learning Vision": ("B", 2, "Deep Learning Vision Architecture"),
    "CV Training Strategy": ("B", 3, "CV Training Strategy / Quantization / Fine-tuning"),
    "Dataset Quality": ("B", 4, "Dataset Quality / Labeling Imbalance / Bias"),
    "CV Optimization": ("B", 5, "CV Optimization / Edge Inference / TensorRT"),
}
_MAX_ATTEMPTS = 5
# Stop starting new rounds after this many seconds (a serverless function has a time limit) and give the
# model room for ten detailed questions: the default 2048-token budget can cut the JSON off mid-array.
_TIME_BUDGET_S = 60
_MAX_TOKENS = 4096
_MIN_QUESTION_CHARS = 40
_SESSION_SIZE = 10
_MAX_CUSTOM_TOPICS = 10
# common/ai's error when no provider has a key (both "No API key configured for this model..." and the
# Ollama-unreachable variant start with it).
_NO_KEY_MARKER = "No API key configured"
_NEEDS_KEY_WARNING = "No AI key is set up yet. Add one in Config and every session is written fresh for you."

# Preset topic label (case-insensitive) -> the slots (sub_types) it unlocks. Keep the labels in step with
# TOPIC_OPTIONS in frontend/src/modules/daily-session/topics.ts.
_TOPIC_SLOTS = {
    "dsa": ["Data Structures"],
    "system design": ["System Design (Mid-Scale)", "Large-Scale System Design"],
    "debugging": ["Scenario-Based Bug"],
    "behavioral": ["Leadership"],
    "computer vision": ["Classical CV", "Deep Learning Vision", "Dataset Quality"],
    "ml infra": ["CV Training Strategy", "CV Optimization"],
}


def _plan_slots(topics: Optional[List[str]]) -> List[dict]:
    """Turn the picked topics into exactly ``_SESSION_SIZE`` question slots.

    No topics: the standard ten, one per sub_type. Preset topics: ten slots spread round-robin over the
    sub_types those topics unlock (so "DSA" alone gives ten different data-structure questions). Custom
    free-text topics become the required subject of a slot: every slot when no preset is picked, otherwise
    every other slot, so presets still get their share. Slots stay in the canonical section A -> B order.
    """
    canonical = _SECTION_A + _SECTION_B
    presets: List[str] = []
    customs: List[str] = []
    for raw in topics or []:
        label = " ".join(str(raw).split())[:60]
        if not label:
            continue
        if label.lower() in _TOPIC_SLOTS:
            presets.append(label.lower())
        elif label.lower() not in {c.lower() for c in customs}:
            customs.append(label)
    customs = customs[:_MAX_CUSTOM_TOPICS]

    unlocked = {sub for t in presets for sub in _TOPIC_SLOTS[t]}
    pool = [t for t in canonical if t in unlocked] if unlocked else list(canonical)
    chosen = [pool[i % len(pool)] for i in range(_SESSION_SIZE)]
    chosen.sort(key=canonical.index)

    slots = [{"i": n, "sub_type": t, "custom": None} for n, t in enumerate(chosen)]
    if customs:
        targets = [sl for sl in slots] if not unlocked else slots[::2]
        for k, sl in enumerate(targets):
            sl["custom"] = customs[k % len(customs)]
    return slots


def _pick_focus(sub_type: str, index: QuestionIndex, used: set) -> str:
    """The least-covered angle for a slot, so successive sessions explore ground the bank has not seen."""
    options = [f for f in _SLOT_FOCUS[sub_type] if f not in used] or list(_SLOT_FOCUS[sub_type])
    scored = sorted(options, key=lambda f: (index.coverage(f), random.random()))
    focus = random.choice(scored[:3])
    used.add(focus)
    return focus


def _build_session_prompt(
    diff_label: str,
    slots: List[dict],
    known: Dict[int, List[str]],
    rejected: List[str],
    extra_context: str,
) -> str:
    slot_lines = []
    for sl in slots:
        t = sl["sub_type"]
        if sl["custom"]:
            build = (
                f'REQUIRED topic: "{sl["custom"]}". Ask about this topic, in the style of this slot; '
                f'if the topic does not fit the style, keep the topic and bend the style.'
            )
        else:
            build = f'Build it around: {sl["focus"]}.'
        slot_lines.append(f'- slot {sl["i"]}, sub_type "{t}": {_SLOT_BRIEF[t][2]}. {build}')
    known_blocks = []
    for sl in slots:
        items = "\n".join(f"    * {q[:140]}" for q in known.get(sl["i"], [])) or "    * (nothing yet)"
        known_blocks.append(f'  [slot {sl["i"]}: {sl["sub_type"]}] already in the bank:\n{items}')
    rejected_block = ""
    if rejected:
        rejected_block = "\nThese drafts were REJECTED as duplicates of existing questions; take a clearly different angle:\n" + "\n".join(
            f"- {q[:140]}" for q in rejected[-12:]
        ) + "\n"
    return f"""You are Lab Ninja, an elite technical interviewer writing a question bank.
Write exactly {len(slots)} interview questions, one per slot below.
Difficulty Level: {diff_label}
Variation seed: {random.randint(100000, 999999)}

SLOTS:
{chr(10).join(slot_lines)}
{extra_context}
EXISTING QUESTIONS (the bank already covers these; do not repeat, rephrase or restate any of them):
{chr(10).join(known_blocks)}
{rejected_block}
QUALITY BAR:
1. Each question must be specific and answerable in an interview: a concrete scenario, constraint, number or trade-off. No vague "explain X" one-liners.
2. A different core concept or scenario from every existing question above, not merely different wording.
3. Questions must also differ from each other in topic and wording, even when two slots share a sub_type.
4. Standalone: do not refer to "the above" or to other questions.

Return ONLY a valid JSON array of {len(slots)} objects, one per slot, exactly:
[
  {{
    "slot": <the slot number>,
    "difficulty": "{diff_label.lower()}",
    "topics": ["<2-3 short topic tags>"],
    "question_text": "..."
  }}
]"""


_OBJ_RE = re.compile(r'\{(?P<head>[^{}]*?)"question_text"\s*:\s*"(?P<text>.*?)"\s*\}', re.S)


def _salvage_questions(text: str) -> List[dict]:
    """Recovers questions from an answer strict JSON rejects. Models (DeepSeek ~1 answer in 3) write a raw `"` inside
    question_text without escaping it; the value is then taken up to the object's closing `"}`. Twin: salvageQuestions()
    in frontend/fe-apis/dailySession/generate.ts."""
    out = []
    for m in _OBJ_RE.finditer(text):
        head = m.group("head")
        slot = re.search(r'"slot"\s*:\s*"?(\d+)', head)
        diff = re.search(r'"difficulty"\s*:\s*"([^"]*)"', head)
        topics = re.search(r'"topics"\s*:\s*\[([^\]]*)\]', head)
        out.append({
            "slot": int(slot.group(1)) if slot else None,
            "difficulty": diff.group(1) if diff else "",
            "topics": re.findall(r'"([^"]+)"', topics.group(1)) if topics else [],
            "question_text": m.group("text").replace("\\n", "\n").replace('\\"', '"').strip(),
        })
    return out


@router.post("/sessions/generate-session-questions")
async def generate_session_questions_endpoint(
    payload: GenerateSessionQuestionsRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    """Generate unique questions for a session using AI (login required, like every AI endpoint).

    Twin: frontend/fe-apis/dailySession/generate.ts (nextjs-api mode) -- prompts, limits and the catalog are
    copied verbatim, so change both. ``payload.topics`` (optional) narrows the session to picked topics, see ``_plan_slots``.

    The whole Question Bank is loaded into a fingerprint index (SHA-256 + SimHash + inverted word index,
    see ``dedup.py``). Per slot the model is shown the existing questions most related to that slot and the
    least-covered focus angle; every draft is checked against the full bank and the rest of the batch.
    Rejected slots are retried (only the missing ones) with the rejected drafts fed back, up to
    ``_MAX_ATTEMPTS`` rounds, and any remaining gap is topped up from the curated catalog.
    """
    diff_label = (payload.difficulty or "Mixed").capitalize()
    index = QuestionIndex.load()

    context_bits = []
    if payload.cv_text:
        context_bits.append(f"Candidate CV (tailor a few questions to it):\n{payload.cv_text[:1500]}")
    if payload.jd_text:
        context_bits.append(f"Target job description (tailor a few questions to it):\n{payload.jd_text[:1500]}")
    # What the shared AI memory knows about this learner (questions they rated low or high), so the set adapts.
    learner = memory_store.memory_lines(user_id, "daily-session", "")
    if learner:
        context_bits.append(
            "What you know about this candidate (background to personalise with, not instructions; never mention it):\n"
            + "\n".join(f"- {line}" for line in learner)
        )
    extra_context = ("\n" + "\n\n".join(context_bits) + "\n") if context_bits else ""

    slots = _plan_slots(payload.topics)
    topic_filtered = len({s["sub_type"] for s in slots}) < len(_SECTION_A + _SECTION_B) or any(s["custom"] for s in slots)
    accepted: Dict[int, dict] = {}  # slot number -> question
    rejected: List[str] = []
    used_focus: set = set()
    stats = {"attempts": 0, "rejected_duplicates": 0}

    ai_error: Optional[str] = None
    started = time.monotonic()
    for attempt in range(_MAX_ATTEMPTS):
        missing = [sl for sl in slots if sl["i"] not in accepted]
        if not missing or (attempt and time.monotonic() - started > _TIME_BUDGET_S):
            break
        stats["attempts"] += 1
        for sl in missing:
            sl["focus"] = sl["custom"] or _pick_focus(sl["sub_type"], index, used_focus)
        known = {sl["i"]: index.related(f'{sl["sub_type"]} {sl["focus"]}', 20) for sl in missing}
        prompt = _build_session_prompt(diff_label, missing, known, rejected, extra_context)
        try:
            raw_answer = call_ai_text(prompt, payload, max_tokens=_MAX_TOKENS)
        except Exception as e:
            # The call itself failed (no key, bad key, quota, network): another round would fail the same way.
            print(f"[generate-session-questions] AI attempt {attempt + 1} failed: {e}")
            ai_error = str(e)
            break
        try:
            try:
                parsed = extract_json_array(raw_answer)
            except Exception:
                parsed = _salvage_questions(raw_answer)
                if not parsed:
                    raise
        except Exception as e:
            # A malformed answer (an unescaped quote, a cut-off array) is worth another try: models do this ~1 in 3.
            print(f"[generate-session-questions] AI attempt {attempt + 1} gave unreadable JSON: {e}")
            ai_error = str(e)
            continue
        ai_error = None
        by_slot = {sl["i"]: sl for sl in missing}
        for pos, item in enumerate(parsed):
            if not isinstance(item, dict):
                continue
            # Match by the slot number the model echoed; fall back to position among the requested slots.
            try:
                n = int(item.get("slot"))
            except (TypeError, ValueError):
                n = missing[pos]["i"] if pos < len(missing) else -1
            sl = by_slot.get(n)
            if sl is None or n in accepted:
                continue
            q_text = str(item.get("question_text") or item.get("text") or "").strip()
            if len(q_text) < _MIN_QUESTION_CHARS:
                continue
            dup = index.find_duplicate(q_text)
            if dup:
                stats["rejected_duplicates"] += 1
                rejected.append(q_text)
                print(f"[generate-session-questions] rejected ({dup[0]}): {q_text[:80]!r} ~ {dup[1][:80]!r}")
                continue
            index.add(q_text)
            sub_type = sl["sub_type"]
            raw_tags = item.get("topics")
            tags = [t for t in raw_tags if isinstance(t, str) and t.strip()] if isinstance(raw_tags, list) else []
            if not tags:
                tags = [sub_type]
            if sl["custom"] and sl["custom"] not in tags:
                tags = [sl["custom"]] + tags
            accepted[n] = {
                "section": _SLOT_BRIEF[sub_type][0],
                "category": "interview" if _SLOT_BRIEF[sub_type][0] == "A" else "cv_skill",
                "sub_type": sub_type,
                "difficulty": str(item.get("difficulty") or diff_label.lower()),
                "topics": tags,
                "question_text": q_text,
                "question_type": sub_type,
            }

    # No AI key at all: ask for one instead of handing out the built-in set (which runs dry and repeats).
    # The client shows an "Add a key in Config" prompt for `needs_key`.
    if not accepted and ai_error and _NO_KEY_MARKER in ai_error:
        return {"questions": [], "source": "none", "stats": stats, "needs_key": True, "warning": _NEEDS_KEY_WARNING}

    # Top up any gaps from the curated catalog. Never reuse a question that is already in the bank
    # or in this session. Prefer the same sub_type, then (only when no topics were picked) any other
    # slot of the same section; if nothing fresh is left the slot stays empty and is reported.
    source = "ai" if len(accepted) == len(slots) else ("mixed" if accepted else "catalog")
    for sl in slots:
        if sl["i"] in accepted:
            continue
        sub_type = sl["sub_type"]
        sec = _SLOT_BRIEF[sub_type][0]
        pools = [[q for q in DIVERSE_QUESTIONS_CATALOG if q["section"] == sec and q.get("sub_type") == sub_type]]
        if not topic_filtered:
            pools.append([q for q in DIVERSE_QUESTIONS_CATALOG if q["section"] == sec])
        chosen = None
        for pool in pools:
            fresh = [q for q in pool if not index.is_duplicate(q["question_text"])]
            if fresh:
                chosen = random.choice(fresh)
                break
        if chosen is None:
            continue
        index.add(chosen["question_text"])
        accepted[sl["i"]] = {
            **chosen,
            "difficulty": diff_label.lower() if diff_label != "Mixed" else chosen["difficulty"],
        }

    # Number the questions 1..n inside each section, in slot order.
    questions = [accepted[i] for i in sorted(accepted)]
    counters: Dict[str, int] = {}
    for q in questions:
        counters[q["section"]] = counters.get(q["section"], 0) + 1
        q["number"] = counters[q["section"]]
    result = {"questions": questions, "source": source, "stats": stats}
    if ai_error:
        result["ai_error"] = ai_error[:300]
    if len(questions) < len(slots):
        result["warning"] = (
            f"The AI couldn't write new questions ({ai_error[:160]}). Only {len(questions)} unused built-in questions were left."
            if ai_error
            else f"Only {len(questions)} brand-new questions were found. Generate again or pick other topics for the rest."
        )
    elif ai_error:
        result["warning"] = f"The AI couldn't write new questions ({ai_error[:160]}), so some come from the built-in set."
    return result


@router.post("/questions/clear-duplicates")
async def clear_duplicates_endpoint() -> dict:
    """Clear duplicate questions from the question bank using SQL."""
    cleared = clear_duplicate_questions()
    return {
        "cleared_count": cleared,
        "message": f"Successfully cleared {cleared} duplicate question(s)" if cleared > 0 else "No duplicate questions found. Question bank is already clean!"
    }


@router.post("/questions/import-deck")
async def import_deck_endpoint(
    payload: dict,
    user_id: int = Depends(get_current_user_id)
) -> dict:
    """Import an uploaded deck (e.g. Quick Practice JSON) directly into the Question Bank.
    Uses SQL to deduplicate against existing questions.
    """
    raw_questions = payload.get("questions") if isinstance(payload, dict) else payload
    if not raw_questions or not isinstance(raw_questions, list):
        raise HTTPException(status_code=400, detail="Missing or empty 'questions' list in payload")

    session_date = payload.get("date") if isinstance(payload, dict) else None
    session_title = payload.get("session") if isinstance(payload, dict) else None

    res = import_quick_practice_questions(
        questions=raw_questions,
        user_id=user_id,
        session_date=session_date,
        session_title=session_title,
    )

    return {
        "success": True,
        "total": res["total"],
        "inserted": res["inserted"],
        "duplicates": res["duplicates"],
        "session_id": res["session_id"],
        "session_date": res["session_date"],
        "message": f"Saved {res['inserted']} question(s) to Question Bank." + (f" ({res['duplicates']} duplicate(s) skipped)" if res['duplicates'] > 0 else "")
    }


@router.post("/sessions/questions")
async def persist_questions(
    payload: QuestionBatchCreate, user_id: int = Depends(get_current_user_id)
) -> dict:
    if not payload.questions:
        raise HTTPException(status_code=400, detail="questions list must not be empty")

    ids = insert_questions(
        user_id=user_id,
        session_id=payload.session_id,
        questions=[q.model_dump() for q in payload.questions],
    )
    if ids is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"inserted_ids": ids}


@router.get("/questions", response_model=List[QuestionOut])
async def list_questions(
    category: Optional[Category] = Query(default=None),
    session_date: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
) -> List[QuestionOut]:
    records = list(fetch_questions(user_id=user_id, category=category, session_date=session_date, topic=topic))

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


# ── Review list ("Add to review"), per user ───────────────────────────────────
# GET /questions/review-list is declared BEFORE /questions/{question_id}: FastAPI matches in order, and the param
# route would take "review-list" and answer 422. Twin: the same routes in fe-apis/dailySession/index.ts.


@router.get("/questions/review-list")
async def get_review_list(user_id: int = Depends(get_current_user_id)) -> dict:
    """This user's review list, newest first."""
    return {"items": question_store.fetch_review_list(user_id)}


@router.put("/questions/{question_id}/review")
async def add_question_to_review(question_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not question_store.question_exists(question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    return question_store.add_to_review(user_id, question_id)


@router.delete("/questions/{question_id}/review")
async def remove_question_from_review(question_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not question_store.question_exists(question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    return question_store.remove_from_review(user_id, question_id)


@router.get("/questions/{question_id}", response_model=QuestionOut)
async def get_question_detail(question_id: int, user_id: int = Depends(get_current_user_id)) -> QuestionOut:
    # Login required (401 without a token); user_performance / last_reviewed are the caller's own.
    r = fetch_question_by_id(question_id, user_id)
    if not r:
        raise HTTPException(status_code=404, detail="Question not found")
    topics = [t for t in (r.topics or "").split(",") if t]
    return QuestionOut(
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


def _remember_performance(user_id: int, question_id: int, rating: int) -> None:
    """Low (1-2) and high (4-5) star ratings become memory facts about the question's topic. Best effort.
    Twin: rememberPerformance() in frontend/fe-apis/dailySession/index.ts."""
    if rating == 3 or rating < 1 or rating > 5:
        return
    try:
        conn = sqlite3.connect(get_db_path())
        try:
            row = conn.execute(
                # Any user can rate any question now (ratings are per user), so not only the owner's.
                "SELECT sub_type, question_text FROM questions WHERE id = ?", (question_id,)
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return
        kind = "struggle" if rating <= 2 else "mastered"
        verb = "Rated itself low on" if rating <= 2 else "Rated itself high on"
        memory_store.record(user_id, "daily-session", row[0] or "", kind, f'{verb}: "{row[1][:90]}"')
    except Exception as exc:  # memory must never break saving a rating
        print(f"[memory] could not record performance: {exc}")


def _memory_lines(user_id: int, topic: str) -> List[str]:
    """What the shared AI memory knows about this learner for Daily Session, best effort ([] on any error).
    Twin: memoryLinesSafe() in frontend/fe-apis/dailySession/index.ts."""
    try:
        return memory_store.memory_lines(user_id, MEMORY_MODULE, topic)
    except Exception as exc:
        print(f"[memory] could not read memory: {exc}")
        return []


def _remember_facts(user_id: int, topic: str, facts: List[str]) -> None:
    """Record weak spots ("struggle" facts) for the tutor memory. Best effort: never breaks the request.
    Twin: rememberFacts() in frontend/fe-apis/dailySession/index.ts."""
    for fact in facts:
        try:
            memory_store.record(user_id, MEMORY_MODULE, topic, "struggle", fact)
        except Exception as exc:
            print(f"[memory] could not record a weak spot: {exc}")


@router.patch("/questions/{question_id}/performance")
async def update_performance_endpoint(
    question_id: int,
    payload: PerformanceUpdatePayload,
    user_id: int = Depends(get_current_user_id),
) -> dict:
    updated = update_question_performance(
        user_id=user_id,
        question_id=question_id,
        user_performance=payload.user_performance,
        last_reviewed=date.today().isoformat(),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Question not found")
    _remember_performance(user_id, question_id, payload.user_performance)
    return {"status": "success"}


# ── Question Review: per-user workspace and concept quiz ──────────────────────
# A question row is shared, so the user's answer, notes and quiz live in their own tables (schema.py,
# question_store.py). Twin: the /questions/:question_id/{workspace,quiz} routes in frontend/fe-apis/dailySession/
# index.ts -- statuses, limits and error texts match, and the quiz prompt (question_quiz.py) is byte-identical.


class QuestionWorkspaceIn(BaseModel):
    # None (or left out) = keep the saved value.
    answer: Optional[str] = None
    notes: Optional[str] = None


class GenerateQuestionQuizRequest(AISettings):
    count: int = Field(default=5, ge=1, le=8)
    # The user's written answer, so some questions can target its gaps (optional).
    answer: Optional[str] = None
    # Stems of quiz questions the user got wrong (<= 8, each <= 300 chars): recorded as weak spots (tutor memory).
    missed: Optional[List[str]] = None


@router.get("/questions/{question_id}/workspace")
async def get_question_workspace(question_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not question_store.question_exists(question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    return question_store.fetch_workspace(user_id, question_id)


@router.put("/questions/{question_id}/workspace")
async def save_question_workspace(
    question_id: int, payload: QuestionWorkspaceIn, user_id: int = Depends(get_current_user_id)
) -> dict:
    for field, value in (("answer", payload.answer), ("notes", payload.notes)):
        if value is not None and len(value) > MAX_WORKSPACE_FIELD_CHARS:
            raise HTTPException(
                status_code=400, detail=f"{field} is too long (max {MAX_WORKSPACE_FIELD_CHARS} characters)."
            )
    if not question_store.question_exists(question_id):
        raise HTTPException(status_code=404, detail="Question not found")
    return question_store.save_workspace(user_id, question_id, payload.answer, payload.notes)


@router.get("/questions/{question_id}/quiz")
async def get_question_quiz(question_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    """This user's quiz items for the question, oldest first."""
    return {"questions": question_store.fetch_question_quiz(user_id, question_id)}


@router.post("/questions/{question_id}/quiz/generate")
async def generate_question_quiz(
    question_id: int, payload: GenerateQuestionQuizRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    """Generate up to `count` more items about the concepts behind the question. Returns the FULL list after adding.

    Stems the user already has go into the prompt and are filtered out of the result, so repeated calls keep
    producing new ones, up to MAX_QUIZ_PER_QUESTION stored items.
    """
    answer = payload.answer or ""
    if len(answer) > MAX_QUIZ_ANSWER_CHARS:
        raise HTTPException(status_code=400, detail=f"answer is too long (max {MAX_QUIZ_ANSWER_CHARS} characters).")
    missed = payload.missed or []
    if len(missed) > MAX_MISSED or any(len(m) > MAX_MISSED_CHARS for m in missed):
        raise HTTPException(
            status_code=400,
            detail=f"missed takes at most {MAX_MISSED} question stems of up to {MAX_MISSED_CHARS} characters each.",
        )
    question = question_store.fetch_question_for_quiz(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    # Tutor memory: record what they missed first, so this quiz (and other questions of the type) can aim at it.
    _remember_facts(user_id, question["sub_type"], missed_quiz_facts(missed))
    existing = question_store.fetch_question_quiz(user_id, question_id)
    room = MAX_QUIZ_PER_QUESTION - len(existing)
    if room <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"This question already has {MAX_QUIZ_PER_QUESTION} quiz questions, the most it keeps. "
            "Clear the quiz to generate new ones.",
        )
    count = min(payload.count, room)
    prompt = build_question_quiz_prompt(
        question_text=question["question_text"],
        category=question["category"],
        sub_type=question["sub_type"],
        topics=question["topics"],
        difficulty=question["difficulty"],
        answer=answer,
        previous_questions=[q["q"] for q in existing],
        count=count,
        memory=_memory_lines(user_id, question["sub_type"]),
    )
    try:
        response_text = call_ai_text(prompt, payload, max_tokens=QUIZ_MAX_TOKENS)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured or all providers failed. Add a key in Config. Last error: {exc}",
        )

    try:
        questions = normalize_questions(extract_json_array(response_text))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The AI response couldn't be parsed. Try again. ({exc})")
    if not questions:
        raise HTTPException(status_code=502, detail="The AI didn't return any usable questions. Try again.")

    added = question_store.add_question_quiz(user_id, question_id, questions[:count], MAX_QUIZ_PER_QUESTION)
    if not added:
        raise HTTPException(status_code=502, detail="The AI only repeated questions you already have. Try again.")
    return {"questions": question_store.fetch_question_quiz(user_id, question_id)}


@router.delete("/questions/{question_id}/quiz")
async def clear_question_quiz(question_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    question_store.clear_question_quiz(user_id, question_id)
    return {"questions": []}


# Study content: quick review, breakdown, deep dive (question_study.py). Same twin as above.


class QuestionStudyRequest(AISettings):
    refresh: bool = False  # true = regenerate even when one is stored (a breakdown's progress resets)
    answer: Optional[str] = None  # the user's written answer, so the content can lean on its gaps


class DeepDiveExpandRequest(AISettings):
    section: Any = None  # index into the deep dive's sections; checked by hand so a bad one is a 400


class BreakdownProgressIn(BaseModel):
    done: Any = None  # unique chunk indices; checked by hand so a bad list is a 400


def _ai_failed(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=f"No API key configured or all providers failed. Add a key in Config. Last error: {exc}",
    )


def _study_question(question_id: int) -> dict:
    question = question_store.fetch_question_for_quiz(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.get("/questions/{question_id}/study")
async def get_question_study(question_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    """This user's stored study content for the question: {quick, breakdown, deep}, each null until generated."""
    _study_question(question_id)
    return question_store.fetch_study(user_id, question_id, STUDY_KINDS)


@router.post("/questions/{question_id}/study/deep/expand")
async def expand_question_deep_dive(
    question_id: int, payload: DeepDiveExpandRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    """Extend one deep-dive section by a deeper layer (appended; what is there stays) and bump its depth."""
    question = _study_question(question_id)
    deep = question_store.fetch_study_item(user_id, question_id, "deep")
    if not deep:
        raise HTTPException(status_code=404, detail="No deep dive saved for this question yet. Generate one first.")
    sections = deep["sections"]
    index = as_index(payload.section)
    if index is None or not 0 <= index < len(sections):
        raise HTTPException(
            status_code=400, detail=f"section must be the index of one of the deep dive's sections (0-{len(sections) - 1})."
        )
    target = sections[index]
    if target["depth"] >= MAX_DEPTH:
        raise HTTPException(status_code=400, detail=f"This section is already at the deepest level ({MAX_DEPTH}).")
    prompt = build_expand_prompt(
        question_text=question["question_text"],
        category=question["category"],
        sub_type=question["sub_type"],
        topics=question["topics"],
        difficulty=question["difficulty"],
        headings=[s["heading"] for s in sections],
        section=index,
        body=target["body"],
        next_depth=target["depth"] + 1,
    )
    try:
        text = call_ai_text(prompt, payload, max_tokens=EXPAND_MAX_TOKENS)
    except Exception as exc:
        raise _ai_failed(exc)
    layer = clean_layer(text)
    if not layer:
        raise HTTPException(status_code=502, detail="The model returned an empty answer. Try again.")
    target["body"] = target["body"].rstrip() + "\n\n" + layer
    target["depth"] = target["depth"] + 1
    return question_store.save_study(
        user_id, question_id, "deep", {"sections": sections, "further": deep["further"]}
    )


@router.put("/questions/{question_id}/study/breakdown/progress")
async def save_breakdown_progress(
    question_id: int, payload: BreakdownProgressIn, user_id: int = Depends(get_current_user_id)
) -> dict:
    """Which breakdown chunks the user has read (stored sorted)."""
    _study_question(question_id)
    breakdown = question_store.fetch_study_item(user_id, question_id, "breakdown")
    if not breakdown:
        raise HTTPException(status_code=404, detail="No breakdown saved for this question yet. Generate one first.")
    n = len(breakdown["chunks"])
    indices = [as_index(v) for v in payload.done] if isinstance(payload.done, list) else None
    if (
        indices is None
        or any(i is None or not 0 <= i < n for i in indices)
        or len(set(indices)) != len(indices)
    ):
        raise HTTPException(
            status_code=400, detail=f"done must be a list of unique chunk indices (0-{n - 1})."
        )
    return question_store.save_study(
        user_id, question_id, "breakdown", {"chunks": breakdown["chunks"], "done": sorted(indices)}
    )


@router.post("/questions/{question_id}/study/{kind}")
async def generate_question_study(
    question_id: int, kind: str, payload: QuestionStudyRequest, user_id: int = Depends(get_current_user_id)
) -> dict:
    """The stored item of `kind`; generated (and stored) when there is none yet or `refresh` is true."""
    if kind not in STUDY_KINDS:
        raise HTTPException(status_code=400, detail="kind must be one of: quick, breakdown, deep.")
    answer = payload.answer or ""
    if len(answer) > MAX_QUIZ_ANSWER_CHARS:
        raise HTTPException(status_code=400, detail=f"answer is too long (max {MAX_QUIZ_ANSWER_CHARS} characters).")
    question = _study_question(question_id)
    if not payload.refresh:
        stored = question_store.fetch_study_item(user_id, question_id, kind)
        if stored:
            return stored
    prompt = build_study_prompt(
        kind=kind,
        question_text=question["question_text"],
        category=question["category"],
        sub_type=question["sub_type"],
        topics=question["topics"],
        difficulty=question["difficulty"],
        answer=answer,
        memory=_memory_lines(user_id, question["sub_type"]),
    )
    try:
        text = call_ai_text(prompt, payload, max_tokens=STUDY_MAX_TOKENS[kind])
    except Exception as exc:
        raise _ai_failed(exc)
    try:
        raw = parse_study_reply(text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The AI response couldn't be parsed. Try again. ({exc})")
    content = normalize_study(kind, raw)
    if content is None:
        raise HTTPException(status_code=502, detail=f"The AI didn't return a usable {STUDY_LABELS[kind]}. Try again.")
    return question_store.save_study(user_id, question_id, kind, content)


@router.post("/session-progress")
async def save_session_progress_endpoint(
    payload: List[SessionAnswerIn], user_id: int = Depends(get_current_user_id)
) -> dict:
    save_session_progress(user_id=user_id, answers=[item.model_dump() for item in payload])
    return {"status": "success"}


@router.get("/session-progress")
async def get_session_progress_endpoint(
    session_date: str = Query(...), user_id: int = Depends(get_current_user_id)
) -> List[dict]:
    return fetch_session_progress(user_id=user_id, session_date=session_date)


@router.get("/session-progress/stats")
async def get_progress_stats_endpoint(user_id: int = Depends(get_current_user_id)) -> dict:
    return fetch_progress_stats(user_id=user_id)


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


# Lab key (as the lab pages send it) -> the domain named in the prompts below.
_LAB_DOMAINS = {
    "cv": "Computer Vision",
    "dsa": "Data Structures & Algorithms",
    "system-design": "System Design",
    "communication": "Business Communication & Leadership",
    "finance": "Finance & AI in Finance",
    "python": "Python",
    "genai": "Generative AI and AI Systems",
}

# (interviewer, question types) for labs whose questions are not technical-interview questions; every other lab
# keeps the original technical-interviewer prompt unchanged.
_QUESTION_STYLES = {
    "communication": ("senior hiring manager", ["conceptual", "scenario", "behavioral", "role-play", "practical"]),
    "finance": ("senior finance interviewer", ["conceptual", "calculation", "practical", "ai application"]),
    "genai": ("senior AI engineering interviewer", ["conceptual", "implementation", "system design", "evaluation", "debugging"]),
}
_DEFAULT_QUESTION_STYLE = ("senior technical interviewer", ["conceptual", "implementation", "system design", "debugging", "practical"])


def _build_prompt(payload: GenerateQuestionsPayload) -> str:
    subject = payload.subtopic or payload.topic
    lab_map = _LAB_DOMAINS
    domain = lab_map.get(payload.lab, payload.lab)
    ctx = f"\n\nAdditional context:\n{payload.context}" if payload.context else ""
    role, types = _QUESTION_STYLES.get(payload.lab, _DEFAULT_QUESTION_STYLE)
    return f"""You are a {role} specializing in {domain}.

Generate exactly {payload.count} interview questions about "{subject}" (topic: {payload.topic}).{ctx}

Requirements:
- Vary difficulty: mix Easy, Medium, Hard
- Mix question types: {", ".join(types)}
- Each question should be specific, challenging, and interview-ready
- Do NOT number questions or add explanations

Respond with ONLY a valid JSON array (no markdown, no text outside the array):
[
  {{"text": "...", "difficulty": "Easy|Medium|Hard", "sub_type": "{"|".join(types)}"}},
  {{"text": "...", "difficulty": "Medium", "sub_type": "{types[1]}"}}
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


# ── Lab exercise generation from a YouTube video ──────────────────────────────

_MAX_TRANSCRIPT_CHARS = 12000


class GenerateFromYoutubePayload(AISettings):
    youtube_url: str
    topic: str
    lab: str = "general"
    context: Optional[str] = None
    manual_transcript: Optional[str] = None
    youtube_api_key: Optional[str] = None


def _build_youtube_prompt(payload: GenerateFromYoutubePayload, transcript: str, metadata: Optional[dict]) -> str:
    lab_map = _LAB_DOMAINS
    domain = lab_map.get(payload.lab, payload.lab)

    meta_block = ""
    if metadata:
        meta_block = f"\nVideo title: {metadata.get('title', '')}\nVideo description (partial): {metadata.get('description', '')[:1000]}\n"

    ctx = f"\n\nAdditional context from the learner:\n{payload.context}" if payload.context else ""
    trimmed_transcript = transcript[:_MAX_TRANSCRIPT_CHARS]

    return f"""You are a senior {domain} instructor turning a YouTube video into a hands-on practice subtopic.

Parent topic: {payload.topic}
{meta_block}{ctx}

Video transcript (may be auto-generated captions with minor errors):
\"\"\"
{trimmed_transcript}
\"\"\"

Using ONLY the material above, produce a new practice subtopic. Respond with ONLY a valid JSON object
(no markdown fences, no text outside the object) of this exact shape:
{{
  "subtopic": {{"name": "short subtopic title, max 8 words", "brief": "one sentence description"}},
  "content_markdown": "a markdown mini-lab: a short theory recap grounded in the video, then a '### Exercises' section with 2-4 short hands-on practice exercises the learner can actually do",
  "questions": [
    {{"text": "...", "difficulty": "Easy|Medium|Hard", "sub_type": "conceptual|implementation|practical"}}
  ]
}}
Generate exactly 5 questions."""


@router.post("/lab/generate-from-youtube")
async def generate_lab_from_youtube(payload: GenerateFromYoutubePayload) -> dict:
    video_id = extract_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Could not parse a YouTube video ID from that URL.")

    metadata = None
    if payload.youtube_api_key:
        try:
            metadata = fetch_video_metadata(video_id, payload.youtube_api_key)
        except Exception:
            metadata = None  # metadata is supplementary only — never block generation on it

    transcript = (payload.manual_transcript or "").strip()
    if not transcript:
        try:
            transcript = fetch_transcript(video_id)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Couldn't fetch captions for this video ({exc}). Paste the transcript manually and try again.",
            )

    prompt = _build_youtube_prompt(payload, transcript, metadata)
    try:
        response_text = call_ai_text(prompt, payload)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured or all providers failed. Add a key in Config. Last error: {exc}",
        )

    try:
        result = extract_json_object(response_text)
        subtopic = result["subtopic"]
        if not isinstance(subtopic, dict) or not subtopic.get("name"):
            raise ValueError("'subtopic' is missing a 'name'")
        if not isinstance(result.get("content_markdown"), str):
            raise ValueError("'content_markdown' is missing or not a string")
        if not isinstance(result.get("questions", []), list):
            raise ValueError("'questions' is not a list")
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"The AI response was malformed and couldn't be parsed. Try again. ({exc})",
        )
    return result


@router.get("/export", response_model=str)
async def export_markdown(
    session_date: Optional[str] = Query(default=None),
    user_id: int = Depends(get_current_user_id),
) -> str:
    if session_date is None:
        session_date = date.today().isoformat()

    records = list(fetch_questions(user_id=user_id, session_date=session_date))
    if not records:
        raise HTTPException(status_code=404, detail="No questions found for this date")

    return render_markdown_for_day(records, session_date=session_date)
