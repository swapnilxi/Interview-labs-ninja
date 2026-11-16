"""Video-link check for AI LMS (classes, subjects, project modules) and the labs (standalone, like the other
backend/tests scripts).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/videos_test.py
Exits non-zero if any check fails.

Two parts:
  1. The data layer (modules/common/video_links.py, modules/ai_lms/videos.py, modules/lab_sections/videos.py): no
     FastAPI import, so it also runs with a bare interpreter (`python3.10 -I tests/videos_test.py` without fastapi
     installed runs only this part). It covers the link rules, the limits, ordering, the cascades and the outline.
  2. The HTTP layer (role gate, status codes, texts), which needs FastAPI.
The Next.js twins are frontend/fe-apis/lms/videos.ts and frontend/fe-apis/labSections/videos.ts; the same cases were run
against them on a scratch dev server, and the shared URL rules are compared case by case in both languages.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

scratch = tempfile.mkdtemp(prefix="videos-")
DB = Path(scratch) / "lab.sqlite3"
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", DB)
os.environ["LABNINJA_TEST_DB_PATH"] = str(DB)
os.environ["LMS_CLASSES_DIR"] = str(Path(scratch) / "classes")
os.environ["LABNINJA_SUPERADMIN_EMAILS"] = "superadmin@videos.test"

from modules.ai_lms import db as lms_db  # noqa: E402
from modules.ai_lms import videos as lms_videos  # noqa: E402
from modules.common import video_links as vl  # noqa: E402
from modules.lab_sections import videos as lab_videos  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(("PASS" if ok else "FAIL"), name, extra)
    if not ok:
        failures.append(name)


def raises(fn, status: int, detail: str | None = None) -> bool:
    try:
        fn()
    except vl.VideoError as err:
        return err.status_code == status and (detail is None or err.detail == detail)
    return False


def count(sql: str, *params) -> int:
    conn = sqlite3.connect(DB)
    try:
        return conn.execute(sql, params).fetchone()[0]
    finally:
        conn.close()


YT = "dQw4w9WgXcQ"
PL = "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"

# ── 1. The link rules ──────────────────────────────────────────────────────────

VALID = [
    f"https://www.youtube.com/watch?v={YT}",
    f"https://youtu.be/{YT}?t=90",
    f"https://www.youtube.com/shorts/{YT}",
    f"https://www.youtube.com/live/{YT}",
    f"https://www.youtube.com/embed/{YT}",
    f"https://m.youtube.com/watch?v={YT}",
    f"https://music.youtube.com/watch?v={YT}&list=RDAMVM{YT}",
    f"https://www.youtube.com/playlist?list={PL}",
    f"https://www.youtube.com/watch?v={YT}&list={PL}&index=3",
    f"https://youtu.be/{YT}?list={PL}",
    f"https://youtu.be/{YT}?t=1m30s",
    f"https://www.youtube.com/watch?v={YT}&t=1h2m3s",
    "https://vimeo.com/123456789/abcdef1234",
    "https://player.vimeo.com/video/123456789?h=abcdef1234",
    "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
    "https://example.com/lesson.MP4?token=abc",
    "http://example.com",
    "HTTPS://EXAMPLE.COM/Video",
    "https://example.com:8443/v.mp4",
    "https://a.co/" + "\U0001F600" * 487,  # exactly 500 characters
]
INVALID = [
    "javascript:alert(1)",
    "//example.com/v",
    "https://exa mple.com",
    "https://user:pass@example.com/v",
    "ftp://example.com/v.mp4",
    "",
    "   ",
    "https://",
    "https://example.com:0",
    "https://example.com:65536",
    "https://[::1]/v",
    "https://example.com/a\u200bb",
    "http\u017f://example.com",
    "youtu.be/" + YT,
    None,
    123,
]
check("valid links are accepted", all(not raises(lambda u=u: vl.clean_url(u), 422) for u in VALID))
check("invalid links get the plain message", all(raises(lambda u=u: vl.clean_url(u), 422, vl.URL_ERROR) for u in INVALID))
check("501 characters is too long", raises(lambda: vl.clean_url("https://a.co/" + "x" * 488), 422, vl.URL_TOO_LONG))
check("a link is trimmed", vl.clean_url("  https://example.com/a  ") == "https://example.com/a")
check("a title is tidied", vl.clean_title("  a \n b\t") == "a b" and vl.clean_title(None) == "")
check("a long title is refused", raises(lambda: vl.clean_title("x" * 121), 422, vl.TITLE_TOO_LONG))
check("a non-text title is refused", raises(lambda: vl.clean_title(5), 422, vl.TITLE_NOT_TEXT))

# ── 2. Class and subject links ─────────────────────────────────────────────────

lms_db.init_lms_db()
cls = lms_db.create_class("Videos Class", "throwaway")
subj = lms_db.create_subject(cls["id"], "Videos Subject")
proj = lms_db.create_subject(cls["id"], "Videos Project", kind="project", project_context="x")

first = lms_videos.add_video({"scope": "class", "ref": cls["id"], "url": VALID[0], "title": "Intro"}, 1)
check("add: row shape", set(first) == {"id", "url", "title", "order_index", "created_at"} and first["order_index"] == 0)
second = lms_videos.add_video({"scope": "class", "ref": cls["slug"], "url": VALID[7]}, 1)
check("add by class slug stores the class id", second["order_index"] == 1 and count("SELECT COUNT(*) FROM lms_videos WHERE ref = ?", cls["id"]) == 2)
check("list is in order", [v["url"] for v in lms_videos.list_videos("class", cls["id"])["videos"]] == [VALID[0], VALID[7]])
check("duplicate -> 409", raises(lambda: lms_videos.add_video({"scope": "class", "ref": cls["id"], "url": VALID[0]}, 1), 409, vl.DUPLICATE_ERROR))
check("bad scope -> 422", raises(lambda: lms_videos.list_videos("nope", cls["id"]), 422, lms_videos.SCOPE_ERROR))
check("missing ref -> 422", raises(lambda: lms_videos.add_video({"scope": "class", "url": VALID[0]}, 1), 422, lms_videos.REF_ERROR))
check("unknown class -> 404", raises(lambda: lms_videos.list_videos("class", "nope"), 404, "Class not found."))
check("unknown subject -> 404", raises(lambda: lms_videos.list_videos("subject", "nope"), 404, "Subject not found."))
check("bad url is checked before the item exists", raises(lambda: lms_videos.add_video({"scope": "class", "ref": "nope", "url": "x"}, 1), 422, vl.URL_ERROR))

upd = lms_videos.update_video(first["id"], {"title": "New title"})
check("patch title keeps the url", upd["title"] == "New title" and upd["url"] == VALID[0])
check("patch to a duplicate url -> 409", raises(lambda: lms_videos.update_video(first["id"], {"url": VALID[7]}), 409))
check("patch nothing -> 422", raises(lambda: lms_videos.update_video(first["id"], {}), 422, lms_videos.NOTHING_TO_CHANGE))
check("patch missing -> 404", raises(lambda: lms_videos.update_video(999999, {"title": "x"}), 404, "Video not found."))

reordered = lms_videos.reorder_videos({"scope": "class", "ref": cls["id"], "ids": [second["id"], 999999, second["id"]]})
check("reorder: listed first, unknown/repeated ignored", [v["id"] for v in reordered["videos"]] == [second["id"], first["id"]])
check("reorder: bad ids -> 422", raises(lambda: lms_videos.reorder_videos({"scope": "class", "ref": cls["id"], "ids": ["x"]}), 422))
check("reorder accepts whole floats like JSON 1.0", [v["id"] for v in lms_videos.reorder_videos({"scope": "class", "ref": cls["id"], "ids": [float(first["id"])]})["videos"]] == [first["id"], second["id"]])

for i in range(18):
    lms_videos.add_video({"scope": "class", "ref": cls["id"], "url": f"https://example.com/fill/{i}"}, 1)
check("20 videos fit", count("SELECT COUNT(*) FROM lms_videos WHERE scope = 'class' AND ref = ?", cls["id"]) == 20)
check("the 21st -> 422", raises(lambda: lms_videos.add_video({"scope": "class", "ref": cls["id"], "url": "https://example.com/21"}, 1), 422, vl.LIMIT_ERROR))
check("delete", lms_videos.delete_video(second["id"])["message"] == "Video removed")
check("delete again -> 404", raises(lambda: lms_videos.delete_video(second["id"]), 404))

lms_videos.add_video({"scope": "subject", "ref": subj["id"], "url": VALID[0]}, 1)
lms_videos.add_video({"scope": "subject", "ref": proj["id"], "url": VALID[1]}, 1)
check("a subject and a class do not share rows", count("SELECT COUNT(*) FROM lms_videos WHERE scope = 'subject'") >= 2)

# ── 3. Project modules: links live inside the outline ──────────────────────────

plan = [
    {"title": "A", "focus": "", "context": "", "lesson_id": None, "sublessons": [{"title": "A1", "focus": "", "context": "", "lesson_id": None, "sublessons": []}]},
    {"title": "B", "focus": "", "context": "", "lesson_id": None, "sublessons": []},
]
vids = [{"url": VALID[0], "title": "x"}, {"url": VALID[7], "title": ""}]
plan = lms_videos.set_plan_item_videos(plan, 1, None, vids)
plan = lms_videos.set_plan_item_videos(plan, 0, 0, [{"url": VALID[13], "title": "sub"}])
check("module links are stored on the module only", plan[1]["videos"] == vids and "videos" not in plan[0])
check("sub-step links are stored on the sub-step", plan[0]["sublessons"][0]["videos"][0]["title"] == "sub")
check("module out of range -> 404", raises(lambda: lms_videos.set_plan_item_videos(plan, 9, None, []), 404, lms_videos.MODULE_NOT_FOUND))
check("sub-step out of range -> 404", raises(lambda: lms_videos.set_plan_item_videos(plan, 0, 9, []), 404, lms_videos.SUBLESSON_NOT_FOUND))
check("not a list -> 422", raises(lambda: lms_videos.set_plan_item_videos(plan, 1, None, "x"), 422, lms_videos.LIST_ERROR))
check("an item says which video is wrong", raises(lambda: lms_videos.validate_video_list([{"url": VALID[0]}, {"url": "nope"}]), 422, f"Video 2: {vl.URL_ERROR}"))
check("duplicates in one list -> 409", raises(lambda: lms_videos.validate_video_list([{"url": VALID[0]}, {"url": VALID[0]}]), 409, vl.DUPLICATE_ERROR))
check("21 in a list -> 422", raises(lambda: lms_videos.validate_video_list([{"url": f"https://example.com/{i}"} for i in range(21)]), 422, vl.LIMIT_ERROR))

# A reorder moves the whole entry (its links with it), and reading the stored outline keeps the links.
plan.insert(0, plan.pop(1))
read_back = lms_db._parse_project_plan(json.dumps(plan), [])
check("reading the outline keeps the links through a reorder", read_back[0]["title"] == "B" and len(read_back[0]["videos"]) == 2)
check("reading the outline keeps sub-step links", read_back[1]["sublessons"][0]["videos"][0]["url"] == VALID[13])
check("every entry read back has a videos list", all(isinstance(m["videos"], list) and all(isinstance(s["videos"], list) for s in m["sublessons"]) for m in read_back))
stored = [{"title": "T", "videos": [{"url": "nope"}, {"url": VALID[0], "title": "ok"}, {"url": VALID[0]}, 5]}]
check("an invalid or repeated stored link is dropped on read", lms_db._parse_project_plan(json.dumps(stored), [])[0]["videos"] == [{"url": VALID[0], "title": "ok"}])

# ── 4. Deleting a subject or a class removes its links ─────────────────────────

lms_db.delete_subject(subj["id"])
check("deleting a subject removes its links", count("SELECT COUNT(*) FROM lms_videos WHERE scope = 'subject' AND ref = ?", subj["id"]) == 0)
check("other subjects keep theirs", count("SELECT COUNT(*) FROM lms_videos WHERE scope = 'subject' AND ref = ?", proj["id"]) == 1)
check("deleting the class removes everything under it", lms_db.delete_class(cls["id"]) is True
      and count("SELECT COUNT(*) FROM lms_videos WHERE ref IN (?, ?)", cls["id"], proj["id"]) == 0)

# ── 5. Lab page links are personal ─────────────────────────────────────────────

page = ("python", "python-setup", "")
a = lab_videos.add_video(7, *page, VALID[0], "Mine")
check("lab: add", a["url"] == VALID[0] and a["order_index"] == 0)
check("lab: the owner sees it", len(lab_videos.list_videos(7, *page)["videos"]) == 1)
check("lab: another user sees none", lab_videos.list_videos(8, *page)["videos"] == [])
check("lab: the subtopic page is separate", lab_videos.list_videos(7, "python", "python-setup", "py-install")["videos"] == [])
check("lab: duplicate -> 409", raises(lambda: lab_videos.add_video(7, *page, VALID[0], ""), 409, vl.DUPLICATE_ERROR))
check("lab: bad url -> 422", raises(lambda: lab_videos.add_video(7, *page, "nope", ""), 422, vl.URL_ERROR))
check("lab: another user cannot delete it (404)", raises(lambda: lab_videos.delete_video(8, a["id"]), 404, "Video not found."))
for i in range(19):
    lab_videos.add_video(7, *page, f"https://example.com/lab/{i}", "")
check("lab: the 21st -> 422", raises(lambda: lab_videos.add_video(7, *page, "https://example.com/lab/21", ""), 422, vl.LIMIT_ERROR))
check("lab: the owner deletes", lab_videos.delete_video(7, a["id"])["message"] == "Video removed")

# ── 6. The HTTP layer (needs FastAPI) ──────────────────────────────────────────

try:
    from fastapi.testclient import TestClient  # noqa: E402
    from main import app  # noqa: E402
    from modules.auth.db import promote_superadmins_from_env  # noqa: E402
except ImportError as exc:  # a bare interpreter: part 1 above is all that can run
    print(f"SKIP http checks ({exc})")
else:
    with TestClient(app) as client:
        tokens: dict[str, str] = {}
        ids: dict[str, int] = {}
        for role in ("user", "editor", "superadmin"):
            r = client.post("/auth/signup", json={"email": f"{role}@videos.test", "password": "Passw0rd!x"})
            tokens[role], ids[role] = r.json()["access_token"], r.json()["user"]["id"]
        promote_superadmins_from_env()
        client.patch(f"/admin/users/{ids['editor']}/role", headers={"Authorization": f"Bearer {tokens['superadmin']}"}, json={"role": "editor"})

        def call(method: str, path: str, role: str | None, **kw):
            headers = {"Authorization": f"Bearer {tokens[role]}"} if role else {}
            return client.request(method, path, headers=headers, **kw)

        c = call("POST", "/api/lms/classes", "editor", json={"name": "Http Videos"}).json()
        s = call("POST", f"/api/lms/classes/{c['slug']}/subjects", "editor", json={"name": "Http Subject"}).json()
        body = {"scope": "class", "ref": c["id"], "url": f"https://youtu.be/{YT}", "title": "Intro"}
        check("http: learner cannot add", call("POST", "/api/lms/videos", "user", json=body).status_code == 403)
        r = call("POST", "/api/lms/videos", "editor", json=body)
        check("http: editor adds (201)", r.status_code == 201 and r.json()["url"] == body["url"])
        vid = r.json()["id"]
        check("http: learner reads", call("GET", f"/api/lms/videos?scope=class&ref={c['slug']}", "user").json()["videos"][0]["id"] == vid)
        check("http: guest gets 401/403", call("GET", f"/api/lms/videos?scope=class&ref={c['slug']}", None).status_code in (401, 403))
        check("http: learner cannot patch", call("PATCH", f"/api/lms/videos/{vid}", "user", json={"title": "x"}).status_code == 403)
        check("http: learner cannot delete", call("DELETE", f"/api/lms/videos/{vid}", "user").status_code == 403)
        check("http: learner cannot reorder", call("POST", "/api/lms/videos/reorder", "user", json={"scope": "class", "ref": c["id"], "ids": [vid]}).status_code == 403)
        r = call("POST", "/api/lms/videos", "editor", json={**body, "url": "javascript:alert(1)"})
        check("http: bad url -> 422 with the plain message", r.status_code == 422 and r.json()["detail"] == vl.URL_ERROR)
        r = call("POST", "/api/lms/videos", "editor", json=body)
        check("http: duplicate -> 409", r.status_code == 409 and r.json()["detail"] == vl.DUPLICATE_ERROR)
        check("http: patch title", call("PATCH", f"/api/lms/videos/{vid}", "editor", json={"title": "New"}).json()["title"] == "New")
        p = call("POST", f"/api/lms/classes/{c['slug']}/subjects", "editor", json={"name": "Http Project", "kind": "project", "project_context": "x"}).json()
        call("POST", f"/api/lms/projects/{p['id']}/steps", "editor", json={"title": "Module A", "position": 0})
        r = call("PUT", f"/api/lms/projects/{p['id']}/modules/0/videos", "editor", json={"videos": [{"url": body["url"], "title": "m"}]})
        check("http: module PUT answers with the project and its links", r.status_code == 200 and r.json()["project_plan"][0]["videos"][0]["title"] == "m")
        check("http: learner cannot PUT module links", call("PUT", f"/api/lms/projects/{p['id']}/modules/0/videos", "user", json={"videos": []}).status_code == 403)
        check("http: module PUT out of range -> 404", call("PUT", f"/api/lms/projects/{p['id']}/modules/9/videos", "editor", json={"videos": []}).status_code == 404)
        check("http: delete", call("DELETE", f"/api/lms/videos/{vid}", "editor").status_code == 200)
        check("http: delete again -> 404", call("DELETE", f"/api/lms/videos/{vid}", "editor").status_code == 404)

        lab = {"lab": "python", "topic_id": "python-setup", "subtopic_id": "", "url": f"https://youtu.be/{YT}"}
        r = call("POST", "/lab-sections/videos", "user", json=lab)
        check("http: lab video added by a learner (201)", r.status_code == 201)
        lab_id = r.json()["id"]
        q = "/lab-sections/videos?lab=python&topic_id=python-setup&subtopic_id="
        check("http: the owner sees it", len(call("GET", q, "user").json()["videos"]) == 1)
        check("http: another user does not", call("GET", q, "editor").json()["videos"] == [])
        check("http: another user cannot delete it", call("DELETE", f"/lab-sections/videos/{lab_id}", "editor").status_code == 404)
        check("http: duplicate -> 409", call("POST", "/lab-sections/videos", "user", json=lab).status_code == 409)
        check("http: the owner deletes", call("DELETE", f"/lab-sections/videos/{lab_id}", "user").status_code == 200)
        check("http: deleting the class removes its links", call("DELETE", f"/api/lms/classes/{c['slug']}", "editor").status_code == 200)

print(f"\n{len(failures)} failed")
sys.exit(1 if failures else 0)
