"""The AI-written video script of a lab page (a topic's page, or one of its subtopics).

"Generate Video Script" in the page's "Videos and links" section asks the model for a script a person can record: a working
title, a hook, the target length, scenes with a rough timestamp, narration and an on-screen cue each, and a closing call to
action. The latest script is kept per user and page in `lab_video_scripts` (one row, replaced when it is regenerated) so it is
still there on return; a page load only reads it, never generates. It is deliberately NOT a row of `lab_section_content`:
that table feeds the page's "Sections generated" count, the outline and the project knowledge, and a script is none of those.

Twin: frontend/fe-apis/labSections/videoScript.ts. The same table, prompt text (byte for byte), limits and texts, so change
both. No FastAPI import on purpose (the router in router.py loads the project text and calls the model, then hands the pieces
to `build_prompt`), so the store and the prompt run against a database copy under a bare interpreter
(backend/tests/video_script_test.py).
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

from modules.common.db import get_db_path

# 5-8 minutes of narration with cues is about 1,000-1,500 words; a small budget would cut a script off mid-scene.
SCRIPT_MAX_TOKENS = 4096


def ensure_table(cursor: sqlite3.Cursor) -> None:
    """CREATE TABLE IF NOT EXISTS. Called from schema.register and before every query here."""
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS lab_video_scripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            lab_name TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            subtopic_id TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            project_id INTEGER DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, lab_name, topic_id, subtopic_id)
        );
        """
    )


@contextmanager
def _db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        ensure_table(conn.cursor())
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _row(row: sqlite3.Row) -> Dict[str, Any]:
    return {"content": row["content"], "updatedAt": row["updated_at"], "projectId": row["project_id"]}


def fetch_script(user_id: int, lab: str, topic_id: str, subtopic_id: str) -> Optional[Dict[str, Any]]:
    """The user's saved script for the page, or None."""
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM lab_video_scripts WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?",
            (user_id, lab, topic_id, subtopic_id),
        ).fetchone()
        return _row(row) if row else None


def save_script(
    user_id: int, lab: str, topic_id: str, subtopic_id: str, content: str, project_id: Optional[int] = None
) -> Dict[str, Any]:
    """Keep this as the page's script (replacing the previous one). Only called with a good response."""
    with _db() as conn:
        conn.execute(
            """
            INSERT INTO lab_video_scripts (user_id, lab_name, topic_id, subtopic_id, content, project_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, lab_name, topic_id, subtopic_id) DO UPDATE SET
                content = excluded.content,
                project_id = excluded.project_id,
                updated_at = datetime('now')
            """,
            (user_id, lab, topic_id, subtopic_id, content, project_id),
        )
        row = conn.execute(
            "SELECT * FROM lab_video_scripts WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?",
            (user_id, lab, topic_id, subtopic_id),
        ).fetchone()
        return _row(row)


def build_prompt(
    domain: str,
    audience: str,
    subject: str,
    brief: str,
    standing_context: str,
    prompt_addon: str,
    role_suffix: str = "",
    project_blocks: str = "",
    project_name: str = "",
) -> str:
    """The prompt. `role_suffix` and `project_blocks` come from lab_projects.knowledge.section_prompt_parts (both '' without a
    project); `project_name` is the project's name, or '' without one."""
    brief_line = f"\nTopic summary: {brief}" if brief else ""

    standing = standing_context.strip()
    standing_block = ""
    if standing:
        standing_block = (
            "\n\nStanding context about the learner (applies to every page of this lab; use it to tailor depth, "
            f'examples and language):\n"""\n{standing}\n"""'
        )

    addon = prompt_addon.strip()
    addon_block = f"\n\nAdditional instructions (prompt add-on):\n{addon}" if addon else ""

    project_rules = ""
    if project_name:
        project_rules = (
            f"\n\nProject rules (this video is made FOR the project “{project_name}”, not as a generic lesson):\n"
            "- Take the examples, data and constraints from the project's own domain and tie each scene to the project's "
            "real situation. Do not read the project description back.\n"
            "- Do not invent facts about the project that its context above does not give. Where something you need is "
            "missing, say so in that scene's narration as an assumption."
        )

    return f"""You are a senior {domain} instructor and video producer writing the recording script for one explainer video{role_suffix}.

Topic: {subject}{brief_line}{project_blocks}{standing_block}{addon_block}

Write the script for a 5-8 minute explainer video about this topic, aimed at {audience}. A person will record it, so write the narration to be spoken aloud: short sentences, plain words, one idea per scene.{project_rules}

Output rules:
- Respond with the script's Markdown ONLY: no preamble, no closing remarks, and do not wrap the whole answer in a code fence.
- Start with exactly these three lines, in this order: **Title:** a working video title, then **Hook:** one line that makes a viewer keep watching, then **Length:** the target length, for example about 6 minutes.
- Then write 5 to 8 scenes. Begin each with a heading line in the form ### Scene 1: Scene name (0:00-0:45). The timestamps are rough, run on from one scene to the next and add up to the target length.
- Under each scene heading write two parts: a line that begins **Narration:** followed by the words to say, then a line that begins **On screen:** followed by one short cue for what to show, draw, type or run.
- End with a last scene headed ### Closing call to action, with the same two parts, telling the viewer the one thing to do next.
- Be concrete and accurate. Put any code the viewer should see in a fenced block with a language tag (```python, ```text) and keep it short. Use Python for code unless the context asks for another language.
- Do not repeat these instructions."""
