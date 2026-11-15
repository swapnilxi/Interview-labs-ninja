"""Topic lab checks (Communication, Finance, Python): seeding from topics.json, the /<lab>/topics and /<lab>/sections
routes, per-user sections, and the lab-specific prompts in /lab-sections (standalone, like the other backend/tests
scripts; no AI provider is called, the model call is replaced by a recording fake).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/topic_labs_test.py
Exits non-zero if any check fails.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

scratch = tempfile.mkdtemp(prefix="topic-labs-")
db_copy = str(Path(scratch) / "lab.sqlite3")
src = sqlite3.connect(str(ROOT / "data" / "lab_ninja.sqlite3"))
dst = sqlite3.connect(db_copy)
src.backup(dst)  # a consistent snapshot, even if a dev server has the live file open
src.close()
dst.close()
os.environ["LABNINJA_TEST_DB_PATH"] = db_copy
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
for key in ("GEMINI", "OPENAI", "ANTHROPIC", "DEEPSEEK", "GROQ", "OPENROUTER"):
    os.environ[f"{key}_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

import modules.lab_sections.router as lab_router  # noqa: E402
from main import app  # noqa: E402
from modules.auth.db import set_user_status  # noqa: E402
from modules.common.db import init_db  # noqa: E402

LABS = {
    # route prefix -> (lab_sections key, table, seed file)
    "communication": ("communication", "communication_topics", ROOT / "modules" / "communication_lab" / "topics.json"),
    "finance": ("finance", "finance_topics", ROOT / "modules" / "finance_lab" / "topics.json"),
    "python": ("python", "python_topics", ROOT / "modules" / "python_lab" / "topics.json"),
}

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print("PASS" if ok else "FAIL", name, "" if ok else extra)
    if not ok:
        failures.append(name)


prompts: list[str] = []


def fake_ai(prompt: str, *_args, **_kwargs) -> str:
    prompts.append(prompt)
    if "multiple-choice quiz" in prompt:
        return json.dumps([
            {"q": f"Question {i}?", "options": ["a", "b", "c", "d"], "answer": 1, "explanation": "Because."} for i in range(4)
        ])
    return "**Section**\n\nBody text."


lab_router.call_ai_text = fake_ai

with TestClient(app) as client:
    tokens: dict[str, str] = {}
    for who in ("ann", "bob"):
        r = client.post("/auth/signup", json={"email": f"{who}@topiclabs.test", "password": "Passw0rd!x"})
        tokens[who] = r.json()["access_token"]
        set_user_status(r.json()["user"]["id"], "approved")

    def call(who: str | None, method: str, path: str, **kw):
        headers = {"Authorization": f"Bearer {tokens[who]}"} if who else {}
        return client.request(method, path, headers=headers, **kw)

    for prefix, (lab_key, table, seed_file) in LABS.items():
        seed = json.loads(seed_file.read_text(encoding="utf-8"))
        check(f"{prefix}: guest is refused", call(None, "GET", f"/{prefix}/topics").status_code in (401, 403))

        topics = call("ann", "GET", f"/{prefix}/topics").json()
        check(f"{prefix}: every seed topic is served, in file order", [t["id"] for t in topics] == [t["id"] for t in seed])
        check(f"{prefix}: seeded topics are not custom", not any(t["isCustom"] for t in topics))
        check(f"{prefix}: subtopics come back as stored", topics[0]["subtopics"] == seed[0]["subtopics"])

        # Stored text must be exactly what json.dumps writes (the Next.js twin writes the same bytes).
        conn = sqlite3.connect(db_copy)
        stored = conn.execute(f"SELECT subtopics_json, prerequisites_json FROM {table} WHERE id = ?", (seed[1]["id"],)).fetchone()
        conn.close()
        check(f"{prefix}: JSON columns use json.dumps formatting",
              stored == (json.dumps(seed[1]["subtopics"]), json.dumps(seed[1]["prerequisites"])))

        cats = list(dict.fromkeys(t["category"] for t in seed))
        sections = call("ann", "GET", f"/{prefix}/sections").json()
        check(f"{prefix}: categories are seeded as default sections, in order",
              [s["name"] for s in sections if not s["isCustom"]] == cats, str(sections))

        # Custom section: visible to its owner only.
        check(f"{prefix}: add a section", call("ann", "POST", f"/{prefix}/sections", json={"name": "My Area"}).status_code == 200)
        check(f"{prefix}: owner sees the custom section", "My Area" in [s["name"] for s in call("ann", "GET", f"/{prefix}/sections").json()])
        check(f"{prefix}: other users do not", "My Area" not in [s["name"] for s in call("bob", "GET", f"/{prefix}/sections").json()])

        # A subtopic added to a seeded topic keeps the topic seeded; a new topic is custom.
        first = dict(topics[0])
        first.pop("isCustom")
        first["subtopics"] = first["subtopics"] + [{"id": f"{prefix}-extra", "name": "Extra", "brief": "Custom subtopic."}]
        check(f"{prefix}: save a seeded topic", call("ann", "POST", f"/{prefix}/topics", json=first).status_code == 200)
        new_topic = {"id": f"custom-{prefix}", "name": "Mine", "brief": "Custom topic.", "category": "My Area", "difficulty": "Medium"}
        check(f"{prefix}: add a custom topic", call("ann", "POST", f"/{prefix}/topics", json=new_topic).status_code == 200)
        check(f"{prefix}: invalid topic is rejected", call("ann", "POST", f"/{prefix}/topics", json={"id": "x"}).status_code == 422)
        after = {t["id"]: t for t in call("ann", "GET", f"/{prefix}/topics").json()}
        check(f"{prefix}: seeded topic stays seeded, with the new subtopic",
              not after[first["id"]]["isCustom"] and after[first["id"]]["subtopics"][-1]["id"] == f"{prefix}-extra")
        check(f"{prefix}: new topic is custom and listed last", after[f"custom-{prefix}"]["isCustom"] and list(after)[-1] == f"custom-{prefix}")
        check(f"{prefix}: an edited lesson keeps its place in the path",
              [t["id"] for t in after.values()][: len(seed)] == [t["id"] for t in seed])

    # init_db again (every server start): no duplicate seed rows, and the user's edits survive.
    init_db()
    conn = sqlite3.connect(db_copy)
    for prefix, (lab_key, table, seed_file) in LABS.items():
        seed = json.loads(seed_file.read_text(encoding="utf-8"))
        n = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE is_custom = 0").fetchone()[0]
        check(f"{prefix}: re-running init_db adds no duplicate topics", n == len(seed), str(n))
        dup = conn.execute(
            "SELECT COUNT(*) FROM lab_sections WHERE lab_name = ? AND user_id IS NULL GROUP BY name HAVING COUNT(*) > 1", (lab_key,)
        ).fetchall()
        check(f"{prefix}: re-running init_db adds no duplicate sections", not dup)
        subs = json.loads(conn.execute(f"SELECT subtopics_json FROM {table} WHERE id = ?", (seed[0]["id"],)).fetchone()[0])
        check(f"{prefix}: re-seeding keeps the user's added subtopic", subs[-1]["id"] == f"{prefix}-extra")
    conn.close()

    # ── /lab-sections accepts the new labs and uses their own wording ─────────────────────────────────
    def generate(lab: str) -> str:
        prompts.clear()
        r = call("ann", "POST", "/lab-sections/generate", json={
            "lab": lab, "topic_id": "t1", "topic_name": "Topic", "section_id": "concepts", "section_label": "Key Concepts",
            "mode": "generate", "section_guidance": "Explain it.",
        })
        check(f"lab-sections: generate for {lab}", r.status_code == 200, r.text)
        return prompts[-1] if prompts else ""

    check("dsa keeps the interview audience", "aimed at someone preparing for technical interviews." in generate("dsa"))
    check("finance writes for a beginner", "aimed at a beginner learning finance step by step" in generate("finance"))
    check("communication writes for professionals", "business English, communication and leadership skills" in generate("communication"))
    check("python writes for Python learners", "You are a senior Python instructor" in generate("python"))
    saved = call("ann", "GET", "/lab-sections", params={"lab": "finance", "topic_id": "t1"}).json()["sections"]
    check("lab-sections: the finance section is saved", saved.get("concepts", {}).get("content", "").startswith("**Section**"))

    prompts.clear()
    r = call("ann", "POST", "/lab-sections/quiz/generate", json={"lab": "python", "topic_id": "t1", "topic_name": "Generators", "category": "Functions & Modules"})
    check("quiz: python quiz generates", r.status_code == 200 and len(r.json()["questions"]) == 4, r.text)
    check("quiz: python prompt uses its own focus", prompts and "Area: Functions & Modules" in prompts[-1] and "predict-the-output" in prompts[-1])

    prompts.clear()
    r = call("ann", "POST", "/lab-sections/copilot", json={"lab": "communication", "context": "Active Listening", "mode": "eli5"})
    check("copilot: communication answers", r.status_code == 200, r.text)
    check("copilot: communication goal", prompts and "helping a professional improve their business English" in prompts[-1])
    prompts.clear()
    call("ann", "POST", "/lab-sections/copilot", json={"lab": "cv", "context": "Canny", "mode": "eli5"})
    check("copilot: cv keeps the interview goal", prompts and "lab, helping someone prepare for technical interviews." in prompts[-1])

    r = call("ann", "PUT", "/lab-sections/progress", json={"lab": "finance", "topic_id": "what-is-finance", "completed": True})
    check("progress: mark a finance page complete", r.status_code == 200, r.text)
    check("lab-sections: unknown lab still rejected", call("ann", "GET", "/lab-sections", params={"lab": "cooking", "topic_id": "t"}).status_code == 422)

print(f"\n{len(failures)} failure(s)" if failures else "\nall checks passed")
sys.exit(1 if failures else 0)
