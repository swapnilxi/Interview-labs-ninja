"""What a lab is told about the selected project: retrieval of saved sections and the prompt text.

`frontend/fe-apis/labProjects/knowledge.ts` is the Next.js twin of this file. The tokenizer, the ranking
and every prompt string are copied verbatim, so the two backends retrieve the same sections and ask the
model the same thing -- change both together.

The core project (name, description, context) is always sent. Saved sections are different: a project
can hold hundreds, so only the few that are relevant to the task at hand go into the prompt (BM25 over
the sections, a relevance cut-off, a character budget, and an excerpt of the best-matching passages of
each long section). A section is never selected from another project: the corpus is loaded by
(user, project) in store.py.
"""

from __future__ import annotations

import math
import re
from typing import Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException

from .store import get_project, list_sections_with_content

# ── Retrieval ─────────────────────────────────────────────────────────────────

MAX_KNOWLEDGE_SECTIONS = 4
MAX_KNOWLEDGE_CHARS = 6000
MAX_SECTION_CHARS = 1800
# A section has to score at least this fraction of the best one to be worth the prompt space.
RELATIVE_CUTOFF = 0.3
# Words in a title count this many times in the section's term statistics.
TITLE_WEIGHT = 3
_K1 = 1.5
_B = 0.75

_TOKEN = re.compile(r"[^\W_]+")
_STOPWORDS = frozenset(
    "a an and are as at be but by for from has have how if in into is it its of on or that the their then "
    "there these this to was we what when where which who why will with you your can do does not no so than "
    "too very".split()
)


def _stem(token: str) -> str:
    """Folds simple plurals together ('queries'/'query', 'trees'/'tree'); both sides of a match get the same treatment."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> List[str]:
    out = []
    for raw in _TOKEN.findall((text or "").lower()):
        if len(raw) < 2 or raw in _STOPWORDS:
            continue
        out.append(_stem(raw))
    return out


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _unique(items: Iterable[str]) -> List[str]:
    seen: Dict[str, bool] = {}
    for item in items:
        seen.setdefault(item, True)
    return list(seen)


def rank_sections(sections: List[dict], query: str) -> List[Tuple[int, int]]:
    """(score, index) for every section that shares a term with the query, best first.

    `sections` must already be newest-first: a tie in score is broken by that order, so newer wins.
    Scores are integers (BM25 x 1e6, rounded) so both backends order identically.
    """
    terms = _unique(tokenize(query))
    if not terms or not sections:
        return []
    docs = [tokenize(s["title"]) * TITLE_WEIGHT + tokenize(s["content"]) for s in sections]
    n = len(docs)
    avg_len = (sum(len(d) for d in docs) / n) or 1.0
    doc_freq: Dict[str, int] = {t: sum(1 for d in docs if t in d) for t in terms}
    scored: List[Tuple[int, int]] = []
    for i, doc in enumerate(docs):
        counts: Dict[str, int] = {}
        for tok in doc:
            counts[tok] = counts.get(tok, 0) + 1
        score = 0.0
        for t in terms:
            f = counts.get(t, 0)
            if not f:
                continue
            idf = math.log(1 + (n - doc_freq[t] + 0.5) / (doc_freq[t] + 0.5))
            score += idf * (f * (_K1 + 1)) / (f + _K1 * (1 - _B + _B * len(doc) / avg_len))
        if score > 0:
            scored.append((math.floor(score * 1e6 + 0.5), i))
    scored.sort(key=lambda pair: (-pair[0], pair[1]))
    return scored


def _blocks(text: str) -> List[str]:
    """Paragraph-sized pieces of a Markdown body; a blank line inside a code fence doesn't split it."""
    blocks: List[str] = []
    current: List[str] = []
    in_fence = False
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            in_fence = not in_fence
        if not in_fence and not line.strip():
            if current:
                blocks.append("\n".join(current))
                current = []
            continue
        current.append(line)
    if current:
        blocks.append("\n".join(current))
    return blocks


