"""AI Interactive Workbooks, generation: the prompts and the cleaning of what the AI returns. Pure (no I/O, no imports
beyond the standard library), so the twin check can run it with a bare interpreter.

A workbook is written in pages, never in one call, so no single answer can be cut off and a 400-page book never has to
fit in one prompt:
  1. The source is split into numbered parts (`split_source`). The OUTLINE prompt sees every part (or, for a long
     book, the opening of each) and plans the chapters; each chapter covers a run of consecutive parts.
  2. One SECTION prompt per chapter sees only that chapter's parts and writes its blocks (readings, exercises, a quiz).
What the AI returns is never stored as is: `normalize_outline` / `normalize_section` keep only the known shapes, clip
every text to its limit, give everything a stable id and drop what cannot be used.

The content JSON (lms_workbooks.content_json):
  {"schema": 1, "summary", "outcomes": [..], "estimated_minutes",
   "sections": [{"id": "s1", "title", "summary", "goals": [..], "minutes", "from", "to",
                 "status": "pending" | "ready", "blocks": [{"id": "s1-b1", "type": ..., ...}]}]}

Twin: frontend/fe-apis/lms/workbookGen.ts. The prompts must stay byte-identical and the normalizers must give the same
JSON for the same input: backend/tests/lms_workbooks_test.py runs both and diffs them. Change both together.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

SCHEMA_VERSION = 1

# Splitting the source. A part is a few paragraphs: between PART_MIN and PART_MAX characters, aiming at ~24 parts.
PART_MIN = 1200
PART_MAX = 4000
PART_TARGET_COUNT = 24
# How much of the source the outline prompt may show; past this only the opening of each part is shown.
OUTLINE_SOURCE_CHARS = 48_000
EXCERPT_MIN = 160
# How much of one chapter's material its section prompt may show.
SECTION_SOURCE_CHARS = 24_000

MAX_SECTIONS = 16
MAX_BLOCKS = 16
MAX_QUESTIONS = 8

# Answer budgets (tokens) of the calls.
MAX_TOKENS = {"outline": 4096, "section": 8192, "explain": 1024}
EXPLAIN_QUESTION_MAX = 500
EXPLANATION_MAX = 4000

BLOCK_TYPES = (
    "reading",
    "key_points",
    "reflection",
    "short_answer",
    "checklist",
    "planner",
    "habit_tracker",
    "scale",
    "action",
    "quiz",
)
QUESTION_KINDS = ("mcq", "true_false", "fill_blank", "matching", "scenario")

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")
# JavaScript's String.prototype.trim() whitespace (Python's str.strip() differs: it keeps U+FEFF and also strips
# \x1c-\x1f and \x85), spelled out so both twins trim exactly the same characters.
_WS = "[ \t\n\v\f\r   -     　﻿]"
# \Z, not $: Python's $ also matches before a final newline, JavaScript's (no m flag) only at the very end.
_TRIM = re.compile(f"\\A{_WS}+|{_WS}+\\Z")
_TRIM_END = re.compile(f"{_WS}+\\Z")
_PARAGRAPH_BREAK = re.compile(r"\n[ \t]*(?:\n[ \t]*)+")
_BLANK_LINES = re.compile(r"\n{3,}")
_BLANK = re.compile(r"_{3,}")
_SPACES = re.compile(r"[ \t]{2,}")


class GenerationError(Exception):
    """The AI's answer could not be used. Carries the HTTP status and text the endpoint answers with."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# ── Text helpers ───────────────────────────────────────────────────────────────


def trim(value: str) -> str:
    return _TRIM.sub("", value)


def _cut(value: str, limit: int) -> str:
    """At most `limit` characters (code points), cut at the limit and the cut end trimmed."""
    if len(value) <= limit:
        return value
    return _TRIM_END.sub("", value[:limit])


