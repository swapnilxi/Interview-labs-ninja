"""The To-Do Assistant: a chat that answers from the person's own data, looks things up on the web and acts.

Endpoint:
  POST /todo/agent/chat   {messages: [{role: "user"|"assistant", content}], now, voice?, ...AISettings}
       -> {reply, speech, actions, notes, sources, searched}

Each turn reads a fresh snapshot of the To-Do workspace and the person's schedules (agent/context.py) into the prompt,
so "what's overdue?" or "write my weekly report" is answered from real rows. The model may ask for one web search
(agent/web_step.py); the server runs it and asks again with the results. It may also propose actions: create, change,
pause, run or delete a schedule, add tasks, complete a task. This endpoint only validates them (ids must be the
person's, rules go through normalize_rule) and returns them: the app carries them out through the ordinary endpoints,
so every change is validated twice, re-syncs the alarms and can be undone. Nothing here writes to the database.

TypeScript twin: frontend/fe-apis/todo/agent/handlers.ts. Prompt, limits and texts are copied verbatim, change both.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException

from modules.auth.dependencies import get_current_user_id
from modules.common.ai import AISettings

from ..schedules.db import get_schedule
from ..schedules.router import (
    CONTEXTS,
    KINDS,
    _clean_agent_tasks,
    _clean_text,
    _clean_timezone,
    _clean_title,
    _js_string,
    _json_object,
    _local_now,
    _one_of,
    _time_line,
    _weekday_of,
)
from ..schedules.rules import js_slice, js_trim, normalize_rule
from ..shared.ai_helpers import call_ai
from ..tasks.db import get_task
from .context import schedules_context, workspace_context
from .web_step import run_search, search_query, sources_of, web_block

router = APIRouter(prefix="/todo", tags=["agent"], dependencies=[Depends(get_current_user_id)])

HISTORY_MAX = 16
MESSAGE_MAX = 4000
TRANSCRIPT_MAX = 20000
REPLY_MAX = 8000
SPEECH_MAX = 600
ACTIONS_MAX = 8
TASKS_PER_ACTION = 10
SOURCE_TEXT_MAX = 500
# A report in the chat can be REPLY_MAX characters of markdown inside a JSON string plus speech and actions: 2048
# tokens cut those off mid-string. Twin: CHAT_BUDGET in handlers.ts.
CHAT_BUDGET = 4096
ROLES = ("user", "assistant")
ID_RE = re.compile(r"[0-9]{1,12}")
EMPTY_REPLY = "I couldn't put an answer together. Try asking another way."


class AgentChatRequest(AISettings):
    messages: Any = None
    now: Any = None
    timezone: Any = None
    voice: Any = None


# ── Input ────────────────────────────────────────────────────────────────────


def _clean_messages(raw: Any) -> List[Dict[str, str]]:
    """The last HISTORY_MAX well-formed turns, each cut to MESSAGE_MAX; the transcript is then trimmed from the oldest
    end to TRANSCRIPT_MAX characters (the latest turn always stays)."""
    if not isinstance(raw, list):
        return []
    turns: List[Dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict) or not _one_of(item.get("role"), ROLES):
            continue
        content = item.get("content")
        if not isinstance(content, str) or not js_trim(content):
            continue
        turns.append({"role": item["role"], "content": js_slice(js_trim(content), MESSAGE_MAX)})
    turns = turns[-HISTORY_MAX:]
    while len(turns) > 1 and sum(len(t["content"]) for t in turns) > TRANSCRIPT_MAX:
        turns = turns[1:]
    return turns


def _transcript(turns: List[Dict[str, str]]) -> str:
    return "\n\n".join(f"{'Person' if t['role'] == 'user' else 'Assistant'}: {t['content']}" for t in turns)


def _as_id(value: Any) -> Optional[int]:
    """A row id from the model's JSON: an integer, an integral float or a digit string."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, float) and value.is_integer():
        return int(value) if value > 0 else None
    if isinstance(value, str) and ID_RE.fullmatch(js_trim(value)):
        return int(js_trim(value)) or None
    return None


# ── Prompt ───────────────────────────────────────────────────────────────────


