"""Guided Practice prompts: the Python builders (backend/modules/guided_practice/prompts.py) against the TypeScript ones
(frontend/fe-apis/guidedPractice/prompts.ts), character for character.

Both servers must send the model the very same prompt, so this builds about 4,400 inputs (every builder, every branch, every
tutor action and STAR variant, empty and full optional fields, whitespace and Unicode edges, all seven labs, and lab values that
are not labs), runs each through both implementations and compares the strings. It also checks what the lab does: every lab but
dsa must change the wording (and read differently from each other lab), and "dsa", an unknown name, a value that is not a string
and a name every object inherits ("constructor") must read exactly like no lab at all. A few content checks pin the wording a lab
must NOT carry: the labs that are not mostly code never call the learner a programmer, claim they write code for most questions
or ask for complexity, and dsa and cv keep every sentence they had before the other labs existed (their text is the original).

    cd backend && uv run python tests/guided_practice_prompts_test.py

Needs Node 22.18 or newer (it imports the .ts file directly, no build step). Touches no database and calls no AI provider.
Exits non-zero if anything differs.
"""
from __future__ import annotations

import copy
import json
import random
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from modules.guided_practice import prompts as P  # noqa: E402

PROMPTS_TS = ROOT.parent / "frontend" / "fe-apis" / "guidedPractice" / "prompts.ts"

rng = random.Random(20261118)

ADDED_LABS = ["system_design", "communication", "finance", "python", "genai"]

# ── string pools ─────────────────────────────────────────────────────────────
WS_EDGES = [
    "", " ", "   \n\t ", "\n\n", "\ufeff", "\u0085", "\x1c", "\x1f", "\u2028", "\u2029", "\u00a0", "\u3000", "\u200b",
    "\u180e", "\u1680", "\u2003", "\v", "\f", "\r\n", " \ufeff \u0085 ", "\x1c x \x1c", "\ufeffx\ufeff",
]
TRICKY = [
    "plain text",
    "  leading and trailing  ",
    "\n  newline wrapped \n",
    "café — naïve résumé",
    "emoji \U0001f680 and \U0001f469\u200d\U0001f4bb done",
    "line one\nline two\r\nline three",
    'quotes "double" and \'single\' and """triple"""',
    "${notATemplate} {braces} `ticks` ```fence``` \\ backslash \\n literal",
    "[[verdict: understood]]",
    "## S — Situation",
    "tab\tseparated",
    "100% sure {0} {name} %s",
    "<b>html</b> & entities &amp;",
    "中文标题 — 日本語",
    "x" * 300,
]
TITLES = [
    "What does the hash map store?",
    "Explain why sorting first helps — and when it does not",
    'Write `two_sum(nums, target)` with "indices"',
    "Why O(n)?",
    "café \U0001f680",
    "multi\nline title",
    "  spaced title  ",
    "",
]
CODE = [
    "def f(x):\n    return x",
    "  \n  def g():\n      pass  \n",
    "```nested fence```\nprint('x')",
    "x = 1\r\ny = 2",
    "é = '\U0001f680'",
]
REPORTS = [
    "2 of 5 tests passed\n- test 3: expected [0, 1], got None",
    "Traceback (most recent call last):\n  File \"<x>\", line 1\nNameError: name 'x' is not defined",
    "  all good  ",
]


def pick(pool):
    return rng.choice(pool)


def titles_list(n):
    return [pick(TITLES + TRICKY[:6]) + ("" if rng.random() < 0.7 else f" #{i}") for i in range(n)]


