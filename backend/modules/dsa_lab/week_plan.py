"""A user's week-by-week DSA study plans ("plan profiles"): which question sits in which week, in what
order, and each week's short focus label.

The suggested plan itself lives in the frontend (frontend/src/modules/dsa-lab/weekPlan.ts); only the plans a
user saves are stored here, one `dsa_week_plan_profiles` row each (at most MAX_PROFILES). At most one of a
user's profiles is active: that is the plan the week view shows and that PUT /dsa/week-plan edits. With none
active the frontend shows its suggested plan again, so "use the suggested plan" never deletes anything.

Before profiles, a user had at most one plan, a row in `dsa_week_plans`. migrate_legacy() turns such a row
into the user's first profile ("My plan", active) the next time they call any week-plan route, then deletes it.

PUT /week-plan may name the plan the caller thinks is active (`profileId`, an integer or null): if another tab
or device switched or deleted it meanwhile the save is refused with a 409 instead of overwriting the plan that
is active now. Omitting `profileId` keeps the plain "write to whatever is active" behaviour.

A plan is {"weeks", "assignments", "order", "labels"}: `assignments` maps topic id -> week (an id that isn't
listed is in no week, i.e. in the organizer's question queue), `order` is the learner's sequence (inside a
week questions sort by their index here) and `labels` maps "<week>" -> focus label. The AI auto organizer's
prompt and normaliser are in auto_plan.py.

`frontend/fe-apis/dsaLab/` is the Next.js twin (nextjs-api mode): limits, shapes, status codes and messages
are copied verbatim, so change both together.
"""

from __future__ import annotations

import json
import re
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

from modules.common.db import get_db_path

WEEK_CAP = 7  # most questions a single week may hold
MAX_WEEKS = 24
MAX_PROFILES = 20  # saved plans per user
NAME_MAX = 60
LABEL_MAX = 60
SUMMARY_MAX = 600
MAX_ENTRIES = 500  # in `assignments` and in `order`
DEFAULT_NAME = "My plan"  # the profile PUT /week-plan creates when none is active, and the migrated legacy plan

_LABEL_KEY = re.compile(r"[1-9][0-9]*")
_SQLITE_INT = range(-(2**63), 2**63)  # a profile id outside this can't be a row (and sqlite3 can't bind it)


NOT_ACTIVE_MESSAGE = "This plan is no longer the active one."  # 409 of a PUT /week-plan that named another plan


def has_lone_surrogate(text: str) -> bool:
    """True when `text` holds an unpaired UTF-16 surrogate (JSON "\\ud800"). Such text can't be encoded as UTF-8,
    so storing it and sending it back would end in a 500; every user-supplied string is checked up front.
    (A Python str has no valid surrogate pairs: JSON decoding turns a pair into one code point.)"""
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return True
    return False


def printable(text: str) -> str:
    """`text` with every lone surrogate shown as U+FFFD, for messages that quote what the caller sent."""
    return "".join("\ufffd" if "\ud800" <= ch <= "\udfff" else ch for ch in text)


def _js_key_order(obj: Dict[str, Any]) -> List[str]:
    """The keys of a parsed JSON object in the order the twin sees them: JavaScript lists integer-like keys
    ("0".."4294967294", no leading zeros) first, ascending, then the rest in insertion order. validate_plan
    walks keys in this order so that both twins report the same first problem."""

    def is_index(key: str) -> bool:
        # The length test comes first: int() refuses digit strings of thousands of characters (a 500 on 3.12).
        return (
            isinstance(key, str)
            and key.isascii()
            and key.isdigit()
            and len(key) <= 10
            and (key == "0" or key[0] != "0")
            and int(key) < 2**32 - 1
        )

    return sorted((k for k in obj if is_index(k)), key=int) + [k for k in obj if not is_index(k)]