def _chat_prompt(
    now: str, weekday: Optional[str], timezone: Optional[str], workspace: str, schedules: str, web: str,
    transcript: str, voice: bool, ask_search: bool,
) -> str:
    voice_rule = (
        "- They are talking to you by voice right now and hear your speech: keep reply short too, unless they asked for "
        "a report.\n"
        if voice
        else ""
    )
    search_rule = (
        "- web_search: when answering needs current information from the internet that isn't above (news, prices, "
        "weather, releases, facts you aren't sure of), set it to a short search query and leave reply, speech and "
        "actions empty; you will get the results and answer then. Otherwise null. For weather or anything local, put "
        "the place in the query (their time zone hints where they are when they don't say).\n"
        if ask_search
        else "- You already searched the web: answer now from the results above and keep web_search null.\n"
    )
    return f"""You are the Assistant in LabNinja, the person's personal to-do and learning app. You talk with them in a chat, sometimes by voice. You answer questions about their work from the data below, write reports and summaries, look things up on the web, and schedule reminders and AI jobs that run later.
{_time_line(now, weekday, timezone)}

Their To-Do workspace (JSON):
{workspace}

Their schedules (JSON; "rule" is when it runs, in their local time; "reads" is what an AI job reads):
{schedules}

{web}Conversation (oldest first):
{transcript}

Return ONLY a JSON object:
{{
  "reply": "Your answer, shown in the chat. Markdown allowed: short paragraphs, bullet lists, **bold**, ### headings for a report",
  "speech": "The same answer said out loud: 1-3 short spoken sentences, no markdown, no lists, no links",
  "web_search": null,
  "actions": []
}}
Actions (put them in "actions"; the app carries them out right away and the person can undo them):
- {{"type": "create_schedule", "title": "Short name, at most 60 characters", "kind": "reminder or agent", "message": "For a reminder: the text to show. For an agent: the instructions the AI follows each time it runs", "reads": "none, tasks or workspace", "web": false, "report": false, "add_tasks": false, "rule": {{"repeat": "once|interval|daily|weekdays|weekly|monthly|cron"}}}}
- {{"type": "update_schedule", "id": 12, "enabled": false}} to pause (false) or resume (true); it may also set a new "title", "message" or "rule"
- {{"type": "run_schedule", "id": 12}} to run an existing schedule now
- {{"type": "delete_schedule", "id": 12}} only when they clearly ask to delete or remove it; the app asks them to confirm
- {{"type": "add_tasks", "tasks": [{{"title": "Short imperative task title", "due_date": "YYYY-MM-DD or null", "priority": "p1|p2|p3|p4"}}]}} at most 10
- {{"type": "complete_task", "id": 34}} to mark one of their open tasks done
Rule fields by repeat (inside "rule"):
- once: "at": "YYYY-MM-DDTHH:MM"
- interval: "every_minutes": 15-10080, "start": "YYYY-MM-DDTHH:MM" (the first run)
- daily or weekdays: "time": "HH:MM"
- weekly: "time": "HH:MM", "days": [0-6] (0 = Sunday, 6 = Saturday)
- monthly: "time": "HH:MM", "day_of_month": 1-31
- cron: "cron": "minute hour day-of-month month day-of-week", only when nothing above fits
- a repeating rule may add "end": "YYYY-MM-DD" when they give a last day
Rules:
- Answer from the data above. Use real titles, dates and numbers; never invent tasks, projects, schedules or results. If something isn't there, say so.
- Schedule only when they want something to happen later or repeatedly ("remind me", "every Monday", "tomorrow at 6"). A question about now is answered now, not scheduled.
- kind is "agent" when the AI has to think, look something up or write something each time (plan my day, weekly report, news digest, quiz me); "reminder" when they only want to be told something.
- For an agent job: "reads" is "tasks" when it needs only their open tasks, "workspace" for reports and reviews that need projects, goals or finished work, else "none"; "web" is true when each run needs current information from the internet (news, prices, weather, releases); "report" is true when they want a report, digest, summary or review longer than a notification; "add_tasks" only when they ask it to add tasks.
- A time without a day is today if it is still ahead, otherwise tomorrow. "Every morning" means 08:00, "every evening" 19:00 and "every night" 21:00 unless a time is said. For an interval, start is now rounded up to the next 5 minutes unless they say when to start.
- To change, pause, run or delete a schedule, or complete a task, use its id from the data above. If it's unclear which one they mean, ask instead of acting.
- When you act, say what you did in a few words; the app shows the details.
{search_rule}{voice_rule}- Keep the person's language. Be brief and specific: lead with the answer.
No extra text, no markdown code fences, just the raw JSON object."""


# ── Output ───────────────────────────────────────────────────────────────────


