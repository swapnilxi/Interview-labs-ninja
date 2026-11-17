/**
 * fe-apis/guidedPractice/prompts.ts
 *
 * Every prompt of Guided Practice (the dedicated page behind a lab topic's "Guided Practice" card, DSA and CV): the path
 * outline, one question's lesson, Breakdown, Dive Deeper, the AI Tutor's turns and the STAR answer. Python twin:
 * backend/modules/guided_practice/prompts.py -- the texts are identical on purpose, so change both together.
 *
 * The endpoints only build a prompt and run it; the browser parses and cleans the answer
 * (frontend/src/modules/labs/dsa-lab/guided/parse.ts), so the JSON shapes named here are that parser's contract.
 *
 * What differs between the labs is a few words (an algorithms problem vs a computer vision topic) and how exercise data is
 * laid out; those live in PROFILES below, and the DSA texts are the original ones.
 */

const FENCE = '```';

export const GUIDED_LABS = ['dsa', 'cv'] as const;
export type GuidedLab = (typeof GUIDED_LABS)[number];

/** The words of a prompt that depend on the lab. */
interface LabProfile {
  /** "a senior ___": who writes the lesson. */
  instructor: string;
  /** What the path is about, for the outline prompt: "ONE ___". */
  kind: string;
  /** How the prompts name it: "not knowing the ___". */
  thing: string;
  /** The goal of the path: "from not knowing the problem to ___". */
  goal: string;
  /** The steps a path builds up through. */
  steps: string;
  /** What the final boss is. */
  finalTask: string;
  /** The final boss, as a question's relation. */
  bossRelation: string;
  /** What must not be given away: "the complete solution of the ___". */
  mainThing: string;
  /** How an exercise's data is laid out (one sentence). */
  exerciseData: string;
  subjectLabel: string;
  categoryLabel: string;
  summaryLabel: string;
  difficultyLabel: string;
}

const PROFILES: Record<GuidedLab, LabProfile> = {
  dsa: {
    instructor: 'algorithms instructor',
    kind: 'data-structures-and-algorithms problem',
    thing: 'problem',
    goal: 'solving it well',
    steps:
      'understand the problem, spot the pattern, build the pieces, assemble the solution, then edge cases and follow-ups',
    finalTask: 'the whole problem as a closing challenge',
    bossRelation:
      'This is the final boss: the complete original problem as a closing challenge. Only here may the reference solution solve the whole problem.',
    mainThing: 'original problem',
    exerciseData: 'Linked lists and trees are passed as plain lists; say how in the prompt.',
    subjectLabel: 'Original problem',
    categoryLabel: 'Pattern family',
    summaryLabel: 'Problem summary',
    difficultyLabel: 'Problem difficulty',
  },
  cv: {
    instructor: 'computer vision instructor',
    kind: 'computer vision topic',
    thing: 'topic',
    goal: 'building and using it well',
    steps:
      'build the intuition, learn the core operation, implement it on small inputs, connect it to a real pipeline, then failure modes and trade-offs',
    finalTask: 'a closing challenge that applies the whole topic end to end',
    bossRelation:
      'This is the final boss: a closing challenge that applies the whole topic end to end. Only here may the reference solution solve the whole challenge.',
    mainThing: 'main challenge of the topic',
    exerciseData:
      'Images and feature maps are nested lists of numbers (rows of pixels), boxes are [x1, y1, x2, y2] lists, and everything stays plain Python: no numpy, OpenCV or PyTorch. Keep inputs small and say in the prompt how a value is laid out.',
    subjectLabel: 'Topic',
    categoryLabel: 'Area',
    summaryLabel: 'Topic summary',
    difficultyLabel: 'Topic difficulty',
  },
};

export const LEVEL_NAMES: Record<number, string> = {
  1: 'conceptual understanding',
  2: 'practical implementation',
  3: 'optimization and trade-offs',
  4: 'advanced problem solving',
  5: 'interview-level exploration',
};

export const MAX_TOKENS = {
  curriculum: 4096,
  question: 5000,
  breakdown: 3000,
  deeper: 3000,
  tutor: 1500,
  star: 4000,
} as const;

export interface PromptCtx {
  lab: GuidedLab;
  topicName: string;
  topicBrief: string;
  category: string;
  difficulty: string;
  subtopicName: string;
  subtopicBrief: string;
  learnerLevel: string;
  learnerProgress: string;
  completedTitles: string[];
}

