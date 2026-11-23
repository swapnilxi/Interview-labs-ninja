"""Project question topics: twin check of the pure half (standalone, like the other backend/tests scripts).

    cd backend && python3 tests/lms_question_topics_test.py      (needs Node 22.18+ on PATH)

Runs every case through modules/ai_lms/question_topics.py and its Next.js twin frontend/fe-apis/lms/questionTopics.ts
and diffs the answers: prompts, outline ids, preview/lesson normalization (and their error texts), the HTML renderer,
read time, request hash and JSON extraction must be byte-identical. Also checks the safety rules on the renderer
(model text is always escaped; no script, event handler or link is ever emitted). Exits non-zero on any failure.
The end-to-end flows (both servers, sync, duplicates, access) are in tests/lms_question_topics_e2e.mjs.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
TS_MODULE = REPO / "frontend" / "fe-apis" / "lms" / "questionTopics.ts"
sys.path.insert(0, str(ROOT))

import importlib.util  # noqa: E402

# Load the pure module without importing the ai_lms package (whose __init__ pulls in FastAPI).
_spec = importlib.util.spec_from_file_location("question_topics", ROOT / "modules" / "ai_lms" / "question_topics.py")
qt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qt)  # type: ignore[union-attr]

TOKENS = re.search(r'PREMIUM_DESIGN_TOKENS_CSS = """(.*?)"""', (ROOT / "modules/ai_lms/visual_engine.py").read_text(), re.S).group(1)

WEIRD = "  Line one\r\nline\x07 two\r\r\r\n\n\nthree﻿  \x1c end \U0001F600  "
PROJECT = {
    "id": "p1",
    "name": "LCB GrowthAI",
    "description": "Multi-tenant e-commerce growth platform. First customer: LCB Fertilizers (product: Navyakosh).",
    "ai_context": "Learn by building: repeat-purchase prediction, referrals.\n\n\n\nGoals...",
    "project_context": "Stack: Next.js, FastAPI, SQLite/Neon Postgres.\n" + "README line. " * 800,
    "context_summary": "",
}
PROJECT_SUMMARY = {**PROJECT, "context_summary": "Summary wins over the README.", "description": None, "ai_context": ""}
RAW_PLAN = [
    {"title": "Customer Intelligence", "focus": "segments", "sublessons": [{"title": "RFM"}, {"title": "RFM"}, "junk"]},
    {"title": "Customer Intelligence"},
    {"id": "s-keep", "title": "Referral Engine", "sublessons": [{"id": "", "title": "Codes"}]},
    {"title": "  User Questions Topics ", "sublessons": [{"id": "q-1", "kind": "question", "title": "Old Q", "version": 3}]},
    "not a module",
    {"title": 7},
]
PLAN = qt.ensure_ids(RAW_PLAN)

GOOD_LESSON = {
    "direct_answer": "Instance-based learning, commonly exemplified by k-nearest neighbors.",
    "guiding_question": "",
    "concept": "k-NN stores examples.\n\nAt prediction time it finds the k most similar <neighbours> & votes.",
    "real_world": {"who": "Retail analysts", "data": "Purchase history", "decision": "Who to remind", "limitation": "Slow on huge data"},
    "project_connection": {"feature": "Navyakosh repeat-purchase reminders", "why": "Similar buyers reorder alike", "fit": "strong", "example_is_illustrative": False},
    "implementation": {
        "language": "Python 3!",
        "prerequisites": ["pandas", "", "scikit-learn", 5],
        "first_task": "Load 10 sample orders.",
        "sample_data_note": "Inline sample: no real data.",
        "steps": [
            {"title": "Build features", "explanation": "Days since last order.\n\nOrders per month.", "file_path": "backend/ml/knn.py (proposed)",
             "input_example": "customer_id,days\n1,20", "code": "import pandas as pd\nprint('<ok>')", "expected_output": "<ok>", "verify": "Prints <ok>"},
            {"title": "Fit k-NN", "explanation": "", "file_path": "", "input_example": "", "code": "model.fit(X, y)", "expected_output": "", "verify": ""},
            {"title": "No code", "code": ""},
            "junk",
        ],
    },
    "impact": {"kpi": "Repeat purchase rate", "baseline": "Assumed 18%", "measurement": "A/B test reminders", "target": ""},
    "star": {"situation": "We had churn.", "task": "Predict reorders.", "action": "Built k-NN.", "result": "Would lift repeats.", "result_is_verified": "yes"},
    "summary": "",
}

CASES = [
    ("clean_text", "clean_text", [WEIRD, 30]),
    ("clean_text non-str", "clean_text", [5, 10]),
    ("clean_line", "clean_line", [WEIRD, 25]),
    ("clean_line emoji cut", "clean_line", ["\U0001F600" * 50, 7]),
    *[(f"guess {s!r}", "guess_input_type", [s]) for s in ["", "K-nearest neighbors", "what is kNN", "Explain kNN", "kNN?", "  Why  "]],
    ("esc", "esc", ["<a href=\"x\" onclick='y'>&amp;</a>"]),
    ("ensure_ids", "ensure_ids", [RAW_PLAN]),
    ("questions section", "find_questions_section", [PLAN]),
    ("section choices", "section_choices", [PLAN]),
    ("find topic", "find_topic", [PLAN, "q-1"]),
    ("find topic not a question", "find_topic", [PLAN, PLAN[0]["sublessons"][0]["id"]]),
    ("topic view", "topic_view", [PLAN[3], PLAN[3]["sublessons"][0]]),
    ("request hash", "request_hash", ["p1", "What?é", "question", "T", "", ""]),
    ("preview prompt", "build_preview_prompt", [PROJECT, PLAN, "What type of algorithm relies on a similarity measure to make predictions?"]),
    ("preview prompt summary/empty plan", "build_preview_prompt", [PROJECT_SUMMARY, [], "K-nearest neighbors"]),
    ("lesson prompt question", "build_lesson_prompt", [PROJECT, PLAN, "Customer Intelligence", "What is kNN?", "question", "Using k-NN", ""]),
    ("lesson prompt topic", "build_lesson_prompt", [PROJECT_SUMMARY, PLAN, "User Questions Topics", "K-nearest neighbors", "topic", "k-NN", "How does k-NN predict?"]),
    ("lesson prompt topic no gq", "build_lesson_prompt", [PROJECT, [], "X", "kNN", "topic", "k-NN", ""]),
    ("preview good", "normalize_preview", [{"input_type": "question", "title": " \"Using k-NN to predict Navyakosh repeat purchases\" ", "section_id": PLAN[0]["id"], "reason": "Fits\nsegments", "guiding_question": "ignored"}, PLAN, "What?"]),
    ("preview new section", "normalize_preview", [{"input_type": "topic", "title": "", "section_id": "new", "guiding_question": "How?"}, [p for p in PLAN if p["title"] != "  User Questions Topics "], "K-nearest neighbors?!"]),
    ("preview junk falls back to questions section", "normalize_preview", ["not an object", PLAN, "what is a similarity measure"]),
    ("preview foreign section id", "normalize_preview", [{"section_id": "s-other-project", "title": "T"}, PLAN, "x"]),
    ("lesson good", "normalize_lesson", [GOOD_LESSON, "question", ""]),
    ("lesson topic gq fallback", "normalize_lesson", [{**GOOD_LESSON, "guiding_question": ""}, "topic", "How does k-NN predict?"]),
    ("lesson weak fit", "normalize_lesson", [{**GOOD_LESSON, "project_connection": {**GOOD_LESSON["project_connection"], "fit": "weak"}, "star": {**GOOD_LESSON["star"], "result_is_verified": True}}, "question", ""]),
    ("lesson illustrative list", "normalize_lesson", [{**GOOD_LESSON, "project_connection": {**GOOD_LESSON["project_connection"], "fit": "bogus", "example_is_illustrative": []}}, "question", ""]),
    ("lesson missing", "normalize_lesson", [{"direct_answer": "x", "implementation": {"steps": [{"title": "a", "code": "b"}]}}, "topic", ""]),
    ("lesson junk", "normalize_lesson", [[1, 2], "question", ""]),
    ("parse fenced", "parse_json_object", ["```json\n{\"a\": [1, {\"b\": \"}\"}]}\n```"]),
    ("parse chatter", "parse_json_object", ["Here you go: {\"x\": 1} hope it helps"]),
    ("parse none", "parse_json_object", ["no json here"]),
]

# Renderer cases run on normalized lessons (the only input it ever gets).
RENDER = [
    ("render question", [qt.normalize_lesson(GOOD_LESSON, "question", ""), "Using k-NN <to> predict", "What type of algorithm relies on a similarity measure to make predictions?", "question", "LCB GrowthAI", "Customer Intelligence"]),
    ("render topic weak verified", [qt.normalize_lesson({**GOOD_LESSON, "guiding_question": "How does k-NN work?", "project_connection": {**GOOD_LESSON["project_connection"], "fit": "weak"}, "star": {**GOOD_LESSON["star"], "result_is_verified": True}, "implementation": {**GOOD_LESSON["implementation"], "prerequisites": [], "sample_data_note": ""}}, "topic", ""), "k-NN", "K-nearest neighbors <script>alert(1)</script>", "topic", "P & Q", "User Questions Topics"]),
]

TS_RUNNER = r"""
import { readFileSync, writeFileSync } from 'node:fs';
const [, , moduleUrl, casesPath, outPath, tokensPath] = process.argv;
const qt = await import(moduleUrl);
const tokens = readFileSync(tokensPath, 'utf8');
const { cases, render } = JSON.parse(readFileSync(casesPath, 'utf8'));
const fn = {
  clean_text: qt.cleanText, clean_line: qt.cleanLine, guess_input_type: qt.guessInputType, esc: qt.esc,
  ensure_ids: (p) => qt.ensureIds(p), find_questions_section: qt.findQuestionsSection, section_choices: qt.sectionChoices,
  find_topic: qt.findTopic, topic_view: qt.topicView, request_hash: qt.requestHash,
  build_preview_prompt: qt.buildPreviewPrompt, build_lesson_prompt: qt.buildLessonPrompt,
  normalize_preview: qt.normalizePreview, normalize_lesson: qt.normalizeLesson, parse_json_object: qt.parseJsonObject,
};
const out = {};
for (const [name, f, args] of cases) {
  try {
    let r = fn[f](...args);
    if (f === 'normalize_lesson') r = { lesson: r, minutes: qt.readMinutes(r), summary: qt.lessonSummary(r, 'T') };
    out[name] = { ok: r === undefined ? null : r };
  } catch (e) { out[name] = { error: e.message.startsWith('The AI') ? e.message : 'error' }; }
}
for (const [name, args] of render) out[name] = { ok: qt.renderLessonHtml(...args, tokens) };
writeFileSync(outPath, JSON.stringify(out));
"""


def run_python() -> dict:
    out = {}
    for name, f, args in CASES:
        try:
            r = getattr(qt, f)(*args)
            if f == "normalize_lesson":
                r = {"lesson": r, "minutes": qt.read_minutes(r), "summary": qt.lesson_summary(r, "T")}
            if isinstance(r, tuple):
                r = list(r)
            out[name] = {"ok": r}
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            out[name] = {"error": msg if msg.startswith("The AI") else "error"}
    for name, args in RENDER:
        out[name] = {"ok": qt.render_lesson_html(*args, TOKENS)}
    return json.loads(json.dumps(out))


def main() -> int:
    failures = 0

    def check(cond: bool, label: str) -> None:
        nonlocal failures
        print(("PASS " if cond else "FAIL ") + label)
        failures += 0 if cond else 1

    py = run_python()

    # Rules on the Python answers.
    html_q = py["render question"]["ok"]
    html_t = py["render topic weak verified"]["ok"]
    check("What type of algorithm relies on a similarity measure to make predictions?" in html_q, "question shown verbatim")
    check(html_q.index("Short answer") < html_q.index("3. Connection to"), "direct answer comes before the project example")
    check("Guiding question" in html_t and "Guiding question" not in html_q, "guiding question only for topics")
    for label, h in (("question", html_q), ("topic", html_t)):
        check(not re.search(r"<script|\son[a-z]+\s*=|<a\s|javascript:|<iframe|<object|<embed", h, re.I), f"{label}: no script, handler or link")
    check("&lt;script&gt;alert(1)&lt;/script&gt;" in html_t, "learner input is escaped, never markup")
    check("&lt;ok&gt;" in html_q and "&lt;neighbours&gt; &amp; votes" in html_q, "model text is escaped")
    check("Result (projected, not yet measured)" in html_q, "unverified STAR result labelled projected")
    check("<dt>Result</dt>" in html_t and "Illustrative example" in html_t, "verified result + weak-fit warning")
    check(all(f'<h2>{n}.' in html_q for n in range(1, 7)), "all six required sections present")
    check(py["lesson missing"]["error"].startswith("The AI's lesson was incomplete (missing: concept"), "missing fields named")
    check(py["preview foreign section id"]["ok"]["section"]["id"] == PLAN[3]["id"], "a section id from another project is never accepted")
    check(py["preview new section"]["ok"]["section"] == {"id": "", "title": "User Questions Topics", "is_new": True}, "no fitting section -> new User Questions Topics")
    ids = [m["id"] for m in py["ensure_ids"]["ok"]]
    check(len(set(ids)) == len(ids) and ids[2] == "s-keep", "outline ids unique; stored ids kept")

    node = shutil.which("node")
    if not node:
        print("SKIP twin check: node is not on PATH")
        return 1 if failures else 0
    scratch = Path(tempfile.mkdtemp(prefix="qt-twin-"))
    runner = scratch / "runner.mjs"
    runner.write_text(TS_RUNNER)
    cases_path = scratch / "cases.json"
    cases_path.write_text(json.dumps({"cases": CASES, "render": RENDER}))
    tokens_path = scratch / "tokens.css"
    tokens_path.write_text(TOKENS)
    out_path = scratch / "ts.json"
    done = subprocess.run(
        [node, "--no-warnings", str(runner), TS_MODULE.as_uri(), str(cases_path), str(out_path), str(tokens_path)],
        capture_output=True, text=True,
    )
    if done.returncode != 0:
        print(done.stderr)
        print("FAIL the TypeScript twin crashed")
        return 1
    ts = json.loads(out_path.read_text())
    for name in py:
        same = py[name] == ts.get(name)
        check(same, f"twin: {name}")
        if not same:
            a, b = json.dumps(py[name], ensure_ascii=False), json.dumps(ts.get(name), ensure_ascii=False)
            i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
            print(f"    py: ...{a[max(0, i - 80):i + 80]}\n    ts: ...{b[max(0, i - 80):i + 80]}")
    print(f"\n{'FAILED' if failures else 'OK'}: {failures} failure(s), {len(py)} cases diffed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
