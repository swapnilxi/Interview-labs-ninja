"""Per-user AI memory: short facts about what a learner likes, struggles with and knows, shared by every module.

Modules *record* a fact when something happens (a card saved, a question rated, a quiz missed) and *recall* a few of the
strongest, freshest ones to put in their next prompt, so the AI adapts over time. Facts are short sentences, never chat
logs. Seeing the same fact again strengthens it; unused facts fade (half-life 30 days) and the weakest are dropped past
a per-module cap. Everything is scoped to one user and can be viewed and deleted in Config.

Twin: frontend/fe-apis/memory/db.ts (nextjs-api mode) -- constants, cleaning and ordering must match.
"""

from __future__ import annotations

import re
import sqlite3
from typing import List, Optional

from modules.common.db import get_db_path

KINDS = ("interest", "struggle", "mastered", "preference")
KIND_LABEL = {
    "interest": "Likes",
    "struggle": "Struggles with",
    "mastered": "Knows well",
    "preference": "Prefers",
}
HALF_LIFE_DAYS = 30.0
MAX_WEIGHT = 10.0
MAX_PER_MODULE = 200
MAX_FACT_CHARS = 160
DEFAULT_RECALL = 8
# A fact about the topic on screen counts double when choosing what to recall.
TOPIC_BOOST = 2.0

_MODULE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]+")


class MemoryInputError(ValueError):
    """Invalid input (answered with a 422)."""


def clean(value: object, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return _CTRL_RE.sub(" ", value).strip()[:limit].strip()


def _validated(module: object, topic: object, kind: object, fact: object):
    if not isinstance(module, str) or not _MODULE_RE.match(module):
        raise MemoryInputError("module: lowercase letters, digits, - or _ (max 40).")
    if kind not in KINDS:
        raise MemoryInputError(f"kind: one of {', '.join(KINDS)}.")
    f = clean(fact, MAX_FACT_CHARS)
    if not f:
        raise MemoryInputError("fact: required.")
    return module, clean(topic, 60), kind, f


def _decay(age_days: float) -> float:
    return 0.5 ** (max(age_days, 0.0) / HALF_LIFE_DAYS)


def _row(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "module": r["module"],
        "topic": r["topic"],
        "kind": r["kind"],
        "fact": r["fact"],
        "weight": round(r["weight"] * _decay(r["age_days"]), 3),
        "hits": r["hits"],
        "updatedAt": r["updated_at"],
    }


_SELECT = "SELECT *, julianday('now') - julianday(updated_at) AS age_days FROM ai_memory"


def record(user_id: int, module: object, topic: object, kind: object, fact: object) -> dict:
    """Adds a fact, or strengthens it when the same one is already there (its old weight fades first)."""
    module, topic, kind, fact = _validated(module, topic, kind, fact)
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            _SELECT + " WHERE user_id = ? AND module = ? AND topic = ? AND fact = ?", (user_id, module, topic, fact)
        ).fetchone()
        if row:
            weight = min(row["weight"] * _decay(row["age_days"]) + 1.0, MAX_WEIGHT)
            conn.execute(
                "UPDATE ai_memory SET weight = ?, hits = hits + 1, kind = ?, updated_at = datetime('now') WHERE id = ?",
                (weight, kind, row["id"]),
            )
            fact_id = row["id"]
        else:
            fact_id = conn.execute(
                "INSERT INTO ai_memory (user_id, module, topic, kind, fact) VALUES (?, ?, ?, ?, ?)",
                (user_id, module, topic, kind, fact),
            ).lastrowid
            _trim(conn, user_id, module)
        conn.commit()
        out = conn.execute(_SELECT + " WHERE id = ?", (fact_id,)).fetchone()
        return _row(out)
    finally:
        conn.close()


def _trim(conn: sqlite3.Connection, user_id: int, module: str) -> None:
    """Keeps a module's facts under the cap by dropping the weakest (after fading) ones."""
    rows = conn.execute(_SELECT + " WHERE user_id = ? AND module = ?", (user_id, module)).fetchall()
    if len(rows) <= MAX_PER_MODULE:
        return
    ranked = sorted(rows, key=lambda r: r["weight"] * _decay(r["age_days"]))
    for r in ranked[: len(rows) - MAX_PER_MODULE]:
        conn.execute("DELETE FROM ai_memory WHERE id = ?", (r["id"],))


def list_facts(user_id: int, module: Optional[str] = None) -> List[dict]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        sql, args = _SELECT + " WHERE user_id = ?", [user_id]
        if module:
            sql += " AND module = ?"
            args.append(module)
        facts = [_row(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()
    facts.sort(key=lambda f: (-f["weight"], -f["id"]))
    return facts


def recall(user_id: int, module: str, topic: str = "", limit: int = DEFAULT_RECALL) -> List[dict]:
    """The strongest facts for a module, those about `topic` boosted, faint ones (< 5% of a fresh fact) left out."""
    topic = clean(topic, 60)
    scored = []
    for f in list_facts(user_id, module):
        score = f["weight"] * (TOPIC_BOOST if topic and f["topic"] == topic else 1.0)
        if f["weight"] >= 0.05:
            scored.append((score, f))
    scored.sort(key=lambda s: (-s[0], -s[1]["id"]))
    return [f for _, f in scored[:limit]]


def memory_lines(user_id: int, module: str, topic: str = "", limit: int = DEFAULT_RECALL) -> List[str]:
    """Prompt-ready lines, e.g. 'Struggles with: Got a quiz wrong: "Why use enumerate()?" (python)'."""
    out = []
    for f in recall(user_id, module, topic, limit):
        suffix = f" ({f['topic']})" if f["topic"] else ""
        out.append(f"{KIND_LABEL[f['kind']]}: {f['fact']}{suffix}")
    return out


def delete_fact(user_id: int, fact_id: int) -> bool:
    conn = sqlite3.connect(get_db_path())
    try:
        cur = conn.execute("DELETE FROM ai_memory WHERE id = ? AND user_id = ?", (fact_id, user_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def clear(user_id: int, module: Optional[str] = None) -> int:
    conn = sqlite3.connect(get_db_path())
    try:
        if module:
            cur = conn.execute("DELETE FROM ai_memory WHERE user_id = ? AND module = ?", (user_id, module))
        else:
            cur = conn.execute("DELETE FROM ai_memory WHERE user_id = ?", (user_id,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()