export interface QuestionRef {
  title: string;
  objective: string;
  kind: string;
  difficulty: string;
  why: string;
  relation: string;
  level: number | null;
  angle: string;
  wantsExercise: boolean;
  effort: string;
}

export interface PathPos {
  /** 0 = not in a numbered phase (the final boss). */
  phaseNumber: number;
  phaseTitle: string;
  phaseGoal: string;
  /** Titles of the parent questions, outermost first. */
  ancestryTitles: string[];
}

// ── Building blocks ─────────────────────────────────────────────────────────

/** Lines joined with "\n", empty ones left out. */
function lines(...parts: string[]): string {
  return parts.filter((p) => p).join('\n');
}

/** Blocks joined with a blank line, empty ones left out. */
function blocks(...parts: string[]): string {
  return parts.filter((p) => p).join('\n\n');
}

function quoted(titles: string[]): string {
  return titles.map((t) => `"${t}"`).join('; ');
}

/** The words of the context's lab; anything that is not one of the labs (even a name like "constructor") is DSA. */
function profileOf(c: PromptCtx): LabProfile {
  return Object.prototype.hasOwnProperty.call(PROFILES, c.lab) ? PROFILES[c.lab] : PROFILES.dsa;
}

function problemBlock(c: PromptCtx): string {
  const p = profileOf(c);
  const subject = c.subtopicName ? `${c.topicName} — ${c.subtopicName}` : c.topicName;
  const brief = c.subtopicBrief || c.topicBrief;
  return lines(
    `${p.subjectLabel}: ${subject}`,
    brief ? `${p.summaryLabel}: ${brief}` : '',
    c.category ? `${p.categoryLabel}: ${c.category}` : '',
    c.difficulty ? `${p.difficultyLabel}: ${c.difficulty}` : ''
  );
}

function learnerBlock(c: PromptCtx): string {
  const done = c.completedTitles.slice(0, 40);
  return lines(
    `Learner: ${c.learnerLevel || 'level not known yet'}`,
    c.learnerProgress ? `Progress so far: ${c.learnerProgress}` : '',
    done.length ? `Questions the learner has already completed: ${quoted(done)}` : ''
  );
}

function positionBlock(p: PathPos): string {
  let where = '';
  if (p.phaseNumber)
    where = `Path position: phase ${p.phaseNumber}${p.phaseTitle ? ` — ${p.phaseTitle}` : ''}`;
  else if (p.phaseTitle) where = `Path position: ${p.phaseTitle}`;
  return lines(
    where,
    p.phaseGoal ? `Phase goal: ${p.phaseGoal}` : '',
    p.ancestryTitles.length
      ? `Parent questions, outermost first: ${p.ancestryTitles.map((t) => `"${t}"`).join(' > ')}`
      : ''
  );
}

function questionBlock(q: QuestionRef): string {
  return lines(
    `Question: ${q.title}`,
    q.objective ? `Learning objective: ${q.objective}` : '',
    q.why ? `Why it matters for its parent question: ${q.why}` : '',
    `Kind: ${q.kind || 'concept'}; difficulty: ${q.difficulty || 'medium'}.`
  );
}

function relationText(q: QuestionRef, p: LabProfile): string {
  if (q.relation === 'breakdown') {
    return 'This question is one smaller step created by breaking down a harder parent question. Teach just this step and prepare the learner for the parent.';
  }
  if (q.relation === 'deeper') {
    const level = q.level ?? 2;
    return `This is a deeper follow-up (level ${level}: ${LEVEL_NAMES[level] ?? LEVEL_NAMES[2]}) that extends its parent question for a learner who already understands it.`;
  }
  if (q.relation === 'boss') {
    return p.bossRelation;
  }
  return 'This is one of the main questions of the path.';
}

// ── Path outline ────────────────────────────────────────────────────────────

