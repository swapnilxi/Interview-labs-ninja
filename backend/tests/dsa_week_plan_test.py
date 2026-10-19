"""DSA week plan checks: the active plan (/dsa/week-plan), plan profiles (/dsa/week-plan/profiles), the lazy
migration of the old one-plan table, validation messages, isolation between users, and the AI auto organizer
(/dsa/week-plan/auto) with its normaliser (standalone, like the other backend/tests scripts; no AI provider is
called, the model call is replaced by a recording fake).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/dsa_week_plan_test.py
Exits non-zero if any check fails.
"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

scratch = tempfile.mkdtemp(prefix="dsa-week-plan-")
db_copy = str(Path(scratch) / "lab.sqlite3")
src = sqlite3.connect(str(ROOT / "data" / "lab_ninja.sqlite3"))
dst = sqlite3.connect(db_copy)
src.backup(dst)  # a consistent snapshot, even if a dev server has the live file open
src.close()
dst.close()
os.environ["LABNINJA_TEST_DB_PATH"] = db_copy
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
# main.py loads backend/.env, and NeonSyncMiddleware uploads the (scratch) database to Neon after every write
# when DATABASE_URL is set. An empty value is falsy for the middleware and stops load_dotenv (which never
# overrides a variable that already exists) from filling it in again.
os.environ["DATABASE_URL"] = ""
for key in ("GEMINI", "OPENAI", "ANTHROPIC", "DEEPSEEK", "GROQ", "OPENROUTER"):
    os.environ[f"{key}_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

import modules.dsa_lab.router as dsa_router  # noqa: E402
from main import app  # noqa: E402
from modules.auth.db import set_user_status  # noqa: E402
from modules.dsa_lab.auto_plan import auto_plan_max_tokens, build_auto_plan_prompt, normalize_auto_plan, validate_auto_request  # noqa: E402
from modules.dsa_lab.week_plan import _js_key_order  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print("PASS" if ok else "FAIL", name, "" if ok else extra)
    if not ok:
        failures.append(name)


def raw_db(sql: str, *args):
    conn = sqlite3.connect(db_copy)
    try:
        rows = conn.execute(sql, args).fetchall()
        conn.commit()
        return rows
    finally:
        conn.close()


RUN = secrets.token_hex(3)  # unique emails: the DB copy holds real users


def plan_body(weeks: int = 4, assignments: dict | None = None, **extra) -> dict:
    return {"weeks": weeks, "assignments": assignments or {}, **extra}


# ── The model call is faked: it records every prompt and answers with whatever `ai_reply` holds ──
calls: list[dict] = []
ai_reply: list = ["{}"]


def fake_ai(prompt: str, settings, max_tokens=None, **kw):
    calls.append({"prompt": prompt, "max_tokens": max_tokens, "settings": settings})
    reply = ai_reply[0]
    if isinstance(reply, Exception):
        raise reply
    return reply


dsa_router.call_ai_text = fake_ai


with TestClient(app) as client:
    tokens: dict[str, str] = {}
    ids: dict[str, int] = {}
    for who in ("ann", "bob", "carl", "dave", "erin", "pending"):
        r = client.post("/auth/signup", json={"email": f"{who}.{RUN}@dsa-week-plan.test", "password": "Passw0rd!x"})
        tokens[who] = r.json()["access_token"]
        ids[who] = r.json()["user"]["id"]
        if who != "pending":
            set_user_status(ids[who], "approved")

    def call(who: str | None, method: str, path: str, **kw):
        headers = {"Authorization": f"Bearer {tokens[who]}"} if who else {}
        return client.request(method, f"/dsa/week-plan{path}", headers=headers, **kw)

    def detail(r) -> str:
        try:
            return r.json().get("detail")
        except Exception:
            return r.text

    def expect_422(name: str, r, message: str) -> None:
        check(name, r.status_code == 422 and detail(r) == message, f"{r.status_code} {r.text[:200]}")

    def raw_call(who: str, method: str, path: str, body: str):
        """A request with a hand-written JSON body (for strings Python's json.dumps would refuse to emit)."""
        headers = {"Authorization": f"Bearer {tokens[who]}", "Content-Type": "application/json"}
        return client.request(method, f"/dsa/week-plan{path}", headers=headers, content=body.encode("utf-8"))

    def active_count(who: str) -> int:
        return raw_db("SELECT COUNT(*) FROM dsa_week_plan_profiles WHERE user_id = ? AND is_active = 1", ids[who])[0][0]

    # ── Auth ─────────────────────────────────────────────────────────────────
    for method, path in (("GET", ""), ("PUT", ""), ("DELETE", ""), ("GET", "/profiles"), ("POST", "/profiles"), ("GET", "/profiles/1"), ("PATCH", "/profiles/1"), ("POST", "/profiles/1/activate"), ("DELETE", "/profiles/1"), ("POST", "/auto")):
        check(f"guest is refused: {method} {path or '/'}", call(None, method, path, json={}).status_code in (401, 403))
    check("a pending account is refused", call("pending", "GET", "").status_code == 403)

    # ── Lazy legacy migration ────────────────────────────────────────────────
    legacy = {"weeks": 5, "assignments": {"tp-3sum": 1, "sw-longest-no-repeat": 2}}
    raw_db("INSERT INTO dsa_week_plans (user_id, plan_json, updated_at) VALUES (?, ?, '2026-01-02 03:04:05')", ids["ann"], json.dumps(legacy))
    r = call("ann", "GET", "")
    plan = r.json()["plan"]
    check("legacy plan becomes the active 'My plan' profile", r.status_code == 200 and plan is not None and plan["name"] == "My plan", r.text[:200])
    check(
        "migrated plan keeps weeks/assignments and gains empty order/labels",
        plan["weeks"] == 5 and plan["assignments"] == legacy["assignments"] and plan["order"] == [] and plan["labels"] == {},
        str(plan),
    )
    check("migrated plan keeps the legacy timestamp", plan["updatedAt"] == "2026-01-02 03:04:05")
    check("ActivePlan has exactly the contract's keys", list(plan) == ["weeks", "assignments", "order", "labels", "updatedAt", "profileId", "name"], str(list(plan)))
    created = raw_db("SELECT created_at, updated_at, summary, is_active FROM dsa_week_plan_profiles WHERE id = ?", plan["profileId"])[0]
    check("migrated profile: created_at = updated_at = legacy updated_at, summary '', active", created == ("2026-01-02 03:04:05", "2026-01-02 03:04:05", "", 1), str(created))
    check("legacy row is deleted after migrating", raw_db("SELECT COUNT(*) FROM dsa_week_plans WHERE user_id = ?", ids["ann"])[0][0] == 0)
    check("migration happens once", len(call("ann", "GET", "/profiles").json()["profiles"]) == 1)

    carl_first = call("carl", "POST", "/profiles", json={"name": "Carl's plan", "plan": plan_body(3, {"a": 1})}).json()["profile"]
    raw_db("INSERT INTO dsa_week_plans (user_id, plan_json) VALUES (?, ?)", ids["carl"], json.dumps(legacy))
    listing = call("carl", "GET", "/profiles").json()
    check("a user who already has profiles gets no copy of the legacy plan", [p["name"] for p in listing["profiles"]] == ["Carl's plan"], str(listing))
    check("... and the legacy row is still deleted", raw_db("SELECT COUNT(*) FROM dsa_week_plans WHERE user_id = ?", ids["carl"])[0][0] == 0)

    raw_db("INSERT INTO dsa_week_plans (user_id, plan_json) VALUES (?, ?)", ids["erin"], json.dumps(legacy))
    call("erin", "DELETE", "")
    erin = call("erin", "GET", "/profiles").json()
    check("DELETE /week-plan migrates first, then deactivates", [p["name"] for p in erin["profiles"]] == ["My plan"] and erin["activeId"] is None, str(erin))

    # ── PUT with no active profile creates "My plan" ────────────────────────
    r = call("bob", "GET", "")
    check("no profile: GET returns null (suggested plan)", r.status_code == 200 and r.json() == {"plan": None}, r.text)
    r = call("bob", "PUT", "", json=plan_body(6, {"tp-3sum": 1, "tp-container-most-water": 1, "sw-min-window-substring": 2}, order=["tp-container-most-water", "tp-3sum", "sw-min-window-substring"], labels={"1": "  Two pointers  ", "2": "Windows", "3": "   "}))
    bob_plan = r.json()["plan"]
    check("PUT with no profile creates and activates 'My plan'", r.status_code == 200 and bob_plan["name"] == "My plan" and active_count("bob") == 1, r.text[:200])
    check("order round-trips", bob_plan["order"] == ["tp-container-most-water", "tp-3sum", "sw-min-window-substring"])
    check("labels are trimmed and empty ones dropped", bob_plan["labels"] == {"1": "Two pointers", "2": "Windows"}, str(bob_plan["labels"]))
    stored = raw_db("SELECT plan_json FROM dsa_week_plan_profiles WHERE id = ?", bob_plan["profileId"])[0][0]
    check("plan_json stores the normalised plan, keys in order", list(json.loads(stored)) == ["weeks", "assignments", "order", "labels"], stored)
    r = call("bob", "PUT", "", json=plan_body(6, {"tp-3sum": 3}))
    check("PUT updates the active profile in place", r.json()["plan"]["profileId"] == bob_plan["profileId"] and r.json()["plan"]["assignments"] == {"tp-3sum": 3} and r.json()["plan"]["order"] == [] and r.json()["plan"]["labels"] == {})
    check("GET returns what PUT saved", call("bob", "GET", "").json()["plan"]["assignments"] == {"tp-3sum": 3})
    check("null order/labels mean empty", call("bob", "PUT", "", json=plan_body(6, {}, order=None, labels=None)).status_code == 200)

    call("bob", "DELETE", "")
    r = call("bob", "PUT", "", json=plan_body(2))
    check("'My plan' taken: PUT creates 'My plan 2'", r.json()["plan"]["name"] == "My plan 2", r.text[:200])
    my2 = r.json()["plan"]["profileId"]
    call("bob", "PATCH", f"/profiles/{bob_plan['profileId']}", json={"name": "my plan 3"})
    call("bob", "DELETE", "")
    r = call("bob", "PUT", "", json=plan_body(2))
    check("free-name search is case-insensitive", r.json()["plan"]["name"] == "My plan", r.text[:200])
    check("still one active profile", active_count("bob") == 1)

    # ── Plan validation (PUT) ─────────────────────────────────────────────────
    expect_422("empty question id", call("bob", "PUT", "", json=plan_body(4, {"": 1})), "Every question id must be 1-200 characters.")
    expect_422("overlong question id", call("bob", "PUT", "", json=plan_body(4, {"x" * 201: 1})), "Every question id must be 1-200 characters.")
    expect_422("week outside the plan", call("bob", "PUT", "", json=plan_body(4, {"tp-3sum": 5})), "'tp-3sum' is in week 5, but the plan has weeks 1-4.")
    expect_422("week 0", call("bob", "PUT", "", json=plan_body(4, {"tp-3sum": 0})), "'tp-3sum' is in week 0, but the plan has weeks 1-4.")
    expect_422("8 questions in a week", call("bob", "PUT", "", json=plan_body(4, {f"q{i}": 2 for i in range(8)})), "Week 2 has 8 questions; a week holds at most 7.")
    check("7 questions in a week is fine", call("bob", "PUT", "", json=plan_body(4, {f"q{i}": 2 for i in range(7)})).status_code == 200)
    expect_422("order not a list", call("bob", "PUT", "", json=plan_body(4, order="a,b")), "Field 'order' must be a list of question ids.")
    expect_422("order an object", call("bob", "PUT", "", json=plan_body(4, order={"a": 1})), "Field 'order' must be a list of question ids.")
    expect_422("order too long", call("bob", "PUT", "", json=plan_body(4, order=[f"q{i}" for i in range(501)])), "Field 'order' has too many entries (max 500).")
    check("order of 500 is fine", call("bob", "PUT", "", json=plan_body(4, order=[f"q{i}" for i in range(500)])).status_code == 200)
    expect_422("order item not a string", call("bob", "PUT", "", json=plan_body(4, order=["a", 5])), "Every question id must be 1-200 characters.")
    expect_422("order item empty", call("bob", "PUT", "", json=plan_body(4, order=[""])), "Every question id must be 1-200 characters.")
    expect_422("order item too long", call("bob", "PUT", "", json=plan_body(4, order=["y" * 201])), "Every question id must be 1-200 characters.")
    expect_422("order duplicate", call("bob", "PUT", "", json=plan_body(4, order=["a", "b", "a", "b"])), "'a' appears twice in 'order'.")
    expect_422("labels not an object", call("bob", "PUT", "", json=plan_body(4, labels=["Graphs"])), "Field 'labels' must be an object.")
    expect_422("labels a string", call("bob", "PUT", "", json=plan_body(4, labels="Graphs")), "Field 'labels' must be an object.")
    expect_422("label for a week past the plan", call("bob", "PUT", "", json=plan_body(4, labels={"5": "x"})), "There is a label for week '5', but the plan has weeks 1-4.")
    expect_422("label for week 0", call("bob", "PUT", "", json=plan_body(4, labels={"0": "x"})), "There is a label for week '0', but the plan has weeks 1-4.")
    expect_422("label key with a leading zero", call("bob", "PUT", "", json=plan_body(4, labels={"01": "x"})), "There is a label for week '01', but the plan has weeks 1-4.")
    expect_422("label key not a number", call("bob", "PUT", "", json=plan_body(4, labels={"one": "x"})), "There is a label for week 'one', but the plan has weeks 1-4.")
    expect_422("label key with a trailing newline", call("bob", "PUT", "", json=plan_body(4, labels={"3\n": "x"})), "There is a label for week '3\n', but the plan has weeks 1-4.")
    expect_422("label not text", call("bob", "PUT", "", json=plan_body(4, labels={"1": 5})), "Every week label must be text.")
    expect_422("label too long", call("bob", "PUT", "", json=plan_body(4, labels={"2": "z" * 61})), "Week 2's label is longer than 60 characters.")
    r = call("bob", "PUT", "", json=plan_body(4, labels={"2": "  " + "z" * 60 + "  "}))
    check("label length counts after trimming", r.status_code == 200 and r.json()["plan"]["labels"] == {"2": "z" * 60}, r.text[:200])
    expect_422("each order item is checked in full before the next (repeat found first)", call("bob", "PUT", "", json=plan_body(4, order=["a", "a", 5])), "'a' appears twice in 'order'.")
    expect_422("each label is checked in full before the next (text)", call("bob", "PUT", "", json=plan_body(4, labels={"1": 5, "9": "x"})), "Every week label must be text.")
    expect_422("each label is checked in full before the next (length)", call("bob", "PUT", "", json=plan_body(4, labels={"1": "z" * 61, "2": 5})), "Week 1's label is longer than 60 characters.")
    expect_422("checks run in order: assignments before order", call("bob", "PUT", "", json=plan_body(4, {"a": 9}, order=5)), "'a' is in week 9, but the plan has weeks 1-4.")
    expect_422("checks run in order: order before labels", call("bob", "PUT", "", json=plan_body(4, order=5, labels=5)), "Field 'order' must be a list of question ids.")
    # The twin sees parsed JSON objects in JavaScript key order (integer-like keys first, ascending), so the
    # first problem reported must come from the same key in both.
    expect_422("labels are checked in the twin's key order", call("bob", "PUT", "", json=plan_body(4, labels={"9": "x", "1": 5})), "Every week label must be text.")
    expect_422("labels: numeric keys before named ones", call("bob", "PUT", "", json=plan_body(4, labels={"abc": "x", "2": 5})), "Every week label must be text.")
    expect_422("assignments are checked in the twin's key order", call("bob", "PUT", "", json=plan_body(4, {"x": 9, "7": 8})), "'7' is in week 8, but the plan has weeks 1-4.")
    check("null assignments is rejected (missing means {})", call("bob", "PUT", "", json={"weeks": 4, "assignments": None}).status_code == 422)
    for bad in (0, 25, "3", True, 2.5, None):
        check(f"weeks {bad!r} is rejected", call("bob", "PUT", "", json=plan_body(bad)).status_code == 422)
    check("weeks 24 is fine", call("bob", "PUT", "", json=plan_body(24, {"a": 24})).status_code == 200)
    check("missing weeks is rejected", call("bob", "PUT", "", json={"assignments": {}}).status_code == 422)
    check("assignments not an object is rejected", call("bob", "PUT", "", json=plan_body(4, None) | {"assignments": [1]}).status_code == 422)
    check("assignment week as text is rejected", call("bob", "PUT", "", json=plan_body(4, {"a": "2"})).status_code == 422)
    check("assignment week as a boolean is rejected", call("bob", "PUT", "", json=plan_body(4, {"a": True})).status_code == 422)
    check("more than 500 assignments is rejected", call("bob", "PUT", "", json=plan_body(24, {f"q{i}": 1 + i % 24 for i in range(501)})).status_code == 422)

    # A digit-only key of thousands of characters is just a long id / a week that isn't in the plan: a 422,
    # never an int() ValueError (Python 3.12 refuses to convert more than 4300 digits).
    huge = "1" * 5000
    expect_422("5000-digit question id", call("bob", "PUT", "", json=plan_body(4, {huge: 1})), "Every question id must be 1-200 characters.")
    expect_422("5000-digit label key", call("bob", "PUT", "", json=plan_body(4, labels={huge: "x"})), f"There is a label for week '{huge}', but the plan has weeks 1-4.")
    expect_422("5000-digit label key in a profile", call("bob", "POST", "/profiles", json={"name": "Huge", "plan": plan_body(4, labels={huge: "x"})}), f"There is a label for week '{huge}', but the plan has weeks 1-4.")
    check("a 10-digit numeric id is still just an id", call("bob", "PUT", "", json=plan_body(4, {"4294967295": 1, "4294967294": 2})).status_code == 200)

    # Lone surrogates ("\ud800") can't be stored or sent back as UTF-8: refused with the field's usual message.
    expect_422("lone surrogate in a profile name", raw_call("bob", "POST", "/profiles", '{"name":"\\ud800","plan":{"weeks":4,"assignments":{}}}'), "A plan name must be 1-60 characters.")
    expect_422("lone surrogate in a profile summary", raw_call("bob", "POST", "/profiles", '{"name":"S","summary":"\\udc00","plan":{"weeks":4,"assignments":{}}}'), "The plan summary must be at most 600 characters.")
    expect_422("lone surrogate in a patched summary", raw_call("bob", "PATCH", f"/profiles/{bob_plan['profileId']}", '{"summary":"x\\ud800"}'), "The plan summary must be at most 600 characters.")
    expect_422("lone surrogate in a patched name", raw_call("bob", "PATCH", f"/profiles/{bob_plan['profileId']}", '{"name":"\\ud800"}'), "A plan name must be 1-60 characters.")
    expect_422("lone surrogate in a question id", raw_call("bob", "PUT", "", '{"weeks":4,"assignments":{"a\\ud800":1}}'), "Every question id must be 1-200 characters.")
    expect_422("lone surrogate in an order item", raw_call("bob", "PUT", "", '{"weeks":4,"assignments":{},"order":["\\ud800"]}'), "Every question id must be 1-200 characters.")
    expect_422("lone surrogate in a week label", raw_call("bob", "PUT", "", '{"weeks":4,"assignments":{},"labels":{"1":"\\ud800"}}'), "Every week label must be text.")
    expect_422("lone surrogate in a label key is quoted as U+FFFD", raw_call("bob", "PUT", "", '{"weeks":4,"assignments":{},"labels":{"\\ud800":"x"}}'), "There is a label for week '\ufffd', but the plan has weeks 1-4.")
    check("the plan was not bricked by those attempts", call("bob", "GET", "").status_code == 200)
    r = raw_call("bob", "POST", "/profiles", '{"name":"Plan \\ud83d\\ude00","plan":{"weeks":4,"assignments":{"q\\ud83d\\ude00":1}}}')
    check("a valid surrogate pair (an emoji) is fine", r.status_code == 201 and r.json()["profile"]["name"] == "Plan \U0001f600" and r.json()["profile"]["plan"]["assignments"] == {"q\U0001f600": 1}, r.text[:200])

    # ── PUT names the plan it edits ──────────────────────────────────────────
    px = call("erin", "POST", "/profiles", json={"name": "Stale X", "plan": plan_body(4, {"a": 1}), "activate": True}).json()["profile"]
    py = call("erin", "POST", "/profiles", json={"name": "Stale Y", "plan": plan_body(5, {"b": 2, "c": 3, "d": 4})}).json()["profile"]
    call("erin", "POST", f"/profiles/{py['id']}/activate")  # another tab switched to Y
    r = call("erin", "PUT", "", json=plan_body(4, {"a": 1, "e": 2}, profileId=px["id"]))
    check("PUT naming a plan that is not the active one is a 409", r.status_code == 409 and detail(r) == "This plan is no longer the active one.", r.text[:200])
    check("... and nothing was written (Y keeps its questions, X too)", call("erin", "GET", f"/profiles/{py['id']}").json()["profile"]["plan"]["assignments"] == {"b": 2, "c": 3, "d": 4} and call("erin", "GET", f"/profiles/{px['id']}").json()["profile"]["plan"]["assignments"] == {"a": 1})
    r = call("erin", "PUT", "", json=plan_body(5, {"b": 2, "c": 3}, profileId=py["id"]))
    check("PUT naming the active plan saves to it", r.status_code == 200 and r.json()["plan"]["profileId"] == py["id"] and r.json()["plan"]["assignments"] == {"b": 2, "c": 3}, r.text[:200])
    r = call("erin", "PUT", "", json=plan_body(5, {"b": 2}, profileId=None))
    check("profileId null while a plan is active is a 409", r.status_code == 409 and detail(r) == "This plan is no longer the active one.", r.text[:200])
    check("PUT without profileId keeps writing to the active plan", call("erin", "PUT", "", json=plan_body(5, {"b": 2, "d": 4})).json()["plan"]["profileId"] == py["id"])
    expect_422("an invalid plan is a 422 before the stale 409", call("erin", "PUT", "", json=plan_body(4, {"a": 9}, profileId=px["id"])), "'a' is in week 9, but the plan has weeks 1-4.")
    for bad in ("5", True, 2.5, [1], {"id": 1}):
        expect_422(f"profileId {bad!r} is a 422", call("erin", "PUT", "", json=plan_body(4, profileId=bad)), "Field 'profileId' must be an integer or null.")
    call("erin", "DELETE", "")  # back to the suggested plan: none active
    have = len(call("erin", "GET", "/profiles").json()["profiles"])
    r = call("erin", "PUT", "", json=plan_body(4, {"z": 1}, profileId=py["id"]))
    check("PUT naming a plan while none is active is a 409 and creates nothing", r.status_code == 409 and len(call("erin", "GET", "/profiles").json()["profiles"]) == have and active_count("erin") == 0, r.text[:200])
    r = call("erin", "PUT", "", json=plan_body(4, {"z": 1}, profileId=None))
    check("profileId null with none active creates 'My plan N' as before", r.status_code == 200 and r.json()["plan"]["name"].startswith("My plan") and active_count("erin") == 1, r.text[:200])
    check("another user's profile id is just a stale id (409)", call("erin", "PUT", "", json=plan_body(4, {"z": 1}, profileId=carl_first["id"])).status_code == 409)
    check("profileId inside a nested profile plan is ignored", call("erin", "POST", "/profiles", json={"name": "Nested", "plan": plan_body(4, profileId="junk")}).status_code == 201)

    # ── Profiles ─────────────────────────────────────────────────────────────
    expect_422("profile without a plan", call("ann", "POST", "/profiles", json={"name": "X"}), "Field 'plan' must be an object.")
    expect_422("profile with a null plan", call("ann", "POST", "/profiles", json={"name": "X", "plan": None}), "Field 'plan' must be an object.")
    expect_422("profile with a list plan", call("ann", "POST", "/profiles", json={"name": "X", "plan": []}), "Field 'plan' must be an object.")
    check("profile plan with bad types is a 422", call("ann", "POST", "/profiles", json={"name": "X", "plan": {"weeks": "4"}}).status_code == 422)
    expect_422("profile without a name", call("ann", "POST", "/profiles", json={"plan": plan_body()}), "A plan name must be 1-60 characters.")
    expect_422("blank profile name", call("ann", "POST", "/profiles", json={"name": "   ", "plan": plan_body()}), "A plan name must be 1-60 characters.")
    expect_422("overlong profile name", call("ann", "POST", "/profiles", json={"name": "n" * 61, "plan": plan_body()}), "A plan name must be 1-60 characters.")
    expect_422("non-text profile name", call("ann", "POST", "/profiles", json={"name": 7, "plan": plan_body()}), "A plan name must be 1-60 characters.")
    expect_422("overlong summary", call("ann", "POST", "/profiles", json={"name": "X", "plan": plan_body(), "summary": "s" * 601}), "The plan summary must be at most 600 characters.")
    expect_422("non-text summary", call("ann", "POST", "/profiles", json={"name": "X", "plan": plan_body(), "summary": 3}), "The plan summary must be at most 600 characters.")
    expect_422("order of checks: plan type before name", call("ann", "POST", "/profiles", json={"name": "", "plan": 3}), "Field 'plan' must be an object.")
    expect_422("order of checks: name before plan validation", call("ann", "POST", "/profiles", json={"name": "", "plan": plan_body(4, labels={"9": "x"})}), "A plan name must be 1-60 characters.")
    expect_422("plan validation in a profile", call("ann", "POST", "/profiles", json={"name": "X", "plan": plan_body(4, labels={"9": "x"})}), "There is a label for week '9', but the plan has weeks 1-4.")
    expect_422("order of checks: plan validation before the duplicate-name 409", call("ann", "POST", "/profiles", json={"name": "My plan", "plan": plan_body(4, {"a": 8})}), "'a' is in week 8, but the plan has weeks 1-4.")

    ann_active = call("ann", "GET", "").json()["plan"]["profileId"]
    r = call("ann", "POST", "/profiles", json={"name": "  Plan 2  ", "plan": plan_body(8, {"tp-3sum": 3, "tp-container-most-water": 3}, order=["tp-container-most-water"], labels={"3": " Pointers "}), "summary": "  Arranged by pattern. "})
    check("create returns 201", r.status_code == 201, r.text[:200])
    p2 = r.json()["profile"]
    check("ProfileFull has exactly the contract's keys", list(p2) == ["id", "name", "weeks", "planned", "summary", "active", "createdAt", "updatedAt", "plan"], str(list(p2)))
    check("name and summary are trimmed", p2["name"] == "Plan 2" and p2["summary"] == "Arranged by pattern.")
    check("weeks / planned / plan are reported", p2["weeks"] == 8 and p2["planned"] == 2 and p2["plan"] == {"weeks": 8, "assignments": {"tp-3sum": 3, "tp-container-most-water": 3}, "order": ["tp-container-most-water"], "labels": {"3": "Pointers"}}, str(p2))
    check("a new profile is inactive unless asked", p2["active"] is False and call("ann", "GET", "").json()["plan"]["profileId"] == ann_active)
    check("summary defaults to ''", call("ann", "POST", "/profiles", json={"name": "No summary", "plan": plan_body()}).json()["profile"]["summary"] == "")
    check("only activate: true activates", call("ann", "POST", "/profiles", json={"name": "Truthy", "plan": plan_body(), "activate": "yes"}).json()["profile"]["active"] is False)
    check("a null activate means false", call("ann", "POST", "/profiles", json={"name": "Null activate", "plan": plan_body(), "activate": None}).json()["profile"]["active"] is False)
    r = call("ann", "POST", "/profiles", json={"name": "", "plan": {"weeks": "4"}})
    check("order of checks: the plan's types before name", r.status_code == 422 and isinstance(detail(r), list), r.text[:200])
    expect_422("order of checks: name before summary", call("ann", "POST", "/profiles", json={"name": "", "summary": 1, "plan": plan_body()}), "A plan name must be 1-60 characters.")

    r = call("ann", "POST", "/profiles", json={"name": " PLAN 2 ", "plan": plan_body()})
    check("duplicate name (trimmed, case-insensitive) is a 409", r.status_code == 409 and detail(r) == "You already have a plan named 'PLAN 2'.", r.text)
    r = call("ann", "POST", "/profiles", json={"name": "Plan 3", "plan": plan_body(5, {"tp-3sum": 1}), "activate": True})
    p3 = r.json()["profile"]
    check("activate: true makes it the only active one", r.status_code == 201 and p3["active"] is True and active_count("ann") == 1 and call("ann", "GET", "").json()["plan"]["profileId"] == p3["id"], r.text[:200])

    listing = call("ann", "GET", "/profiles").json()
    check("list is ordered by id and reports the active id", [p["id"] for p in listing["profiles"]] == sorted(p["id"] for p in listing["profiles"]) and listing["activeId"] == p3["id"], str(listing)[:300])
    check("ProfileSummary has exactly the contract's keys", all(list(p) == ["id", "name", "weeks", "planned", "summary", "active", "createdAt", "updatedAt"] for p in listing["profiles"]))
    check("active is a JSON boolean on every summary", all(isinstance(p["active"], bool) for p in listing["profiles"]) and sum(p["active"] for p in listing["profiles"]) == 1)
    check("list only shows your own plans", all(p["id"] != carl_first["id"] for p in listing["profiles"]))

    r = call("ann", "GET", f"/profiles/{p2['id']}")
    check("get returns the full profile", r.status_code == 200 and r.json()["profile"]["plan"]["labels"] == {"3": "Pointers"}, r.text[:200])
    check("non-integer id is a 422", call("ann", "GET", "/profiles/abc").status_code == 422)
    for method, path, body in (("GET", "", None), ("PATCH", "", {"name": "pwned"}), ("POST", "/activate", None), ("DELETE", "", None)):
        r = call("bob", method, f"/profiles/{p2['id']}{path}", json=body)
        check(f"someone else's plan is 404 ({method} {path or '/'})", r.status_code == 404 and detail(r) == "Plan not found.", r.text)
        r = call("ann", method, f"/profiles/999999{path}", json=body)
        check(f"unknown plan is 404 ({method} {path or '/'})", r.status_code == 404 and detail(r) == "Plan not found.", r.text)
    check("bob's attempts changed nothing", call("ann", "GET", f"/profiles/{p2['id']}").json()["profile"]["name"] == "Plan 2")
    for raw_id in ("+1", "1_0", "1.0", "%201", "1.5"):
        check(f"id {raw_id!r} is a 422 (plain digits only, like the twin's intParam)", call("ann", "GET", f"/profiles/{raw_id}").status_code == 422)
    for big in ("9223372036854775808", "99999999999999999999"):
        r = call("ann", "GET", f"/profiles/{big}")
        check(f"id {big} (past SQLite's integers) is a 404, not a 500", r.status_code == 404 and detail(r) == "Plan not found.", r.text[:200])
    check("PATCH without a body is a 422", call("ann", "PATCH", f"/profiles/{p2['id']}").status_code == 422)

    # PATCH
    raw_db("UPDATE dsa_week_plan_profiles SET updated_at = '2000-01-01 00:00:00' WHERE id = ?", p2["id"])
    r = call("ann", "PATCH", f"/profiles/{p2['id']}", json={"name": "  Pattern plan ", "color": "ignored"})
    patched = r.json()["profile"]
    check("patch renames (trimmed) and ignores unknown keys", r.status_code == 200 and patched["name"] == "Pattern plan", r.text[:200])
    check("patch leaves the rest alone", patched["summary"] == "Arranged by pattern." and patched["plan"] == p2["plan"])
    check("patch bumps updated_at", patched["updatedAt"] != "2000-01-01 00:00:00")
    check("renaming to your own name in another case is fine", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"name": "PATTERN PLAN"}).status_code == 200)
    r = call("ann", "PATCH", f"/profiles/{p2['id']}", json={"name": "plan 3"})
    check("renaming onto another plan's name is a 409", r.status_code == 409 and detail(r) == "You already have a plan named 'plan 3'.", r.text)
    expect_422("patch with a non-object plan", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"plan": "x"}), "Field 'plan' must be an object.")
    expect_422("patch with a blank name", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"name": " "}), "A plan name must be 1-60 characters.")
    expect_422("patch with a null plan (sent = checked)", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"plan": None}), "Field 'plan' must be an object.")
    expect_422("patch with a null name", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"name": None}), "A plan name must be 1-60 characters.")
    expect_422("patch with a null summary", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"summary": None}), "The plan summary must be at most 600 characters.")
    check("patch: bad plan types are a 422", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"plan": {"weeks": "x"}}).status_code == 422)
    expect_422("patch with an overlong summary", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"summary": "s" * 601}), "The plan summary must be at most 600 characters.")
    expect_422("patch with an invalid plan", call("ann", "PATCH", f"/profiles/{p2['id']}", json={"plan": plan_body(2, {f"q{i}": 1 for i in range(8)})}), "Week 1 has 8 questions; a week holds at most 7.")
    r = call("ann", "PATCH", f"/profiles/{p2['id']}", json={"summary": " New summary ", "plan": plan_body(3, {"a": 1, "b": 2}, order=["b", "a"], labels={"2": "B"})})
    check("patch replaces summary and plan", r.json()["profile"]["summary"] == "New summary" and r.json()["profile"]["plan"] == {"weeks": 3, "assignments": {"a": 1, "b": 2}, "order": ["b", "a"], "labels": {"2": "B"}} and r.json()["profile"]["planned"] == 2, r.text[:300])
    check("patching an inactive plan doesn't touch the active one", call("ann", "GET", "").json()["plan"]["profileId"] == p3["id"])
    check("an empty patch is fine", call("ann", "PATCH", f"/profiles/{p2['id']}", json={}).status_code == 200)

    # activate
    r = call("ann", "POST", f"/profiles/{p2['id']}/activate")
    act = r.json()["plan"]
    check("activate returns the ActivePlan", r.status_code == 200 and act["profileId"] == p2["id"] and act["name"] == "PATTERN PLAN" and act["assignments"] == {"a": 1, "b": 2} and act["order"] == ["b", "a"], r.text[:200])
    check("activate deactivates the others", active_count("ann") == 1 and call("ann", "GET", "/profiles").json()["activeId"] == p2["id"])
    check("PUT now edits the newly active plan", call("ann", "PUT", "", json=plan_body(3, {"c": 3})).json()["plan"]["profileId"] == p2["id"])

    # delete
    r = call("ann", "DELETE", f"/profiles/{p3['id']}")
    check("deleting an inactive plan keeps the active one", r.status_code == 200 and r.json() == {"deleted": p3["id"], "activeId": p2["id"]}, r.text)
    r = call("ann", "DELETE", f"/profiles/{p2['id']}")
    check("deleting the active plan leaves none active", r.json() == {"deleted": p2["id"], "activeId": None}, r.text)
    check("... so GET shows the suggested plan", call("ann", "GET", "").json() == {"plan": None})
    check("deleting twice is a 404", call("ann", "DELETE", f"/profiles/{p2['id']}").status_code == 404)

    # DELETE /week-plan deactivates without deleting
    call("ann", "POST", f"/profiles/{ann_active}/activate")
    before = len(call("ann", "GET", "/profiles").json()["profiles"])
    r = call("ann", "DELETE", "")
    after = call("ann", "GET", "/profiles").json()
    check("DELETE /week-plan returns null and deletes nothing", r.json() == {"plan": None} and len(after["profiles"]) == before and after["activeId"] is None, str(after)[:200])

    # the 20-plan cap
    have = len(after["profiles"])
    for i in range(20 - have):
        call("ann", "POST", "/profiles", json={"name": f"Filler {i}", "plan": plan_body()})
    check("ann now has 20 plans", len(call("ann", "GET", "/profiles").json()["profiles"]) == 20)
    r = call("ann", "POST", "/profiles", json={"name": "One too many", "plan": plan_body()})
    check("a 21st plan is a 409", r.status_code == 409 and detail(r) == "You can keep at most 20 plans. Delete one first.", r.text)
    r = call("ann", "POST", "/profiles", json={"name": "filler 0", "plan": plan_body()})
    check("at the cap a duplicate name still reports the duplicate first", r.status_code == 409 and detail(r) == "You already have a plan named 'filler 0'.", r.text)
    r = call("ann", "PUT", "", json=plan_body())
    check("PUT that would create a 21st plan is a 409", r.status_code == 409 and detail(r) == "You can keep at most 20 plans. Delete one first.", r.text)
    check("other users are not capped by ann's plans", call("dave", "POST", "/profiles", json={"name": "Plan 1", "plan": plan_body()}).status_code == 201)
    check("names are per user", call("dave", "POST", "/profiles", json={"name": "Filler 0", "plan": plan_body()}).status_code == 201)

    # ── Auto organizer ────────────────────────────────────────────────────────
    topics = [
        {"id": "tp-3sum", "name": "3Sum", "category": "Two Pointers", "difficulty": "Medium"},
        {"id": "tp-valid-palindrome-ii", "name": "Valid Palindrome II", "category": "Two Pointers", "difficulty": "Easy", "done": True},
        {"id": "sw-longest-no-repeat", "name": "Longest Substring Without Repeating Characters", "category": "Sliding Window", "difficulty": "Medium"},
        {"id": "sw-min-window-substring", "name": "Minimum Window Substring", "category": "Sliding Window", "difficulty": "Hard", "done": False},
        {"id": "ps-subarray-sum-k", "name": "Subarray Sum Equals K", "category": "Prefix Sum & Cumulative Logic", "difficulty": "Medium"},
    ]
    answers = {"weeks": 3, "perWeek": 2, "level": "new", "goal": "big-tech", "difficulty": "gentle", "style": "mixed", "focus": ["  Sliding Window "], "weak": ["Two Pointers"], "notes": "  Evenings only.  "}

    def auto(who: str, body: dict, reply="{}"):
        ai_reply[0] = reply
        calls.clear()
        return call(who, "POST", "/auto", json=body)

    good_reply = json.dumps(
        {
            "summary": "  Pointers first,\n then   windows.  ",
            "weeks": [
                {"week": 2, "focus": "  Sliding\twindow  basics ", "questions": ["sw-longest-no-repeat", "unknown-id", "tp-3sum"]},
                {"week": 1, "focus": "Two pointers", "questions": ["tp-3sum", "tp-valid-palindrome-ii", "tp-3sum", 7]},
                {"week": 9, "focus": "Out of range", "questions": ["ps-subarray-sum-k", "x"]},
                {"week": 1, "focus": "Ignored second focus", "questions": ["ps-subarray-sum-k"]},
                {"week": 3, "focus": "Empty week", "questions": []},
                {"week": True, "questions": ["sw-min-window-substring"]},
                "not an object",
            ],
        }
    )
    bob_profiles_before = call("bob", "GET", "/profiles").json()
    r = auto("bob", {"answers": answers, "topics": topics}, f"Here you go:\n```json\n{good_reply}\n```")
    out = r.json()
    check("auto returns 200 with plan, summary and stats", r.status_code == 200 and set(out) == {"plan", "summary", "stats"}, r.text[:300])
    check(
        "normalised: sorted by week, unknown ids / repeats / cap / bad weeks dropped",
        out["plan"] == {"weeks": 3, "assignments": {"tp-3sum": 1, "tp-valid-palindrome-ii": 1, "sw-longest-no-repeat": 2}, "order": ["tp-3sum", "tp-valid-palindrome-ii", "sw-longest-no-repeat"], "labels": {"1": "Two pointers", "2": "Sliding window basics"}},
        str(out["plan"]),
    )
    # dropped: week 9 (2) + week True (1) + in week 1: repeat tp-3sum, 7, ps-subarray-sum-k (cap 2) + in week 2: unknown-id, tp-3sum (repeat)
    check("stats count placed, dropped and slots", out["stats"] == {"placed": 3, "dropped": 8, "slots": 6}, str(out["stats"]))
    check("summary is whitespace-collapsed", out["summary"] == "Pointers first, then windows.", repr(out["summary"]))
    check("the auto plan is not saved", call("bob", "GET", "/profiles").json() == bob_profiles_before and len(calls) == 1)
    prompt = calls[0]["prompt"]
    check("prompt starts with the coach role", prompt.startswith("You are an expert coding-interview coach. Plan a week-by-week DSA study schedule for this learner.\n\nLearner profile:\n"))
    for needle in (
        "- Timeline: 3 weeks",
        "- Questions per week: at most 2 (a week may hold fewer, never more)",
        "- Current level: new to DSA, needs the fundamentals first",
        "- Goal: big-tech (FAANG-style) interviews",
        "- Difficulty preference: gentle: mostly Easy and Medium",
        "- Week style: mixed: blend patterns within each week for interleaved practice",
        "- Patterns to emphasise: Sliding Window\n",
        "- Patterns the learner finds hard: Two Pointers\n",
        "- Notes from the learner: Evenings only.\n",
        "- tp-3sum | 3Sum | Two Pointers | Medium\n",
        "- tp-valid-palindrome-ii | Valid Palindrome II | Two Pointers | Easy | already solved\n",
        "- sw-min-window-substring | Minimum Window Substring | Sliding Window | Hard\n",
        "2. Use weeks 1 to 3 only, with at most 2 questions in any week.",
    ):
        check(f"prompt contains {needle.strip()!r}", needle in prompt)
    check("topic lines keep the learning order", prompt.index("- tp-3sum |") < prompt.index("- sw-longest-no-repeat |") < prompt.index("- ps-subarray-sum-k |"))
    check("prompt ends with the JSON shape", prompt.endswith('{"summary": "2-3 sentences on how the plan is organised", "weeks": [{"week": 1, "focus": "Hashing basics", "questions": ["<id>", "<id>"]}]}'))
    check("max_tokens = min(6000, 800 + weeks * perWeek * 40)", calls[0]["max_tokens"] == 800 + 3 * 2 * 40, str(calls[0]["max_tokens"]))

    r = auto("bob", {"answers": {"weeks": 3, "perWeek": 2}, "topics": topics, "openaiKey": "sk-test"}, good_reply)
    p = calls[0]["prompt"]
    check("defaults: level some, goal general, difficulty balanced, style focused", "knows the basics and is comfortable with arrays and hashing" in p and "general problem-solving practice" in p and "balanced: mostly Medium with some Hard" in p and "focused: one or two related patterns per week" in p)
    check("defaults: no focus / weak / notes", "- Patterns to emphasise: none in particular\n" in p and "- Patterns the learner finds hard: none given\n" in p and "- Notes from the learner: none\n" in p)
    check("the AI settings ride along with the call", calls[0]["settings"].openaiKey == "sk-test")
    r = auto("bob", {"answers": {"weeks": 3, "perWeek": 2, "level": None, "focus": None, "notes": None}, "topics": topics}, good_reply)
    check("null answers mean the defaults", r.status_code == 200 and "knows the basics" in calls[0]["prompt"])
    auto("bob", {"answers": {"weeks": 24, "perWeek": 7}, "topics": topics}, good_reply)
    check("max_tokens is capped at 6000", calls[0]["max_tokens"] == 6000, str(calls[0]["max_tokens"]))

    # validation messages
    def auto_422(name: str, body: dict, message: str) -> None:
        r = auto("bob", body)
        check(name, r.status_code == 422 and detail(r) == message and not calls, f"{r.status_code} {r.text[:200]}")

    good = {"answers": answers, "topics": topics}
    auto_422("answers missing", {"topics": topics}, "Field 'answers' must be an object.")
    auto_422("answers a list", {"answers": [], "topics": topics}, "Field 'answers' must be an object.")
    for bad in (None, 0, 25, "3", True, 2.5):
        auto_422(f"answers.weeks {bad!r}", {"answers": {**answers, "weeks": bad}, "topics": topics}, "Field 'answers.weeks' must be an integer from 1 to 24.")
    for bad in (None, 0, 8, "7", False):
        auto_422(f"answers.perWeek {bad!r}", {"answers": {**answers, "perWeek": bad}, "topics": topics}, "Field 'answers.perWeek' must be an integer from 1 to 7.")
    auto_422("answers.level", {"answers": {**answers, "level": "expert"}, "topics": topics}, "Field 'answers.level' must be one of: new, some, confident.")
    auto_422("answers.level not trimmed", {"answers": {**answers, "level": " new"}, "topics": topics}, "Field 'answers.level' must be one of: new, some, confident.")
    auto_422("answers.goal", {"answers": {**answers, "goal": 3}, "topics": topics}, "Field 'answers.goal' must be one of: big-tech, product, startup, general.")
    auto_422("answers.difficulty", {"answers": {**answers, "difficulty": "hard"}, "topics": topics}, "Field 'answers.difficulty' must be one of: gentle, balanced, stretch.")
    auto_422("answers.style", {"answers": {**answers, "style": "random"}, "topics": topics}, "Field 'answers.style' must be one of: focused, mixed.")
    for bad in ("Graphs", [""], ["   "], ["x" * 81], [3], [f"p{i}" for i in range(21)]):
        auto_422(f"answers.focus {str(bad)[:20]}", {"answers": {**answers, "focus": bad}, "topics": topics}, "Field 'answers.focus' must be a list of at most 20 pattern names (1-80 characters each).")
    auto_422("answers.weak", {"answers": {**answers, "weak": {"a": 1}}, "topics": topics}, "Field 'answers.weak' must be a list of at most 20 pattern names (1-80 characters each).")
    check("20 patterns of 80 characters (after trimming) are fine", auto("bob", {"answers": {**answers, "focus": [f" {i:02d}" + "x" * 78 + " " for i in range(20)]}, "topics": topics}, good_reply).status_code == 200)
    auto_422("answers.notes too long", {"answers": {**answers, "notes": "n" * 401}, "topics": topics}, "Field 'answers.notes' must be at most 400 characters.")
    auto_422("answers.notes not text", {"answers": {**answers, "notes": 5}, "topics": topics}, "Field 'answers.notes' must be at most 400 characters.")
    check("notes length counts after trimming", auto("bob", {"answers": {**answers, "notes": "  " + "n" * 400 + "  "}, "topics": topics}, good_reply).status_code == 200)
    auto_422("topics missing", {"answers": answers}, "Field 'topics' must be a list of 1-400 questions.")
    auto_422("topics empty", {"answers": answers, "topics": []}, "Field 'topics' must be a list of 1-400 questions.")
    auto_422("topics too many", {"answers": answers, "topics": [{"id": f"t{i}", "name": "n", "category": "", "difficulty": ""} for i in range(401)]}, "Field 'topics' must be a list of 1-400 questions.")
    topic_msg = "Every topic needs an id and a name (1-200 characters), a category (at most 120) and a difficulty (at most 40)."
    base = {"id": "t1", "name": "N", "category": "C", "difficulty": "Easy"}
    for label, topic in (
        ("not an object", "t1"),
        ("blank id", {**base, "id": "  "}),
        ("long id", {**base, "id": "i" * 201}),
        ("numeric id", {**base, "id": 5}),
        ("missing name", {k: v for k, v in base.items() if k != "name"}),
        ("long name", {**base, "name": "n" * 201}),
        ("missing category", {k: v for k, v in base.items() if k != "category"}),
        ("long category", {**base, "category": "c" * 121}),
        ("long difficulty", {**base, "difficulty": "d" * 41}),
        ("difficulty not text", {**base, "difficulty": 3}),
        ("done not a boolean", {**base, "done": "yes"}),
    ):
        auto_422(f"topic {label}", {"answers": answers, "topics": [topic]}, topic_msg)
    def auto_raw_422(name: str, body: dict, message: str) -> None:
        # json.dumps escapes a lone surrogate as \\ud800, which the test client's own encoder refuses to emit.
        calls.clear()
        r = raw_call("bob", "POST", "/auto", json.dumps(body))
        check(name, r.status_code == 422 and detail(r) == message and not calls, f"{r.status_code} {r.text[:200]}")

    for label, topic in (("id", {**base, "id": "t\ud800"}), ("name", {**base, "name": "\udc00"}), ("category", {**base, "category": "c\ud800"}), ("difficulty", {**base, "difficulty": "\ud800"})):
        auto_raw_422(f"topic {label} with a lone surrogate", {"answers": answers, "topics": [topic]}, topic_msg)
    auto_raw_422("focus item with a lone surrogate", {"answers": {**answers, "focus": ["\ud800"]}, "topics": topics}, "Field 'answers.focus' must be a list of at most 20 pattern names (1-80 characters each).")
    auto_raw_422("notes with a lone surrogate", {"answers": {**answers, "notes": "\ud800"}, "topics": topics}, "Field 'answers.notes' must be at most 400 characters.")
    auto_422("topics are checked in one pass (a repeat before a later bad topic)", {"answers": answers, "topics": [base, base, {"id": "t2"}]}, "Topic 't1' is listed twice.")
    auto_422("duplicate topic id (after trimming)", {"answers": answers, "topics": [base, {**base, "id": " t1 "}]}, "Topic 't1' is listed twice.")
    check("an empty category / difficulty and a null done are fine", auto("bob", {"answers": answers, "topics": [{**base, "category": "", "difficulty": "", "done": None}]}, json.dumps({"weeks": [{"week": 1, "questions": ["t1"]}]})).status_code == 200)
    for field, value in (("customKey", 5), ("customBaseUrl", None), ("model", 5)):
        r = auto("bob", {**good, field: value})
        check(f"AI setting {field}={value!r} is a 422 before any AI call (the twin checks the same)", r.status_code == 422 and not calls, r.text[:200])
    check("model null means the .env default", auto("bob", {**good, "model": None}, json.dumps({"weeks": [{"week": 1, "questions": ["tp-3sum"]}]})).status_code == 200)

    # failure paths
    ai_reply[0] = RuntimeError("OpenAI failed: quota exceeded")
    calls.clear()
    r = call("bob", "POST", "/auto", json=good)
    check("provider failure is a 400 with the last error", r.status_code == 400 and detail(r) == "No API key configured or all providers failed. Add a key in Config. Last error: OpenAI failed: quota exceeded", r.text)
    r = auto("bob", good, "   \n ")
    check("empty reply is a 502", r.status_code == 502 and detail(r) == "The AI returned an empty response. Try again.", r.text)
    r = auto("bob", good, "I cannot help with that.")
    check("garbage reply is a 502 parse error", r.status_code == 502 and detail(r) == "The AI response couldn't be parsed. Try again. (No JSON object found in response)", r.text)
    r = auto("bob", good, "{not json}")
    check("broken JSON is a 502 parse error", r.status_code == 502 and detail(r).startswith("The AI response couldn't be parsed. Try again. ("), r.text)
    for label, reply in (
        ("no weeks", '{"summary": "x"}'),
        ("weeks not a list", '{"weeks": {"1": ["tp-3sum"]}}'),
        ("only out-of-range weeks", '{"weeks": [{"week": 4, "questions": ["tp-3sum"]}, {"week": 0, "questions": ["tp-3sum"]}]}'),
        ("only unknown ids", '{"weeks": [{"week": 1, "questions": ["nope", "also-nope"]}]}'),
    ):
        r = auto("bob", good, reply)
        check(f"nothing usable ({label}) is a 502", r.status_code == 502 and detail(r) == "The AI didn't return a usable plan. Try again.", r.text)

    # the auto route runs the legacy migration too
    raw_db("INSERT INTO dsa_week_plans (user_id, plan_json) VALUES (?, ?)", ids["dave"], json.dumps(legacy))
    raw_db("DELETE FROM dsa_week_plan_profiles WHERE user_id = ?", ids["dave"])
    auto("dave", good, good_reply)
    dave = raw_db("SELECT name, is_active FROM dsa_week_plan_profiles WHERE user_id = ?", ids["dave"])
    check("the auto route migrates a legacy plan first", dave == [("My plan", 1)] and raw_db("SELECT COUNT(*) FROM dsa_week_plans WHERE user_id = ?", ids["dave"])[0][0] == 0, str(dave))

    # ── Pure functions ───────────────────────────────────────────────────────
    known = ["a", "b", "c", "d", "e", "f", "g", "h", "i"]
    plan, summary, stats = normalize_auto_plan({"weeks": [{"week": 1, "questions": known}]}, known, 2, 9)
    check("the cap never exceeds 7, whatever perWeek says", stats == {"placed": 7, "dropped": 2, "slots": 14} and list(plan["assignments"]) == known[:7], str(stats))
    plan, summary, stats = normalize_auto_plan([1, 2], known, 2, 3)
    check("a non-object reply normalises to nothing", plan == {"weeks": 2, "assignments": {}, "order": [], "labels": {}} and summary == "" and stats == {"placed": 0, "dropped": 0, "slots": 6})
    plan, _, stats = normalize_auto_plan({"weeks": [{"week": 1.0, "questions": ["a"]}, {"week": 2, "questions": "a"}, {"week": 2, "focus": "Kept?", "questions": None}]}, known, 2, 3)
    check("float weeks are dropped, non-list questions are skipped", plan["assignments"] == {} and stats["dropped"] == 1 and plan["labels"] == {}, str((plan, stats)))
    plan, summary, _ = normalize_auto_plan({"summary": "w " * 400, "weeks": [{"week": 1, "focus": "f" * 70, "questions": ["a"]}, {"week": 1, "focus": "Second", "questions": ["b"]}]}, known, 1, 7)
    check("labels are cut to 60, the first focus of a week wins", plan["labels"] == {"1": "f" * 60} and plan["order"] == ["a", "b"])
    check("summary is cut to 600 and trimmed", len(summary) <= 600 and not summary.endswith(" ") and summary.startswith("w w"))
    plan, _, _ = normalize_auto_plan({"weeks": [{"week": 2, "focus": "   ", "questions": ["a"]}, {"week": 2, "focus": "Real", "questions": []}]}, known, 2, 7)
    check("a blank focus doesn't claim the week's label", plan["labels"] == {"2": "Real"})
    check(
        "_js_key_order matches JavaScript's own key order",
        _js_key_order(dict.fromkeys(["b", "10", "2", "01", "0", "4294967295", "4294967294", "-1", "a"]))
        == ["0", "2", "10", "4294967294", "b", "01", "4294967295", "-1", "a"],
    )
    check("auto_plan_max_tokens", auto_plan_max_tokens(1, 1) == 840 and auto_plan_max_tokens(12, 7) == 4160 and auto_plan_max_tokens(20, 7) == 6000)
    problem, req = validate_auto_request({"weeks": 2, "perWeek": 3}, [{"id": " a ", "name": " A ", "category": " C ", "difficulty": " Easy "}])
    check("validate_auto_request trims and fills defaults", problem is None and req["answers"] == {"weeks": 2, "perWeek": 3, "level": "some", "goal": "general", "difficulty": "balanced", "style": "focused", "focus": [], "weak": [], "notes": ""} and req["topics"] == [{"id": "a", "name": "A", "category": "C", "difficulty": "Easy", "done": False}], str(req))
    check("build_auto_plan_prompt joins lines with \\n, no trailing newline", not build_auto_plan_prompt(req["answers"], req["topics"]).endswith("\n") and "\r" not in build_auto_plan_prompt(req["answers"], req["topics"]))

    check("at most one active profile per user, everywhere", raw_db("SELECT COUNT(*) FROM (SELECT user_id FROM dsa_week_plan_profiles WHERE is_active = 1 GROUP BY user_id HAVING COUNT(*) > 1)")[0][0] == 0)
    bob_active = call("bob", "GET", "").json()["plan"]

# A new client = a fresh app lifespan: what was saved before is still there.
with TestClient(app) as client2:
    r = client2.get("/dsa/week-plan", headers={"Authorization": f"Bearer {tokens['bob']}"})
    check("data survives an app restart", r.status_code == 200 and r.json()["plan"] == bob_active, r.text[:200])

print()
print("FAILED:" if failures else "All checks passed.", *failures, sep="\n" if failures else " ")
sys.exit(1 if failures else 0)
