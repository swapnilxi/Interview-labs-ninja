"""AI answer evaluation + expansion for practice / daily-session answers.

The rubric lives here (not in the prompt alone) so the overall score is computed
deterministically from per-criterion scores instead of trusting the model's arithmetic.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel

from modules.common.ai import AISettings, call_ai_text, extract_json_array, extract_json_object

# kind -> [(criterion key, label, weight, what a 5/5 looks like)]. Weights sum to 100.
RUBRICS: Dict[str, List[tuple]] = {
    "dsa": [
        ("understanding", "Problem understanding & edge cases", 15, "restates the problem, asks/assumes constraints, names edge cases (empty, duplicates, overflow, sorted/unsorted)"),
        ("approach", "Approach & algorithm choice", 25, "starts from brute force, reaches the optimal approach, justifies the data structure"),
        ("correctness", "Correctness of logic / code", 25, "logic and code are correct on normal and edge inputs with no off-by-one or state bugs"),
        ("complexity", "Complexity analysis", 15, "states correct time AND space complexity and why"),
        ("code_quality", "Code quality", 10, "clean, idiomatic, readable names, no dead code"),
        ("communication", "Communication", 10, "structured: approach, then code, then test/trace"),
    ],
    "system_design": [
        ("requirements", "Requirements & scale estimates", 20, "separates functional/non-functional requirements and sizes QPS, storage, bandwidth"),
        ("architecture", "High-level architecture", 20, "coherent components and data flow that actually meet the requirements"),
        ("data_api", "Data model & APIs", 15, "sensible schema/storage choice and core API shapes, justified"),
        ("scalability", "Scalability & bottlenecks", 20, "identifies the real bottlenecks and how to scale them (sharding, caching, queues)"),
        ("tradeoffs", "Trade-offs & reliability", 15, "names consistency/availability/latency/cost trade-offs and failure handling"),
        ("communication", "Communication", 10, "top-down, prioritised, drives the discussion"),
    ],
    "debugging": [
        ("hypotheses", "Hypothesis generation", 20, "lists plausible causes ranked by likelihood from the symptoms given"),
        ("diagnosis", "Systematic diagnosis", 25, "concrete steps/tools/metrics to isolate the cause, narrowing methodically"),
        ("root_cause", "Root-cause accuracy", 25, "identifies the true underlying mechanism, not just the symptom"),
        ("fix", "Fix & prevention", 20, "a safe fix, rollout/mitigation, and guardrails (tests, alerts) to prevent recurrence"),
        ("communication", "Communication", 10, "clear, calm, structured incident-style narration"),
    ],
    "behavioral": [
        ("situation", "Situation & stakes", 15, "specific, concise context with real stakes (STAR: Situation/Task)"),
        ("action", "Ownership & specific actions", 30, "'I' not 'we'; concrete decisions, reasoning, and obstacles handled"),
        ("result", "Result & impact", 25, "measurable outcome, with numbers where possible"),
        ("reflection", "Reflection & learning", 20, "what they would do differently and what changed afterwards"),
        ("communication", "Communication", 10, "2-3 minutes, no rambling, strong opening and close"),
    ],
    "cv_ml": [
        ("accuracy", "Conceptual accuracy", 30, "every technical statement is correct"),
        ("depth", "Depth & mechanism", 25, "explains WHY it works: maths/intuition/mechanism, not just names"),
        ("tradeoffs", "Trade-offs & alternatives", 20, "compares alternatives and says when each wins or fails"),
        ("practical", "Practical application", 15, "real-world constraints: data, latency, deployment, failure modes"),
        ("communication", "Communication", 10, "clear, ordered, defines terms"),
    ],
}

KIND_TITLES = {
    "dsa": "Data Structures & Algorithms",
    "system_design": "System Design",
    "debugging": "Production debugging scenario",
    "behavioral": "Behavioral / leadership",
    "cv_ml": "Computer Vision / ML",
}


def detect_kind(sub_type: Optional[str], category: Optional[str], question_text: str = "") -> str:
    st = (sub_type or "").lower()
    if "system design" in st:
        return "system_design"
    if "data structure" in st or "algorithm" in st or st == "dsa":
        return "dsa"
    if "bug" in st or "debug" in st:
        return "debugging"
    if "leadership" in st or "behav" in st:
        return "behavioral"
    if (category or "").lower() in ("cv_skill", "cv"):
        return "cv_ml"
    q = question_text.lower()
    if any(w in q for w in ("design a", "design an", "architecture")):
        return "system_design"
    if any(w in q for w in ("implement", "time complexity", "array", "string", "tree", "graph")):
        return "dsa"
    return "cv_ml"


def wants_code(kind: str) -> bool:
    """Kinds that get a code/diagram space in the UI."""
    return kind in ("dsa", "system_design")


class EvaluateRequest(AISettings):
    question_text: str
    answer_text: str = ""
    code_text: Optional[str] = None
    language: Optional[str] = None
    category: Optional[str] = None
    sub_type: Optional[str] = None
    difficulty: Optional[str] = None
    # True when answer_text is an tutor/learner chat transcript rather than a written answer.
    is_transcript: bool = False


class ExpandRequest(AISettings):
    question_text: str
    answer_text: str = ""
    code_text: Optional[str] = None
    language: Optional[str] = None
    category: Optional[str] = None
    sub_type: Optional[str] = None
    difficulty: Optional[str] = None


_ACCURACY_RULES = """ACCURACY RULES (these matter more than anything else):
- Be correct above all. State only what you are confident is true. Never invent facts, benchmarks, library behaviour or numbers.
- Work through the problem yourself first (in "scratch"), derive the right answer / complexity, and only then judge the candidate against it.
- If the candidate says something wrong, say it is wrong and give the correct statement. If they are right, do not nitpick.
- Do not claim code was run or tests passed; you can only reason about it. Trace it by hand on at least one normal and one edge input.
- If something genuinely depends on assumptions or is debatable, say so explicitly instead of picking a side silently.
- Judge only what the candidate wrote. Do not credit points they did not make."""


def _candidate_block(req) -> str:
    if getattr(req, "is_transcript", False):
        parts = [
            "Learning-conversation transcript (judge ONLY the Learner's lines; Tutor lines are context. "
            "Credit depth reached under follow-up questions, and note where the learner needed hints):\n"
            + (req.answer_text.strip() or "(empty)")
        ]
    else:
        parts = [f"Candidate's written answer:\n{req.answer_text.strip() or '(empty)'}"]
    if (req.code_text or "").strip():
        lang = req.language or "unspecified language"
        parts.append(f"Candidate's code / design sketch ({lang}):\n```\n{req.code_text.strip()}\n```")
    return "\n\n".join(parts)


def build_evaluation_prompt(req: EvaluateRequest, kind: str) -> str:
    rubric_lines = "\n".join(
        f'- "{key}" ({label}, weight {w}): 5/5 means the candidate {desc}.' for key, label, w, desc in RUBRICS[kind]
    )
    keys = ", ".join(f'"{k}"' for k, *_ in RUBRICS[kind])
    return f"""You are a rigorous, fair, and encouraging senior interviewer coaching a candidate.
