"""Guided Practice checks: the saved state (insert, update, stale save, delete, per-user and per-subtopic isolation), the
summary sanitising, the size limit, the validation of every endpoint and the AI endpoints' error mapping (standalone, like
the other backend/tests scripts; no AI provider is called, the model call is replaced by a recording fake).

Runs against a COPY of the real database (never the live file): copy backend/data/lab_ninja.sqlite3 somewhere, point
LABNINJA_TEST_DB_PATH at the copy and run
    cd backend && LABNINJA_TEST_DB_PATH=/tmp/guided-practice.sqlite3 uv run python tests/guided_practice_test.py
It refuses to run without LABNINJA_TEST_DB_PATH, or when that names the live database. Exits non-zero if any check fails.

The app under test is only this module's router with a stand-in for the login (the X-Test-User header is the user id,
no header is a guest), so it needs no accounts. The prompts are compared with the Next.js twin
(frontend/fe-apis/guidedPractice/prompts.ts) separately: same inputs to both, outputs diffed character for character.
"""
from __future__ import annotations

import ast
import json
import os
import sqlite3
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

DB = os.environ.get("LABNINJA_TEST_DB_PATH", "")
if not DB:
    sys.exit(
        "Refusing to run: set LABNINJA_TEST_DB_PATH to a COPY of backend/data/lab_ninja.sqlite3 "
        "(this script writes test rows and must never touch the live database)."
    )
if Path(DB).resolve() == (ROOT / "data" / "lab_ninja.sqlite3").resolve():
    sys.exit("Refusing to run: LABNINJA_TEST_DB_PATH names the live database. Point it at a copy.")
os.environ["LMS_CLASSES_DIR"] = str(Path(tempfile.mkdtemp(prefix="guided-practice-")) / "classes")
for key in ("GEMINI", "OPENAI", "ANTHROPIC", "DEEPSEEK", "GROQ", "OPENROUTER"):
    os.environ[f"{key}_API_KEY"] = ""

from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import modules.guided_practice.router as gp_router  # noqa: E402
from modules.auth.dependencies import get_current_user_id  # noqa: E402
from modules.common.ai import resolve_model  # noqa: E402
from modules.common.db import init_db  # noqa: E402
from modules.guided_practice.prompts import GUIDED_LABS, PROFILES, PromptCtx, build_curriculum_prompt, js_trim  # noqa: E402
from modules.guided_practice.store import save_state  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print("PASS" if ok else "FAIL", name, "" if ok else extra)
    if not ok:
        failures.append(name)


def rows(sql: str, *params):
    conn = sqlite3.connect(DB)
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


# ── Wiring: init_db creates the table, main.py serves the router ─────────────
init_db()
check(
    "init_db creates the table and its index",
    {r[0] for r in rows("SELECT name FROM sqlite_master WHERE name IN ('guided_practice_state', 'idx_guided_practice_state_user')")}
    == {"guided_practice_state", "idx_guided_practice_state_user"},
)
main_tree = ast.parse((ROOT / "main.py").read_text(encoding="utf-8"))
check(
    "main.py imports the router",
    any(
        isinstance(n, ast.ImportFrom)
        and n.module == "modules.guided_practice.router"
        and any(a.name == "router" and a.asname == "guided_practice_router" for a in n.names)
        for n in ast.walk(main_tree)
    ),
)
check(
    "main.py includes the router",
    any(
        isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == "include_router"
        and any(isinstance(a, ast.Name) and a.id == "guided_practice_router" for a in n.args)
        for n in ast.walk(main_tree)
    ),
)

# ── The app under test ───────────────────────────────────────────────────────
app = FastAPI()
app.include_router(gp_router.router)


def fake_user(x_test_user: str | None = Header(default=None)) -> int:
    """Stand-in for the login: the header carries the user id, no header is a guest."""
    if not x_test_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return int(x_test_user)


app.dependency_overrides[get_current_user_id] = fake_user
client = TestClient(app)
check("OpenAPI schema builds", "/guided-practice/state" in client.get("/openapi.json").json()["paths"])

ai_calls: list[dict] = []
ai_answer: dict = {"value": "MOCK", "error": None}


def fake_ai(prompt: str, settings, max_tokens: int = 2048) -> str:
    ai_calls.append({"prompt": prompt, "max_tokens": max_tokens, "model": settings.model})
    if ai_answer["error"]:
        raise RuntimeError(ai_answer["error"])
    return ai_answer["value"]


gp_router.call_ai_text = fake_ai

ALICE, BOB = 801, 802
BASE = "/guided-practice"


def call(user: int | None, method: str, path: str, **kw):
    headers = {"x-test-user": str(user)} if user is not None else {}
    if "raw" in kw:
        kw["content"] = kw.pop("raw").encode("utf-8")
        headers["content-type"] = "application/json"
    return client.request(method, f"{BASE}{path}", headers=headers, **kw)


def put(user: int | None, body: dict):
    return call(user, "PUT", "/state", json=body)


PAGE = {"topic_id": "two-sum"}
SUB = {"topic_id": "two-sum", "subtopic_id": "sorted-input"}
STATE_1 = {"path": {"phases": [{"title": "Warm up — café", "questions": ["q1", "q2"]}]}, "progress": {"done": ["q1"]}, "emoji": "\U0001f680", "n": 3, "f": 1.5, "t": True, "z": None}
STATE_2 = {**STATE_1, "progress": {"done": ["q1", "q2"]}}
SUMMARY_1 = {"percent": 40, "completed": 2, "total": 5, "xp": 120, "level": 2, "levelTitle": "Apprentice", "phasesDone": 1, "phases": 4, "bossDefeated": False}
SUMMARY_1_TEXT = '{"percent":40,"completed":2,"total":5,"xp":120,"level":2,"levelTitle":"Apprentice","phasesDone":1,"phases":4,"bossDefeated":false}'
STALE = "Your saved progress changed somewhere else (another tab or device). Reload to continue."

# ── Login: every endpoint refuses a guest ────────────────────────────────────
for method, path, extra in [
    ("GET", "/state?topic_id=t", {}), ("PUT", "/state", {"json": {"topic_id": "t", "state": {}}}), ("DELETE", "/state?topic_id=t", {}),
    ("GET", "/summary?topic_id=t", {}),
    *[("POST", f"/{name}", {"json": {"topic_id": "t", "topic_name": "T", "question": {"title": "Q"}, "message": "m"}}) for name in ("curriculum", "question", "breakdown", "deeper", "tutor", "star")],
]:
    check(f"guest is refused: {method} {path.split('?')[0]}", call(None, method, path, **extra).status_code == 401)