def text(value: Any, limit: int, multiline: bool = False) -> str:
    """A string from the AI, cleaned and clipped; anything that is not a string is ''."""
    if not isinstance(value, str):
        return ""
    if multiline:
        cleaned = _CONTROL.sub("", re.sub(r"\r\n?", "\n", value))
        cleaned = _BLANK_LINES.sub("\n\n", cleaned)
    else:
        cleaned = _SPACES.sub(" ", _CONTROL.sub("", re.sub(r"[\r\n\t]+", " ", value)))
    return _cut(trim(cleaned), limit)


def text_list(value: Any, max_items: int, limit: int) -> List[str]:
    """The non-empty strings of a list, cleaned and clipped, at most `max_items` of them."""
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value:
        cleaned = text(item, limit)
        if cleaned:
            out.append(cleaned)
        if len(out) == max_items:
            break
    return out


def whole(value: Any) -> Optional[int]:
    """A JSON whole number as int, else None. 15.0 counts (JavaScript's JSON.parse reads it as 15); true does not."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _clamp(value: Any, low: int, high: int, default: int) -> int:
    number = whole(value)
    if number is None:
        return default
    return max(low, min(high, number))


# ── The source, in parts ───────────────────────────────────────────────────────


def split_source(source: str) -> List[str]:
    """The source in numbered parts of whole paragraphs (a paragraph longer than a part is cut into pieces)."""
    total = len(source)
    target = max(PART_MIN, min(PART_MAX, -(-total // PART_TARGET_COUNT)))
    parts: List[str] = []
    current: List[str] = []
    size = 0
    for raw in _PARAGRAPH_BREAK.split(source):
        paragraph = trim(raw)
        if not paragraph:
            continue
        if len(paragraph) > target:
            if current:
                parts.append("\n\n".join(current))
                current, size = [], 0
            for start in range(0, len(paragraph), target):
                piece = trim(paragraph[start : start + target])
                if piece:
                    parts.append(piece)
            continue
        extra = len(paragraph) + (2 if current else 0)
        if current and size + extra > target:
            parts.append("\n\n".join(current))
            current, size = [], 0
            extra = len(paragraph)
        current.append(paragraph)
        size += extra
    if current:
        parts.append("\n\n".join(current))
    return parts


def section_material(parts: List[str], start: int, end: int) -> Tuple[str, bool]:
    """The text of parts start..end (1-based, inclusive), and whether it had to be cut to fit the prompt."""
    material = "\n\n".join(parts[start - 1 : end])
    if len(material) <= SECTION_SOURCE_CHARS:
        return material, False
    return _cut(material, SECTION_SOURCE_CHARS), True


# ── Prompts ────────────────────────────────────────────────────────────────────


def _about(title: str, description: str, instructions: str) -> str:
    lines = [f"Title: {title}"]
    if description:
        lines.append(f"Description: {description}")
    block = "\n".join(lines)
    if instructions:
        block += f"\n\nInstructions from the workbook's author (follow them):\n{instructions}"
    return block


def chapter_bounds(part_count: int) -> Tuple[int, int]:
    """How many chapters the outline may have: never more than there are parts (a chapter is at least one part)."""
    high = max(1, min(MAX_SECTIONS, part_count))
    return (min(3, high) if part_count >= 6 else 1), high


def build_outline_prompt(title: str, description: str, instructions: str, parts: List[str]) -> str:
    count = len(parts)
    full = len("\n\n".join(parts)) <= OUTLINE_SOURCE_CHARS
    if full:
        shown = parts
        how = "Each part is shown in full."
    else:
        each = max(EXCERPT_MIN, OUTLINE_SOURCE_CHARS // count)
        shown = [part if len(part) <= each else _cut(part, each) + " [...]" for part in parts]
        how = "The material is long, so only the opening of each part is shown."
    material = "\n\n".join(f"[[P{index}]]\n{part}" for index, part in enumerate(shown, start=1))
    low, high = chapter_bounds(count)
    span = f"{low} to {high} chapters" if low != high else f"{high} chapter" + ("s" if high != 1 else "")
    return f"""You are an instructional designer turning learning material into an interactive workbook: chapters of short readings and hands-on exercises (reflections, checklists, planners, habit trackers, quizzes) that help a learner understand the material and apply it to their own life or work.