export function buildCurriculumPrompt(c: PromptCtx, phaseCount: number, focus: string): string {
  const wanted = focus.trim();
  const p = profileOf(c);
  return blocks(
    `You are a senior ${p.instructor} designing a guided practice path for ONE ${p.kind}. The learner works through it phase by phase, question by question, and writes code for most of the questions.`,
    problemBlock(c),
    learnerBlock(c),
    wanted ? `The learner asked the path to focus on:\n"""\n${wanted}\n"""` : '',
    lines(
      `Design a path of exactly ${phaseCount} phases that takes the learner from not knowing the ${p.thing} to ${p.goal}:`,
      `- Each phase has 3 or 4 questions in learning order, easiest first. Build up in small steps: ${p.steps}. Name the phases for this ${p.thing}; do not use generic titles.`,
      '- Every question is one clear question or task a learner can attempt on their own, about one idea or one step. Write each title as a full sentence: a question or an instruction.',
      '- "kind" is one of: concept (explain an idea), implementation (write a small piece of code), algorithm (reason about steps and complexity), scenario (apply the idea to a real-world situation).',
      '- "exercise" is true when the learner should write code to answer the question (most implementation and algorithm questions) and false for pure concept questions.',
      '- "difficulty" is easy, medium or hard. "effort" is a short estimate such as "5 min".',
      '- Do not give away the final solution: no solution code, and no question that states the complete algorithm outright. The questions guide the learner toward it.',
      '- No two questions may repeat each other.',
      `- Also design one final boss: ${p.finalTask}, with a one-sentence framing in "story".`
    ),
    'Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:',
    '{"phases":[{"title":"...","goal":"one sentence: what the learner can do after this phase","questions":[{"title":"...","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"easy","effort":"5 min","exercise":false}]}],"boss":{"title":"...","story":"...","objective":"...","difficulty":"hard","effort":"25 min"}}'
  );
}

// ── One question's lesson ───────────────────────────────────────────────────

export function buildQuestionPrompt(
  c: PromptCtx,
  q: QuestionRef,
  pos: PathPos,
  siblingTitles: string[]
): string {
  const exerciseRule = q.wantsExercise
    ? '"exercise": a coding exercise. It is required for this question.'
    : '"exercise": null for a pure concept question; add a coding exercise only when writing code would genuinely help.';
  return blocks(
    `You are a patient senior ${profileOf(c).instructor} writing the full lesson for ONE question in a guided practice path.`,
    problemBlock(c),
    learnerBlock(c),
    lines(positionBlock(pos), relationText(q, profileOf(c)), questionBlock(q)),
    siblingTitles.length
      ? `Other questions in this path (do not repeat them): ${quoted(siblingTitles)}`
      : '',
    lines(
      'Write these parts:',
      '1. "explanation": Markdown, 120 to 220 words. Explain the idea in plain language, step by step. Use `inline code` for identifiers.',
      `2. "example": Markdown. A practical example: a small concrete input traced by hand, or a short real-world analogy, with a fenced ${FENCE}python block when code helps.`,
      `3. ${exerciseRule}`,
      '   Shape: {"prompt":"what to implement, with the input and output described","function_name":"snake_case_name","starter_code":"Python 3 starter with the signature and a docstring, body left as pass","tests":[{"args":[],"expected":null,"label":"short name"}],"compare":"exact","solution":"a correct reference solution in Python 3"}',
      `   - Python 3, one pure function. Arguments and the return value are JSON values (numbers, strings, booleans, null, lists, objects). ${profileOf(c).exerciseData} No input(), no printing, no imports beyond the standard library.`,
      '   - 5 to 8 tests, from simple to tricky, with at least two edge cases. "args" is the list of positional arguments.',
      '   - "compare" is "exact", or "unordered" when the order of the items in the result does not matter.',
      '   - The reference solution must pass every test. Leave out any test whose expected value you are not sure of.',
      '4. "hints": exactly 3 progressive hints, from a gentle nudge to the key insight. None of them may state the complete solution.',
      '5. "solution_explanation": Markdown. The answer to the question with a short walkthrough. It is shown only when the learner asks for it.'
    ),
    lines(
      'Rules:',
      '- Teach this one question only. Do not wander into other topics.',
      `- Do not give away the complete solution of the ${profileOf(c).mainThing} unless this question IS the ${profileOf(c).mainThing} (the final boss), and then only inside "solution" and "solution_explanation".`,
      '- Plain, friendly, precise language. All code is Python 3.'
    ),
    'Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:',
    '{"explanation":"...","example":"...","exercise":null,"hints":["...","...","..."],"solution_explanation":"..."}'
  );
}

// ── Breakdown ───────────────────────────────────────────────────────────────

export interface ExistingChild {
  title: string;
  completed: boolean;
}

