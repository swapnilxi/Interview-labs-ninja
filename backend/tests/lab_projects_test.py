"""Labs Project checks: CRUD, isolation between users and projects, persistence, deletion policy,
retrieval of saved knowledge and how the project reaches the labs' prompts (standalone, like the other
backend/tests scripts; no AI provider is called, the model call is replaced by a recording fake).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/lab_projects_test.py
Exits non-zero if any check fails.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

scratch = tempfile.mkdtemp(prefix="lab-projects-")
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

from main import app  # noqa: E402
from modules.auth.db import set_user_status  # noqa: E402
from modules.lab_projects import knowledge  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print("PASS" if ok else "FAIL", name, "" if ok else extra)
    if not ok:
        failures.append(name)


def section(title: str, content: str, lab: str = "dsa", lab_name: str = "DSA Lab", gen: str | None = None) -> dict:
    return {"title": title, "content": content, "source_lab_id": lab, "source_lab_name": lab_name, "source_generation_id": gen}


with TestClient(app) as client:
    tokens: dict[str, str] = {}
    for who in ("ann", "bob"):
        r = client.post("/auth/signup", json={"email": f"{who}@projects.test", "password": "Passw0rd!x"})
        tokens[who] = r.json()["access_token"]
        set_user_status(r.json()["user"]["id"], "approved")

    def call(who: str | None, method: str, path: str, **kw):
        headers = {"Authorization": f"Bearer {tokens[who]}"} if who else {}
        return client.request(method, f"/lab-projects{path}", headers=headers, **kw)

    # ── Auth and validation ──────────────────────────────────────────────────
    check("guest is refused", call(None, "GET", "").status_code in (401, 403))
    check("empty name is rejected", call("ann", "POST", "", json={"name": "   "}).status_code == 422)
    check("missing name is rejected", call("ann", "POST", "", json={"description": "x"}).status_code == 422)
    check("overlong context is rejected", call("ann", "POST", "", json={"name": "x", "context": "a" * 12001}).status_code == 422)
    seed = call("ann", "POST", "", json={"name": "Seed"}).json()
    check("bad status is rejected", call("ann", "PATCH", f"/{seed['id']}", json={"status": "gone"}).status_code == 422)
    call("ann", "DELETE", f"/{seed['id']}")

    # ── Create, read, update ─────────────────────────────────────────────────
    r = call("ann", "POST", "", json={"name": "  Crop Disease CV  ", "description": "Detect leaf disease", "context": "Dataset: 12k leaf photos, 6 classes. Goal: 92% F1 on a phone."})
    check("create returns 201", r.status_code == 201, r.text[:120])
    farm = r.json()
    check("name is trimmed", farm["name"] == "Crop Disease CV")
    check("new project is active with a timestamp", farm["status"] == "active" and bool(farm["createdAt"]) and farm["sectionCount"] == 0)
    pid = farm["id"]
    check("get returns the project", call("ann", "GET", f"/{pid}").json()["context"].startswith("Dataset: 12k"))
    check("unknown project is 404", call("ann", "GET", "/999999").status_code == 404)

    r = call("ann", "PATCH", f"/{pid}", json={"context": "Dataset: 12k leaf photos, 6 classes. Target: 95% F1."})
    check("patch changes only what was sent", r.json()["context"].endswith("95% F1.") and r.json()["name"] == "Crop Disease CV" and r.json()["description"] == "Detect leaf disease")
    check("patch with no fields is a no-op", call("ann", "PATCH", f"/{pid}", json={}).json()["name"] == "Crop Disease CV")
    check("empty name on patch is rejected", call("ann", "PATCH", f"/{pid}", json={"name": " "}).status_code == 422)

    # ── Sections: save, list, search, filter, edit ───────────────────────────
    s1 = call("ann", "POST", f"/{pid}/sections", json=section("Training plan", "**Training — Transfer learning**\n\nFine-tune a pretrained ResNet on the leaf dataset with heavy augmentation.", "cv", "CV Lab", "cv|transfer|| training@2026-10-18 10:00:00"))
    check("save returns 201", s1.status_code == 201, s1.text[:120])
    s1 = s1.json()
    check("section keeps source lab and generation reference", s1["sourceLabId"] == "cv" and s1["sourceLabName"] == "CV Lab" and s1["sourceGenerationId"].startswith("cv|transfer"))
    s2 = call("ann", "POST", f"/{pid}/sections", json=section("Serving design", "Latency budget and caching for the inference endpoint on mobile.", "system_design", "System Design")).json()
    s3 = call("ann", "POST", f"/{pid}/sections", json=section("Two pointers", "Sliding window over sorted arrays.")).json()
    check("project counts its sections", call("ann", "GET", f"/{pid}").json()["sectionCount"] == 3)
    listing = call("ann", "GET", f"/{pid}/sections").json()["sections"]
    check("list is newest first and carries source + excerpt", [s["id"] for s in listing] == [s3["id"], s2["id"], s1["id"]] and all(s["sourceLabName"] and s["excerpt"] for s in listing))
    check("list omits full content", all("content" not in s for s in listing))
    check("search matches content", [s["id"] for s in call("ann", "GET", f"/{pid}/sections", params={"q": "resnet"}).json()["sections"]] == [s1["id"]])
    check("search matches title, case-insensitively", [s["id"] for s in call("ann", "GET", f"/{pid}/sections", params={"q": "SERVING"}).json()["sections"]] == [s2["id"]])
    check("filter by source lab", [s["id"] for s in call("ann", "GET", f"/{pid}/sections", params={"lab": "cv"}).json()["sections"]] == [s1["id"]])
    check("search and filter combine", call("ann", "GET", f"/{pid}/sections", params={"lab": "cv", "q": "latency"}).json()["sections"] == [])
    detail = call("ann", "GET", f"/{pid}/sections/{s1['id']}").json()
    check("detail returns the full content untouched", "**Training — Transfer learning**" in detail["content"] and "augmentation." in detail["content"])
    check("empty section content is rejected", call("ann", "POST", f"/{pid}/sections", json=section("x", "  ")).status_code == 422)
    check("blank source lab name is rejected", call("ann", "POST", f"/{pid}/sections", json={**section("x", "y"), "source_lab_name": "  "}).status_code == 422)
    check("bad source lab id is rejected", call("ann", "POST", f"/{pid}/sections", json={**section("x", "y"), "source_lab_id": "Bad Lab!"}).status_code == 422)

    before = call("ann", "GET", f"/{pid}/sections/{s2['id']}").json()
    call("ann", "PATCH", f"/{pid}", json={"context": "Totally new context.", "name": "Renamed"})
    after = call("ann", "GET", f"/{pid}/sections/{s2['id']}").json()
    check("editing project context never changes a saved section", before["content"] == after["content"] and before["title"] == after["title"] and before["updatedAt"] == after["updatedAt"])
    edited = call("ann", "PATCH", f"/{pid}/sections/{s2['id']}", json={"title": "Serving design v2", "content": "Edited body."}).json()
    check("section edit changes title and content", edited["title"] == "Serving design v2" and edited["content"] == "Edited body." and edited["sourceLabId"] == "system_design")
    call("ann", "PATCH", f"/{pid}", json={"name": "Crop Disease CV", "context": "Dataset: 12k leaf photos, 6 classes. Target: 95% F1."})

    # ── Isolation ────────────────────────────────────────────────────────────
    bob_project = call("bob", "POST", "", json={"name": "Bob's Chatbot", "context": "Support bot for a bank"}).json()
    bid = bob_project["id"]
    check("projects list only your own", [p["id"] for p in call("bob", "GET", "").json()["projects"]] == [bid])
    check("other user's project is 404", call("bob", "GET", f"/{pid}").status_code == 404)
    check("other user cannot patch it", call("bob", "PATCH", f"/{pid}", json={"name": "pwned"}).status_code == 404)
    check("other user cannot delete it", call("bob", "DELETE", f"/{pid}").status_code == 404)
    check("other user cannot list its sections", call("bob", "GET", f"/{pid}/sections").status_code == 404)
    check("other user cannot save into it", call("bob", "POST", f"/{pid}/sections", json=section("x", "y")).status_code == 404)
    check("other user cannot read a section", call("bob", "GET", f"/{pid}/sections/{s1['id']}").status_code == 404)
    call("ann", "POST", "", json={"name": "Second"})
    second = [p for p in call("ann", "GET", "").json()["projects"] if p["name"] == "Second"][0]["id"]
    check("a section is only reachable through its own project", call("ann", "GET", f"/{second}/sections/{s1['id']}").status_code == 404)
    check("a section cannot be edited through another project", call("ann", "PATCH", f"/{second}/sections/{s1['id']}", json={"title": "x"}).status_code == 404)
    check("a section cannot be deleted through another project", call("ann", "DELETE", f"/{second}/sections/{s1['id']}").status_code == 404 and call("ann", "GET", f"/{pid}/sections/{s1['id']}").status_code == 200)
    check("project's name/context unchanged by the rejected edits", call("ann", "GET", f"/{pid}").json()["name"] == "Crop Disease CV")

    # ── Archive ──────────────────────────────────────────────────────────────
    check("archive keeps everything", call("ann", "PATCH", f"/{second}", json={"status": "archived"}).json()["status"] == "archived")
    check("archived projects take no new sections", call("ann", "POST", f"/{second}/sections", json=section("x", "y")).status_code == 409)
    check("status filter works", [p["id"] for p in call("ann", "GET", "", params={"status": "archived"}).json()["projects"]] == [second] and second not in [p["id"] for p in call("ann", "GET", "", params={"status": "active"}).json()["projects"]])
    check("restore makes it active again", call("ann", "PATCH", f"/{second}", json={"status": "active"}).json()["status"] == "active")

    # ── Persistence ──────────────────────────────────────────────────────────
    raw = sqlite3.connect(db_copy)
    row = raw.execute("SELECT name, context, user_id FROM lab_projects WHERE id = ?", (pid,)).fetchone()
    n_sections = raw.execute("SELECT COUNT(*) FROM lab_project_sections WHERE project_id = ?", (pid,)).fetchone()[0]
    raw.close()
    check("project and sections are in the database file", row is not None and row[0] == "Crop Disease CV" and n_sections == 3)

    # ── Knowledge retrieval (pure function) ──────────────────────────────────
    def kb(*items):
        # newest first, like store.list_sections_with_content
        return [
            {"id": i, "title": t, "content": c, "sourceLabName": lab, "sourceGenerationId": g, "updatedAt": f"2026-10-{20 - i:02d} 09:00:00"}
            for i, (t, c, lab, g) in enumerate(items, start=1)
        ]

    corpus = kb(
        ("Training plan", "Fine-tune a pretrained ResNet with augmentation on the leaf dataset.", "CV Lab", "cv|a||train@t1"),
        ("Serving design", "Latency budget and caching for the inference endpoint.", "System Design", None),
        ("Hash maps", "Complement lookup with a dictionary in one pass.", "DSA Lab", None),
    )
    got = knowledge.select_knowledge(corpus, "model training augmentation")
    check("retrieval picks the relevant section only", [k["title"] for k in got] == ["Training plan"], str([k["title"] for k in got]))
    check("retrieval keeps source lab and date for attribution", got and got[0]["sourceLabName"] == "CV Lab" and got[0]["updatedAt"].startswith("2026-10-"))
    check("nothing relevant -> nothing is injected", knowledge.select_knowledge(corpus, "kubernetes helm charts") == [])
    check("empty query -> nothing is injected", knowledge.select_knowledge(corpus, "") == [])
    check("plural and singular match each other", [k["title"] for k in knowledge.select_knowledge(corpus, "dictionaries")] == ["Hash maps"])
    check("the section being regenerated is excluded", knowledge.select_knowledge(corpus, "training augmentation", exclude_generation_prefix="cv|a||train@") == [])
    check("a section equal to the content being revised is excluded", knowledge.select_knowledge(corpus, "training augmentation", existing_content="  Fine-tune a pretrained ResNet with   augmentation on the leaf dataset. ") == [])
    dupes = kb(("Newer copy", "Cache the inference results at the edge.", "CV Lab", None), ("Older copy", "Cache the inference results at the edge.", "CV Lab", None))
    check("exact duplicates collapse to the newest", [k["title"] for k in knowledge.select_knowledge(dupes, "cache inference")] == ["Newer copy"])
    ties = kb(("Newer", "Quantization notes for mobile.", "CV Lab", None), ("Older", "Quantization notes for mobiles.", "CV Lab", None))
    check("a tie goes to the newer section", knowledge.select_knowledge(ties, "quantization mobile")[0]["title"] == "Newer")
    big = [{"id": i, "title": f"Note {i}", "content": f"cache invalidation strategy number {i} " + "filler words " * 400, "sourceLabName": "L", "sourceGenerationId": None, "updatedAt": "2026-10-01 00:00:00"} for i in range(1, 30)]
    picked = knowledge.select_knowledge(big, "cache invalidation strategy")
    check("retrieval is capped in count and size", len(picked) <= knowledge.MAX_KNOWLEDGE_SECTIONS and sum(len(k["text"]) for k in picked) <= knowledge.MAX_KNOWLEDGE_CHARS, f"{len(picked)} sections, {sum(len(k['text']) for k in picked)} chars")
    long_doc = "**Title**\n\n" + "\n\n".join(f"Paragraph {i} about nothing in particular. " * 8 for i in range(30)) + "\n\nThe quarantine zone needs a watchdog timer.\n\n" + "\n\n".join(f"Later filler {i}. " * 8 for i in range(30))
    excerpt = knowledge.excerpt_for(long_doc, knowledge.tokenize("watchdog timer"), 600)
    check("a long section is excerpted around the matching passage", "watchdog timer" in excerpt and "**Title**" in excerpt and len(excerpt) <= 600, f"{len(excerpt)} chars")

    # ── Prompt text ──────────────────────────────────────────────────────────
    project = {"name": "Crop Disease CV", "description": "Detect leaf disease", "context": "Target: 95% F1 on a phone."}
    role, blocks, rules = knowledge.section_prompt_parts(project, got)
    check("without a project the prompt parts are empty", knowledge.section_prompt_parts(None, []) == ("", "", "") and knowledge.quiz_prompt_parts(None, []) == ("", ""))
    check("project blocks carry name, description, context", "Project: Crop Disease CV" in blocks and "Detect leaf disease" in blocks and "Target: 95% F1 on a phone." in blocks)
    check("saved knowledge is attributed by title, lab and date", '[1] "Training plan" — from CV Lab, updated 2026-10-' in blocks)
    check("rules forbid inventing requirements and ask for assumptions", "Never invent project requirements" in rules and "Assumptions & open questions" in rules)
    check("rules say how conflicts are resolved", "follow the project context first, then the newer" in rules)
    check("rules ask for how it applies to the project", "**Applying this to Crop Disease CV**" in rules)

    # ── Project context reaches the labs' prompts ────────────────────────────
    import json as _json

    import modules.lab_sections.router as lab_router  # noqa: E402

    prompts: list[str] = []
    quiz_counter = [0]

    def fake_ai(prompt: str, settings, max_tokens=None, **kw):
        prompts.append(prompt)
        if "multiple-choice quiz" in prompt:
            quiz_counter[0] += 1
            n = quiz_counter[0]
            return _json.dumps(
                [{"q": f"Question {n}.{i} about topic?", "options": ["a1", "b2", "c3", "d4"], "answer": 1, "explanation": "because"} for i in range(4)]
            )
        return "**Generated body**\n\nAlpha beta gamma."

    lab_router.call_ai_text = fake_ai

    def lab_call(who: str, method: str, path: str, **kw):
        return client.request(method, f"/lab-sections{path}", headers={"Authorization": f"Bearer {tokens[who]}"}, **kw)

    def gen(who: str, project_id=None, mode="generate", context="", existing="", section="approaches", topic="transfer", topic_name="Transfer learning training", sub=""):
        body = {
            "lab": "cv", "topic_id": topic, "topic_name": topic_name, "topic_brief": "Reuse a pretrained backbone",
            "subtopic_id": sub, "section_id": section, "section_label": "Training", "mode": mode, "context": context,
            "existing_content": existing,
        }
        if project_id is not None:
            body["project_id"] = project_id
        prompts.clear()
        r = lab_call(who, "POST", "/generate", json=body)
        return r, (prompts[-1] if prompts else "")

    proj_a = call("ann", "POST", "", json={"name": "Alpha Farm CV", "description": "Leaf disease detection", "context": "ALPHA-CONTEXT: 12k leaf photos, six classes, target 95% F1."}).json()["id"]
    proj_b = call("ann", "POST", "", json={"name": "Beta Warehouse", "description": "Pallet counting", "context": "BETA-CONTEXT: forklift camera, night shift, 30 fps."}).json()["id"]
    call("ann", "POST", f"/{proj_a}/sections", json=section("Alpha training notes", "Training with augmentation for the leaf dataset: ALPHA-NOTE rotate and flip.", "cv", "CV Lab"))
    call("ann", "POST", f"/{proj_b}/sections", json=section("Beta training notes", "Training on night footage needs exposure jitter: BETA-NOTE.", "cv", "CV Lab"))
    call("ann", "POST", f"/{proj_b}/sections", json=section("Beta unrelated", "Invoice approval workflow for accounting: BETA-UNRELATED.", "dsa", "DSA Lab"))
    own_gen = knowledge.generation_ref("cv", "transfer", "", "approaches", "2026-10-18 10:00:00")
    call("ann", "POST", f"/{proj_a}/sections", json=section("Alpha saved approaches", "ALPHA-SELF training approaches previously saved from this very page.", "cv", "CV Lab", own_gen))

    r, plain = gen("ann")
    check("no project: generation still works", r.status_code == 200 and r.json()["projectId"] is None, r.text[:150])
    check("no project: prompt has no project text", "Project:" not in plain and "Project rules" not in plain and "ALPHA" not in plain and "BETA" not in plain)
    check("no project: role line is the original", plain.startswith("You are a senior Computer Vision instructor writing one section of a study lab.\n"))

    r, with_a = gen("ann", proj_a)
    check("project: generation works and records the project", r.status_code == 200 and r.json()["projectId"] == proj_a, r.text[:150])
    check("project: name, description and context are in the prompt", "Project: Alpha Farm CV" in with_a and "Leaf disease detection" in with_a and "ALPHA-CONTEXT" in with_a)
    check("project: the lab's own purpose and topic are still in it", "Section: Training" in with_a and "Transfer learning training" in with_a and "Output rules:" in with_a)
    check("project: rules ask how it applies to the project", "**Applying this to Alpha Farm CV**" in with_a and "Never invent project requirements" in with_a)
    check("project: relevant saved section is included, attributed", "ALPHA-NOTE" in with_a and '"Alpha training notes" — from CV Lab' in with_a)
    check("project: the section's own earlier copy is left out", "ALPHA-SELF" not in with_a)
    check("project: nothing from the other project", "BETA" not in with_a and "Beta Warehouse" not in with_a)
    check("project: the stored page content remembers its project", lab_call("ann", "GET", "", params={"lab": "cv", "topic_id": "transfer", "subtopic_id": ""}).json()["sections"]["approaches"]["projectId"] == proj_a)

    r, with_b = gen("ann", proj_b)
    check("switching projects swaps the context", "BETA-CONTEXT" in with_b and "ALPHA" not in with_b and "Alpha Farm CV" not in with_b)
    check("only relevant saved sections of the project are used", "BETA-NOTE" in with_b and "BETA-UNRELATED" not in with_b)

    r, prompt = gen("ann", proj_a, "regenerate")
    check("regenerate for a project needs no extra words", r.status_code == 200 and "Do not reuse any earlier draft" in prompt and "ALPHA-CONTEXT" in prompt, r.text[:120])
    r, prompt = gen("ann", proj_a, "regenerate", context="Focus on class imbalance")
    check("regenerate keeps the project and adds the learner's instructions", "ALPHA-CONTEXT" in prompt and "Focus on class imbalance" in prompt)
    r, _ = gen("ann", None, "regenerate")
    check("general regenerate with nothing to say is still refused", r.status_code == 422)

    gen("ann", proj_a)  # page now holds a body written for A
    before_sections = call("ann", "GET", f"/{proj_a}/sections").json()["sections"]
    r, prompt = gen("ann", proj_a, "update", context="shorter please", existing="A-DRAFT-BODY written for alpha")
    check("update under the same project revises the draft", r.status_code == 200 and "CURRENT CONTENT" in prompt and "A-DRAFT-BODY" in prompt)
    gen("ann", proj_a)
    r, prompt = gen("ann", proj_b, "update", context="shorter please", existing="A-DRAFT-BODY written for alpha")
    check("update under another project does not carry the old draft over", r.status_code == 200 and "A-DRAFT-BODY" not in prompt and "CURRENT CONTENT" not in prompt and "BETA-CONTEXT" in prompt and r.json()["mode"] == "regenerate", prompt[-300:])
    gen("ann", proj_a)
    r, prompt = gen("ann", None, "update", context="shorter please", existing="A-DRAFT-BODY written for alpha")
    check("a general update does not carry a project draft over either", r.status_code == 200 and "A-DRAFT-BODY" not in prompt and "ALPHA" not in prompt)
    r, prompt = gen("ann", proj_a, "update", context="more detail", existing="TEMPLATE-BODY generic", section="other")
    check("a template page (nothing stored) can still be revised for a project", "TEMPLATE-BODY" in prompt and "ALPHA-CONTEXT" in prompt)
    after_sections = call("ann", "GET", f"/{proj_a}/sections").json()["sections"]
    check("regenerating lab pages never changes saved project sections", before_sections == after_sections)

    r, _ = gen("bob", proj_a)
    check("someone else's project is 404 for generation", r.status_code == 404)
    r, _ = gen("ann", 999999)
    check("unknown project is 404 for generation", r.status_code == 404)
    call("ann", "PATCH", f"/{proj_b}", json={"status": "archived"})
    r, _ = gen("ann", proj_b)
    check("archived project is refused for generation", r.status_code == 409)
    call("ann", "PATCH", f"/{proj_b}", json={"status": "active"})
    zero = lab_call("ann", "POST", "/generate", json={"lab": "cv", "topic_id": "t", "topic_name": "T", "section_id": "s", "section_label": "S", "mode": "generate", "project_id": 0})
    check("project_id 0 is rejected", zero.status_code == 422)
    for odd in (True, "1", 1.0, "abc", -3):
        r = lab_call("ann", "POST", "/generate", json={"lab": "cv", "topic_id": "t", "topic_name": "T", "section_id": "s", "section_label": "S", "mode": "generate", "project_id": odd})
        check(f"project_id {odd!r} is rejected (JSON integers only)", r.status_code == 422, r.text[:100])

    # quiz
    def quiz(who: str, project_id=None):
        body = {"lab": "dsa", "topic_id": "arrays", "topic_name": "Arrays and leaf datasets training", "topic_brief": "", "category": "", "count": 4}
        if project_id is not None:
            body["project_id"] = project_id
        prompts.clear()
        r = lab_call(who, "POST", "/quiz/generate", json=body)
        return r, (prompts[-1] if prompts else "")

    r, qp = quiz("ann")
    check("general quiz works without project text", r.status_code == 200 and "Project rules" not in qp and "ALPHA" not in qp)
    general_q = r.json()["questions"][0]["q"]
    r, qp = quiz("ann", proj_a)
    check("quiz under a project carries its context and rules", r.status_code == 200 and "ALPHA-CONTEXT" in qp and "Project rules" in qp, r.text[:120])
    check("quiz under a project still sees project-less questions as already seen", general_q in qp)
    a_q = r.json()["questions"][0]["q"]
    r, qp = quiz("ann", proj_b)
    check("another project's quiz never sees this project's questions", a_q not in qp and "ALPHA" not in qp and "BETA-CONTEXT" in qp)
    r, qp = quiz("ann")
    check("a general quiz never sees project questions", a_q not in qp and general_q in qp)
    check("the page's quiz still lists every question", len(lab_call("ann", "GET", "/quiz", params={"lab": "dsa", "topic_id": "arrays", "subtopic_id": ""}).json()["questions"]) == 16)
    r, _ = quiz("bob", proj_a)
    check("quiz with someone else's project is 404", r.status_code == 404)

    # deleting a project: lab pages keep their text, and it is never revised under another project
    stored = lab_call("ann", "GET", "", params={"lab": "cv", "topic_id": "transfer", "subtopic_id": ""}).json()["sections"]["approaches"]
    gen("ann", proj_a)
    check("deleted-project check setup", lab_call("ann", "GET", "", params={"lab": "cv", "topic_id": "transfer", "subtopic_id": ""}).json()["sections"]["approaches"]["projectId"] == proj_a)
    call("ann", "DELETE", f"/{proj_a}")
    kept = lab_call("ann", "GET", "", params={"lab": "cv", "topic_id": "transfer", "subtopic_id": ""}).json()["sections"]["approaches"]
    check("a lab page keeps its text when its project is deleted", bool(kept["content"]) and kept["projectId"] == proj_a)
    r, prompt = gen("ann", proj_b, "update", context="x", existing=kept["content"])
    check("and that text is not revised for another project", "CURRENT CONTENT" not in prompt)
    call("ann", "DELETE", f"/{proj_b}")

    # ── Delete policy ────────────────────────────────────────────────────────
    r = call("ann", "DELETE", f"/{pid}/sections/{s3['id']}")
    check("section delete works", r.status_code == 200 and call("ann", "GET", f"/{pid}/sections/{s3['id']}").status_code == 404)
    check("deleting twice is 404", call("ann", "DELETE", f"/{pid}/sections/{s3['id']}").status_code == 404)
    r = call("ann", "DELETE", f"/{pid}")
    check("project delete reports the sections it removed", r.status_code == 200 and r.json()["deletedSections"] == 2, r.text)
    check("deleted project is gone", call("ann", "GET", f"/{pid}").status_code == 404)
    raw = sqlite3.connect(db_copy)
    orphans = raw.execute("SELECT COUNT(*) FROM lab_project_sections WHERE project_id = ?", (pid,)).fetchone()[0]
    other = raw.execute("SELECT COUNT(*) FROM lab_projects WHERE id = ?", (bid,)).fetchone()[0]
    raw.close()
    check("no orphaned sections remain", orphans == 0)
    check("other users' projects survive", other == 1 and call("bob", "GET", f"/{bid}").status_code == 200)

# A new client = a fresh app lifespan: what was saved before is still there.
with TestClient(app) as client2:
    r = client2.get("/lab-projects", headers={"Authorization": f"Bearer {tokens['bob']}"})
    check("data survives an app restart", r.status_code == 200 and [p["name"] for p in r.json()["projects"]] == ["Bob's Chatbot"])

print()
print("FAILED:" if failures else "All checks passed.", *failures, sep="\n" if failures else " ")
sys.exit(1 if failures else 0)