class WeekPlanError(Exception):
    """A request the store refuses (404 / 409 / 422), with the user-facing message the router sends back."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# ── Validation ────────────────────────────────────────────────────────────────


def validate_plan(weeks: int, assignments: Dict[str, int], order: Any = None, labels: Any = None) -> Optional[str]:
    """Return a human-readable problem with the plan, or None when it is fine.

    `weeks` and `assignments` arrive type-checked (the router's Pydantic model); `order` and `labels` are
    checked here so their messages match the twin. A missing / null `order` or `labels` means empty. The first
    failure wins; each `order` item (id, then repeat) and each label (week key, then text, then length) is
    checked in full before the next one, exactly as in the twin. Object keys are walked in the twin's
    (JavaScript) order, see _js_key_order.
    """
    counts: Dict[int, int] = {}
    for topic_id in _js_key_order(assignments):
        week = assignments[topic_id]
        if not topic_id or len(topic_id) > 200 or has_lone_surrogate(topic_id):
            return "Every question id must be 1-200 characters."
        if week < 1 or week > weeks:
            return f"'{topic_id}' is in week {week}, but the plan has weeks 1-{weeks}."
        counts[week] = counts.get(week, 0) + 1
    for week in sorted(counts):
        if counts[week] > WEEK_CAP:
            return f"Week {week} has {counts[week]} questions; a week holds at most {WEEK_CAP}."

    order = [] if order is None else order
    if not isinstance(order, list):
        return "Field 'order' must be a list of question ids."
    if len(order) > MAX_ENTRIES:
        return f"Field 'order' has too many entries (max {MAX_ENTRIES})."
    seen = set()
    for topic_id in order:
        if not isinstance(topic_id, str) or not topic_id or len(topic_id) > 200 or has_lone_surrogate(topic_id):
            return "Every question id must be 1-200 characters."
        if topic_id in seen:
            return f"'{topic_id}' appears twice in 'order'."
        seen.add(topic_id)

    labels = {} if labels is None else labels
    if not isinstance(labels, dict):
        return "Field 'labels' must be an object."
    for key in _js_key_order(labels):
        label = labels[key]
        # A week key is at most two digits (weeks <= 24): a longer one is out of range without calling int().
        if not isinstance(key, str) or not _LABEL_KEY.fullmatch(key) or len(key) > 10 or int(key) > weeks:
            return f"There is a label for week '{printable(str(key))}', but the plan has weeks 1-{weeks}."
        if not isinstance(label, str) or has_lone_surrogate(label):
            return "Every week label must be text."
        if len(label.strip()) > LABEL_MAX:
            return f"Week {key}'s label is longer than {LABEL_MAX} characters."
    return None


def normalize_plan(weeks: int, assignments: Dict[str, int], order: Any = None, labels: Any = None) -> dict:
    """The stored / returned form of a plan that passed validate_plan: every key present, labels trimmed,
    empty labels dropped."""
    trimmed = {key: label.strip() for key, label in (labels or {}).items()}
    return {
        "weeks": weeks,
        "assignments": dict(assignments),
        "order": list(order or []),
        "labels": {key: label for key, label in trimmed.items() if label},
    }


def clean_name(value: Any) -> str:
    """A profile name, trimmed; 422 unless it is text of 1-NAME_MAX characters."""
    if not isinstance(value, str) or has_lone_surrogate(value) or not 1 <= len(value.strip()) <= NAME_MAX:
        raise WeekPlanError(422, f"A plan name must be 1-{NAME_MAX} characters.")
    return value.strip()


def clean_summary(value: Any) -> str:
    """A profile summary, trimmed; 422 unless it is text of at most SUMMARY_MAX characters."""
    if not isinstance(value, str) or has_lone_surrogate(value) or len(value.strip()) > SUMMARY_MAX:
        raise WeekPlanError(422, f"The plan summary must be at most {SUMMARY_MAX} characters.")
    return value.strip()


# ── Storage ───────────────────────────────────────────────────────────────────


@contextmanager
def _transaction() -> Iterator[sqlite3.Connection]:
    """One connection per call, inside BEGIN IMMEDIATE (like the twin's db.transaction), so the check-then-write
    steps (the plan cap, unique names, a single active plan, the legacy migration) can't interleave with another
    request. Commits on success, rolls back on any error."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def migrate_legacy(conn: sqlite3.Connection, user_id: int) -> None:
    """Turn the user's old one-plan row (dsa_week_plans) into their first profile, then delete it.

    Only a user with no profiles gets the copy; the legacy row is deleted either way. Runs at the start of
    every week-plan route, inside that route's transaction.
    """
    row = conn.execute("SELECT plan_json, updated_at FROM dsa_week_plans WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return
    has_profiles = conn.execute("SELECT 1 FROM dsa_week_plan_profiles WHERE user_id = ? LIMIT 1", (user_id,)).fetchone()
    if not has_profiles:
        legacy = _parse_json(row["plan_json"])
        plan = {"weeks": legacy.get("weeks"), "assignments": legacy.get("assignments") or {}, "order": [], "labels": {}}
        conn.execute(
            """
            INSERT INTO dsa_week_plan_profiles (user_id, name, plan_json, summary, is_active, created_at, updated_at)
            VALUES (?, ?, ?, '', 1, ?, ?)
            """,
            (user_id, DEFAULT_NAME, json.dumps(plan), row["updated_at"], row["updated_at"]),
        )
    conn.execute("DELETE FROM dsa_week_plans WHERE user_id = ?", (user_id,))


def ensure_migrated(user_id: int) -> None:
    """migrate_legacy on its own, for routes that don't otherwise touch the profiles (the auto organizer)."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)


def _parse_json(text: str) -> dict:
    try:
        value = json.loads(text)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def _plan_of(row: sqlite3.Row) -> dict:
    plan = _parse_json(row["plan_json"])
    return {
        "weeks": plan.get("weeks"),
        "assignments": plan.get("assignments") or {},
        "order": plan.get("order") or [],
        "labels": plan.get("labels") or {},
    }


def _profile_summary(row: sqlite3.Row) -> dict:
    plan = _plan_of(row)
    return {
        "id": row["id"],
        "name": row["name"],
        "weeks": plan["weeks"],
        "planned": len(plan["assignments"]),
        "summary": row["summary"],
        "active": bool(row["is_active"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _profile_full(row: sqlite3.Row) -> dict:
    return {**_profile_summary(row), "plan": _plan_of(row)}


def _active_plan(row: sqlite3.Row) -> dict:
    return {**_plan_of(row), "updatedAt": row["updated_at"], "profileId": row["id"], "name": row["name"]}


_COLUMNS = "id, name, plan_json, summary, is_active, created_at, updated_at"


def _get_row(conn: sqlite3.Connection, user_id: int, profile_id: int) -> sqlite3.Row:
    if profile_id not in _SQLITE_INT:
        raise WeekPlanError(404, "Plan not found.")
    row = conn.execute(
        f"SELECT {_COLUMNS} FROM dsa_week_plan_profiles WHERE id = ? AND user_id = ?", (profile_id, user_id)
    ).fetchone()
    if not row:
        raise WeekPlanError(404, "Plan not found.")
    return row


def _active_row(conn: sqlite3.Connection, user_id: int) -> Optional[sqlite3.Row]:
    return conn.execute(
        f"SELECT {_COLUMNS} FROM dsa_week_plan_profiles WHERE user_id = ? AND is_active = 1 ORDER BY id LIMIT 1",
        (user_id,),
    ).fetchone()


def _names(conn: sqlite3.Connection, user_id: int, exclude_id: Optional[int] = None) -> List[str]:
    rows = conn.execute("SELECT id, name FROM dsa_week_plan_profiles WHERE user_id = ?", (user_id,)).fetchall()
    return [r["name"] for r in rows if r["id"] != exclude_id]


def _check_unique_name(conn: sqlite3.Connection, user_id: int, name: str, exclude_id: Optional[int] = None) -> None:
    taken = {n.strip().lower() for n in _names(conn, user_id, exclude_id)}
    if name.lower() in taken:
        raise WeekPlanError(409, f"You already have a plan named '{name}'.")


def _check_room(conn: sqlite3.Connection, user_id: int) -> None:
    count = conn.execute("SELECT COUNT(*) FROM dsa_week_plan_profiles WHERE user_id = ?", (user_id,)).fetchone()[0]
    if count >= MAX_PROFILES:
        raise WeekPlanError(409, f"You can keep at most {MAX_PROFILES} plans. Delete one first.")


def _activate(conn: sqlite3.Connection, user_id: int, profile_id: int) -> None:
    conn.execute(
        "UPDATE dsa_week_plan_profiles SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE user_id = ?",
        (profile_id, user_id),
    )


def _insert(conn: sqlite3.Connection, user_id: int, name: str, plan: dict, summary: str) -> int:
    cur = conn.execute(
        "INSERT INTO dsa_week_plan_profiles (user_id, name, plan_json, summary) VALUES (?, ?, ?, ?)",
        (user_id, name, json.dumps(plan), summary),
    )
    return int(cur.lastrowid)


# ── The active plan (/dsa/week-plan) ──────────────────────────────────────────


def fetch_active_plan(user_id: int) -> Optional[dict]:
    """The active profile as an ActivePlan, or None when no profile is active (the frontend's suggested plan)."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        row = _active_row(conn, user_id)
        return _active_plan(row) if row else None


def save_active_plan(user_id: int, plan: dict, expected_id: Optional[int] = None, check_expected: bool = False) -> dict:
    """Write `plan` (validated + normalised) to the active profile; with none active, create "My plan" (or the
    first free "My plan N") and activate it. With `check_expected` (the caller sent `profileId`), the active
    profile's id must equal `expected_id` (None = "no plan is active"), otherwise nothing is written and the
    result is a 409: the caller is looking at a plan that is no longer the active one."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        row = _active_row(conn, user_id)
        if check_expected and (row["id"] if row else None) != expected_id:
            raise WeekPlanError(409, NOT_ACTIVE_MESSAGE)
        if row:
            profile_id = row["id"]
            conn.execute(
                "UPDATE dsa_week_plan_profiles SET plan_json = ?, updated_at = datetime('now') WHERE id = ?",
                (json.dumps(plan), profile_id),
            )
        else:
            _check_room(conn, user_id)
            taken = {n.strip().lower() for n in _names(conn, user_id)}
            name, n = DEFAULT_NAME, 1
            while name.lower() in taken:
                n += 1
                name = f"{DEFAULT_NAME} {n}"
            profile_id = _insert(conn, user_id, name, plan, "")
            _activate(conn, user_id, profile_id)
        return _active_plan(_get_row(conn, user_id, profile_id))


def deactivate_all(user_id: int) -> None:
    """Back to the suggested plan, keeping every saved profile."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        conn.execute("UPDATE dsa_week_plan_profiles SET is_active = 0 WHERE user_id = ?", (user_id,))


# ── Profiles (/dsa/week-plan/profiles) ────────────────────────────────────────


def list_profiles(user_id: int) -> dict:
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        rows = conn.execute(
            f"SELECT {_COLUMNS} FROM dsa_week_plan_profiles WHERE user_id = ? ORDER BY id ASC", (user_id,)
        ).fetchall()
        active = next((r["id"] for r in rows if r["is_active"]), None)
        return {"profiles": [_profile_summary(r) for r in rows], "activeId": active}


def get_profile(user_id: int, profile_id: int) -> dict:
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        return _profile_full(_get_row(conn, user_id, profile_id))


def create_profile(user_id: int, name: str, plan: dict, summary: str, activate: bool) -> dict:
    """A new profile (`name` / `summary` already cleaned, `plan` validated + normalised); `activate` makes it
    the only active one."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        _check_unique_name(conn, user_id, name)
        _check_room(conn, user_id)
        profile_id = _insert(conn, user_id, name, plan, summary)
        if activate:
            _activate(conn, user_id, profile_id)
        return _profile_full(_get_row(conn, user_id, profile_id))


def update_profile(user_id: int, profile_id: int, changes: dict) -> dict:
    """Apply `changes` (any of name, summary, plan; already cleaned / normalised) and bump updated_at."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        _get_row(conn, user_id, profile_id)
        if "name" in changes:
            _check_unique_name(conn, user_id, changes["name"], exclude_id=profile_id)
        sets, args = [], []
        for key, column in (("name", "name"), ("summary", "summary"), ("plan", "plan_json")):
            if key in changes:
                sets.append(f"{column} = ?")
                args.append(json.dumps(changes[key]) if key == "plan" else changes[key])
        sets.append("updated_at = datetime('now')")
        conn.execute(
            f"UPDATE dsa_week_plan_profiles SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
            (*args, profile_id, user_id),
        )
        return _profile_full(_get_row(conn, user_id, profile_id))


def activate_profile(user_id: int, profile_id: int) -> dict:
    """Make the profile the only active one; returns it as an ActivePlan."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        _get_row(conn, user_id, profile_id)
        _activate(conn, user_id, profile_id)
        return _active_plan(_get_row(conn, user_id, profile_id))


def delete_profile(user_id: int, profile_id: int) -> dict:
    """Delete one profile. Deleting the active one leaves none active (the suggested plan shows)."""
    with _transaction() as conn:
        migrate_legacy(conn, user_id)
        _get_row(conn, user_id, profile_id)
        conn.execute("DELETE FROM dsa_week_plan_profiles WHERE id = ? AND user_id = ?", (profile_id, user_id))
        row = _active_row(conn, user_id)
        return {"deleted": profile_id, "activeId": row["id"] if row else None}
