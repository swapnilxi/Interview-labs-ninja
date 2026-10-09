"""Two-way sync between the AI-LMS tables and per-class folders of editable HTML.

Every class gets a folder under frontend/src/modules/ai-lms/classes/ (paths here are
relative to that root):

    <class>/landingpage.html                          landing page (yours to edit)
    <class>/class.json                                generated manifest (DB -> file only)
    <class>/<subject>/lessons/<lesson-slug>.html
    <class>/<project>/modules/<module>.html           a project module's own lesson
    <class>/<project>/modules/<module>/<step>.html    its sub-step lessons
    <class>/<project>/lessons/<lesson-slug>.html      project lessons the plan doesn't list
    <class>/lessons/<lesson-slug>.html                lessons with no subject

The lms_* tables stay the store of record: lesson HTML lives in lms_lessons.generated_html
and the landing page in lms_classes.landing_html; the files are an editable second copy.
Each row also keeps where its file was last written and the hash the DB and the file
last agreed on (file_path/file_hash, landing_hash). That base says which side changed:

    file == base, DB changed   -> the app wrote it: rewrite the file
    DB == base, file changed   -> edited in the IDE: import it into the DB
    both changed               -> the file wins

Whenever HTML is replaced (by an import or an app edit), the previous version goes to
lms_html_backups (last few kept per lesson). A file that isn't valid UTF-8 is never
imported or overwritten; it is skipped until fixed.

landingpage.html is yours except its lms:auto marker regions, which are re-rendered only
when the class data they show changes (landing_data_hash), never just because the page
was read -- so the app doesn't fight edits made in the IDE.

Writes: reconcile_all() runs after every mutating /api/lms request (router.py), at
startup (main.py), and from the CLI: `uv run python -m modules.ai_lms.class_folders`
from backend/. Reads: get_lesson_by_id(), get_landing() and the class detail endpoint
pull in IDE edits first, so the app always renders what's on disk. Reconciles take a
`BEGIN IMMEDIATE` lock, so the FastAPI and Next.js twins never sync at the same time.

Templates (new landing pages, and the deploy files an export adds) live in ./templates/,
which ships with the backend everywhere it runs.

frontend/fe-apis/lms/classFolders.ts is the nextjs-api twin. Both must write the same
files byte for byte (layout, names, class.json, landing blocks) -- change them together.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from .db import MODULE_LANDING_ID, _get_conn, content_hash

LANDING_FILE = "landingpage.html"
MANIFEST_FILE = "class.json"
BACKUPS_KEPT = 5
_TEMPLATES = Path(__file__).resolve().parent / "templates"
_REPO_CLASSES = Path(__file__).resolve().parents[3] / "frontend" / "src" / "modules" / "ai-lms" / "classes"
_LOCK = threading.RLock()
_AUTO_BLOCK = re.compile(
    r"(<!--[ \t\r\n]*lms:auto:([a-z][a-z0-9-]*)[ \t\r\n]*-->)(.*?)(<!--[ \t\r\n]*/lms:auto:\2[ \t\r\n]*-->)",
    re.S,
)
_SAFE_SEGMENT = re.compile(r"[^/\\\x00]+")
_MANIFEST_NOTE = (
    "Generated from the AI-LMS tables on every change; edits here are overwritten. "
    "Edit landingpage.html and the lesson .html files instead."
)
# Used only when templates/landingpage.html can't be read. Same text in the TS twin.
_FALLBACK_TEMPLATE = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n"
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
    "  <title>{{CLASS_NAME}}</title>\n</head>\n<body>\n"
    "  <h1><!-- lms:auto:name --><!-- /lms:auto:name --></h1>\n"
    "  <p><!-- lms:auto:description --><!-- /lms:auto:description --></p>\n"
    "  <p><a href=\"#contents\" data-lms-route=\"class\">Enter Class</a></p>\n"
    "  <main id=\"contents\">\n"
    "    <!-- lms:auto:subjects --><!-- /lms:auto:subjects -->\n"
    "    <!-- lms:auto:projects --><!-- /lms:auto:projects -->\n"
    "    <!-- lms:auto:lessons --><!-- /lms:auto:lessons -->\n"
    "  </main>\n</body>\n</html>\n"
)
_CLASS_COLS = "id, slug, name, description, landing_html, landing_hash, landing_data_hash"
# Set by the CLI's --prefer-db: the DB wins every disagreement (see __main__ below).
_PREFER_DB = False


class _Unreadable(Exception):
    """A file exists but can't be used (not valid UTF-8, permissions): leave it alone."""


# ─────────────────────────────────────────────────────────────────────────────
# Where the folder is
# ─────────────────────────────────────────────────────────────────────────────

def classes_root() -> Optional[Path]:
    """The classes folder, or None when the file layer is off.

    LMS_CLASSES_DIR overrides it (tests). When the DB is redirected elsewhere
    (LABNINJA_TEST_DB_PATH / LABNINJA_DB_DIR) and no folder is named, there is none: a DB
    copy must never rewrite the repo's folder. That also covers the Vercel Python
    function, which ships without frontend/."""
    override = os.environ.get("LMS_CLASSES_DIR")
    if override:
        path = Path(override)
        return path if path.is_dir() else None
    if os.environ.get("LABNINJA_TEST_DB_PATH") or os.environ.get("LABNINJA_DB_DIR"):
        return None
    return _REPO_CLASSES if _REPO_CLASSES.is_dir() else None


def file_sync_enabled() -> bool:
    return classes_root() is not None


