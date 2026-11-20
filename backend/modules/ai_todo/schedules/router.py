"""FastAPI router for the To-Do Scheduler (reminders and AI jobs that run on a schedule).

Endpoints:
  GET    /todo/schedules                  — List the user's schedules (newest first)
  POST   /todo/schedules                  — Create a schedule (rule validated by rules.normalize_rule)
  POST   /todo/schedules/parse            — AI: a sentence -> a schedule draft (not saved)
  PATCH  /todo/schedules/{id}             — Update a schedule
  DELETE /todo/schedules/{id}             — Delete a schedule (and its runs)
  GET    /todo/schedules/{id}/runs        — Last runs
  GET    /todo/schedules/activity         — Latest AI-job runs across all schedules (the Assistant's feed)
  POST   /todo/schedules/{id}/run         — Run one occurrence (reminder: record it; agent: ask the AI), deduplicated

An AI job reads nothing, its open tasks ("tasks") or the whole To-Do workspace ("workspace", agent/context.py); with
use_web it may search the web once per run (agent/web_step.py); with write_report it also writes a full report the app
shows, while `output` stays the short notification text the phone shows.

TypeScript twin: frontend/fe-apis/todo/schedules/handlers.ts. Prompts, limits, status codes and error texts are
copied verbatim, so change both. The occurrences themselves are worked out on the device
(frontend/src/lib/schedules/scheduleRules.ts); the server only validates, stores and runs them.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone as dt_timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings, extract_json_object
from modules.common.ai.utils import extract_json_object_lenient

from ..shared.ai_helpers import call_ai
from ..shared.patch import patch_updates
from ..agent.context import workspace_context
from ..agent.web_step import run_search, search_query, sources_of, web_block
from ..tasks.db import create_task, get_all_tasks
from .db import (
    claim_run,
    create_schedule,
    delete_schedule,
    finish_run,
    get_schedule,
    list_recent_agent_runs,
    list_runs,
    list_schedules,
    update_schedule,
)
from .rules import js_slice, js_trim, normalize_rule

router = APIRouter(prefix="/todo", tags=["schedules"], dependencies=[Depends(get_current_user_id)])

KINDS = ("reminder", "agent")
CONTEXTS = ("tasks", "workspace", "none")
SOURCES = ("web", "app", "manual")
PRIORITIES = ("p1", "p2", "p3", "p4")
DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
LOCAL_DT_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}")
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TITLE_MAX = 120
OUTPUT_MAX = 2000
REPORT_MAX = 8000

# Columns a PATCH can empty by sending `null` (see shared/patch.py). Not title / kind / agent_context / add_tasks /
# enabled / rule: `null` there still means "no change".
SCHEDULE_NULLABLE = frozenset({"message", "timezone", "source_text"})


# ── Pydantic models ──────────────────────────────────────────────────────────


def _bool_or_01(value: Any) -> Any:
    """Like boolField in the TS twin: a JSON boolean or the numbers 0 / 1 (plain pydantic would also take "yes")."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return value == 1
    raise ValueError("expected a boolean")


class ScheduleCreate(BaseModel):
    title: str
    # Any JSON value: normalize_rule answers a malformed rule with the same 422 text as nextjs-api mode.
    rule: Any
    kind: str = "reminder"
    message: Optional[str] = None
    timezone: Optional[str] = None
    agent_context: str = "tasks"
    add_tasks: bool = False
    enabled: bool = True
    source_text: Optional[str] = None
    use_web: bool = False
    write_report: bool = False

    check_bools = field_validator("add_tasks", "enabled", "use_web", "write_report", mode="before")(_bool_or_01)


class ScheduleUpdate(BaseModel):
    title: Optional[str] = None
    kind: Optional[str] = None
    agent_context: Optional[str] = None
    message: Optional[str] = None
    timezone: Optional[str] = None
    source_text: Optional[str] = None
    add_tasks: Optional[bool] = None
    enabled: Optional[bool] = None
    use_web: Optional[bool] = None
    write_report: Optional[bool] = None
    rule: Any = None

    check_bools = field_validator("add_tasks", "enabled", "use_web", "write_report", mode="before")(_bool_or_01)


class ScheduleParseRequest(AISettings):
    text: str
    now: Any = None


