"""Pure prompt construction for Career Studio AI features (no I/O).

Kept separate from llm.py / routers so prompts are easy to read and tune, the
same way linkedin_post_generator/prompt_builder.py is structured.
"""

from __future__ import annotations

import json
from typing import Any

# The analyzer report contract the frontend AnalysisPanel renders. Kept here so
# the prompt and the UI stay in sync.
ANALYSIS_DIMENSIONS = [
    "overall_score", "ats_score", "grammar_score", "readability_score",
    "achievement_score", "impact_score", "action_verb_score", "formatting_score",
    "technical_skills_score", "soft_skills_score",
]
ANALYSIS_LISTS = [
    "missing_skills", "missing_sections", "weak_bullets", "passive_voice_instances",
    "repetitive_words", "cliches", "red_flags",
]


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(_stringify(v) for v in value if v not in (None, ""))
    if isinstance(value, dict):
        parts = []
        for k, v in value.items():
            text = _stringify(v)
            if text:
                parts.append(f"{k}: {text}" if not isinstance(v, (list, dict)) else text)
        return "\n".join(parts)
    return str(value)


def resume_to_text(sections: list[dict]) -> str:
    """Flatten resume sections into readable plain text for the LLM."""
    blocks: list[str] = []
    for section in sections:
        if section.get("is_hidden"):
            continue
        title = section.get("title") or section.get("section_type", "Section")
        body = _stringify(section.get("content"))
        blocks.append(f"## {title}\n{body}".strip())
    return "\n\n".join(b for b in blocks if b).strip()


def build_analyze_prompt(resume_text: str, job_description: str | None = None) -> str:
    jd_block = f"\n\nTARGET JOB DESCRIPTION (score ATS/keyword fit against this):\n{job_description}\n" if job_description else ""
    scores = ", ".join(ANALYSIS_DIMENSIONS)
    return f"""You are a world-class technical recruiter and resume coach. Analyze the resume below and return a STRICT JSON object (no markdown, no prose outside the JSON).

RESUME:
{resume_text or "(empty resume)"}{jd_block}

Return a JSON object with EXACTLY these keys:
- Numeric scores 0-100 (integers): {scores}
- "keyword_match": object with "matched": string[] and "missing": string[]
- "resume_length": short string assessment (e.g. "1 page — appropriate")
- List fields (arrays of objects, each with "text" and "suggestion"): {", ".join(ANALYSIS_LISTS)}
- "summary": a 2-3 sentence overall assessment string
- "top_suggestions": array of the 3-5 highest-impact fixes, each an object with "title", "severity" ("high"|"medium"|"low"), "explanation", and "suggested_rewrite"

For every weak bullet, cliche, or red flag, include a concrete "suggestion" rewrite. Be specific and honest. Output ONLY the JSON object."""


def build_section_rewrite_prompt(section_type: str, title: str | None, current_text: str, instruction: str | None) -> str:
    ask = instruction or "Rewrite this to be more impactful, concise, and achievement-oriented (strong action verbs, quantified results). Keep it truthful to the input."
    return f"""You are a resume-writing expert. Rewrite the following resume section content.

SECTION: {title or section_type} (type: {section_type})
INSTRUCTION: {ask}

CURRENT CONTENT:
{current_text or "(empty)"}

Return ONLY the rewritten content as plain text (no preamble, no markdown fences, no commentary). Preserve any bullet structure using "- " prefixes where appropriate."""


def build_copilot_prompt(question: str, resume_context: str | None) -> str:
    context_block = f"\n\nThe user's current resume for reference:\n{resume_context}\n" if resume_context else ""
    return f"""You are Career Studio's AI copilot — a concise, practical career and resume coach. Answer the user's question with specific, actionable advice. Prefer short paragraphs and bullet points.{context_block}

USER QUESTION:
{question}"""


def build_import_prompt(raw_text: str) -> str:
    return f"""You are a resume parser. Extract the resume text below into structured sections.

RESUME TEXT:
{raw_text}

Return a STRICT JSON array (no markdown) where each element is an object:
{{"section_type": one of ["personal_info","summary","experience","education","skills","projects","certifications","awards","languages","custom"], "title": string, "content": object}}

Content shapes:
- personal_info: {{"name","title","email","phone","location","links":[]}}
- summary: {{"text": string}}
- experience/education/projects/certifications/awards: {{"items": [{{"title","subtitle","date","bullets":[]}}]}}
- skills: {{"groups": [{{"name","items":[]}}]}}

Only include sections you can actually find. Output ONLY the JSON array."""


def to_json_debug(obj: Any) -> str:
    return json.dumps(obj, indent=2)
