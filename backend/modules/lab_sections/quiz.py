"""Prompt + validation for AI-generated lab quizzes (kept free of I/O so it is easy to test)."""

from __future__ import annotations

import random
from typing import Any, Iterable, List, Optional

_DOMAINS = {
    "dsa": "Data Structures & Algorithms interview",
    "cv": "Computer Vision interview",
    "system_design": "System Design interview",
}

# Only the most recent questions go back into the prompt: enough to steer away from repeats without
# letting a long-lived quiz blow up the context.
MAX_PREVIOUS_IN_PROMPT = 40
_PREVIOUS_CHARS = 220


def build_quiz_prompt(
    *,
    lab: str,
    topic_name: str,
    topic_brief: str,
    category: str,
    prerequisites: Iterable[str],
    related_topics: Iterable[str],
    subtopic_name: str,
    subtopic_brief: str,
    previous_questions: Iterable[str],
    count: int,
    section_guidance: str = "",
    standing_context: str = "",
    project_blocks: str = "",
    project_rules: str = "",
) -> str:
    # `project_blocks` / `project_rules` come from lab_projects.knowledge.quiz_prompt_parts ('' = no project).
    domain = _DOMAINS.get(lab, "technical interview")
    lines = [f"Topic: {topic_name}"]
    if topic_brief:
        lines.append(f"Brief: {topic_brief}")
    if category:
        lines.append(f"Pattern family: {category}")
    prereqs = [p for p in prerequisites if p]
    if prereqs:
        lines.append("Prerequisites: " + ", ".join(prereqs))
    related = [r for r in related_topics if r]
    if related:
        lines.append("Related problems in the same family: " + "; ".join(related))
    if subtopic_name:
        focus = f"{subtopic_name} — {subtopic_brief}" if subtopic_brief else subtopic_name
        lines.append(f"Learner is currently on this sub-topic: {focus}")
    context = "\n".join(lines) + project_blocks

    standing = standing_context.strip()
    if standing:
        context += (
            "\n\nStanding context about the learner (applies to every section of this lab; use it to tailor depth, "
            f'examples and language):\n\"\"\"\n{standing}\n\"\"\"'
        )
    guidance = section_guidance.strip()
    if guidance:
        context += f"\n\nQuiz requirements from the learner (follow these closely, in addition to the rules below):\n{guidance}"

    prev = [q.strip().replace("\n", " ")[:_PREVIOUS_CHARS] for q in previous_questions if q and q.strip()]
    prev = prev[-MAX_PREVIOUS_IN_PROMPT:]
    avoid = ""
    if prev:
        listing = "\n".join(f"- {q}" for q in prev)
        avoid = f"\n\nThe learner has already seen these questions. Do not repeat them or ask near-duplicates; cover new ground:\n{listing}"

    return f"""You are a senior coach writing a multiple-choice quiz for a {domain} prep app.

{context}

Write {count} questions that are about this specific topic AND the concepts around it: the problem's key insight and invariant, its time/space complexity, edge cases and common bugs, the underlying pattern and the prerequisite ideas, and how it differs from or generalises to the related problems listed. Mix the kinds: conceptual, complexity, bug-spotting / edge case, pattern recognition ("which approach fits this variant?"), and short predict-the-result questions.{project_rules}

Rules:
- Exactly 4 options per question, exactly one correct. Distractors must be plausible and reflect real misconceptions, not obvious throwaways. Never use "all of the above" or "none of the above".
- Make the four options similar in length and level of detail; the correct one must not be the longest or most specific.
- Every question must stand alone: never refer to code, a snippet, a figure or a table that isn't written out in the question itself. If a question needs a snippet, describe it in a sentence or two.
- Plain text only in "q", the options and "explanation": no markdown, no code fences. A short inline expression such as nums[i] - k is fine.
- "explanation" is 1-3 sentences: why the correct option is right and why the most tempting wrong one is not.
- Test understanding that matters in an interview, not trivia.{avoid}

Respond with ONLY a JSON array of {count} objects, no text outside it, each shaped exactly:
{{"q": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": <0-3, index of the correct option>, "explanation": "..."}}"""


def _as_answer_index(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if 0 <= value <= 3 else None
    if isinstance(value, str):
        v = value.strip()
        if v.isdigit() and 0 <= int(v) <= 3:
            return int(v)
        if len(v) == 1 and v.upper() in "ABCD":
            return "ABCD".index(v.upper())
    return None


def normalize_questions(raw: Any, rng: Optional[random.Random] = None) -> List[dict]:
    """Keep well-formed questions only, and shuffle each one's options.

    Models strongly favour putting the right answer in B or C, so the options are shuffled here and
    `answer` is re-pointed at wherever the correct one landed.
    """
    rng = rng or random.Random()
    out: List[dict] = []
    seen = set()
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        q = item.get("q") if isinstance(item.get("q"), str) else item.get("question")
        opts = item.get("options")
        explanation = item.get("explanation") if isinstance(item.get("explanation"), str) else ""
        ans = _as_answer_index(item.get("answer"))
        if not isinstance(q, str) or not q.strip() or not isinstance(opts, list) or len(opts) != 4 or ans is None:
            continue
        if not all(isinstance(o, str) and o.strip() for o in opts):
            continue
        opts = [o.strip() for o in opts]
        if len({o.lower() for o in opts}) != 4:
            continue
        key = q.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        order = list(range(4))
        rng.shuffle(order)
        out.append(
            {
                "q": q.strip(),
                "options": [opts[i] for i in order],
                "answer": order.index(ans),
                "explanation": explanation.strip(),
            }
        )
    return out
