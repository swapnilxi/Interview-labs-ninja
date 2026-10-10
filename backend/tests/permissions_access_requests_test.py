"""Per-module permissions + access-request workflow checks (standalone, like the other
backend/tests scripts).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/permissions_access_requests_test.py
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

scratch = tempfile.mkdtemp(prefix="perms-")
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", Path(scratch) / "lab.sqlite3")
os.environ["LABNINJA_TEST_DB_PATH"] = str(Path(scratch) / "lab.sqlite3")
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
os.environ["LABNINJA_SUPERADMIN_EMAILS"] = "superadmin@perms.test"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from modules.auth.db import promote_superadmins_from_env, set_user_status  # noqa: E402
from modules.auth.dependencies import DEFAULT_PERMISSIONS  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(("PASS" if ok else "FAIL"), name, extra)
    if not ok:
        failures.append(name)


with TestClient(app) as client:
    tokens: dict[str, str] = {}
    ids: dict[str, int] = {}
    for role in ("user", "editor", "admin", "superadmin"):
        r = client.post("/auth/signup", json={"email": f"{role}@perms.test", "password": "Passw0rd!x"})
        tokens[role], ids[role] = r.json()["access_token"], r.json()["user"]["id"]
    promote_superadmins_from_env()
    # The plain "user" account stays role='user' throughout this script (editor/admin are
    # promoted below, which auto-approves them -- see set_user_role) but still needs to
    # exercise approved-account actions (access-requests, ai_lms writes once granted), so
    # approve it directly; account-approval itself is covered by account_status_test.py.
    set_user_status(ids["user"], "approved")

    def call(method: str, path: str, role: str | None, **kw):
        headers = {"Authorization": f"Bearer {tokens[role]}"} if role else {}
        return client.request(method, path, headers=headers, **kw)

    # 1. /auth/me.permissions matches DEFAULT_PERMISSIONS for each of the 4 roles.
    client.patch(f"/admin/users/{ids['editor']}/role", headers={"Authorization": f"Bearer {tokens['superadmin']}"}, json={"role": "editor"})
    client.patch(f"/admin/users/{ids['admin']}/role", headers={"Authorization": f"Bearer {tokens['superadmin']}"}, json={"role": "admin"})
    for role in ("user", "editor", "admin", "superadmin"):
        me = call("GET", "/auth/me", role).json()
        expected = sorted(DEFAULT_PERMISSIONS.get(role, set()))
        check(f"{role} default permissions", sorted(me["permissions"]) == expected, f"got {me['permissions']!r} expected {expected!r}")

    # 2. Validation + duplicate handling on POST /access-requests.
    check("both fields set -> 422", call("POST", "/access-requests", "user", json={"requested_role": "editor", "permission": "ai_lms:edit"}).status_code == 422)
    check("neither field set -> 422", call("POST", "/access-requests", "user", json={}).status_code == 422)
    first = call("POST", "/access-requests", "user", json={"permission": "users:manage", "message": "need it"})
    check("first request accepted", first.status_code == 201)
    check("duplicate pending request -> 409", call("POST", "/access-requests", "user", json={"permission": "users:manage"}).status_code == 409)

    # 3. GET /access-requests/me is scoped to the caller; admin sees all.
    mine = call("GET", "/access-requests/me", "user").json()
    check("user sees only their own request", len(mine) == 1 and mine[0]["id"] == first.json()["id"])
    all_requests = call("GET", "/admin/access-requests", "superadmin").json()
    check("superadmin sees the pending request", any(r["id"] == first.json()["id"] for r in all_requests))

    # 4. Grant via request flow: scoped permission, not a role escalation.
    approve = call("POST", f"/admin/access-requests/{first.json()['id']}/approve", "superadmin", json={})
    check("approve succeeds", approve.status_code == 200, approve.text)
    check("user can now list users", call("GET", "/admin/users", "user").status_code == 200)
    check("user still can't grant admin role", call("PATCH", f"/admin/users/{ids['editor']}/role", "user", json={"role": "admin"}).status_code == 403)

    # 5. Escalation-hole regression: only superadmin may grant/revoke admin-equivalent perms.
    check("plain admin cannot grant users:manage", call("POST", f"/admin/users/{ids['user']}/permissions", "admin", json={"permission": "users:manage", "allowed": True}).status_code == 403)
    check("superadmin can grant users:delete", call("POST", f"/admin/users/{ids['user']}/permissions", "superadmin", json={"permission": "users:delete", "allowed": True}).status_code == 200)

    # 6. Revoke from a real admin.
    revoke = call("POST", f"/admin/users/{ids['admin']}/permissions", "superadmin", json={"permission": "users:delete", "allowed": False})
    check("superadmin revokes admin's users:delete", revoke.status_code == 200, revoke.text)
    check("that admin is now 403 on delete", call("DELETE", f"/admin/users/{ids['user']}", "admin").status_code == 403)
    check("that admin can still list users", call("GET", "/admin/users", "admin").status_code == 200)

    # 7. ai_lms revoke regression (the can_edit short-circuit bug).
    cls = call("POST", "/api/lms/classes", "editor", json={"name": "Perms Class"}).json()
    check("editor can create a class before revoke", "slug" in cls)
    revoke_lms = call("POST", f"/admin/users/{ids['editor']}/permissions", "superadmin", json={"permission": "ai_lms:edit", "allowed": False})
    check("superadmin revokes editor's ai_lms:edit", revoke_lms.status_code == 200)
    check("editor write now 403s after revoke", call("POST", "/api/lms/classes", "editor", json={"name": "Should Fail"}).status_code == 403)

    # 8. ai_lms grant to a plain user.
    grant_lms = call("POST", f"/admin/users/{ids['user']}/permissions", "superadmin", json={"permission": "ai_lms:edit", "allowed": True})
    check("superadmin grants user ai_lms:edit", grant_lms.status_code == 200)
    created = call("POST", "/api/lms/classes", "user", json={"name": "User Made Class"})
    check("granted user can now write to ai_lms", created.status_code in (200, 201), created.text)

    # 9. Deny flow + idempotency.
    second = call("POST", "/access-requests", "editor", json={"requested_role": "admin", "message": "please"})
    check("second request accepted", second.status_code == 201)
    deny = call("POST", f"/admin/access-requests/{second.json()['id']}/deny", "superadmin", json={"review_note": "not yet"})
    check("deny succeeds", deny.status_code == 200 and deny.json()["status"] == "rejected")
    check("re-denying an already-decided request fails", call("POST", f"/admin/access-requests/{second.json()['id']}/deny", "superadmin", json={}).status_code == 400)
    check("re-approving an already-decided request fails", call("POST", f"/admin/access-requests/{second.json()['id']}/approve", "superadmin", json={}).status_code == 400)

    # 10. Regression guard: existing role-change guards still hold with require_permission swapped in.
    check("admin cannot grant admin", call("PATCH", f"/admin/users/{ids['user']}/role", "admin", json={"role": "admin"}).status_code == 403)
    check("admin cannot touch a superadmin", call("PATCH", f"/admin/users/{ids['superadmin']}/role", "admin", json={"role": "user"}).status_code == 403)
    check("editor without users:manage cannot use admin API", call("GET", "/admin/users", "editor").status_code == 403)


print()
if failures:
    print(f"{len(failures)} check(s) FAILED:", *failures, sep="\n  - ")
    sys.exit(1)
print("All checks passed.")
