"""Video-link check for AI LMS (classes, subjects, project modules) and the labs (standalone, like the other
backend/tests scripts).

Runs against a COPY of the real database (never the live file):
    cd backend && uv run python tests/videos_test.py
Exits non-zero if any check fails.

Lab links also carry an admin's preview image and card shape, an "everyone" audience and `PATCH`, and a lab page has an
AI-written video script (modules/lab_sections/video_script.py); both are covered here (the script against a mocked model).

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


# ── 5b. Lab links: preview image, shape, audience, PATCH (an admin's controls) ─────────────────────────────────

B64 = "A" * 64  # a valid (if meaningless) base64 payload, a multiple of 4
check("shape: not sent stays None", vl.clean_shape(None) is None)
check("shape: the three shapes", [vl.clean_shape(x) for x in ("wide", "side", "slim")] == ["wide", "side", "slim"])
check("shape: anything else -> 422", all(raises(lambda v=v: vl.clean_shape(v), 422, vl.SHAPE_ERROR) for v in ("round", "Wide", "", 1, True, ["wide"])))
check("preview: not sent or empty is ''", vl.clean_preview_image(None) == "" and vl.clean_preview_image("") == "" and vl.clean_preview_image("   ") == "")
check("preview: an https link", vl.clean_preview_image("  https://example.com/a.jpg?x=1 ") == "https://example.com/a.jpg?x=1")
check("preview: https links need no extension", vl.clean_preview_image("HTTPS://Example.com/img") == "HTTPS://Example.com/img")
check("preview: image data URLs of the four types", all(vl.clean_preview_image(f"data:image/{t};base64,{B64}") for t in ("jpeg", "png", "webp", "gif")))
check("preview: refused", all(raises(lambda v=v: vl.clean_preview_image(v), 422, vl.PREVIEW_ERROR) for v in [
    "http://example.com/a.jpg", "javascript:alert(1)", "//example.com/a.jpg", "ftp://example.com/a.jpg", "data:text/html;base64,AAAA",
    "data:image/svg+xml;base64,AAAA", f"data:image/png;base64,{B64}A", "data:image/png;base64,", "data:image/png;base64,AA AA",
    "data:image/png,AAAA", "https://exa mple.com/a.jpg", "https://user:pass@example.com/a.jpg", "https://example.com:0/a.jpg",
    "https://example.com:65536/a.jpg", "https://", "example.com/a.jpg", 5, True, ["https://example.com"],
]))
check("preview: an https link of 501 characters is too long", raises(lambda: vl.clean_preview_image("https://a.co/" + "x" * 488), 422, vl.PREVIEW_URL_TOO_LONG))
check("preview: exactly 200 KB of image fits", bool(vl.clean_preview_image("data:image/jpeg;base64," + "A" * vl.PREVIEW_PAYLOAD_MAX)))
check("preview: one base64 group more is too big", raises(lambda: vl.clean_preview_image("data:image/jpeg;base64," + "A" * (vl.PREVIEW_PAYLOAD_MAX + 4)), 422, vl.PREVIEW_TOO_BIG))
check("preview cap is 273068 base64 characters", vl.PREVIEW_PAYLOAD_MAX == 273068)

# A table made before preview images and shapes existed gets the two columns, and keeps its rows.
old_conn = sqlite3.connect(":memory:")
old_conn.execute("CREATE TABLE lab_page_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, lab_name TEXT NOT NULL, topic_id TEXT NOT NULL, subtopic_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', order_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)")
old_conn.execute("INSERT INTO lab_page_videos (user_id, lab_name, topic_id, url, created_at) VALUES (1, 'cv', 't', 'https://example.com/x', 'now')")
lab_videos.ensure_table(old_conn.cursor())
cols = {r[1]: r for r in old_conn.execute("PRAGMA table_info(lab_page_videos)")}
check("migration adds preview_image and shape", "preview_image" in cols and "shape" in cols)
check("migration keeps the old row with the defaults", old_conn.execute("SELECT preview_image, shape FROM lab_page_videos").fetchone() == ("", "wide"))
lab_videos.ensure_table(old_conn.cursor())
check("migration is idempotent", len(list(old_conn.execute("PRAGMA table_info(lab_page_videos)"))) == len(cols))
old_conn.close()

ADMIN, ADMIN2, LEARNER, LEARNER2 = 900001, 900002, 900003, 900004
_real_is_admin = lab_videos._is_admin
lab_videos._is_admin = lambda uid: uid in (ADMIN, ADMIN2)  # the roles the HTTP part below uses for real
pg = ("cv", "image-basics", "")
IMG = "https://example.com/preview.jpg"
DATA = "data:image/jpeg;base64," + B64

mine = lab_videos.add_video(LEARNER, *pg, "https://example.com/mine", "Mine")
check("learner add: defaults are no image and the wide shape", mine["preview_image"] == "" and mine["shape"] == "wide" and mine["shared"] is False)
check("learner add with a preview image -> 403", raises(lambda: lab_videos.add_video(LEARNER, *pg, "https://example.com/p", "", preview_raw=IMG), 403, lab_videos.NOT_ADMIN_LOOK))
check("learner add with a shape -> 403 (even the default)", raises(lambda: lab_videos.add_video(LEARNER, *pg, "https://example.com/p", "", shape_raw="wide"), 403, lab_videos.NOT_ADMIN_LOOK))
check("learner add for everyone -> 403", raises(lambda: lab_videos.add_video(LEARNER, *pg, "https://example.com/p", "", shared=True), 403, lab_videos.NOT_ADMIN_SHARE))
check("bad shape is a 422 before the admin check", raises(lambda: lab_videos.add_video(LEARNER, *pg, "https://example.com/p", "", shape_raw="round"), 422, vl.SHAPE_ERROR))
check("bad preview is a 422 before the admin check", raises(lambda: lab_videos.add_video(LEARNER, *pg, "https://example.com/p", "", preview_raw="http://example.com/a.jpg"), 422, vl.PREVIEW_ERROR))
check("an empty preview from a learner is 'not sent'", lab_videos.add_video(LEARNER, *pg, "https://example.com/e", "", preview_raw="")["preview_image"] == "")
check("nothing was stored by the refused adds", len(lab_videos.list_videos(LEARNER, *pg)["videos"]) == 2)

own = lab_videos.add_video(ADMIN, *pg, "https://example.com/admin-own", "Admin own", preview_raw=DATA, shape_raw="side")
check("admin add: image and shape are stored", own["preview_image"] == DATA and own["shape"] == "side" and own["shared"] is False)
check("admin's own link is private to the admin", all(v["id"] != own["id"] for v in lab_videos.list_videos(LEARNER, *pg)["videos"]))
shared = lab_videos.add_video(ADMIN, *pg, "https://example.com/everyone", "For all", True, IMG, "slim")
check("admin add for everyone: shared with its image and shape", shared["shared"] is True and shared["preview_image"] == IMG and shared["shape"] == "slim")
seen = lab_videos.list_videos(LEARNER, *pg)["videos"]
check("a learner sees the shared link, first", seen[0]["id"] == shared["id"] and seen[0]["shared"] is True and seen[0]["shape"] == "slim")
check("a second learner sees it too", any(v["id"] == shared["id"] for v in lab_videos.list_videos(LEARNER2, *pg)["videos"]))
check("a learner cannot delete a shared link (404)", raises(lambda: lab_videos.delete_video(LEARNER, shared["id"]), 404, "Video not found."))
check("a learner cannot delete another user's private link (404)", raises(lambda: lab_videos.delete_video(LEARNER2, mine["id"]), 404, "Video not found."))
check("a learner cannot add a duplicate of a shared link (409)", raises(lambda: lab_videos.add_video(LEARNER, *pg, "https://example.com/everyone", ""), 409, vl.DUPLICATE_ERROR))

# PATCH
check("patch: nothing sent -> 422", raises(lambda: lab_videos.update_video(LEARNER, mine["id"]), 422, lab_videos.NOTHING_TO_CHANGE))
check("patch: the owner edits the title", lab_videos.update_video(LEARNER, mine["id"], title_raw="  New  title ")["title"] == "New title")
check("patch: a title of '' clears it", lab_videos.update_video(LEARNER, mine["id"], title_raw="")["title"] == "")
check("patch: a learner's preview image -> 403", raises(lambda: lab_videos.update_video(LEARNER, mine["id"], preview_raw=IMG), 403, lab_videos.NOT_ADMIN_PATCH))
check("patch: a learner's shape -> 403", raises(lambda: lab_videos.update_video(LEARNER, mine["id"], shape_raw="side"), 403, lab_videos.NOT_ADMIN_PATCH))
check("patch: a learner's shared -> 403", raises(lambda: lab_videos.update_video(LEARNER, mine["id"], shared_raw=True), 403, lab_videos.NOT_ADMIN_PATCH))
check("patch: a learner's empty preview is still 'sent' -> 403", raises(lambda: lab_videos.update_video(LEARNER, mine["id"], preview_raw=""), 403, lab_videos.NOT_ADMIN_PATCH))
check("patch: someone else's private link -> 404 (learner and admin)", raises(lambda: lab_videos.update_video(LEARNER2, mine["id"], title_raw="x"), 404, "Video not found.") and raises(lambda: lab_videos.update_video(ADMIN, mine["id"], title_raw="x"), 404, "Video not found."))
check("patch: a learner cannot touch a shared link (404)", raises(lambda: lab_videos.update_video(LEARNER, shared["id"], title_raw="x"), 404, "Video not found."))
check("patch: a missing id -> 404", raises(lambda: lab_videos.update_video(ADMIN, 99999999, title_raw="x"), 404, "Video not found."))
check("patch: bad shape -> 422", raises(lambda: lab_videos.update_video(ADMIN, own["id"], shape_raw="round"), 422, vl.SHAPE_ERROR))
check("patch: bad preview -> 422", raises(lambda: lab_videos.update_video(ADMIN, own["id"], preview_raw="javascript:alert(1)"), 422, vl.PREVIEW_ERROR))
check("patch: shared must be a boolean -> 422", all(raises(lambda v=v: lab_videos.update_video(ADMIN, own["id"], shared_raw=v), 422, vl.SHARED_ERROR) for v in ("true", 1, [])))
check("patch: a long title -> 422", raises(lambda: lab_videos.update_video(ADMIN, own["id"], title_raw="x" * 121), 422, vl.TITLE_TOO_LONG))
check("patch: a refused patch changed nothing", lab_videos.list_videos(ADMIN, *pg)["videos"][1]["shape"] == "side")
upd = lab_videos.update_video(ADMIN, own["id"], shape_raw="wide", preview_raw=IMG)
check("patch: admin sets shape and image", upd["shape"] == "wide" and upd["preview_image"] == IMG and upd["url"] == "https://example.com/admin-own")
check("patch: admin removes the image with ''", lab_videos.update_video(ADMIN, own["id"], preview_raw="")["preview_image"] == "")
check("patch: admin edits a shared link (another admin too)", lab_videos.update_video(ADMIN2, shared["id"], shape_raw="wide", title_raw="Everyone")["title"] == "Everyone")
check("patch: the change shows to a learner", lab_videos.list_videos(LEARNER, *pg)["videos"][0]["shape"] == "wide")

# audience changes
to_all = lab_videos.update_video(ADMIN, own["id"], shared_raw=True)
check("patch: admin shares their own link", to_all["shared"] is True and any(v["id"] == own["id"] for v in lab_videos.list_videos(LEARNER, *pg)["videos"]))
check("patch: the shared bucket keeps order (appended)", to_all["order_index"] > shared["order_index"])
back = lab_videos.update_video(ADMIN, own["id"], shared_raw=False)
check("patch: admin makes it private again (theirs)", back["shared"] is False and all(v["id"] != own["id"] for v in lab_videos.list_videos(LEARNER, *pg)["videos"]))
check("patch: sharing what is already shared changes nothing else", lab_videos.update_video(ADMIN, shared["id"], shared_raw=True)["order_index"] == shared["order_index"])
lab_videos.add_video(ADMIN, *pg, "https://example.com/dup", "", False)
lab_videos.add_video(ADMIN2, *pg, "https://example.com/dup", "", True)
dup_own = [v for v in lab_videos.list_videos(ADMIN, *pg)["videos"] if v["url"] == "https://example.com/dup" and not v["shared"]]
check("an admin's private copy of a shared link exists (added before it was shared)", len(dup_own) == 1)
check("patch: sharing a duplicate of a shared link -> 409", raises(lambda: lab_videos.update_video(ADMIN, dup_own[0]["id"], shared_raw=True), 409, vl.DUPLICATE_ERROR))

pg2 = ("finance", "fin-limit", "")
for i in range(20):
    lab_videos.add_video(ADMIN, *pg2, f"https://example.com/shared/{i}", "", True)
check("the shared bucket holds 20", len([v for v in lab_videos.list_videos(LEARNER, *pg2)["videos"] if v["shared"]]) == 20)
check("a 21st shared link -> 422", raises(lambda: lab_videos.add_video(ADMIN, *pg2, "https://example.com/shared/21", "", True), 422, vl.LIMIT_ERROR))
priv = lab_videos.add_video(ADMIN, *pg2, "https://example.com/private/0", "")
check("sharing a 21st link by PATCH -> 422", raises(lambda: lab_videos.update_video(ADMIN, priv["id"], shared_raw=True), 422, vl.LIMIT_ERROR))
check("the learner's own bucket is separate from the shared one", lab_videos.add_video(LEARNER, *pg2, "https://example.com/learner/0", "")["shared"] is False)
check("admin deletes a shared link", lab_videos.delete_video(ADMIN2, shared["id"])["message"] == "Video removed")
check("...and it is gone for learners", all(v["id"] != shared["id"] for v in lab_videos.list_videos(LEARNER, *pg)["videos"]))
lab_videos._is_admin = _real_is_admin

# ── 5c. The video script of a lab page (the store and the prompt; the endpoints are in part 6) ─────────────────

from modules.lab_sections import video_script as vs  # noqa: E402

sp = ("python", "python-setup", "")
check("script: none before one is written", vs.fetch_script(5, *sp) is None)
first_script = vs.save_script(5, *sp, "**Title:** One", None)
check("script: saved with its time and no project", first_script["content"] == "**Title:** One" and first_script["projectId"] is None and bool(first_script["updatedAt"]))
check("script: read back", vs.fetch_script(5, *sp) == first_script)
check("script: another user has none", vs.fetch_script(6, *sp) is None)
check("script: the subtopic page is separate", vs.fetch_script(5, "python", "python-setup", "py-install") is None)
second_script = vs.save_script(5, *sp, "**Title:** Two", 3)
check("script: saving again replaces it (one row)", vs.fetch_script(5, *sp)["content"] == "**Title:** Two" and vs.fetch_script(5, *sp)["projectId"] == 3 and count("SELECT COUNT(*) FROM lab_video_scripts WHERE user_id = 5") == 1)
check("script: it is not a section (no row in lab_section_content)", count("SELECT COUNT(*) FROM lab_section_content WHERE section_id = 'video-script'") == 0)
p = vs.build_prompt("Python", "a learner", "Setup — Install", "brief text", "", "")
check("prompt: names the domain, the topic, the length and the structure", all(t in p for t in ("senior Python instructor and video producer", "Topic: Setup — Install\nTopic summary: brief text", "5-8 minute", "**Title:**", "**Hook:**", "**Length:**", "### Scene 1: Scene name (0:00-0:45)", "**Narration:**", "**On screen:**", "### Closing call to action", "aimed at a learner")))
check("prompt: no standing, add-on or project block when there are none", all(t not in p for t in ("Standing context", "Additional instructions", "Project rules")))
p = vs.build_prompt("Python", "a learner", "Setup", "", "  I am a nurse  ", " Use short words ", ", for a learner who is applying it to a real project", "\n\nProject: Atlas", "Atlas")
check("prompt: standing context, add-on and project", all(t in p for t in ('Standing context about the learner', '"""\nI am a nurse\n"""', "Additional instructions (prompt add-on):\nUse short words", "applying it to a real project", "Project: Atlas", "“Atlas”")))

# ── 6. The HTTP layer (needs FastAPI) ──────────────────────────────────────────

FULL_APP = True
try:
    from fastapi.testclient import TestClient  # noqa: E402
    from modules.auth.db import promote_superadmins_from_env  # noqa: E402

    try:
        from main import app  # noqa: E402
    except SyntaxError:
        # The whole app needs Python 3.12 (an f-string in ai_lms). On an older interpreter the lab routers alone still run for
        # real, so the lab checks below are made; the AI LMS ones need the full app.
        FULL_APP = False
        from contextlib import asynccontextmanager  # noqa: E402

        from fastapi import FastAPI  # noqa: E402
        from modules.auth.admin_router import router as admin_router  # noqa: E402
        from modules.auth.router import router as auth_router  # noqa: E402
        from modules.common.db import init_db  # noqa: E402
        from modules.lab_projects.router import router as lab_projects_router  # noqa: E402
        from modules.lab_sections.router import router as lab_sections_router  # noqa: E402

        @asynccontextmanager
        async def _lifespan(_app):
            init_db()
            yield

        app = FastAPI(lifespan=_lifespan)
        for _router in (auth_router, admin_router, lab_sections_router, lab_projects_router):
            app.include_router(_router)
except ImportError as exc:  # a bare interpreter: part 1 above is all that can run
    print(f"SKIP http checks ({exc})")
else:
    if not FULL_APP:
        print("NOTE the AI LMS http checks are skipped: the full app needs Python 3.12")
    with TestClient(app) as client:
        tokens: dict[str, str] = {}
        ids: dict[str, int] = {}
        for role in ("user", "editor", "superadmin"):
            r = client.post("/auth/signup", json={"email": f"{role}@videos.test", "password": "Passw0rd!x"})
            tokens[role], ids[role] = r.json()["access_token"], r.json()["user"]["id"]
        # Signing up leaves an account pending until an admin approves it; these throwaway accounts live in the database copy.
        _conn = sqlite3.connect(DB)
        _conn.execute("UPDATE users SET status = 'approved' WHERE email LIKE '%@videos.test'")
        _conn.commit()
        _conn.close()
        promote_superadmins_from_env()
        client.patch(f"/admin/users/{ids['editor']}/role", headers={"Authorization": f"Bearer {tokens['superadmin']}"}, json={"role": "editor"})

        def call(method: str, path: str, role: str | None, **kw):
            headers = {"Authorization": f"Bearer {tokens[role]}"} if role else {}
            return client.request(method, path, headers=headers, **kw)

        if FULL_APP:
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
        if FULL_APP:
            check("http: deleting the class removes its links", call("DELETE", f"/api/lms/classes/{c['slug']}", "editor").status_code == 200)

        # ── Lab links: audience, preview image, shape (an admin's controls), through the real router ──
        base = {"lab": "cv", "topic_id": "http-links", "subtopic_id": ""}
        lq = "/lab-sections/videos?lab=cv&topic_id=http-links&subtopic_id="
        IMGH = "https://example.com/preview.jpg"
        r = call("POST", "/lab-sections/videos", "user", json={**base, "url": "https://example.com/learner", "title": "Mine"})
        check("http: a learner's link has no image and the wide shape", r.status_code == 201 and r.json()["preview_image"] == "" and r.json()["shape"] == "wide" and r.json()["shared"] is False)
        mine_id = r.json()["id"]
        r = call("POST", "/lab-sections/videos", "user", json={**base, "url": "https://example.com/l2", "preview_image": IMGH})
        check("http: a learner cannot attach a preview image (403)", r.status_code == 403 and r.json()["detail"] == lab_videos.NOT_ADMIN_LOOK)
        r = call("POST", "/lab-sections/videos", "user", json={**base, "url": "https://example.com/l2", "shape": "slim"})
        check("http: a learner cannot choose a shape (403)", r.status_code == 403 and r.json()["detail"] == lab_videos.NOT_ADMIN_LOOK)
        r = call("POST", "/lab-sections/videos", "user", json={**base, "url": "https://example.com/l2", "shared": True})
        check("http: a learner cannot add for everyone (403)", r.status_code == 403 and r.json()["detail"] == lab_videos.NOT_ADMIN_SHARE)
        r = call("POST", "/lab-sections/videos", "user", json={**base, "url": "https://example.com/l2", "shape": "round"})
        check("http: a bad shape is a 422 with the plain message", r.status_code == 422 and r.json()["detail"] == vl.SHAPE_ERROR)
        r = call("POST", "/lab-sections/videos", "superadmin", json={**base, "url": "https://example.com/l2", "preview_image": "http://example.com/a.jpg"})
        check("http: a bad preview image is a 422 with the plain message", r.status_code == 422 and r.json()["detail"] == vl.PREVIEW_ERROR)
        r = call("POST", "/lab-sections/videos", "superadmin", json={**base, "url": "https://example.com/everyone", "title": "For all", "shared": True, "preview_image": IMGH, "shape": "side"})
        check("http: an admin adds one for everyone with an image and a shape", r.status_code == 201 and r.json()["shared"] is True and r.json()["preview_image"] == IMGH and r.json()["shape"] == "side")
        shared_id = r.json()["id"]
        r = call("POST", "/lab-sections/videos", "superadmin", json={**base, "url": "https://example.com/upload", "preview_image": "data:image/jpeg;base64," + "A" * 64, "shape": "slim"})
        check("http: an admin's own link can carry an uploaded image", r.status_code == 201 and r.json()["preview_image"].startswith("data:image/jpeg;base64,") and r.json()["shared"] is False)
        admin_own = r.json()["id"]
        for who in ("user", "editor"):
            got = call("GET", lq, who).json()["videos"]
            check(f"http: {who} sees the shared link first, read-only, with its look", got[0]["id"] == shared_id and got[0]["shared"] is True and got[0]["shape"] == "side" and got[0]["preview_image"] == IMGH)
        check("http: the admin's private link is not shown to learners", all(v["id"] != admin_own for v in call("GET", lq, "user").json()["videos"]))
        check("http: another learner does not see my link", all(v["id"] != mine_id for v in call("GET", lq, "editor").json()["videos"]))
        check("http: a learner cannot delete a shared link (404)", call("DELETE", f"/lab-sections/videos/{shared_id}", "user").status_code == 404)
        check("http: a learner cannot patch a shared link (404)", call("PATCH", f"/lab-sections/videos/{shared_id}", "user", json={"title": "x"}).status_code == 404)
        check("http: a learner edits their own title", call("PATCH", f"/lab-sections/videos/{mine_id}", "user", json={"title": "Renamed"}).json()["title"] == "Renamed")
        r = call("PATCH", f"/lab-sections/videos/{mine_id}", "user", json={"preview_image": IMGH})
        check("http: a learner's patch of the preview image is 403", r.status_code == 403 and r.json()["detail"] == lab_videos.NOT_ADMIN_PATCH)
        check("http: a learner's patch of the shape is 403", call("PATCH", f"/lab-sections/videos/{mine_id}", "user", json={"shape": "slim"}).status_code == 403)
        check("http: a learner's patch of shared is 403", call("PATCH", f"/lab-sections/videos/{mine_id}", "user", json={"shared": True}).status_code == 403)
        r = call("PATCH", f"/lab-sections/videos/{mine_id}", "user", json={})
        check("http: an empty patch is a 422 with the plain message", r.status_code == 422 and r.json()["detail"] == lab_videos.NOTHING_TO_CHANGE)
        check("http: all-null patch is the same 422", call("PATCH", f"/lab-sections/videos/{mine_id}", "user", json={"title": None, "shape": None}).status_code == 422)
        check("http: someone else's private id is a 404 even for an admin", call("PATCH", f"/lab-sections/videos/{mine_id}", "superadmin", json={"title": "x"}).status_code == 404)
        r = call("PATCH", f"/lab-sections/videos/{shared_id}", "superadmin", json={"shape": "wide", "preview_image": ""})
        check("http: an admin changes the shape and removes the image", r.status_code == 200 and r.json()["shape"] == "wide" and r.json()["preview_image"] == "")
        r = call("PATCH", f"/lab-sections/videos/{shared_id}", "superadmin", json={"shape": "round"})
        check("http: patch with a bad shape -> 422", r.status_code == 422 and r.json()["detail"] == vl.SHAPE_ERROR)
        r = call("PATCH", f"/lab-sections/videos/{shared_id}", "superadmin", json={"shared": "yes"})
        check("http: patch with a non-boolean shared -> 422", r.status_code == 422 and r.json()["detail"] == vl.SHARED_ERROR)
        r = call("PATCH", f"/lab-sections/videos/{admin_own}", "superadmin", json={"shared": True})
        check("http: an admin shares their own link, and learners then see it", r.status_code == 200 and r.json()["shared"] is True and any(v["id"] == admin_own for v in call("GET", lq, "user").json()["videos"]))
        r = call("PATCH", f"/lab-sections/videos/{admin_own}", "superadmin", json={"shared": False})
        check("http: ...and takes it back", r.status_code == 200 and r.json()["shared"] is False and all(v["id"] != admin_own for v in call("GET", lq, "user").json()["videos"]))
        check("http: guests cannot patch", call("PATCH", f"/lab-sections/videos/{mine_id}", None, json={"title": "x"}).status_code in (401, 403))
        check("http: an admin deletes a shared link", call("DELETE", f"/lab-sections/videos/{shared_id}", "superadmin").status_code == 200)
        check("http: the owner deletes theirs", call("DELETE", f"/lab-sections/videos/{mine_id}", "user").status_code == 200)

        # ── The video script (the model call is replaced, so no key or network is needed) ──
        import modules.lab_sections.router as lab_router  # noqa: E402

        calls: list[dict] = []
        reply = {"text": "**Title:** A working title\n**Hook:** Why this matters\n**Length:** about 6 minutes\n\n### Scene 1: Start (0:00-0:45)\n**Narration:** Hello.\n**On screen:** A slide."}

        def fake_ai(prompt, payload, max_tokens=None, **kw):
            calls.append({"prompt": prompt, "max_tokens": max_tokens, "provider": getattr(payload, "provider", None)})
            if reply["text"] is None:
                raise RuntimeError("provider down")
            return reply["text"]

        real_ai = lab_router.call_ai_text
        lab_router.call_ai_text = fake_ai
        try:
            sbase = {"lab": "cv", "topic_id": "http-script", "topic_name": "Image Basics", "topic_brief": "Pixels and channels", "subtopic_id": "", "subtopic_name": "", "subtopic_brief": ""}
            sq = "/lab-sections/video-script?lab=cv&topic_id=http-script&subtopic_id="
            check("http script: none before one is written", call("GET", sq, "user").json() == {"script": None})
            check("http script: guests are refused", call("GET", sq, None).status_code in (401, 403) and call("POST", "/lab-sections/video-script", None, json=sbase).status_code in (401, 403))
            for name, body in (("no topic name", {k: v for k, v in sbase.items() if k != "topic_name"}), ("an unknown lab", {**sbase, "lab": "nope"}), ("project_id 0", {**sbase, "project_id": 0}), ("a long add-on", {**sbase, "prompt_addon": "x" * 4001}), ("a long standing context", {**sbase, "standing_context": "x" * 6501}), ("an empty topic id", {**sbase, "topic_id": ""})):
                check(f"http script: {name} -> 422", call("POST", "/lab-sections/video-script", "user", json=body).status_code == 422)
            check("http script: nothing reached the model for those", len(calls) == 0)

            r = call("POST", "/lab-sections/video-script", "user", json={**sbase, "standing_context": "I am a nurse", "prompt_addon": "Keep it short"})
            check("http script: written and saved", r.status_code == 200 and set(r.json()) == {"content", "updatedAt", "projectId"} and r.json()["content"] == reply["text"] and r.json()["projectId"] is None)
            check("http script: the model got the page, the level, the standing context and the add-on", len(calls) == 1 and all(t in calls[0]["prompt"] for t in ("Topic: Image Basics\nTopic summary: Pixels and channels", "senior Computer Vision instructor and video producer", "I am a nurse", "Keep it short", "5-8 minute")))
            check("http script: the token budget is the module's", calls[0]["max_tokens"] == vs.SCRIPT_MAX_TOKENS == 4096)
            check("http script: read back on return", call("GET", sq, "user").json()["script"]["content"] == reply["text"])
            check("http script: private to the user", call("GET", sq, "editor").json() == {"script": None})
            check("http script: not a lab section (the counts and outline are untouched)", "video-script" not in call("GET", "/lab-sections?lab=cv&topic_id=http-script&subtopic_id=", "user").json()["sections"])
            reply["text"] = "```markdown\n**Title:** Second\n```"
            r = call("POST", "/lab-sections/video-script", "user", json=sbase)
            check("http script: regenerating replaces it, and a wrapping fence is removed", r.status_code == 200 and r.json()["content"] == "**Title:** Second" and call("GET", sq, "user").json()["script"]["content"] == "**Title:** Second")
            check("http script: the subtopic page has its own", call("GET", sq + "py", "user").json() == {"script": None} and call("GET", "/lab-sections/video-script?lab=cv&topic_id=http-script&subtopic_id=sub-1", "user").json() == {"script": None})
            r = call("POST", "/lab-sections/video-script", "user", json={**sbase, "subtopic_id": "sub-1", "subtopic_name": "Channels", "subtopic_brief": "RGB"})
            check("http script: a subtopic's prompt names both", r.status_code == 200 and "Topic: Image Basics — Channels\nTopic summary: RGB" in calls[-1]["prompt"])
            reply["text"] = ""
            r = call("POST", "/lab-sections/video-script", "user", json=sbase)
            check("http script: an empty answer is a 502 and keeps the old script", r.status_code == 502 and call("GET", sq, "user").json()["script"]["content"] == "**Title:** Second")
            reply["text"] = None
            r = call("POST", "/lab-sections/video-script", "user", json=sbase)
            check("http script: a provider failure is a 400 with the usual text", r.status_code == 400 and r.json()["detail"].startswith("No API key configured or all providers failed. Add a key in Config. Last error:") and call("GET", sq, "user").json()["script"]["content"] == "**Title:** Second")

            reply["text"] = "**Title:** Project script"
            pr = call("POST", "/lab-projects", "user", json={"name": "Atlas", "description": "A SaaS platform", "context": "Multi-tenant B2B"})
            check("http script: a project can be created", pr.status_code == 201)
            pid = pr.json()["id"]
            r = call("POST", "/lab-sections/video-script", "user", json={**sbase, "project_id": pid})
            check("http script: with a project the prompt carries it and the row remembers it", r.status_code == 200 and r.json()["projectId"] == pid and all(t in calls[-1]["prompt"] for t in ("Project: Atlas", "applying it to a real project", "“Atlas”")))
            check("http script: another user's project is a 404 and reaches no model", (lambda n: call("POST", "/lab-sections/video-script", "editor", json={**sbase, "project_id": pid}).status_code == 404 and len(calls) == n)(len(calls)))
            check("http script: a missing project is a 404", call("POST", "/lab-sections/video-script", "user", json={**sbase, "project_id": 99999999}).status_code == 404)
            if os.environ.get("VIDEO_SCRIPT_PROMPTS_OUT"):
                Path(os.environ["VIDEO_SCRIPT_PROMPTS_OUT"]).write_text(json.dumps([c["prompt"] for c in calls]))
        finally:
            lab_router.call_ai_text = real_ai

print(f"\n{len(failures)} failed")
sys.exit(1 if failures else 0)
