"""Role-gate check for the AI LMS API (standalone, like the other backend/tests scripts).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/lms_roles_test.py
Exits non-zero if any check fails.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

scratch = tempfile.mkdtemp(prefix="lms-roles-")
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", Path(scratch) / "lab.sqlite3")
os.environ["LABNINJA_TEST_DB_PATH"] = str(Path(scratch) / "lab.sqlite3")
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
os.environ["LABNINJA_SUPERADMIN_EMAILS"] = "superadmin@roles.test"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from modules.auth.db import promote_superadmins_from_env  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(("PASS" if ok else "FAIL"), name, extra)
    if not ok:
        failures.append(name)


with TestClient(app) as client:
    tokens: dict[str, str] = {}
    ids: dict[str, int] = {}
    for role in ("user", "editor", "admin", "superadmin"):
        r = client.post("/auth/signup", json={"email": f"{role}@roles.test", "password": "Passw0rd!x"})
        tokens[role], ids[role] = r.json()["access_token"], r.json()["user"]["id"]
    promote_superadmins_from_env()

    def call(method: str, path: str, role: str | None, **kw):
        headers = {"Authorization": f"Bearer {tokens[role]}"} if role else {}
        return client.request(method, path, headers=headers, **kw)

    check("superadmin bootstrapped from env", call("GET", "/auth/me", "superadmin").json()["role"] == "superadmin")
    check("superadmin makes an editor", call("PATCH", f"/admin/users/{ids['editor']}/role", "superadmin", json={"role": "editor"}).status_code == 200)
    check("superadmin makes an admin", call("PATCH", f"/admin/users/{ids['admin']}/role", "superadmin", json={"role": "admin"}).status_code == 200)
    check("admin cannot grant admin", call("PATCH", f"/admin/users/{ids['user']}/role", "admin", json={"role": "admin"}).status_code == 403)
    check("admin cannot touch a superadmin", call("PATCH", f"/admin/users/{ids['superadmin']}/role", "admin", json={"role": "user"}).status_code == 403)
    check("admin can grant editor", call("PATCH", f"/admin/users/{ids['user']}/role", "admin", json={"role": "editor"}).status_code == 200)
    check("admin can demote that editor", call("PATCH", f"/admin/users/{ids['user']}/role", "admin", json={"role": "user"}).status_code == 200)
    check("editor cannot use admin API", call("GET", "/admin/users", "editor").status_code == 403)

    cls = call("POST", "/api/lms/classes", "editor", json={"name": "Roles Class"}).json()
    slug = cls["slug"]
    sub = call("POST", f"/api/lms/classes/{slug}/subjects", "editor", json={"name": "Roles Subject"}).json()
    lesson_html = "<!DOCTYPE html><html><body><h1>x</h1><p>" + "body " * 30 + "</p></body></html>"
    lesson = call("POST", "/api/lms/lessons", "editor", json={"class_id": cls["id"], "subject_id": sub["id"], "title": "L", "generated_html": lesson_html}).json()
    check("short manual HTML is kept verbatim", "<h1>x</h1>" in call("GET", f"/api/lms/lessons/{lesson['id']}", "editor").json()["generated_html"])

    writes = {
        "create class": ("POST", "/api/lms/classes", {"name": "Hax"}),
        "patch class": ("PATCH", f"/api/lms/classes/{slug}", {"description": "hax"}),
        "create subject": ("POST", f"/api/lms/classes/{slug}/subjects", {"name": "Hax"}),
        "patch lesson": ("PATCH", f"/api/lms/lessons/{lesson['id']}", {"title": "hax"}),
        "delete lesson": ("DELETE", f"/api/lms/lessons/{lesson['id']}", None),
        "put landing": ("PUT", f"/api/lms/classes/{slug}/landing", {"html": "<html></html> padding padding"}),
        "add landing section": ("POST", f"/api/lms/classes/{slug}/landing/sections", {"title": "t", "body_html": "<p>x</p>"}),
        "generate lesson": ("POST", "/api/lms/lessons/generate", {"class_id": cls["id"], "content": "x"}),
        "reorder lessons": ("POST", "/api/lms/lessons/reorder", {"lesson_ids": []}),
        "delete class": ("DELETE", f"/api/lms/classes/{slug}", None),
    }
    for name, (method, path, body) in writes.items():
        check(f"user cannot {name}", call(method, path, "user", json=body).status_code == 403)
    check("guest gets 401/403", call("GET", f"/api/lms/classes/{slug}/landing", None).status_code in (401, 403))
    check("user can read the landing page", call("GET", f"/api/lms/classes/{slug}/landing", "user").status_code == 200)
    check("user progress tracking still works", call("POST", f"/api/lms/lessons/{lesson['id']}/view", "user").status_code < 400)
    for role in ("editor", "admin", "superadmin"):
        r = call("POST", f"/api/lms/classes/{slug}/landing/sections", role, json={"title": f"By {role}", "body_html": "<p>x</p>"})
        check(f"{role} can add a landing section", r.status_code == 201)
    page = call("GET", f"/api/lms/classes/{slug}/landing", "editor").json()
    check("landing sections persisted", all(f"By {r}" in page["html"] for r in ("editor", "admin", "superadmin")))
    check("PUT dropping lms:auto markers → 422", call("PUT", f"/api/lms/classes/{slug}/landing", "editor", json={"html": "<html><body>none here</body></html>"}).status_code == 422)
    check("stale base_hash → 409", call("PUT", f"/api/lms/classes/{slug}/landing", "editor", json={"html": page["html"] + " ", "base_hash": "stale"}).status_code == 409)

shutil.rmtree(scratch, ignore_errors=True)
print(f"\n{'FAILED: ' + ', '.join(failures) if failures else 'all checks passed'}")
sys.exit(1 if failures else 0)
