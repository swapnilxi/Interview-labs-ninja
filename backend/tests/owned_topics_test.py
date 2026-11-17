"""Who sees a lab topic, in every lab (DSA, CV, System Design, Communication, Finance, Python, GenAI): the shared topics plus a person's
own, a person's own version of a shared topic, admin-only sharing, removing, resetting, and the patterns/categories a person adds.

Runs the real lab routers in a small FastAPI app (no `main`, so any Python with FastAPI works) against a COPY of the real database
(never the live file); the signed-in user is swapped per request:
    cd backend && uv run python tests/owned_topics_test.py
Exits non-zero if any check fails. The rules live in modules/common/owned_topics.py; the Next.js twin is fe-apis/labs/index.ts.
"""
import os, sys, sqlite3, tempfile
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[1])
sys.path.insert(0, ROOT)
scratch = tempfile.mkdtemp(prefix="owned-")
db = os.path.join(scratch, "lab.sqlite3")
src = sqlite3.connect(os.path.join(ROOT, "data", "lab_ninja.sqlite3")); dst = sqlite3.connect(db); src.backup(dst); src.close(); dst.close()
os.environ["LABNINJA_TEST_DB_PATH"] = db

from fastapi import FastAPI
from fastapi.testclient import TestClient
from modules.auth.dependencies import get_current_user_id

# migrate the copy the way init_db does for these labs
conn = sqlite3.connect(db); cur = conn.cursor()
for mod in ["dsa_lab", "cv_lab", "system_design_lab", "communication_lab", "finance_lab", "python_lab", "genai_lab"]:
    __import__(f"modules.{mod}.schema", fromlist=["register"]).register(cur)
conn.commit(); conn.close()

from modules.dsa_lab.router import router as dsa
from modules.cv_lab.router import router as cv
from modules.system_design_lab.router import router as sd
from modules.communication_lab.router import router as comm
from modules.finance_lab.router import router as fin
from modules.python_lab.router import router as py
from modules.genai_lab.router import router as gen

app = FastAPI()
for r in (dsa, cv, sd, comm, fin, py, gen):
    app.include_router(r)
CURRENT = [0]
app.dependency_overrides[get_current_user_id] = lambda: CURRENT[0]
c = TestClient(app)

_c = sqlite3.connect(db)
ADMIN = _c.execute("SELECT id FROM users WHERE role = 'superadmin' ORDER BY id LIMIT 1").fetchone()[0]
U1, U2 = [r[0] for r in _c.execute("SELECT id FROM users WHERE role = 'user' ORDER BY id LIMIT 2").fetchall()]
_c.close()
fails = []
def check(name, ok, extra=""):
    print("PASS" if ok else "FAIL", name, "" if ok else extra)
    if not ok: fails.append(name)
def as_(u): CURRENT[0] = u

LABS = {  # prefix -> body builder
    "/dsa": "std", "/cv": "std", "/communication": "std", "/finance": "std", "/python": "std", "/genai": "std",
    "/system-design": "sd",
}
def body(kind, tid, name, category, **kw):
    b = {"id": tid, "name": name, "brief": "b", "category": category, "difficulty": "Medium", "subtopics": []}
    if kind == "std": b["prerequisites"] = []
    else: b.update({"scale": "Large", "isLLD": True}); b.pop("difficulty"); b["difficulty"] = "Hard"
    b.update(kw); return b

