"""Guided Practice: the dedicated page behind a lab topic's "Guided Practice" card (a generated path of questions,
the learner's progress, an AI tutor and STAR answers). The labs are every lab (`lab` = dsa, cv, system_design, communication, finance, python or genai; default dsa; anything else is a 422).

    GET/PUT/DELETE /guided-practice/state    the learner's saved path and progress for one page of a lab
    GET            /guided-practice/summary  what the topic page's card shows, without the whole document
    POST /guided-practice/curriculum | /outline | /phase | /question | /breakdown | /deeper | /tutor | /star
                                             build a prompt (prompts.py), run it with the model chosen in Config and
                                             return the raw answer: the browser parses and cleans it

`lab` is a query parameter on GET/DELETE /state and GET /summary, and a body field on PUT /state and on every POST.
Every endpoint needs a login. The saved document is one JSON blob per (user, lab, topic, subtopic) that the browser owns: the
same topic id under two labs is two independent pages. A save has to quote the version it loaded, so a second tab
holding an older copy is refused (409) instead of overwriting newer progress.

Twin: frontend/fe-apis/guidedPractice/handlers.ts (nextjs-api mode). Limits, status codes and error texts match (the
wording of Pydantic's 422s differs); the prompts are prompts.py <-> prompts.ts. Change both together.
"""

from __future__ import annotations

import json
import math
import re
from typing import Annotated, Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, StrictBool, StrictInt, StringConstraints, model_validator

from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings, call_ai_text

from .prompts import (
    MAX_TOKENS,
    ExistingChild,
    ExistingDeeper,
    GuidedLab,
    OutlinePhase,
    PathPos,
    PhaseInput,
    PromptCtx,
    QuestionRef,
    StarInput,
    StarVariant,
    TutorAction,
    TutorInput,
    TutorTurn,
    build_breakdown_prompt,
    build_curriculum_prompt,
    build_deeper_prompt,
    build_outline_prompt,
    build_phase_prompt,
    build_question_prompt,
    build_star_prompt,
    build_tutor_prompt,
    js_trim,
)
from .store import delete_state, fetch_state, fetch_summary, save_state

router = APIRouter(prefix="/guided-practice", tags=["guided-practice"], dependencies=[Depends(get_current_user_id)])

_NO_KEY_MARKER = "No API key configured"
# The saved document of one page: the generated path plus the learner's progress, tutor threads and answers.
MAX_STATE_CHARS = 1_500_000


# ── Request bodies ──────────────────────────────────────────────────────────

# A lone surrogate is half an emoji (the browser clips text with String.slice, which can cut one in half). Python holds a
# valid surrogate pair as one character, so any surrogate in a str is a lone one.
_LONE_SURROGATE = re.compile("[\ud800-\udfff]")


def _scrub(value: Any) -> Any:
    """A parsed JSON value with every lone surrogate replaced by U+FFFD (Pydantic refuses such strings, and the 422 it
    would answer with cannot be encoded either). The TS twin lets them through; a model could not read them anyway."""
    if isinstance(value, str):
        return _LONE_SURROGATE.sub("\ufffd", value)
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    if isinstance(value, dict):
        return {_scrub(key): _scrub(item) for key, item in value.items()}
    return value