# ── State: the happy path ────────────────────────────────────────────────────
r = call(ALICE, "GET", "/state", params=PAGE)
check("nothing saved yet", r.status_code == 200 and r.json() == {"exists": False, "version": 0, "state": None, "summary": None, "updatedAt": None}, r.text[:150])
r = call(ALICE, "GET", "/summary", params=PAGE)
check("no summary yet", r.json() == {"exists": False, "summary": None, "updatedAt": None})

r = put(ALICE, {**PAGE, "expected_version": 0, "state": STATE_1, "summary": SUMMARY_1})
saved_at = r.json().get("updatedAt")
check("first save is version 1", r.status_code == 200 and r.json()["version"] == 1 and bool(saved_at), r.text[:150])
r = call(ALICE, "GET", "/state", params=PAGE)
body = r.json()
check("load returns the saved document, version and timestamp", body["exists"] is True and body["version"] == 1 and body["state"] == STATE_1 and body["summary"] == SUMMARY_1 and body["updatedAt"] == saved_at, r.text[:200])
check("response key order is exists, version, state, summary, updatedAt", list(body) == ["exists", "version", "state", "summary", "updatedAt"])
check("the stored document is compact JSON with non-ASCII kept", rows("SELECT state_json FROM guided_practice_state WHERE user_id = ? AND topic_id = 'two-sum'", ALICE)[0][0] == json.dumps(STATE_1, ensure_ascii=False, separators=(",", ":")))
check("the stored summary has the fixed key order and compact separators", rows("SELECT summary_json FROM guided_practice_state WHERE user_id = ? AND topic_id = 'two-sum'", ALICE)[0][0] == SUMMARY_1_TEXT)
r = call(ALICE, "GET", "/summary", params=PAGE)
check("summary endpoint returns just the summary", r.json() == {"exists": True, "summary": SUMMARY_1, "updatedAt": saved_at}, r.text[:200])
check("summary response key order is exists, summary, updatedAt", list(r.json()) == ["exists", "summary", "updatedAt"])

r = put(ALICE, {**PAGE, "expected_version": 1, "state": STATE_2, "summary": {**SUMMARY_1, "percent": 80}})
check("saving over the loaded version bumps it to 2", r.status_code == 200 and r.json()["version"] == 2, r.text[:150])
r = put(ALICE, {**PAGE, "expected_version": 1, "state": STATE_1})
check("a stale save (quoting version 1) is refused with 409", r.status_code == 409 and r.json()["detail"] == STALE, r.text[:150])
r = put(ALICE, {**PAGE, "expected_version": 0, "state": STATE_1})
check("'nothing saved yet' (0) is refused once a row exists", r.status_code == 409 and r.json()["detail"] == STALE)
check("a version from the future is refused", put(ALICE, {**PAGE, "expected_version": 9, "state": STATE_1}).status_code == 409)
r = call(ALICE, "GET", "/state", params=PAGE)
check("a refused save changed nothing", r.json()["version"] == 2 and r.json()["state"] == STATE_2 and r.json()["summary"]["percent"] == 80)
r = put(ALICE, {**PAGE, "expected_version": 2, "state": {"only": "state"}})
check("a save without a summary resets it to zeros", r.json()["version"] == 3 and call(ALICE, "GET", "/summary", params=PAGE).json()["summary"] == {"percent": 0, "completed": 0, "total": 0, "xp": 0, "level": 0, "levelTitle": "", "phasesDone": 0, "phases": 0, "bossDefeated": False})

# per user and per subtopic
check("another user sees nothing of it", call(BOB, "GET", "/state", params=PAGE).json()["exists"] is False)
r = put(BOB, {**PAGE, "expected_version": 0, "state": {"bob": True}})
check("another user saves their own version 1", r.status_code == 200 and r.json()["version"] == 1)
check("Alice's page is untouched by Bob's save", call(ALICE, "GET", "/state", params=PAGE).json()["version"] == 3)
call(BOB, "DELETE", "/state", params=PAGE)
check("Bob's reset does not touch Alice's page", call(ALICE, "GET", "/state", params=PAGE).json()["exists"] is True)
r = put(ALICE, {**SUB, "expected_version": 0, "state": {"sub": True}, "summary": {"percent": 5}})
check("a subtopic page is separate (its own version 1)", r.status_code == 200 and r.json()["version"] == 1)
check("the topic's own page kept its version", call(ALICE, "GET", "/state", params=PAGE).json()["version"] == 3)
check("the subtopic page loads on its own", call(ALICE, "GET", "/state", params=SUB).json()["state"] == {"sub": True})

# reset
r = call(ALICE, "DELETE", "/state", params=PAGE)
check("reset answers {ok: true}", r.status_code == 200 and r.json() == {"ok": True})
check("a reset page loads as not started", call(ALICE, "GET", "/state", params=PAGE).json()["exists"] is False)
check("a reset page has no summary", call(ALICE, "GET", "/summary", params=PAGE).json()["exists"] is False)
check("reset leaves the subtopic page alone", call(ALICE, "GET", "/state", params=SUB).json()["exists"] is True)
check("reset twice is fine", call(ALICE, "DELETE", "/state", params=PAGE).json() == {"ok": True})
check("updating a page that is gone is refused", put(ALICE, {**PAGE, "expected_version": 3, "state": {"x": 1}}).status_code == 409)
r = put(ALICE, {**PAGE, "expected_version": 0, "state": {"again": 1}})
check("after a reset the page starts again at version 1", r.status_code == 200 and r.json()["version"] == 1)

# unreadable stored JSON reads as null, like the TS twin
rows_changed = sqlite3.connect(DB)
rows_changed.execute("UPDATE guided_practice_state SET state_json = 'not json', summary_json = '' WHERE user_id = ? AND topic_id = 'two-sum' AND subtopic_id = ''", (ALICE,))
rows_changed.commit()
rows_changed.close()
r = call(ALICE, "GET", "/state", params=PAGE).json()
check("unparseable stored JSON reads as null", r["exists"] is True and r["state"] is None and r["summary"] is None)