export function buildBreakdownPrompt(
  c: PromptCtx,
  q: QuestionRef,
  pos: PathPos,
  existing: ExistingChild[],
  pathTitles: string[],
  regenerate: boolean
): string {
  const kept = existing.length
    ? lines(
        'Smaller questions this question already has (they stay; do not repeat or reword them):',
        ...existing.map((e) => `- "${e.title}"${e.completed ? ' (completed)' : ''}`)
      )
    : '';
  const redo = regenerate
    ? 'The learner asked for a fresh breakdown, so write new questions that approach the steps differently from the earlier attempt.'
    : '';
  return blocks(
    `You are a patient senior ${profileOf(c).instructor}. A learner finds the question below too difficult. Break it down into smaller, simpler questions that teach what they are missing.`,
    problemBlock(c),
    learnerBlock(c),
    lines(positionBlock(pos), 'Question to break down:', questionBlock(q)),
    kept,
    redo,
    pathTitles.length
      ? `Every question that already exists in this path (never repeat any of them): ${quoted(pathTitles)}`
      : '',
    lines(
      'Rules:',
      '- First work out the prerequisite concepts the learner needs to answer the question: "prerequisites" lists 2 to 6 short names.',
      '- Then write 3 to 7 questions, ordered from easiest to hardest, in the order a learner should work through them.',
      '- Each question covers exactly one small concept or one implementation step.',
      '- "why" is one sentence on why this smaller question is needed to understand the parent question.',
      '- Stay at a basic level: do not jump ahead to advanced material, and do not leave the scope of the parent question. The last question brings the pieces together toward the parent without answering it.',
      '- "exercise" is true when the step involves writing code, false for a concept.',
      `- Never give away the complete solution of the ${profileOf(c).mainThing}.`,
      '- Never duplicate an existing question. Where an existing question already covers a step, build on it instead.'
    ),
    'Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:',
    '{"prerequisites":["..."],"questions":[{"title":"...","why":"...","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"easy","effort":"5 min","exercise":false}]}'
  );
}

// ── Dive Deeper ─────────────────────────────────────────────────────────────

export interface ExistingDeeper {
  title: string;
  level: number;
  completed: boolean;
}

export function buildDeeperPrompt(
  c: PromptCtx,
  q: QuestionRef,
  pos: PathPos,
  existing: ExistingDeeper[],
  pathTitles: string[],
  regenerate: boolean
): string {
  const kept = existing.length
    ? lines(
        'Deeper questions this question already has (they stay; do not repeat or reword them):',
        ...existing.map(
          (e) => `- level ${e.level}: "${e.title}"${e.completed ? ' (completed)' : ''}`
        )
      )
    : '';
  const redo = regenerate
    ? 'The learner asked for fresh questions, so explore different angles from the earlier attempt.'
    : '';
  return blocks(
    `You are a senior ${profileOf(c).instructor}. A learner understands the question below and wants to be challenged further. Write follow-up questions that explore the same concept at a deeper level.`,
    problemBlock(c),
    learnerBlock(c),
    lines(positionBlock(pos), 'Question to go deeper on:', questionBlock(q)),
    kept,
    redo,
    pathTitles.length
      ? `Every question that already exists in this path (never repeat any of them): ${quoted(pathTitles)}`
      : '',
    lines('Levels:', ...[1, 2, 3, 4, 5].map((n) => `${n} = ${LEVEL_NAMES[n]}`)),
    lines(
      'Rules:',
      '- Write 3 to 7 questions, ordered by level from 1 upward. Put each question\'s level in "level". Use only the levels that make sense for this question.',
      '- Cover the dimensions that are relevant to this question: how it works internally, why the approach works, alternative implementations, trade-offs and design decisions, time and space complexity, optimization techniques, edge cases and failure scenarios, real-world engineering uses, interview follow-ups, advanced variations.',
      '- "angle" is one of: internals, why-it-works, alternatives, trade-offs, complexity, optimization, edge-cases, real-world, interview, variation.',
      '- Every question must be directly about the question above. Do not add unrelated advanced questions to reach a count.',
      '- "exercise" is true when the learner should write code, false for a concept.',
      `- Never give away the complete solution of the ${profileOf(c).mainThing}.`,
      '- Never duplicate an existing question.'
    ),
    'Respond with JSON only: no Markdown fences, no commentary. Use exactly this shape:',
    '{"questions":[{"title":"...","level":1,"angle":"internals","objective":"one sentence: what the learner will be able to do","kind":"concept","difficulty":"medium","effort":"8 min","exercise":false}]}'
  );
}

// ── AI Tutor ────────────────────────────────────────────────────────────────

