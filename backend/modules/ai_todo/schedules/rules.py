"""Scheduler rules: validation and canonical form of a schedule's "when".

Port of `normalizeRule` / `parseCron` in frontend/src/lib/schedules/scheduleRules.ts (that file is the source of
truth; the occurrence and label functions there are device-side only and not ported). Keep the two identical,
including every error text and the key order of the canonical rule, because the rule is stored with `json.dumps`
and both backends can read and write the same SQLite file.

A rule is read in the device's LOCAL time; the server only validates and stores it.

Two small helpers make Python string handling match JavaScript's where the TS code depends on it:
  - `js_trim` / `_js_split`: JS `trim()` and `/\\s+/` use a slightly different whitespace set from `str.strip()`.
  - `js_slice`: JS `slice(0, n)` counts UTF-16 code units, so an emoji counts as 2.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

SCHEDULE_REPEATS = ["once", "interval", "daily", "weekdays", "weekly", "monthly", "cron"]
MIN_INTERVAL_MINUTES = 15
MAX_INTERVAL_MINUTES = 10080

# JS anchors `^…$` (no `m` flag) only match at the very ends, and `\d` is ASCII only: fullmatch + [0-9].
_LOCAL_DT_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}")
_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_TIME_RE = re.compile(r"([01][0-9]|2[0-3]):([0-5][0-9])")
_INT_RE = re.compile(r"-?[0-9]+")
_CRON_PART_RE = re.compile(r"(\*|[0-9]+(?:-[0-9]+)?)(?:/([0-9]+))?")

# JavaScript's whitespace (String.prototype.trim and the regex `\s`): WhiteSpace + LineTerminator.
_JS_WS = (
    "\t\n\v\f\r   "
    + "".join(chr(c) for c in range(0x2000, 0x200B))
    + "    　﻿"
)
_JS_WS_RUN = re.compile("[" + re.escape(_JS_WS) + "]+")


def js_trim(value: str) -> str:
    """JS `value.trim()`."""
    return value.strip(_JS_WS)


def _js_split(value: str) -> List[str]:
    """JS `value.split(/\\s+/)`."""
    return _JS_WS_RUN.split(value)


def js_slice(value: str, limit: int) -> str:
    """JS `value.slice(0, limit)`: `limit` counts UTF-16 code units (a character outside the BMP counts as 2).

    Where JS would cut such a character in half (keeping a lone surrogate), this drops the whole character, since
    a lone surrogate cannot be stored or sent as UTF-8.
    """
    if len(value) <= limit // 2:
        return value
    units = 0
    for index, ch in enumerate(value):
        units += 2 if ord(ch) > 0xFFFF else 1
        if units > limit:
            return value[:index]
    return value


def _days_in_month(year: int, month: int) -> int:
    """JS `new Date(Date.UTC(year, month, 0)).getUTCDate()` (Date.UTC maps years 0-99 to 1900-1999)."""
    if 0 <= year <= 99:
        year += 1900
    if month == 2:
        leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        return 29 if leap else 28
    return 30 if month in (4, 6, 9, 11) else 31


def _valid_date(value: Any) -> bool:
    if not isinstance(value, str) or not _DATE_RE.fullmatch(value):
        return False
    y, m, d = (int(part) for part in value.split("-"))
    if m < 1 or m > 12 or d < 1:
        return False
    return d <= _days_in_month(y, m)


def _valid_local_date_time(value: Any) -> bool:
    if not isinstance(value, str) or not _LOCAL_DT_RE.fullmatch(value):
        return False
    return _valid_date(value[:10]) and bool(_TIME_RE.fullmatch(value[11:]))


def _as_int(value: Any) -> Optional[int]:
    """JS `asInt`: an integer number (JSON `15.0` is the integer 15 in JS), or a string of digits; never a bool."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and _INT_RE.fullmatch(js_trim(value)):
        return int(js_trim(value))
    return None


# ── Cron ─────────────────────────────────────────────────────────────────────

_CRON_BOUNDS: List[Tuple[int, int]] = [
    (0, 59),  # minute
    (0, 23),  # hour
    (1, 31),  # day of month
    (1, 12),  # month
    (0, 7),  # day of week (0 and 7 = Sunday)
]