# ── State: the labs (the same topic id under dsa and cv is two pages) ────────
LAB_PAGE = {"topic_id": "lab-topic"}
r = put(ALICE, {"lab": "cv", **LAB_PAGE, "expected_version": 0, "state": {"which": "cv"}, "summary": {"percent": 25}})
check("cv: the first save is version 1", r.status_code == 200 and r.json()["version"] == 1, r.text[:150])
check("dsa has nothing of it: the lab is part of the page", call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "dsa"}).json()["exists"] is False and call(ALICE, "GET", "/summary", params=LAB_PAGE).json()["exists"] is False)
r = put(ALICE, {**LAB_PAGE, "expected_version": 0, "state": {"which": "dsa"}, "summary": {"percent": 60}})
check("no lab is dsa: the same topic id starts its own version 1", r.status_code == 200 and r.json()["version"] == 1, r.text[:150])
check("each lab loads its own document", call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "cv"}).json()["state"] == {"which": "cv"} and call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "dsa"}).json()["state"] == {"which": "dsa"})
check("the default lab is dsa", call(ALICE, "GET", "/state", params=LAB_PAGE).json()["state"] == {"which": "dsa"})
check("summaries are per lab", [call(ALICE, "GET", "/summary", params={**LAB_PAGE, **lab}).json()["summary"]["percent"] for lab in ({"lab": "cv"}, {"lab": "dsa"}, {})] == [25, 60, 60])
r = put(ALICE, {"lab": "cv", **LAB_PAGE, "expected_version": 1, "state": {"which": "cv", "n": 2}, "summary": {"percent": 50}})
check("a cv save bumps only cv's version", r.json()["version"] == 2 and call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "dsa"}).json()["version"] == 1)
r = put(ALICE, {"lab": "dsa", **LAB_PAGE, "expected_version": 2, "state": {"x": 1}})
check("cv's version quoted on the dsa page is refused (409)", r.status_code == 409 and r.json()["detail"] == STALE, r.text[:150])
check("a stale cv save is refused too", put(ALICE, {"lab": "cv", **LAB_PAGE, "expected_version": 1, "state": {"x": 1}}).status_code == 409)
put(ALICE, {"lab": "cv", **LAB_PAGE, "subtopic_id": "s1", "expected_version": 0, "state": {"sub": "cv"}})
check("a subtopic page is per lab as well", call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "cv", "subtopic_id": "s1"}).json()["exists"] is True and call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "dsa", "subtopic_id": "s1"}).json()["exists"] is False)
check("the rows carry their lab_name", rows("SELECT lab_name FROM guided_practice_state WHERE user_id = ? AND topic_id = 'lab-topic' AND subtopic_id = '' ORDER BY lab_name", ALICE) == [("cv",), ("dsa",)])
r = call(ALICE, "PUT", "/state", params={"lab": "cv"}, json={"topic_id": "lab-q", "expected_version": 0, "state": {"q": 1}})
check("a save reads its lab from the body only: ?lab=cv is ignored", r.status_code == 200 and call(ALICE, "GET", "/state", params={"topic_id": "lab-q", "lab": "dsa"}).json()["exists"] is True and call(ALICE, "GET", "/state", params={"topic_id": "lab-q", "lab": "cv"}).json()["exists"] is False)
r = put(ALICE, {"lab": None, "topic_id": "lab-null", "expected_version": 0, "state": {"n": 1}})
check("a null lab means 'not sent': dsa", r.status_code == 200 and call(ALICE, "GET", "/state", params={"topic_id": "lab-null"}).json()["exists"] is True)
call(ALICE, "DELETE", "/state", params={**LAB_PAGE, "lab": "cv"})
check("a cv reset leaves the dsa page and its summary", call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "cv"}).json()["exists"] is False and call(ALICE, "GET", "/summary", params={**LAB_PAGE, "lab": "cv"}).json()["exists"] is False and call(ALICE, "GET", "/state", params=LAB_PAGE).json()["version"] == 1 and call(ALICE, "GET", "/summary", params=LAB_PAGE).json()["summary"]["percent"] == 60)
check("... and the cv subtopic page", call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "cv", "subtopic_id": "s1"}).json()["exists"] is True)
call(ALICE, "DELETE", "/state", params=LAB_PAGE)
check("a reset with no lab is a dsa reset", call(ALICE, "GET", "/state", params={**LAB_PAGE, "lab": "dsa"}).json()["exists"] is False)
r = put(ALICE, {"lab": "cv", **LAB_PAGE, "expected_version": 0, "state": {"again": "cv"}})
check("a reset cv page starts again at version 1", r.status_code == 200 and r.json()["version"] == 1, r.text[:150])
check("updating the reset dsa page is refused although cv has a row", put(ALICE, {"lab": "dsa", **LAB_PAGE, "expected_version": 1, "state": {"x": 1}}).status_code == 409)
for bad in ("system_design", "", "DSA", "CV", " cv", "5", "dsa,cv"):
    for method, path in (("GET", "/state"), ("GET", "/summary"), ("DELETE", "/state")):
        check(f"{method} {path}: lab {bad!r} is 422", call(ALICE, method, path, params={"topic_id": "t", "lab": bad}).status_code == 422)
for bad in ("system_design", "", "DSA", "CV", " cv", 5, 0, True, False, ["cv"], {"a": 1}):
    r = put(ALICE, {"lab": bad, "topic_id": "t-bad", "state": {"a": 1}})
    check(f"PUT state: lab {bad!r} is 422 and saves nothing", r.status_code == 422 and not rows("SELECT 1 FROM guided_practice_state WHERE topic_id = 't-bad'"), r.text[:100])

# ── State: the version rule under contention ─────────────────────────────────
with ThreadPoolExecutor(8) as pool:
    first = list(pool.map(lambda i: save_state(ALICE, "dsa", "race", "", 0, json.dumps({"i": i}), "{}"), range(8)))
check("8 concurrent first saves: exactly one wins", sum(x is not None for x in first) == 1, str(first))
with ThreadPoolExecutor(8) as pool:
    second = list(pool.map(lambda i: save_state(ALICE, "dsa", "race", "", 1, json.dumps({"i": i}), "{}"), range(8)))
check("8 concurrent saves from version 1: exactly one wins", sum(x is not None for x in second) == 1, str(second))
check("the loser did not bump the version", rows("SELECT version FROM guided_practice_state WHERE user_id = ? AND lab_name = 'dsa' AND topic_id = 'race'", ALICE)[0][0] == 2)
with ThreadPoolExecutor(8) as pool:
    cv_first = list(pool.map(lambda i: save_state(ALICE, "cv", "race", "", 0, json.dumps({"i": i}), "{}"), range(8)))
check("the same topic id under cv races on its own: exactly one first save wins, at version 1", sum(x is not None for x in cv_first) == 1 and next(x for x in cv_first if x)["version"] == 1, str(cv_first))
check("... and dsa's version is untouched", rows("SELECT version FROM guided_practice_state WHERE user_id = ? AND lab_name = 'dsa' AND topic_id = 'race'", ALICE)[0][0] == 2)

# ── State: size limit ────────────────────────────────────────────────────────
r = put(ALICE, {"topic_id": "size-ok", "state": {"a": "x" * 1_499_992}})
check("a document of exactly 1,500,000 characters is saved", r.status_code == 200, r.text[:150])
r = put(ALICE, {"topic_id": "size-over", "state": {"a": "x" * 1_499_993}})
check("one character more is refused with 413", r.status_code == 413 and r.json()["detail"] == "This page's progress is too large to save (max 1500000 characters).", r.text[:150])
check("a refused document is not saved", call(ALICE, "GET", "/state", params={"topic_id": "size-over"}).json()["exists"] is False)
check("emoji count as two characters, like JavaScript's length", put(ALICE, {"topic_id": "size-emoji-ok", "state": {"a": "\U0001f600" * 749_996}}).status_code == 200 and put(ALICE, {"topic_id": "size-emoji-over", "state": {"a": "\U0001f600" * 749_997}}).status_code == 413)