_OMISSION = "\n[… the rest of this section is saved in the project]"


def excerpt_for(content: str, terms: List[str], budget: int) -> str:
    """The whole section if it fits `budget` characters, else its title block plus the passages that mention
    the query terms, closed by a note that the rest was left out (the note counts toward the budget)."""
    text = (content or "").strip()
    if len(text) <= budget:
        return text
    budget = max(budget - len(_OMISSION), 1)
    blocks = _blocks(text)
    wanted = set(terms)
    ranked = sorted(
        ((len({t for t in tokenize(b)} & wanted), i) for i, b in enumerate(blocks)),
        key=lambda pair: (-pair[0], pair[1]),
    )
    chosen = {0}
    used = min(len(blocks[0]), budget)
    for hits, i in ranked:
        if hits == 0:
            break
        if i in chosen or used + len(blocks[i]) + 2 > budget:
            continue
        chosen.add(i)
        used += len(blocks[i]) + 2
    out = "\n\n".join(blocks[i] for i in sorted(chosen))
    if len(out) > budget:
        out = out[: budget - 1].rstrip() + "…"
    return out + _OMISSION


def select_knowledge(
    sections: List[dict],
    query: str,
    *,
    exclude_generation_prefix: str = "",
    existing_content: str = "",
) -> List[dict]:
    """The saved sections worth putting in this generation's prompt, most relevant first.

    Left out on purpose: a section copied from the very page-section being (re)generated (its old text
    would anchor the new one), one identical to the content being revised, and exact duplicates of
    another section (the newest copy stays).
    """
    current = _normalise(existing_content)
    seen = set()
    corpus: List[dict] = []
    for s in sections:  # newest first
        if exclude_generation_prefix and (s.get("sourceGenerationId") or "").startswith(exclude_generation_prefix):
            continue
        key = _normalise(s["content"])
        if not key or key == current or key in seen:
            continue
        seen.add(key)
        corpus.append(s)

    ranked = rank_sections(corpus, query)
    if not ranked:
        return []
    cutoff = ranked[0][0] * RELATIVE_CUTOFF
    terms = _unique(tokenize(query))
    picked: List[dict] = []
    remaining = MAX_KNOWLEDGE_CHARS
    for score, i in ranked[:MAX_KNOWLEDGE_SECTIONS]:
        if score < cutoff or remaining < 300:
            break
        s = corpus[i]
        text = excerpt_for(s["content"], terms, min(MAX_SECTION_CHARS, remaining))
        remaining -= len(text)
        picked.append(
            {
                "id": s["id"],
                "title": s["title"],
                "sourceLabName": s["sourceLabName"],
                "updatedAt": s["updatedAt"],
                "text": text,
            }
        )
    return picked