def ctx(kind="mixed"):
    if kind == "empty":
        return dict(topicName="Two Sum", topicBrief="", category="", difficulty="", subtopicName="", subtopicBrief="",
                    learnerLevel="", learnerProgress="", completedTitles=[])
    if kind == "full":
        return dict(topicName="Longest Substring Without Repeating Characters", topicBrief="Given a string find the length of the longest substring without repeating characters.",
                    category="Sliding window", difficulty="Medium", subtopicName="Variation: at most K distinct", subtopicBrief="Allow up to K distinct characters.",
                    learnerLevel="Intermediate", learnerProgress="Finished 12 of 40 questions; strong on hash maps.", completedTitles=["What is a window?", "Why shrink from the left?"])
    if kind == "topicbrief-only":
        return dict(topicName="Merge Intervals", topicBrief="Merge all overlapping intervals.", category="Sorting", difficulty="", subtopicName="", subtopicBrief="",
                    learnerLevel="beginner", learnerProgress="", completedTitles=[])
    if kind == "subtopic-no-brief":
        return dict(topicName="Merge Intervals", topicBrief="", category="", difficulty="Hard", subtopicName="Insert interval", subtopicBrief="",
                    learnerLevel="", learnerProgress="just started", completedTitles=["A"])
    if kind == "many-completed":
        c = ctx("full")
        c["completedTitles"] = [f"Completed question number {i}" for i in range(45)]
        return c
    # random mix
    return dict(
        topicName=pick(TRICKY + ["Two Sum"]),
        topicBrief=pick(["", ""] + TRICKY),
        category=pick(["", "", "Hash Map", "café"]),
        difficulty=pick(["", "", "easy", "Hard"]),
        subtopicName=pick(["", "", pick(TRICKY)]),
        subtopicBrief=pick(["", "", pick(TRICKY)]),
        learnerLevel=pick(["", "beginner", pick(TRICKY)]),
        learnerProgress=pick(["", pick(TRICKY)]),
        completedTitles=titles_list(rng.choice([0, 0, 1, 3, 41])),
    )


def question(kind="mixed", relation=None, level="unset"):
    q = dict(title="Why does the window shrink?", objective="", kind="concept", difficulty="medium", why="",
             relation="base", level=None, angle="", wantsExercise=False, effort="")
    if kind == "full":
        q.update(objective="Explain the shrink rule in one sentence.", kind="implementation", difficulty="hard",
                 why="It is the core move of the parent question.", angle="internals", wantsExercise=True, effort="8 min")
    elif kind == "mixed":
        q.update(title=pick(TITLES), objective=pick(["", pick(TRICKY)]), kind=pick(["", "concept", "implementation", "algorithm", "scenario"]),
                 difficulty=pick(["", "easy", "medium", "hard"]), why=pick(["", pick(TRICKY)]), angle=pick(["", "internals"]),
                 wantsExercise=rng.random() < 0.5, effort=pick(["", "5 min"]))
    if relation is not None:
        q["relation"] = relation
    if level != "unset":
        q["level"] = level
    return q


def pos(kind="mixed"):
    if kind == "empty":
        return dict(phaseNumber=0, phaseTitle="", phaseGoal="", ancestryTitles=[])
    if kind == "phase":
        return dict(phaseNumber=2, phaseTitle="Build the pieces", phaseGoal="Write the helper that tracks the window.", ancestryTitles=[])
    if kind == "phase-no-title":
        return dict(phaseNumber=3, phaseTitle="", phaseGoal="", ancestryTitles=["Parent one"])
    if kind == "boss":
        return dict(phaseNumber=0, phaseTitle="Final boss", phaseGoal="", ancestryTitles=[])
    if kind == "ancestry":
        return dict(phaseNumber=1, phaseTitle="Warm up", phaseGoal="Spot the pattern.", ancestryTitles=["Outer question?", "Middle — question?", "Inner"])
    return dict(phaseNumber=rng.choice([0, 0, 1, 4, 50]), phaseTitle=pick(["", "Phase title", pick(TRICKY)]),
                phaseGoal=pick(["", pick(TRICKY)]), ancestryTitles=titles_list(rng.choice([0, 1, 2, 8])))


POS_KINDS = ["empty", "phase", "phase-no-title", "boss", "ancestry"]
CTX_KINDS = ["empty", "full", "topicbrief-only", "subtopic-no-brief", "many-completed"]