# ── State: odd JSON ──────────────────────────────────────────────────────────
r = call(ALICE, "PUT", "/state", raw='{"topic_id": "lone", "state": {"cut": "ok \\ud83d", "pair": "\\ud83d\\ude80"}, "summary": {"levelTitle": "t\\ud83d"}}')
check("a lone surrogate (an emoji cut in half) is saved", r.status_code == 200, r.text[:150])
check("... stored as an escape, like JSON.stringify", '"cut":"ok \\ud83d"' in rows("SELECT state_json FROM guided_practice_state WHERE user_id = ? AND topic_id = 'lone'", ALICE)[0][0])
r = call(ALICE, "GET", "/state", params={"topic_id": "lone"})
check("... and loaded again", r.status_code == 200 and r.json()["state"]["cut"] == "ok \ud83d" and r.json()["state"]["pair"] == "\U0001f680", r.text[:150])
check("... in the summary too", call(ALICE, "GET", "/summary", params={"topic_id": "lone"}).status_code == 200)
r = call(ALICE, "PUT", "/state", raw='{"topic_id": "nan", "state": {"x": NaN}}')
check("NaN in a document is refused with 422", r.status_code == 422 and r.json()["detail"] == "Invalid JSON body", r.text[:150])
r = call(ALICE, "PUT", "/state", raw='{"topic_id": "dupes", "state": {"b": 1, "a": 2, "a": 3}}')
check("duplicate keys: the last one wins", r.status_code == 200 and call(ALICE, "GET", "/state", params={"topic_id": "dupes"}).json()["state"] == {"b": 1, "a": 3})
r = put(ALICE, {"topic_id": "nulls", "subtopic_id": None, "expected_version": None, "state": {"k": "v"}, "summary": None, "bogus": [1]})
check("null means 'not sent' and unknown keys are ignored", r.status_code == 200 and r.json()["version"] == 1, r.text[:150])

# ── State: summary sanitising ────────────────────────────────────────────────
def summary_of(value, raw: bool = False) -> dict | None:
    topic = f"sum-{len(rows('SELECT 1 FROM guided_practice_state'))}"
    if raw:
        r = call(ALICE, "PUT", "/state", raw='{"topic_id": "%s", "state": {"s": 1}, "summary": %s}' % (topic, value))
    else:
        r = put(ALICE, {"topic_id": topic, "state": {"s": 1}, "summary": value})
    assert r.status_code == 200, r.text
    return call(ALICE, "GET", "/summary", params={"topic_id": topic}).json()["summary"]


ZERO = {"percent": 0, "completed": 0, "total": 0, "xp": 0, "level": 0, "levelTitle": "", "phasesDone": 0, "phases": 0, "bossDefeated": False}
s = summary_of({"percent": 99.9, "completed": 7.2, "total": 1e9, "xp": 99999999999, "level": -3, "levelTitle": "Wizard", "phasesDone": 2.999, "phases": 1001, "bossDefeated": True})
check("numbers are floored and clamped", s == {"percent": 99, "completed": 7, "total": 100000, "xp": 10000000, "level": 0, "levelTitle": "Wizard", "phasesDone": 2, "phases": 1000, "bossDefeated": True}, str(s))
check("negative numbers become 0", summary_of({"percent": -0.5, "completed": -1, "total": -100, "xp": -1e9}) == ZERO)
check("strings, lists, objects and null are not numbers", summary_of({"percent": "50", "completed": "x", "total": [1], "xp": {"a": 1}, "level": None, "levelTitle": 5, "bossDefeated": "true"}) == ZERO)
check("booleans are not numbers", summary_of({"percent": True, "completed": False, "total": True, "bossDefeated": 1}) == ZERO)
check("only a literal true defeats the boss", summary_of({"bossDefeated": True})["bossDefeated"] is True and summary_of({"bossDefeated": "true"})["bossDefeated"] is False)
check("the level title is cut at 40 characters", summary_of({"levelTitle": "y" * 41})["levelTitle"] == "y" * 40 and summary_of({"levelTitle": "x" * 40})["levelTitle"] == "x" * 40)
check("... counting UTF-16 units like JavaScript's slice(0, 40): 41 emoji keep 20", summary_of({"levelTitle": "\U0001f600" * 41})["levelTitle"] == "\U0001f600" * 20)
check("... and an emoji on the edge is cut in half", summary_of({"levelTitle": "a" * 39 + "\U0001f600"})["levelTitle"] == "a" * 39 + "\ud83d")
check("a summary that is not an object becomes zeros", all(summary_of(v) == ZERO for v in ([1, 2, 3], "nope", 5, None)))
check("1e999 and -1e999 are not finite: 0", summary_of('{"percent": 1e999, "completed": -1e999, "total": 1e308, "xp": 5e-324, "level": 12.5}', raw=True) == {**ZERO, "total": 100000, "level": 12})
check("an integer beyond the float range is not finite either: 0", summary_of('{"percent": 1' + "0" * 400 + ', "completed": -1' + "0" * 400 + ', "total": 12345678901234567890}', raw=True) == {**ZERO, "total": 100000})
check("unknown summary keys are dropped", set(summary_of({"percent": 10, "evil": "<script>", "nested": {"a": 1}})) == set(ZERO))

# ── Validation of the state endpoints ────────────────────────────────────────
ok_state = {"a": 1}
for name, params in [("missing topic_id", {}), ("empty topic_id", {"topic_id": ""}), ("topic_id of 201 characters", {"topic_id": "t" * 201}), ("subtopic_id of 201 characters", {"topic_id": "t", "subtopic_id": "s" * 201})]:
    check(f"GET state: {name} is 422", call(ALICE, "GET", "/state", params=params).status_code == 422)
    check(f"GET summary: {name} is 422", call(ALICE, "GET", "/summary", params=params).status_code == 422)
    check(f"DELETE state: {name} is 422", call(ALICE, "DELETE", "/state", params=params).status_code == 422)