Question type: {KIND_TITLES[kind]}   Difficulty: {req.difficulty or 'unspecified'}

Question:
{req.question_text}

{_candidate_block(req)}

Score each rubric criterion from 0 to 5 (integers; 0 = absent, 3 = acceptable, 5 = excellent):
{rubric_lines}

{_ACCURACY_RULES}

Return ONLY one JSON object with exactly these keys:
{{
  "scratch": "your own brief working: the correct approach/answer and any complexity derivation",
  "criteria": [{{"key": one of [{keys}], "score": 0-5, "comment": "1-2 sentences citing what the candidate actually wrote", "improve": "one concrete way to reach the next score"}}, ... one entry per criterion],
  "strengths": ["specific things done well"],
  "factual_issues": [{{"claim": "what the candidate said", "correction": "what is actually true", "severity": "minor|major"}}],
  "missing": ["important points absent from the answer"],
  "improvements": ["ordered, actionable steps, highest impact first"],
  "better_answer": "a stronger version of THEIR answer in markdown: keep their correct ideas and structure, fix errors, add what is missing. For code questions include corrected, complete code in a fenced block with its complexity.",
  "follow_ups": ["2-3 follow-up questions an interviewer would likely ask next"],
  "confidence_notes": "anything you are unsure about or that depends on assumptions, else empty string"
}}
If the answer is already excellent, say so, keep "improvements" short, and still add one stretch suggestion."""


def build_expand_prompt(req: ExpandRequest, kind: str) -> str:
    return f"""You are a senior interviewer helping a candidate turn a rough draft into a complete, interview-ready answer.