def build_cases():
    """Every input, in the TypeScript (camelCase) shape, and what each lab variant must read as."""
    cases = []
    twins = {}


    def add(fn, args, label):
        cases.append({"id": f"{len(cases):04d}-{fn}-{label}", "fn": fn, "args": args})


    # ── curriculum ───────────────────────────────────────────────────────────────
    for ck in CTX_KINDS:
        for focus in ["", "  focus on pointers  ", "line1\nline2", "\ufeff", "\u0085", "\x1c", "\x1c focus \x1c", "\ufefffocus\ufeff"]:
            add("curriculum", {"ctx": ctx(ck), "phaseCount": rng.choice([3, 4, 5, 6]), "focus": focus}, f"{ck}-focus")
    for i, ws in enumerate(WS_EDGES):
        add("curriculum", {"ctx": ctx("full"), "phaseCount": 5, "focus": ws}, f"ws{i}")
        add("curriculum", {"ctx": ctx("empty"), "phaseCount": 3, "focus": ws + "x" + ws}, f"wsx{i}")
    for n in range(10):
        add("curriculum", {"ctx": ctx("mixed"), "phaseCount": rng.choice([3, 4, 5, 6]), "focus": pick(["", pick(TRICKY)])}, f"rand{n}")

    # ── question ─────────────────────────────────────────────────────────────────
    relations = ["base", "breakdown", "deeper", "boss", "weird", ""]
    levels = [None, 1, 2, 3, 4, 5, 0, 9]
    for rel in relations:
        for lv in (levels if rel == "deeper" else [None, 3]):
            for qk in ["full", "plain"]:
                for pk in POS_KINDS[:3]:
                    add("question", {"ctx": ctx("full"), "q": question(qk, rel, lv), "pos": pos(pk), "siblingTitles": rng.choice([[], ["Sibling A"], titles_list(5)])}, f"{rel}-L{lv}-{qk}-{pk}")
    for ck in CTX_KINDS:
        for pk in POS_KINDS:
            add("question", {"ctx": ctx(ck), "q": question("full", "base"), "pos": pos(pk), "siblingTitles": []}, f"{ck}-{pk}")
    for wants in (True, False):
        add("question", {"ctx": ctx("full"), "q": {**question("plain", "base"), "wantsExercise": wants}, "pos": pos("empty"), "siblingTitles": ["x", "y"]}, f"wants{wants}")
    for n in range(20):
        add("question", {"ctx": ctx("mixed"), "q": question("mixed", pick(relations), pick(levels)), "pos": pos("mixed"), "siblingTitles": titles_list(rng.choice([0, 2, 12]))}, f"rand{n}")

    # ── breakdown + deeper ───────────────────────────────────────────────────────
    def children(n):
        return [{"title": pick(TITLES + ["Done step"]), "completed": rng.random() < 0.5} for _ in range(n)]


    def deeper_list(n):
        return [{"title": pick(TITLES + ["Done step"]), "level": rng.choice([1, 2, 3, 4, 5]), "completed": rng.random() < 0.5} for _ in range(n)]


    for regen in (False, True):
        for existing_n in (0, 1, 5):
            for path_n in (0, 4):
                for pk in ("empty", "ancestry", "phase"):
                    add("breakdown", {"ctx": ctx("full"), "q": question("full", "base"), "pos": pos(pk), "existing": children(existing_n), "pathTitles": titles_list(path_n), "regenerate": regen}, f"regen{regen}-e{existing_n}-p{path_n}-{pk}")
                    add("deeper", {"ctx": ctx("full"), "q": question("full", "base"), "pos": pos(pk), "existing": deeper_list(existing_n), "pathTitles": titles_list(path_n), "regenerate": regen}, f"regen{regen}-e{existing_n}-p{path_n}-{pk}")
    for ck in CTX_KINDS:
        add("breakdown", {"ctx": ctx(ck), "q": question("plain", "breakdown"), "pos": pos("phase"), "existing": children(2), "pathTitles": titles_list(3), "regenerate": False}, f"{ck}")
        add("deeper", {"ctx": ctx(ck), "q": question("plain", "deeper", 4), "pos": pos("ancestry"), "existing": deeper_list(3), "pathTitles": titles_list(3), "regenerate": True}, f"{ck}")
    for n in range(15):
        add("breakdown", {"ctx": ctx("mixed"), "q": question("mixed", pick(relations), pick(levels)), "pos": pos("mixed"), "existing": children(rng.choice([0, 3])), "pathTitles": titles_list(rng.choice([0, 60])), "regenerate": rng.random() < 0.5}, f"rand{n}")
        add("deeper", {"ctx": ctx("mixed"), "q": question("mixed", pick(relations), pick(levels)), "pos": pos("mixed"), "existing": deeper_list(rng.choice([0, 3])), "pathTitles": titles_list(rng.choice([0, 60])), "regenerate": rng.random() < 0.5}, f"rand{n}")

    # ── tutor ────────────────────────────────────────────────────────────────────
    ACTIONS = ["start", "ask", "hint", "example", "simplify", "exercise", "test", "mistake", "star", "bogus", ""]


    def history(n):
        return [{"role": rng.choice(["learner", "tutor"]), "text": pick(["", "Short.", pick(TRICKY), "Multi\nline\n\nreply"])} for _ in range(n)]


    def tutor_input(action, **over):
        t = dict(question=question("full", "base"), pos=pos("phase"), explanation="", exercisePrompt="", childTitles=[], completedExerciseTitles=[],
                 action=action, message="", hintLevel=1, history=[], learnerCode="", testReport="", starAnswer="", solutionRevealed=False)
        t.update(over)
        return t


    for action in ACTIONS:
        for hl in ([1, 2, 3] if action == "hint" else [1]):
            add("tutor", {"ctx": ctx("full"), "t": tutor_input(action, hintLevel=hl)}, f"{action}-bare-h{hl}")
            add("tutor", {"ctx": ctx("empty"), "t": tutor_input(action, hintLevel=hl, message="What is a window?", pos=pos("empty"), question=question("plain", "base"))}, f"{action}-msg-h{hl}")
            add("tutor", {"ctx": ctx("full"), "t": tutor_input(
                action, hintLevel=hl, message="  My answer: shrink when a duplicate appears.  ", explanation="A window is a range [l, r].\n\nShrink from the left.",
                exercisePrompt="Implement `longest(s)`.", childTitles=["Child one", "Child two"], completedExerciseTitles=titles_list(25),
                learnerCode=CODE[0], testReport=REPORTS[0], starAnswer="## S — Situation\nText", solutionRevealed=True, history=history(5),
                pos=pos("ancestry"), question=question("full", "deeper", 3))}, f"{action}-everything-h{hl}")
            add("tutor", {"ctx": ctx("mixed"), "t": tutor_input(
                action, hintLevel=hl, message=pick(TRICKY), explanation=pick(["", pick(TRICKY)]), exercisePrompt=pick(["", pick(TRICKY)]),
                childTitles=titles_list(rng.choice([0, 3, 10])), completedExerciseTitles=titles_list(rng.choice([0, 2, 21])),
                learnerCode=pick(["", pick(CODE)]), testReport=pick(["", pick(REPORTS)]), starAnswer=pick(["", "An answer"]), solutionRevealed=rng.random() < 0.5,
                history=history(rng.choice([0, 1, 16, 17, 20])), pos=pos("mixed"), question=question("mixed", pick(relations), pick(levels)))}, f"{action}-rand")

    # whitespace-only code / report / star answer: what trim() decides
    for i, ws in enumerate(WS_EDGES):
        add("tutor", {"ctx": ctx("empty"), "t": tutor_input("ask", message="hi", learnerCode=ws, testReport=ws, starAnswer=ws)}, f"ws{i}-only")
        add("tutor", {"ctx": ctx("empty"), "t": tutor_input("mistake", learnerCode=ws + "x = 1" + ws, testReport=ws + "FAILED" + ws, starAnswer=ws + "ans" + ws)}, f"ws{i}-padded")
    for n in (0, 1, 15, 16, 17, 18, 40):
        add("tutor", {"ctx": ctx("full"), "t": tutor_input("ask", message="next", history=[{"role": ("learner" if i % 2 == 0 else "tutor"), "text": f"turn {i}"} for i in range(n)])}, f"history{n}")
    add("tutor", {"ctx": ctx("full"), "t": tutor_input("ask", message="q", history=[{"role": "other", "text": "odd role"}, {"role": "learner", "text": ""}])}, "history-odd-role")
    add("tutor", {"ctx": ctx("full"), "t": tutor_input("ask", message="q", completedExerciseTitles=[f"Ex {i}" for i in range(30)], childTitles=[f"Child {i}" for i in range(12)])}, "slices")

    # ── star ─────────────────────────────────────────────────────────────────────
    def star_input(variant, **over):
        s = dict(question=question("full", "base"), pos=pos("phase"), explanation="", exercisePrompt="", variant=variant, existingAnswer="")
        s.update(over)
        return s


    for variant in ("generate", "simplify", "example", "bogus", ""):
        for answer in ("", "## S — Situation\nOld text\n\n```python\nprint(1)\n```", "  padded answer  ", "\ufeff", "\x1c"):
            for expl, ex in (("", ""), ("A lesson text.\nSecond line.", ""), ("", "Implement `f`."), ("Lesson", "Exercise")):
                add("star", {"ctx": ctx("full"), "s": star_input(variant, existingAnswer=answer, explanation=expl, exercisePrompt=ex)}, f"{variant or 'empty'}-ans{len(answer)}-{'e' if expl else '_'}{'x' if ex else '_'}")
    for ck in CTX_KINDS:
        for pk in POS_KINDS:
            add("star", {"ctx": ctx(ck), "s": star_input("generate", pos=pos(pk), question=question("plain", pick(relations), pick(levels)))}, f"{ck}-{pk}")
    for n in range(20):
        add("star", {"ctx": ctx("mixed"), "s": star_input(pick(["generate", "simplify", "example"]), existingAnswer=pick(["", pick(TRICKY)]), explanation=pick(["", pick(TRICKY)]),
                                                               exercisePrompt=pick(["", pick(TRICKY)]), pos=pos("mixed"), question=question("mixed", pick(relations), pick(levels)))}, f"rand{n}")

    # ── labs: everything above ran WITHOUT `lab` (the dsa fixtures of the first version, unchanged and still first in the list) ──
    # Appended after the random draws on purpose, so the first 611 cases stay byte-for-byte what they were.
    n_dsa = len(cases)
    base_cases = copy.deepcopy(cases[:n_dsa])


    def with_lab(case, lab, tag, reads_as):
        c = copy.deepcopy(case)
        c["args"]["ctx"]["lab"] = lab
        c["id"] = f"{len(cases):04d}-{c['fn']}-{tag}-" + case["id"].split("-", 2)[2]
        cases.append(c)
        twins[c["id"]] = (case["id"], reads_as)


    # lab "cv": a copy of EVERY dsa case (every builder, every branch, every whitespace/unicode edge)
    for case in base_cases:
        with_lab(case, "cv", "cv", "other")
    # lab "dsa" spelled out: must read exactly like no lab at all
    for case in base_cases[::20]:
        with_lab(case, "dsa", "dsa-explicit", "same")
    # a lab nobody knows reads as dsa on the TS side (the handlers refuse it first; the builders are lenient)
    UNKNOWN = ["system-design", "", "DSA", "cv ", " cv", "xyz", "\U0001f680", "null", "0", "Cv", "SYSTEM_DESIGN", "Python"]
    for i, case in enumerate(base_cases[::10]):
        with_lab(case, UNKNOWN[i % len(UNKNOWN)], f"unknown-{i % len(UNKNOWN)}", "same")
    # not even a string: null, a number, a boolean
    first_of = {}
    for case in base_cases:
        first_of.setdefault(case["fn"], case)
    for fn_case in first_of.values():
        for j, odd in enumerate([None, 5, True]):
            with_lab(fn_case, odd, f"odd-{j}", "same")
    # names every object inherits: they are not labs either, whatever the language does with `PROFILES[name]`
    INHERITED = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "isPrototypeOf"]
    for fn_case in first_of.values():
        for j, name in enumerate(INHERITED):
            with_lab(fn_case, name, f"inherited-{j}", "same")
    # the labs added after dsa and cv: a copy of EVERY dsa case for each (appended last, so no earlier case moves)
    for lab in ADDED_LABS:
        for case in base_cases:
            with_lab(case, lab, lab.replace("_", "-"), "other")
    return cases, twins