for prefix, kind in LABS.items():
    tag = prefix
    as_(U1)
    topics = c.get(f"{prefix}/topics").json()
    check(f"{tag} lists topics", len(topics) > 0, str(len(topics)))
    check(f"{tag} seed topics are shared and unmodified", all(t["isShared"] is True and t["isModified"] is False for t in topics))
    seed = topics[0]
    other_cat = next(t["category"] for t in topics if t["category"] != seed["category"])

    # a user's own new topic
    tid = f"custom-own-{abs(hash(prefix))%10000}"
    r = c.post(f"{prefix}/topics", json=body(kind, tid, "Mine", seed["category"]))
    check(f"{tag} user adds a topic", r.status_code == 200, r.text)
    mine = [t for t in c.get(f"{prefix}/topics").json() if t["id"] == tid]
    check(f"{tag} own topic: custom, not shared", len(mine) == 1 and mine[0]["isCustom"] and mine[0]["isShared"] is False)
    if kind == "sd": check(f"{tag} keeps scale and isLLD", mine[0].get("scale") == "Large" and mine[0].get("isLLD") is True, str(mine[0]))
    as_(U2); check(f"{tag} another user does not see it", all(t["id"] != tid for t in c.get(f"{prefix}/topics").json()))
    as_(ADMIN); check(f"{tag} not even an admin sees it", all(t["id"] != tid for t in c.get(f"{prefix}/topics").json()))
    as_(U2); r = c.post(f"{prefix}/topics", json=body(kind, tid, "Hijack", seed["category"]))
    check(f"{tag} another user cannot change it", r.status_code == 403 and "another user" in r.text, r.text)
    r = c.delete(f"{prefix}/topics", params={"topic_id": tid}); check(f"{tag} another user cannot remove it", r.status_code == 403, r.text)

    # move within own topic: stays in its place
    as_(U1)
    r = c.post(f"{prefix}/topics", json=body(kind, tid, "Mine", other_cat))
    check(f"{tag} own topic moves", r.status_code == 200 and [t["category"] for t in c.get(f"{prefix}/topics").json() if t["id"] == tid] == [other_cat], r.text)

    # a user changing a seed topic only changes their own view
    moved = dict(seed); moved["category"] = other_cat
    full = body(kind, seed["id"], seed["name"], other_cat)
    full["brief"] = seed["brief"]
    full["difficulty"] = seed["difficulty"]
    if kind == "std": full["prerequisites"] = seed.get("prerequisites", []); 
    else: full["scale"] = seed.get("scale", "N/A"); full["isLLD"] = seed.get("isLLD", False)
    full["subtopics"] = seed["subtopics"]
    r = c.post(f"{prefix}/topics", json=full)
    mine_seed = [t for t in c.get(f"{prefix}/topics").json() if t["id"] == seed["id"]][0]
    check(f"{tag} user moves a seed topic for themself", r.status_code == 200 and mine_seed["category"] == other_cat and mine_seed["isModified"] is True and mine_seed["isShared"] is True, r.text + str(mine_seed))
    as_(U2); theirs = [t for t in c.get(f"{prefix}/topics").json() if t["id"] == seed["id"]][0]
    check(f"{tag} others still see the shared one", theirs["category"] == seed["category"] and theirs["isModified"] is False)
    as_(U1); r = c.delete(f"{prefix}/topics", params={"topic_id": seed["id"]})
    again = [t for t in c.get(f"{prefix}/topics").json() if t["id"] == seed["id"]][0]
    check(f"{tag} reset drops the user's version", r.status_code == 200 and again["category"] == seed["category"] and again["isModified"] is False, r.text)

    # sharing is admin-only
    full2 = body(kind, tid, "Mine", other_cat, shared=True)
    r = c.post(f"{prefix}/topics", json=full2)
    check(f"{tag} a user cannot share", r.status_code == 403 and "admin" in r.text, r.text)
    as_(ADMIN); sid = tid + "-all"
    r = c.post(f"{prefix}/topics", json=body(kind, sid, "For everyone", seed["category"], shared=True))
    check(f"{tag} admin adds a shared topic", r.status_code == 200, r.text)
    as_(U2); s2 = [t for t in c.get(f"{prefix}/topics").json() if t["id"] == sid]
    check(f"{tag} everyone sees it, shared and custom", len(s2) == 1 and s2[0]["isShared"] and s2[0]["isCustom"], str(s2))
    r = c.delete(f"{prefix}/topics", params={"topic_id": sid}); check(f"{tag} a user cannot remove a shared topic", r.status_code == 403 and "admin" in r.text, r.text)
    as_(ADMIN); r = c.delete(f"{prefix}/topics", params={"topic_id": sid}); check(f"{tag} an admin removes it", r.status_code == 200, r.text)
    as_(U2); check(f"{tag} gone for everyone", all(t["id"] != sid for t in c.get(f"{prefix}/topics").json()))

    # remove own; seed cannot be removed
    as_(U1); r = c.delete(f"{prefix}/topics", params={"topic_id": tid}); check(f"{tag} user removes own topic", r.status_code == 200, r.text)
    check(f"{tag} removed", all(t["id"] != tid for t in c.get(f"{prefix}/topics").json()))
    r = c.delete(f"{prefix}/topics", params={"topic_id": "nope"}); check(f"{tag} unknown id is 404", r.status_code == 404, r.text)
    r = c.delete(f"{prefix}/topics", params={"topic_id": seed["id"]}); check(f"{tag} deleting an unchanged seed topic is a harmless reset", r.status_code == 200 and any(t["id"] == seed["id"] for t in c.get(f"{prefix}/topics").json()), r.text)

    # patterns / categories: own only
    r = c.post(f"{prefix}/sections", json={"name": f"Custom {prefix}"}); check(f"{tag} user adds a group", r.status_code == 200, r.text)
    names = [s["name"] for s in c.get(f"{prefix}/sections").json()]
    check(f"{tag} group listed", f"Custom {prefix}" in names)
    as_(U2); check(f"{tag} not visible to another user", f"Custom {prefix}" not in [s["name"] for s in c.get(f"{prefix}/sections").json()])
    r = c.delete(f"{prefix}/sections", params={"name": f"Custom {prefix}"}); check(f"{tag} another user cannot remove it", r.status_code == 404, r.text)
    as_(U1); r = c.delete(f"{prefix}/sections", params={"name": f"Custom {prefix}"}); check(f"{tag} user removes it", r.status_code == 200, r.text)
    seed_group = next(s["name"] for s in c.get(f"{prefix}/sections").json() if not s["isCustom"])
    r = c.delete(f"{prefix}/sections", params={"name": seed_group}); check(f"{tag} a seeded group stays", r.status_code == 404, r.text)

print("\nFAILED:" if fails else "\nALL PASSED", fails)
sys.exit(1 if fails else 0)