class _Body(BaseModel):
    """A request body in which an explicit null means "not sent" (the field's default applies), like the TS twin."""

    @model_validator(mode="before")
    @classmethod
    def _null_is_absent(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {key: value for key, value in data.items() if value is not None}
        return data


def _strings(max_items: int, max_len: int) -> Any:
    """A list of at most `max_items` strings of at most `max_len` characters each."""
    return Annotated[List[Annotated[str, StringConstraints(max_length=max_len)]], Field(max_length=max_items)]


_CompletedTitles = _strings(40, 300)
_AncestryTitles = _strings(8, 400)
_SiblingTitles = _strings(12, 300)
_PathTitles = _strings(60, 300)
_ChildTitles = _strings(10, 400)
_ExerciseTitles = _strings(20, 300)
_KeptTitles = _strings(8, 400)


class _QuestionIn(_Body):
    title: str = Field(min_length=1, max_length=400)
    objective: str = Field(default="", max_length=800)
    kind: str = Field(default="concept", max_length=20)
    difficulty: str = Field(default="medium", max_length=20)
    why: str = Field(default="", max_length=800)
    relation: str = Field(default="base", max_length=20)
    level: Optional[StrictInt] = Field(default=None, ge=1, le=5)
    angle: str = Field(default="", max_length=40)
    wants_exercise: StrictBool = False
    effort: str = Field(default="", max_length=40)


class _ExistingChildIn(_Body):
    title: str = Field(min_length=1, max_length=400)
    completed: StrictBool = False


class _ExistingDeeperIn(_Body):
    title: str = Field(min_length=1, max_length=400)
    level: StrictInt = Field(default=1, ge=1, le=5)
    completed: StrictBool = False


class _OutlinePhaseIn(_Body):
    title: str = Field(min_length=1, max_length=200)
    goal: str = Field(default="", max_length=500)


class _TutorTurnIn(_Body):
    role: Literal["learner", "tutor"]
    text: str = Field(default="", max_length=3000)


class _AiBody(_Body, AISettings):
    """The problem and the learner, as every AI request describes them (plus the AISettings the Config page sends)."""

    topic_id: str = Field(min_length=1, max_length=200)
    topic_name: str = Field(min_length=1, max_length=300)
    topic_brief: str = Field(default="", max_length=2000)
    category: str = Field(default="", max_length=200)
    difficulty: str = Field(default="", max_length=40)
    subtopic_name: str = Field(default="", max_length=300)
    subtopic_brief: str = Field(default="", max_length=2000)
    learner_level: str = Field(default="", max_length=120)
    learner_progress: str = Field(default="", max_length=800)
    completed_titles: _CompletedTitles = Field(default_factory=list)
    lab: GuidedLab = "dsa"

    @model_validator(mode="before")
    @classmethod
    def _no_lone_surrogates(cls, data: Any) -> Any:
        return _scrub(data)


class _QuestionBody(_AiBody):
    """An AI request about one question of the path, and where in the path it sits."""

    question: _QuestionIn
    phase_number: StrictInt = Field(default=0, ge=0, le=50)  # 0 = not in a numbered phase (the final boss)
    phase_title: str = Field(default="", max_length=200)
    phase_goal: str = Field(default="", max_length=500)
    ancestry_titles: _AncestryTitles = Field(default_factory=list)  # parent questions, outermost first


class CurriculumPayload(_AiBody):
    phase_count: StrictInt = Field(default=5, ge=3, le=6)
    focus: str = Field(default="", max_length=600)


class OutlinePayload(_AiBody):
    phase_count: StrictInt = Field(default=5, ge=3, le=6)
    focus: str = Field(default="", max_length=600)


class PhasePayload(_AiBody):
    """One page of the path: the questions of one phase (a new one, a phase of the plan that is not written yet, or a regenerate)."""

    phase_number: StrictInt = Field(default=1, ge=1, le=50)
    phase_title: str = Field(default="", max_length=200)  # empty: a phase the plan does not have, the AI chooses
    phase_goal: str = Field(default="", max_length=500)
    outline: List[_OutlinePhaseIn] = Field(default_factory=list, max_length=12)
    other_titles: _PathTitles = Field(default_factory=list)  # the questions the rest of the path has: never repeated
    kept_titles: _KeptTitles = Field(default_factory=list)  # this phase's questions that stay (a regenerate keeps worked ones)
    focus: str = Field(default="", max_length=600)


class QuestionPayload(_QuestionBody):
    sibling_titles: _SiblingTitles = Field(default_factory=list)


class BreakdownPayload(_QuestionBody):
    existing_children: List[_ExistingChildIn] = Field(default_factory=list, max_length=12)
    path_titles: _PathTitles = Field(default_factory=list)
    regenerate: StrictBool = False


class DeeperPayload(_QuestionBody):
    existing_deeper: List[_ExistingDeeperIn] = Field(default_factory=list, max_length=14)
    path_titles: _PathTitles = Field(default_factory=list)
    regenerate: StrictBool = False


class TutorPayload(_QuestionBody):
    action: TutorAction = "ask"
    message: str = Field(default="", max_length=2000)
    explanation: str = Field(default="", max_length=2500)
    exercise_prompt: str = Field(default="", max_length=1500)
    child_titles: _ChildTitles = Field(default_factory=list)
    completed_exercise_titles: _ExerciseTitles = Field(default_factory=list)
    hint_level: StrictInt = Field(default=1, ge=1, le=3)
    history: List[_TutorTurnIn] = Field(default_factory=list, max_length=16)
    learner_code: str = Field(default="", max_length=6000)
    test_report: str = Field(default="", max_length=1800)
    star_answer: str = Field(default="", max_length=8000)
    solution_revealed: StrictBool = False


class StarPayload(_QuestionBody):
    variant: StarVariant = "generate"
    explanation: str = Field(default="", max_length=2500)
    exercise_prompt: str = Field(default="", max_length=1500)
    existing_answer: str = Field(default="", max_length=12000)


class SaveStatePayload(_Body):
    lab: GuidedLab = "dsa"
    topic_id: str = Field(min_length=1, max_length=200)
    subtopic_id: str = Field(default="", max_length=200)  # '' = the topic's own page
    expected_version: StrictInt = Field(default=0, ge=0, le=1_000_000_000)  # 0 = the page had nothing saved yet
    state: Dict[str, Any]
    summary: Any = None


# ── The saved document ──────────────────────────────────────────────────────


def _dump_json(value: Any) -> str:
    """`JSON.stringify(value)`: compact, non-ASCII kept as is, a lone surrogate written as a \\udXXX escape.

    A lone surrogate could not be stored as UTF-8, while JSON.stringify writes it as an escape. NaN and Infinity are
    refused (ValueError): JSON.parse would not have accepted them in the first place.
    """
    text = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    return _LONE_SURROGATE.sub(lambda m: f"\\u{ord(m.group()):04x}", text)


def _js_length(text: str) -> int:
    """`text.length` in JavaScript: UTF-16 code units, so an emoji counts twice."""
    return len(text.encode("utf-16-le", "surrogatepass")) // 2


def _js_slice(text: str, end: int) -> str:
    """`text.slice(0, end)` in JavaScript: the first `end` UTF-16 code units (an emoji on the edge is cut in half)."""
    return text.encode("utf-16-le", "surrogatepass")[: end * 2].decode("utf-16-le", "surrogatepass")


class _AsciiJSONResponse(JSONResponse):
    """JSON with every non-ASCII character escaped, so a stored lone surrogate can still be sent (UTF-8 cannot carry one)."""

    def render(self, content: Any) -> bytes:
        return json.dumps(content, ensure_ascii=True, allow_nan=False, indent=None, separators=(",", ":")).encode("ascii")


def _num(value: Any, maximum: int) -> int:
    """A whole number from 0 to `maximum` (floored, clamped); anything that is not a finite JSON number becomes 0."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    try:
        number = float(value)
    except OverflowError:  # an integer beyond the float range is Infinity once JavaScript has parsed it
        return 0
    if not math.isfinite(number):
        return 0
    return min(max(math.floor(number), 0), maximum)


def _sanitize_summary(raw: Any) -> str:
    """Whole, clamped numbers only: the summary is what the topic page's card shows, never trusted markup."""
    s: Dict[str, Any] = raw if isinstance(raw, dict) else {}
    title = s.get("levelTitle")
    return _dump_json(
        {
            "percent": _num(s.get("percent"), 100),
            "completed": _num(s.get("completed"), 100000),
            "total": _num(s.get("total"), 100000),
            "xp": _num(s.get("xp"), 10_000_000),
            "level": _num(s.get("level"), 1000),
            "levelTitle": _js_slice(title, 40) if isinstance(title, str) else "",
            "phasesDone": _num(s.get("phasesDone"), 1000),
            "phases": _num(s.get("phases"), 1000),
            "bossDefeated": s.get("bossDefeated") is True,
        }
    )


# These are plain `def`s on purpose: FastAPI runs them in its thread pool, so a slow model call or a database write
# never blocks the event loop.


@router.get("/state", response_class=_AsciiJSONResponse)
def get_state(
    lab: GuidedLab = Query(default="dsa"),
    topic_id: str = Query(min_length=1, max_length=200),
    subtopic_id: str = Query(default="", max_length=200),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """The saved path and progress of one page (`exists: false` while the learner has not started it)."""
    row = fetch_state(user_id, lab, topic_id, subtopic_id)
    if row is None:
        return {"exists": False, "version": 0, "state": None, "summary": None, "updatedAt": None}
    return {"exists": True, **row}


@router.put("/state")
def put_state(payload: SaveStatePayload, user_id: int = Depends(get_current_user_id)) -> dict:
    """Save a page's document. `expected_version` is the version the browser loaded (0 = nothing saved yet)."""
    try:
        state_json = _dump_json(payload.state)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid JSON body")
    if _js_length(state_json) > MAX_STATE_CHARS:
        raise HTTPException(
            status_code=413, detail=f"This page's progress is too large to save (max {MAX_STATE_CHARS} characters)."
        )
    saved = save_state(
        user_id,
        payload.lab,
        payload.topic_id,
        payload.subtopic_id,
        payload.expected_version,
        state_json,
        _sanitize_summary(payload.summary),
    )
    if saved is None:
        raise HTTPException(
            status_code=409, detail="Your saved progress changed somewhere else (another tab or device). Reload to continue."
        )
    return saved


@router.delete("/state")
def delete_page_state(
    lab: GuidedLab = Query(default="dsa"),
    topic_id: str = Query(min_length=1, max_length=200),
    subtopic_id: str = Query(default="", max_length=200),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Forget a page's saved path and progress (the learner starts over). Idempotent."""
    delete_state(user_id, lab, topic_id, subtopic_id)
    return {"ok": True}


@router.get("/summary", response_class=_AsciiJSONResponse)
def get_summary(
    lab: GuidedLab = Query(default="dsa"),
    topic_id: str = Query(min_length=1, max_length=200),
    subtopic_id: str = Query(default="", max_length=200),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """What the topic page's card shows (percent, level, boss...), without the whole document."""
    row = fetch_summary(user_id, lab, topic_id, subtopic_id)
    if row is None:
        return {"exists": False, "summary": None, "updatedAt": None}
    return {"exists": True, **row}


# ── AI ──────────────────────────────────────────────────────────────────────


# Per provider request, in seconds. The providers' own defaults (45-60 s) are far too short for a 4,000-token answer from a slow
# model; this is the AI_TIMEOUT_MS of fe-apis/guidedPractice/handlers.ts.
_AI_TIMEOUT_S = 240


def _run_ai(task: str, prompt: str, payload: AISettings) -> dict:
    """Run one prompt with the model chosen in Config and return the raw answer (the browser parses it)."""
    try:
        text = call_ai_text(prompt, payload, max_tokens=MAX_TOKENS[task], timeout=_AI_TIMEOUT_S)
    except Exception as exc:
        message = str(exc)
        if _NO_KEY_MARKER in message:
            raise HTTPException(status_code=400, detail=message)
        raise HTTPException(status_code=502, detail=f"The AI call failed: {message}")
    if not js_trim(text or ""):
        raise HTTPException(status_code=502, detail="The AI returned an empty answer. Try again.")
    # `model` is the id the request resolved to (an empty choice means the server's .env default).
    return {"text": text, "model": payload.model}


def _ctx(p: _AiBody) -> PromptCtx:
    return PromptCtx(
        lab=p.lab,
        topic_name=p.topic_name,
        topic_brief=p.topic_brief,
        category=p.category,
        difficulty=p.difficulty,
        subtopic_name=p.subtopic_name,
        subtopic_brief=p.subtopic_brief,
        learner_level=p.learner_level,
        learner_progress=p.learner_progress,
        completed_titles=p.completed_titles,
    )


def _question(p: _QuestionBody) -> QuestionRef:
    return QuestionRef(**p.question.model_dump())


def _pos(p: _QuestionBody) -> PathPos:
    return PathPos(
        phase_number=p.phase_number, phase_title=p.phase_title, phase_goal=p.phase_goal, ancestry_titles=p.ancestry_titles
    )


@router.post("/curriculum")
def curriculum(payload: CurriculumPayload) -> dict:
    """The outline of the path: phases of questions plus the final boss."""
    return _run_ai("curriculum", build_curriculum_prompt(_ctx(payload), payload.phase_count, payload.focus), payload)


@router.post("/outline")
def outline(payload: OutlinePayload) -> dict:
    """The plan of the path: its phases (title and goal) and the final boss. Each phase is written later, by /phase."""
    return _run_ai("outline", build_outline_prompt(_ctx(payload), payload.phase_count, payload.focus), payload)


@router.post("/phase")
def phase(payload: PhasePayload) -> dict:
    """One page of the path: a phase of PHASE_QUESTIONS full questions."""
    ph = PhaseInput(
        number=payload.phase_number,
        title=payload.phase_title,
        goal=payload.phase_goal,
        outline=[OutlinePhase(title=o.title, goal=o.goal) for o in payload.outline],
        other_titles=payload.other_titles,
        kept_titles=payload.kept_titles,
        focus=payload.focus,
    )
    return _run_ai("phase", build_phase_prompt(_ctx(payload), ph), payload)


@router.post("/question")
def question(payload: QuestionPayload) -> dict:
    """The full lesson (explanation, example, coding exercise, hints) of one question."""
    prompt = build_question_prompt(_ctx(payload), _question(payload), _pos(payload), payload.sibling_titles)
    return _run_ai("question", prompt, payload)


@router.post("/breakdown")
def breakdown(payload: BreakdownPayload) -> dict:
    """Smaller questions for a learner who finds one too hard."""
    existing = [ExistingChild(title=e.title, completed=e.completed) for e in payload.existing_children]
    prompt = build_breakdown_prompt(
        _ctx(payload), _question(payload), _pos(payload), existing, payload.path_titles, payload.regenerate
    )
    return _run_ai("breakdown", prompt, payload)


@router.post("/deeper")
def deeper(payload: DeeperPayload) -> dict:
    """Follow-up questions for a learner who wants to go further on one."""
    existing = [ExistingDeeper(title=e.title, level=e.level, completed=e.completed) for e in payload.existing_deeper]
    prompt = build_deeper_prompt(
        _ctx(payload), _question(payload), _pos(payload), existing, payload.path_titles, payload.regenerate
    )
    return _run_ai("deeper", prompt, payload)


@router.post("/tutor")
def tutor(payload: TutorPayload) -> dict:
    """One turn of the AI tutor."""
    if payload.action == "ask" and not js_trim(payload.message):
        raise HTTPException(status_code=422, detail="message is required")
    prompt = build_tutor_prompt(
        _ctx(payload),
        TutorInput(
            question=_question(payload),
            pos=_pos(payload),
            explanation=payload.explanation,
            exercise_prompt=payload.exercise_prompt,
            child_titles=payload.child_titles,
            completed_exercise_titles=payload.completed_exercise_titles,
            action=payload.action,
            message=payload.message,
            hint_level=payload.hint_level,
            history=[TutorTurn(role=h.role, text=h.text) for h in payload.history],
            learner_code=payload.learner_code,
            test_report=payload.test_report,
            star_answer=payload.star_answer,
            solution_revealed=payload.solution_revealed,
        ),
    )
    return _run_ai("tutor", prompt, payload)


@router.post("/star")
def star(payload: StarPayload) -> dict:
    """A reference answer in STAR form, a simpler / second-example rewrite of the one the learner has, or the Python code of it."""
    # A rewrite needs the answer it rewrites; the code of the answer follows it when there is one, and works without.
    if payload.variant not in ("generate", "code") and not js_trim(payload.existing_answer):
        raise HTTPException(status_code=422, detail="existing_answer is required")
    prompt = build_star_prompt(
        _ctx(payload),
        StarInput(
            question=_question(payload),
            pos=_pos(payload),
            explanation=payload.explanation,
            exercise_prompt=payload.exercise_prompt,
            variant=payload.variant,
            existing_answer=payload.existing_answer,
        ),
    )
    return _run_ai("star", prompt, payload)
