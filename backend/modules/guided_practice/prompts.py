"""Every prompt of Guided Practice (the dedicated page behind a lab topic's "Guided Practice" card, DSA and CV): the path
outline, one question's lesson, Breakdown, Dive Deeper, the AI Tutor's turns and the STAR answer.

Twin: frontend/fe-apis/guidedPractice/prompts.ts -- the texts are identical on purpose, so change both together.

The endpoints only build a prompt and run it; the browser parses and cleans the answer
(frontend/src/modules/labs/dsa-lab/guided/parse.ts), so the JSON shapes named here are that parser's contract.

What differs between the labs is a few words (an algorithms problem vs a computer vision topic) and how exercise data is
laid out; those live in PROFILES below, and the DSA texts are the original ones.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Tuple, get_args

FENCE = "```"

GuidedLab = Literal["dsa", "cv"]
GUIDED_LABS: Tuple[str, ...] = get_args(GuidedLab)


@dataclass(frozen=True)
class LabProfile:
    """The words of a prompt that depend on the lab."""

    instructor: str  # "a senior ___": who writes the lesson
    kind: str  # what the path is about, for the outline prompt: "ONE ___"
    thing: str  # how the prompts name it: "not knowing the ___"
    goal: str  # the goal of the path: "from not knowing the problem to ___"
    steps: str  # the steps a path builds up through
    final_task: str  # what the final boss is
    boss_relation: str  # the final boss, as a question's relation
    main_thing: str  # what must not be given away: "the complete solution of the ___"
    exercise_data: str  # how an exercise's data is laid out (one sentence)
    subject_label: str
    category_label: str
    summary_label: str
    difficulty_label: str


PROFILES: Dict[str, LabProfile] = {
    "dsa": LabProfile(
        instructor="algorithms instructor",
        kind="data-structures-and-algorithms problem",
        thing="problem",
        goal="solving it well",
        steps="understand the problem, spot the pattern, build the pieces, assemble the solution, then edge cases and follow-ups",
        final_task="the whole problem as a closing challenge",
        boss_relation="This is the final boss: the complete original problem as a closing challenge. Only here may the reference solution solve the whole problem.",
        main_thing="original problem",
        exercise_data="Linked lists and trees are passed as plain lists; say how in the prompt.",
        subject_label="Original problem",
        category_label="Pattern family",
        summary_label="Problem summary",
        difficulty_label="Problem difficulty",
    ),
    "cv": LabProfile(
        instructor="computer vision instructor",
        kind="computer vision topic",
        thing="topic",
        goal="building and using it well",
        steps="build the intuition, learn the core operation, implement it on small inputs, connect it to a real pipeline, then failure modes and trade-offs",
        final_task="a closing challenge that applies the whole topic end to end",
        boss_relation="This is the final boss: a closing challenge that applies the whole topic end to end. Only here may the reference solution solve the whole challenge.",
        main_thing="main challenge of the topic",
        exercise_data="Images and feature maps are nested lists of numbers (rows of pixels), boxes are [x1, y1, x2, y2] lists, and everything stays plain Python: no numpy, OpenCV or PyTorch. Keep inputs small and say in the prompt how a value is laid out.",
        subject_label="Topic",
        category_label="Area",
        summary_label="Topic summary",
        difficulty_label="Topic difficulty",
    ),
}

LEVEL_NAMES: Dict[int, str] = {
    1: "conceptual understanding",
    2: "practical implementation",
    3: "optimization and trade-offs",
    4: "advanced problem solving",
    5: "interview-level exploration",
}

# Output budget per task (the default 2048 would cut a lesson or a STAR answer off mid-sentence).
MAX_TOKENS: Dict[str, int] = {
    "curriculum": 4096,
    "question": 5000,
    "breakdown": 3000,
    "deeper": 3000,
    "tutor": 1500,
    "star": 4000,
}

TutorAction = Literal["start", "ask", "hint", "example", "simplify", "exercise", "test", "mistake", "star"]
TUTOR_ACTIONS: Tuple[str, ...] = get_args(TutorAction)

StarVariant = Literal["generate", "simplify", "example"]
STAR_VARIANTS: Tuple[str, ...] = get_args(StarVariant)


# What JavaScript's String.prototype.trim() removes: WhiteSpace (tab, VT, FF, space, no-break space, the BOM and the other
# Unicode Zs characters) and the line terminators. Python's str.strip() differs (it also strips \x1c-\x1f and \x85, and
# keeps U+FEFF), and the prompts must match the TS twin character for character.
_JS_WHITESPACE = (
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def js_trim(text: str) -> str:
    """`text.trim()` as JavaScript does it."""
    return text.strip(_JS_WHITESPACE)


@dataclass
class PromptCtx:
    """The problem (or topic) and the learner, as every AI request describes them."""

    topic_name: str
    topic_brief: str = ""
    category: str = ""
    difficulty: str = ""
    subtopic_name: str = ""
    subtopic_brief: str = ""
    learner_level: str = ""
    learner_progress: str = ""
    completed_titles: List[str] = field(default_factory=list)
    lab: str = "dsa"  # an unknown lab reads as dsa (profile_of)


@dataclass
class QuestionRef:
    title: str
    objective: str = ""
    kind: str = "concept"
    difficulty: str = "medium"
    why: str = ""
    relation: str = "base"  # base | breakdown | deeper | boss
    level: Optional[int] = None
    angle: str = ""
    wants_exercise: bool = False
    effort: str = ""


@dataclass
class PathPos:
    phase_number: int = 0  # 0 = not in a numbered phase (the final boss)
    phase_title: str = ""
    phase_goal: str = ""
    ancestry_titles: List[str] = field(default_factory=list)  # titles of the parent questions, outermost first


@dataclass
class ExistingChild:
    title: str
    completed: bool = False


@dataclass
class ExistingDeeper:
    title: str
    level: int = 1
    completed: bool = False


@dataclass
class TutorTurn:
    role: Literal["learner", "tutor"]
    text: str = ""


@dataclass
class TutorInput:
    question: QuestionRef
    pos: PathPos = field(default_factory=PathPos)
    explanation: str = ""
    exercise_prompt: str = ""
    child_titles: List[str] = field(default_factory=list)
    completed_exercise_titles: List[str] = field(default_factory=list)
    action: str = "ask"
    message: str = ""
    hint_level: int = 1
    history: List[TutorTurn] = field(default_factory=list)
    learner_code: str = ""
    test_report: str = ""
    star_answer: str = ""
    solution_revealed: bool = False


@dataclass
class StarInput:
    question: QuestionRef
    pos: PathPos = field(default_factory=PathPos)
    explanation: str = ""
    exercise_prompt: str = ""
    variant: str = "generate"
    existing_answer: str = ""


# ── Building blocks (named after their twins in prompts.ts) ─────────────────


def lines(*parts: str) -> str:
    """Lines joined with "\\n", empty ones left out."""
    return "\n".join(p for p in parts if p)


def blocks(*parts: str) -> str:
    """Blocks joined with a blank line, empty ones left out."""
    return "\n\n".join(p for p in parts if p)


def quoted(titles: List[str]) -> str:
    return "; ".join(f'"{t}"' for t in titles)


def profile_of(c: PromptCtx) -> LabProfile:
    """The words of the lab a request is for; a lab with no profile reads as DSA (the handlers refuse one before this)."""
    return PROFILES.get(c.lab, PROFILES["dsa"])


def problem_block(c: PromptCtx) -> str:
    p = profile_of(c)
    subject = f"{c.topic_name} — {c.subtopic_name}" if c.subtopic_name else c.topic_name
    brief = c.subtopic_brief or c.topic_brief
    return lines(
        f"{p.subject_label}: {subject}",
        f"{p.summary_label}: {brief}" if brief else "",
        f"{p.category_label}: {c.category}" if c.category else "",
        f"{p.difficulty_label}: {c.difficulty}" if c.difficulty else "",
    )


def learner_block(c: PromptCtx) -> str:
    done = c.completed_titles[:40]
    return lines(
        f"Learner: {c.learner_level or 'level not known yet'}",
        f"Progress so far: {c.learner_progress}" if c.learner_progress else "",
        f"Questions the learner has already completed: {quoted(done)}" if done else "",
    )


def position_block(p: PathPos) -> str:
    where = ""
    if p.phase_number:
        where = f"Path position: phase {p.phase_number}" + (f" — {p.phase_title}" if p.phase_title else "")
    elif p.phase_title:
        where = f"Path position: {p.phase_title}"
    ancestry = " > ".join(f'"{t}"' for t in p.ancestry_titles)
    return lines(
        where,
        f"Phase goal: {p.phase_goal}" if p.phase_goal else "",
        f"Parent questions, outermost first: {ancestry}" if p.ancestry_titles else "",
    )


def question_block(q: QuestionRef) -> str:
    return lines(
        f"Question: {q.title}",
        f"Learning objective: {q.objective}" if q.objective else "",
        f"Why it matters for its parent question: {q.why}" if q.why else "",
        f"Kind: {q.kind or 'concept'}; difficulty: {q.difficulty or 'medium'}.",
    )


def relation_text(q: QuestionRef, p: LabProfile) -> str:
    """One sentence on how the question sits in the path (a main question, a breakdown step, a deeper follow-up, the boss)."""
    if q.relation == "breakdown":
        return "This question is one smaller step created by breaking down a harder parent question. Teach just this step and prepare the learner for the parent."
    if q.relation == "deeper":
        level = 2 if q.level is None else q.level
        return f"This is a deeper follow-up (level {level}: {LEVEL_NAMES.get(level, LEVEL_NAMES[2])}) that extends its parent question for a learner who already understands it."
    if q.relation == "boss":
        return p.boss_relation
    return "This is one of the main questions of the path."


# ── Path outline ────────────────────────────────────────────────────────────


def build_curriculum_prompt(c: PromptCtx, phase_count: int, focus: str) -> str:
    wanted = js_trim(focus)
    p = profile_of(c)
    return blocks(
        f"You are a senior {p.instructor} designing a guided practice path for ONE {p.kind}. The learner works through it phase by phase, question by question, and writes code for most of the questions.",
        problem_block(c),
        learner_block(c),
        f'The learner asked the path to focus on:\n"""\n{wanted}\n"""' if wanted else "",
        lines(
            f"Design a path of exactly {phase_count} phases that takes the learner from not knowing the {p.thing} to {p.goal}:",
            f"- Each phase has 3 or 4 questions in learning order, easiest first. Build up in small steps: {p.steps}. Name the phases for this {p.thing}; do not use generic titles.",
            "- Every question is one clear question or task a learner can attempt on their own, about one idea or one step. Write each title as a full sentence: a question or an instruction.",
            '- "kind" is one of: concept (explain an idea), implementation (write a small piece of code), algorithm (reason about steps and complexity), scenario (apply the idea to a real-world situation).',
            '- "exercise" is true when the learner should write code to answer the question (most implementation and algorithm questions) and false for pure concept questions.',
            '- "difficulty" is easy, medium or hard. "effort" is a short estimate such as "5 min".',
            "- Do not give away the final solution: no solution code, and no question that states the complete algorithm outright. The questions guide the learner toward it.",
            "- No two questions may repeat each other.",
            f'- Also design one final boss: {p.final_task}, with a one-sentence framing in "story".',
        ),
        "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
        '{"phases":[{"title":"...","goal":"one sentence: what the learner can do after this phase","questions":[{"title":"...","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"easy","effort":"5 min","exercise":false}]}],"boss":{"title":"...","story":"...","objective":"...","difficulty":"hard","effort":"25 min"}}',
    )


# ── One question's lesson ───────────────────────────────────────────────────


def build_question_prompt(c: PromptCtx, q: QuestionRef, pos: PathPos, sibling_titles: List[str]) -> str:
    p = profile_of(c)
    exercise_rule = (
        '"exercise": a coding exercise. It is required for this question.'
        if q.wants_exercise
        else '"exercise": null for a pure concept question; add a coding exercise only when writing code would genuinely help.'
    )
    return blocks(
        f"You are a patient senior {p.instructor} writing the full lesson for ONE question in a guided practice path.",
        problem_block(c),
        learner_block(c),
        lines(position_block(pos), relation_text(q, p), question_block(q)),
        f"Other questions in this path (do not repeat them): {quoted(sibling_titles)}" if sibling_titles else "",
        lines(
            "Write these parts:",
            '1. "explanation": Markdown, 120 to 220 words. Explain the idea in plain language, step by step. Use `inline code` for identifiers.',
            f'2. "example": Markdown. A practical example: a small concrete input traced by hand, or a short real-world analogy, with a fenced {FENCE}python block when code helps.',
            f"3. {exercise_rule}",
            '   Shape: {"prompt":"what to implement, with the input and output described","function_name":"snake_case_name","starter_code":"Python 3 starter with the signature and a docstring, body left as pass","tests":[{"args":[],"expected":null,"label":"short name"}],"compare":"exact","solution":"a correct reference solution in Python 3"}',
            f"   - Python 3, one pure function. Arguments and the return value are JSON values (numbers, strings, booleans, null, lists, objects). {p.exercise_data} No input(), no printing, no imports beyond the standard library.",
            '   - 5 to 8 tests, from simple to tricky, with at least two edge cases. "args" is the list of positional arguments.',
            '   - "compare" is "exact", or "unordered" when the order of the items in the result does not matter.',
            "   - The reference solution must pass every test. Leave out any test whose expected value you are not sure of.",
            '4. "hints": exactly 3 progressive hints, from a gentle nudge to the key insight. None of them may state the complete solution.',
            '5. "solution_explanation": Markdown. The answer to the question with a short walkthrough. It is shown only when the learner asks for it.',
        ),
        lines(
            "Rules:",
            "- Teach this one question only. Do not wander into other topics.",
            f'- Do not give away the complete solution of the {p.main_thing} unless this question IS the {p.main_thing} (the final boss), and then only inside "solution" and "solution_explanation".',
            "- Plain, friendly, precise language. All code is Python 3.",
        ),
        "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
        '{"explanation":"...","example":"...","exercise":null,"hints":["...","...","..."],"solution_explanation":"..."}',
    )


# ── Breakdown ───────────────────────────────────────────────────────────────


def build_breakdown_prompt(
    c: PromptCtx,
    q: QuestionRef,
    pos: PathPos,
    existing: List[ExistingChild],
    path_titles: List[str],
    regenerate: bool,
) -> str:
    p = profile_of(c)
    kept = (
        lines(
            "Smaller questions this question already has (they stay; do not repeat or reword them):",
            *[f'- "{e.title}"{" (completed)" if e.completed else ""}' for e in existing],
        )
        if existing
        else ""
    )
    redo = (
        "The learner asked for a fresh breakdown, so write new questions that approach the steps differently from the earlier attempt."
        if regenerate
        else ""
    )
    return blocks(
        f"You are a patient senior {p.instructor}. A learner finds the question below too difficult. Break it down into smaller, simpler questions that teach what they are missing.",
        problem_block(c),
        learner_block(c),
        lines(position_block(pos), "Question to break down:", question_block(q)),
        kept,
        redo,
        f"Every question that already exists in this path (never repeat any of them): {quoted(path_titles)}" if path_titles else "",
        lines(
            "Rules:",
            '- First work out the prerequisite concepts the learner needs to answer the question: "prerequisites" lists 2 to 6 short names.',
            "- Then write 3 to 7 questions, ordered from easiest to hardest, in the order a learner should work through them.",
            "- Each question covers exactly one small concept or one implementation step.",
            '- "why" is one sentence on why this smaller question is needed to understand the parent question.',
            "- Stay at a basic level: do not jump ahead to advanced material, and do not leave the scope of the parent question. The last question brings the pieces together toward the parent without answering it.",
            '- "exercise" is true when the step involves writing code, false for a concept.',
            f"- Never give away the complete solution of the {p.main_thing}.",
            "- Never duplicate an existing question. Where an existing question already covers a step, build on it instead.",
        ),
        "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
        '{"prerequisites":["..."],"questions":[{"title":"...","why":"...","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"easy","effort":"5 min","exercise":false}]}',
    )


# ── Dive Deeper ─────────────────────────────────────────────────────────────


def build_deeper_prompt(
    c: PromptCtx,
    q: QuestionRef,
    pos: PathPos,
    existing: List[ExistingDeeper],
    path_titles: List[str],
    regenerate: bool,
) -> str:
    p = profile_of(c)
    kept = (
        lines(
            "Deeper questions this question already has (they stay; do not repeat or reword them):",
            *[f'- level {e.level}: "{e.title}"{" (completed)" if e.completed else ""}' for e in existing],
        )
        if existing
        else ""
    )
    redo = (
        "The learner asked for fresh questions, so explore different angles from the earlier attempt."
        if regenerate
        else ""
    )
    return blocks(
        f"You are a senior {p.instructor}. A learner understands the question below and wants to be challenged further. Write follow-up questions that explore the same concept at a deeper level.",
        problem_block(c),
        learner_block(c),
        lines(position_block(pos), "Question to go deeper on:", question_block(q)),
        kept,
        redo,
        f"Every question that already exists in this path (never repeat any of them): {quoted(path_titles)}" if path_titles else "",
        lines("Levels:", *[f"{n} = {LEVEL_NAMES[n]}" for n in (1, 2, 3, 4, 5)]),
        lines(
            "Rules:",
            '- Write 3 to 7 questions, ordered by level from 1 upward. Put each question\'s level in "level". Use only the levels that make sense for this question.',
            "- Cover the dimensions that are relevant to this question: how it works internally, why the approach works, alternative implementations, trade-offs and design decisions, time and space complexity, optimization techniques, edge cases and failure scenarios, real-world engineering uses, interview follow-ups, advanced variations.",
            '- "angle" is one of: internals, why-it-works, alternatives, trade-offs, complexity, optimization, edge-cases, real-world, interview, variation.',
            "- Every question must be directly about the question above. Do not add unrelated advanced questions to reach a count.",
            '- "exercise" is true when the learner should write code, false for a concept.',
            f"- Never give away the complete solution of the {p.main_thing}.",
            "- Never duplicate an existing question.",
        ),
        "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
        '{"questions":[{"title":"...","level":1,"angle":"internals","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"medium","effort":"8 min","exercise":false}]}',
    )


# ── AI Tutor ────────────────────────────────────────────────────────────────


def tutor_task(t: TutorInput, p: LabProfile) -> str:
    """What the tutor does this turn; any action without a case of its own (that is 'ask') answers the learner's message."""
    if t.action == "start":
        return "This is the first turn. Welcome the learner in one short sentence, then ask ONE diagnostic question to find out what they already understand about this question. Do not teach yet."
    if t.action == "hint":
        return f'Give hint {t.hint_level} of 3. Level 1 is a gentle nudge on how to think about the question; level 2 names the key idea or pattern; level 3 lays out the approach step by step without final code. Do not repeat earlier hints. Start with "Hint {t.hint_level} of 3 — ".'
    if t.action == "example":
        return f"Explain the concept with one practical example or an everyday analogy, then connect it to the {p.main_thing}. Finish with ONE short check question."
    if t.action == "simplify":
        return "The learner finds this too hard. Re-explain the concept in simpler words and smaller steps, with an analogy. Finish with ONE easy check question."
    if t.action == "exercise":
        return f"Give the learner ONE small coding exercise on this concept (not the solution of the {p.main_thing}): a clear specification, an example input and output, and optionally a signature to start from. Tell them they can paste their attempt here and you will review it."
    if t.action == "test":
        return "Test the learner's understanding: ask ONE question (answerable in a few sentences or a few lines of code) that checks the key idea of this question. Do not give away the answer. They will answer in their next message."
    if t.action == "mistake":
        return "Explain the learner's mistake. Use their code and the test report above: say what is wrong and why, in plain words, and point at the line or the idea to fix. Do not write the corrected solution. Finish with ONE question that guides them to the fix."
    if t.action == "star":
        return "The learner just read the reference answer above and wants to understand it. Ask which part is unclear, or pick the part most likely to confuse and explain it simply; then ask ONE follow-up question."
    return f'The learner says:\n"""\n{t.message}\n"""\nIf it is a question, answer it using the context above, then ask ONE follow-up question that checks or extends their understanding. If it is an answer to your last question, evaluate it (see the verdict rule).'


