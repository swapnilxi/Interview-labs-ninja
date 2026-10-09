"""Account-approval workflow checks (standalone, like the other backend/tests scripts).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/account_status_test.py
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

scratch = tempfile.mkdtemp(prefix="account-status-")
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", Path(scratch) / "lab.sqlite3")
os.environ["LABNINJA_TEST_DB_PATH"] = str(Path(scratch) / "lab.sqlite3")
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
os.environ["LABNINJA_SUPERADMIN_EMAILS"] = "super@status.test"

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
    for who in ("super", "admin", "pending", "reject"):
        r = client.post("/auth/signup", json={"email": f"{who}@status.test", "password": "Passw0rd!x"})
        tokens[who], ids[who] = r.json()["access_token"], r.json()["user"]["id"]
    promote_superadmins_from_env()

    def call(method: str, who: str | None, path: str, **kw):
        headers = {"Authorization": f"Bearer {tokens[who]}"} if who else {}
        return client.request(method, path, headers=headers, **kw)

    # 0. Bootstrap regression: the env-var-promoted superadmin is also auto-approved.
    super_me = call("GET", "super", "/auth/me").json()
    check("superadmin bootstrapped from env", super_me["role"] == "superadmin")
    check("superadmin auto-approved by promotion", super_me["status"] == "approved")

    # Promote "admin" so there's a non-superadmin admin to test the superadmin-only guard.
    call("PATCH", "super", f"/admin/users/{ids['admin']}/role", json={"role": "admin"})

    # 1. Fresh signup -> pending.
    pending_me = call("GET", "pending", "/auth/me").json()
    check("fresh signup is pending", pending_me["status"] == "pending")

    # 2. Pending user: /auth/me works, everything else 403s -- including the two gap-fix
    # endpoints (profile, access-requests) that depend on raw get_current_user upstream.
    check("pending user blocked from LMS write", call("POST", "pending", "/api/lms/classes", json={"name": "x"}).status_code == 403)
    check("pending user blocked from /auth/profile", call("GET", "pending", "/auth/profile").status_code == 403)
    check("pending user blocked from /access-requests", call("POST", "pending", "/access-requests", json={"requested_role": "editor"}).status_code == 403)
    check("pending user can still see /auth/me", call("GET", "pending", "/auth/me").status_code == 200)

    # 3. Admin approves -> same token now works, no re-login.
    approve = call("POST", "super", f"/admin/users/{ids['pending']}/approve")
    check("approve succeeds", approve.status_code == 200 and approve.json()["status"] == "approved", approve.text)
    check("approved user's existing token now passes", call("GET", "pending", "/auth/profile").status_code == 200)
    check("approved user can submit an access request", call("POST", "pending", "/access-requests", json={"requested_role": "editor"}).status_code == 201)

    # 4. Reject flow.
    reject = call("POST", "super", f"/admin/users/{ids['reject']}/reject")
    check("reject succeeds", reject.status_code == 200 and reject.json()["status"] == "rejected", reject.text)
    check("rejected user blocked from /auth/profile", call("GET", "reject", "/auth/profile").status_code == 403)
    check("rejected user still sees /auth/me with status", call("GET", "reject", "/auth/me").json().get("status") == "rejected")

    # 5. Only a superadmin may approve/reject an admin-level account.
    another_pending = client.post("/auth/signup", json={"email": "pending2@status.test", "password": "Passw0rd!x"})
    pending2_id = another_pending.json()["user"]["id"]
    check(
        "plain admin cannot approve/reject another admin",
        call("POST", "admin", f"/admin/users/{ids['super']}/reject").status_code == 403,
    )
    check(
        "plain admin CAN approve a regular pending user",
        call("POST", "admin", f"/admin/users/{pending2_id}/approve").status_code == 200,
    )

    # 6. system_stats reports pending_users.
    stats = call("GET", "super", "/admin/stats").json()
    check("stats reports pending_users", "pending_users" in stats and isinstance(stats["pending_users"], int))


print()
if failures:
    print(f"{len(failures)} check(s) FAILED:", *failures, sep="\n  - ")
    sys.exit(1)
print("All checks passed.")