# ── The TypeScript side ──────────────────────────────────────────────────────

TS_RUNNER = r"""
import { readFileSync, writeFileSync } from 'node:fs';
const [, , promptsPath, casesPath, outPath] = process.argv;
const m = await import(promptsPath);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const out = {};
for (const c of cases) {
  const a = c.args;
  switch (c.fn) {
    case 'curriculum': out[c.id] = m.buildCurriculumPrompt(a.ctx, a.phaseCount, a.focus); break;
    case 'question': out[c.id] = m.buildQuestionPrompt(a.ctx, a.q, a.pos, a.siblingTitles); break;
    case 'breakdown': out[c.id] = m.buildBreakdownPrompt(a.ctx, a.q, a.pos, a.existing, a.pathTitles, a.regenerate); break;
    case 'deeper': out[c.id] = m.buildDeeperPrompt(a.ctx, a.q, a.pos, a.existing, a.pathTitles, a.regenerate); break;
    case 'tutor': out[c.id] = m.buildTutorPrompt(a.ctx, a.t); break;
    case 'star': out[c.id] = m.buildStarPrompt(a.ctx, a.s); break;
    default: throw new Error('unknown fn ' + c.fn);
  }
}
out['__constants__'] = { MAX_TOKENS: m.MAX_TOKENS, LEVEL_NAMES: m.LEVEL_NAMES, TUTOR_ACTIONS: m.TUTOR_ACTIONS, STAR_VARIANTS: m.STAR_VARIANTS, GUIDED_LABS: m.GUIDED_LABS };
writeFileSync(outPath, JSON.stringify(out));
"""