Question type: {KIND_TITLES[kind]}   Difficulty: {req.difficulty or 'unspecified'}

Question:
{req.question_text}

{_candidate_block(req)}

Expand the candidate's draft into a strong, complete answer:
- Keep THEIR ideas, voice and structure; build on them rather than replacing them.
- Correct anything wrong and list each correction.
- Add what is missing for this question type ({KIND_TITLES[kind]}): for DSA brute force -> optimal approach, correct code, complexity, edge cases; for system design requirements, estimates, architecture, data model, bottlenecks, trade-offs; for debugging hypotheses, diagnosis steps, root cause, fix, prevention; for behavioral STAR with a measurable result; for CV/ML mechanism, maths, trade-offs, practice.
- If the draft is empty, write a model answer from scratch and say so in "summary".

{_ACCURACY_RULES}

Return ONLY one JSON object with exactly these keys:
{{
  "scratch": "your own brief working to get the facts right",
  "summary": "one sentence on what you changed",
  "expanded_answer": "the full expanded answer in markdown (code in fenced blocks where relevant)",
  "added_points": ["short list of the ideas you added"],
  "corrections": [{{"claim": "what the draft said", "correction": "what is true"}}],
  "confidence_notes": "assumptions or uncertainty, else empty string"
}}"""


def _as_list(v) -> List:
    return v if isinstance(v, list) else []


def _s(v) -> str:
    return v.strip() if isinstance(v, str) else ""


def _level(score: int) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Strong"
    if score >= 50:
        return "Developing"
    return "Needs work"


def evaluate_answer(req: EvaluateRequest) -> dict:
    kind = detect_kind(req.sub_type, req.category, req.question_text)
    raw = call_ai_text(build_evaluation_prompt(req, kind), req, max_tokens=4096)
    data = extract_json_object(raw)

    by_key = {c.get("key"): c for c in _as_list(data.get("criteria")) if isinstance(c, dict)}
    criteria, total = [], 0.0
    for key, label, weight, _ in RUBRICS[kind]:
        c = by_key.get(key, {})
        try:
            score = max(0, min(5, int(round(float(c.get("score", 0))))))
        except (TypeError, ValueError):
            score = 0
        total += score / 5 * weight
        criteria.append(
            {"key": key, "label": label, "weight": weight, "score": score, "comment": _s(c.get("comment")), "improve": _s(c.get("improve"))}
        )
    overall = int(round(total))

    issues = []
    for i in _as_list(data.get("factual_issues")):
        if isinstance(i, dict) and _s(i.get("claim")):
            issues.append(
                {"claim": _s(i.get("claim")), "correction": _s(i.get("correction")), "severity": "major" if i.get("severity") == "major" else "minor"}
            )

    return {
        "kind": kind,
        "overall": overall,
        "level": _level(overall),
        "criteria": criteria,
        "strengths": [_s(x) for x in _as_list(data.get("strengths")) if _s(x)],
        "factual_issues": issues,
        "missing": [_s(x) for x in _as_list(data.get("missing")) if _s(x)],
        "improvements": [_s(x) for x in _as_list(data.get("improvements")) if _s(x)],
        "better_answer": _s(data.get("better_answer")),
        "follow_ups": [_s(x) for x in _as_list(data.get("follow_ups")) if _s(x)],
        "confidence_notes": _s(data.get("confidence_notes")),
    }


def expand_answer(req: ExpandRequest) -> dict:
    kind = detect_kind(req.sub_type, req.category, req.question_text)
    raw = call_ai_text(build_expand_prompt(req, kind), req, max_tokens=4096)
    data = extract_json_object(raw)
    corrections = [
        {"claim": _s(c.get("claim")), "correction": _s(c.get("correction"))}
        for c in _as_list(data.get("corrections"))
        if isinstance(c, dict) and _s(c.get("claim"))
    ]
    return {
        "kind": kind,
        "summary": _s(data.get("summary")),
        "expanded_answer": _s(data.get("expanded_answer")),
        "added_points": [_s(x) for x in _as_list(data.get("added_points")) if _s(x)],
        "corrections": corrections,
        "confidence_notes": _s(data.get("confidence_notes")),
    }


# ── AI Learn Chat: Socratic tutoring, in depth ─────────────────────────────────

TUTORS = {
    "dsa": ("Arjun", "algorithms tutor"),
    "system_design": ("Meera", "systems architecture tutor"),
    "debugging": ("Dev", "production-debugging tutor"),
    "behavioral": ("Sam", "engineering-leadership mentor"),
    "cv_ml": ("Dr. Anika", "computer vision & ML tutor"),
}

MAX_LEARNER_TURNS = 10


class ChatMessage(BaseModel):
    role: str  # "tutor" | "learner"
    content: str


class LearnChatRequest(AISettings):
    question_text: str
    messages: List[ChatMessage] = []
    category: Optional[str] = None
    sub_type: Optional[str] = None
    difficulty: Optional[str] = None
    max_turns: int = MAX_LEARNER_TURNS


def build_learn_prompt(req: LearnChatRequest, kind: str, learner_turns: int, force_wrap: bool) -> str:
    name, role = TUTORS[kind]
    convo = "\n".join(
        f"{'Tutor' if m.role == 'tutor' else 'Learner'}: {m.content.strip()[:4000]}" for m in req.messages[-24:]
    ) or "(the session has not started)"
    if not req.messages:
        task = (
            "This is the very start. Greet the learner in one short sentence, say what you will explore together, then ask ONE "
            "opening question that finds out what they already know about the topic (do not lecture yet). "
            'Set "depth" to 1.'
        )
    elif force_wrap:
        task = (
            "We are out of time. Wrap up in 3-4 sentences: what the learner now understands well, the one or two ideas worth revisiting, "
            'and one thing to study next. Say they can end the session for a full review. Set "wrap_up" to true.'
        )
    else:
        task = (
            "Reply to the learner's last message. First acknowledge what they got right (be specific), then move the learning forward. "
            "Teach Socratically, one step at a time, and go progressively deeper, only moving up a level when they have the current one:\n"
            "  1 definitions & intuition -> 2 mechanism, WHY it works -> 3 edge cases & failure modes -> 4 trade-offs & alternatives -> 5 scale, real systems, extensions.\n"
            "If they are wrong or fuzzy, do not just correct them: ask a guiding question or give a tiny example so they can find the gap, and if they are still stuck after that, "
            "explain the idea clearly and briefly, then check understanding with a question. "
            "If they ask for an explanation or say they are stuck, teach: a short, clear explanation (an analogy or small worked example is welcome), then one question to check it landed. "
            "Wrap up if they say they are done or you have covered the topic in real depth. "
            f'The learner has sent {learner_turns} of at most {req.max_turns} messages.'
        )
    return f"""You are {name}, a patient, encouraging and rigorous {role} helping someone learn a topic in depth through conversation. This is for learning, not assessment: never grade, rank or pressure the learner.
