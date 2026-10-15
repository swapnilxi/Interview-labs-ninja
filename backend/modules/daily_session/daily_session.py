"""Daily session module — manages practice sessions, question persistence, and progress tracking."""

from __future__ import annotations

import io
import json
import random
import re
import sqlite3
import urllib.request
from datetime import date
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from modules.auth.dependencies import get_current_user_id, get_optional_user_id
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


router = APIRouter(tags=["daily-session"], dependencies=[Depends(get_current_user_id)])

# Utility endpoints that don't touch any user data (just proxy to a locally-running
# Ollama server) and are used from the Config page, which guests can use without
# logging in — kept off the `router` above so they aren't swept into its auth
# requirement.
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



@router.post("/sessions/evaluate-answer")
async def evaluate_answer_endpoint(payload: EvaluateRequest) -> dict:
    """Score an answer against a per-question-type rubric and coach the candidate."""
    if not payload.answer_text.strip() and not (payload.code_text or "").strip():
        raise HTTPException(status_code=400, detail="Write an answer (or some code) first, then ask for an evaluation.")
    try:
        return evaluate_answer(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Evaluation failed: {exc}")


@router.post("/sessions/learn-chat")
async def learn_chat_endpoint(payload: LearnChatRequest) -> dict:
    """One turn of AI Learn Chat: a Socratic tutor that teaches a topic in depth, then wraps up."""
    if not payload.question_text.strip():
        raise HTTPException(status_code=400, detail="question_text is required")
    if payload.messages and payload.messages[-1].role != "learner":
        raise HTTPException(status_code=400, detail="It is the learner's turn: the last message must be from the learner.")
    try:
        return learn_turn(payload)
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


def _get_recent_question_texts(limit: int = 300) -> List[str]:
    try:
        conn = sqlite3.connect(get_db_path())
        cursor = conn.cursor()
        cursor.execute("SELECT question_text FROM questions ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        conn.close()
        return [r[0].strip() for r in rows if r[0]]
    except Exception:
        return []


_STOPWORDS = {
    "the", "a", "an", "of", "to", "and", "in", "on", "for", "is", "are", "how", "do", "does", "you", "your",
    "would", "what", "why", "with", "that", "this", "it", "as", "be", "by", "or", "when", "from", "at",
}


def _tokens(text: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOPWORDS and len(w) > 2}


def _is_duplicate(text: str, seen_texts: set, seen_tokens: List[set]) -> bool:
    """Exact match, or a near-paraphrase (Jaccard token overlap >= 0.6) of anything already seen."""
    norm = " ".join(re.findall(r"[a-z0-9]+", text.lower()))
    if norm in seen_texts:
        return True
    toks = _tokens(text)
    if not toks:
        return False
    for other in seen_tokens:
        union = toks | other
        if union and len(toks & other) / len(union) >= 0.6:
            return True
    return False


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


def _build_session_prompt(diff_label: str, avoid: List[str], focus: Dict[str, str], extra_context: str) -> str:
    excluded = "\n".join(f"- {t}" for t in avoid) or "(none yet)"
    focus_lines = "\n".join(f"   - {k}: {v}" for k, v in focus.items())
    return f"""You are Interview-Ninja, an elite technical interviewer.
Generate exactly 10 distinct, realistic interview questions for a tech candidate.
Difficulty Level: {diff_label}
Variation seed: {random.randint(100000, 999999)} (use it to pick fresh angles; never reuse earlier phrasing).

SECTION A (5 questions):
1: Data Structures / Algorithm (sub_type: "Data Structures")
2: Mid-Scale System Design (sub_type: "System Design (Mid-Scale)")
3: Scenario-Based Production Bug / Root-Cause Debugging (sub_type: "Scenario-Based Bug")
4: Large-Scale Distributed Architecture (sub_type: "Large-Scale System Design")
5: Behavioral / Engineering Leadership (sub_type: "Leadership")

SECTION B (5 questions):
1: Classical Computer Vision / Geometric Vision (sub_type: "Classical CV")
2: Deep Learning Vision Architecture (sub_type: "Deep Learning Vision")
3: CV Training Strategy / Quantization / Fine-tuning (sub_type: "CV Training Strategy")
4: Dataset Quality / Labeling Imbalance / Bias (sub_type: "Dataset Quality")
5: CV Optimization / Edge Inference / TensorRT (sub_type: "CV Optimization")

Suggested focus for each slot this time (build the question around it):
{focus_lines}
{extra_context}
CRITICAL CONSTRAINTS:
1. All 10 questions must be different from each other in topic AND wording.
2. Do NOT repeat, paraphrase, or closely resemble ANY of these previously asked questions:
{excluded}

Return ONLY a valid JSON array of 10 objects with this exact structure:
[
  {{
    "section": "A",
    "number": 1,
    "category": "interview",
    "sub_type": "Data Structures",
    "difficulty": "{diff_label.lower()}",
    "topics": ["DSA"],
    "question_text": "...",
    "question_type": "Data Structures"
  }},
  ...
]"""


@public_router.post("/sessions/generate-session-questions")
async def generate_session_questions_endpoint(payload: GenerateSessionQuestionsRequest) -> dict:
    """Generate unique, non-duplicate questions for a session using AI.

    Every AI question is checked against the question bank (exact + near-paraphrase); duplicates
    trigger a retry with them added to the avoid list, and any remaining gap is topped up from
    the curated catalog, unseen entries first.
    """
    recent_texts = _get_recent_question_texts()
    diff_label = (payload.difficulty or "Mixed").capitalize()

    seen_texts = {" ".join(re.findall(r"[a-z0-9]+", t.lower())) for t in recent_texts}
    seen_tokens = [_tokens(t) for t in recent_texts]

    context_bits = []
    if payload.cv_text:
        context_bits.append(f"Candidate CV (tailor a few questions to it):\n{payload.cv_text[:1500]}")
    if payload.jd_text:
        context_bits.append(f"Target job description (tailor a few questions to it):\n{payload.jd_text[:1500]}")
    extra_context = ("\n" + "\n\n".join(context_bits) + "\n") if context_bits else ""

    slots = _SECTION_A + _SECTION_B
    accepted: Dict[str, dict] = {}  # sub_type -> question
    avoid = recent_texts[:60]

    for attempt in range(3):
        missing = [t for t in slots if t not in accepted]
        if not missing:
            break
        focus = {t: random.choice(_SLOT_FOCUS[t]) for t in slots}
        prompt = _build_session_prompt(diff_label, avoid, focus, extra_context)
        try:
            parsed = extract_json_array(call_ai_text(prompt, payload))
        except Exception as e:
            print(f"[generate-session-questions] AI attempt {attempt + 1} failed: {e}")
            break
        for idx, item in enumerate(parsed[:10]):
            sub_type = slots[idx] if idx < len(slots) else None
            if not sub_type or sub_type in accepted or not isinstance(item, dict):
                continue
            q_text = str(item.get("question_text") or item.get("text") or "").strip()
            if not q_text or _is_duplicate(q_text, seen_texts, seen_tokens):
                if q_text:
                    avoid = [q_text] + avoid
                continue
            seen_texts.add(" ".join(re.findall(r"[a-z0-9]+", q_text.lower())))
            seen_tokens.append(_tokens(q_text))
            sec = "A" if idx < 5 else "B"
            accepted[sub_type] = {
                "section": sec,
                "number": (idx % 5) + 1,
                "category": "interview" if sec == "A" else "cv_skill",
                "sub_type": sub_type,
                "difficulty": item.get("difficulty") or diff_label.lower(),
                "topics": item.get("topics") if isinstance(item.get("topics"), list) else [sub_type],
                "question_text": q_text,
                "question_type": item.get("question_type") or sub_type,
            }

    # Top up any gaps from the curated catalog. Never reuse a question that is already in the bank
    # or in this session: prefer the same slot, then any other slot of the same section; if the
    # catalog is exhausted the slot is left empty and reported, rather than silently repeated.
    source = "ai" if len(accepted) == len(slots) else ("mixed" if accepted else "catalog")
    for idx, sub_type in enumerate(slots):
        if sub_type in accepted:
            continue
        sec = "A" if sub_type in _SECTION_A else "B"
        same_slot = [q for q in DIVERSE_QUESTIONS_CATALOG if q["section"] == sec and q.get("sub_type") == sub_type]
        same_sec = [q for q in DIVERSE_QUESTIONS_CATALOG if q["section"] == sec]
        chosen = None
        for pool in (same_slot, same_sec):
            fresh = [q for q in pool if not _is_duplicate(q["question_text"], seen_texts, seen_tokens)]
            if fresh:
                chosen = random.choice(fresh)
                break
        if chosen is None:
            continue
        seen_texts.add(" ".join(re.findall(r"[a-z0-9]+", chosen["question_text"].lower())))
        seen_tokens.append(_tokens(chosen["question_text"]))
        accepted[chosen.get("sub_type", sub_type)] = {
            **chosen,
            "number": (idx % 5) + 1,
            "difficulty": diff_label.lower() if diff_label != "Mixed" else chosen["difficulty"],
        }

    questions = list(accepted.values())
    result = {"questions": questions, "source": source}
    if len(questions) < len(slots):
        result["warning"] = (
            f"Only {len(questions)} brand-new questions were available. "
            "Add an AI key in Settings to get a fresh, unique set every time."
        )
    return result


@public_router.post("/questions/clear-duplicates")
async def clear_duplicates_endpoint() -> dict:
    """Clear duplicate questions from the question bank using SQL."""
    cleared = clear_duplicate_questions()
    return {
        "cleared_count": cleared,
        "message": f"Successfully cleared {cleared} duplicate question(s)" if cleared > 0 else "No duplicate questions found. Question bank is already clean!"
    }


@public_router.post("/questions/import-deck")
async def import_deck_endpoint(
    payload: dict,
    user_id: Optional[int] = Depends(get_optional_user_id)
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


@public_router.get("/questions", response_model=List[QuestionOut])
async def list_questions(
    category: Optional[Category] = Query(default=None),
    session_date: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
    user_id: Optional[int] = Depends(get_optional_user_id),
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


@public_router.get("/questions/{question_id}", response_model=QuestionOut)
async def get_question_detail(question_id: int) -> QuestionOut:
    r = fetch_question_by_id(question_id)
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
    return {"status": "success"}


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


@public_router.get("/settings/ollama-models")
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
    lab_map = {"cv": "Computer Vision", "dsa": "Data Structures & Algorithms", "system-design": "System Design"}
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
