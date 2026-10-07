"""Landing-page editing helpers: manual/AI sections and the prompts for AI edits.

A section is a block of HTML wrapped in `<!-- lms:section:ID source=manual|ai -->` ...
`<!-- /lms:section:ID -->` markers, so it can be found, replaced, moved or removed later
without disturbing the rest of the page (the markers are plain comments; the page renders
the same without them). The lms:auto regions are never touched here.
"""
from __future__ import annotations

import html as _html
import re
import secrets
from typing import Any, Dict, List, Optional

_SECTION = re.compile(
    r"<!--[ \t]*lms:section:([a-z0-9-]+)[ \t]+source=(manual|ai)[ \t]*-->(.*?)<!--[ \t]*/lms:section:\1[ \t]*-->",
    re.S,
)
_AUTO_MARKER = re.compile(r"<!--[ \t\r\n]*/?lms:auto:[a-z][a-z0-9-]*[ \t\r\n]*-->")
SECTION_HTML_MAX = 40_000
PAGE_HTML_MAX = 400_000


def list_sections(page: str) -> List[Dict[str, Any]]:
    return [
        {"id": m.group(1), "source": m.group(2), "title": _title(m.group(3)), "html": m.group(3).strip()}
        for m in _SECTION.finditer(page)
    ]


def _title(fragment: str) -> str:
    m = re.search(r"<h[1-6][^>]*>(.*?)</h[1-6]>", fragment, re.S | re.I)
    return re.sub(r"<[^>]+>", "", _html.unescape(m.group(1))).strip() if m else ""


def new_section_id() -> str:
    return "s" + secrets.token_hex(4)


def wrap_section(section_id: str, source: str, fragment: str) -> str:
    return f"<!-- lms:section:{section_id} source={source} -->\n{fragment.strip()}\n<!-- /lms:section:{section_id} -->"


def strip_unsafe(fragment: str) -> str:
    """Section HTML must be an inert fragment: no document wrapper. (The page itself renders
    in a sandboxed iframe, so scripts inside a section stay contained, as in lessons.)"""
    frag = re.sub(r"(?is)^.*?<body[^>]*>", "", fragment) if re.search(r"(?i)<body", fragment) else fragment
    frag = re.sub(r"(?is)</body>.*$", "", frag)
    frag = re.sub(r"(?is)<!doctype[^>]*>|</?html[^>]*>|<head>.*?</head>", "", frag)
    frag = re.sub(r"^```(?:html)?\s*|\s*```$", "", frag.strip())
    return frag.strip()


def manual_section_html(title: str, body: str) -> str:
    """A manual section: plain title + the author's HTML body in the page's own card style."""
    return (
        f'<section class="lms-user-section" style="padding:32px 0;border-top:1px solid var(--line,#e7e1d4)">\n'
        f"  <h2>{_html.escape(title.strip())}</h2>\n  {body.strip()}\n</section>"
    )


def _find(page: str, section_id: str) -> Optional["re.Match[str]"]:
    return next((m for m in _SECTION.finditer(page) if m.group(1) == section_id), None)


def insert_section(page: str, block: str, after_section_id: Optional[str] = None, position: str = "end") -> str:
    """Insert a wrapped section: after an existing section, at the start of <main>, or (default)
    at the end of <main>; pages without <main> fall back to before </body> / the end."""
    if after_section_id:
        m = _find(page, after_section_id)
        if m is None:
            raise KeyError(after_section_id)
        return page[: m.end()] + "\n\n" + block + page[m.end():]
    if position == "start":
        m = re.search(r"<main\b[^>]*>", page, re.I)
        if m:
            return page[: m.end()] + "\n\n" + block + page[m.end():]
    for closer in (r"</main>", r"</body>"):
        idx = [m.start() for m in re.finditer(closer, page, re.I)]
        if idx:
            return page[: idx[-1]] + block + "\n" + page[idx[-1]:]
    return page + "\n" + block + "\n"