Topic being explored ({KIND_TITLES[kind]}, level {req.difficulty or 'unspecified'}), starting from this question:
{req.question_text}

Conversation so far:
{convo}

YOUR TASK: {task}

STYLE RULES:
- Talk like a good human teacher: plain, warm, concise. At most 5 short sentences per turn plus ONE question (an explanation turn may run a little longer). No headings.
- You may use a short code snippet in a fenced block when it genuinely teaches; otherwise no markdown lists.
- Ask ONE question per turn and do not repeat one already asked.

{_ACCURACY_RULES}
- Everything you teach must be true. Prefer saying "it depends on X" over overstating. If you are not sure, say so.

Return ONLY one JSON object: {{"message": "what you say", "depth": 1-5, "focus": "2-4 word concept you are exploring", "wrap_up": true|false}}"""


def learn_turn(req: LearnChatRequest) -> dict:
    kind = detect_kind(req.sub_type, req.category, req.question_text)
    learner_turns = sum(1 for m in req.messages if m.role == "learner")
    force_wrap = learner_turns >= req.max_turns
    raw = call_ai_text(build_learn_prompt(req, kind, learner_turns, force_wrap), req, max_tokens=1536)
    try:
        data = extract_json_object(raw)
        message = _s(data.get("message"))
    except Exception:
        data, message = {}, raw.strip()  # model ignored the JSON format; use its text as-is
    if not message:
        raise ValueError("The tutor returned an empty reply")
    try:
        depth = max(1, min(5, int(data.get("depth", 1))))
    except (TypeError, ValueError):
        depth = 1
    name, role = TUTORS[kind]
    return {
        "tutor": {"name": name, "role": role},
        "message": message,
        "depth": depth,
        "focus": _s(data.get("focus")),
        "wrap_up": bool(data.get("wrap_up")) or force_wrap,
        "learner_turns": learner_turns,
        "max_turns": req.max_turns,
    }


# ── Flashcard import: AI conversion of arbitrary text ────────────────────────────

class ConvertFlashcardsRequest(AISettings):
    text: str


_CONVERT_CHUNK = 10000
_CONVERT_MAX_CHUNKS = 4


def _chunks(text: str) -> List[str]:
    out, cur = [], ""
    for line in text.splitlines(keepends=True):
        if cur and len(cur) + len(line) > _CONVERT_CHUNK:
            out.append(cur)
            cur = ""
        cur += line
    if cur.strip():
        out.append(cur)
    return out


def build_convert_prompt(chunk: str) -> str:
    return f"""Convert the study material below into flashcards. You are restructuring, NOT writing new content.