THE WORKBOOK
{_about(title, description, instructions)}

THE MATERIAL
The material is split into {count} numbered part{"s" if count != 1 else ""}, [[P1]] to [[P{count}]]. {how}

{material}

YOUR TASK
Plan the workbook's chapters, in the material's own order.
- Write {span}: one per real chapter or main idea of the material, never padding.
- Each chapter covers a run of consecutive parts: "from" and "to" are part numbers (1 to {count}). The runs follow each other without gaps or overlaps, the first starts at 1 and the last ends at {count}.
- "title": a short chapter title, at most 80 characters, in sentence case.
- "summary": one or two sentences on what the learner gets from the chapter.
- "goals": two or three things the learner can do after the chapter, each starting with a verb.
- "minutes": how long the chapter takes, reading and exercises together (5 to 60).
Also write the workbook's "summary" (two sentences: what it covers and who it helps) and three to five "outcomes": what the learner can do after the whole workbook.
Write in the material's language.

Return ONLY this JSON object, with no markdown fences and no text around it:
{{"summary": "...", "outcomes": ["..."], "chapters": [{{"title": "...", "summary": "...", "goals": ["..."], "from": 1, "to": 2, "minutes": 15}}]}}"""


def build_section_prompt(
    title: str,
    description: str,
    instructions: str,
    sections: List[Dict[str, Any]],
    index: int,
    material: str,
    was_cut: bool,
) -> str:
    """The prompt that writes chapter `index` (0-based) of `sections` (the normalized outline)."""
    section = sections[index]
    chapters = "\n".join(
        f"{number}. {item['title']}" + (f": {item['summary']}" if item["summary"] else "")
        for number, item in enumerate(sections, start=1)
    )
    goals = "\n".join(f"- {goal}" for goal in section["goals"]) or "- (none given)"
    note = " (long, so only its beginning is shown)" if was_cut else ""
    return f"""You are an instructional designer writing one chapter of an interactive workbook. The learner reads a little, then does things: reflects, plans, ticks off steps, tracks a habit, answers quiz questions. Every block must come from this chapter's material; never add facts the material does not support.

THE WORKBOOK
{_about(title, description, instructions)}

ALL CHAPTERS (for context; write only chapter {index + 1})
{chapters}

CHAPTER {index + 1}: {section["title"]}
Summary: {section["summary"] or "(none)"}
Goals:
{goals}

THE CHAPTER'S MATERIAL{note}
\"\"\"
{material}
\"\"\"

YOUR TASK
Write the chapter as 6 to 12 blocks, in the order the learner meets them.
- Start with a "reading" block: the chapter's key ideas in your own words, short paragraphs, plain language.
- Then alternate short readings or key points with exercises that make the learner apply the ideas to their own situation.
- End with a "quiz" block of 3 to 5 questions that mixes question kinds.
- Use at least four different block types, and only those that fit the material: a habit tracker only for something done repeatedly, a planner only when there is something to plan.
- Speak to the learner as "you". Keep every text short and concrete. Write in the material's language.

BLOCK TYPES (the exact JSON of each)
{{"type": "reading", "title": "...", "body": "two to four short paragraphs, separated by blank lines"}}
{{"type": "key_points", "title": "...", "items": ["one idea per item", "..."]}}
{{"type": "reflection", "prompt": "an open question about the learner's own life or work", "hint": "an optional nudge"}}
{{"type": "short_answer", "prompt": "a question answered in a sentence or two", "hint": "an optional nudge"}}
{{"type": "checklist", "title": "...", "items": ["a concrete step", "..."]}}
{{"type": "planner", "title": "...", "fields": ["a label the learner fills in", "..."]}}
{{"type": "habit_tracker", "habit": "one small action to repeat", "days": 7, "why": "why it helps"}}
{{"type": "scale", "prompt": "a statement the learner rates themselves on", "min_label": "...", "max_label": "...", "max": 5}}
{{"type": "action", "title": "...", "text": "one thing to try today"}}
{{"type": "quiz", "title": "...", "questions": [QUESTION, ...]}}