check("topic_id of 200 characters is fine", call(ALICE, "GET", "/state", params={"topic_id": "t" * 200}).status_code == 200)
for name, body in [
    ("missing topic_id", {"state": ok_state}), ("empty topic_id", {"topic_id": "", "state": ok_state}), ("topic_id of 201 characters", {"topic_id": "t" * 201, "state": ok_state}),
    ("topic_id that is a number", {"topic_id": 5, "state": ok_state}), ("subtopic_id of 201 characters", {"topic_id": "t", "subtopic_id": "s" * 201, "state": ok_state}),
    ("expected_version -1", {"topic_id": "t", "expected_version": -1, "state": ok_state}), ("expected_version 1.5", {"topic_id": "t", "expected_version": 1.5, "state": ok_state}),
    ("expected_version as a string", {"topic_id": "t", "expected_version": "1", "state": ok_state}), ("expected_version true", {"topic_id": "t", "expected_version": True, "state": ok_state}),
    ("expected_version 1000000001", {"topic_id": "t", "expected_version": 1000000001, "state": ok_state}),
    ("state that is a list", {"topic_id": "t", "state": [1, 2]}), ("state that is a string", {"topic_id": "t", "state": "x"}), ("state that is a number", {"topic_id": "t", "state": 3}),
    ("state null", {"topic_id": "t", "state": None}), ("missing state", {"topic_id": "t"}),
]:
    check(f"PUT state: {name} is 422", put(ALICE, body).status_code == 422)
check("PUT state: empty body is 422", call(ALICE, "PUT", "/state", raw="").status_code == 422)
check("PUT state: malformed JSON is 422", call(ALICE, "PUT", "/state", raw='{"topic_id": "t", "state": {').status_code == 422)
for raw in ("null", "[]", "[1, 2, 3]", '"abc"', "5", "true"):
    check(f"PUT state: a body of {raw} is 422", call(ALICE, "PUT", "/state", raw=raw).status_code == 422)
check("expected_version 1000000000 is fine", put(ALICE, {"topic_id": "t-big", "expected_version": 1000000000, "state": ok_state}).status_code == 409)

# ── AI endpoints: validation (refused before any prompt is built) ────────────
AI = {"model": "custom", "customKey": "k", "customBaseUrl": "http://127.0.0.1:1/v1", "customModel": "m"}
CTX = {**AI, "topic_id": "two-sum", "topic_name": "Two Sum"}
Q = {"title": "Why does the window shrink?"}


def post(endpoint: str, body: dict, user: int | None = ALICE):
    return call(user, "POST", f"/{endpoint}", json=body)


def refused(name: str, endpoint: str, body: dict, detail: str | None = None) -> None:
    before = len(ai_calls)
    r = post(endpoint, body)
    ok = r.status_code == 422 and len(ai_calls) == before and (detail is None or r.json().get("detail") == detail)
    check(f"{endpoint}: {name} is 422 and no model call", ok, f"{r.status_code} {r.text[:120]}")


def accepted(name: str, endpoint: str, body: dict) -> None:
    before = len(ai_calls)
    r = post(endpoint, body)
    check(f"{endpoint}: {name} is accepted", r.status_code == 200 and len(ai_calls) == before + 1, f"{r.status_code} {r.text[:120]}")


refused("missing topic_name", "curriculum", {**AI, "topic_id": "t"})
refused("missing topic_id", "curriculum", {**AI, "topic_name": "T"})
refused("empty topic_name", "curriculum", {**AI, "topic_id": "t", "topic_name": ""})
refused("topic_name of 301 characters", "curriculum", {**AI, "topic_id": "t", "topic_name": "x" * 301})
accepted("topic_name of 300 characters", "curriculum", {**AI, "topic_id": "t", "topic_name": "x" * 300})
for field, limit in [("topic_brief", 2000), ("category", 200), ("difficulty", 40), ("subtopic_name", 300), ("subtopic_brief", 2000), ("learner_level", 120), ("learner_progress", 800), ("focus", 600)]:
    refused(f"{field} over {limit}", "curriculum", {**CTX, field: "x" * (limit + 1)})
    accepted(f"{field} of {limit}", "curriculum", {**CTX, field: "x" * limit})
refused("completed_titles of 41", "curriculum", {**CTX, "completed_titles": ["t"] * 41})
accepted("completed_titles of 40", "curriculum", {**CTX, "completed_titles": ["t"] * 40})
refused("a completed title of 301 characters", "curriculum", {**CTX, "completed_titles": ["t" * 301]})
refused("completed_titles that are not strings", "curriculum", {**CTX, "completed_titles": [1, 2]})
for value in (2, 7, 4.5, "5", True, 0):
    refused(f"phase_count {value!r}", "curriculum", {**CTX, "phase_count": value})
for value in (3, 6):
    accepted(f"phase_count {value}", "curriculum", {**CTX, "phase_count": value})
refused("question missing", "question", CTX)
refused("question that is null", "question", {**CTX, "question": None})
refused("question that is a string", "question", {**CTX, "question": "Why?"})
refused("question.title missing", "question", {**CTX, "question": {"objective": "x"}})
refused("question.title empty", "question", {**CTX, "question": {"title": ""}})
refused("question.title of 401 characters", "question", {**CTX, "question": {"title": "t" * 401}})
for value in (9, 0, 6, "2", 2.5, True):
    refused(f"question.level {value!r}", "question", {**CTX, "question": {**Q, "level": value}})
for value in (1, 5, None):
    accepted(f"question.level {value!r}", "question", {**CTX, "question": {**Q, "level": value}})
for field, limit in [("objective", 800), ("kind", 20), ("difficulty", 20), ("why", 800), ("relation", 20), ("angle", 40), ("effort", 40)]:
    refused(f"question.{field} over {limit}", "question", {**CTX, "question": {**Q, field: "x" * (limit + 1)}})
    accepted(f"question.{field} of {limit}", "question", {**CTX, "question": {**Q, field: "x" * limit}})