RULES:
- Use ONLY what is in the source text. Do not add facts, fix facts, or write answers that are not in the source. Keep the author's wording (you may trim whitespace and markup).
- One card per question/prompt that has an answer in the source. If a question has no answer in the source, leave it out.
- Fields per card: "question" (required), "answer" (required), and, only when the source clearly has them: "topic", "title", "formula", "example", "remember" (list of short strings), "difficulty" ("Easy"|"Medium"|"Hard"), "id".
- If the source is plain notes with no questions, you may phrase a natural question from a heading or term, using the source text as the answer.
- Return ONLY a JSON array of card objects. If there is nothing usable, return [].

SOURCE:
{chunk}"""


def convert_flashcards(req: ConvertFlashcardsRequest) -> dict:
    text = req.text.strip()
    if not text:
        raise ValueError("Nothing to convert")
    parts = _chunks(text)
    truncated = len(parts) > _CONVERT_MAX_CHUNKS
    cards, errors, last_err = [], 0, ""
    for part in parts[:_CONVERT_MAX_CHUNKS]:
        try:
            raw = call_ai_text(build_convert_prompt(part), req, max_tokens=4096)
            items = extract_json_array(raw)
        except Exception as exc:
            errors += 1
            last_err = str(exc)
            continue
        for it in items:
            if not isinstance(it, dict):
                continue
            q, a = _s(it.get("question")), _s(it.get("answer"))
            if not q or not a:
                continue
            rem = it.get("remember")
            cards.append({
                "question": q,
                "answer": a,
                "topic": _s(it.get("topic")),
                "title": _s(it.get("title")),
                "formula": _s(it.get("formula")),
                "example": _s(it.get("example")),
                "remember": [_s(x) for x in rem if _s(x)] if isinstance(rem, list) else [],
                "difficulty": _s(it.get("difficulty")),
                "id": _s(str(it.get("id", ""))),
            })
    if not cards and errors == len(parts[:_CONVERT_MAX_CHUNKS]):
        raise ValueError(last_err or "The AI could not process that text")
    return {"cards": cards, "truncated": truncated, "failed_chunks": errors}