export const TUTOR_ACTIONS = [
  'start',
  'ask',
  'hint',
  'example',
  'simplify',
  'exercise',
  'test',
  'mistake',
  'star',
] as const;
export type TutorAction = (typeof TUTOR_ACTIONS)[number];

export interface TutorTurn {
  role: 'learner' | 'tutor';
  text: string;
}

export interface TutorInput {
  question: QuestionRef;
  pos: PathPos;
  explanation: string;
  exercisePrompt: string;
  childTitles: string[];
  completedExerciseTitles: string[];
  action: TutorAction;
  message: string;
  hintLevel: number;
  history: TutorTurn[];
  learnerCode: string;
  testReport: string;
  starAnswer: string;
  solutionRevealed: boolean;
}

function tutorTask(t: TutorInput, p: LabProfile): string {
  switch (t.action) {
    case 'start':
      return 'This is the first turn. Welcome the learner in one short sentence, then ask ONE diagnostic question to find out what they already understand about this question. Do not teach yet.';
    case 'hint':
      return `Give hint ${t.hintLevel} of 3. Level 1 is a gentle nudge on how to think about the question; level 2 names the key idea or pattern; level 3 lays out the approach step by step without final code. Do not repeat earlier hints. Start with "Hint ${t.hintLevel} of 3 — ".`;
    case 'example':
      return `Explain the concept with one practical example or an everyday analogy, then connect it to the ${p.mainThing}. Finish with ONE short check question.`;
    case 'simplify':
      return 'The learner finds this too hard. Re-explain the concept in simpler words and smaller steps, with an analogy. Finish with ONE easy check question.';
    case 'exercise':
      return `Give the learner ONE small coding exercise on this concept (not the solution of the ${p.mainThing}): a clear specification, an example input and output, and optionally a signature to start from. Tell them they can paste their attempt here and you will review it.`;
    case 'test':
      return "Test the learner's understanding: ask ONE question (answerable in a few sentences or a few lines of code) that checks the key idea of this question. Do not give away the answer. They will answer in their next message.";
    case 'mistake':
      return "Explain the learner's mistake. Use their code and the test report above: say what is wrong and why, in plain words, and point at the line or the idea to fix. Do not write the corrected solution. Finish with ONE question that guides them to the fix.";
    case 'star':
      return 'The learner just read the reference answer above and wants to understand it. Ask which part is unclear, or pick the part most likely to confuse and explain it simply; then ask ONE follow-up question.';
    default:
      return `The learner says:\n"""\n${t.message}\n"""\nIf it is a question, answer it using the context above, then ask ONE follow-up question that checks or extends their understanding. If it is an answer to your last question, evaluate it (see the verdict rule).`;
  }
}

export function buildTutorPrompt(c: PromptCtx, t: TutorInput): string {
  const turns = t.history
    .slice(-16)
    .map((h) => `${h.role === 'learner' ? 'Learner' : 'Tutor'}: ${h.text}`)
    .join('\n\n');
  return blocks(
    'You are a patient, technically strong programming mentor tutoring one learner through a conversation, inside a guided practice page.',
    problemBlock(c),
    lines(positionBlock(t.pos), questionBlock(t.question)),
    t.explanation ? `The lesson text the learner can see:\n"""\n${t.explanation}\n"""` : '',
    t.exercisePrompt
      ? `The coding exercise the learner can see:\n"""\n${t.exercisePrompt}\n"""`
      : '',
    t.childTitles.length
      ? `Smaller questions this question was broken into: ${quoted(t.childTitles)}`
      : '',
    t.completedExerciseTitles.length
      ? `Exercises the learner has completed: ${quoted(t.completedExerciseTitles.slice(0, 20))}`
      : '',
    t.learnerCode.trim()
      ? `The learner's current code:\n${FENCE}python\n${t.learnerCode}\n${FENCE}`
      : '',
    t.testReport.trim() ? `The result of the learner's last test run:\n${t.testReport}` : '',
    t.starAnswer.trim()
      ? `The reference answer the learner has read:\n"""\n${t.starAnswer}\n"""`
      : '',
    t.solutionRevealed
      ? 'The learner has already opened the reference solution of this question.'
      : '',
    lines(
      'Teaching approach (follow it every turn):',
      '1. Find out what the learner already understands before teaching.',
      '2. Explain the concept in simple language.',
      '3. Use practical examples and analogies.',
      '4. Break complicated explanations into small steps.',
      '5. Ask ONE follow-up question at the end of your reply, then stop and wait for the answer.',
      "6. Evaluate the learner's answers and correct misconceptions kindly and precisely.",
      '7. Prefer hints to answers; never hand the answer over outright.',
      '8. Raise the difficulty gradually as the learner does well.',
      `9. Connect the concept back to the ${profileOf(c).mainThing}.`,
      `Never reveal the complete solution of the ${profileOf(c).mainThing}, or the full solution code of the exercise, unless the learner explicitly asks for it in their latest message.`
    ),
    lines(
      "Verdict rule: when the learner's latest message answers a question you asked, judge it first: say plainly what is right and what is not and correct any misconception. Then end your reply with exactly one line: [[verdict: understood]], [[verdict: partial]] or [[verdict: not_yet]]. Use understood only when the answer is correct and shows real understanding of the key idea. Add that line only when you evaluated an answer, and never mention it in the text."
    ),
    `Style: Markdown, under 170 words unless code is needed, warm and direct, no greeting after the first turn, fenced ${FENCE}python blocks for code.`,
    turns ? `Conversation so far:\n${turns}` : '',
    `Now do this: ${tutorTask(t, profileOf(c))}`
  );
}

