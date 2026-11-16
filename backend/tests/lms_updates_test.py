"""Class membership + class updates check for the AI LMS API (standalone, like the other backend/tests scripts).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/lms_updates_test.py
Exits non-zero if any check fails.

The logic itself lives in modules/ai_lms/updates.py (no FastAPI import) and is also exercised without a server by
running that module against a database copy; this script covers the HTTP layer: the role gate and its allowlist,
the status codes and texts, and the cascade when a class is deleted. Its Next.js twin is frontend/fe-apis/lms/updates.ts.
"""
from __future__ import annotations

import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

scratch = tempfile.mkdtemp(prefix="lms-updates-")
DB = Path(scratch) / "lab.sqlite3"
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", DB)
os.environ["LABNINJA_TEST_DB_PATH"] = str(DB)
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
os.environ["LABNINJA_SUPERADMIN_EMAILS"] = "superadmin@updates.test"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from modules.auth.db import promote_superadmins_from_env  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(("PASS" if ok else "FAIL"), name, extra)
    if not ok:
        failures.append(name)


def count(sql: str, *params) -> int:
    conn = sqlite3.connect(DB)
    try:
        return conn.execute(sql, params).fetchone()[0]
    finally:
        conn.close()


with TestClient(app) as client:
    tokens: dict[str, str] = {}
    ids: dict[str, int] = {}
    for role in ("learner", "learner2", "editor", "superadmin"):
        r = client.post("/auth/signup", json={"email": f"{role}@updates.test", "password": "Passw0rd!x"})
        tokens[role], ids[role] = r.json()["access_token"], r.json()["user"]["id"]
    promote_superadmins_from_env()
    # A FastAPI signup starts as `pending` until approved; the superadmin approves the learners and makes the editor.
    for role in ("learner", "learner2", "editor"):
        client.post(f"/admin/users/{ids[role]}/approve", headers={"Authorization": f"Bearer {tokens['superadmin']}"})
    client.patch(f"/admin/users/{ids['editor']}/role", headers={"Authorization": f"Bearer {tokens['superadmin']}"}, json={"role": "editor"})

    def call(method: str, path: str, who: str | None, **kw):
        headers = {"Authorization": f"Bearer {tokens[who]}"} if who else {}
        return client.request(method, path, headers=headers, **kw)

    base = "/api/lms/classes/ai"

    # ── Membership: a learner's own state, no editor needed ───────────────────
    check("guest cannot read membership", call("GET", f"{base}/membership", None).status_code in (401, 403))
    m = call("GET", f"{base}/membership", "learner").json()
    check("no membership at first", m["status"] is None and m["member_count"] == 0, str(m))
    r = call("PUT", f"{base}/membership", "learner", json={"status": "interested"})
    check("a plain user can show interest (PUT is allowlisted)", r.status_code == 200 and r.json()["status"] == "interested", r.text)
    r = call("PUT", f"{base}/membership", "learner", json={"status": "enrolled"})
    check("interest upgrades to enrolled", r.json()["status"] == "enrolled" and r.json()["enrolled_count"] == 1)
    r = call("PUT", f"{base}/membership", "learner", json={"status": "interested"})
    check("interest never downgrades enrolled", r.json()["status"] == "enrolled")
    r = call("PUT", f"{base}/membership", "learner", json={"status": "vip"})
    check("bad status is 422 with the plain text", r.status_code == 422 and r.json()["detail"] == "Membership status must be 'enrolled' or 'interested'.", r.text)
    check("unknown class is 404", call("GET", "/api/lms/classes/no-such-class/membership", "learner").status_code == 404)
    check("learner2 interested", call("PUT", "/api/lms/classes/leadership/membership", "learner2", json={"status": "interested"}).status_code == 200)

    # ── Sending: editor and up only ──────────────────────────────────────────
    r = call("POST", f"{base}/notifications", "learner", json={"title": "hax"})
    check("a plain user cannot send an update (not allowlisted)", r.status_code == 403, r.text)
    check("guest cannot send", call("POST", f"{base}/notifications", None, json={"title": "x"}).status_code in (401, 403))
    r = call("POST", f"{base}/notifications", "editor", json={"title": "  Week 1 is live ", "body": "Open the first lesson."})
    check("an editor sends a class update", r.status_code == 201 and r.json()["recipients"] == 1 and r.json()["scope"] == "class", r.text)
    check("the python backend never pushes", r.json()["push"] == {"web": 0, "android": 0})
    r = call("POST", f"{base}/notifications", "editor", json={"title": "Platform news", "scope": "ai-lms"})
    check("a module-wide update reaches everyone in any class", r.status_code == 201 and r.json()["recipients"] == 2, r.text)
    check("a superadmin can send", call("POST", f"{base}/notifications", "superadmin", json={"title": "From admin"}).status_code == 201)

    bad = {
        "no title": ({"title": " "}, "Add a title for the update."),
        "title too long": ({"title": "x" * 121}, "The title can be at most 120 characters."),
        "body too long": ({"title": "ok", "body": "x" * 1001}, "The message can be at most 1000 characters."),
        "bad scope": ({"title": "ok", "scope": "everyone"}, "Choose who gets this update: this class or all of AI LMS."),
        "absolute link": ({"title": "ok", "link": "https://evil.test"}, "The link must be a page inside LabNinja, like /ai-lms/classes/ai."),
        "protocol-relative link": ({"title": "ok", "link": "//evil.test"}, "The link must be a page inside LabNinja, like /ai-lms/classes/ai."),
        "backslash link": ({"title": "ok", "link": "/a\\b"}, "The link must be a page inside LabNinja, like /ai-lms/classes/ai."),
    }
    for name, (payload, detail) in bad.items():
        r = call("POST", f"{base}/notifications", "editor", json=payload)
        check(f"rejects {name}", r.status_code == 422 and r.json()["detail"] == detail, r.text)
    check("unknown class is 404", call("POST", "/api/lms/classes/no-such-class/notifications", "editor", json={"title": "x"}).status_code == 404)

    # ── The sent list is editor-only; the inbox is the caller's own ──────────
    r = call("GET", f"{base}/notifications", "editor")
    check("editor sees what was sent", r.status_code == 200 and len(r.json()) >= 3 and "recipient_count" in r.json()[0], r.text[:200])
    check("a plain user cannot see the sent list", call("GET", f"{base}/notifications", "learner").status_code == 403)

    first = call("GET", "/api/lms/notifications", "learner").json()
    titles = [i["title"] for i in first["items"]]
    check("first sync returns the recent updates, oldest first", titles[:2] == ["Week 1 is live", "Platform news"], str(titles))
    check("first sync cursor is the newest recipient id", first["cursor"] == first["items"][-1]["cursor"] and first["cursor"] > 0)
    again = call("GET", f"/api/lms/notifications?after={first['cursor']}", "learner").json()
    check("nothing after the cursor", again["items"] == [] and again["cursor"] == first["cursor"])
    check("after=0&limit=1 pages", len(call("GET", "/api/lms/notifications?after=0&limit=1", "learner").json()["items"]) == 1)
    r = call("GET", "/api/lms/notifications?after=abc", "learner")
    check("a bad cursor is 422", r.status_code == 422 and r.json()["detail"] == "after must be a whole number.", r.text)
    check("a user with no updates has an empty inbox", call("GET", "/api/lms/notifications", "editor").json() == {"items": [], "cursor": 0})

    # ── Leaving ──────────────────────────────────────────────────────────────
    r = call("DELETE", f"{base}/membership", "learner")
    check("leaving is allowed for a plain user", r.status_code == 200 and r.json()["status"] is None, r.text)

    # ── Rate limit: 30 an hour per sender ────────────────────────────────────
    sent_by_editor = count("SELECT COUNT(*) FROM lms_notifications WHERE sender_id = ?", ids["editor"])
    for i in range(30 - sent_by_editor):
        call("POST", f"{base}/notifications", "editor", json={"title": f"filler {i}"})
    r = call("POST", f"{base}/notifications", "editor", json={"title": "one too many"})
    check("the 31st update in an hour is 429", r.status_code == 429 and r.json()["detail"] == "You have sent 30 updates in the last hour. Try again later.", r.text)

    # ── Deleting a class removes its members and its own updates, keeps module-wide ones ──
    cls = call("POST", "/api/lms/classes", "superadmin", json={"name": "Updates Throwaway"}).json()
    slug, cid = cls["slug"], cls["id"]
    call("PUT", f"/api/lms/classes/{slug}/membership", "learner", json={"status": "enrolled"})
    own = call("POST", f"/api/lms/classes/{slug}/notifications", "superadmin", json={"title": "Only for the throwaway"}).json()["id"]
    wide = call("POST", f"/api/lms/classes/{slug}/notifications", "superadmin", json={"title": "Wide", "scope": "ai-lms"}).json()["id"]
    check("setup for the cascade", count("SELECT COUNT(*) FROM lms_class_members WHERE class_id = ?", cid) == 1)
    check("delete the class", call("DELETE", f"/api/lms/classes/{slug}", "superadmin").status_code == 200)
    check("members removed", count("SELECT COUNT(*) FROM lms_class_members WHERE class_id = ?", cid) == 0)
    check("its own update and recipients removed", count("SELECT COUNT(*) FROM lms_notifications WHERE id = ?", own) == 0
          and count("SELECT COUNT(*) FROM lms_notification_recipients WHERE notification_id = ?", own) == 0)
    check("a module-wide update stays, without the class", count("SELECT COUNT(*) FROM lms_notifications WHERE id = ? AND class_id IS NULL", wide) == 1)

print()
print("FAILURES:" if failures else "ALL PASSED", failures if failures else "")
sys.exit(1 if failures else 0)