def run_ts(cases):
    node = shutil.which("node")
    if not node:
        sys.exit("Node is needed to run the TypeScript prompt builders (22.18 or newer).")
    with tempfile.TemporaryDirectory(prefix="guided-prompts-") as tmp:
        cases_path, out_path, runner = Path(tmp) / "cases.json", Path(tmp) / "out.json", Path(tmp) / "run.mjs"
        cases_path.write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
        runner.write_text(TS_RUNNER, encoding="utf-8")
        done = subprocess.run(
            [node, "--no-warnings", str(runner), PROMPTS_TS.as_uri(), str(cases_path), str(out_path)],
            capture_output=True,
            text=True,
        )
        if done.returncode != 0:
            sys.exit(f"The TypeScript builders did not run (Node {subprocess.run([node, '--version'], capture_output=True, text=True).stdout.strip()}; needs 22.18+):\n{done.stderr[-1500:]}")
        return json.loads(out_path.read_text(encoding="utf-8"))


# ── The Python side ──────────────────────────────────────────────────────────

def snake(key: str) -> str:
    return re.sub(r"([A-Z])", lambda m: "_" + m.group(1).lower(), key)


def conv(d: dict) -> dict:
    return {snake(k): v for k, v in d.items()}


def ctx_of(d):
    return P.PromptCtx(**conv(d))