def _clean_actions(raw: Any, user_id: int, now: str, source_text: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """The proposed actions that are safe to show and carry out, plus notes about the ones that weren't."""
    actions: List[Dict[str, Any]] = []
    notes: List[str] = []
    if not isinstance(raw, list):
        return actions, notes
    for item in raw[:ACTIONS_MAX]:
        if not isinstance(item, dict):
            continue
        kind_of_action = item.get("type")

        if kind_of_action == "create_schedule":
            raw_title = item.get("title")
            message = _clean_text(item.get("message"))
            title = _clean_title(_js_string(raw_title) if raw_title is not None else "") or js_slice(
                message or "Scheduled job", 60
            )
            rule, error = normalize_rule(item.get("rule"), now)
            if error is not None:
                notes.append(f'Couldn\'t schedule "{title}": {error}')
                continue
            kind = item["kind"] if _one_of(item.get("kind"), KINDS) else "reminder"
            agent = kind == "agent"
            reads = item["reads"] if _one_of(item.get("reads"), CONTEXTS) else "tasks"
            actions.append({
                "type": "create_schedule",
                "schedule": {
                    "title": title,
                    "kind": kind,
                    "message": message,
                    "agent_context": reads if agent else "none",
                    "use_web": agent and item.get("web") is True,
                    "write_report": agent and item.get("report") is True,
                    "add_tasks": agent and item.get("add_tasks") is True,
                    "rule": rule,
                    "source_text": js_slice(source_text, SOURCE_TEXT_MAX),
                },
            })

        elif kind_of_action in ("update_schedule", "run_schedule", "delete_schedule"):
            schedule_id = _as_id(item.get("id"))
            current = get_schedule(schedule_id, user_id) if schedule_id is not None else None
            if current is None:
                notes.append("Couldn't find that schedule.")
                continue
            if kind_of_action != "update_schedule":
                actions.append({"type": kind_of_action, "id": schedule_id, "title": current["title"]})
                continue
            patch: Dict[str, Any] = {}
            if isinstance(item.get("enabled"), bool):
                patch["enabled"] = item["enabled"]
            new_title = _clean_title(item.get("title"))
            if new_title:
                patch["title"] = new_title
            new_message = _clean_text(item.get("message"))
            if new_message:
                patch["message"] = new_message
            if item.get("rule") is not None:
                rule, error = normalize_rule(item.get("rule"), now)
                if error is not None:
                    notes.append(f'Couldn\'t change "{current["title"]}": {error}')
                else:
                    patch["rule"] = rule
            if not patch:
                continue
            actions.append({
                "type": "update_schedule",
                "id": schedule_id,
                "title": current["title"],
                "patch": patch,
                "before": {key: current[key] for key in patch},
            })

        elif kind_of_action == "add_tasks":
            tasks = _clean_agent_tasks(item.get("tasks"), TASKS_PER_ACTION)
            if tasks:
                actions.append({"type": "add_tasks", "tasks": tasks})

        elif kind_of_action == "complete_task":
            task_id = _as_id(item.get("id"))
            task = get_task(task_id, user_id) if task_id is not None else None
            if task is None or task.get("status") in ("done", "not_done"):
                notes.append("Couldn't find that open task.")
                continue
            actions.append({"type": "complete_task", "id": task_id, "title": task["title"], "before": task["status"]})
    return actions, notes


@router.post("/agent/chat")
async def agent_chat_endpoint(payload: AgentChatRequest, user_id: int = Depends(get_current_user_id)) -> dict:
    turns = _clean_messages(payload.messages)
    if not turns or turns[-1]["role"] != "user":
        raise HTTPException(status_code=400, detail="Say or type something to ask.")
    now = _local_now(payload.now)
    weekday = _weekday_of(now)
    timezone = _clean_timezone(payload.timezone)
    voice = payload.voice is True
    workspace = json.dumps(workspace_context(user_id, now[:10]))
    schedules = json.dumps(schedules_context(user_id))
    transcript = _transcript(turns)

    query: Optional[str] = None
    results: List[Dict[str, Any]] = []
    try:
        text = call_ai(
            _chat_prompt(now, weekday, timezone, workspace, schedules, "", transcript, voice, ask_search=True),
            payload,
            CHAT_BUDGET,
        )
        obj = _json_object(text)
        query = search_query(obj.get("web_search")) if obj is not None else None
        if query is not None:
            results = await run_search(query)
            text = call_ai(
                _chat_prompt(
                    now, weekday, timezone, workspace, schedules, web_block(query, results), transcript, voice,
                    ask_search=False,
                ),
                payload,
                CHAT_BUDGET,
            )
            obj = _json_object(text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI could not answer: {exc}")

    if obj is None:
        reply = js_slice(js_trim(text), REPLY_MAX)
        speech = ""
        actions: List[Dict[str, Any]] = []
        notes: List[str] = []
    else:
        raw_reply = obj.get("reply")
        raw_speech = obj.get("speech")
        reply = js_slice(js_trim(_js_string(raw_reply) if raw_reply is not None else ""), REPLY_MAX)
        speech = js_slice(js_trim(_js_string(raw_speech) if raw_speech is not None else ""), SPEECH_MAX)
        actions, notes = _clean_actions(obj.get("actions"), user_id, now, turns[-1]["content"])
    if not reply and not actions:
        reply = EMPTY_REPLY
    return {
        "reply": reply,
        "speech": speech,
        "actions": actions,
        "notes": notes,
        "sources": sources_of(results) if query is not None else [],
        "searched": query,
    }