def load_project_context(
    user_id: int,
    project_id: int,
    *,
    query: str,
    exclude_generation_prefix: str = "",
    existing_content: str = "",
) -> Tuple[dict, List[dict]]:
    """The user's active project and the saved knowledge relevant to `query`, or an HTTP error.

    404 for a project that doesn't exist *for this user* (the same answer for someone else's), 409 for an
    archived one.
    """
    project = get_project(user_id, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project["status"] != "active":
        raise HTTPException(status_code=409, detail="This project is archived. Restore it or pick another project.")
    sections = list_sections_with_content(user_id, project_id)
    knowledge = select_knowledge(
        sections, query, exclude_generation_prefix=exclude_generation_prefix, existing_content=existing_content
    )
    return project, knowledge


def generation_ref(lab: str, topic_id: str, subtopic_id: str, section_id: str, generated_at: Optional[str] = None) -> str:
    """Identifies one lab page-section (and, with `generated_at`, one generation of it)."""
    base = f"{lab}|{topic_id}|{subtopic_id}|{section_id}@"
    return base + generated_at if generated_at else base


# ── Prompt text ───────────────────────────────────────────────────────────────


def _project_block(project: dict) -> str:
    lines = [f"Project: {project['name']}"]
    description = (project.get("description") or "").strip()
    if description:
        lines.append(f"Project description: {description}")
    block = "\n".join(lines)
    context = (project.get("context") or "").strip()
    if context:
        block += (
            "\n\nProject context (written by the learner; the authoritative source on this project):"
            f'\n"""\n{context}\n"""'
        )
    else:
        block += "\n\nThe learner has not written any further project context yet."
    return block


def _knowledge_block(knowledge: List[dict]) -> str:
    if not knowledge:
        return ""
    entries = []
    for n, k in enumerate(knowledge, start=1):
        entries.append(
            f'[{n}] "{k["title"]}" — from {k["sourceLabName"]}, updated {str(k["updatedAt"])[:10]}\n"""\n{k["text"]}\n"""'
        )
    return (
        "Saved project knowledge (sections the learner chose to keep from their labs, most relevant first, "
        "each with its title, source lab and last-updated date):\n" + "\n".join(entries)
    )


def _context_blocks(project: Optional[dict], knowledge: List[dict]) -> str:
    if not project:
        return ""
    out = "\n\n" + _project_block(project)
    knowledge_block = _knowledge_block(knowledge)
    if knowledge_block:
        out += "\n\n" + knowledge_block
    return out


_NO_INVENTION = (
    "- Use only facts that appear in the project description, the project context or the saved knowledge. "
    "Never invent project requirements, datasets, numbers or decisions."
)
_CONFLICTS = (
    "- Saved knowledge is background, not a script: refer to it by its title instead of repeating it. If saved "
    "sections contradict each other or the project context, follow the project context first, then the newer "
    "section, and mention the contradiction in one line instead of silently picking a side."
)


def section_prompt_parts(project: Optional[dict], knowledge: List[dict]) -> Tuple[str, str, str]:
    """(role suffix, project + knowledge blocks, project rules) for a lab section prompt; all '' without a project."""
    if not project:
        return "", "", ""
    rules = (
        f"\n\nProject rules (this section is written FOR the project “{project['name']}”, not as a generic lesson):\n"
        "- Let the project shape the content itself: take the examples, code, data, constraints and trade-offs from "
        "the project's own domain, and tie each major part to the project's real situation. Do not paste the project "
        "description back, and do not write a generic lesson with a project footnote.\n"
        "- Explain how this section's concepts, tools and techniques apply to the project, and what the learner "
        "should do or decide next because of them.\n"
        f"{_NO_INVENTION} If something you need is missing, say so under a bold **Assumptions & open questions** "
        "heading (at most 3 bullets) and state the assumption you made; leave that heading out when nothing is missing.\n"
        f"{_CONFLICTS}\n"
        f"- End the section with a bold line **Applying this to {project['name']}** followed by 3-5 concrete bullets. "
        "This may add up to about 200 words beyond the usual length."
    )
    return ", for a learner who is applying it to a real project", _context_blocks(project, knowledge), rules


def quiz_prompt_parts(project: Optional[dict], knowledge: List[dict]) -> Tuple[str, str]:
    """(project + knowledge blocks, project rules) for a quiz prompt; both '' without a project."""
    if not project:
        return "", ""
    rules = (
        f"\n\nProject rules (the learner is applying this topic to the project “{project['name']}”):\n"
        "- Make at least half of the questions test how this topic applies to the project's situation, using only "
        "what the project description, project context and saved knowledge say. Keep the rest about the topic itself.\n"
        "- Each such question must still stand alone: state the relevant project fact inside the question.\n"
        f"{_NO_INVENTION} If a project fact you need is missing, ask about the topic instead, or state the assumption "
        "in the question's explanation.\n"
        f"{_CONFLICTS}"
    )
    return _context_blocks(project, knowledge), rules
