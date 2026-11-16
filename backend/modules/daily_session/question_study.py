"""Prompts and normalisation for per-question study content (Question Review). No I/O, so it is easy to test.

Three kinds, generated on demand and kept per user (question_study table, see schema.py):
  quick      Quick review: digestible notes for reading on the move or when short on time.
  breakdown  Breakdown: the question cut into small reading lessons, one idea each, to learn gradually.
  deep       Dive deep: further sections for the curious; one section at a time can be extended a level deeper.

Numbers are never taken from the model: `read_minutes` is computed from the word count here, and `depth` / `done`
are set by the server.

Twin: frontend/fe-apis/dailySession/questionStudy.ts. The prompts must stay byte-identical across the pair, and
the normalisation must match, so change both together (CLAUDE.md, "Dual deployment modes").
"""

from __future__ import annotations

import json
import math
import re
from typing import Any, Iterable, List, Optional

from modules.daily_session.tutor_memory import memory_block

STUDY_KINDS = ("quick", "breakdown", "deep")
STUDY_LABELS = {"quick": "quick review", "breakdown": "breakdown", "deep": "deep dive"}
STUDY_MAX_TOKENS = {"quick": 1500, "breakdown": 3500, "deep": 4500}
EXPAND_MAX_TOKENS = 1500

MAX_KEY_POINTS = 6
MAX_PITFALLS = 4
MAX_CHUNKS = 8
MAX_SECTIONS = 7
MAX_FURTHER = 5
MAX_DEPTH = 3
WORDS_PER_MINUTE = 200

_QUESTION_CHARS = 3000
_ANSWER_CHARS = 4000
_SECTION_BODY_CHARS = 6000

_CATEGORY_LABELS = {
    "interview": "Interview (technical or behavioural)",
    "cv_skill": "Computer Vision / ML",
}

_WRAPPING_FENCE = re.compile(r"^\s*```(?:markdown|md)?\s*\n(.*)\n```\s*$", re.DOTALL | re.IGNORECASE)


# ── Prompts ───────────────────────────────────────────────────────────────────


def _question_block(question_text: str, category: str, sub_type: str, topics: Iterable[str], difficulty: str) -> str:
    details = []
    label = _CATEGORY_LABELS.get(category, category.strip())
    if label:
        details.append(f"Category: {label}")
    if sub_type.strip():
        details.append(f"Question type: {sub_type.strip()}")
    topic_list = [t.strip() for t in topics if t and t.strip()]
    if topic_list:
        details.append("Topics: " + ", ".join(topic_list))
    if difficulty.strip():
        details.append(f"Difficulty: {difficulty.strip()}")
    detail_block = ("\n" + "\n".join(details)) if details else ""
    question = question_text.strip()[:_QUESTION_CHARS]
    return f'The learner is preparing to answer this interview question:\n"""\n{question}\n"""{detail_block}'