def replace_section(page: str, section_id: str, block: str) -> str:
    m = _find(page, section_id)
    if m is None:
        raise KeyError(section_id)
    return page[: m.start()] + block + page[m.end():]


def move_section(page: str, section_id: str, direction: str) -> str:
    """Swap a section with its neighbour ("up" = earlier on the page). A section already at the
    edge is left where it is."""
    spans = [(m.group(1), m.start(), m.end()) for m in _SECTION.finditer(page)]
    idx = next((i for i, sp in enumerate(spans) if sp[0] == section_id), None)
    if idx is None:
        raise KeyError(section_id)
    other = idx - 1 if direction == "up" else idx + 1
    if other < 0 or other >= len(spans):
        return page
    (_, a0, a1), (_, b0, b1) = sorted((spans[idx], spans[other]), key=lambda sp: sp[1])
    return page[:a0] + page[b0:b1] + page[a1:b0] + page[a0:a1] + page[b1:]


def remove_section(page: str, section_id: str) -> str:
    m = _find(page, section_id)
    if m is None:
        raise KeyError(section_id)
    return (page[: m.start()].rstrip() + "\n\n" + page[m.end():].lstrip()) if page[m.end():].strip() else page[: m.start()].rstrip() + "\n"


def auto_markers_intact(before: str, after: str) -> bool:
    """AI page edits must keep every lms:auto marker the page had."""
    return all(marker in after for marker in set(_AUTO_MARKER.findall(before)))


def page_edit_prompt(instruction: str, page: str) -> str:
    return f"""You are updating the landing page of an online class according to the editor's instruction.

Editor's instruction:
\"\"\"
{instruction.strip()}
\"\"\"

Current landing page HTML:
\"\"\"
{page}
\"\"\"

RULES:
1. Apply the instruction and change as little else as possible.
2. Keep every HTML comment marker EXACTLY as is, including `<!-- lms:auto:NAME -->...<!-- /lms:auto:NAME -->`
   pairs (the app refreshes the content inside them) and `<!-- lms:section:ID source=... -->` pairs.
3. Keep it a single self-contained document: inline CSS, no external CDNs, links relative.
4. Output ONLY the complete updated HTML document, from <!DOCTYPE html> to </html>. No code fences, no commentary."""


def page_generate_prompt(instruction: str, class_name: str, class_description: str, outline: str, template: str) -> str:
    return f"""Design the landing page for the online class "{class_name}".
Class description: {class_description or '(none)'}

Editor's brief:
\"\"\"
{instruction.strip()}
\"\"\"

Class contents (for context; the app fills the lists in itself):
{outline or '(empty so far)'}

Start from this page, which already has the app's required structure:
\"\"\"
{template}
\"\"\"

RULES:
1. Keep every `<!-- lms:auto:NAME -->...<!-- /lms:auto:NAME -->` marker pair exactly as is: the app keeps
   the class name, description, counts and subject/project/lesson lists current inside them.
2. Rework layout, copy, colors and extra sections to follow the brief. Single self-contained document,
   inline CSS, no external CDNs, links relative.
3. Output ONLY the complete HTML document, from <!DOCTYPE html> to </html>. No code fences, no commentary."""


def section_prompt(instruction: str, page: str) -> str:
    # The model only sees the page's head/style context, not the whole body, to keep the call cheap.
    head = re.search(r"(?is)<style.*?</style>", page)
    style = head.group(0)[:6000] if head else ""
    return f"""Write ONE new section for an online class's landing page.

Editor's instruction:
\"\"\"
{instruction.strip()}
\"\"\"

The page's stylesheet (reuse its CSS variables and classes so the section matches):
\"\"\"
{style}
\"\"\"

RULES:
1. Output a single `<section>...</section>` fragment starting with an <h2> heading. No <html>/<head>/<body>,
   no code fences, no commentary.
2. No external CDNs; inline any extra CSS in a <style> inside the fragment; keep it self-contained.
3. Do not include lms:auto or lms:section comment markers."""
