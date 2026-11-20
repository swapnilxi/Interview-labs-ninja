"""Workbook access rules + twin check (standalone, like the other backend/tests scripts; no FastAPI needed).

    cd backend && python3 tests/lms_workbooks_test.py      (needs Node 22.18+ on PATH for the twin half)

Runs one scenario of workbook calls through modules/ai_lms/workbooks.py and through its Next.js twin
frontend/fe-apis/lms/workbooks.ts, each against its own COPY of the real database (never the live file), then:
  1. checks the privacy and permission rules on the Python answers (a private workbook is invisible to everyone else,
     admins included; a learner cannot share or publish to the class; a class draft is hidden from learners; a learner
     never receives the source text; deleting a class removes its workbooks and everyone's progress), and
  2. diffs the two backends' answers step by step (ids and timestamps normalized): same bodies, statuses and texts.
Exits non-zero if any check fails.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
WORKBOOKS_TS = REPO / "frontend" / "fe-apis" / "lms" / "workbooks.ts"
sys.path.insert(0, str(ROOT))

scratch = Path(tempfile.mkdtemp(prefix="lms-workbooks-"))
PY_DB = scratch / "py.sqlite3"
TS_DB = scratch / "ts.sqlite3"
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", PY_DB)
shutil.copy(ROOT / "data" / "lab_ninja.sqlite3", TS_DB)
os.environ["LABNINJA_TEST_DB_PATH"] = str(PY_DB)
os.environ["LMS_CLASSES_DIR"] = str(scratch / "classes")

from modules.ai_lms import workbook_gen, workbooks  # noqa: E402

LEARNER, LEARNER2, EDITOR = 900001, 900002, 900003

conn = sqlite3.connect(PY_DB)
CLASS = conn.execute("SELECT slug FROM lms_classes ORDER BY slug LIMIT 1").fetchone()[0]
conn.close()

EMOJI_TITLE = "\U0001F4D8" * 120  # 120 code points, 240 UTF-16 units: allowed on both sides
LONG = "x" * 121

# Material for the shared workbook: 8 paragraphs of ~420 characters = 4 parts (two paragraphs each).
BOOK = "\n\n".join(
    f"Paragraph {n}. " + ("Small daily habits compound into large results over time. " * 7) for n in range(1, 9)
)

# What an AI might answer: overlapping and missing ranges, floats, junk entries, too many fields.
OUTLINE_RAW = {
    "summary": "  A workbook\r\n\r\n\r\nabout habits.\x07 ",
    "outcomes": ["Build one habit", "", 5, "Track it daily", "x" * 300],
    "chapters": [
        {"title": "Why habits matter", "summary": "The compound effect.", "goals": ["Explain compounding"], "from": 1, "to": 1, "minutes": 12.0},
        "not a chapter",
        {"title": "", "from": 2},
        {"title": "  Make it   obvious\n", "summary": None, "goals": "nope", "from": 1, "to": 9, "minutes": True},
        {"title": "\ufeffMake it easy\ufeff", "goals": ["Shrink a habit", "Plan cues", "a", "b", "c", "d"], "minutes": 999},
        {"title": "Past the end", "from": 7},
    ],
}

SECTION_RAW = {
    "blocks": [
        {"type": "reading", "title": "Key ideas", "body": "First paragraph.\r\n\r\n\r\n\r\nSecond \u2028paragraph.  "},
        {"type": "key_points", "items": ["One", "", "Two", None]},
        {"type": "reflection", "prompt": "Where do you lose time?", "hint": "Think of yesterday."},
        {"type": "short_answer", "prompt": ""},
        {"type": "checklist", "title": "Set up", "items": ["Pick a cue", "Pick a time"]},
        {"type": "planner", "title": "My plan", "fields": ["Habit", "When", "Where"]},
        {"type": "habit_tracker", "habit": "Read one page", "days": 45, "why": "Momentum"},
        {"type": "scale", "prompt": "I keep promises to myself", "max": 10},
        {"type": "action", "text": "Put the book on your pillow."},
        {"type": "video", "url": "x"},
        {"type": "quiz", "title": "Check yourself", "questions": [
            {"kind": "mcq", "prompt": "What compounds?", "options": ["Habits", "Luck", "Weather"], "answer": "B", "explanation": "Luck."},
            {"kind": "mcq", "prompt": "Pick", "options": ["A thing", "Another"], "answer": "another"},
            {"kind": "mcq", "prompt": "Out of range", "options": ["a", "b"], "answer": 5},
            {"kind": "true_false", "prompt": "Small habits matter.", "answer": " TRUE "},
            {"kind": "true_false", "prompt": "Bad", "answer": "yes"},
            {"kind": "fill_blank", "prompt": "Habits are the _____ interest of self-improvement.", "answer": "compound", "accept": ["Compound", "compounding"]},
            {"kind": "fill_blank", "prompt": "No blank here", "answer": "x"},
            {"type": "matching", "prompt": "", "pairs": [{"left": "Cue", "right": "Trigger"}, {"left": "Reward", "right": "Payoff"}, {"left": "x"}]},
            {"kind": "matching", "pairs": [{"left": "Only", "right": "one"}]},
            {"kind": "scenario", "scenario": "You skipped two days.", "prompt": "", "options": ["Quit", "Start again today"], "answer": 1.0},
            {"kind": "scenario", "prompt": "No scenario text", "options": ["a", "b"], "answer": 0},
            {"kind": "essay", "prompt": "?"},
        ]},
    ]
}

# A long source with emoji and one giant paragraph, for the splitter and the outline's excerpt path.
LONG_SOURCE = "\n\n".join(
    [("\U0001F600 Emoji line %d. " % n) * 40 for n in range(60)] + ["\U0001F4D8" * 9000] + ["tail " * 50]
)

# (label, op, args). "$name" in a workbook id refers to the id a create step saved under that name.
SCENARIO: list[tuple] = [
    ("empty list", "list", [CLASS, LEARNER, False]),
    ("learner creates private", "create", [CLASS, LEARNER, False, {
        "title": "  My  morning\nroutine ", "description": "Line one\r\nLine two\x07", "source_name": "notes.txt",
        "source_text": "Wake up early.\r\n\r\nDrink water.", "instructions": "Keep it short", "icon": "SunIcon"}], "A"),
    ("learner cannot share", "create", [CLASS, LEARNER, False, {"title": "x", "source_text": "y", "visibility": "class"}]),
    ("title missing", "create", [CLASS, LEARNER, False, {"source_text": "y"}]),
    ("title blank", "create", [CLASS, LEARNER, False, {"title": " \n ", "source_text": "y"}]),
    ("title not text", "create", [CLASS, LEARNER, False, {"title": 5, "source_text": "y"}]),
    ("title too long", "create", [CLASS, LEARNER, False, {"title": LONG, "source_text": "y"}]),
    ("emoji title fits", "create", [CLASS, LEARNER, False, {"title": EMOJI_TITLE, "source_text": "y"}], "E"),
    ("no source", "create", [CLASS, LEARNER, False, {"title": "t"}]),
    ("bad visibility", "create", [CLASS, LEARNER, False, {"title": "t", "source_text": "y", "visibility": "public"}]),
    ("bad icon", "create", [CLASS, LEARNER, False, {"title": "t", "source_text": "y", "icon": "<svg>"}]),
    ("not an object", "create", [CLASS, LEARNER, False, ["title"]]),
    ("unknown class", "create", ["no-such-class", LEARNER, False, {"title": "t", "source_text": "y"}]),
    ("editor creates class draft", "create", [CLASS, EDITOR, True, {"title": "Shared book", "source_text": BOOK, "visibility": "class", "instructions": "Use simple words."}], "B"),
    ("learner2 list hides draft", "list", [CLASS, LEARNER2, False]),
    ("learner2 cannot open draft", "get", ["$B", LEARNER2, False]),
    ("learner2 cannot open A", "get", ["$A", LEARNER2, False]),
    ("editor cannot open private A", "get", ["$A", EDITOR, True]),
    ("editor list", "list", [CLASS, EDITOR, True]),
    ("editor publishes too early", "update", ["$B", EDITOR, True, {"status": "published"}]),
    ("learner2 cannot plan a class draft", "outline_job", ["$B", LEARNER2, False]),
    ("editor outline prompt", "outline_job", ["$B", EDITOR, True]),
    ("outline unreadable", "save_outline", ["$B", EDITOR, True, None]),
    ("outline without chapters", "save_outline", ["$B", EDITOR, True, {"chapters": []}]),
    ("editor saves outline", "save_outline", ["$B", EDITOR, True, OUTLINE_RAW]),
    ("chapter prompt s2", "section_job", ["$B", "s2", EDITOR, True]),
    ("unknown chapter", "section_job", ["$B", "s9", EDITOR, True]),
    ("stale chapter refused", "save_section", ["$B", "s1", EDITOR, True, 1, SECTION_RAW]),
    ("chapter with nothing usable", "save_section", ["$B", "s1", EDITOR, True, 2, {"blocks": [{"type": "nope"}]}]),
    ("editor writes s1", "save_section", ["$B", "s1", EDITOR, True, 2, SECTION_RAW]),
    ("publish half written", "update", ["$B", EDITOR, True, {"status": "published"}]),
    ("editor writes s2", "save_section", ["$B", "s2", EDITOR, True, 2, [{"type": "action", "title": "Try", "text": "Do it."}]]),
    ("editor writes s3", "save_section", ["$B", "s3", EDITOR, True, 2, {"blocks": [{"type": "reflection", "prompt": "Why?"}]}]),
    ("editor writes s4", "save_section", ["$B", "s4", EDITOR, True, 2, {"blocks": [{"type": "key_points", "items": ["Last"]}]}]),
    ("editor publishes", "update", ["$B", EDITOR, True, {"status": "published"}]),
    ("no re-plan while published", "outline_job", ["$B", EDITOR, True]),
    ("no rewrite while published", "section_job", ["$B", "s1", EDITOR, True]),
    ("no late save while published", "save_section", ["$B", "s1", EDITOR, True, 2, SECTION_RAW]),
    ("learner2 list sees published", "list", [CLASS, LEARNER2, False]),
    ("learner2 opens published, no source", "get", ["$B", LEARNER2, False]),
    # Progress: two learners in one class workbook, each with a private document; an instructor sees counts only.
    ("learner2 starts empty", "get_progress", ["$B", LEARNER2, False]),
    ("learner2 saves", "save_progress", ["$B", LEARNER2, False, {"version": 0, "state": {
        "done": {"s1-b1": True, "s2-b1": True, "made-up": True, "s1-b2": "yes"},
        "answers": {"s1-b3": "Learner two's private reflection \U0001F331"}, "section": "s1"}}]),
    ("learner2 stale save", "save_progress", ["$B", LEARNER2, False, {"version": 0, "state": {}}]),
    ("learner2 version as text", "save_progress", ["$B", LEARNER2, False, {"version": "1", "state": {}}]),
    ("learner2 state not an object", "save_progress", ["$B", LEARNER2, False, {"version": 1, "state": []}]),
    ("learner2 too large", "save_progress", ["$B", LEARNER2, False, {"version": 1, "state": {"a": "x" * 400_001}}]),
    ("learner2 saves again", "save_progress", ["$B", LEARNER2, False, {"version": 1.0, "state": {
        "done": {"s1-b1": True, "s2-b1": True}, "answers": {"s1-b3": "Learner two's private reflection \U0001F331"}}}]),
    ("learner sees only their own (empty)", "get_progress", ["$B", LEARNER, False]),
    ("learner saves", "save_progress", ["$B", LEARNER, False, {"version": 0, "state": {
        "done": {"s1-b1": True}, "answers": {"s1-b3": "Learner one's secret"}}}]),
    ("learner2 still sees only their own", "get_progress", ["$B", LEARNER2, False]),
    ("learner2 list shows own percent", "list", [CLASS, LEARNER2, False]),
    ("learner2 cannot list learners", "list_learners", ["$B", LEARNER2, False]),
    ("editor lists learners", "list_learners", ["$B", EDITOR, True]),
    ("learner2 cannot reset learner", "reset_learner", ["$B", str(LEARNER), LEARNER2, False]),
    ("editor resets learner", "reset_learner", ["$B", str(LEARNER), EDITOR, True]),
    ("learner2 untouched by that reset", "get_progress", ["$B", LEARNER2, False]),
    ("reset again is 404", "reset_learner", ["$B", str(LEARNER), EDITOR, True]),
    ("reset a bad learner id", "reset_learner", ["$B", "01", EDITOR, True]),
    ("learner2 resets own", "reset_progress", ["$B", LEARNER2, False]),
    ("editor list now empty", "list_learners", ["$B", EDITOR, True]),
    ("learner2 cannot read progress of private A", "get_progress", ["$A", LEARNER2, False]),
    ("no saving before chapters exist", "save_progress", ["$A", LEARNER, False, {"version": 0, "state": {}}]),
    # "Explain this to me": anyone who can see the workbook; only blocks of written chapters; nothing is saved.
    ("learner2 explain a reading", "explain_job", ["$B", LEARNER2, False, {"block_id": "s1-b1", "question": " What does\nthis mean? "}]),
    ("learner2 explain a quiz (no answers)", "explain_job", ["$B", LEARNER2, False, {"block_id": "s1-b9"}]),
    ("explain unknown block", "explain_job", ["$B", LEARNER2, False, {"block_id": "s9-b1"}]),
    ("explain question not text", "explain_job", ["$B", LEARNER2, False, {"block_id": "s1-b1", "question": 5}]),
    ("explain question too long", "explain_job", ["$B", LEARNER2, False, {"block_id": "s1-b1", "question": "q" * 501}]),
    ("explain not an object", "explain_job", ["$B", LEARNER2, False, ["s1-b1"]]),
    ("explain on a workbook you cannot see", "explain_job", ["$A", LEARNER2, False, {"block_id": "s1-b1"}]),
    ("explanation cleaned", "clean_explanation", ["  First.\r\n\r\n\r\n\r\nSecond.\x07  "]),
    ("learner2 cannot edit", "update", ["$B", LEARNER2, False, {"title": "hack"}]),
    ("learner2 cannot generate", "outline_job", ["$B", LEARNER2, False]),
    ("learner2 cannot save a chapter", "save_section", ["$B", "s1", LEARNER2, False, 2, SECTION_RAW]),
    ("learner2 cannot delete", "delete", ["$B", LEARNER2, False]),
    ("learner cannot share own", "update", ["$A", LEARNER, False, {"visibility": "class"}]),
    ("learner cannot publish unwritten own", "update", ["$A", LEARNER, False, {"status": "published"}]),
    ("learner plans own workbook", "outline_job", ["$A", LEARNER, False]),
    ("learner sets own status", "update", ["$A", LEARNER, False, {"status": "archived", "description": None}]),
    ("learner blank title", "update", ["$A", LEARNER, False, {"title": ""}]),
    ("learner bad status", "update", ["$A", LEARNER, False, {"status": "done"}]),
    ("update not an object", "update", ["$A", LEARNER, False, "x"]),
    ("editor makes B private", "update", ["$B", EDITOR, True, {"visibility": "private"}]),
    ("learner2 loses B", "get", ["$B", LEARNER2, False]),
    ("learner list", "list", [CLASS, LEARNER, False]),
    ("learner deletes A", "delete", ["$A", LEARNER, False]),
    ("A is gone", "get", ["$A", LEARNER, False]),
    ("unknown workbook", "get", ["wb-nothing", LEARNER, False]),
    # The pure generator, without a database: the same input must give the same output on both sides.
    ("split long source", "split", [LONG_SOURCE]),
    ("split tiny source", "split", ["  One line only.  "]),
    ("split CR-free blank lines", "split", ["a\n \t\n\n b\n\nc"]),
    ("long outline prompt", "outline_prompt", ["Emoji \U0001F600 book", "Desc", "", LONG_SOURCE]),
    ("one-part outline prompt", "outline_prompt", ["Tiny", "", "Be brief.", "Just one paragraph."]),
    ("cut chapter prompt", "section_prompt", ["Big", "", "", LONG_SOURCE, OUTLINE_RAW, 2]),
    ("outline of a list", "outline_norm", [[OUTLINE_RAW], 3]),
    ("outline aliases sections", "outline_norm", [{"sections": [{"title": "Only", "from": "2"}]}, 4]),
    ("outline capped at 16", "outline_norm", [{"chapters": [{"title": f"C{n}"} for n in range(30)]}, 40]),
    ("section of a string", "section_norm", ["blocks", "s1"]),
    ("section capped at 16", "section_norm", [{"blocks": [{"type": "action", "text": f"T{n}"} for n in range(30)]}, "s4"]),
    ("section texts clipped", "section_norm", [{"blocks": [{"type": "reading", "body": "\U0001F600" * 5000}, {"type": "reflection", "prompt": "\ufeff" + "y " * 400}]}, "s1"]),
]

TS_RUNNER = r"""
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
// workbooks.ts imports './workbookGen' without an extension (the Next.js bundler's way); plain Node needs the .ts.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.')) return next(specifier + '.ts', context);
      throw err;
    }
  },
});
const [, , moduleUrl, dbPath, scenarioPath, outPath] = process.argv;
const wb = await import(moduleUrl);
const gen = await import(new URL('./workbookGen.ts', moduleUrl).href);
const raw = new DatabaseSync(dbPath);
raw.exec('PRAGMA busy_timeout = 5000');
const db = {
  all: (sql, ...p) => raw.prepare(sql).all(...p),
  get: (sql, ...p) => raw.prepare(sql).get(...p),
  run: (sql, ...p) => raw.prepare(sql).run(...p),
  exec: (sql) => raw.exec(sql),
};
const outlineOf = (source, raw) => gen.normalizeOutline(raw, gen.splitSource(source).length).sections;
const sectionPrompt = (title, description, instructions, source, raw, index) => {
  const parts = gen.splitSource(source);
  const sections = outlineOf(source, raw);
  const { material, wasCut } = gen.sectionMaterial(parts, sections[index].from, sections[index].to);
  return { prompt: gen.buildSectionPrompt(title, description, instructions, sections, index, material, wasCut), cut: wasCut };
};
const plain = (fn) => (_db, ...args) => fn(...args);
const fns = {
  list: wb.listWorkbooks, create: wb.createWorkbook, get: wb.getWorkbook, update: wb.updateWorkbook, delete: wb.deleteWorkbook,
  outline_job: wb.outlineJob, save_outline: wb.saveOutline, section_job: wb.sectionJob, save_section: wb.saveSection,
  get_progress: wb.getProgress, save_progress: wb.saveProgress, reset_progress: wb.resetProgress,
  list_learners: wb.listLearners, reset_learner: wb.resetLearner, explain_job: wb.explainJob,
  clean_explanation: plain((raw) => ({ text: gen.cleanExplanation(raw) })),
  split: plain((source) => ({ parts: gen.splitSource(source) })),
  outline_prompt: plain((t, d, i, source) => ({ prompt: gen.buildOutlinePrompt(t, d, i, gen.splitSource(source)) })),
  section_prompt: plain(sectionPrompt),
  outline_norm: plain((raw, n) => gen.normalizeOutline(raw, n)),
  section_norm: plain((raw, sid) => ({ blocks: gen.normalizeSection(raw, sid) })),
};
const saved = {};
const out = [];
for (const [label, op, args, saveAs] of JSON.parse(readFileSync(scenarioPath, 'utf8'))) {
  const real = args.map((a) => (typeof a === 'string' && a.startsWith('$') ? saved[a.slice(1)] : a));
  try {
    const body = fns[op](db, ...real);
    if (saveAs) saved[saveAs] = body.id;
    out.push({ label, status: op === 'create' ? 201 : 200, body });
  } catch (err) {
    if (!(err instanceof wb.WorkbookError) && !(err instanceof gen.GenerationError)) throw err;
    out.push({ label, status: err.status, body: { detail: err.detail } });
  }
}
writeFileSync(outPath, JSON.stringify({ out, saved }));
"""


def _section_prompt(title, description, instructions, source, raw, index):
    parts = workbook_gen.split_source(source)
    sections = workbook_gen.normalize_outline(raw, len(parts))["sections"]
    material, was_cut = workbook_gen.section_material(parts, sections[index]["from"], sections[index]["to"])
    prompt = workbook_gen.build_section_prompt(title, description, instructions, sections, index, material, was_cut)
    return {"prompt": prompt, "cut": was_cut}


def run_python() -> tuple[list[dict], dict[str, str]]:
    fns = {
        "list": workbooks.list_workbooks,
        "create": workbooks.create_workbook,
        "get": workbooks.get_workbook,
        "update": workbooks.update_workbook,
        "delete": workbooks.delete_workbook,
        "outline_job": workbooks.outline_job,
        "save_outline": workbooks.save_outline,
        "section_job": workbooks.section_job,
        "save_section": workbooks.save_section,
        "get_progress": workbooks.get_progress,
        "save_progress": workbooks.save_progress,
        "reset_progress": workbooks.reset_progress,
        "list_learners": workbooks.list_learners,
        "reset_learner": workbooks.reset_learner,
        "explain_job": workbooks.explain_job,
        "clean_explanation": lambda raw: {"text": workbook_gen.clean_explanation(raw)},
        "split": lambda source: {"parts": workbook_gen.split_source(source)},
        "outline_prompt": lambda t, d, i, source: {
            "prompt": workbook_gen.build_outline_prompt(t, d, i, workbook_gen.split_source(source))
        },
        "section_prompt": _section_prompt,
        "outline_norm": workbook_gen.normalize_outline,
        "section_norm": lambda raw, sid: {"blocks": workbook_gen.normalize_section(raw, sid)},
    }
    saved: dict[str, str] = {}
    out = []
    for step in SCENARIO:
        label, op, args = step[0], step[1], step[2]
        real = [saved[a[1:]] if isinstance(a, str) and a.startswith("$") else a for a in args]
        try:
            body = fns[op](*real)
            if len(step) > 3:
                saved[step[3]] = body["id"]
            out.append({"label": label, "status": 201 if op == "create" else 200, "body": body})
        except (workbooks.WorkbookError, workbook_gen.GenerationError) as err:
            out.append({"label": label, "status": err.status_code, "body": {"detail": err.detail}})
    return out, saved


def run_typescript() -> tuple[list[dict], dict[str, str]] | None:
    node = shutil.which("node")
    if not node:
        print("SKIP twin check: node is not on PATH")
        return None
    runner = scratch / "runner.mjs"
    runner.write_text(TS_RUNNER)
    scenario_path = scratch / "scenario.json"
    scenario_path.write_text(json.dumps([[s[0], s[1], s[2], s[3] if len(s) > 3 else None] for s in SCENARIO]))
    out_path = scratch / "ts.json"
    done = subprocess.run(
        [node, "--no-warnings", str(runner), WORKBOOKS_TS.as_uri(), str(TS_DB), str(scenario_path), str(out_path)],
        capture_output=True, text=True, timeout=120,
    )
    if done.returncode != 0:
        sys.exit(f"The TypeScript twin did not run (needs Node 22.18+):\n{done.stderr[-2000:]}")
    data = json.loads(out_path.read_text())
    return data["out"], data["saved"]


TS_PATTERN = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")


def normalize(value, ids: dict[str, str]):
    if isinstance(value, dict):
        return {k: normalize(v, ids) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v, ids) for v in value]
    if isinstance(value, str):
        if TS_PATTERN.match(value):
            return "<timestamp>"
        for name, real in ids.items():
            value = value.replace(real, f"<{name}>")
    return value


failures: list[str] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    print(("PASS" if ok else "FAIL"), name, extra)
    if not ok:
        failures.append(name)


py_out, py_ids = run_python()
by = {step["label"]: step for step in py_out}

# ── 1. The rules, on the Python answers ──────────────────────────────────────
check("learner creates a private draft", by["learner creates private"]["status"] == 201
      and by["learner creates private"]["body"]["visibility"] == "private"
      and by["learner creates private"]["body"]["status"] == "draft")
check("title is one cleaned line", by["learner creates private"]["body"]["title"] == "My  morning routine")
check("source keeps paragraphs, CRLF normalized", by["learner creates private"]["body"]["source_text"] == "Wake up early.\n\nDrink water.")
check("control characters dropped", by["learner creates private"]["body"]["description"] == "Line one\nLine two")
check("learner cannot share with the class", by["learner cannot share"]["status"] == 403)
for label in ("title missing", "title blank", "title not text", "title too long", "no source", "bad visibility",
              "bad icon", "not an object", "learner blank title", "learner bad status", "update not an object"):
    check(f"422: {label}", by[label]["status"] == 422, by[label]["body"].get("detail", ""))
check("emoji title counts code points", by["emoji title fits"]["status"] == 201)
check("unknown class is 404", by["unknown class"]["status"] == 404)
check("class draft hidden from learners", by["learner2 list hides draft"]["body"] == []
      and by["learner2 cannot open draft"]["status"] == 404)
check("private workbook invisible to another learner", by["learner2 cannot open A"]["status"] == 404)
check("private workbook invisible to an editor", by["editor cannot open private A"]["status"] == 404)
check("editor list shows own draft only", [w["title"] for w in by["editor list"]["body"]] == ["Shared book"])
check("published workbook visible to learners", [w["title"] for w in by["learner2 list sees published"]["body"]] == ["Shared book"])
opened = by["learner2 opens published, no source"]["body"]
check("learner gets no source text or instructions", "source_text" not in opened and "instructions" not in opened
      and opened["can_edit"] is False and opened["is_owner"] is False)
check("learner cannot edit or delete a class workbook", by["learner2 cannot edit"]["status"] == 403
      and by["learner2 cannot delete"]["status"] == 403)
check("learner cannot share own workbook", by["learner cannot share own"]["status"] == 403)
check("learner may change own private status; None keeps a field", by["learner sets own status"]["status"] == 200
      and by["learner sets own status"]["body"]["status"] == "archived"
      and by["learner sets own status"]["body"]["description"] == "Line one\nLine two")
check("unpublished-by-privatising hides it again", by["learner2 loses B"]["status"] == 404)
check("delete removes it", by["learner deletes A"]["status"] == 200 and by["A is gone"]["status"] == 404)

# Generation.
check("publishing needs every chapter written", by["editor publishes too early"]["status"] == 409
      and by["publish half written"]["status"] == 409 and by["learner cannot publish unwritten own"]["status"] == 409)
check("a learner cannot plan, save or even see a class draft's prompt",
      by["learner2 cannot plan a class draft"]["status"] == 404 and by["learner2 cannot generate"]["status"] == 403
      and by["learner2 cannot save a chapter"]["status"] == 403)
check("a learner may generate their own workbook", "prompt" in by["learner plans own workbook"]["body"])
prompt = by["editor outline prompt"]["body"]["prompt"]
check("outline prompt carries the parts and the author's instructions",
      "[[P1]]" in prompt and "[[P4]]" in prompt and "[[P5]]" not in prompt and "Use simple words." in prompt)
check("unreadable or empty outline is a 502", by["outline unreadable"]["status"] == 502
      and by["outline without chapters"]["status"] == 502)
outline = by["editor saves outline"]["body"]
sections = outline["content"]["sections"]
check("outline: junk dropped, ranges cover every part once",
      [(x["id"], x["title"], x["from"], x["to"]) for x in sections]
      == [("s1", "Why habits matter", 1, 1), ("s2", "Make it obvious", 2, 2), ("s3", "Make it easy", 3, 3),
         ("s4", "Past the end", 4, 4)],
      json.dumps([(x["title"], x["from"], x["to"]) for x in sections]))
check("outline: all pending, minutes clamped, version moved on",
      all(x["status"] == "pending" and x["blocks"] == [] for x in sections)
      and [x["minutes"] for x in sections] == [12, 15, 120, 15] and outline["template_version"] == 2
      and outline["estimated_minutes"] == 162 and outline["section_count"] == 4)
check("outline: summary keeps one blank line, outcomes cleaned",
      outline["content"]["summary"] == "A workbook\n\nabout habits." and outline["content"]["outcomes"]
      == ["Build one habit", "Track it daily", "x" * 200], json.dumps(outline["content"]["outcomes"])[:200])
chapter_prompt = by["chapter prompt s2"]["body"]
check("chapter prompt: only its own part, the version it belongs to",
      "CHAPTER 2: Make it obvious" in chapter_prompt["prompt"] and "Paragraph 4." in chapter_prompt["prompt"]
      and "Paragraph 1." not in chapter_prompt["prompt"] and chapter_prompt["template_version"] == 2)
check("unknown chapter is a 404", by["unknown chapter"]["status"] == 404)
check("a chapter written for an older outline is refused", by["stale chapter refused"]["status"] == 409)
check("a chapter with nothing usable is a 502", by["chapter with nothing usable"]["status"] == 502)
s1 = by["editor writes s1"]["body"]["content"]["sections"][0]
blocks = {b["type"]: b for b in s1["blocks"]}
check("chapter: ready, junk blocks dropped, ids in order", s1["status"] == "ready"
      and [b["type"] for b in s1["blocks"]] == ["reading", "key_points", "reflection", "checklist", "planner",
                                                 "habit_tracker", "scale", "action", "quiz"]
      and [b["id"] for b in s1["blocks"]] == [f"s1-b{n}" for n in range(1, 10)])
check("chapter: reading keeps one blank line", blocks["reading"]["body"] == "First paragraph.\n\nSecond \u2028paragraph.")
check("chapter: item ids, days clamped, scale defaults",
      [i["id"] for i in blocks["checklist"]["items"]] == ["s1-b4-i1", "s1-b4-i2"]
      and blocks["habit_tracker"]["days"] == 30 and blocks["scale"]["max"] == 10
      and blocks["scale"]["min_label"] == "Not at all")
quiz = blocks["quiz"]["questions"]
check("quiz: bad questions dropped, answers read leniently",
      [(q["kind"], q.get("answer")) for q in quiz]
      == [("mcq", 1), ("mcq", 1), ("true_false", True), ("fill_blank", "compound"), ("matching", None),
          ("scenario", 1), ("mcq", 0)],
      json.dumps([(q["kind"], q.get("answer")) for q in quiz]))
check("quiz: blank normalized, duplicate accepted answer dropped, matching keeps whole pairs",
      quiz[3]["prompt"] == "Habits are the ___ interest of self-improvement." and quiz[3]["accept"] == ["compounding"]
      and len(quiz[4]["pairs"]) == 2 and quiz[4]["prompt"] == "Match each item with its pair."
      and quiz[5]["prompt"] == "What should they do?")
check("publishing works once every chapter is written", by["editor publishes"]["status"] == 200
      and by["editor publishes"]["body"]["status"] == "published")
check("a published workbook is not re-planned or rewritten", by["no re-plan while published"]["status"] == 409
      and by["no rewrite while published"]["status"] == 409 and by["no late save while published"]["status"] == 409)
parts = by["split long source"]["body"]["parts"]
check("splitter: no part longer than 4,000 characters, nothing lost",
      max(len(x) for x in parts) <= 4000 and "".join(parts).count("\U0001F4D8") == 9000)
check("long outline prompt shows excerpts", "only the opening of each part" in by["long outline prompt"]["body"]["prompt"])
check("one-part outline asks for one chapter", "- Write 1 chapter:" in by["one-part outline prompt"]["body"]["prompt"])
check("caps: 16 chapters, 16 blocks", len(by["outline capped at 16"]["body"]["sections"]) == 16
      and len(by["section capped at 16"]["body"]["blocks"]) == 16)

# Progress and isolation.
check("progress starts empty at version 0", by["learner2 starts empty"]["body"]["version"] == 0
      and by["learner2 starts empty"]["body"]["state"] == {} and by["learner2 starts empty"]["body"]["started_at"] is None)
saved = by["learner2 saves"]["body"]
check("save counts only real blocks marked true", saved["version"] == 1
      and saved["summary"] == {"percent": 16, "done": 2, "total": 12}, json.dumps(saved["summary"]))
check("a stale save is refused", by["learner2 stale save"]["status"] == 409)
for label in ("learner2 version as text", "learner2 state not an object"):
    check(f"422: {label}", by[label]["status"] == 422, by[label]["body"].get("detail", ""))
check("an oversized document is refused", by["learner2 too large"]["status"] == 413)
check("15.0-style version accepted", by["learner2 saves again"]["body"]["version"] == 2)
check("ISOLATION: a learner never gets another learner's answers",
      by["learner sees only their own (empty)"]["body"]["state"] == {}
      and "Learner one" not in json.dumps(by["learner2 still sees only their own"]["body"])
      and "Learner two" in json.dumps(by["learner2 still sees only their own"]["body"]))
check("class list shows the caller's own percent", by["learner2 list shows own percent"]["body"][0]["my_progress"]["percent"] == 16)
check("only instructors list learners", by["learner2 cannot list learners"]["status"] == 403
      and by["learner2 cannot reset learner"]["status"] == 403)
learners = by["editor lists learners"]["body"]
check("ISOLATION: the learner list carries no answers",
      sorted(x["user_id"] for x in learners) == [LEARNER, LEARNER2] and "secret" not in json.dumps(learners)
      and "reflection" not in json.dumps(learners) and all(set(x) == {"user_id", "name", "percent", "done", "total",
      "started_at", "last_accessed_at"} for x in learners), json.dumps(learners)[:300])
check("ISOLATION: resetting one learner leaves the other", by["editor resets learner"]["status"] == 200
      and by["learner2 untouched by that reset"]["body"]["version"] == 2
      and by["learner2 untouched by that reset"]["body"]["summary"]["done"] == 2)
check("reset of nothing / bad id is 404", by["reset again is 404"]["status"] == 404
      and by["reset a bad learner id"]["status"] == 404)
check("own reset empties the document", by["learner2 resets own"]["body"]["version"] == 0
      and by["editor list now empty"]["body"] == [])
check("no progress on a workbook you cannot see", by["learner2 cannot read progress of private A"]["status"] == 404)
check("no saving before chapters exist", by["no saving before chapters exist"]["status"] == 409)

# Explain.
explain = by["learner2 explain a reading"]["body"]
check("explain: a learner may ask about a published workbook", by["learner2 explain a reading"]["status"] == 200
      and "The learner asks: What does this mean?" in explain["prompt"] and "Key ideas" in explain["prompt"]
      and explain["max_tokens"] == 1024)
quiz_prompt = by["learner2 explain a quiz (no answers)"]["body"]["prompt"]
check("explain: a quiz gives its questions, never its answers", "What compounds?" in quiz_prompt
      and "Luck." not in quiz_prompt and "compounding" not in quiz_prompt)
check("explain: unknown block 404, bad input 422, hidden workbook 404",
      by["explain unknown block"]["status"] == 404 and by["explain on a workbook you cannot see"]["status"] == 404
      and all(by[k]["status"] == 422 for k in ("explain question not text", "explain question too long", "explain not an object")))
check("explanation cleaned", by["explanation cleaned"]["body"]["text"] == "First.\n\nSecond.")

# Deleting the class takes its workbooks and everyone's progress with it.
conn = sqlite3.connect(PY_DB)
conn.execute(
    "INSERT INTO lms_workbook_progress (workbook_id, user_id, started_at, last_accessed_at, updated_at) VALUES (?, ?, 'x', 'x', 'x')",
    (py_ids["B"], LEARNER2),
)
class_id = conn.execute("SELECT id FROM lms_classes WHERE slug = ?", (CLASS,)).fetchone()[0]
workbooks.purge_class(conn.cursor(), class_id)
conn.commit()
left = conn.execute("SELECT COUNT(*) FROM lms_workbooks WHERE class_id = ?", (class_id,)).fetchone()[0]
left_progress = conn.execute("SELECT COUNT(*) FROM lms_workbook_progress WHERE workbook_id = ?", (py_ids["B"],)).fetchone()[0]
conn.close()
check("class purge removes workbooks and progress", left == 0 and left_progress == 0)

# ── 2. The twin: same answers from fe-apis/lms/workbooks.ts ──────────────────
ts = run_typescript()
if ts is not None:
    ts_out, ts_ids = ts
    for py_step, ts_step in zip(py_out, ts_out):
        a = normalize(py_step, py_ids)
        b = normalize(ts_step, ts_ids)
        same = a == b
        check(f"twin: {py_step['label']}", same, "" if same else f"\n  python: {json.dumps(a)[:600]}\n  ts:     {json.dumps(b)[:600]}")
    check("twin: same number of steps", len(py_out) == len(ts_out))

print(f"\n{len(failures)} failure(s)" if failures else "\nAll checks passed.")
sys.exit(1 if failures else 0)
