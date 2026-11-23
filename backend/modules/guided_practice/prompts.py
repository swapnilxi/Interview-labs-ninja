"""Every prompt of Guided Practice (the dedicated page behind a lab topic's "Guided Practice" card, in every lab): the path
outline, one question's lesson, Breakdown, Dive Deeper, the AI Tutor's turns and the STAR answer.

Twin: frontend/fe-apis/guidedPractice/prompts.ts -- the texts are identical on purpose, so change both together.

The endpoints only build a prompt and run it; the browser parses and cleans the answer
(frontend/src/modules/labs/dsa-lab/guided/parse.ts), so the JSON shapes named here are that parser's contract.

What differs between the labs is a few words (an algorithms problem vs a computer vision topic vs a communication skill),
how exercise data is laid out, and how much of the path is code at all; those live in PROFILES below. The DSA texts are the
original ones, and dsa and cv keep every sentence they had: the new fields hold exactly the text that used to be hard-coded,
and `lab_note` / `exercise_note` are empty for them (an empty line is dropped), so their prompts are byte-identical to before.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Tuple, get_args

FENCE = "```"

GuidedLab = Literal["dsa", "cv", "system_design", "communication", "finance", "python", "genai"]
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
    practice: str  # what the learner does in the path, after "and": the outline prompt ("... and writes code for most of the questions")
    kinds: str  # what each question kind means, after `"kind" is one of: `
    lab_note: str  # optional: one rule about the lab's nature, added to every prompt that has rules (empty for dsa and cv)
    exercise_note: str  # optional: one rule about when a question gets a coding exercise (empty for dsa and cv)
    mentor: str  # the tutor's role: "a patient, ___ tutoring one learner"
    exercise_task: str  # what the tutor's "give me an exercise" action asks for (after "Give the learner ")
    star_writer: str  # the STAR writer ("You are ___") ...
    star_for: str  # ... and what the framework is adapted for ("..., ___")
    star_kinds: str  # the four "- concept / implementation / algorithm / scenario" lines of the STAR adaptation, joined with newlines
    star_action: str  # what the Action heading asks for
    star_result: str  # what the Result heading asks for


PROFILES: Dict[str, LabProfile] = {
    "dsa": LabProfile(
        instructor="algorithms instructor",
        kind="data-structures-and-algorithms problem",
        thing="problem",
        goal="solving it well",
        steps="the problem statement, its constraints and tiny examples, the prerequisites it needs, tracing small inputs by hand, small Python exercises on each building block, a correct brute-force baseline, its bottleneck, the competing approaches and why one wins, the optimized implementation, then tests and edge cases",
        final_task="the whole problem as a closing challenge",
        boss_relation="This is the final boss: the complete original problem as a closing challenge. Only here may the reference solution solve the whole problem.",
        main_thing="original problem",
        exercise_data="Linked lists and trees are passed as plain lists; say how in the prompt.",
        subject_label="Original problem",
        category_label="Pattern family",
        summary_label="Problem summary",
        difficulty_label="Problem difficulty",
        practice="writes code for most of the questions",
        kinds="concept (explain an idea), implementation (write a small piece of code), algorithm (reason about steps and complexity), scenario (apply the idea to a real-world situation).",
        lab_note="",
        exercise_note="",
        mentor="technically strong programming mentor",
        exercise_task="ONE small coding exercise on this concept (not the solution of the original problem): a clear specification, an example input and output, and optionally a signature to start from. Tell them they can paste their attempt here and you will review it.",
        star_writer="a senior engineer",
        star_for="adapted for technical questions",
        star_kinds="- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.\n- implementation: focus on the actual implementation and its code.\n- algorithm: explain the reasoning, a step-by-step execution trace and the complexity.\n- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical example.",
        star_action=f"the approach step by step; the data structures and algorithms involved; Python 3 code in fenced {FENCE}python blocks; why the approach works; alternatives and trade-offs where relevant; a small execution walkthrough or text diagram when it helps.",
        star_result="the outcome; time complexity; space complexity; edge cases and the expected behaviour.",
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
        practice="writes code for most of the questions",
        kinds="concept (explain an idea), implementation (write a small piece of code), algorithm (reason about steps and complexity), scenario (apply the idea to a real-world situation).",
        lab_note="",
        exercise_note="",
        mentor="technically strong programming mentor",
        exercise_task="ONE small coding exercise on this concept (not the solution of the main challenge of the topic): a clear specification, an example input and output, and optionally a signature to start from. Tell them they can paste their attempt here and you will review it.",
        star_writer="a senior engineer",
        star_for="adapted for technical questions",
        star_kinds="- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.\n- implementation: focus on the actual implementation and its code.\n- algorithm: explain the reasoning, a step-by-step execution trace and the complexity.\n- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical example.",
        star_action=f"the approach step by step; the data structures and algorithms involved; Python 3 code in fenced {FENCE}python blocks; why the approach works; alternatives and trade-offs where relevant; a small execution walkthrough or text diagram when it helps.",
        star_result="the outcome; time complexity; space complexity; edge cases and the expected behaviour.",
    ),
    "system_design": LabProfile(
        instructor="system design instructor",
        kind="system design problem",
        thing="problem",
        goal="designing it well and defending the trade-offs",
        steps="clarify the requirements, estimate the scale, sketch the architecture, go deep on the hard components, then bottlenecks, failures and trade-offs",
        final_task="the whole system as a closing design challenge, as in a design round",
        boss_relation="This is the final boss: the complete system as a closing design challenge. Only here may the reference solution lay out the whole design.",
        main_thing="system being designed",
        exercise_data="Exercises are small calculations or simulations in plain Python: a back-of-envelope capacity or cost estimate, a cache hit-rate or queue simulation, a rate limiter, a consistent-hash ring or a sharding function on small inputs. Use plain numbers, lists and dicts, say in the prompt how a value is laid out, and never write infrastructure, networking or database code.",
        subject_label="System",
        category_label="Area",
        summary_label="Problem summary",
        difficulty_label="Problem difficulty",
        practice="reasons about requirements, numbers and trade-offs for most of the questions, with short Python calculations where they help",
        kinds="concept (explain an idea), implementation (write a small calculation or simulation in code), algorithm (reason about steps, load and cost), scenario (apply the idea to a real-world system).",
        lab_note="This is a system design lab: reason about requirements, scale, architecture, data flow, failure modes and trade-offs, in words, numbers and text diagrams.",
        exercise_note="Most questions are answered in words and numbers, so set \"exercise\" to true only for a short plain-Python calculation or simulation that genuinely helps (a capacity estimate, a cache or queue simulation, a hash ring), never for infrastructure code.",
        mentor="technically strong system design mentor",
        exercise_task="ONE small practice task on this concept (not the complete design of the system): a clear specification, example numbers or inputs and the expected result, as a short calculation or a small plain-Python function. Tell them they can paste their attempt here and you will review it.",
        star_writer="a senior engineer",
        star_for="adapted for system design questions",
        star_kinds="- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.\n- implementation: focus on the calculation or simulation and its code.\n- algorithm: explain the reasoning and a step-by-step trace of how the system behaves under load, with the cost of scaling it.\n- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical system.",
        star_action=f"the approach step by step: the requirements, components, data flow and storage choices; Python 3 code in fenced {FENCE}python blocks only for a calculation or simulation; why the design works; alternatives and trade-offs; a text diagram of the architecture when it helps.",
        star_result="the outcome; the capacity, latency and cost numbers; the bottlenecks and failure modes and how the design handles them.",
    ),
    "communication": LabProfile(
        instructor="communication coach",
        kind="communication skill",
        thing="skill",
        goal="using it with confidence in real messages, meetings and conversations",
        steps="understand why the skill matters, learn the structure or the phrases, try it on a short message, handle a realistic situation, then the tricky cases and the habits that make it stick",
        final_task="a realistic closing scenario where the learner uses the whole skill, as in a real meeting, email or conversation",
        boss_relation="This is the final boss: a realistic closing scenario that uses the whole skill. Only here may the model answer show the complete response.",
        main_thing="closing scenario",
        exercise_data="Communication questions are answered in words, not code. Write an exercise only when plain Python really fits (for example counting words, or checking that a message contains a greeting and a clear ask), standard library only, and say in the prompt how a value is laid out.",
        subject_label="Lesson",
        category_label="Area",
        summary_label="Lesson summary",
        difficulty_label="Lesson difficulty",
        practice="practises by explaining, drafting, rewriting and role-playing for most of the questions, not by writing code",
        kinds="concept (explain an idea), implementation (draft or rewrite a short message, script or answer), algorithm (follow a step-by-step framework such as STAR or BLUF), scenario (handle a realistic workplace situation).",
        lab_note="This is a communication lab: the questions are about wording, structure, tone, listening and judgement, and the learner answers in sentences they write or say, not in code. Keep the English simple enough for a non-native speaker.",
        exercise_note="Set \"exercise\" to false for almost every question; use true only when a tiny plain-Python check of text or numbers genuinely fits.",
        mentor="warm, practical communication coach",
        exercise_task="ONE short practice task on this concept (not the closing scenario): a realistic situation, who they are talking to and what they want, and what to write or say. Tell them they can paste their attempt here and you will review it.",
        star_writer="a senior communication coach",
        star_for="adapted for communication questions",
        star_kinds="- concept: use STAR as a structured explanation. Situation is where the skill matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.\n- implementation: show the actual wording (the email, message or script) and why each choice works.\n- algorithm: explain the steps of the framework in order, applied to a worked example.\n- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical workplace example.",
        star_action=f"the approach step by step, with the actual words to use (phrases, a short script or a rewritten message in fenced {FENCE}text blocks), why they work and what to avoid, and a more formal and a more casual alternative where relevant.",
        star_result="the outcome for the listener or reader; how to tell the message landed; the follow-up to expect.",
    ),
    "finance": LabProfile(
        instructor="finance instructor",
        kind="finance topic",
        thing="topic",
        goal="understanding it and working with real numbers",
        steps="build the intuition in plain English, learn the formula, work it with small round numbers, apply it in a short calculation or code, then the risks, limits and common mistakes",
        final_task="a closing challenge that applies the whole topic to a realistic case with real numbers",
        boss_relation="This is the final boss: a closing challenge that applies the whole topic to a realistic case. Only here may the reference solution solve the whole case.",
        main_thing="main challenge of the topic",
        exercise_data="Money is a number (use floats and round results with round(x, 2)), a price series or a cash-flow schedule is a list of numbers, and everything stays plain Python: no pandas, numpy or scikit-learn. Keep inputs small and say in the prompt how a value is laid out and how results are rounded.",
        subject_label="Topic",
        category_label="Area",
        summary_label="Topic summary",
        difficulty_label="Topic difficulty",
        practice="works through numbers and short Python calculations for many of the questions",
        kinds="concept (explain an idea), implementation (write a small calculation in code), algorithm (reason step by step through a formula or a method), scenario (apply the idea to a realistic money situation).",
        lab_note="This is a finance lab for beginners: explain in plain English first, define every term and use small round numbers. It is educational content, not financial advice, so never recommend buying or selling anything.",
        exercise_note="Use \"exercise\" true for a question that is a calculation (compounding, returns, ratios, risk) and false for questions about ideas, markets and judgement.",
        mentor="patient, numerate finance mentor",
        exercise_task="ONE small exercise on this concept (not the solution of the main challenge of the topic): a clear specification, example numbers and the expected result, as a short calculation or a small plain-Python function. Tell them they can paste their attempt here and you will review it.",
        star_writer="a senior finance instructor",
        star_for="adapted for finance questions",
        star_kinds="- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.\n- implementation: focus on the calculation and its code.\n- algorithm: explain the reasoning and a step-by-step worked calculation.\n- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical case and made-up numbers.",
        star_action=f"the approach step by step; the formula or method and what each symbol means; a worked calculation with small round numbers; Python 3 code in fenced {FENCE}python blocks where code helps; why it works; alternatives and trade-offs where relevant.",
        star_result="the outcome with its units and rounding; how to sanity-check it; the main risk or limitation; edge cases.",
    ),
    "python": LabProfile(
        instructor="Python instructor",
        kind="Python topic",
        thing="topic",
        goal="writing it well and understanding what Python does",
        steps="understand the idea, read the syntax, write it yourself on a small input, see what Python does under the hood, then the pitfalls and the idiomatic style",
        final_task="a closing challenge that applies the whole topic in a small program",
        boss_relation="This is the final boss: a closing challenge that applies the whole topic in a small program. Only here may the reference solution solve the whole challenge.",
        main_thing="main challenge of the topic",
        exercise_data="Everything stays in the Python standard library: no third-party packages, no files, no network and no randomness. Keep inputs small, and when a topic needs a class, an iterator or an exception, test it through one pure function that uses it and returns plain values.",
        subject_label="Topic",
        category_label="Area",
        summary_label="Topic summary",
        difficulty_label="Topic difficulty",
        practice="writes code for most of the questions",
        kinds="concept (explain an idea), implementation (write a small piece of code), algorithm (reason about steps and complexity), scenario (apply the idea to a real-world situation).",
        lab_note="Teach idiomatic, readable Python 3, and name the gotcha behind a common mistake.",
        exercise_note="Everything runs in the browser with the standard library only, so a topic that needs a third-party package, a file, the network or a database is taught in words and a short snippet, with \"exercise\" false.",
        mentor="technically strong Python mentor",
        exercise_task="ONE small coding exercise on this concept (not the solution of the main challenge of the topic): a clear specification, an example input and output, and optionally a signature to start from. Tell them they can paste their attempt here and you will review it.",
        star_writer="a senior Python engineer",
        star_for="adapted for technical questions",
        star_kinds="- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.\n- implementation: focus on the actual implementation and its code.\n- algorithm: explain the reasoning, a step-by-step execution trace and the complexity.\n- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical example.",
        star_action=f"the approach step by step; the language features and standard-library tools involved; Python 3 code in fenced {FENCE}python blocks; why the approach works; the idiomatic alternative and trade-offs where relevant; a small execution walkthrough or text diagram when it helps.",
        star_result="the outcome; what the code prints; time and memory cost where relevant; edge cases and the expected behaviour.",
    ),
    "genai": LabProfile(
        instructor="AI engineering instructor",
        kind="generative AI topic",
        thing="topic",
        goal="understanding how it works and building with it well",
        steps="build the mental model, follow the mechanism on a tiny example, build a minimal version, compare the design choices, then the failure modes, cost and evaluation",
        final_task="a closing challenge that builds or analyses a small piece of an AI system end to end",
        boss_relation="This is the final boss: a closing challenge that builds or analyses a small piece of an AI system end to end. Only here may the reference solution solve the whole challenge.",
        main_thing="main challenge of the topic",
        exercise_data="Exercises are small and deterministic, in plain Python with no network, no model calls and no third-party packages: a toy tokenizer, a prompt template that fills in fields, cosine similarity between short lists of numbers, chunking text, a tiny retrieval over a few strings, a metric on labelled examples, or a cost estimate from token counts. Say in the prompt how a value is laid out.",
        subject_label="Topic",
        category_label="Area",
        summary_label="Topic summary",
        difficulty_label="Topic difficulty",
        practice="works through ideas and small deterministic Python examples for many of the questions",
        kinds="concept (explain an idea), implementation (write a small piece of code), algorithm (reason about steps, cost and failure modes), scenario (apply the idea to a real AI product).",
        lab_note="This is a generative AI lab: explain the mental model and the design choices first. Treat model names, prices and APIs as examples that change, and never invent the function names of a real SDK.",
        exercise_note="Use \"exercise\" true only for a small deterministic plain-Python task (no network, no model calls, no third-party packages); concept and design questions are false.",
        mentor="technically strong AI engineering mentor",
        exercise_task="ONE small coding exercise on this concept (not the solution of the main challenge of the topic): a clear specification, an example input and output in plain Python with no model calls, and optionally a signature to start from. Tell them they can paste their attempt here and you will review it.",
        star_writer="a senior AI engineer",
        star_for="adapted for generative AI questions",
        star_kinds="- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.\n- implementation: focus on the actual implementation and its code.\n- algorithm: explain the reasoning, a step-by-step trace of the data through the system and its cost.\n- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical AI product.",
        star_action=f"the approach step by step: the data, the model or retrieval step, the prompt or tool design; Python 3 code in fenced {FENCE}python blocks only where it is deterministic; why it works; alternatives and trade-offs; a text diagram of the data flow when it helps.",
        star_result="the outcome; rough cost and latency numbers; how to evaluate it; failure modes and the expected behaviour.",
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
    # The plan of the path: phase titles and goals, and the boss. The answer itself is short (~600 tokens), but a
    # reasoning model's hidden thinking counts against this budget: 1500 left it cut off mid-JSON ("not valid JSON").
    "outline": 6144,  # a new path's plan also carries the questions of phase 1 (first_phase_questions)
    "phase": 6144,  # one page of the path: PHASE_QUESTIONS full questions (room for thinking, as above)
    "question": 5000,
    "breakdown": 3000,
    "deeper": 3000,
    "tutor": 1500,
    "star": 4000,
}

TutorAction = Literal["start", "ask", "hint", "example", "simplify", "exercise", "test", "mistake", "star"]
TUTOR_ACTIONS: Tuple[str, ...] = get_args(TutorAction)

StarVariant = Literal["generate", "simplify", "example", "code"]
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


def lab_of(c: PromptCtx) -> str:
    """The lab whose profile a request reads (an unknown lab reads as DSA, like profile_of)."""
    return c.lab if c.lab in PROFILES else "dsa"


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
        f"You are a senior {p.instructor} designing a guided practice path for ONE {p.kind}. The learner works through it phase by phase, question by question, and {p.practice}.",
        problem_block(c),
        learner_block(c),
        f'The learner asked the path to focus on:\n"""\n{wanted}\n"""' if wanted else "",
        lines(
            f"Design a path of exactly {phase_count} phases that takes the learner from not knowing the {p.thing} to {p.goal}:",
            f"- Each phase has 3 or 4 questions in learning order, easiest first. Build up in small steps: {p.steps}. Name the phases for this {p.thing}; do not use generic titles.",
            "- Every question is one clear question or task a learner can attempt on their own, about one idea or one step. Write each title as a full sentence: a question or an instruction.",
            f'- "kind" is one of: {p.kinds}',
            '- "exercise" is true when the learner should write code to answer the question (most implementation and algorithm questions) and false for pure concept questions.',
            f"- {p.exercise_note}" if p.exercise_note else "",
            '- "difficulty" is easy, medium or hard. "effort" is a short estimate such as "5 min".',
            "- Do not give away the final solution: no solution code, and no question that states the complete algorithm outright. The questions guide the learner toward it.",
            "- No two questions may repeat each other.",
            f'- Also design one final boss: {p.final_task}, with a one-sentence framing in "story".',
            f"- {p.lab_note}" if p.lab_note else "",
        ),
        "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
        '{"phases":[{"title":"...","goal":"one sentence: what the learner can do after this phase","questions":[{"title":"...","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"easy","effort":"5 min","exercise":false}]}],"boss":{"title":"...","story":"...","objective":"...","difficulty":"hard","effort":"25 min"}}',
    )


# ── The path in pages: a plan, then one phase at a time ─────────────────────
#
# The one-shot curriculum above asks for the whole path in one answer; on a slow or verbose model that answer is cut off.
# These two prompts split it: `outline` plans the phases (titles and goals) and the boss, `phase` writes ONE phase of
# PHASE_QUESTIONS full questions. The learner asks for the next page with "Generate more", and "Regenerate phase" is the same call.

# Questions the AI writes per call (the default; the learner may ask for another count). Twin: PHASE_QUESTIONS in prompts.ts.
PHASE_QUESTIONS = 5

# Labs whose answers are programs: their coding answers follow the baseline-to-optimized order.
CODE_ANSWER_LABS = ("dsa", "cv", "python", "genai")
# Labs where the heap example of the question rules fits.
CODING_EXAMPLE_LABS = ("dsa", "python")


def question_rules(c: PromptCtx, p: LabProfile) -> List[str]:
    """The rules every generated question follows (the outline's first phase, a phase, added questions)."""
    return [
        "- Every question asks for ONE clear task about one idea, written as a full sentence: a question or an instruction the learner can attempt on their own.",
        "- Teach prerequisites before using them: the first time an idea, a data structure or a library function appears, ask what it is and how to use it on its own, before any question needs it.",
        "- Mix the kinds of question where they fit: concept (what it is, why it is used), tracing (follow a tiny input by hand), decision (choose between approaches and justify it), and small hands-on coding exercises.",
        '- For example, for a heap problem ask separately what a priority queue does, how to push and pop with Python\'s heapq, what the heap holds after a push or a pop, and why repeated dictionary scans cost more for this problem, before asking for the full solution.'
        if lab_of(c) in CODING_EXAMPLE_LABS
        else "",
        "- Titles and objectives never contain the answer, the solution or a hint that gives it away.",
        f'- "kind" is one of: {p.kinds}',
        '- "exercise" is true when the learner should write code to answer the question (most implementation and algorithm questions) and false for pure concept questions.',
        f"- {p.exercise_note}" if p.exercise_note else "",
        '- "difficulty" is easy, medium or hard. "effort" is a short estimate such as "5 min".',
        "- Do not give away the final solution: no solution code, and no question that states the complete algorithm outright. The questions guide the learner toward it.",
    ]


@dataclass
class OutlinePhase:
    title: str
    goal: str = ""


@dataclass
class PhaseInput:
    number: int
    title: str = ""  # empty: a phase the plan does not have yet, so the AI also chooses its title and goal
    goal: str = ""
    outline: List[OutlinePhase] = field(default_factory=list)  # every phase of the plan, in order
    other_titles: List[str] = field(default_factory=list)  # questions the rest of the path already has
    kept_titles: List[str] = field(default_factory=list)  # questions of THIS phase that stay (a regenerate keeps worked ones)
    focus: str = ""
    count: int = PHASE_QUESTIONS  # how many questions to write
    existing_titles: List[str] = field(default_factory=list)  # "Add questions": the phase's questions, in order; write NEW ones after them
    outline_start: int = 1  # the number of the first phase in `outline` (a long path sends the phases around this one)


OUTLINE_QUESTION_SHAPE = '{"title":"...","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"easy","effort":"5 min","exercise":false}'


def build_outline_prompt(
    c: PromptCtx,
    phase_count: int,
    focus: str,
    first_phase_questions: int = 0,
    existing: Optional[List[OutlinePhase]] = None,
    add_count: int = 1,
) -> str:
    wanted = js_trim(focus)
    p = profile_of(c)
    if existing:
        # "Add phase": only the outlines of the new phases; their questions are written later, on demand.
        have = "\n".join(f"{i + 1}. {o.title}" + (f" - {o.goal}" if o.goal else "") for i, o in enumerate(existing))
        return blocks(
            f"You are a senior {p.instructor} extending a guided practice path for ONE {p.kind}. The learner works through it phase by phase, question by question, and {p.practice}. You plan only the outline of the new phases now: their questions are written later, on demand.",
            problem_block(c),
            learner_block(c),
            f'The learner asked the path to focus on:\n"""\n{wanted}\n"""' if wanted else "",
            f"The path already has these phases, in order:\n{have}",
            lines(
                f"Plan exactly {add_count} NEW phase{'' if add_count == 1 else 's'} that come after them:",
                "- Continue the learning order and go one step further than the last phase. Do not repeat or rename a phase the path already has.",
                f"- Name each phase for this {p.thing}; do not use generic titles.",
                '- Every phase has a "goal": one sentence on what the learner can do after it.',
                f"- {p.lab_note}" if p.lab_note else "",
            ),
            "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
            '{"phases":[{"title":"...","goal":"one sentence: what the learner can do after this phase"}]}',
        )
    first = (
        lines(
            f"Also write the questions of phase 1 now, and only of phase 1: exactly {first_phase_questions} questions, in learning order, easiest first. The other phases get an empty \"questions\" list; they are written later, on demand.",
            f"- Phase 1 is the learner's very first contact with the {p.thing}, so keep every question basic: \"easy\", about 5 minutes each. Start with the problem statement, its constraints, a tiny example, and what each building block is, in the simplest words, then tiny hands-on tasks on one small example.",
            *question_rules(c, p),
            "- No two questions may repeat each other.",
        )
        if first_phase_questions > 0
        else ""
    )
    shape = (
        '{"phases":[{"title":"...","goal":"one sentence: what the learner can do after this phase","questions":['
        + OUTLINE_QUESTION_SHAPE
        + ']},{"title":"...","goal":"...","questions":[]}],"boss":{"title":"...","story":"...","objective":"...","difficulty":"hard","effort":"25 min"}}'
        if first_phase_questions > 0
        else '{"phases":[{"title":"...","goal":"one sentence: what the learner can do after this phase"}],"boss":{"title":"...","story":"...","objective":"...","difficulty":"hard","effort":"25 min"}}'
    )
    return blocks(
        f"You are a senior {p.instructor} planning a guided practice path for ONE {p.kind}. The learner works through it phase by phase, question by question, and {p.practice}."
        + (" You plan the outline now; each later phase is written on its own, on demand." if first_phase_questions > 0 else " Each phase is written later, on its own: you plan only the outline now."),
        problem_block(c),
        learner_block(c),
        f'The learner asked the path to focus on:\n"""\n{wanted}\n"""' if wanted else "",
        lines(
            f"Plan a path of exactly {phase_count} phases in learning order that takes the learner from not knowing the {p.thing} to {p.goal}:",
            f"- Start from the very beginning: phase 1 is the plain basics, what the {p.thing} is, what it is for and how it works, in the simplest words, before any technique. Do not assume the learner already knows them.",
            f"- Build up in small steps: {p.steps}. Name the phases for this {p.thing} with topic-specific titles; do not use generic titles.",
            "- Across the phases the learner must also meet the limits of the idea: why it is used instead of the alternatives, and when it fails or becomes the wrong choice.",
            '- Every phase has a "goal": one sentence on what the learner can do after it.',
            f'- Also plan one final boss: {p.final_task}, with a one-sentence framing in "story".',
            f"- {p.lab_note}" if p.lab_note else "",
        ),
        first,
        "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
        shape,
    )


def build_phase_prompt(c: PromptCtx, ph: PhaseInput) -> str:
    wanted = js_trim(ph.focus)
    p = profile_of(c)
    start = max(1, ph.outline_start)
    plan = "\n".join(f"{start + i}. {o.title}" + (f" - {o.goal}" if o.goal else "") for i, o in enumerate(ph.outline))
    wanted_count = max(1, ph.count)
    if ph.existing_titles:
        what = f"Add questions to phase {ph.number}" + (f': "{ph.title}".' if ph.title else ".")
        how = (
            f"- This phase already has these questions, in this order: {quoted(ph.existing_titles)}. They all stay. Write exactly {wanted_count} NEW question{'' if wanted_count == 1 else 's'} that come after them:"
            " continue the phase goal, go one step further, and do not repeat or reword any of them."
        )
    elif ph.kept_titles:
        what = f"Write the questions of phase {ph.number}" + (f': "{ph.title}".' if ph.title else ".")
        how = f"- These questions of this phase stay as they are: {quoted(ph.kept_titles)}. Write exactly {max(1, wanted_count - len(ph.kept_titles))} NEW questions that fit with them."
    else:
        what = f"Write the questions of phase {ph.number}" + (f': "{ph.title}".' if ph.title else ".")
        how = f"- Write exactly {wanted_count} questions."
    return blocks(
        f"You are a senior {p.instructor} writing one phase of a guided practice path for ONE {p.kind}. The learner works through it phase by phase, question by question, and {p.practice}.",
        problem_block(c),
        learner_block(c),
        f'The learner asked the path to focus on:\n"""\n{wanted}\n"""' if wanted else "",
        f"The phases around this one:\n{plan}" if plan else "",
        lines(
            what,
            f"Goal of this phase: {ph.goal}" if ph.goal else "",
            "" if ph.title else "- This phase is not in the plan yet: choose its title and its goal, continuing naturally from the phases above and going one step further.",
            how,
            f"- Put them in learning order, easiest first. Build up in small steps: {p.steps}.",
            (
                f"- This is phase 1, the learner's very first contact with the {p.thing}, so keep every question very basic: all \"easy\", about 5 minutes each. Start with the problem statement, its constraints, a tiny example and what each building block is, in the simplest words, then tiny hands-on tasks on one small example, one step at a time. No edge cases, trade-offs, limits, complexity or interview-style problems yet: the later phases cover those."
                if ph.number == 1
                else '- Do not assume the learner knows the basics. Mix the kinds of question: what it is, why it is used here instead of the alternatives, how it works, when it fails or becomes the wrong choice (limits, edge cases, trade-offs), and how to spot and fix a mistake.'
            ),
            *question_rules(c, p),
            f"- Do not repeat any question the path already has: {quoted(ph.other_titles)}" if ph.other_titles else "- No two questions may repeat each other.",
            f"- {p.lab_note}" if p.lab_note else "",
        ),
        "Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:",
        '{"title":"...","goal":"one sentence: what the learner can do after this phase","questions":[' + OUTLINE_QUESTION_SHAPE + ']}',
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
            "   For a coding question, go from a tiny example and a correct baseline to the best approach: name the bottleneck, say why the alternatives lose, then the optimized Python code, a dry run on the tiny example, the time and space complexity, and the edge cases."
            if lab_of(c) in CODE_ANSWER_LABS and (q.wants_exercise or q.kind in ("implementation", "algorithm"))
            else "",
        ),
        lines(
            "Rules:",
            "- Teach this one question only. Do not wander into other topics.",
            f'- Do not give away the complete solution of the {p.main_thing} unless this question IS the {p.main_thing} (the final boss), and then only inside "solution" and "solution_explanation".',
            "- Plain, friendly, precise language. All code is Python 3.",
            f"- {p.lab_note}" if p.lab_note else "",
            f"- {p.exercise_note}" if p.exercise_note else "",
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
            f"- {p.exercise_note}" if p.exercise_note else "",
            f"- Never give away the complete solution of the {p.main_thing}.",
            "- Never duplicate an existing question. Where an existing question already covers a step, build on it instead.",
            f"- {p.lab_note}" if p.lab_note else "",
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
            f"- {p.exercise_note}" if p.exercise_note else "",
            f"- Never give away the complete solution of the {p.main_thing}.",
            "- Never duplicate an existing question.",
            f"- {p.lab_note}" if p.lab_note else "",
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
        return f"Give the learner {p.exercise_task}"
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
        f"You are a patient, {p.mentor} tutoring one learner through a conversation, inside a guided practice page.",
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
            "0. Tutor this ONE question only. Start at the learner's current level, wait for their attempt, then give targeted feedback or ONE hint and resolve their doubts about this question. Do not move on to another question: only when the learner says \"next\" or \"worked, next\", tell them in one sentence to open the next question of the path.",
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
            p.lab_note,
        ),
        lines(
            "Verdict rule: when the learner's latest message answers a question you asked, judge it first: say plainly what is right and what is not and correct any misconception. Then end your reply with exactly one line: [[verdict: understood]], [[verdict: partial]] or [[verdict: not_yet]]. Use understood only when the answer is correct and shows real understanding of the key idea. Add that line only when you evaluated an answer, and never mention it in the text.",
        ),
        f"Style: Markdown, under 170 words unless code is needed, warm and direct, no greeting after the first turn, fenced {FENCE}python blocks for code.",
        f"Conversation so far:\n{turns}" if turns else "",
        f"Now do this: {tutor_task(t, p)}",
    )


