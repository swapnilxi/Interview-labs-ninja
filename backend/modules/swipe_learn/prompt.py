"""SwipeLearn card prompt: request normalization + the prompt text.

Twin: frontend/src/modules/swipe-learn/services/cardPrompt.ts (used by the browser's direct Gemini path and by
fe-apis/swipeLearn in nextjs-api mode). The normalization rules and every prompt string must stay byte-identical
across the pair, so change both. Randomness (the angles and the seed) is picked by the client and sent in the
request, which keeps both builders deterministic and comparable.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

MAX_CARD_COUNT = 10
DEFAULT_CARD_COUNT = 5
# Titles listed under "already in the deck" (newest first).
MAX_AVOID_TITLES = 150
_MAX_TOPIC_REFS = 20
_MAX_ANGLES = 10

_FORMATS = (
    "quick-concept",
    "code-example",
    "interview-question",
    "quiz",
    "advanced-concept",
    "recent-dev",
    "random",
)
_DIFFICULTIES = ("beginner", "intermediate", "advanced", "any")
_DEPTH_KEYS = ("howItWorks", "architecture", "example", "commonMistakes", "interviewQuestion")


class CardRequestError(ValueError):
    """A request the server can't use (answered with a 422)."""


@dataclass
class TopicRef:
    id: str
    label: str


@dataclass
class AboutCard:
    title: str
    hook: str
    content: str
    code: str
    depth: List[str]


@dataclass
class CardPromptRequest:
    topic: TopicRef
    mixed_topics: List[TopicRef] = field(default_factory=list)
    sub_categories: List[TopicRef] = field(default_factory=list)
    sub_category: Optional[TopicRef] = None
    format: str = "random"
    count: int = DEFAULT_CARD_COUNT
    focus: str = ""
    difficulty: str = "any"
    about_card: Optional[AboutCard] = None
    avoid_titles: List[str] = field(default_factory=list)
    angles: List[str] = field(default_factory=list)
    seed: Optional[int] = None


# ── Normalization ───────────────────────────────────────────────────────────


def _cut(value: Any, limit: int) -> str:
    """Trim, then cut to `limit` characters."""
    if not isinstance(value, str):
        return ""
    s = value.strip()
    return s if len(s) <= limit else s[:limit].strip()


def _topic_ref(value: Any) -> Optional[TopicRef]:
    if not isinstance(value, dict):
        return None
    ref_id = _cut(value.get("id"), 60)
    if not ref_id:
        return None
    return TopicRef(id=ref_id, label=_cut(value.get("label"), 80) or ref_id)


def _topic_refs(value: Any) -> List[TopicRef]:
    if not isinstance(value, list):
        return []
    out: List[TopicRef] = []
    for item in value:
        ref = _topic_ref(item)
        if ref and not any(r.id == ref.id for r in out):
            out.append(ref)
        if len(out) >= _MAX_TOPIC_REFS:
            break
    return out


def _string_list(value: Any, max_items: int, max_chars: int) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    seen: set = set()
    for item in value:
        s = _cut(item, max_chars)
        if not s or s.lower() in seen:
            continue
        seen.add(s.lower())
        out.append(s)
        if len(out) >= max_items:
            break
    return out


