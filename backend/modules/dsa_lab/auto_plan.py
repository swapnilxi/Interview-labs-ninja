"""Prompt + normaliser for the DSA week plan's AI auto organizer (POST /dsa/week-plan/auto).

Kept free of I/O so it is easy to test. The learner answers a few questions (timeline, questions per week,
level, goal, difficulty, week style, patterns to emphasise / that feel hard, notes) and the frontend sends
them with the lab's questions in learning order. The router validates that here, builds the prompt, calls the
model and runs the reply through normalize_auto_plan, which keeps only what fits: known ids, each once, weeks
1..weeks, at most `perWeek` (never more than WEEK_CAP) per week. The plan is returned, not saved; the frontend
stores it as a new plan profile.

`frontend/fe-apis/dsaLab/autoPlan.ts` is the Next.js twin: validation messages, the prompt (byte for byte) and
the normaliser must stay identical, so change both together.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from .week_plan import LABEL_MAX, MAX_WEEKS, SUMMARY_MAX, WEEK_CAP, has_lone_surrogate

MAX_PATTERNS = 20  # in answers.focus and answers.weak
PATTERN_MAX = 80
NOTES_MAX = 400
MAX_TOPICS = 400
TOPIC_TEXT_MAX = 200  # a topic's id and name
CATEGORY_MAX = 120
DIFFICULTY_MAX = 40

LEVEL_TEXT: Dict[str, str] = {
    "new": "new to DSA, needs the fundamentals first",
    "some": "knows the basics and is comfortable with arrays and hashing",
    "confident": "interview-ready, polishing and filling gaps",
}
GOAL_TEXT: Dict[str, str] = {
    "big-tech": "big-tech (FAANG-style) interviews",
    "product": "product-company interviews",
    "startup": "startup interviews",
    "general": "general problem-solving practice",
}
DIFFICULTY_TEXT: Dict[str, str] = {
    "gentle": "gentle: mostly Easy and Medium",
    "balanced": "balanced: mostly Medium with some Hard",
    "stretch": "stretch: plenty of Medium and Hard",
}
STYLE_TEXT: Dict[str, str] = {
    "focused": "focused: one or two related patterns per week",
    "mixed": "mixed: blend patterns within each week for interleaved practice",
}

# (answer key, allowed values in message order, default when absent)
_CHOICES: Tuple[Tuple[str, Tuple[str, ...], str], ...] = (
    ("level", tuple(LEVEL_TEXT), "some"),
    ("goal", tuple(GOAL_TEXT), "general"),
    ("difficulty", tuple(DIFFICULTY_TEXT), "balanced"),
    ("style", tuple(STYLE_TEXT), "focused"),
)

_TOPIC_PROBLEM = (
    "Every topic needs an id and a name (1-200 characters), a category (at most 120) and a difficulty (at most 40)."
)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _pattern_list(value: Any) -> Optional[List[str]]:
    """answers.focus / answers.weak, trimmed, in the given order; None when malformed. Absent = []."""
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > MAX_PATTERNS:
        return None
    out: List[str] = []
    for item in value:
        if not isinstance(item, str) or has_lone_surrogate(item) or not 1 <= len(item.strip()) <= PATTERN_MAX:
            return None
        out.append(item.strip())
    return out


def validate_auto_request(answers: Any, topics: Any) -> Tuple[Optional[str], Optional[dict]]:
    """(problem, None) for the first thing wrong with the request, else (None, {"answers": ..., "topics": ...})
    with defaults filled in and every string trimmed. "Absent" means missing or null."""
    if not isinstance(answers, dict):
        return "Field 'answers' must be an object.", None
    weeks = answers.get("weeks")
    if not _is_int(weeks) or not 1 <= weeks <= MAX_WEEKS:
        return f"Field 'answers.weeks' must be an integer from 1 to {MAX_WEEKS}.", None
    per_week = answers.get("perWeek")
    if not _is_int(per_week) or not 1 <= per_week <= WEEK_CAP:
        return f"Field 'answers.perWeek' must be an integer from 1 to {WEEK_CAP}.", None
    clean: Dict[str, Any] = {"weeks": weeks, "perWeek": per_week}
    for key, allowed, default in _CHOICES:
        value = answers.get(key)
        if value is None:
            value = default
        elif not isinstance(value, str) or value not in allowed:
            return f"Field 'answers.{key}' must be one of: {', '.join(allowed)}.", None
        clean[key] = value
    for key in ("focus", "weak"):
        patterns = _pattern_list(answers.get(key))
        if patterns is None:
            return (
                f"Field 'answers.{key}' must be a list of at most {MAX_PATTERNS} pattern names "
                f"(1-{PATTERN_MAX} characters each).",
                None,
            )
        clean[key] = patterns
    notes = answers.get("notes")
    if notes is None:
        notes = ""
    elif not isinstance(notes, str) or has_lone_surrogate(notes) or len(notes.strip()) > NOTES_MAX:
        return f"Field 'answers.notes' must be at most {NOTES_MAX} characters.", None
    clean["notes"] = notes.strip()

    if not isinstance(topics, list) or not 1 <= len(topics) <= MAX_TOPICS:
        return f"Field 'topics' must be a list of 1-{MAX_TOPICS} questions.", None
    # One pass, as in the twin: each topic's shape, then whether its id was already listed.
    clean_topics: List[dict] = []
    seen = set()
    for topic in topics:
        if not isinstance(topic, dict):
            return _TOPIC_PROBLEM, None
        topic_id, name = topic.get("id"), topic.get("name")
        category, difficulty, done = topic.get("category"), topic.get("difficulty"), topic.get("done")
        if (
            not all(isinstance(v, str) and not has_lone_surrogate(v) for v in (topic_id, name, category, difficulty))
            or not 1 <= len(topic_id.strip()) <= TOPIC_TEXT_MAX
            or not 1 <= len(name.strip()) <= TOPIC_TEXT_MAX
            or len(category.strip()) > CATEGORY_MAX
            or len(difficulty.strip()) > DIFFICULTY_MAX
            or (done is not None and not isinstance(done, bool))
        ):
            return _TOPIC_PROBLEM, None
        topic_id = topic_id.strip()
        if topic_id in seen:
            return f"Topic '{topic_id}' is listed twice.", None
        seen.add(topic_id)
        clean_topics.append(
            {
                "id": topic_id,
                "name": name.strip(),
                "category": category.strip(),
                "difficulty": difficulty.strip(),
                "done": done is True,
            }
        )
    return None, {"answers": clean, "topics": clean_topics}


def build_auto_plan_prompt(answers: dict, topics: List[dict]) -> str:
    """The prompt for a request that passed validate_auto_request (byte-identical to the twin's)."""
    weeks, per_week = answers["weeks"], answers["perWeek"]
    topic_lines = [
        f"- {t['id']} | {t['name']} | {t['category']} | {t['difficulty']}" + (" | already solved" if t["done"] else "")
        for t in topics
    ]
    lines = [
        "You are an expert coding-interview coach. Plan a week-by-week DSA study schedule for this learner.",
        "",
        "Learner profile:",
        f"- Timeline: {weeks} weeks",
        f"- Questions per week: at most {per_week} (a week may hold fewer, never more)",
        f"- Current level: {LEVEL_TEXT[answers['level']]}",
        f"- Goal: {GOAL_TEXT[answers['goal']]}",
        f"- Difficulty preference: {DIFFICULTY_TEXT[answers['difficulty']]}",
        f"- Week style: {STYLE_TEXT[answers['style']]}",
        f"- Patterns to emphasise: {', '.join(answers['focus']) or 'none in particular'}",
        f"- Patterns the learner finds hard: {', '.join(answers['weak']) or 'none given'}",
        f"- Notes from the learner: {answers['notes'] or 'none'}",
        "",
        "Available questions, in a recommended learning order (id | name | pattern | difficulty):",
        *topic_lines,
        "",
        "Rules:",
        "1. Use only ids from the list above, each at most once.",
        f"2. Use weeks 1 to {weeks} only, with at most {per_week} questions in any week.",
        "3. Order the weeks so foundations come before the patterns that build on them: arrays, hashing and two "
        "pointers before sliding window; linked lists and stacks before trees; trees before graphs; recursion and "
        "backtracking before dynamic programming.",
        "4. Ramp the difficulty: easier questions early, harder ones later. Put at most 2 Hard questions in one week "
        "unless the learner asked for a stretch.",
        "5. Give the patterns to emphasise and the patterns the learner finds hard extra questions, and revisit a hard "
        "pattern in a later week for review.",
        '6. Questions marked "already solved" are for review only: use them sparingly.',
        "7. You do not have to use every question. Leave out what does not fit the timeline.",
        "8. Give every week a short focus label of at most 6 words naming what it trains.",
        "",
        "Reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:",
        '{"summary": "2-3 sentences on how the plan is organised", "weeks": [{"week": 1, "focus": "Hashing basics", '
        '"questions": ["<id>", "<id>"]}]}',
    ]
    return "\n".join(lines)


def auto_plan_max_tokens(weeks: int, per_week: int) -> int:
    """Enough room for the whole plan: a short reply budget silently truncates the JSON."""
    return min(6000, 800 + weeks * per_week * 40)


def _collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalize_auto_plan(raw: Any, topic_ids: List[str], weeks: int, per_week: int) -> Tuple[dict, str, dict]:
    """Turn the model's reply into (plan, summary, stats), keeping only what fits the request.

    Weeks outside 1..weeks lose all their questions; inside a week (entries sorted by week, then by position in
    the reply) unknown ids, repeats and anything past the cap are dropped. A week's first non-empty focus becomes
    its label, kept only if the week ended up with questions. Deterministic and identical in the twin.
    """
    cap = min(per_week, WEEK_CAP)
    known = set(topic_ids)
    entries = raw.get("weeks") if isinstance(raw, dict) and isinstance(raw.get("weeks"), list) else []
    valid: List[Tuple[int, int, dict]] = []
    dropped = 0
    for idx, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        week, questions = entry.get("week"), entry.get("questions")
        if not _is_int(week) or week < 1 or week > weeks:
            dropped += len(questions) if isinstance(questions, list) else 0
            continue
        valid.append((week, idx, entry))
    valid.sort(key=lambda item: (item[0], item[1]))

    assignments: Dict[str, int] = {}
    order: List[str] = []
    labels: Dict[str, str] = {}
    counts: Dict[int, int] = {}
    for week, _, entry in valid:
        focus = entry.get("focus")
        if isinstance(focus, str):
            label = _collapse(focus)[:LABEL_MAX].strip()
            if label and str(week) not in labels:
                labels[str(week)] = label
        questions = entry.get("questions")
        if not isinstance(questions, list):
            continue
        for q in questions:
            if not isinstance(q, str) or q not in known or q in assignments:
                dropped += 1
                continue
            if counts.get(week, 0) >= cap:
                dropped += 1
                continue
            assignments[q] = week
            order.append(q)
            counts[week] = counts.get(week, 0) + 1
    labels = {key: label for key, label in labels.items() if counts.get(int(key), 0) > 0}

    summary = ""
    if isinstance(raw, dict) and isinstance(raw.get("summary"), str):
        summary = _collapse(raw["summary"])[:SUMMARY_MAX].strip()
    plan = {"weeks": weeks, "assignments": assignments, "order": order, "labels": labels}
    return plan, summary, {"placed": len(assignments), "dropped": dropped, "slots": weeks * cap}