# ── Answer in STAR ──────────────────────────────────────────────────────────


def build_star_code_prompt(c: PromptCtx, s: StarInput) -> str:
    """The `code` variant: the Python implementation of the question, as one code block.

    It is written when the learner presses "Show code implementation", and follows the approach of their STAR answer when
    they have one (`existing_answer`, optional). Python only, standard library only: it is the language of every exercise in
    the path.
    """
    p = profile_of(c)
    return blocks(
        f"You are a senior {p.instructor} writing the Python implementation for ONE question.",
        problem_block(c),
        lines(position_block(s.pos), question_block(s.question)),
        f'The lesson text the learner has seen:\n"""\n{s.explanation}\n"""' if s.explanation else "",
        f'The coding exercise of this question:\n"""\n{s.exercise_prompt}\n"""' if s.exercise_prompt else "",
        f'The STAR answer the learner has for this question. Implement the approach it describes:\n"""\n{s.existing_answer}\n"""'
        if s.existing_answer
        else "",
        lines(
            "Rules:",
            "- Python 3 only. Do not write any other programming language, not even in a comment.",
            "- Use the standard library and plain Python data structures only: no third-party packages such as numpy, pandas, OpenCV or PyTorch.",
            "- Write one complete program that runs as it is: imports first, clear names, and small helper functions where they make it easier to read.",
            "- Give every function a short docstring that says what it does and its time and space complexity. Comment the lines that need a reason, not the obvious ones.",
            "- When a simpler correct approach exists, write it first as a baseline function, then the optimized one, with a comment on the baseline's bottleneck and why the optimized approach wins.",
            '- Finish with an if __name__ == "__main__": block that runs a tiny example as a dry run, then two or three more examples including edge cases, with print() and the expected output in comments.',
            "- If the question is about an idea and there is no algorithm to write, write a short runnable Python demonstration of the idea instead.",
            p.lab_note,
        ),
        f"Respond with exactly one fenced {FENCE}python code block and nothing else: no explanation before or after it.",
    )