def _whole_number(value: Any) -> Optional[int]:
    """A JSON number (not a bool) rounded half up; anything else is None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return math.floor(value + 0.5)


def _about_card(value: Any) -> Optional[AboutCard]:
    if not isinstance(value, dict):
        return None
    title = _cut(value.get("title"), 80)
    content = _cut(value.get("content"), 400)
    if not title or not content:
        return None
    code_raw = value.get("code")
    code = _cut(code_raw.get("code"), 1200) if isinstance(code_raw, dict) else ""
    depth_raw = value.get("depth") if isinstance(value.get("depth"), dict) else {}
    depth = [d for d in (_cut(depth_raw.get(k), 420) for k in _DEPTH_KEYS) if d]
    return AboutCard(title=title, hook=_cut(value.get("hook"), 120), content=content, code=code, depth=depth)


def normalize_card_request(raw: Any) -> CardPromptRequest:
    """Turns a raw request body into a clean CardPromptRequest. Raises CardRequestError when there is no topic."""
    if not isinstance(raw, dict):
        raise CardRequestError("The request body must be a JSON object.")
    topic = _topic_ref(raw.get("topic"))
    if topic is None:
        raise CardRequestError("topic: an object with an id is required.")
    fmt = raw.get("format") if raw.get("format") in _FORMATS else "random"
    count = _whole_number(raw.get("count"))
    seed = _whole_number(raw.get("seed"))
    return CardPromptRequest(
        topic=topic,
        mixed_topics=_topic_refs(raw.get("mixedTopics")),
        sub_categories=_topic_refs(raw.get("subCategories")),
        sub_category=_topic_ref(raw.get("subCategory")),
        format=fmt,
        count=DEFAULT_CARD_COUNT if count is None else min(max(count, 1), MAX_CARD_COUNT),
        focus=_cut(raw.get("focus"), 300),
        difficulty=raw.get("difficulty") if raw.get("difficulty") in _DIFFICULTIES else "any",
        about_card=_about_card(raw.get("aboutCard")),
        avoid_titles=_string_list(raw.get("avoidTitles"), MAX_AVOID_TITLES, 80),
        angles=_string_list(raw.get("angles"), _MAX_ANGLES, 120),
        seed=seed if seed is not None and 0 <= seed <= 999999 else None,
    )


# ── Prompt ──────────────────────────────────────────────────────────────────

_FORMAT_INSTRUCTIONS: Dict[str, str] = {
    "quick-concept": (
        'Concept cards (type "concept"): one crisp idea each, with the intuition behind it and a filled-in depth section.'
    ),
    "code-example": (
        'Code cards (type "code"): a short, practical, runnable snippet in the language that fits the topic (Python unless the topic implies another), plus a one-line explanation of why it works.'
    ),
    "interview-question": (
        'Interview cards (type "case-study"): the title is a realistic interview question; the content is the gist of a strong answer with the key trade-off; depth.interviewQuestion is a likely follow-up.'
    ),
    "quiz": (
        'Quiz cards (type "quiz"): the content sets the question up in one line; the quiz has 4 plausible options with exactly one correct, and the correct position varies across the batch.'
    ),
    "advanced-concept": (
        'Advanced cards: internals, performance gotchas and edge cases that experienced engineers still get wrong. Difficulty is "advanced".'
    ),
    "recent-dev": (
        'What\'s-new cards (type "fact"): notable releases, standards or shifts from the last two years that you are certain are real; name the year. Leave out anything you are unsure happened.'
    ),
    "random": (
        "A mix of card types (concept, code, quiz, tip, case-study), whichever teaches each idea best. Include at least one quiz when the batch has 3 or more cards."
    ),
}


def build_card_prompt(req: CardPromptRequest) -> str:
    lines: List[str] = [
        "You write cards for SwipeLearn, a mobile micro-learning feed: each card teaches one specific, accurate, useful idea in under 30 seconds of reading.",
        "",
    ]

    if req.topic.id == "mixed" and req.mixed_topics:
        lines.append(
            "Topics: spread the cards across these, and set each card's \"topic\" to the id: "
            + ", ".join(f"{t.id} ({t.label})" for t in req.mixed_topics)
            + "."
        )
    elif req.topic.id == "quiz":
        lines.append(
            "Topic: a cross-topic quiz deck. Draw on Python, computer vision, finance, AI and interview prep unless a focus is given below."
        )
    else:
        lines.append(f"Topic: {req.topic.label}")
    if req.sub_category:
        lines.append(
            f'Sub-category: {req.sub_category.label} (set every card\'s "subCategory" to "{req.sub_category.id}")'
        )
    elif req.sub_categories:
        lines.append(
            "Sub-categories: set each card's \"subCategory\" to one of "
            + ", ".join(f'"{s.id}"' for s in req.sub_categories)
            + "."
        )
    if req.focus:
        lines.append(f"Focus: {req.focus}")
    if req.format == "advanced-concept":
        difficulty = "advanced"
    elif req.difficulty != "any":
        difficulty = req.difficulty
    else:
        difficulty = "a mix of beginner, intermediate and advanced"
    lines.append(f"Difficulty: {difficulty}")
    lines.append(f"Number of cards: exactly {req.count}")
    if req.seed is not None:
        lines.append(f"Variation seed: {req.seed}")
    lines.append("")

    if req.about_card:
        c = req.about_card
        lines.extend(
            [
                'The learner just read the card below. Write quiz cards (type "quiz") that check they understood it: test application and reasoning, not word-for-word recall, and never ask something the card does not support.',
                f"Card title: {c.title}",
                "Card text: " + " ".join(x for x in (c.hook, c.content) if x),
            ]
        )
        if c.code:
            lines.append(f"Card code:\n{c.code}")
        if c.depth:
            lines.append("Card details: " + " ".join(c.depth))
    else:
        lines.append(f"Card style: {_FORMAT_INSTRUCTIONS[req.format]}")
        if req.angles:
            lines.append("Angles: give each card a different one of these starting points: " + "; ".join(req.angles) + ".")

    if req.avoid_titles:
        lines.extend(
            [
                "",
                "Already in the deck. Each new card must teach a different idea from all of these; a reworded or slightly varied version of one counts as a repeat:",
                *(f"- {t}" for t in req.avoid_titles),
            ]
        )

    lines.extend(
        [
            "",
            "Rules:",
            "- Be correct. No invented statistics, versions, APIs or quotes; if unsure about an idea, pick another.",
            "- Prefer specific, useful ideas the learner is unlikely to have seen yet over the examples every tutorial starts with.",
            '- title: at most 60 characters and specific (never "Python Concept").',
            "- hook: at most 90 characters, a punchy line that makes someone stop scrolling.",
            "- content: at most 280 characters, the core insight in plain language.",
            "- code: only on code cards (at most 12 lines, idiomatic); otherwise null.",
            "- quiz: required on quiz cards, otherwise null. Exactly 4 options, one correct; correctAnswer is its 0-based index; explanation says why it is right.",
            "- depth: howItWorks, example, commonMistakes and interviewQuestion in one or two sentences each; architecture only when a flow or pipeline helps, else null.",
            "- Every card in the batch covers a different idea.",
            "",
            "Return JSON only, in this shape:",
            '{"cards":[{"title":"","hook":"","content":"","type":"concept|code|quiz|fact|tip|case-study","topic":"","subCategory":"","code":{"language":"","code":"","explanation":""},"quiz":{"question":"","options":["","","",""],"correctAnswer":0,"explanation":""},"depth":{"howItWorks":"","architecture":"","example":"","commonMistakes":"","interviewQuestion":""},"difficulty":"beginner|intermediate|advanced","estimatedReadTime":20,"tags":["",""]}]}',
        ]
    )
    return "\n".join(lines)
