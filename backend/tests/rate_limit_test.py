"""Rate limiter checks (standalone, like the other backend/tests scripts).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/rate_limit_test.py
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

scratch = tempfile.mkdtemp(prefix="rate-limit-")
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", Path(scratch) / "lab.sqlite3")
os.environ["LABNINJA_TEST_DB_PATH"] = str(Path(scratch) / "lab.sqlite3")
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
os.environ["LABNINJA_SUPERADMIN_EMAILS"] = "super@ratelimit.test"
# Force the limiter on regardless of VERCEL, with a low guest limit so the test is fast.
os.environ["LABNINJA_RATE_LIMIT_ENABLED"] = "true"
os.environ["LABNINJA_RATE_LIMIT_GUEST_PER_MINUTE"] = "3"
os.environ["LABNINJA_RATE_LIMIT_PER_MINUTE"] = "3"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from modules.auth.db import promote_superadmins_from_env  # noqa: E402
from modules.common import rate_limit  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(("PASS" if ok else "FAIL"), name, extra)
    if not ok:
        failures.append(name)


with TestClient(app, headers={"Origin": "http://localhost:4028"}) as client:
    # Each check below uses its own throwaway key (distinct guest IP / distinct user) so
    # one check's requests can't exhaust another's quota.
    rate_limit._buckets.clear()

    # 1. Guest over the limit -> 429 with Retry-After, and CORS headers still present
    # (proves the middleware ordering: RateLimitMiddleware must be wrapped BY CORSMiddleware).
    # Uses /auth/me (no token -> 401 from the route, but the middleware counts the
    # request regardless of the eventual status) since /health is deliberately exempt.
    last = None
    for _ in range(4):
        last = client.get("/auth/me", headers={"X-Forwarded-For": "203.0.113.10"})
    check("guest over limit -> 429", last.status_code == 429, last.text)
    check("429 has Retry-After", "retry-after" in last.headers)
    check("429 still carries CORS headers", "access-control-allow-origin" in last.headers)

    # 2. /health itself is exempt from limiting (never 429s regardless of volume).
    rate_limit._buckets.clear()
    health_last = None
    for _ in range(10):
        health_last = client.get("/health", headers={"X-Forwarded-For": "203.0.113.11"})
    # /health is skipped entirely by the middleware, so hammering it never 429s even
    # though the same IP would otherwise be rate-limited on other routes.
    check("/health route itself is never rate-limited", health_last.status_code == 200)

    # 3. Admin/superadmin are exempt.
    rate_limit._buckets.clear()
    r = client.post("/auth/signup", json={"email": "super@ratelimit.test", "password": "Passw0rd!x"})
    super_token = r.json()["access_token"]
    promote_superadmins_from_env()
    super_headers = {"Authorization": f"Bearer {super_token}", "X-Forwarded-For": "203.0.113.12"}
    last = None
    for _ in range(6):
        last = client.get("/auth/me", headers=super_headers)
    check("superadmin never rate-limited", all(
        client.get("/auth/me", headers=super_headers).status_code == 200 for _ in range(6)
    ))

    # 4. A plain user IS limited (keyed by user id, not IP, so a shared IP with the
    # superadmin above doesn't interfere).
    rate_limit._buckets.clear()
    r = client.post("/auth/signup", json={"email": "plain@ratelimit.test", "password": "Passw0rd!x"})
    plain_token = r.json()["access_token"]
    plain_headers = {"Authorization": f"Bearer {plain_token}", "X-Forwarded-For": "203.0.113.13"}
    last = None
    for _ in range(4):
        last = client.get("/auth/me", headers=plain_headers)
    check("plain user over limit -> 429", last.status_code == 429, last.text)

    # 5. Disabling the limiter (env unset/false) never 429s regardless of volume.
    os.environ["LABNINJA_RATE_LIMIT_ENABLED"] = "false"
    rate_limit._buckets.clear()
    ok = all(
        client.get("/health", headers={"X-Forwarded-For": "203.0.113.14"}).status_code == 200 for _ in range(10)
    )
    check("disabled limiter never 429s", ok)
    os.environ["LABNINJA_RATE_LIMIT_ENABLED"] = "true"


print()
if failures:
    print(f"{len(failures)} check(s) FAILED:", *failures, sep="\n  - ")
    sys.exit(1)
print("All checks passed.")