def build_star_prompt(c: PromptCtx, s: StarInput) -> str:
    if s.variant == "code":
        return build_star_code_prompt(c, s)
    p = profile_of(c)
    variant = ""
    if s.variant == "simplify":
        variant = f'Here is the current answer:\n"""\n{s.existing_answer}\n"""\nRewrite it in simpler language for a learner who found it hard: shorter sentences, a quick definition for every technical term, smaller steps and one easy analogy. Keep the same headings, and keep the code and the complexity correct.'
    elif s.variant == "example":
        variant = f'Here is the current answer:\n"""\n{s.existing_answer}\n"""\nWrite ANOTHER worked example for the same question: a different input or scenario, under the same headings (one or two sentences each for Situation and Task, then a step-by-step Action and Result). Do not repeat the earlier example.'
    return blocks(
        f"You are {p.star_writer} writing a complete reference answer to ONE question with the STAR framework (Situation, Task, Action, Result), {p.star_for}.",
        problem_block(c),
        lines(position_block(s.pos), question_block(s.question)),
        f'The lesson text the learner has seen:\n"""\n{s.explanation}\n"""' if s.explanation else "",
        f'The coding exercise of this question:\n"""\n{s.exercise_prompt}\n"""' if s.exercise_prompt else "",
        lines(
            "Adapt STAR to the kind of question:",
            p.star_kinds,
            "Never invent personal experiences, project outcomes or metrics. For technical questions use concrete hypothetical examples and say that they are examples.",
            p.lab_note,
        ),
        lines(
            "Write Markdown with exactly these headings, in this order:",
            "## S — Situation: the context of the problem, where the concept is relevant, the underlying challenge.",
            "## T — Task: what needs to be achieved, the technical requirement, the expected outcome.",
            f"## A — Action: {p.star_action}",
            f"## R — Result: {p.star_result}",
            "## Common mistakes",
            "## Interview tips",
        ),
        (
            "This is a coding question. In the Action, go in this order: a tiny example, a correct baseline in Python, its bottleneck, the alternatives and why they are rejected, the optimized Python code, a dry run on the tiny example, the time and space complexity, and the edge cases."
            if lab_of(c) in CODE_ANSWER_LABS and (s.question.wants_exercise or s.question.kind in ("implementation", "algorithm") or bool(s.exercise_prompt))
            else "This is a verbal answer: keep Situation, Task and Result to two or three sentences each, and label any example you make up as hypothetical."
        ),
        'Put important technical terms in **bold**. Be complete but tight: roughly 350 to 650 words plus code. Write the heading lines as plain headings (for example "## S — Situation"), without the descriptions above.',
        variant,
        "Respond with the Markdown only: no preamble, and do not wrap the whole answer in a code fence.",
    )
