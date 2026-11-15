"""Settings page: the models and endpoints a user adds (user_profile.custom_models) — standalone check.

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/profile_custom_models_test.py
Exits non-zero if any check fails. The Next.js twin (fe-apis/account) must give the same answers and store the
same JSON text; see EXPECTED_STORED below.
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

scratch = tempfile.mkdtemp(prefix="custom-models-")
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", Path(scratch) / "lab.sqlite3")
os.environ["LABNINJA_TEST_DB_PATH"] = str(Path(scratch) / "lab.sqlite3")
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402
from modules.auth.db import set_user_status  # noqa: E402

failures: list[str] = []

VALID = [
    {"id": "a1", "provider": "groq", "model": " qwen/qwen3-32b ", "name": "", "base_url": "https://ignored.example"},
    {"id": "e-1", "provider": "custom", "model": "llama3", "name": "LM Studio", "base_url": "http://localhost:1234/v1",
     "key": "sk-must-not-be-stored"},
]
EXPECTED = [
    {"id": "a1", "provider": "groq", "model": "qwen/qwen3-32b", "name": None, "base_url": None},
    {"id": "e-1", "provider": "custom", "model": "llama3", "name": "LM Studio", "base_url": "http://localhost:1234/v1"},
]
# Byte-for-byte what both backends write (Python json.dumps with compact separators == JS JSON.stringify).
EXPECTED_STORED = (
    '[{"id":"a1","provider":"groq","model":"qwen/qwen3-32b","name":null,"base_url":null},'
    '{"id":"e-1","provider":"custom","model":"llama3","name":"LM Studio","base_url":"http://localhost:1234/v1"}]'
)


def check(name: str, ok: bool, extra: str = "") -> None:
    print(("PASS" if ok else "FAIL"), name, extra)
    if not ok:
        failures.append(name)


def stored(user_id: int):
    conn = sqlite3.connect(os.environ["LABNINJA_TEST_DB_PATH"])
    try:
        row = conn.execute("SELECT custom_models FROM user_profile WHERE user_id = ?", (user_id,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


with TestClient(app) as client:
    r = client.post("/auth/signup", json={"email": "models@custom.test", "password": "Passw0rd!x"})
    token, user_id = r.json()["access_token"], r.json()["user"]["id"]
    set_user_status(user_id, "approved")
    h = {"Authorization": f"Bearer {token}"}

    r = client.put("/auth/profile", headers=h, json={"text_generation_model": "deepseek-flash"})
    check("profile without custom_models saves", r.status_code == 200, str(r.status_code))
    check("never-saved list reads as null", r.json().get("custom_models", "missing") is None, str(r.json()))

    r = client.put("/auth/profile", headers=h, json={"custom_models": VALID})
    check("valid list saves", r.status_code == 200, r.text[:200])
    check("list comes back normalized", r.json().get("custom_models") == EXPECTED, str(r.json().get("custom_models")))
    check("stored JSON text", stored(user_id) == EXPECTED_STORED, str(stored(user_id)))
    check("no key stored", "sk-must-not-be-stored" not in (stored(user_id) or ""))
    check("GET returns it", client.get("/auth/profile", headers=h).json().get("custom_models") == EXPECTED)

    r = client.put("/auth/profile", headers=h, json={"answer_model": "claude-sonnet-5"})
    check("other fields leave the list alone", r.json().get("custom_models") == EXPECTED)

    bad = {
        "endpoint without base_url": [{"id": "x", "provider": "custom", "model": "m"}],
        "endpoint with ftp url": [{"id": "x", "provider": "custom", "model": "m", "base_url": "ftp://h"}],
        "duplicate ids": [{"id": "x", "provider": "groq", "model": "a"}, {"id": "x", "provider": "groq", "model": "b"}],
        "bad id characters": [{"id": "a b", "provider": "groq", "model": "m"}],
        "unknown provider": [{"id": "x", "provider": "mistral", "model": "m"}],
        "empty model": [{"id": "x", "provider": "groq", "model": "   "}],
        "model too long": [{"id": "x", "provider": "groq", "model": "m" * 201}],
        "name too long": [{"id": "x", "provider": "groq", "model": "m", "name": "n" * 81}],
        "too many entries": [{"id": f"i{i}", "provider": "groq", "model": "m"} for i in range(101)],
        "not a list": {"id": "x"},
    }
    for label, payload in bad.items():
        r = client.put("/auth/profile", headers=h, json={"custom_models": payload})
        check(f"422: {label}", r.status_code == 422, str(r.status_code))
    check("rejected writes changed nothing", stored(user_id) == EXPECTED_STORED)

    r = client.put("/auth/profile", headers=h, json={"custom_models": []})
    check("empty list clears", r.status_code == 200 and r.json().get("custom_models") == [] and stored(user_id) == "[]")

    check("needs login", client.put("/auth/profile", json={"custom_models": []}).status_code == 401)

shutil.rmtree(scratch, ignore_errors=True)
print(f"\n{len(failures)} failure(s)")
sys.exit(1 if failures else 0)