refused("wants_exercise as a string", "question", {**CTX, "question": {**Q, "wants_exercise": "yes"}})
refused("wants_exercise as a number", "question", {**CTX, "question": {**Q, "wants_exercise": 1}})
refused("phase_number 51", "question", {**CTX, "question": Q, "phase_number": 51})
refused("phase_number -1", "question", {**CTX, "question": Q, "phase_number": -1})
refused("phase_number 2.5", "question", {**CTX, "question": Q, "phase_number": 2.5})
accepted("phase_number 50", "question", {**CTX, "question": Q, "phase_number": 50})
refused("phase_title over 200", "question", {**CTX, "question": Q, "phase_title": "p" * 201})
refused("phase_goal over 500", "question", {**CTX, "question": Q, "phase_goal": "p" * 501})
refused("ancestry_titles of 9", "question", {**CTX, "question": Q, "ancestry_titles": ["a"] * 9})
accepted("ancestry_titles of 8", "question", {**CTX, "question": Q, "ancestry_titles": ["a"] * 8})
refused("an ancestry title of 401 characters", "question", {**CTX, "question": Q, "ancestry_titles": ["a" * 401]})
refused("sibling_titles of 13", "question", {**CTX, "question": Q, "sibling_titles": ["s"] * 13})
accepted("sibling_titles of 12", "question", {**CTX, "question": Q, "sibling_titles": ["s"] * 12})
refused("a sibling title of 301 characters", "question", {**CTX, "question": Q, "sibling_titles": ["s" * 301]})
refused("existing_children of 13", "breakdown", {**CTX, "question": Q, "existing_children": [{"title": "c"}] * 13})
accepted("existing_children of 12", "breakdown", {**CTX, "question": Q, "existing_children": [{"title": "c"}] * 12})
refused("an existing child without a title", "breakdown", {**CTX, "question": Q, "existing_children": [{"completed": True}]})
refused("an existing child with an empty title", "breakdown", {**CTX, "question": Q, "existing_children": [{"title": ""}]})
refused("existing_children that are not objects", "breakdown", {**CTX, "question": Q, "existing_children": ["a"]})
refused("an existing child's completed as a string", "breakdown", {**CTX, "question": Q, "existing_children": [{"title": "c", "completed": "yes"}]})
refused("path_titles of 61", "breakdown", {**CTX, "question": Q, "path_titles": ["p"] * 61})
accepted("path_titles of 60", "breakdown", {**CTX, "question": Q, "path_titles": ["p"] * 60})
refused("a path title of 301 characters", "breakdown", {**CTX, "question": Q, "path_titles": ["p" * 301]})
refused("regenerate as a string", "breakdown", {**CTX, "question": Q, "regenerate": "true"})
refused("regenerate as a number", "deeper", {**CTX, "question": Q, "regenerate": 1})
refused("existing_deeper of 15", "deeper", {**CTX, "question": Q, "existing_deeper": [{"title": "c"}] * 15})
accepted("existing_deeper of 14", "deeper", {**CTX, "question": Q, "existing_deeper": [{"title": "c"}] * 14})
for value in (6, 0, "2"):
    refused(f"an existing deeper question's level {value!r}", "deeper", {**CTX, "question": Q, "existing_deeper": [{"title": "c", "level": value}]})
refused("tutor: an action that does not exist", "tutor", {**CTX, "question": Q, "action": "dance", "message": "x"})
refused("tutor: an action that is a number", "tutor", {**CTX, "question": Q, "action": 3, "message": "x"})
refused("tutor: ask without a message", "tutor", {**CTX, "question": Q}, "message is required")
refused("tutor: ask with an empty message", "tutor", {**CTX, "question": Q, "action": "ask", "message": ""}, "message is required")
refused("tutor: ask with a blank message", "tutor", {**CTX, "question": Q, "message": "  \n\t "}, "message is required")
refused("tutor: ask with a message of only U+FEFF and no-break spaces", "tutor", {**CTX, "question": Q, "message": "\ufeff\u00a0\u3000"}, "message is required")
accepted("tutor: ask with U+001C as the message (JavaScript's trim() keeps it)", "tutor", {**CTX, "question": Q, "message": "\x1c"})
accepted("tutor: ask with U+0085 as the message (JavaScript's trim() keeps it)", "tutor", {**CTX, "question": Q, "message": "\u0085"})
accepted("tutor: hint without a message", "tutor", {**CTX, "question": Q, "action": "hint"})
refused("tutor: message over 2000", "tutor", {**CTX, "question": Q, "message": "m" * 2001})
accepted("tutor: message of 2000", "tutor", {**CTX, "question": Q, "message": "m" * 2000})
for value in (0, 4, 1.5, "2", True):
    refused(f"tutor: hint_level {value!r}", "tutor", {**CTX, "question": Q, "action": "hint", "hint_level": value})
refused("tutor: history of 17 turns", "tutor", {**CTX, "question": Q, "message": "x", "history": [{"role": "learner", "text": "a"}] * 17})
accepted("tutor: history of 16 turns", "tutor", {**CTX, "question": Q, "message": "x", "history": [{"role": "learner", "text": "a"}] * 16})
refused("tutor: history role 'x'", "tutor", {**CTX, "question": Q, "message": "x", "history": [{"role": "x", "text": "a"}]})
refused("tutor: history role 'user'", "tutor", {**CTX, "question": Q, "message": "x", "history": [{"role": "user", "text": "a"}]})
refused("tutor: history turn without a role", "tutor", {**CTX, "question": Q, "message": "x", "history": [{"text": "a"}]})
refused("tutor: history text of 3001", "tutor", {**CTX, "question": Q, "message": "x", "history": [{"role": "tutor", "text": "t" * 3001}]})
refused("tutor: history that is not objects", "tutor", {**CTX, "question": Q, "message": "x", "history": ["a"]})
for field, limit in [("explanation", 2500), ("exercise_prompt", 1500), ("learner_code", 6000), ("test_report", 1800), ("star_answer", 8000)]:
    refused(f"tutor: {field} over {limit}", "tutor", {**CTX, "question": Q, "message": "x", field: "x" * (limit + 1)})
    accepted(f"tutor: {field} of {limit}", "tutor", {**CTX, "question": Q, "message": "x", field: "x" * limit})
refused("tutor: child_titles of 11", "tutor", {**CTX, "question": Q, "message": "x", "child_titles": ["c"] * 11})
refused("tutor: a child title of 401 characters", "tutor", {**CTX, "question": Q, "message": "x", "child_titles": ["c" * 401]})
refused("tutor: completed_exercise_titles of 21", "tutor", {**CTX, "question": Q, "message": "x", "completed_exercise_titles": ["c"] * 21})
refused("tutor: solution_revealed as a string", "tutor", {**CTX, "question": Q, "message": "x", "solution_revealed": "yes"})
refused("star: a variant that does not exist", "star", {**CTX, "question": Q, "variant": "other"})
refused("star: simplify without existing_answer", "star", {**CTX, "question": Q, "variant": "simplify"}, "existing_answer is required")
refused("star: example with an empty existing_answer", "star", {**CTX, "question": Q, "variant": "example", "existing_answer": ""}, "existing_answer is required")
refused("star: simplify with a blank existing_answer", "star", {**CTX, "question": Q, "variant": "simplify", "existing_answer": " \n "}, "existing_answer is required")
refused("star: simplify with only U+FEFF as existing_answer", "star", {**CTX, "question": Q, "variant": "simplify", "existing_answer": "\ufeff"}, "existing_answer is required")
accepted("star: simplify with U+001C as existing_answer (JavaScript's trim() keeps it)", "star", {**CTX, "question": Q, "variant": "simplify", "existing_answer": "\x1c"})
accepted("star: generate without existing_answer", "star", {**CTX, "question": Q})
refused("star: existing_answer over 12000", "star", {**CTX, "question": Q, "variant": "simplify", "existing_answer": "a" * 12001})
accepted("star: existing_answer of 12000", "star", {**CTX, "question": Q, "variant": "simplify", "existing_answer": "a" * 12000})
refused("star: explanation over 2500", "star", {**CTX, "question": Q, "explanation": "e" * 2501})
refused("star: exercise_prompt over 1500", "star", {**CTX, "question": Q, "exercise_prompt": "e" * 1501})
for endpoint in ("curriculum", "question", "breakdown", "deeper", "tutor", "star"):
    for raw in ("null", "[]", '[{"topic_id": "t"}]', '"abc"', "5", "true", "", '{"topic_id": "t", '):
        before = len(ai_calls)
        r = call(ALICE, "POST", f"/{endpoint}", raw=raw)
        check(f"{endpoint}: a body of {raw!r} is 422 and no model call", r.status_code == 422 and len(ai_calls) == before, f"{r.status_code} {r.text[:100]}")