def build_tutor_prompt(c: PromptCtx, t: TutorInput) -> str:
    p = profile_of(c)
    turns = "\n\n".join(f"{'Learner' if h.role == 'learner' else 'Tutor'}: {h.text}" for h in t.history[-16:])
    return blocks(
        "You are a patient, technically strong programming mentor tutoring one learner through a conversation, inside a guided practice page.",
        problem_block(c),
        lines(position_block(t.pos), question_block(t.question)),
        f'The lesson text the learner can see:\n"""\n{t.explanation}\n"""' if t.explanation else "",
        f'The coding exercise the learner can see:\n"""\n{t.exercise_prompt}\n"""' if t.exercise_prompt else "",
        f"Smaller questions this question was broken into: {quoted(t.child_titles)}" if t.child_titles else "",
        f"Exercises the learner has completed: {quoted(t.completed_exercise_titles[:20])}" if t.completed_exercise_titles else "",
        f"The learner's current code:\n{FENCE}python\n{t.learner_code}\n{FENCE}" if js_trim(t.learner_code) else "",
        f"The result of the learner's last test run:\n{t.test_report}" if js_trim(t.test_report) else "",
        f'The reference answer the learner has read:\n"""\n{t.star_answer}\n"""' if js_trim(t.star_answer) else "",
        "The learner has already opened the reference solution of this question." if t.solution_revealed else "",
        lines(
            "Teaching approach (follow it every turn):",
            "1. Find out what the learner already understands before teaching.",
            "2. Explain the concept in simple language.",
            "3. Use practical examples and analogies.",
            "4. Break complicated explanations into small steps.",
            "5. Ask ONE follow-up question at the end of your reply, then stop and wait for the answer.",
            "6. Evaluate the learner's answers and correct misconceptions kindly and precisely.",
            "7. Prefer hints to answers; never hand the answer over outright.",
            "8. Raise the difficulty gradually as the learner does well.",
            f"9. Connect the concept back to the {p.main_thing}.",
            f"Never reveal the complete solution of the {p.main_thing}, or the full solution code of the exercise, unless the learner explicitly asks for it in their latest message.",
        ),
        lines(
            "Verdict rule: when the learner's latest message answers a question you asked, judge it first: say plainly what is right and what is not and correct any misconception. Then end your reply with exactly one line: [[verdict: understood]], [[verdict: partial]] or [[verdict: not_yet]]. Use understood only when the answer is correct and shows real understanding of the key idea. Add that line only when you evaluated an answer, and never mention it in the text.",
        ),
        f"Style: Markdown, under 170 words unless code is needed, warm and direct, no greeting after the first turn, fenced {FENCE}python blocks for code.",
        f"Conversation so far:\n{turns}" if turns else "",
        f"Now do this: {tutor_task(t, p)}",
    )