def qref(d):
    return P.QuestionRef(**conv(d))


def pos_of(d):
    return P.PathPos(**conv(d))


def build_py(case):
    a, fn = case["args"], case["fn"]
    if fn == "curriculum":
        return P.build_curriculum_prompt(ctx_of(a["ctx"]), a["phaseCount"], a["focus"])
    if fn == "question":
        return P.build_question_prompt(ctx_of(a["ctx"]), qref(a["q"]), pos_of(a["pos"]), a["siblingTitles"])
    if fn == "breakdown":
        return P.build_breakdown_prompt(ctx_of(a["ctx"]), qref(a["q"]), pos_of(a["pos"]), [P.ExistingChild(**conv(e)) for e in a["existing"]], a["pathTitles"], a["regenerate"])
    if fn == "deeper":
        return P.build_deeper_prompt(ctx_of(a["ctx"]), qref(a["q"]), pos_of(a["pos"]), [P.ExistingDeeper(**conv(e)) for e in a["existing"]], a["pathTitles"], a["regenerate"])
    if fn == "tutor":
        t = dict(a["t"])
        t["question"], t["pos"] = qref(t["question"]), pos_of(t["pos"])
        t["history"] = [P.TutorTurn(**conv(h)) for h in t["history"]]
        return P.build_tutor_prompt(ctx_of(a["ctx"]), P.TutorInput(**conv(t)))
    if fn == "star":
        s = dict(a["s"])
        s["question"], s["pos"] = qref(s["question"]), pos_of(s["pos"])
        return P.build_star_prompt(ctx_of(a["ctx"]), P.StarInput(**conv(s)))
    raise ValueError(fn)