_TASKS = {
    "quick": (
        "You are a senior interview coach writing study notes for an interview prep app. The learner reads them on a "
        "phone, often while travelling or short on time.",
        "Write a QUICK REVIEW of what someone needs to know to answer this question well: the core idea in plain "
        "words, the handful of points a strong answer covers, the one thing to remember, and the mistakes people make.",
        " Lean on the gaps in the learner's answer: make sure the key points and pitfalls cover what it gets wrong or "
        "leaves out, without quoting it or mentioning that the learner wrote it.",
        "Style: plain, concrete, short sentences that read well on a phone. No filler, no greetings, no \"in this "
        "review\". Use the exact terms of the field and explain each one the first time. Plain text in every field: "
        "no markdown, no bullets inside the strings.",
        '{"title": "a short title, at most 8 words", "summary": "2-4 sentences: the core idea", "key_points": '
        '["3-6 points, one sentence each"], "remember": "one sentence to remember", "pitfalls": ["1-4 common '
        'mistakes, one sentence each"]}',
    ),
    "breakdown": (
        "You are a senior interview coach writing a short reading course for an interview prep app. The learner reads "
        "one small lesson at a time on a phone, learning the topic gradually.",
        "Break what someone needs to know to answer this question well into 3-8 small lessons (\"chunks\"), ordered "
        "from the basics to applying them to this exact question. One idea per chunk. Each body is 80-160 words of "
        'markdown (short paragraphs, "- " bullets and **bold** key terms are fine; no headings, no tables). Each chunk '
        'has one self-check question ("check") the learner can answer in their head.',
        " Lean on the gaps in the learner's answer: give extra room to what it gets wrong or leaves out, without "
        "quoting it or mentioning that the learner wrote it.",
        "Style: plain, concrete, phone-readable sentences. No filler, no greetings, no \"in this lesson\". Explain each "
        "term the first time it appears. Inside the JSON strings, write line breaks as \\n.",
        '{"chunks": [{"title": "short title", "body": "markdown, 80-160 words", "check": "one self-check question"}]}',
    ),
    "deep": (
        "You are a senior engineer writing a deep dive for a curious learner in an interview prep app. It goes well "
        "past what the interview itself needs.",
        "Write a DEEP DIVE on the ideas behind this question in 3-7 sections, each building on the last: how it really "
        "works underneath, why it was designed that way, the trade-offs and where they break at scale or in "
        "production, related ideas and current practice, and what senior people know that juniors miss. Each body is "
        '120-250 words of markdown (short paragraphs, "- " bullets, **bold** key terms and `inline code` are fine; no '
        'headings, no tables). Then list up to 5 follow-up topics worth reading next ("further").',
        " Where it helps, go past what the learner's answer covers, without quoting it or mentioning that the learner "
        "wrote it.",
        "Style: plain, concrete sentences. No filler, no greetings. Be accurate, and say so when something is debated "
        "or depends on the system. Inside the JSON strings, write line breaks as \\n.",
        '{"sections": [{"heading": "short heading", "body": "markdown, 120-250 words"}], "further": ["a follow-up '
        'topic"]}',
    ),
}


def build_study_prompt(
    *,
    kind: str,
    question_text: str,
    category: str,
    sub_type: str,
    topics: Iterable[str],
    difficulty: str,
    answer: str,
    memory: Iterable[str] = (),
) -> str:
    # `memory`: memory_lines() for this user and the question's sub_type (tutor_memory.py); empty = left out.
    role, task, gaps, style, shape = _TASKS[kind]
    context = _question_block(question_text, category, sub_type, topics, difficulty)
    written = answer.strip()[:_ANSWER_CHARS]
    if written:
        context += f'\n\nThe learner has written this answer to the interview question:\n"""\n{written}\n"""'
    else:
        gaps = ""
    return f"""{role}

{context}

{task}{gaps}{memory_block(list(memory), kind)}

{style}

Respond with ONLY a JSON object, no text outside it, shaped exactly:
{shape}"""


def build_expand_prompt(
    *,
    question_text: str,
    category: str,
    sub_type: str,
    topics: Iterable[str],
    difficulty: str,
    headings: List[str],
    section: int,
    body: str,
    next_depth: int,
) -> str:
    context = _question_block(question_text, category, sub_type, topics, difficulty)
    outline = "\n".join(f"{i + 1}. {h}" for i, h in enumerate(headings))
    current = body.strip()[-_SECTION_BODY_CHARS:]
    return f"""You are a senior engineer extending a deep dive for a curious learner in an interview prep app.

{context}

The deep dive has these sections:
{outline}

Extend section {section + 1}, "{headings[section]}". What it says so far:
\"\"\"
{current}
\"\"\"

Write the next, deeper layer of this section (level {next_depth} of {MAX_DEPTH}): go one level further underneath, with the mechanism, a concrete worked example or small numbers, edge cases, and what changes at scale or in production. Do not repeat what it already says, do not restate the heading, and stay on this section's subject. 100-200 words of markdown (short paragraphs, "- " bullets, **bold** key terms and `inline code` are fine; no headings, no tables).

Style: plain, concrete sentences. No filler, no preamble.

Respond with ONLY the markdown of the new layer, no text before or after it."""