# ── AI endpoints: what a good request does ───────────────────────────────────
BODIES = {
    "curriculum": ({**CTX, "phase_count": 4, "focus": "pointers"}, 4096, "You are a senior algorithms instructor designing a guided practice path"),
    "question": ({**CTX, "question": Q}, 5000, "You are a patient senior algorithms instructor writing the full lesson"),
    "breakdown": ({**CTX, "question": Q}, 3000, "You are a patient senior algorithms instructor. A learner finds the question below too difficult."),
    "deeper": ({**CTX, "question": Q}, 3000, "You are a senior algorithms instructor. A learner understands the question below"),
    "tutor": ({**CTX, "question": Q, "message": "What is a window?"}, 1500, "You are a patient, technically strong programming mentor"),
    "star": ({**CTX, "question": Q}, 4000, "You are a senior engineer writing a complete reference answer to ONE question with the STAR framework"),
}
for endpoint, (body, max_tokens, opening) in BODIES.items():
    n = len(ai_calls)
    r = post(endpoint, body)
    seen = ai_calls[n] if len(ai_calls) > n else {}
    check(f"{endpoint}: answers {{text, model}}", r.status_code == 200 and r.json() == {"text": "MOCK", "model": "custom"}, r.text[:150])
    check(f"{endpoint}: asks for {max_tokens} tokens", seen.get("max_tokens") == max_tokens, str(seen.get("max_tokens")))
    check(f"{endpoint}: the prompt opens as the TS twin's does", seen.get("prompt", "").startswith(opening), seen.get("prompt", "")[:80])
    check(f"{endpoint}: the model call got the resolved model", seen.get("model") == "custom")
n = len(ai_calls)
r = post("curriculum", {"topic_id": "t", "topic_name": "T", **{k: v for k, v in AI.items() if k != "model"}})
check("an empty model resolves to the .env default and is echoed", r.status_code == 200 and r.json()["model"] == resolve_model("") and ai_calls[n]["model"] == resolve_model(""), r.text[:150])
n = len(ai_calls)
r = post("question", {**CTX, "topic_brief": None, "learner_level": None, "completed_titles": None, "question": {**Q, "level": None, "objective": None, "wants_exercise": None}, "phase_number": None, "sibling_titles": None, "bogus": {"a": 1}})
check("null means 'not sent' (defaults apply) and unknown keys are ignored", r.status_code == 200 and "Learner: level not known yet" in ai_calls[n]["prompt"], r.text[:150])
n = len(ai_calls)
r = call(ALICE, "POST", "/tutor", raw='{"topic_id": "t", "topic_name": "Two \\ud83d Sum", "question": {"title": "Q"}, "message": "cut \\ud83d", "history": [{"role": "learner", "text": "a \\ude80"}]}')
prompt = ai_calls[n]["prompt"] if len(ai_calls) > n else ""
check("half an emoji (a lone surrogate) in an AI request becomes U+FFFD instead of failing", r.status_code == 200 and all(s in prompt for s in ("Two \ufffd Sum", "cut \ufffd", "a \ufffd")), r.text[:150])
n = len(ai_calls)
post("tutor", {**CTX, "question": Q, "action": "hint", "hint_level": 3})
check("the hint level reaches the prompt", 'Start with "Hint 3 of 3 — ".' in ai_calls[n]["prompt"])
n = len(ai_calls)
post("tutor", {**CTX, "question": Q, "message": "x", "history": [{"role": "learner", "text": f"turn {i}"} for i in range(16)]})
check("the whole 16-turn history reaches the prompt", ai_calls[n]["prompt"].count("Learner: turn ") == 16)

# ── AI endpoints: the lab (a few words of every prompt) ──────────────────────
CV_OPENING = {
    "curriculum": "You are a senior computer vision instructor designing a guided practice path for ONE computer vision topic.",
    "question": "You are a patient senior computer vision instructor writing the full lesson",
    "breakdown": "You are a patient senior computer vision instructor. A learner finds the question below too difficult.",
    "deeper": "You are a senior computer vision instructor. A learner understands the question below",
    "tutor": "You are a patient, technically strong programming mentor",
    "star": "You are a senior engineer writing a complete reference answer to ONE question with the STAR framework",
}


def prompt_of(endpoint: str, body: dict) -> tuple:
    """(status, the prompt the model call got) for one request."""
    n = len(ai_calls)
    r = post(endpoint, body)
    return r.status_code, (ai_calls[n]["prompt"] if len(ai_calls) > n else ""), (ai_calls[n]["max_tokens"] if len(ai_calls) > n else None)


for endpoint, (body, max_tokens, _opening) in BODIES.items():
    status, default_prompt, _ = prompt_of(endpoint, body)
    status_cv, cv_prompt, cv_tokens = prompt_of(endpoint, {**body, "lab": "cv"})
    check(f"{endpoint}: lab cv answers with the same token budget", status_cv == 200 and cv_tokens == max_tokens, f"{status_cv} {cv_tokens}")
    check(f"{endpoint}: lab cv opens with the cv wording", cv_prompt.startswith(CV_OPENING[endpoint]), cv_prompt[:90])
    check(f"{endpoint}: lab cv names the subject 'Topic:', not 'Original problem:'", "Topic: Two Sum" in cv_prompt and "Original problem" not in cv_prompt, cv_prompt[:200])
    check(f"{endpoint}: no lab reads as dsa ('Original problem:')", "Original problem: Two Sum" in default_prompt and "Topic: Two Sum" not in default_prompt)
    check(f"{endpoint}: an explicit lab dsa is the same prompt as no lab", prompt_of(endpoint, {**body, "lab": "dsa"})[1] == default_prompt)
    check(f"{endpoint}: a null lab is the same prompt as no lab", prompt_of(endpoint, {**body, "lab": None})[1] == default_prompt)
    check(f"{endpoint}: the cv prompt differs from the dsa one", cv_prompt != default_prompt)
for bad in ("system_design", "", "DSA", "CV", " cv", 5, 0, True, False, ["cv"], {"a": 1}):
    for endpoint, (body, _tokens, _opening) in BODIES.items():
        refused(f"lab {bad!r}", endpoint, {**body, "lab": bad})