class ScheduleRunRequest(AISettings):
    scheduled_for: Optional[str] = None
    source: Optional[str] = None
    now: Any = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _weekday_of(local_dt: str) -> Optional[str]:
    """`strptime(local_dt, "%Y-%m-%dT%H:%M")`'s weekday name, or None for an impossible date/time.

    Years 0000-0099 count as impossible, like in the TS twin (JS Date.UTC maps them to 1900-1999). The name comes
    from WEEKDAYS rather than strftime("%A") so a non-English server locale can't change the prompt.
    """
    if int(local_dt[:4]) < 100:
        return None
    try:
        return WEEKDAYS[datetime.strptime(local_dt, "%Y-%m-%dT%H:%M").weekday()]
    except ValueError:
        return None


def _local_now(sent: Any) -> str:
    """The client's local "YYYY-MM-DDTHH:MM" when valid, else the server's."""
    if isinstance(sent, str) and LOCAL_DT_RE.fullmatch(sent) and _weekday_of(sent):
        return sent
    return datetime.now().strftime("%Y-%m-%dT%H:%M")


def _utc_now_iso() -> str:
    """"YYYY-MM-DDTHH:MM:SS.mmmZ" (JS `new Date().toISOString()`)."""
    return datetime.now(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _js_string(value: Any) -> str:
    """JS `String(value)` for the scalar values an AI reply can hold (bools print lowercase, 5.0 prints as 5)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer() and abs(value) < 1e21:
        return str(int(value))
    return str(value)


def _clean_title(value: Any) -> str:
    return js_slice(js_trim(value), TITLE_MAX) if isinstance(value, str) else ""


def _clean_text(value: Any) -> Optional[str]:
    return js_trim(value) if isinstance(value, str) and js_trim(value) else None


TIMEZONE_RE = re.compile(r"[A-Za-z0-9_+\-/]{1,64}")


def _clean_timezone(value: Any) -> Optional[str]:
    """An IANA zone name ("Asia/Kolkata") safe to put in a prompt, or None. Twin: cleanTimezone in handlers.ts."""
    if not isinstance(value, str):
        return None
    tz = js_trim(value)
    return tz if TIMEZONE_RE.fullmatch(tz) else None


def _time_line(now: str, weekday: Optional[str], timezone: Optional[str]) -> str:
    """The prompt's "now" line. The time zone, when known, is the model's only hint of where the person is: the web
    search runs from the server, so without a place in the query "weather" or "local news" comes back for the server's
    location, not theirs."""
    zone = f"; time zone {timezone}, so likely where they are unless they say otherwise" if timezone else ""
    return f"Current local date and time: {now} ({weekday}{zone})."


def _one_of(value: Any, allowed: tuple) -> bool:
    """`allowed.has(value)` without tripping over an unhashable value from an AI reply."""
    return isinstance(value, str) and value in allowed


def _require_schedule(schedule_id: int, user_id: int) -> Dict[str, Any]:
    schedule = get_schedule(schedule_id, user_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


def _checked_rule(raw: Any, now: Optional[str] = None) -> Dict[str, Any]:
    rule, error = normalize_rule(raw, now)
    if error is not None:
        raise HTTPException(status_code=422, detail=error)
    return rule


def _checked_kind(value: str) -> str:
    if value not in KINDS:
        raise HTTPException(status_code=422, detail="kind must be 'reminder' or 'agent'.")
    return value


def _checked_context(value: str) -> str:
    if value not in CONTEXTS:
        raise HTTPException(status_code=422, detail="agent_context must be 'tasks', 'workspace' or 'none'.")
    return value


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("/schedules")
async def list_schedules_endpoint(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return list_schedules(user_id)


@router.post("/schedules")
async def create_schedule_endpoint(payload: ScheduleCreate, user_id: int = Depends(get_current_user_id)) -> dict:
    title = _clean_title(payload.title)
    if not title:
        raise HTTPException(status_code=422, detail="Give the schedule a title.")
    rule = _checked_rule(payload.rule)
    return create_schedule(
        user_id,
        title,
        rule,
        kind=_checked_kind(payload.kind),
        message=_clean_text(payload.message),
        timezone=_clean_text(payload.timezone),
        agent_context=_checked_context(payload.agent_context),
        add_tasks=payload.add_tasks,
        enabled=payload.enabled,
        source_text=_clean_text(payload.source_text),
        use_web=payload.use_web,
        write_report=payload.write_report,
    )


@router.patch("/schedules/{schedule_id}")
async def update_schedule_endpoint(
    schedule_id: int,
    payload: Optional[ScheduleUpdate] = None,  # an empty body changes nothing, as in the TS twin
    user_id: int = Depends(get_current_user_id),
) -> dict:
    updates = patch_updates(payload if payload is not None else ScheduleUpdate(), SCHEDULE_NULLABLE)
    if "title" in updates:
        updates["title"] = _clean_title(updates["title"])
        if not updates["title"]:
            raise HTTPException(status_code=422, detail="Give the schedule a title.")
    if "kind" in updates:
        _checked_kind(updates["kind"])
    if "agent_context" in updates:
        _checked_context(updates["agent_context"])
    for key in ("message", "timezone", "source_text"):
        if key in updates:
            updates[key] = _clean_text(updates[key])
    if "rule" in updates:
        updates["rule"] = _checked_rule(updates["rule"])
    updated = update_schedule(schedule_id, user_id, **updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return updated


@router.delete("/schedules/{schedule_id}")
async def delete_schedule_endpoint(schedule_id: int, user_id: int = Depends(get_current_user_id)) -> dict:
    if not delete_schedule(schedule_id, user_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"status": "deleted", "id": schedule_id}


@router.get("/schedules/activity")
async def activity_endpoint(user_id: int = Depends(get_current_user_id)) -> List[dict]:
    return list_recent_agent_runs(user_id)


@router.get("/schedules/{schedule_id}/runs")
async def list_runs_endpoint(schedule_id: int, user_id: int = Depends(get_current_user_id)) -> List[dict]:
    _require_schedule(schedule_id, user_id)
    return list_runs(schedule_id, user_id)


# ── AI: sentence -> schedule draft ───────────────────────────────────────────


@router.post("/schedules/parse")
async def parse_schedule_endpoint(payload: ScheduleParseRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    text = js_trim(payload.text)
    if not text:
        raise HTTPException(status_code=400, detail="Say or type what to schedule.")
    now = _local_now(payload.now)
    weekday = _weekday_of(now)

    prompt = f"""You turn a request into a scheduled job for a to-do app.
Current local date and time: {now} ({weekday}).

Request: "{text}"

Return ONLY a JSON object:
{{
  "title": "Short name for the job, at most 60 characters",
  "kind": "reminder or agent",
  "message": "For a reminder: the text to show. For an agent: the instructions the AI follows each time it runs",
  "agent_context": "tasks or none",
  "add_tasks": false,
  "rule": {{"repeat": "once|interval|daily|weekdays|weekly|monthly|cron"}}
}}
Rule fields by repeat (add them inside "rule"):
- once: "at": "YYYY-MM-DDTHH:MM"
- interval: "every_minutes": 15-10080, "start": "YYYY-MM-DDTHH:MM" (the first run)
- daily or weekdays: "time": "HH:MM"
- weekly: "time": "HH:MM", "days": [0-6] (0 = Sunday, 6 = Saturday)
- monthly: "time": "HH:MM", "day_of_month": 1-31
- cron: "cron": "minute hour day-of-month month day-of-week", only when nothing above fits
- a repeating rule may add "end": "YYYY-MM-DD" when the request gives a last day
Rules:
- kind is "agent" when the AI has to think or write something each time it runs (plan my day, summarize, review, check, quiz me, suggest); "reminder" when the person only wants to be told something at a time.
- agent_context is "tasks" when the job needs their to-do list (planning, reviews, overdue checks), else "none". add_tasks is true only when they ask the AI to add or create tasks.
- A time without a day is today if it is still ahead, otherwise tomorrow. "Every morning" means 08:00, "every evening" 19:00 and "every night" 21:00 unless a time is said.
- For an interval, start is now rounded up to the next 5 minutes unless they say when to start.
- Keep the person's language in title and message.
No extra text, no markdown blocks, just the raw JSON object."""

    try:
        response_text = call_ai(prompt, payload)
        parsed = extract_json_object(response_text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI could not read that request: {exc}")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="AI could not read that request: no JSON object in the reply")

    rule, error = normalize_rule(parsed.get("rule"), now)
    if error is not None:
        raise HTTPException(
            status_code=422,
            detail=f'AI couldn\'t work out when to run this: {error} Try saying the time, e.g. "every weekday at 9am".',
        )
    kind = parsed["kind"] if _one_of(parsed.get("kind"), KINDS) else "reminder"
    raw_title = parsed.get("title")
    title = _clean_title(_js_string(raw_title) if raw_title is not None else "") or js_slice(text, 60)
    agent_context = parsed["agent_context"] if _one_of(parsed.get("agent_context"), CONTEXTS) else (
        "tasks" if kind == "agent" else "none"
    )
    return {
        "schedule": {
            "title": title,
            "kind": kind,
            "message": _clean_text(parsed.get("message")),
            "agent_context": agent_context,
            "add_tasks": kind == "agent" and parsed.get("add_tasks") is True,
            "rule": rule,
            "source_text": text,
        }
    }


# ── Run one occurrence ───────────────────────────────────────────────────────


def _open_tasks_for_prompt(user_id: int) -> List[Dict[str, Any]]:
    """The user's open tasks, soonest due first, at most 40, as compact dicts."""
    active = [t for t in get_all_tasks(user_id) if t.get("status") not in ("done", "not_done")]
    active.sort(key=lambda t: (t.get("due_date") is None, t.get("due_date") or "", t.get("priority") or "p3", t["id"]))
    return [
        {
            "id": t["id"],
            "title": t["title"],
            "priority": t.get("priority"),
            "due_date": t.get("due_date"),
            "status": t.get("status"),
        }
        for t in active[:40]
    ]


def _clean_agent_tasks(raw: Any, limit: int = 5) -> List[Dict[str, Any]]:
    """At most `limit` well-formed task suggestions."""
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in raw[:limit]:
        if not isinstance(item, dict):
            continue
        title = js_slice(js_trim(item["title"]), 200) if isinstance(item.get("title"), str) else ""
        if not title:
            continue
        due_date = item.get("due_date")
        out.append({
            "title": title,
            "priority": item["priority"] if _one_of(item.get("priority"), PRIORITIES) else "p3",
            "due_date": due_date if isinstance(due_date, str) and DATE_RE.fullmatch(due_date) else None,
        })
    return out


def _json_object(text: str) -> Optional[Dict[str, Any]]:
    """The reply's JSON object, or None when there is none (the raw text is then the answer). A reply that isn't strict
    JSON (a <think> block first, raw newlines in the markdown, cut off at max_tokens) is read leniently, so the person
    sees the answer and not a raw `{"reply": ...` blob with its actions lost."""
    try:
        candidate = extract_json_object(text)
        if isinstance(candidate, dict):
            return candidate
    except Exception:
        pass  # not strict JSON: read it leniently below
    return extract_json_object_lenient(text)


def _run_budget(schedule: Dict[str, Any]) -> int:
    """Output tokens for one run: a full report needs room, a notification doesn't."""
    return 3000 if schedule["write_report"] else 1024


def _run_prompt(
    schedule: Dict[str, Any], now: str, weekday: Optional[str], tasks_block: str, web: str, ask_search: bool
) -> str:
    """The run prompt; the report and web lines and rules are added only for jobs that use them."""
    report_line = (
        '\n  "report": "The full report, shown in the app: markdown allowed (### headings, bullet lists, **bold**), '
        'no emoji, at most 4000 characters",'
        if schedule["write_report"]
        else ""
    )
    search_line = (
        '\n  "web_search": "A short web search query for the current information this run needs",'
        if ask_search
        else ""
    )
    extra_rules = ""
    if schedule["write_report"]:
        extra_rules += "- message is the short version for the notification; report is the complete answer.\n"
    if ask_search:
        extra_rules += (
            "- web_search: this job reads the web on every run. Set it to a short search query for what this run needs "
            "(name the place for weather or anything local; add the month and year for news, prices or releases) and leave "
            "the other fields empty; you will get the results and answer then.\n"
        )
    if web:
        extra_rules += "- Use the web results for current facts; never make up news, prices or dates.\n"
    return f"""You are the scheduled assistant inside LabNinja, a personal to-do app. A job the person scheduled is running now, and your answer is shown to them as a phone notification.
{_time_line(now, weekday, _clean_timezone(schedule.get('timezone')))}

Job: {schedule['title']}
Instructions: {schedule['message'] or 'No extra instructions.'}

{tasks_block}{web}Return ONLY a JSON object:
{{
  "title": "Notification title, at most 60 characters",
  "message": "Your answer for the person: plain text, no markdown, at most 700 characters",{report_line}{search_line}
  "tasks": [
    {{"title": "Short imperative task title", "due_date": "YYYY-MM-DD or null", "priority": "p1|p2|p3|p4"}}
  ]
}}
Rules:
- Follow the instructions (the job's title says what it is for when they are short). Be specific, and use the person's tasks when they matter; never invent tasks they don't have.
- Do the job now, for today, and give the finished result: never say you will do it later, and never ask the person anything or wait for an answer (they can't reply to this). A quiz gives its questions with the answers below them.
- Refer to tasks by title, never by id.
- tasks: new tasks only when the instructions ask you to create, plan or suggest tasks (at most 5); otherwise [].
{extra_rules}- Keep the person's language.
No extra text, no markdown blocks, just the raw JSON object."""


@router.post("/schedules/{schedule_id}/run")
async def run_schedule_endpoint(
    schedule_id: int,
    payload: Optional[ScheduleRunRequest] = None,  # an empty body is a plain run, as in the TS twin
    user_id: int = Depends(get_current_user_id),
) -> dict:
    if payload is None:
        payload = ScheduleRunRequest()
    schedule = _require_schedule(schedule_id, user_id)
    sent_for = payload.scheduled_for
    scheduled_for = js_slice(js_trim(sent_for), 64) if sent_for and js_trim(sent_for) else _utc_now_iso()
    source = payload.source if payload.source and payload.source in SOURCES else "web"
    disable_once = source != "manual"

    claimed_run, claimed = claim_run(schedule_id, user_id, scheduled_for, source)
    if not claimed:
        return {"run": claimed_run, "duplicate": True, "tasks": []}

    if schedule["kind"] != "agent":
        run = finish_run(
            claimed_run["id"], schedule_id, "ok", schedule["title"], schedule["message"], disable_once=disable_once
        )
        return {"run": run, "duplicate": False, "tasks": []}

    now = _local_now(payload.now)
    weekday = _weekday_of(now)
    tasks_block = ""
    if schedule["agent_context"] == "tasks":
        open_tasks = _open_tasks_for_prompt(user_id)
        tasks_block = (
            f"Their open tasks (JSON, soonest due first):\n{json.dumps(open_tasks, indent=2)}\n\n"
            if open_tasks
            else "Their open tasks: none.\n\n"
        )
    elif schedule["agent_context"] == "workspace":
        tasks_block = f"Their To-Do workspace (JSON):\n{json.dumps(workspace_context(user_id, now[:10]))}\n\n"

    settings = payload
    query: Optional[str] = None
    results: List[Dict[str, Any]] = []
    try:
        response_text = call_ai(
            _run_prompt(schedule, now, weekday, tasks_block, "", ask_search=schedule["use_web"]),
            settings,
            _run_budget(schedule),
        )
        obj = _json_object(response_text)
        # A job set to read the web always searches: when the model answered instead of asking (from its training data,
        # so stale news, prices and weather), the job's title is the query.
        query = None
        if schedule["use_web"]:
            query = search_query(obj.get("web_search")) if obj is not None else None
            if query is None:
                query = search_query(schedule["title"])
        if query is not None:
            results = await run_search(query)
            response_text = call_ai(
                _run_prompt(schedule, now, weekday, tasks_block, web_block(query, results), ask_search=False),
                settings,
                _run_budget(schedule),
            )
            obj = _json_object(response_text)
    except Exception as exc:
        detail = f"AI could not run this job: {exc}"
        finish_run(
            claimed_run["id"], schedule_id, "error", schedule["title"], js_slice(detail, OUTPUT_MAX),
            disable_once=disable_once,
        )
        raise HTTPException(status_code=502, detail=detail)

    report: Optional[str] = None
    if obj is not None:
        raw_title = obj.get("title")
        raw_message = obj.get("message")
        title = js_slice(js_trim(_js_string(raw_title) if raw_title is not None else ""), 80) or schedule["title"]
        message = js_slice(js_trim(_js_string(raw_message) if raw_message is not None else ""), OUTPUT_MAX)
        suggestions = _clean_agent_tasks(obj.get("tasks"))
        raw_report = obj.get("report")
        if schedule["write_report"] and isinstance(raw_report, str) and js_trim(raw_report):
            report = js_slice(js_trim(raw_report), REPORT_MAX)
    else:
        title = schedule["title"]
        message = js_slice(js_trim(response_text), OUTPUT_MAX)
        suggestions = []
    if not message:
        message = "The AI returned an empty answer."

    created: List[Dict[str, Any]] = []
    if schedule["add_tasks"]:
        for s in suggestions:
            created.append(
                create_task(
                    user_id,
                    s["title"],
                    priority=s["priority"],
                    due_date=s["due_date"],
                    context=f'Added by the scheduled job "{schedule["title"]}".',
                )
            )
    run = finish_run(
        claimed_run["id"], schedule_id, "ok", title, message,
        created_task_ids=[t["id"] for t in created],
        disable_once=disable_once,
        report=report,
        sources=sources_of(results) if query is not None else None,
    )
    return {"run": run, "duplicate": False, "tasks": created if schedule["add_tasks"] else suggestions}