# ── The checks ───────────────────────────────────────────────────────────────

def main() -> int:
    cases, twins = build_cases()
    ts = run_ts(cases)
    py = {c["id"]: build_py(c) for c in cases}

    failures, per_fn = [], {}
    for c in cases:
        got, want = py[c["id"]], ts[c["id"]]
        ok = got == want
        per_fn.setdefault(c["fn"], [0, 0])[0 if ok else 1] += 1
        if not ok:
            i = next((i for i, (x, y) in enumerate(zip(got, want)) if x != y), min(len(got), len(want)))
            failures.append(f"FAIL {c['id']}: first difference at char {i}\n  python: {got[max(0, i - 40): i + 60]!r}\n  ts:     {want[max(0, i - 40): i + 60]!r}")

    consts = ts["__constants__"]
    const_ok = (
        consts["MAX_TOKENS"] == P.MAX_TOKENS
        and {int(k): v for k, v in consts["LEVEL_NAMES"].items()} == P.LEVEL_NAMES
        and list(consts["TUTOR_ACTIONS"]) == list(P.TUTOR_ACTIONS)
        and list(consts["STAR_VARIANTS"]) == list(P.STAR_VARIANTS)
        and list(consts["GUIDED_LABS"]) == list(P.GUIDED_LABS)
    )

    # what the lab does, checked on both sides (they are equal, so the Python outputs stand for both)
    case_lab = {c["id"]: c["args"]["ctx"].get("lab") for c in cases}
    lab_problems = []
    for new_id, (base_id, reads_as) in twins.items():
        same = py[new_id] == py[base_id] and ts[new_id] == ts[base_id]
        if reads_as == "same" and not (same and "undefined" not in ts[new_id]):
            lab_problems.append(f"{new_id} should read exactly like {base_id}")
        if reads_as == "other" and (py[new_id] == py[base_id] or ts[new_id] == ts[base_id]):
            lab_problems.append(f"{new_id} (lab {case_lab.get(new_id)}) should read differently from {base_id}")

    # every lab that has a profile reads differently from every other one, case by case
    case_lab = {c["id"]: c["args"]["ctx"].get("lab") for c in cases}
    by_base = {}
    for new_id, (base_id, reads_as) in twins.items():
        if reads_as == "other":
            by_base.setdefault(base_id, {})[case_lab[new_id]] = new_id
    pair_problems = []
    for base_id, labs in by_base.items():
        outputs = {"dsa": py[base_id], **{lab: py[i] for lab, i in labs.items()}}
        names = sorted(outputs)
        for a in range(len(names)):
            for b in range(a + 1, len(names)):
                if outputs[names[a]] == outputs[names[b]]:
                    pair_problems.append(f"{base_id}: labs {names[a]} and {names[b]} read exactly the same")

    # wording the labs that are not mostly code must not carry, and what dsa and cv must keep
    content_problems = []
    first_ids = {}
    for c in cases:
        if "lab" not in c["args"]["ctx"]:
            first_ids.setdefault(c["fn"], c["id"])
    NOT_CODE = {"communication": 'writes code for most of the questions', "system_design": 'writes code for most of the questions',
                "finance": 'writes code for most of the questions', "genai": 'writes code for most of the questions'}
    for fn, base_id in first_ids.items():
        for lab, new_id in by_base.get(base_id, {}).items():
            text = py[new_id]
            if lab in ADDED_LABS and "programming mentor" in text:
                content_problems.append(f"{lab} {fn}: still says programming mentor")
            if lab in NOT_CODE and NOT_CODE[lab] in text:
                content_problems.append(f"{lab} {fn}: still says the learner writes code for most of the questions")
            if lab == "communication" and fn in ("star", "tutor") and ("time complexity" in text or "data structures and algorithms" in text):
                content_problems.append(f"communication {fn}: asks for complexity or data structures")
        for lab in ("dsa", "cv"):
            text = py[base_id] if lab == "dsa" else py[by_base[base_id]["cv"]] if "cv" in by_base.get(base_id, {}) else ""
            if fn == "curriculum" and "and writes code for most of the questions." not in text:
                content_problems.append(f"{lab} curriculum lost its original sentence")
            if fn == "tutor" and "a patient, technically strong programming mentor tutoring" not in text:
                content_problems.append(f"{lab} tutor lost its original sentence")
            if fn in ("curriculum", "question", "breakdown", "deeper") and ("This is a " in text and " lab:" in text):
                content_problems.append(f"{lab} {fn} carries a lab note")
    # every lab note and exercise note shows up where it must (curriculum, question, breakdown, deeper) for the labs that have one
    for lab, prof in P.PROFILES.items():
        for fn in ("curriculum", "question", "breakdown", "deeper"):
            base_id = first_ids[fn]
            got = py[base_id] if lab == "dsa" else py[by_base[base_id][lab]] if lab in by_base[base_id] else None
            if got is None:
                continue
            for note in (prof.lab_note, prof.exercise_note):
                if note and f"- {note}" not in got:
                    content_problems.append(f"{lab} {fn}: a profile note is missing")
                if not note and lab in ("dsa", "cv") and "- This is a" in got:
                    content_problems.append(f"{lab} {fn}: carries a note it should not have")

    empty = [i for i, text in py.items() if not isinstance(text, str) or not text.strip()]
    too_few = len(cases) < 4000

    print(f"{len(cases)} prompt cases, per builder [same, different]: {per_fn}")
    print(f"constants (MAX_TOKENS, LEVEL_NAMES, TUTOR_ACTIONS, STAR_VARIANTS, GUIDED_LABS): {'PASS' if const_ok else 'FAIL'}")
    print(f"lab variants ({len(twins)}: every lab but dsa reads differently, dsa/unknown/not-a-string/inherited read as no lab): {'PASS' if not lab_problems else 'FAIL'}")
    print(f"labs read differently from each other ({len(by_base)} inputs x {len(P.GUIDED_LABS)} labs, pairwise): {'PASS' if not pair_problems else 'FAIL'}")
    print(f"lab wording (no programming wording outside the code labs, dsa/cv keep their original sentences, notes where due): {'PASS' if not content_problems else 'FAIL'}")
    for line in failures[:10] + lab_problems[:10] + pair_problems[:10] + content_problems[:10]:
        print(line)
    if empty:
        print(f"FAIL {len(empty)} empty prompts, e.g. {empty[0]}")
    if too_few:
        print("FAIL the case list is suspiciously short")
    bad = bool(failures or lab_problems or pair_problems or content_problems or empty or too_few or not const_ok)
    print("all checks passed" if not bad else f"{len(failures)} prompt(s) differ")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