# ── Answer in STAR ──────────────────────────────────────────────────────────


def build_star_prompt(c: PromptCtx, s: StarInput) -> str:
    variant = ""
    if s.variant == "simplify":
        variant = f'Here is the current answer:\n"""\n{s.existing_answer}\n"""\nRewrite it in simpler language for a learner who found it hard: shorter sentences, a quick definition for every technical term, smaller steps and one easy analogy. Keep the same headings, and keep the code and the complexity correct.'
    elif s.variant == "example":
        variant = f'Here is the current answer:\n"""\n{s.existing_answer}\n"""\nWrite ANOTHER worked example for the same question: a different input or scenario, under the same headings (one or two sentences each for Situation and Task, then a step-by-step Action and Result). Do not repeat the earlier example.'
    return blocks(
        "You are a senior engineer writing a complete reference answer to ONE question with the STAR framework (Situation, Task, Action, Result), adapted for technical questions.",
        problem_block(c),
        lines(position_block(s.pos), question_block(s.question)),
        f'The lesson text the learner has seen:\n"""\n{s.explanation}\n"""' if s.explanation else "",
        f'The coding exercise of this question:\n"""\n{s.exercise_prompt}\n"""' if s.exercise_prompt else "",
        lines(
            "Adapt STAR to the kind of question:",
            "- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.",
            "- implementation: focus on the actual implementation and its code.",
            "- algorithm: explain the reasoning, a step-by-step execution trace and the complexity.",
            "- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical example.",
            "Never invent personal experiences, project outcomes or metrics. For technical questions use concrete hypothetical examples and say that they are examples.",
        ),
        lines(
            "Write Markdown with exactly these headings, in this order:",
            "## S — Situation: the context of the problem, where the concept is relevant, the underlying challenge.",
            "## T — Task: what needs to be achieved, the technical requirement, the expected outcome.",
            f"## A — Action: the approach step by step; the data structures and algorithms involved; Python 3 code in fenced {FENCE}python blocks; why the approach works; alternatives and trade-offs where relevant; a small execution walkthrough or text diagram when it helps.",
            "## R — Result: the outcome; time complexity; space complexity; edge cases and the expected behaviour.",
            "## Common mistakes",
            "## Interview tips",
        ),
        'Put important technical terms in **bold**. Be complete but tight: roughly 350 to 650 words plus code. Write the heading lines as plain headings (for example "## S — Situation"), without the descriptions above.',
        variant,
        "Respond with the Markdown only: no preamble, and do not wrap the whole answer in a code fence.",
    )