QUESTION KINDS
{{"kind": "mcq", "prompt": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..."}} (answer = the index of the right option)
{{"kind": "true_false", "prompt": "a statement", "answer": true, "explanation": "..."}}
{{"kind": "fill_blank", "prompt": "a sentence with ___ where the missing word goes", "answer": "word", "accept": ["another accepted answer"], "explanation": "..."}}
{{"kind": "matching", "prompt": "...", "pairs": [{{"left": "...", "right": "..."}}], "explanation": "..."}}
{{"kind": "scenario", "scenario": "a short real-life situation", "prompt": "what should they do?", "options": ["...", "...", "..."], "answer": 1, "explanation": "..."}}
Every explanation says why the right answer is right, from the material.

Return ONLY this JSON object, with no markdown fences and no text around it:
{{"blocks": [...]}}"""


# ── Cleaning the outline ───────────────────────────────────────────────────────


def normalize_outline(parsed: Any, part_count: int) -> Dict[str, Any]:
    """The workbook content for a fresh outline: every chapter `pending`, ranges fixed to cover parts 1..part_count."""
    if not isinstance(parsed, dict):
        raise GenerationError(502, "The AI's answer could not be read. Try again.")
    chapters = parsed.get("chapters")
    if not isinstance(chapters, list):
        chapters = parsed.get("sections")
    if not isinstance(chapters, list):
        chapters = []

    sections: List[Dict[str, Any]] = []
    previous = 0
    for item in chapters:
        if not isinstance(item, dict):
            continue
        title = text(item.get("title"), 80)
        if not title:
            continue
        if previous >= part_count or len(sections) == MAX_SECTIONS:
            break
        # Each chapter starts after the previous one's start; where it ends is decided by the next one's start.
        start = whole(item.get("from"))
        start = previous + 1 if start is None else max(previous + 1, min(part_count, start))
        sections.append(
            {
                "id": f"s{len(sections) + 1}",
                "title": title,
                "summary": text(item.get("summary"), 400),
                "goals": text_list(item.get("goals"), 5, 200),
                "minutes": _clamp(item.get("minutes"), 3, 120, 15),
                "from": start,
                "to": start,
                "status": "pending",
                "blocks": [],
            }
        )
        previous = start
    if not sections:
        raise GenerationError(502, "The AI returned no chapters. Try again.")
    sections[0]["from"] = 1
    for position, section in enumerate(sections):
        following = sections[position + 1]["from"] if position + 1 < len(sections) else part_count + 1
        section["to"] = following - 1

    return {
        "schema": SCHEMA_VERSION,
        "summary": text(parsed.get("summary"), 600, multiline=True),
        "outcomes": text_list(parsed.get("outcomes"), 6, 200),
        "estimated_minutes": sum(section["minutes"] for section in sections),
        "sections": sections,
    }


# ── Cleaning a chapter's blocks ────────────────────────────────────────────────


def _option_index(answer: Any, options: List[str]) -> Optional[int]:
    """The right option of a choice question: an index, the option's own text, or a letter (A = the first)."""
    number = whole(answer)
    if number is not None:
        return number if 0 <= number < len(options) else None
    if not isinstance(answer, str):
        return None
    wanted = trim(answer).lower()
    for position, option in enumerate(options):
        if option.lower() == wanted:
            return position
    if len(wanted) == 1 and "a" <= wanted <= "f":
        position = ord(wanted) - ord("a")
        return position if position < len(options) else None
    return None


def _question(raw: Any, question_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    kind = raw.get("kind") if raw.get("kind") in QUESTION_KINDS else raw.get("type")
    if kind not in QUESTION_KINDS:
        return None
    prompt = text(raw.get("prompt"), 600) or text(raw.get("question"), 600)
    explanation = text(raw.get("explanation"), 600, multiline=True)
    out: Dict[str, Any] = {"id": question_id, "kind": kind, "prompt": prompt}

    if kind in ("mcq", "scenario"):
        options = text_list(raw.get("options"), 6, 200)
        answer = _option_index(raw.get("answer"), options)
        if len(options) < 2 or answer is None:
            return None
        scenario = text(raw.get("scenario"), 1200, multiline=True)
        if kind == "scenario" and not scenario:
            kind = "mcq"
            out["kind"] = kind
        if kind == "mcq" and not prompt:
            return None
        if kind == "scenario":
            out["scenario"] = scenario
            out["prompt"] = prompt or "What should they do?"
        out["options"] = options
        out["answer"] = answer
    elif kind == "true_false":
        answer = raw.get("answer")
        if isinstance(answer, str) and trim(answer).lower() in ("true", "false"):
            answer = trim(answer).lower() == "true"
        if not prompt or not isinstance(answer, bool):
            return None
        out["answer"] = answer
    elif kind == "fill_blank":
        answer = text(raw.get("answer"), 100)
        if not prompt or not answer:
            return None
        prompt = _BLANK.sub("___", prompt)
        if "___" not in prompt:
            return None
        out["prompt"] = prompt
        out["answer"] = answer
        out["accept"] = [item for item in text_list(raw.get("accept"), 5, 100) if item.lower() != answer.lower()]
    else:  # matching
        pairs: List[Dict[str, str]] = []
        for pair in raw.get("pairs") if isinstance(raw.get("pairs"), list) else []:
            if not isinstance(pair, dict):
                continue
            left, right = text(pair.get("left"), 200), text(pair.get("right"), 200)
            if left and right:
                pairs.append({"left": left, "right": right})
            if len(pairs) == 6:
                break
        if len(pairs) < 2:
            return None
        out["prompt"] = prompt or "Match each item with its pair."
        out["pairs"] = pairs
    out["explanation"] = explanation
    return out


def _block(raw: Any, block_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict) or raw.get("type") not in BLOCK_TYPES:
        return None
    kind = raw["type"]
    block: Dict[str, Any] = {"id": block_id, "type": kind}
    if kind == "reading":
        body = text(raw.get("body"), 4000, multiline=True) or text(raw.get("text"), 4000, multiline=True)
        if not body:
            return None
        block.update(title=text(raw.get("title"), 120), body=body)
    elif kind == "key_points":
        items = text_list(raw.get("items"), 8, 300)
        if not items:
            return None
        block.update(title=text(raw.get("title"), 120), items=items)
    elif kind in ("reflection", "short_answer"):
        prompt = text(raw.get("prompt"), 500)
        if not prompt:
            return None
        block.update(prompt=prompt, hint=text(raw.get("hint"), 300))
    elif kind == "checklist":
        items = text_list(raw.get("items"), 12, 200)
        if not items:
            return None
        block.update(
            title=text(raw.get("title"), 120),
            items=[{"id": f"{block_id}-i{n}", "text": item} for n, item in enumerate(items, start=1)],
        )
    elif kind == "planner":
        fields = text_list(raw.get("fields"), 8, 120)
        if not fields:
            return None
        block.update(
            title=text(raw.get("title"), 120),
            fields=[{"id": f"{block_id}-f{n}", "label": label} for n, label in enumerate(fields, start=1)],
        )
    elif kind == "habit_tracker":
        habit = text(raw.get("habit"), 200)
        if not habit:
            return None
        block.update(habit=habit, days=_clamp(raw.get("days"), 3, 30, 7), why=text(raw.get("why"), 300))
    elif kind == "scale":
        prompt = text(raw.get("prompt"), 300)
        if not prompt:
            return None
        block.update(
            prompt=prompt,
            min_label=text(raw.get("min_label"), 60) or "Not at all",
            max_label=text(raw.get("max_label"), 60) or "Completely",
            max=10 if whole(raw.get("max")) == 10 else 5,
        )
    elif kind == "action":
        body = text(raw.get("text"), 600, multiline=True) or text(raw.get("body"), 600, multiline=True)
        if not body:
            return None
        block.update(title=text(raw.get("title"), 120), text=body)
    else:  # quiz
        questions: List[Dict[str, Any]] = []
        for item in raw.get("questions") if isinstance(raw.get("questions"), list) else []:
            question = _question(item, f"{block_id}-q{len(questions) + 1}")
            if question is not None:
                questions.append(question)
            if len(questions) == MAX_QUESTIONS:
                break
        if not questions:
            return None
        block.update(title=text(raw.get("title"), 120), questions=questions)
    return block


def normalize_section(parsed: Any, section_id: str) -> List[Dict[str, Any]]:
    """The usable blocks of one chapter's answer, with ids `<section>-b1`, `-b2`, ... in order."""
    if isinstance(parsed, list):
        raw_blocks: Any = parsed
    elif isinstance(parsed, dict):
        raw_blocks = parsed.get("blocks")
    else:
        raise GenerationError(502, "The AI's answer could not be read. Try again.")
    blocks: List[Dict[str, Any]] = []
    for raw in raw_blocks if isinstance(raw_blocks, list) else []:
        block = _block(raw, f"{section_id}-b{len(blocks) + 1}")
        if block is not None:
            blocks.append(block)
        if len(blocks) == MAX_BLOCKS:
            break
    if not blocks:
        raise GenerationError(502, "The AI returned no usable exercises for this chapter. Try again.")
    return blocks


# ── "Explain this to me" ────────────────────────────────────────────────────────


def block_text(block: Dict[str, Any]) -> str:
    """What a block says, as plain text, for the explain prompt (a quiz gives its questions, never its answers)."""
    kind = block.get("type")
    lines: List[str] = []
    title = block.get("title")
    if isinstance(title, str) and title:
        lines.append(title)
    if kind == "reading":
        lines.append(block.get("body") or "")
    elif kind == "key_points":
        lines.extend(f"- {item}" for item in block.get("items") or [])
    elif kind == "action":
        lines.append(block.get("text") or "")
    elif kind in ("reflection", "short_answer", "scale"):
        lines.append(block.get("prompt") or "")
        if block.get("hint"):
            lines.append(block["hint"])
    elif kind == "checklist":
        lines.extend(f"- {item.get('text', '')}" for item in block.get("items") or [] if isinstance(item, dict))
    elif kind == "planner":
        lines.extend(f"- {field.get('label', '')}" for field in block.get("fields") or [] if isinstance(field, dict))
    elif kind == "habit_tracker":
        lines.append(block.get("habit") or "")
        if block.get("why"):
            lines.append(block["why"])
    elif kind == "quiz":
        for question in block.get("questions") or []:
            if isinstance(question, dict):
                if question.get("scenario"):
                    lines.append(question["scenario"])
                lines.append(f"- {question.get('prompt', '')}")
    return "\n".join(line for line in lines if line)


def build_explain_prompt(workbook_title: str, chapter_title: str, block: Dict[str, Any], question: str) -> str:
    asked = f"\nThe learner asks: {question}\n" if question else ""
    first = " Answer the learner's question first." if question else ""
    return f"""You are a patient tutor helping a learner with one part of a workbook.

THE WORKBOOK: {workbook_title}
THE CHAPTER: {chapter_title}

THE PART THE LEARNER IS ON
\"\"\"
{block_text(block)}
\"\"\"
{asked}
Explain this part again in simpler words: two or three short paragraphs in plain language, speaking to the learner as "you", with one everyday example.{first} Stay true to the text; if it does not cover what the learner asks, say so briefly. Write in the language of the text. Plain text only: no markdown, no headings, no lists."""


def clean_explanation(raw: Any) -> str:
    """The explanation as shown: control characters gone, at most one blank line in a row, clipped."""
    return text(raw, EXPLANATION_MAX, multiline=True)