def _writable(root: Optional[Path]) -> bool:
    return root is not None and not os.environ.get("VERCEL") and os.access(root, os.W_OK)


# ─────────────────────────────────────────────────────────────────────────────
# Small helpers (each has an identically-behaving twin in classFolders.ts)
# ─────────────────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _unent(text: Any) -> str:
    """AI-extracted titles can carry escaped entities (&amp;); decode the basic five."""
    return (
        str(text or "")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&amp;", "&")
    )


def _esc(text: Any) -> str:
    return (
        str(text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def path_slug(text: Any, fallback: str) -> str:
    """File/folder name for a plan module or step: ASCII-only so both twins agree."""
    slug = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")[:80].rstrip("-")
    return slug or fallback


def _claim(name: str, taken: Set[str]) -> str:
    candidate, n = name, 2
    while candidate in taken:
        candidate = f"{name}-{n}"
        n += 1
    taken.add(candidate)
    return candidate


def _safe_rel(rel: str) -> bool:
    return all(_SAFE_SEGMENT.fullmatch(part) and not part.startswith(".") for part in rel.split("/"))


def _read(path: Path) -> Optional[str]:
    """A file's text; None if it doesn't exist. Raises _Unreadable for anything else."""
    try:
        data = path.read_bytes()
    except (FileNotFoundError, NotADirectoryError):
        return None
    except OSError as exc:
        raise _Unreadable(f"{path}: {exc}") from exc
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise _Unreadable(f"{path}: not valid UTF-8") from exc


def _read_quiet(path: Path) -> Optional[str]:
    """For files this module owns (class.json, templates): unusable counts as missing."""
    try:
        return _read(path)
    except _Unreadable:
        return None


def _write(path: Path, text: str) -> bool:
    """Atomic write (temp file + rename), so the IDE or the other twin never sees half a file."""
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(text.encode("utf-8", errors="replace"))
        os.replace(tmp, path)
        return True
    except OSError as exc:
        print(f"[ai_lms] could not write {path}: {exc}")
        try:
            tmp.unlink()
        except OSError:
            pass
        return False


def _unlink(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


def _prune(directory: Path, keep_root: bool) -> None:
    """Remove empty directories under (and optionally including) `directory`."""
    if not directory.is_dir():
        return
    subdirs = sorted((p for p in directory.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True)
    for sub in subdirs + ([] if keep_root else [directory]):
        try:
            sub.rmdir()
        except OSError:
            pass


def _backup(conn: sqlite3.Connection, entity_type: str, entity_id: str, rel: str, html: str, reason: str) -> None:
    conn.execute(
        "INSERT INTO lms_html_backups (entity_type, entity_id, rel_path, html, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (entity_type, entity_id, rel, html, reason, _now()),
    )
    conn.execute(
        """
        DELETE FROM lms_html_backups
        WHERE entity_type = ? AND entity_id = ? AND id NOT IN (
            SELECT id FROM lms_html_backups WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT ?
        )
        """,
        (entity_type, entity_id, entity_type, entity_id, BACKUPS_KEPT),
    )


def record_backup(entity_type: str, entity_id: str, rel: str, html: str, reason: str) -> None:
    """Keep a copy of HTML the app is about to replace (see update_lesson in db.py)."""
    conn = _get_conn()
    try:
        _backup(conn, entity_type, entity_id, rel, html, reason)
        conn.commit()
    finally:
        conn.close()


def _merge(conn: sqlite3.Connection, entity_type: str, entity_id: str, rel: str, db_html: str, base: str, file_text: str) -> str:
    """Three-way decision between the DB copy and the file; returns the content to keep."""
    if file_text == db_html:
        return db_html
    if content_hash(file_text) == base:
        return db_html  # the app changed it; the file is just stale
    if _PREFER_DB:
        _backup(conn, "file", rel, rel, file_text, "replaced by the DB (--prefer-db)")
        return db_html
    reason = "conflict: file and DB both changed" if content_hash(db_html) != base else "replaced by a file edit"
    _backup(conn, entity_type, entity_id, rel, db_html, reason)
    return file_text


# ─────────────────────────────────────────────────────────────────────────────
# Layout: where each lesson lives, and class.json
# ─────────────────────────────────────────────────────────────────────────────

def _load_class_rows(conn: sqlite3.Connection, class_id: str, with_html: bool = True) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    subjects = [
        dict(r)
        for r in conn.execute(
            "SELECT id, slug, name, description, kind, project_plan FROM lms_subjects "
            "WHERE class_id = ? ORDER BY order_index ASC, name ASC, id ASC",
            (class_id,),
        )
    ]
    html_cols = ", generated_html, file_path, file_hash" if with_html else ""
    lessons = [
        dict(r)
        for r in conn.execute(
            f"SELECT id, subject_id, slug, title{html_cols} FROM lms_lessons "
            "WHERE class_id = ? ORDER BY order_index ASC, created_at ASC, id ASC",
            (class_id,),
        )
    ]
    return subjects, lessons


def _parse_plan(raw: Optional[str]) -> List[Any]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return data if isinstance(data, list) else []


Place = Callable[[Dict[str, Any], str], Optional[Dict[str, Any]]]


def _plan_nodes(items: List[Any], dir_rel: str, by_id: Dict[str, Dict[str, Any]], used: Set[str], place: Place, fallback: str) -> List[Dict[str, Any]]:
    nodes: List[Dict[str, Any]] = []
    taken: Set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        title = _unent(item.get("title") or "").strip()
        if not title:
            continue  # _parse_plan_item drops untitled items (and their steps) too
        name = _claim(path_slug(title, fallback), taken)
        lesson_id = item.get("lesson_id")
        lesson = by_id.get(lesson_id) if isinstance(lesson_id, str) and lesson_id not in used else None
        node: Dict[str, Any] = {"title": title, "name": name, "lesson": None}
        if lesson is not None:
            used.add(lesson["id"])
            node["lesson"] = place(lesson, f"{dir_rel}/{name}.html")
        subs = item.get("sublessons")
        node["steps"] = _plan_nodes(subs if isinstance(subs, list) else [], f"{dir_rel}/{name}", by_id, used, place, "step")
        nodes.append(node)
    return nodes


def _layout(cls: Dict[str, Any], subjects: List[Dict[str, Any]], lessons: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Tuple[Dict[str, Any], str]]]:
    """class.json content (without "files") and every lesson's path, in a fixed order."""
    c = cls["slug"]
    placements: List[Tuple[Dict[str, Any], str]] = []
    claimed: Set[str] = set()

    def place(lesson: Dict[str, Any], rel: str) -> Optional[Dict[str, Any]]:
        if rel in claimed or not _safe_rel(rel):
            print(f"[ai_lms] no file for lesson {lesson['id']}: path {rel!r} is taken or unsafe")
            return None
        claimed.add(rel)
        placements.append((lesson, rel))
        return {"id": lesson["id"], "slug": lesson["slug"], "title": _unent(lesson["title"]), "file": rel[len(c) + 1:]}

    by_subject: Dict[str, List[Dict[str, Any]]] = {}
    direct: List[Dict[str, Any]] = []
    subject_ids = {s["id"] for s in subjects}
    for lesson in lessons:
        sid = lesson["subject_id"] or ""
        if not sid:
            direct.append(lesson)
        elif sid in subject_ids:
            by_subject.setdefault(sid, []).append(lesson)

    entries: List[Dict[str, Any]] = []
    for s in subjects:
        base = f"{c}/{s['slug']}"
        own = by_subject.get(s["id"], [])
        kind = "project" if s["kind"] == "project" else "subject"
        entry: Dict[str, Any] = {
            "id": s["id"],
            "slug": s["slug"],
            "name": _unent(s["name"]),
            "kind": kind,
            "description": s["description"] or "",
        }
        rest = own
        if kind == "project":
            used: Set[str] = set()
            by_id = {lesson["id"]: lesson for lesson in own}
            entry["modules"] = _plan_nodes(_parse_plan(s["project_plan"]), f"{base}/modules", by_id, used, place, "module")
            rest = [lesson for lesson in own if lesson["id"] not in used]
        entry["lessons"] = [e for e in (place(lesson, f"{base}/lessons/{lesson['slug']}.html") for lesson in rest) if e]
        entries.append(entry)

    manifest = {
        "$comment": _MANIFEST_NOTE,
        "id": cls["id"],
        "slug": c,
        "name": _unent(cls["name"]),
        "description": cls["description"] or "",
        "landing": LANDING_FILE,
        "subjects": entries,
        "lessons": [e for e in (place(lesson, f"{c}/lessons/{lesson['slug']}.html") for lesson in direct) if e],
    }
    return manifest, placements


def _manifest_text(manifest: Dict[str, Any]) -> str:
    return json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"


def _manifest_files(path: Path) -> Dict[str, str]:
    text = _read_quiet(path)
    if not text:
        return {}
    try:
        data = json.loads(text)
    except ValueError:
        return {}
    files = data.get("files") if isinstance(data, dict) else None
    if not isinstance(files, dict):
        return {}
    return {k: v for k, v in files.items() if isinstance(k, str) and isinstance(v, str)}


# ─────────────────────────────────────────────────────────────────────────────
# Landing page: template + lms:auto blocks
# ─────────────────────────────────────────────────────────────────────────────

def _template() -> str:
    return _read_quiet(_TEMPLATES / LANDING_FILE) or _FALLBACK_TEMPLATE


def _lesson_list(lessons: List[Dict[str, Any]], indent: str, empty: str) -> List[str]:
    if not lessons:
        return [f'{indent}<p class="lms-muted">{empty}</p>'] if empty else []
    out = [f'{indent}<ol class="lms-list">']
    for lesson in lessons:
        out.append(f'{indent}  <li><a href="{_esc(lesson["file"])}">{_esc(lesson["title"])}</a></li>')
    out.append(f"{indent}</ol>")
    return out


def _module_list(nodes: List[Dict[str, Any]], indent: str) -> List[str]:
    out = [f'{indent}<ol class="lms-list">']
    for node in nodes:
        if node["lesson"]:
            label = f'<a href="{_esc(node["lesson"]["file"])}">{_esc(node["title"])}</a>'
        else:
            label = f'<span class="lms-pending">{_esc(node["title"])}</span>'
        if node["steps"]:
            out.append(f"{indent}  <li>{label}")
            out += _module_list(node["steps"], indent + "    ")
            out.append(f"{indent}  </li>")
        else:
            out.append(f"{indent}  <li>{label}</li>")
    out.append(f"{indent}</ol>")
    return out


def _section(section_id: str, heading: str, body: List[str]) -> str:
    lines = [f'<section class="lms-section" id="{section_id}">', f"  <h2>{heading}</h2>", *body, "</section>"]
    return "\n" + "\n".join(lines) + "\n"


def _card(tag: str, item: Dict[str, Any]) -> List[str]:
    out = ['    <article class="lms-card">', f'      <span class="lms-tag">{tag}</span>', f'      <h3>{_esc(item["name"])}</h3>']
    if item["description"]:
        out.append(f'      <p>{_esc(item["description"])}</p>')
    return out


def _stat(n: int, one: str, many: str) -> str:
    return f'<span class="lms-stat"><strong>{n}</strong> {one if n == 1 else many}</span>'


def _auto_blocks(manifest: Dict[str, Any], lesson_count: int) -> Dict[str, str]:
    subjects = [s for s in manifest["subjects"] if s["kind"] == "subject"]
    projects = [s for s in manifest["subjects"] if s["kind"] == "project"]

    subject_html = ""
    if subjects:
        body = ['  <div class="lms-grid">']
        for s in subjects:
            body += _card("Subject", s) + _lesson_list(s["lessons"], "      ", "No lessons yet.") + ["    </article>"]
        subject_html = _section("subjects", "Subjects", body + ["  </div>"])

    project_html = ""
    if projects:
        body = ['  <div class="lms-grid">']
        for p in projects:
            body += _card("Project", p)
            if p["modules"]:
                body += _module_list(p["modules"], "      ")
            elif not p["lessons"]:
                body.append('      <p class="lms-muted">No roadmap yet.</p>')
            body += _lesson_list(p["lessons"], "      ", "") + ["    </article>"]
        project_html = _section("projects", "Projects", body + ["  </div>"])

    lesson_html = ""
    if manifest["lessons"]:
        body = ['  <div class="lms-card">'] + _lesson_list(manifest["lessons"], "    ", "") + ["  </div>"]
        lesson_html = _section("lessons", "Lessons", body)

    return {
        "name": _esc(manifest["name"]),
        "description": _esc(manifest["description"]),
        "stats": " ".join([
            _stat(len(subjects), "subject", "subjects"),
            _stat(len(projects), "project", "projects"),
            _stat(lesson_count, "lesson", "lessons"),
        ]),
        "subjects": subject_html,
        "projects": project_html,
        "lessons": lesson_html,
    }


def apply_auto_blocks(html: str, manifest: Dict[str, Any], lesson_count: int) -> str:
    """Rewrite the inside of every known lms:auto marker pair; leave everything else alone."""
    blocks = _auto_blocks(manifest, lesson_count)

    def fill(match: "re.Match[str]") -> str:
        name = match.group(2)
        return match.group(1) + blocks[name] + match.group(4) if name in blocks else match.group(0)

    return _AUTO_BLOCK.sub(fill, html)


def _sync_landing(conn: sqlite3.Connection, root: Optional[Path], writable: bool, cls: Dict[str, Any], manifest: Dict[str, Any], lesson_count: int) -> Tuple[str, str]:
    """Three-way sync of <class>/landingpage.html; re-render its lms:auto blocks only when
    the class data they show changed since they were last rendered."""
    rel = f"{cls['slug']}/{LANDING_FILE}"
    db_html = cls.get("landing_html") or ""
    base = cls.get("landing_hash") or ""
    path = root / rel if root is not None else None
    try:
        file_text = _read(path) if path is not None else None
    except _Unreadable as exc:
        print(f"[ai_lms] skipping {rel}: {exc}")
        return db_html, content_hash(db_html)
    created = False
    if file_text is None:
        current = db_html
        if not current:
            current = _template().replace("{{CLASS_NAME}}", _esc(_unent(cls["name"])))
            created = True
    elif not db_html:
        current = file_text  # e.g. a class folder copied in before its DB rows
    else:
        current = _merge(conn, "landing", cls["id"], rel, db_html, base, file_text)
    data_hash = content_hash(_manifest_text(manifest))
    final = current
    if created or data_hash != (cls.get("landing_data_hash") or ""):
        final = apply_auto_blocks(current, manifest, lesson_count)
    final_hash = content_hash(final)
    file_ok = file_text == final
    if path is not None and writable and not file_ok:
        file_ok = _write(path, final)
    new_base = final_hash if file_ok else base
    if final != db_html or new_base != base or data_hash != (cls.get("landing_data_hash") or ""):
        conn.execute(
            "UPDATE lms_classes SET landing_html = ?, landing_hash = ?, landing_data_hash = ? WHERE id = ?",
            (final, new_base, data_hash, cls["id"]),
        )
    return final, final_hash


# ─────────────────────────────────────────────────────────────────────────────
# Lessons
# ─────────────────────────────────────────────────────────────────────────────

def _sync_lessons(conn: sqlite3.Connection, root: Path, writable: bool, placements: List[Tuple[Dict[str, Any], str]]) -> Dict[str, str]:
    """Settle every lesson of one class, then write files, then drop vacated paths.

    Each lesson's current file is read from where it was last written (file_path), all
    before anything is written, so moves and name swaps between siblings stay correct."""
    plans = []
    hashes: Dict[str, str] = {}
    for lesson, rel in placements:
        src_rel = lesson["file_path"] or rel
        if not _safe_rel(src_rel):
            src_rel = rel
        db_html = lesson["generated_html"] or ""
        base = lesson["file_hash"] or ""
        try:
            file_text = _read(root / src_rel)
        except _Unreadable as exc:
            print(f"[ai_lms] skipping {src_rel}: {exc}")
            hashes[rel] = base or content_hash(db_html)
            continue
        current = db_html if file_text is None else _merge(conn, "lesson", lesson["id"], src_rel, db_html, base, file_text)
        plans.append((lesson, rel, src_rel, file_text, current))

    sources = {src_rel for _, _, src_rel, _, _ in plans}
    targets = {rel for _, rel, _, _, _ in plans}
    vacated: Set[str] = set()  # old paths whose lesson now sits at its new path
    for lesson, rel, src_rel, file_text, current in plans:
        current_hash = content_hash(current)
        file_ok = src_rel == rel and file_text == current
        if writable and not file_ok:
            if rel != src_rel and rel not in sources:
                try:
                    stranger = _read(root / rel)  # a file nobody tracks sits where this lesson goes
                except _Unreadable:
                    stranger = None
                    print(f"[ai_lms] not moving lesson {lesson['id']}: {rel} is in the way and unreadable")
                    hashes[rel] = lesson["file_hash"] or current_hash
                    continue
                if stranger is not None and stranger != current:
                    _backup(conn, "file", rel, rel, stranger, "overwritten by a lesson moving into this path")
            file_ok = _write(root / rel, current)
        if file_ok and src_rel != rel and file_text is not None:
            vacated.add(src_rel)
        old_path = lesson["file_path"] or ""
        old_base = lesson["file_hash"] or ""
        new_path, new_base = (rel, current_hash) if file_ok else (old_path, old_base)
        if current != (lesson["generated_html"] or ""):
            conn.execute(
                "UPDATE lms_lessons SET generated_html = ?, updated_at = ?, file_path = ?, file_hash = ? WHERE id = ?",
                (current, _now(), new_path, new_base, lesson["id"]),
            )
        elif new_path != old_path or new_base != old_base:
            conn.execute("UPDATE lms_lessons SET file_path = ?, file_hash = ? WHERE id = ?", (new_path, new_base, lesson["id"]))
        hashes[rel] = current_hash

    for src_rel in vacated - targets:
        _unlink(root / src_rel)
    return {rel: hashes[rel] for _, rel in placements if rel in hashes}


def _remove_stale(conn: sqlite3.Connection, root: Path, class_slug: str, previous: Dict[str, str], keep: Set[str]) -> None:
    """Delete files the last class.json listed that nothing claims now (lesson deleted,
    project re-planned). A file edited since it was written is backed up first."""
    for rel_in_class, recorded_hash in previous.items():
        rel = f"{class_slug}/{rel_in_class}"
        if rel_in_class in keep or not _safe_rel(rel):
            continue
        try:
            text = _read(root / rel)
        except _Unreadable as exc:
            print(f"[ai_lms] leaving {rel} in place: {exc}")
            continue
        if text is None:
            continue
        if content_hash(text) != recorded_hash:
            _backup(conn, "file", rel, rel, text, "removed after its lesson was deleted; had unsynced edits")
        _unlink(root / rel)


def _reconcile_class(conn: sqlite3.Connection, root: Path, writable: bool, cls: Dict[str, Any]) -> None:
    subjects, lessons = _load_class_rows(conn, cls["id"])
    manifest, placements = _layout(cls, subjects, lessons)
    class_dir = root / cls["slug"]
    previous = _manifest_files(class_dir / MANIFEST_FILE)
    lesson_hashes = _sync_lessons(conn, root, writable, placements)
    _, landing_hash = _sync_landing(conn, root, writable, cls, manifest, len(placements))
    files = {LANDING_FILE: landing_hash}
    for rel, digest in lesson_hashes.items():
        files[rel[len(cls["slug"]) + 1:]] = digest
    manifest["files"] = files
    if not writable:
        return
    text = _manifest_text(manifest)
    if _read_quiet(class_dir / MANIFEST_FILE) != text:
        _write(class_dir / MANIFEST_FILE, text)
    _remove_stale(conn, root, cls["slug"], previous, set(files))
    _prune(class_dir, keep_root=True)


def _remove_deleted_classes(conn: sqlite3.Connection, root: Path, live_slugs: Set[str]) -> None:
    for directory in sorted(root.iterdir()):
        if not directory.is_dir() or directory.name.startswith(("_", ".")) or directory.name in live_slugs:
            continue
        manifest_path = directory / MANIFEST_FILE
        if not manifest_path.is_file():
            continue  # not a folder this sync created
        _remove_stale(conn, root, directory.name, _manifest_files(manifest_path), set())
        _unlink(manifest_path)
        _prune(directory, keep_root=False)


def _locked_sync(work: Callable[[sqlite3.Connection, Path, bool], None]) -> None:
    """Run `work` inside BEGIN IMMEDIATE: the cross-process lock with the TS twin."""
    root = classes_root()
    if root is None:
        return
    writable = _writable(root)
    with _LOCK:
        conn = _get_conn()
        try:
            conn.execute("BEGIN IMMEDIATE")
            work(conn, root, writable)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def reconcile_all() -> None:
    """Bring every class folder and the DB in line (both directions)."""

    def work(conn: sqlite3.Connection, root: Path, writable: bool) -> None:
        classes = [dict(r) for r in conn.execute(f"SELECT {_CLASS_COLS} FROM lms_classes ORDER BY order_index ASC, slug ASC")]
        for cls in classes:
            if _safe_rel(cls["slug"]):
                _reconcile_class(conn, root, writable, cls)
        if writable:
            _remove_deleted_classes(conn, root, {c["slug"] for c in classes})
        _sync_module_landing(conn, root, writable)

    _locked_sync(work)


def reconcile_class(class_identifier: str) -> None:
    """Sync one class folder, e.g. when its page opens, so IDE edits to lessons nobody has
    opened yet still reach the DB."""

    def work(conn: sqlite3.Connection, root: Path, writable: bool) -> None:
        row = conn.execute(f"SELECT {_CLASS_COLS} FROM lms_classes WHERE id = ? OR slug = ?", (class_identifier, class_identifier)).fetchone()
        if row is not None and _safe_rel(row["slug"]):
            _reconcile_class(conn, root, writable, dict(row))

    _locked_sync(work)


def refresh_lesson(lesson: Dict[str, Any]) -> Dict[str, Any]:
    """Pull an IDE edit of this lesson's file into the DB (or rewrite a stale file).

    Uses the path recorded at the last reconcile, so it costs one file read."""
    root = classes_root()
    rel = lesson.get("file_path") or ""
    if root is None or not rel or not _safe_rel(rel):
        return lesson
    with _LOCK:
        try:
            file_text = _read(root / rel)
        except _Unreadable as exc:
            print(f"[ai_lms] skipping {rel}: {exc}")
            return lesson
        db_html = lesson.get("generated_html") or ""
        if file_text is None or file_text == db_html:
            return lesson
        conn = _get_conn()
        try:
            current = _merge(conn, "lesson", lesson["id"], rel, db_html, lesson.get("file_hash") or "", file_text)
            current_hash = content_hash(current)
            if current != db_html:
                now = _now()
                conn.execute(
                    "UPDATE lms_lessons SET generated_html = ?, updated_at = ?, file_hash = ? WHERE id = ?",
                    (current, now, current_hash, lesson["id"]),
                )
                lesson = {**lesson, "generated_html": current, "updated_at": now, "file_hash": current_hash}
            elif _writable(root) and _write(root / rel, current):
                conn.execute("UPDATE lms_lessons SET file_hash = ? WHERE id = ?", (current_hash, lesson["id"]))
                lesson = {**lesson, "file_hash": current_hash}
            conn.commit()
        finally:
            conn.close()
    return lesson


def get_landing(class_identifier: str) -> Optional[Dict[str, Any]]:
    """The class landing page as the app should render it (IDE edits pulled in, auto
    blocks current). Works without a classes folder too: then it lives in the DB only."""
    root = classes_root()
    writable = _writable(root)
    with _LOCK:
        conn = _get_conn()
        try:
            row = conn.execute(f"SELECT {_CLASS_COLS} FROM lms_classes WHERE id = ? OR slug = ?", (class_identifier, class_identifier)).fetchone()
            if row is None:
                return None
            cls = dict(row)
            subjects, lessons = _load_class_rows(conn, cls["id"], with_html=False)
            manifest, placements = _layout(cls, subjects, lessons)
            html, digest = _sync_landing(conn, root, writable, cls, manifest, len(placements))
            conn.commit()
        finally:
            conn.close()
    return {
        "class_id": cls["id"],
        "class_slug": cls["slug"],
        "html": html,
        "hash": digest,
        "file_path": f"{cls['slug']}/{LANDING_FILE}",
        "file_sync": root is not None,
    }


def resolve_path(path: str) -> Optional[Dict[str, Any]]:
    """Map a classes-folder path (where a link in a landing page or lesson points) to
    the class / subject / lesson it shows, so the app can navigate to its own route."""
    parts = [p for p in path.strip().split("/") if p not in ("", ".")]
    if not parts or ".." in parts:
        return None
    if parts[-1] == "index.html":
        parts = parts[:-1]
    if not parts:
        return None
    conn = _get_conn()
    try:
        row = conn.execute(f"SELECT {_CLASS_COLS} FROM lms_classes WHERE slug = ?", (parts[0],)).fetchone()
        if row is None:
            return None
        cls = dict(row)
        target = {"class_slug": cls["slug"]}
        if len(parts) == 1:
            return {"kind": "class", **target}
        if len(parts) == 2 and parts[1] == LANDING_FILE:
            return {"kind": "landing", **target}
        subjects, lessons = _load_class_rows(conn, cls["id"], with_html=False)
        slugs = {s["id"]: s["slug"] for s in subjects}
        if len(parts) == 2 and parts[1] in slugs.values():
            return {"kind": "subject", **target, "subject_slug": parts[1]}
        _, placements = _layout(cls, subjects, lessons)
        rel = "/".join(parts)
        for lesson, lesson_rel in placements:
            if lesson_rel == rel:
                return {
                    "kind": "lesson",
                    **target,
                    "subject_slug": slugs.get(lesson["subject_id"] or ""),
                    "lesson_id": lesson["id"],
                    "lesson_slug": lesson["slug"],
                }
        return None
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Export: the class as a deployable static site
# ─────────────────────────────────────────────────────────────────────────────

def _index_html(name: Any) -> str:
    """index.html for an exported class: static hosts serve it at the folder root."""
    title = _esc(_unent(name))
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n'
        f'  <meta http-equiv="refresh" content="0; url={LANDING_FILE}">\n'
        f"  <title>{title}</title>\n</head>\n<body>\n"
        f'  <p><a href="{LANDING_FILE}">{title}</a></p>\n</body>\n</html>\n'
    )


def _deploy_files(cls: Dict[str, Any]) -> Dict[str, str]:
    """templates/deploy/* (Dockerfile + nginx config for Cloud Run, vercel.json, README),
    with {{CLASS_NAME}} / {{CLASS_SLUG}} filled in."""
    directory = _TEMPLATES / "deploy"
    if not directory.is_dir():
        return {}
    files = {}
    for path in sorted(directory.iterdir(), key=lambda p: p.name):
        text = _read_quiet(path) if path.is_file() else None
        if text is not None:
            files[path.name] = text.replace("{{CLASS_NAME}}", _unent(cls["name"])).replace("{{CLASS_SLUG}}", cls["slug"])
    return files


def export_class(class_identifier: str) -> Optional[Tuple[str, Dict[str, str]]]:
    """Every file of one class as {path inside the class folder: content}, ready to
    deploy: the landing page, an index.html pointing at it, each lesson at its folder
    path, class.json, plus the deploy files (vercel.json for Vercel, a Dockerfile serving
    the site with nginx for Google Cloud Run, README). Built from the DB after pulling in
    IDE edits, so it works with or without a classes folder (e.g. on a read-only deploy)."""
    try:
        reconcile_class(class_identifier)
    except Exception as exc:
        print(f"[ai_lms] class folder sync before export failed: {exc}")
    landing = get_landing(class_identifier)
    if landing is None:
        return None
    conn = _get_conn()
    try:
        cls = dict(conn.execute(f"SELECT {_CLASS_COLS} FROM lms_classes WHERE id = ?", (landing["class_id"],)).fetchone())
        subjects, lessons = _load_class_rows(conn, cls["id"])
    finally:
        conn.close()
    manifest, placements = _layout(cls, subjects, lessons)
    slug = cls["slug"]
    files = {LANDING_FILE: landing["html"]}
    for lesson, rel in placements:
        files[rel[len(slug) + 1:]] = lesson["generated_html"] or ""
    manifest["files"] = {name: content_hash(text) for name, text in files.items()}
    files[MANIFEST_FILE] = _manifest_text(manifest)
    files["index.html"] = _index_html(cls["name"])
    for name, text in _deploy_files(cls).items():
        files.setdefault(name, text)
    return slug, files


if __name__ == "__main__":
    import argparse

    from .db import init_lms_db

    parser = argparse.ArgumentParser(description="Sync the AI LMS class folders with the DB (both directions).")
    parser.add_argument(
        "--prefer-db",
        action="store_true",
        help="Let the DB win every disagreement, e.g. after copying newer lms_* tables onto an older "
        "checkout of the class folders. The replaced files go to lms_html_backups.",
    )
    args = parser.parse_args()
    _PREFER_DB = args.prefer_db
    init_lms_db()
    reconcile_all()
    folder = classes_root()
    print(f"class folders synced: {folder}" if folder else "class folder sync is off (see classes_root())")


# ─────────────────────────────────────────────────────────────────────────────
# Landing page: saving an edit made in the app
# ─────────────────────────────────────────────────────────────────────────────

class LandingConflict(Exception):
    """The landing page changed since the editor loaded it (base_hash mismatch)."""


def save_landing(class_identifier: str, html: str, base_hash: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Replace the landing page with HTML edited in the app (manual or AI).

    The previous HTML goes to lms_html_backups. landing_hash (the "base") is left alone, so
    the next reconcile sees DB != base and file == base and writes the new page to
    landingpage.html. base_hash guards against clobbering an IDE edit made meanwhile."""
    current = get_landing(class_identifier)  # pulls in IDE edits, so base_hash compares to the disk
    if current is None:
        return None
    if base_hash and base_hash != current["hash"]:
        raise LandingConflict("The landing page changed since you opened it. Reload and re-apply your edit.")
    if html == current["html"]:
        return current
    with _LOCK:
        conn = _get_conn()
        try:
            _backup(conn, "landing", current["class_id"], current["file_path"], current["html"], "replaced by an app edit")
            conn.execute("UPDATE lms_classes SET landing_html = ? WHERE id = ?", (html, current["class_id"]))
            conn.commit()
        finally:
            conn.close()
    reconcile_class(current["class_id"])
    return get_landing(current["class_id"])


# ─────────────────────────────────────────────────────────────────────────────
# Module-root landing page: the AI LMS home/intro page, not tied to any one class.
# Lives at classes/landingpage.html (a loose file alongside the per-class folders) and
# frontend/fe-apis/lms/classFolders.ts has a byte-identical twin. Its lms:auto:classes and
# lms:auto:stats blocks list every class; everything else on the page is free to edit,
# same as a class landing page's own non-auto content.
# ─────────────────────────────────────────────────────────────────────────────

_MODULE_FALLBACK_TEMPLATE = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n"
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
    "  <title>AI LMS</title>\n</head>\n<body>\n"
    "  <h1>AI LMS</h1>\n"
    "  <p><!-- lms:auto:stats --><!-- /lms:auto:stats --></p>\n"
    "  <main id=\"classes\">\n"
    "    <!-- lms:auto:classes --><!-- /lms:auto:classes -->\n"
    "  </main>\n</body>\n</html>\n"
)


def _module_template() -> str:
    return _read_quiet(_TEMPLATES / "module-landingpage.html") or _MODULE_FALLBACK_TEMPLATE


def _module_class_card(cls: Dict[str, Any]) -> List[str]:
    name = _esc(_unent(cls["name"]))
    href = f"{_esc(cls['slug'])}/"
    subject_count, lesson_count = cls["subject_count"], cls["lesson_count"]
    out = [
        '    <article class="lms-card">',
        '      <span class="lms-tag">Class</span>',
        f'      <h3><a href="{href}">{name}</a></h3>',
    ]
    if cls["description"]:
        out.append(f'      <p>{_esc(cls["description"])}</p>')
    out.append(
        f'      <p class="lms-muted">{_stat(subject_count, "subject", "subjects")} '
        f'&middot; {_stat(lesson_count, "lesson", "lessons")}</p>'
    )
    out.append(f'      <a class="lms-card-link" href="{href}">Enter class &rarr;</a>')
    return out


def _module_auto_blocks(classes: List[Dict[str, Any]]) -> Dict[str, str]:
    if classes:
        body = ['  <div class="lms-grid">']
        for cls in classes:
            body += _module_class_card(cls) + ["    </article>"]
        classes_html = _section("classes", "Available Classes", body + ["  </div>"])
    else:
        classes_html = _section(
            "classes", "Available Classes", ['  <p class="lms-muted">No classes yet. Create one from the AI LMS dashboard.</p>']
        )
    return {
        "stats": " ".join([
            _stat(len(classes), "class", "classes"),
            _stat(sum(c["subject_count"] for c in classes), "subject", "subjects"),
            _stat(sum(c["lesson_count"] for c in classes), "lesson", "lessons"),
        ]),
        "classes": classes_html,
    }


def apply_module_auto_blocks(html: str, classes: List[Dict[str, Any]]) -> str:
    """Rewrite the lms:auto:stats / lms:auto:classes marker pairs; leave everything else alone."""
    blocks = _module_auto_blocks(classes)

    def fill(match: "re.Match[str]") -> str:
        name = match.group(2)
        return match.group(1) + blocks[name] + match.group(4) if name in blocks else match.group(0)

    return _AUTO_BLOCK.sub(fill, html)


def _all_classes_for_module_landing(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    return [
        dict(r)
        for r in conn.execute(
            "SELECT c.id, c.slug, c.name, c.description, "
            "(SELECT COUNT(*) FROM lms_subjects s WHERE s.class_id = c.id) AS subject_count, "
            "(SELECT COUNT(*) FROM lms_lessons l WHERE l.class_id = c.id) AS lesson_count "
            "FROM lms_classes c ORDER BY c.order_index ASC, c.is_system DESC, c.name ASC"
        )
    ]


def _sync_module_landing(conn: sqlite3.Connection, root: Optional[Path], writable: bool) -> Tuple[str, str]:
    """Three-way sync of classes/landingpage.html, mirroring _sync_landing but for the
    module-root page: its lms:auto blocks list every class instead of one class's contents."""
    row = conn.execute("SELECT html, hash, data_hash FROM lms_module_landing WHERE id = ?", (MODULE_LANDING_ID,)).fetchone()
    db_html = (row["html"] if row else "") or ""
    base = (row["hash"] if row else "") or ""
    prior_data_hash = (row["data_hash"] if row else "") or ""
    path = root / LANDING_FILE if root is not None else None
    try:
        file_text = _read(path) if path is not None else None
    except _Unreadable as exc:
        print(f"[ai_lms] skipping module {LANDING_FILE}: {exc}")
        return db_html, content_hash(db_html)
    created = False
    if file_text is None:
        current = db_html
        if not current:
            current = _module_template()
            created = True
    elif not db_html:
        current = file_text  # e.g. the file was created before this table existed
    else:
        current = _merge(conn, "module_landing", MODULE_LANDING_ID, LANDING_FILE, db_html, base, file_text)
    classes = _all_classes_for_module_landing(conn)
    data_hash = content_hash(json.dumps(classes, ensure_ascii=False, sort_keys=True))
    final = current
    if created or data_hash != prior_data_hash:
        final = apply_module_auto_blocks(current, classes)
    final_hash = content_hash(final)
    file_ok = file_text == final
    if path is not None and writable and not file_ok:
        file_ok = _write(path, final)
    new_base = final_hash if file_ok else base
    if row is None:
        conn.execute(
            "INSERT INTO lms_module_landing (id, html, hash, data_hash, updated_at) VALUES (?, ?, ?, ?, ?)",
            (MODULE_LANDING_ID, final, new_base, data_hash, _now()),
        )
    elif final != db_html or new_base != base or data_hash != prior_data_hash:
        conn.execute(
            "UPDATE lms_module_landing SET html = ?, hash = ?, data_hash = ?, updated_at = ? WHERE id = ?",
            (final, new_base, data_hash, _now(), MODULE_LANDING_ID),
        )
    return final, final_hash


def reconcile_module_landing() -> None:
    """Sync classes/landingpage.html on its own, e.g. right after it's edited."""

    def work(conn: sqlite3.Connection, root: Path, writable: bool) -> None:
        _sync_module_landing(conn, root, writable)

    _locked_sync(work)


def get_module_landing() -> Dict[str, Any]:
    """The AI LMS module-root landing page, IDE edits pulled in and auto blocks current."""
    root = classes_root()
    writable = _writable(root)
    with _LOCK:
        conn = _get_conn()
        try:
            html_text, digest = _sync_module_landing(conn, root, writable)
            conn.commit()
        finally:
            conn.close()
    return {
        "html": html_text,
        "hash": digest,
        "file_path": LANDING_FILE,
        "file_sync": root is not None,
    }


def save_module_landing(html: str, base_hash: Optional[str] = None) -> Dict[str, Any]:
    """Replace the module-root landing page with HTML edited in the app (manual or AI)."""
    current = get_module_landing()  # pulls in IDE edits, so base_hash compares to the disk
    if base_hash and base_hash != current["hash"]:
        raise LandingConflict("The landing page changed since you opened it. Reload and re-apply your edit.")
    if html == current["html"]:
        return current
    with _LOCK:
        conn = _get_conn()
        try:
            _backup(conn, "module_landing", MODULE_LANDING_ID, current["file_path"], current["html"], "replaced by an app edit")
            conn.execute("UPDATE lms_module_landing SET html = ? WHERE id = ?", (html, MODULE_LANDING_ID))
            conn.commit()
        finally:
            conn.close()
    reconcile_module_landing()
    return get_module_landing()
