"""Modular prompt construction for the LinkedIn post generator.

Builds prompts as clearly separated sections rather than one unstructured
blob, and treats each selected template type differently:
  - prompt / custom          -> explicit generation instructions
  - reference_post           -> contextual & structural inspiration only
  - creator_post             -> style characteristics only, never copied
  - writing_style            -> direct style instructions
  - post_structure            -> structural framework to follow
"""

from __future__ import annotations

from typing import List, Optional


SAFETY_INSTRUCTIONS = """SAFETY / ORIGINALITY INSTRUCTIONS
- Do not copy sentences or distinctive phrases from any reference or creator post.
- Do not reproduce another person's personal experiences as if they were the user's own.
- Do not imitate a specific living creator's exact voice word-for-word.
- Extract only general structural characteristics, tone, and formatting patterns from references.
- Generate wholly original content grounded in the user's own topic and context."""


def _section(title: str, body: str) -> str:
    return f"{title}\n{body}"


def build_generate_prompt(
    *,
    topic: str,
    category: Optional[str],
    context: Optional[str],
    pdf_text: Optional[str],
    tone: Optional[str],
    post_type: Optional[str],
    templates: List[dict],
    variation: bool = False,
) -> str:
    sections: List[str] = [
        _section(
            "SYSTEM INSTRUCTIONS",
            "You are an expert LinkedIn ghostwriter and personal branding strategist. "
            "Write a single, ready-to-publish LinkedIn post using the inputs below.",
        ),
        _section("USER TOPIC", topic),
    ]

    if category:
        sections.append(_section("CATEGORY", category))

    if context:
        sections.append(_section("USER CONTEXT", context))

    if pdf_text:
        sections.append(_section("SOURCE DOCUMENT CONTEXT", pdf_text))

    reference_posts = [t for t in templates if t["type"] == "reference_post"]
    creator_posts = [t for t in templates if t["type"] == "creator_post"]
    prompt_templates = [t for t in templates if t["type"] in ("prompt", "custom")]
    writing_styles = [t for t in templates if t["type"] == "writing_style"]
    post_structures = [t for t in templates if t["type"] == "post_structure"]

    if reference_posts:
        blob = "\n\n---\n\n".join(t["content"] for t in reference_posts)
        sections.append(_section(
            "REFERENCE POSTS (structural & contextual inspiration only — do not copy)",
            blob,
        ))

    if creator_posts:
        blob = "\n\n---\n\n".join(
            f"{t['title']}:\n{t.get('styleAnalysis') or t['content']}" for t in creator_posts
        )
        sections.append(_section(
            "CREATOR POST STYLE CHARACTERISTICS (mimic style traits only, never the content)",
            blob,
        ))

    if prompt_templates:
        blob = "\n\n".join(t["content"] for t in prompt_templates)
        sections.append(_section("SELECTED PROMPT TEMPLATES (explicit generation instructions)", blob))

    if writing_styles:
        blob = "\n\n".join(t["content"] for t in writing_styles)
        sections.append(_section("SELECTED WRITING STYLES (apply directly as style instructions)", blob))

    if post_structures:
        blob = "\n\n".join(t["content"] for t in post_structures)
        sections.append(_section("SELECTED POST STRUCTURES (use as the structural framework)", blob))

    if tone:
        sections.append(_section("TONE", tone))
    if post_type:
        sections.append(_section("POST TYPE", post_type))

    output_requirements = (
        "Write ONLY the LinkedIn post text itself — no preamble, no explanation, no quotation "
        "marks around it. Use short paragraphs and line breaks the way high-performing LinkedIn "
        "posts do. Be specific and authentic, not generic."
    )
    if variation:
        output_requirements += (
            " This is an ALTERNATE version — use a different angle, hook, or structure than a "
            "typical first draft would, while staying true to the same topic and context."
        )
    sections.append(_section("OUTPUT REQUIREMENTS", output_requirements))
    sections.append(SAFETY_INSTRUCTIONS)

    return "\n\n".join(sections)


REFINE_INSTRUCTIONS = {
    "improve_hook": (
        "Rewrite ONLY the opening hook (first 1-2 lines) to be more curiosity-driven and "
        "attention-grabbing. Keep the rest of the post's content and structure unchanged."
    ),
    "shorten": "Rewrite this post to be noticeably shorter and tighter, keeping the core message and hook intact.",
    "expand": "Expand this post with more supporting detail, examples, or a stronger conclusion, while keeping the same core message and voice.",
    "change_tone": "Rewrite this post in a different tone as specified below, keeping the same content and structure.",
}


def build_refine_prompt(*, post: str, action: str, tone: Optional[str] = None) -> str:
    instruction = REFINE_INSTRUCTIONS.get(action, "Rewrite this post, improving it while preserving its core message.")
    if action == "change_tone" and tone:
        instruction += f"\n\nTarget tone: {tone}"

    return f"""You are an expert LinkedIn ghostwriter editing an existing post.

ORIGINAL POST
{post}

EDIT INSTRUCTION
{instruction}

Respond with ONLY the revised LinkedIn post text — no preamble, no explanation, no quotation marks around it."""


def build_analyze_prompt(post_text: str) -> str:
    return f"""You are an expert LinkedIn content strategist analyzing a post's writing style.

POST TO ANALYZE
\"\"\"
{post_text}
\"\"\"

Analyze the post across these dimensions and describe HOW it is written, not what it is about:
- hook: hook type/structure, curiosity mechanism, emotional trigger, why it's effective
- tone: formality, personality, confidence, emotional characteristics, conversational style
- writingStyle: sentence length, paragraph length, vocabulary complexity, rhythm, sentence fragments, questions, repetition, transitions
- postStructure: the structural pattern (e.g. Hook -> Personal Context -> Problem -> Turning Point -> Insight -> Lessons -> Conclusion -> CTA)
- formatting: white space, line breaks, bullet points, emoji usage, capitalization, punctuation, paragraph size
- storytelling: narrative technique, conflict, transformation, vulnerability, credibility, emotional progression
- engagementTechniques: open loops, questions, contrarian statements, curiosity gaps, calls to action, comment triggers

Then write a "stylePrompt": a reusable instruction describing HOW to write in this style (not what the
original post is about), specific enough that an AI could use it to write a brand-new post in this
voice. For example: "Write a LinkedIn post using short conversational paragraphs and strategic
whitespace. Begin with a curiosity-driven hook..."

Finally write a "regeneratedPost": a brand-new example LinkedIn post (different topic/content) that
authentically demonstrates this same style.

Respond with ONLY a valid JSON object (no markdown, no text outside it), in this exact shape:
{{
  "analysis": {{
    "hook": "...", "tone": "...", "writingStyle": "...", "postStructure": "...",
    "formatting": "...", "storytelling": "...", "engagementTechniques": "..."
  }},
  "stylePrompt": "...",
  "regeneratedPost": "..."
}}"""