def cron_field(field: str, lo: int, hi: int) -> Optional[List[int]]:
    """One cron field -> the sorted values it allows, or None when it is malformed."""
    out = set()
    for part in field.split(","):
        m = _CRON_PART_RE.fullmatch(part)
        if not m:
            return None
        a, b = lo, hi
        if m.group(1) != "*":
            bounds = [int(x) for x in m.group(1).split("-")]
            a = bounds[0]
            if len(bounds) > 1:
                b = bounds[1]
            else:
                b = hi if m.group(2) is not None else a
        step = int(m.group(2)) if m.group(2) is not None else 1
        if a < lo or b > hi or a > b or step < 1:
            return None
        out.update(range(a, b + 1, step))
    return sorted(out)


def parse_cron(expr: str) -> Optional[Dict[str, Any]]:
    """Standard 5-field cron -> the values each field allows, or None when it is invalid."""
    fields = _js_split(js_trim(expr))
    if len(fields) != 5:
        return None
    parsed = [cron_field(f, *_CRON_BOUNDS[i]) for i, f in enumerate(fields)]
    if any(p is None for p in parsed):
        return None
    minutes, hours, dom, months, dow_raw = parsed
    dow = sorted({0 if d == 7 else d for d in dow_raw})
    return {
        "minutes": minutes,
        "hours": hours,
        "dom": dom,
        "months": months,
        "dow": dow,
        "dom_any": fields[2] == "*",
        "dow_any": fields[4] == "*",
    }


# ── Validation ───────────────────────────────────────────────────────────────


def normalize_rule(raw: Any, now: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Checks a rule and returns `(rule, None)` in canonical form (only the keys its repeat uses, in a fixed order),
    or `(None, error)`. `now` (local "YYYY-MM-DDTHH:MM") fills a missing interval start; without it, a missing
    start is an error."""
    if not isinstance(raw, dict):
        return None, "The schedule is missing its timing."
    repeat = raw.get("repeat")
    if not isinstance(repeat, str) or repeat not in SCHEDULE_REPEATS:
        return None, f"repeat must be one of: {', '.join(SCHEDULE_REPEATS)}."
    rule: Dict[str, Any] = {"repeat": repeat}

    if repeat == "once":
        if not _valid_local_date_time(raw.get("at")):
            return None, "A one-time schedule needs a date and time (YYYY-MM-DDTHH:MM)."
        rule["at"] = raw["at"]
    elif repeat == "interval":
        every = _as_int(raw.get("every_minutes"))
        if every is None or every < MIN_INTERVAL_MINUTES or every > MAX_INTERVAL_MINUTES:
            return None, "An interval must be between 15 minutes and 7 days (every_minutes 15-10080)."
        start = raw.get("start")
        if start is None or start == "":
            start = now
        if not _valid_local_date_time(start):
            return None, "An interval schedule needs a start (YYYY-MM-DDTHH:MM)."
        rule["every_minutes"] = every
        rule["start"] = start
    elif repeat == "cron":
        cron = raw.get("cron")
        expr = " ".join(_js_split(js_trim(cron))) if isinstance(cron, str) else ""
        if not parse_cron(expr):
            return None, 'Cron needs 5 valid fields: minute hour day-of-month month day-of-week (e.g. "0 9 * * 1-5").'
        rule["cron"] = expr
    else:
        time = raw.get("time")
        if not isinstance(time, str) or not _TIME_RE.fullmatch(time):
            return None, "Pick a time of day (HH:MM)."
        rule["time"] = time
        if repeat == "weekly":
            days = [_as_int(d) for d in raw["days"]] if isinstance(raw.get("days"), list) else []
            if not days or any(d is None or d < 0 or d > 6 for d in days):
                return None, "Pick at least one day of the week (0 = Sunday … 6 = Saturday)."
            rule["days"] = sorted(set(days))
        elif repeat == "monthly":
            dom = _as_int(raw.get("day_of_month"))
            if dom is None or dom < 1 or dom > 31:
                return None, "Pick a day of the month (1-31)."
            rule["day_of_month"] = dom

    end = raw.get("end")
    if end is not None and end != "":
        if not _valid_date(end):
            return None, "The end date must be YYYY-MM-DD."
        if repeat != "once":
            rule["end"] = end
    return rule, None