// ── Answer in STAR ──────────────────────────────────────────────────────────

export const STAR_VARIANTS = ['generate', 'simplify', 'example'] as const;
export type StarVariant = (typeof STAR_VARIANTS)[number];

export interface StarInput {
  question: QuestionRef;
  pos: PathPos;
  explanation: string;
  exercisePrompt: string;
  variant: StarVariant;
  existingAnswer: string;
}

export function buildStarPrompt(c: PromptCtx, s: StarInput): string {
  let variant = '';
  if (s.variant === 'simplify') {
    variant = `Here is the current answer:\n"""\n${s.existingAnswer}\n"""\nRewrite it in simpler language for a learner who found it hard: shorter sentences, a quick definition for every technical term, smaller steps and one easy analogy. Keep the same headings, and keep the code and the complexity correct.`;
  } else if (s.variant === 'example') {
    variant = `Here is the current answer:\n"""\n${s.existingAnswer}\n"""\nWrite ANOTHER worked example for the same question: a different input or scenario, under the same headings (one or two sentences each for Situation and Task, then a step-by-step Action and Result). Do not repeat the earlier example.`;
  }
  return blocks(
    'You are a senior engineer writing a complete reference answer to ONE question with the STAR framework (Situation, Task, Action, Result), adapted for technical questions.',
    problemBlock(c),
    lines(positionBlock(s.pos), questionBlock(s.question)),
    s.explanation ? `The lesson text the learner has seen:\n"""\n${s.explanation}\n"""` : '',
    s.exercisePrompt ? `The coding exercise of this question:\n"""\n${s.exercisePrompt}\n"""` : '',
    lines(
      'Adapt STAR to the kind of question:',
      '- concept: use STAR as a structured explanation. Situation is where the concept matters, Task is what must be understood, Action is how it works step by step, Result is what it gives you.',
      '- implementation: focus on the actual implementation and its code.',
      '- algorithm: explain the reasoning, a step-by-step execution trace and the complexity.',
      '- scenario: use the traditional Situation, Task, Action and Result with a clearly hypothetical example.',
      'Never invent personal experiences, project outcomes or metrics. For technical questions use concrete hypothetical examples and say that they are examples.'
    ),
    lines(
      'Write Markdown with exactly these headings, in this order:',
      '## S — Situation: the context of the problem, where the concept is relevant, the underlying challenge.',
      '## T — Task: what needs to be achieved, the technical requirement, the expected outcome.',
      `## A — Action: the approach step by step; the data structures and algorithms involved; Python 3 code in fenced ${FENCE}python blocks; why the approach works; alternatives and trade-offs where relevant; a small execution walkthrough or text diagram when it helps.`,
      '## R — Result: the outcome; time complexity; space complexity; edge cases and the expected behaviour.',
      '## Common mistakes',
      '## Interview tips'
    ),
    'Put important technical terms in **bold**. Be complete but tight: roughly 350 to 650 words plus code. Write the heading lines as plain headings (for example "## S — Situation"), without the descriptions above.',
    variant,
    'Respond with the Markdown only: no preamble, and do not wrap the whole answer in a code fence.'
  );
}