# ── Normalising the model's reply (never trust its shape or its numbers) ──────


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _texts(value: Any, cap: int) -> List[str]:
    if not isinstance(value, list):
        return []
    out = [v.strip() for v in value if isinstance(v, str) and v.strip()]
    return out[:cap]


def _items(value: Any) -> List[dict]:
    return [v for v in value if isinstance(v, dict)] if isinstance(value, list) else []


def read_minutes(summary: str, key_points: List[str], remember: str, pitfalls: List[str]) -> int:
    """ceil(words / 200), at least 1, over everything the quick review shows."""
    words = len(" ".join([summary, *key_points, remember, *pitfalls]).split())
    return max(1, math.ceil(words / WORDS_PER_MINUTE))


def normalize_study(kind: str, raw: Any) -> Optional[dict]:
    """The stored content for `kind` (without `kind` / `updated_at`), or None when nothing usable came back."""
    if not isinstance(raw, dict):
        return None
    if kind == "quick":
        summary = _text(raw.get("summary"))
        key_points = _texts(raw.get("key_points"), MAX_KEY_POINTS)
        if not summary and not key_points:
            return None
        remember = _text(raw.get("remember"))
        pitfalls = _texts(raw.get("pitfalls"), MAX_PITFALLS)
        return {
            "title": _text(raw.get("title")),
            "read_minutes": read_minutes(summary, key_points, remember, pitfalls),
            "summary": summary,
            "key_points": key_points,
            "remember": remember,
            "pitfalls": pitfalls,
        }
    if kind == "breakdown":
        chunks = []
        for c in _items(raw.get("chunks")):
            title, body = _text(c.get("title")), _text(c.get("body"))
            if title and body:
                chunks.append({"title": title, "body": body, "check": _text(c.get("check"))})
        chunks = chunks[:MAX_CHUNKS]
        return {"chunks": chunks, "done": []} if chunks else None
    if kind == "deep":
        sections = []
        for s in _items(raw.get("sections")):
            heading, body = _text(s.get("heading")), _text(s.get("body"))
            if heading and body:
                sections.append({"heading": heading, "body": body, "depth": 1})
        sections = sections[:MAX_SECTIONS]
        if not sections:
            return None
        return {"sections": sections, "further": _texts(raw.get("further"), MAX_FURTHER)}
    return None


_RAW_IN_STRING = {"\n": "\\n", "\r": "\\r", "\t": "\\t"}


def parse_study_reply(text: str) -> Any:
    """The JSON object in the reply: from the first '{' to the last '}' (fences and chatter around it are ignored).

    Markdown bodies tempt models into raw line breaks inside JSON strings, which strict JSON rejects, so those are
    escaped first. Not the shared extract_json_object: its TypeScript twin drops every backtick, `inline code` too.
    """
    t = text or ""
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end < start:
        raise ValueError("No JSON object found in response")
    out = []
    in_string = escaped = False
    for ch in t[start : end + 1]:
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            elif ch in _RAW_IN_STRING:
                ch = _RAW_IN_STRING[ch]
        elif ch == '"':
            in_string = True
        out.append(ch)
    return json.loads("".join(out))


def clean_layer(text: str) -> str:
    """Models sometimes wrap the whole reply in a ```markdown fence despite being told not to."""
    text = (text or "").strip()
    m = _WRAPPING_FENCE.match(text)
    return (m.group(1) if m else text).strip()


def as_index(value: Any) -> Optional[int]:
    """A JSON whole number as an int (1.0 counts, like JavaScript sees it); anything else is None."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None