FULL = {**CTX, "topic_brief": "B", "category": "C", "difficulty": "D", "subtopic_name": "S"}
_, p, _ = prompt_of("curriculum", {**FULL, "lab": "cv", "phase_count": 4, "focus": "kernels"})
check("cv curriculum: the problem block uses the topic labels", all(s in p for s in ("Topic: Two Sum \u2014 S", "Topic summary: B", "Area: C", "Topic difficulty: D")), p[:300])
check("cv curriculum: the goal, the steps and the final boss are the cv ones", all(s in p for s in (
    "from not knowing the topic to building and using it well:",
    "Build up in small steps: build the intuition, learn the core operation, implement it on small inputs, connect it to a real pipeline, then failure modes and trade-offs. Name the phases for this topic; do not use generic titles.",
    '- Also design one final boss: a closing challenge that applies the whole topic end to end, with a one-sentence framing in "story".')), p[:300])
_, p, _ = prompt_of("curriculum", {**FULL, "phase_count": 4, "focus": "pointers"})
check("dsa curriculum: the original labels, goal and steps", all(s in p for s in (
    "Original problem: Two Sum \u2014 S", "Problem summary: B", "Pattern family: C", "Problem difficulty: D", "from not knowing the problem to solving it well:",
    "Build up in small steps: understand the problem, spot the pattern, build the pieces, assemble the solution, then edge cases and follow-ups. Name the phases for this problem; do not use generic titles.",
    '- Also design one final boss: the whole problem as a closing challenge, with a one-sentence framing in "story".')), p[:300])
_, p, _ = prompt_of("question", {**CTX, "lab": "cv", "question": {**Q, "relation": "boss"}})
check("cv question: the boss relation, the exercise data and the main challenge", all(s in p for s in (
    "This is the final boss: a closing challenge that applies the whole topic end to end. Only here may the reference solution solve the whole challenge.",
    "Images and feature maps are nested lists of numbers (rows of pixels), boxes are [x1, y1, x2, y2] lists, and everything stays plain Python: no numpy, OpenCV or PyTorch. Keep inputs small and say in the prompt how a value is laid out. No input(), no printing, no imports beyond the standard library.",
    'Do not give away the complete solution of the main challenge of the topic unless this question IS the main challenge of the topic (the final boss)')), p[-900:])
_, p, _ = prompt_of("question", {**CTX, "question": {**Q, "relation": "boss"}})
check("dsa question: the original boss relation and exercise data", all(s in p for s in (
    "This is the final boss: the complete original problem as a closing challenge. Only here may the reference solution solve the whole problem.",
    "Linked lists and trees are passed as plain lists; say how in the prompt. No input()",
    "unless this question IS the original problem (the final boss)")))
for endpoint in ("breakdown", "deeper"):
    _, p, _ = prompt_of(endpoint, {**CTX, "lab": "cv", "question": Q})
    check(f"cv {endpoint}: never give away the main challenge of the topic", "- Never give away the complete solution of the main challenge of the topic." in p and "original problem" not in p)
for action, words in (("example", "then connect it to the main challenge of the topic."), ("exercise", "(not the solution of the main challenge of the topic)"), ("ask", "9. Connect the concept back to the main challenge of the topic.")):
    _, p, _ = prompt_of("tutor", {**CTX, "lab": "cv", "question": Q, "action": action, "message": "hi"})
    check(f"cv tutor ({action}): the main challenge of the topic", words in p and "Never reveal the complete solution of the main challenge of the topic, or the full solution code" in p and "original problem" not in p)
_, p, _ = prompt_of("tutor", {**CTX, "question": Q, "action": "example"})
check("dsa tutor (example): the original problem", "then connect it to the original problem." in p and "9. Connect the concept back to the original problem." in p)
_, p, _ = prompt_of("star", {**CTX, "lab": "cv", "question": Q, "variant": "simplify", "existing_answer": "Old."})
check("cv star: the same STAR text, with the topic labels", "Topic: Two Sum" in p and "## S \u2014 Situation: the context of the problem" in p)

# ── AI endpoints: errors ─────────────────────────────────────────────────────
good = BODIES["curriculum"][0]
ai_answer["error"] = "No API key configured for this model. Add one in Config."
r = post("curriculum", good)
check("a missing API key is 400 with the provider's message", r.status_code == 400 and r.json()["detail"] == ai_answer["error"], r.text[:150])
ai_answer["error"] = "custom failed: HTTP 500"
r = post("curriculum", good)
check("any other provider failure is 502 'The AI call failed: ...'", r.status_code == 502 and r.json()["detail"] == "The AI call failed: custom failed: HTTP 500", r.text[:150])
ai_answer["error"] = None
for answer in ("", "   \n", "\ufeff \u00a0\n"):
    ai_answer["value"] = answer
    r = post("curriculum", good)
    check(f"a blank answer ({answer!r}) is 502", r.status_code == 502 and r.json()["detail"] == "The AI returned an empty answer. Try again.", r.text[:150])
ai_answer["value"] = None
check("an answer of None is 502", post("curriculum", good).status_code == 502)
ai_answer["value"] = "\x1c\x1c"
r = post("curriculum", good)
check("an answer of U+001C is not blank to JavaScript's trim() (the twin returns it)", r.status_code == 200 and r.json()["text"] == "\x1c\x1c", r.text[:150])
ai_answer["value"] = "  keeps its whitespace \n"
check("the answer is returned as written, not trimmed", post("curriculum", good).json()["text"] == "  keeps its whitespace \n")

# ── prompts: the labs and a lab without a profile ────────────────────────────
check("the labs are dsa and cv, each with a profile", GUIDED_LABS == ("dsa", "cv") and set(PROFILES) == {"dsa", "cv"})
dsa_prompt = build_curriculum_prompt(PromptCtx(topic_name="T"), 5, "")
check("a lab with no profile reads as dsa in the prompt builders (the handlers refuse it before that)", all(build_curriculum_prompt(PromptCtx(topic_name="T", lab=lab), 5, "") == dsa_prompt for lab in ("system_design", "", "DSA", None, 5)))
check("... and cv does not", build_curriculum_prompt(PromptCtx(topic_name="T", lab="cv"), 5, "") != dsa_prompt)

# ── js_trim: exactly what JavaScript's trim() removes ────────────────────────
JS_TRIMMED = [9, 10, 11, 12, 13, 32, 160, 5760, *range(8192, 8203), 8232, 8233, 8239, 8287, 12288, 65279]
check("js_trim removes exactly the characters String.prototype.trim() removes", all(js_trim(chr(cp)) == "" for cp in JS_TRIMMED) and all(js_trim(chr(cp)) == chr(cp) for cp in (0x1C, 0x1F, 0x85, 0x180E, 0x200B, 0x2060)))

print()
print(f"{len(failures)} failed" if failures else "all checks passed")
sys.exit(1 if failures else 0)
