"""Pure prompt construction for Career Studio AI features (no I/O).

Kept separate from llm.py / routers so prompts are easy to read and tune, the
same way linkedin_post_generator/generation/prompt_builder.py is structured.
"""

from __future__ import annotations

import json
from typing import Any

# The analyzer report contract the frontend AnalysisPanel renders. Kept here so
# the prompt and the UI stay in sync.
ANALYSIS_DIMENSIONS = [
    "overall_score", "ats_score", "grammar_score", "readability_score",
    "achievement_score", "impact_score", "action_verb_score", "formatting_score",
    "technical_skills_score", "soft_skills_score", "leadership_score",
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


def build_analyze_prompt(resume_text: str, job_description: str | None = None, sections: list[dict] | None = None) -> str:
    """`sections` (optional) are the live view's {id, section_type, title, content}
    — when given, the model links top_suggestions to a concrete section_id +
    full replacement content, so the caller can offer a one-click "Apply" that
    writes the fix straight back (reusing the tailor/apply endpoint's shape:
    {section_id, title, content})."""
    jd_block = f"\n\nTARGET JOB DESCRIPTION (score ATS/keyword fit against this):\n{job_description}\n" if job_description else ""
    scores = ", ".join(ANALYSIS_DIMENSIONS)
    sections_block = ""
    fix_instructions = ""
    if sections:
        editable = [
            {"id": s["id"], "section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
            for s in sections
            if s.get("section_type") != "personal_info"
        ]
        sections_block = f"\n\nRESUME SECTIONS (JSON — each has an \"id\"; use these ids to link a fix to a section):\n{json.dumps(editable, ensure_ascii=False)}\n"
        fix_instructions = (
            ' When a suggestion is a concrete rewrite of one section\'s content (not a general observation), ALSO include'
            ' "section_id" (must match one of the ids above) and "content" (the FULL rewritten content object, in the exact'
            ' same shape as that section\'s current content — e.g. experience/education/projects use {"items": [...]}, skills'
            ' uses {"groups": [...]}, summary uses {"text": ...}). Omit both fields for suggestions that don\'t map to one section.'
        )
    return f"""You are a world-class technical recruiter and resume coach. Analyze the resume below and return a STRICT JSON object (no markdown, no prose outside the JSON).

RESUME:
{resume_text or "(empty resume)"}{jd_block}{sections_block}

Return a JSON object with EXACTLY these keys:
- Numeric scores 0-100 (integers): {scores}
- "keyword_match": object with "matched": string[] and "missing": string[]
- "resume_length": short string assessment (e.g. "1 page — appropriate")
- List fields (arrays of objects, each with "text" and "suggestion"): {", ".join(ANALYSIS_LISTS)}
- "summary": a 2-3 sentence overall assessment string
- "top_suggestions": array of the 3-5 highest-impact fixes, each an object with "title", "severity" ("high"|"medium"|"low"), "explanation", and "suggested_rewrite".{fix_instructions}

For every weak bullet, cliche, or red flag, include a concrete "suggestion" rewrite. Be specific and honest. Output ONLY the JSON object."""


def build_section_analysis_prompt(
    sections: list[dict], job_description: str | None = None, job_title: str | None = None,
) -> str:
    """Per-section resume analysis: for each visible, non-personal_info section,
    return what's good, what needs improvement, and a suggested rewrite — plus
    one overall score. Distinct from build_analyze_prompt's flat dimension-score
    report; this is a Summary/Skills/Experience/Education/Projects-shaped
    breakdown, one entry per section, each carrying its own rewrite."""
    editable = [
        {"id": s["id"], "section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
        for s in sections
        if not s.get("is_hidden") and s.get("section_type") != "personal_info"
    ]
    jd_block = ""
    fit_bit = ""
    if job_description and job_description.strip():
        title_bit = f' for the role "{job_title}"' if job_title else ""
        jd_block = f"""

TARGET JOB DESCRIPTION{title_bit} (score fit against this; without it, judge general resume quality only):
{job_description.strip()}"""
        fit_bit = " and fit for the target role"
    return f"""You are a world-class technical recruiter and resume coach. Review the resume sections below, section by section.{jd_block}

RESUME SECTIONS (JSON — each has an "id"; use these ids in your response):
{json.dumps(editable, ensure_ascii=False)}

Return a STRICT JSON object (no markdown, no prose outside the JSON) with EXACTLY these keys:
- "overall_score": integer 0-100 — overall resume quality{fit_bit}.
- "overall_summary": 1-2 sentence overall assessment.
- "sections": array with ONE entry per section listed above, each an object:
    {{"section_id": the section's id (MUST match one above),
      "good": string[] — 1-3 specific things this section already does well (empty array if genuinely nothing stands out),
      "improve": string[] — 1-4 specific, actionable gaps or weaknesses{' (include job-description keyword/skill gaps)' if job_description else ''},
      "suggested_rewrite": string or null — a ready-to-use rewritten version of this section's content as plain text (one bullet per line, prefixed "- ", for sections that have bullets/items), tailored to fix the "improve" points{' and better match the job description' if job_description else ''}. Null only if the section is already strong and needs no rewrite. Never invent facts, employers, dates, or accomplishments not present in the original content.}}

Be honest and specific — do not inflate scores to be encouraging. Output ONLY the JSON object."""


def build_section_rewrite_prompt(
    section_type: str, title: str | None, current_text: str, instruction: str | None,
    job_description: str | None = None,
) -> str:
    ask = instruction or "Rewrite this to be more impactful, concise, and achievement-oriented (strong action verbs, quantified results). Keep it truthful to the input."
    jd_block = ""
    if job_description and job_description.strip():
        jd_block = f"""

TARGET JOB DESCRIPTION (tailor this section toward it — mirror relevant language/keywords HONESTLY, never invent experience the candidate doesn't have):
{job_description.strip()}"""
    return f"""You are a resume-writing expert. Rewrite the following resume section content.

SECTION: {title or section_type} (type: {section_type})
INSTRUCTION: {ask}{jd_block}

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


_ENRICHMENT_KIND_LABELS = {
    "resume": "an additional resume",
    "certificates": "a certificate or credential",
    "research_papers": "a research paper or publication",
    "project_documentation": "project documentation",
    "github_readme": "a GitHub README",
    "linkedin_export": "a LinkedIn profile export",
    "context": "freeform context the candidate typed",
    "json": "structured JSON supplied directly",
    "experience_letter": "an employment experience letter",
    "offer_letter": "a job offer letter",
    "transcript": "an academic transcript",
    "multiple": "multiple documents (may span several file types)",
}


def build_enrichment_prompt(existing_sections: list[dict], incoming_sections: list[dict], kind: str) -> str:
    """Compare newly-resolved sections (from one more document) against a
    profile's EXISTING sections, and classify each piece of incoming content as
    a pure addition, a duplicate of something already there, or a conflict
    (contradicts an existing fact — different dates, seniority, claims, etc.).
    Used by Profile Enrichment; the caller applies nothing until the user
    reviews and accepts this classification."""
    existing = [
        {"id": s["id"], "section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
        for s in existing_sections
        if s.get("section_type") != "personal_info"
    ]
    incoming = [
        {"section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
        for s in incoming_sections
        if s.get("section_type") != "personal_info"
    ]
    kind_label = _ENRICHMENT_KIND_LABELS.get(kind, "additional information")
    return f"""You are helping merge new career information into an existing candidate profile. The new material is {kind_label}. For each piece of NEW content, decide whether it is:
- an ADDITION: genuinely new information not already in the profile.
- a DUPLICATE: substantially the same fact already present (e.g. the same job, same skill, same degree) — even if worded differently.
- a CONFLICT: contradicts something already in the profile (different dates, different seniority/title for the same role, a claim that doesn't match, etc.).

EXISTING PROFILE SECTIONS (JSON — each has an "id"):
{json.dumps(existing, ensure_ascii=False)}

NEW CONTENT TO MERGE (JSON, no ids — this is what you're classifying):
{json.dumps(incoming, ensure_ascii=False)}

Return a STRICT JSON object (no markdown, no prose outside the JSON) with EXACTLY these keys:
- "additions": array of {{"section_type", "title", "content" (same shape as the existing sections' content for that type), "rationale": short reason this is new, "confidence": 0-100}}
- "duplicates": array of {{"existing_section_id": id from EXISTING that this duplicates, "incoming_summary": 1 short sentence describing the duplicate new content, "reason": why it's a duplicate, "confidence": 0-100}}
- "conflicts": array of {{"existing_section_id": id from EXISTING that this contradicts, "existing_summary": 1 short sentence of the current fact, "incoming_summary": 1 short sentence of the new, conflicting fact, "incoming_content": the new content in the SAME shape as that existing section's content, "suggested_content": your best-guess MERGED content reconciling both (same shape), "rationale": why you think these conflict and how you resolved it, "confidence": 0-100}}

Every "content"/"incoming_content"/"suggested_content" value MUST use the same shape as content for that section_type (personal_info: name/title/email/phone/location/links; summary: text; experience/education/projects/certifications/awards: items with title/subtitle/date/bullets; skills: groups with name/items). Do not invent facts that appear nowhere in either input. Output ONLY the JSON object."""


def build_tailor_prompt(sections: list[dict], job_text: str, notes: str | None = None) -> str:
    """Rewrite a resume's sections to target a specific job description.

    `sections` is a list of {id, section_type, title, content} for the live
    draft. The model returns per-section rewrites keyed by the SAME id so the
    caller can apply them precisely, plus a change summary and added keywords.
    """
    editable = [
        {"id": s["id"], "section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
        for s in sections
        if not s.get("is_hidden") and s.get("section_type") != "personal_info"
    ]
    notes_block = f"\n\nEXTRA CONTEXT / INSTRUCTIONS FROM THE CANDIDATE:\n{notes}\n" if notes else ""
    return f"""You are an expert resume writer and technical recruiter. Rewrite the candidate's resume sections so they are TARGETED to the job description below — surface the most relevant experience, mirror the role's language and keywords HONESTLY (never invent experience the candidate doesn't have), lead bullets with strong action verbs and quantified impact, and drop or de-emphasize irrelevant detail.

TARGET JOB DESCRIPTION:
{job_text or "(none provided)"}{notes_block}

CURRENT RESUME SECTIONS (JSON — each has an "id", "section_type", "title", and "content" object):
{json.dumps(editable, ensure_ascii=False)}

Return a STRICT JSON object (no markdown, no prose outside the JSON) with EXACTLY these keys:
- "summary": 1-2 sentences describing how you tailored the resume for this role.
- "keywords_added": string[] — important JD keywords/skills you worked into the resume.
- "updates": array of objects, one PER SECTION YOU CHANGED, each:
    {{"section_id": the section's original id (string, MUST match one above),
      "title": the (possibly unchanged) section title,
      "content": the FULL rewritten content object in the SAME SHAPE as that section's current content,
      "rationale": a short reason this change improves fit}}

Content shapes to preserve exactly:
- summary: {{"text": string}}
- experience/education/projects/certifications/awards/achievements/research/volunteer/custom: {{"items": [{{"title","subtitle","date","bullets":[]}}]}}
- skills: {{"groups": [{{"name","items":[]}}]}}

Only include sections you actually improved. Keep everything truthful to the candidate's real background. Output ONLY the JSON object."""


def build_generate_with_gap_prompt(
    sections: list[dict], job_text: str, notes: str | None = None,
    target_role: str | None = None, target_company: str | None = None,
) -> str:
    """Like build_tailor_prompt, but for a Master Profile's sections (not a live
    view's), and ALSO asks for a structured gap-analysis report alongside the
    tailored rewrites — used by the one-step "Generate a resume for this job" flow
    so the user sees fit/gaps before the tailored profile is created, without a
    second LLM round-trip.
    """
    editable = [
        {"id": s["id"], "section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
        for s in sections
        if not s.get("is_hidden") and s.get("section_type") != "personal_info"
    ]
    notes_block = f"\n\nEXTRA CONTEXT / INSTRUCTIONS FROM THE CANDIDATE:\n{notes}\n" if notes else ""
    target_bits = []
    if target_role:
        target_bits.append(f'Target role: "{target_role}" — actively frame the candidate\'s real experience in this role\'s language, even where the job posting itself uses different terms.')
    if target_company:
        target_bits.append(f'Target company: "{target_company}" — where you can do so honestly, mirror the tone/keywords typical of how {target_company} describes this kind of role (without fabricating anything about the company itself).')
    target_block = "\n\nTARGETING GUIDANCE (from the candidate, not the job posting):\n" + "\n".join(f"- {b}" for b in target_bits) + "\n" if target_bits else ""
    return f"""You are an expert resume writer, technical recruiter, and ATS specialist. You will (1) rewrite the candidate's resume sections so they are TARGETED to the job description below, and (2) analyze how well the candidate's REAL background fits the role.

TARGET JOB DESCRIPTION:
{job_text or "(none provided)"}{target_block}{notes_block}

CURRENT RESUME SECTIONS (JSON — each has an "id", "section_type", "title", and "content" object):
{json.dumps(editable, ensure_ascii=False)}

Rewrite rules: surface the most relevant experience, mirror the role's language and keywords HONESTLY (never invent experience the candidate doesn't have), lead bullets with strong action verbs and quantified impact, drop or de-emphasize irrelevant detail, and only propose new sections per the "new_sections" honesty rule below.

Return a STRICT JSON object (no markdown, no prose outside the JSON) with EXACTLY these keys:
- "summary": 1-2 sentences describing how you tailored the resume for this role.
- "keywords_added": string[] — important JD keywords/skills you worked into the resume.
- "updates": array of objects, one PER SECTION YOU CHANGED, each:
    {{"section_id": the section's original id (string, MUST match one above),
      "title": the (possibly unchanged) section title,
      "content": the FULL rewritten content object in the SAME SHAPE as that section's current content,
      "rationale": a short reason this change improves fit}}
- "new_sections": array of BRAND-NEW sections to add (types NOT already present in the
    resume above) that the job posting clearly calls for, each:
    {{"section_type": one of ["certifications","awards","achievements","research","languages","volunteer","publications","interests","custom"],
      "title": a short section title,
      "content": the content object in the shape for that type (see "Content shapes" below),
      "rationale": why this section helps for this specific job}}
    CRITICAL HONESTY RULE: only propose a new section if you can populate it TRUTHFULLY
    using information already present elsewhere in the candidate's real sections above
    (e.g. a certification mentioned inline in an Experience bullet, promoted to its own
    entry) — OR propose it with EMPTY/placeholder content for the user to fill in
    themselves. NEVER invent a credential, certification, publication, or experience
    that isn't already evidenced above. If nothing qualifies, return an empty array.
- "gap_analysis": an object assessing fit BEFORE your rewrites, based on the candidate's real background, with EXACTLY these keys:
    {{"fit_score": integer 0-100 — overall fit for this specific role,
      "matched_skills": string[] — skills/requirements from the JD the candidate demonstrably has,
      "missing_skills": string[] — required or strongly preferred JD skills/experience (NOT certifications — see below) not evidenced anywhere in the resume,
      "missing_certifications": string[] — specific certifications/credentials/licenses the JD requires or prefers (e.g. "AWS Certified Solutions Architect", "PMP", "CPA") that the candidate's resume doesn't show. Empty array if the JD names none or the candidate already has them all.
      "ats_keywords_missing": string[] — exact JD phrases/keywords worth adding verbatim for ATS keyword matching,
      "experience_gap": string — one sentence on seniority/years-of-experience mismatch if any, else an empty string,
      "recommendations": string[] — 2-4 short, concrete, actionable suggestions beyond what you already rewrote (e.g. skills to learn, certifications, projects to add)}}

Content shapes to preserve exactly:
- summary: {{"text": string}}
- experience/education/projects/certifications/awards/achievements/research/volunteer/custom: {{"items": [{{"title","subtitle","date","bullets":[]}}]}}
- skills: {{"groups": [{{"name","items":[]}}]}}

Only include sections you actually improved in "updates". Be honest and specific in "gap_analysis" — do not inflate fit_score to be encouraging; recruiters rely on this being accurate. Output ONLY the JSON object."""


def build_job_match_prompt(
    sections: list[dict], job_text: str,
    target_role: str | None = None, target_company: str | None = None,
) -> str:
    """Like build_generate_with_gap_prompt's gap_analysis half, but standalone —
    for the Job Matcher, which reports fit WITHOUT generating a tailored resume
    (no rewrite pass, so no wasted LLM round-trip on content nobody asked for)."""
    editable = [
        {"section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
        for s in sections
        if not s.get("is_hidden") and s.get("section_type") != "personal_info"
    ]
    target_bits = []
    if target_role:
        target_bits.append(f'Target role: "{target_role}".')
    if target_company:
        target_bits.append(f'Target company: "{target_company}".')
    target_block = "\n\nTARGETING GUIDANCE (from the candidate, not the job posting):\n" + "\n".join(f"- {b}" for b in target_bits) + "\n" if target_bits else ""
    return f"""You are an expert technical recruiter and ATS specialist. Assess how well the candidate's REAL background fits the job below. Do NOT rewrite anything — only report fit.

TARGET JOB DESCRIPTION:
{job_text or "(none provided)"}{target_block}

CANDIDATE'S RESUME SECTIONS (JSON — each has "section_type", "title", "content"):
{json.dumps(editable, ensure_ascii=False)}

Return a STRICT JSON object (no markdown, no prose outside the JSON) with EXACTLY one key, "gap_analysis", an object with EXACTLY these keys:
{{"fit_score": integer 0-100 — overall fit for this specific role,
  "matched_skills": string[] — skills/requirements from the JD the candidate demonstrably has,
  "missing_skills": string[] — required or strongly preferred JD skills/experience (NOT certifications — see below) not evidenced anywhere in the resume,
  "missing_certifications": string[] — specific certifications/credentials/licenses the JD requires or prefers (e.g. "AWS Certified Solutions Architect", "PMP", "CPA") that the candidate's resume doesn't show. Empty array if the JD names none or the candidate already has them all.
  "ats_keywords_missing": string[] — exact JD phrases/keywords worth adding verbatim for ATS keyword matching,
  "experience_gap": string — one sentence on seniority/years-of-experience mismatch if any, else an empty string,
  "recommendations": string[] — 2-4 short, concrete, actionable suggestions (e.g. skills to learn, certifications, projects to add)}}

Be honest and specific — do not inflate fit_score to be encouraging; recruiters rely on this being accurate. Output ONLY the JSON object."""


COVER_LETTER_TONES = {
    "professional": "warm but professional and measured — confident, no exaggeration",
    "enthusiastic": "genuinely enthusiastic and energetic, while staying credible — show real excitement for the role",
    "concise": "short and to-the-point — every sentence earns its place, no filler, aim for well under half a page",
}


def build_cover_letter_prompt(sections: list[dict], job_text: str, tone: str = "professional", notes: str | None = None) -> str:
    """Generate a full cover letter from a candidate's real profile sections plus
    a job target. `tone` picks a style guideline from COVER_LETTER_TONES (the
    spec's "multiple templates" — scoped as tone presets, not a visual layout
    system, since a cover letter is prose)."""
    editable = [
        {"section_type": s.get("section_type"), "title": s.get("title"), "content": s.get("content")}
        for s in sections
        if not s.get("is_hidden")
    ]
    tone_desc = COVER_LETTER_TONES.get(tone, COVER_LETTER_TONES["professional"])
    notes_block = f"\n\nEXTRA CONTEXT / INSTRUCTIONS FROM THE CANDIDATE:\n{notes}\n" if notes else ""
    return f"""You are an expert career coach writing a cover letter on behalf of the candidate below. Write a complete, ready-to-send cover letter tailored to the job description, using ONLY real details evidenced in the candidate's sections — never invent experience, employers, titles, or accomplishments.

TONE: {tone_desc}

TARGET JOB DESCRIPTION:
{job_text or "(none provided)"}{notes_block}

CANDIDATE'S RESUME SECTIONS (JSON — each has "section_type", "title", "content"):
{json.dumps(editable, ensure_ascii=False)}

Write the full letter body (greeting through sign-off, e.g. "Dear Hiring Manager," … "Sincerely, [Candidate Name]" if a name is available in personal_info, else omit a name in the sign-off rather than inventing one). Plain text, paragraphs separated by blank lines — no markdown, no headers, no placeholder brackets except a genuinely unknown recipient name.

Return a STRICT JSON object (no markdown, no prose outside the JSON) with EXACTLY these keys:
- "content_text": string — the full letter body as described above.
- "summary": string — one sentence on the angle you took.

Output ONLY the JSON object."""


def build_job_extraction_prompt(raw_text: str) -> str:
    """Extract a structured Job Profile from a job posting's raw text (already
    fetched/cleaned if it came from a URL). Used by a preview-only endpoint — the
    result is shown to the user before anything is saved."""
    return f"""You are an expert technical recruiter. Extract a structured summary from the job posting below.

JOB POSTING TEXT:
{raw_text}

Return a STRICT JSON object (no markdown, no prose outside the JSON) with EXACTLY these keys:
- "title": string or null — the role's job title.
- "company": string or null — the hiring company, if named.
- "location": string or null — e.g. "Remote", "San Francisco, CA (hybrid)".
- "employment_type": string or null — e.g. "Full-time", "Contract", "Internship".
- "experience_level": string or null — e.g. "Entry", "Mid", "Senior", "Staff", "Principal".
- "education": string or null — stated education requirement, if any.
- "salary": string or null — stated compensation range, if any.
- "required_skills": string[] — must-have skills/technologies/qualifications.
- "preferred_skills": string[] — nice-to-have skills explicitly called out as preferred/bonus.
- "responsibilities": string[] — the core day-to-day responsibilities, each a short phrase.
- "benefits": string[] — stated perks/benefits, if any.
- "certifications": string[] — required or preferred certifications, if any.
- "confidence": integer 0-100 — your confidence that this extraction is complete and accurate given how clearly the posting was structured (a vague or truncated posting should score lower).

Use empty arrays / null for anything not clearly stated — never invent details that aren't in the text. Output ONLY the JSON object."""


PORTFOLIO_DIMENSIONS = [
    "overall_score", "design_score", "ux_score", "content_score", "seo_score",
    "accessibility_score", "personal_branding_score", "navigation_score",
    "responsiveness_score", "recruiter_friendliness_score",
]


def portfolio_to_text(widgets: list[dict]) -> str:
    """Flatten portfolio widgets into readable plain text for the LLM."""
    blocks: list[str] = []
    for w in widgets:
        if w.get("is_hidden"):
            continue
        title = w.get("title") or w.get("widget_type", "Widget")
        body = _stringify(w.get("content"))
        blocks.append(f"## {title} ({w.get('widget_type')})\n{body}".strip())
    return "\n\n".join(b for b in blocks if b).strip()


def build_portfolio_analyze_prompt(portfolio_text: str) -> str:
    scores = ", ".join(PORTFOLIO_DIMENSIONS)
    return f"""You are a senior design + technical-recruiting reviewer. Assess the developer portfolio described below (content and structure) and return a STRICT JSON object (no markdown, no prose outside the JSON).

PORTFOLIO CONTENT:
{portfolio_text or "(empty portfolio)"}

Return a JSON object with EXACTLY these keys:
- Numeric scores 0-100 (integers): {scores}
- "summary": a 2-3 sentence overall assessment string
- List fields (arrays of objects each with "text" and "suggestion"): "missing_sections", "content_gaps", "branding_issues", "red_flags"
- "top_suggestions": array of the 3-5 highest-impact improvements, each with "title", "severity" ("high"|"medium"|"low"), "explanation", and "suggested_rewrite"

Judge clarity of personal branding, project storytelling, whether a recruiter can quickly grasp strengths, and what's missing. Output ONLY the JSON object."""


def to_json_debug(obj: Any) -> str:
    return json.dumps(obj, indent=2)
