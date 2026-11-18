/**
 * fe-apis/dailySession/coach.ts
 *
 * Twin of the Daily Session "answer coach" AI routes in backend/modules/daily_session:
 *   POST /sessions/generate-answer   daily_session.py  generate_dynamic_answer   (the "Show a model answer" hint)
 *   POST /sessions/evaluate-answer   evaluation.py     evaluate_answer
 *   POST /sessions/expand-answer     evaluation.py     expand_answer             ("Explain it more deeply")
 *   POST /sessions/learn-chat        evaluation.py     learn_turn
 * Rubrics, prompts, scoring and error texts are copied verbatim: change both sides together.
 * Not ported: convert-flashcards and upload-resume (still FastAPI-only).
 */

import { HttpError, aiSettings, callAi, type Row } from '../todo/_shared';
import { resolveModel } from '../ai';
import { memoryBlock } from './tutorMemory';

type Rubric = [key: string, label: string, weight: number, desc: string];

const RUBRICS: Record<string, Rubric[]> = {
  dsa: [
    ['understanding', 'Problem understanding & edge cases', 15, 'restates the problem, asks/assumes constraints, names edge cases (empty, duplicates, overflow, sorted/unsorted)'],
    ['approach', 'Approach & algorithm choice', 25, 'starts from brute force, reaches the optimal approach, justifies the data structure'],
    ['correctness', 'Correctness of logic / code', 25, 'logic and code are correct on normal and edge inputs with no off-by-one or state bugs'],
    ['complexity', 'Complexity analysis', 15, 'states correct time AND space complexity and why'],
    ['code_quality', 'Code quality', 10, 'clean, idiomatic, readable names, no dead code'],
    ['communication', 'Communication', 10, 'structured: approach, then code, then test/trace'],
  ],
  system_design: [
    ['requirements', 'Requirements & scale estimates', 20, 'separates functional/non-functional requirements and sizes QPS, storage, bandwidth'],
    ['architecture', 'High-level architecture', 20, 'coherent components and data flow that actually meet the requirements'],
    ['data_api', 'Data model & APIs', 15, 'sensible schema/storage choice and core API shapes, justified'],
    ['scalability', 'Scalability & bottlenecks', 20, 'identifies the real bottlenecks and how to scale them (sharding, caching, queues)'],
    ['tradeoffs', 'Trade-offs & reliability', 15, 'names consistency/availability/latency/cost trade-offs and failure handling'],
    ['communication', 'Communication', 10, 'top-down, prioritised, drives the discussion'],
  ],
  debugging: [
    ['hypotheses', 'Hypothesis generation', 20, 'lists plausible causes ranked by likelihood from the symptoms given'],
    ['diagnosis', 'Systematic diagnosis', 25, 'concrete steps/tools/metrics to isolate the cause, narrowing methodically'],
    ['root_cause', 'Root-cause accuracy', 25, 'identifies the true underlying mechanism, not just the symptom'],
    ['fix', 'Fix & prevention', 20, 'a safe fix, rollout/mitigation, and guardrails (tests, alerts) to prevent recurrence'],
    ['communication', 'Communication', 10, 'clear, calm, structured incident-style narration'],
  ],
  behavioral: [
    ['situation', 'Situation & stakes', 15, 'specific, concise context with real stakes (STAR: Situation/Task)'],
    ['action', 'Ownership & specific actions', 30, "'I' not 'we'; concrete decisions, reasoning, and obstacles handled"],
    ['result', 'Result & impact', 25, 'measurable outcome, with numbers where possible'],
    ['reflection', 'Reflection & learning', 20, 'what they would do differently and what changed afterwards'],
    ['communication', 'Communication', 10, '2-3 minutes, no rambling, strong opening and close'],
  ],
  cv_ml: [
    ['accuracy', 'Conceptual accuracy', 30, 'every technical statement is correct'],
    ['depth', 'Depth & mechanism', 25, 'explains WHY it works: maths/intuition/mechanism, not just names'],
    ['tradeoffs', 'Trade-offs & alternatives', 20, 'compares alternatives and says when each wins or fails'],
    ['practical', 'Practical application', 15, 'real-world constraints: data, latency, deployment, failure modes'],
    ['communication', 'Communication', 10, 'clear, ordered, defines terms'],
  ],
};

const KIND_TITLES: Record<string, string> = {
  dsa: 'Data Structures & Algorithms',
  system_design: 'System Design',
  debugging: 'Production debugging scenario',
  behavioral: 'Behavioral / leadership',
  cv_ml: 'Computer Vision / ML',
};

const TUTORS: Record<string, [string, string]> = {
  dsa: ['Arjun', 'algorithms tutor'],
  system_design: ['Meera', 'systems architecture tutor'],
  debugging: ['Dev', 'production-debugging tutor'],
  behavioral: ['Sam', 'engineering-leadership mentor'],
  cv_ml: ['Dr. Anika', 'computer vision & ML tutor'],
};

const MAX_LEARNER_TURNS = 10;

// ── Small helpers ─────────────────────────────────────────────────────────────────────────────────────────────

/** Python prints None for a missing value inside an f-string. */
const py = (v: unknown) => (v === null || v === undefined ? 'None' : String(v));
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const asList = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function requireString(body: Row, key: string): string {
  const v = body[key];
  if (typeof v !== 'string') throw new HttpError(422, `${key}: Input should be a valid string`);
  return v;
}

function bodyOf(raw: unknown): Row {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(422, 'Input should be a valid dictionary');
  return raw as Row;
}

/** `extract_json_object` from modules/common/ai/utils.py (fences stripped, then the first `{` to the last `}`). */
function extractObject(text: string): Row {
  let t = text.trim();
  t = t.replace(/```[a-z]*\n?/g, '').trim().replace(/^`+|`+$/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return JSON.parse(t.slice(start, end + 1));
}

function detectKind(subType: string | undefined, category: string | undefined, questionText: string): string {
  const st = (subType || '').toLowerCase();
  if (st.includes('system design')) return 'system_design';
  if (st.includes('data structure') || st.includes('algorithm') || st === 'dsa') return 'dsa';
  if (st.includes('bug') || st.includes('debug')) return 'debugging';
  if (st.includes('leadership') || st.includes('behav')) return 'behavioral';
  if (['cv_skill', 'cv'].includes((category || '').toLowerCase())) return 'cv_ml';
  const q = questionText.toLowerCase();
  if (['design a', 'design an', 'architecture'].some((w) => q.includes(w))) return 'system_design';
  if (['implement', 'time complexity', 'array', 'string', 'tree', 'graph'].some((w) => q.includes(w))) return 'dsa';
  return 'cv_ml';
}

const ACCURACY_RULES = `ACCURACY RULES (these matter more than anything else):
- Be correct above all. State only what you are confident is true. Never invent facts, benchmarks, library behaviour or numbers.
- Work through the problem yourself first (in "scratch"), derive the right answer / complexity, and only then judge the candidate against it.
- If the candidate says something wrong, say it is wrong and give the correct statement. If they are right, do not nitpick.
- Do not claim code was run or tests passed; you can only reason about it. Trace it by hand on at least one normal and one edge input.
- If something genuinely depends on assumptions or is debatable, say so explicitly instead of picking a side silently.
- Judge only what the candidate wrote. Do not credit points they did not make.`;

interface CoachReq {
  questionText: string;
  answerText: string;
  codeText?: string;
  language?: string;
  category?: string;
  subType?: string;
  difficulty?: string;
  isTranscript: boolean;
  style?: string;
  context?: string;
  settings: ReturnType<typeof aiSettings>;
}

function parseCoachReq(raw: unknown): CoachReq {
  const b = bodyOf(raw);
  return {
    questionText: requireString(b, 'question_text'),
    answerText: typeof b.answer_text === 'string' ? b.answer_text : '',
    codeText: optStr(b.code_text),
    language: optStr(b.language),
    category: optStr(b.category),
    subType: optStr(b.sub_type),
    difficulty: optStr(b.difficulty),
    isTranscript: b.is_transcript === true,
    style: optStr(b.style),
    context: optStr(b.context),
    settings: aiSettings(b),
  };
}

function candidateBlock(req: CoachReq): string {
  const parts: string[] = [];
  if (req.isTranscript) {
    parts.push(
      "Learning-conversation transcript (judge ONLY the Learner's lines; Tutor lines are context. " +
        'Credit depth reached under follow-up questions, and note where the learner needed hints):\n' +
        (req.answerText.trim() || '(empty)')
    );
  } else {
    parts.push(`Candidate's written answer:\n${req.answerText.trim() || '(empty)'}`);
  }
  if ((req.codeText || '').trim()) {
    const lang = req.language || 'unspecified language';
    parts.push(`Candidate's code / design sketch (${lang}):\n\`\`\`\n${req.codeText!.trim()}\n\`\`\``);
  }
  return parts.join('\n\n');
}

// ── generate-answer ───────────────────────────────────────────────────────────────────────────────────────────

export async function generateAnswer(raw: unknown): Promise<Row> {
  const b = bodyOf(raw);
  const questionText = requireString(b, 'question_text');
  const settings = aiSettings(b);
  const action = typeof b.action === 'string' ? b.action : 'answer';
  const category = py(optStr(b.category));
  const subType = py(optStr(b.sub_type));

  const prompt =
    action === 'explain'
      ? `You are Lab Ninja, an elite technical interviewer.
Provide a deep, step-by-step technical explanation for this question:

Question (${category} - ${subType}):
${questionText}

Format your response cleanly with:
1. High-level Summary (2-3 sentences)
2. In-Depth Technical Walkthrough / Code / Architecture
3. Key Trade-offs & Common Interviewer Follow-ups`
      : `You are Lab Ninja, an elite technical interviewer.
Provide a concise, top-tier model answer for this interview question:

Question (${category} - ${subType}):
${questionText}

Provide:
1. Concise Direct Answer (3-4 bullet points or short paragraph)
2. Detailed Explanation / Code snippet / Algorithm steps if applicable.`;

  let lastErr = '';
  try {
    const answer = await callAi(prompt, settings);
    return { answer, model_used: resolveModel(settings.model) };
  } catch (err) {
    lastErr = err instanceof Error ? err.message : String(err);
  }
  return {
    answer: `Model Answer for '${questionText}':\n\n1. Focus on core architectural patterns, time/space complexity, and edge cases.\n2. Key implementation details: ensure robust error handling and clear separation of concerns.`,
    note: `Fallback applied. (Config note: ${lastErr || 'No API key set'})`,
  };
}

// ── evaluate-answer ───────────────────────────────────────────────────────────────────────────────────────────

function buildEvaluationPrompt(req: CoachReq, kind: string): string {
  const rubricLines = RUBRICS[kind]
    .map(([key, label, w, desc]) => `- "${key}" (${label}, weight ${w}): 5/5 means the candidate ${desc}.`)
    .join('\n');
  const keys = RUBRICS[kind].map(([k]) => `"${k}"`).join(', ');
  return `You are a rigorous, fair, and encouraging senior interviewer coaching a candidate.
Question type: ${KIND_TITLES[kind]}   Difficulty: ${req.difficulty || 'unspecified'}

Question:
${req.questionText}

${candidateBlock(req)}

Score each rubric criterion from 0 to 5 (integers; 0 = absent, 3 = acceptable, 5 = excellent):
${rubricLines}

${ACCURACY_RULES}

Return ONLY one JSON object with exactly these keys:
{
  "scratch": "your own brief working: the correct approach/answer and any complexity derivation",
  "criteria": [{"key": one of [${keys}], "score": 0-5, "comment": "1-2 sentences citing what the candidate actually wrote", "improve": "one concrete way to reach the next score"}, ... one entry per criterion],
  "strengths": ["specific things done well"],
  "factual_issues": [{"claim": "what the candidate said", "correction": "what is actually true", "severity": "minor|major"}],
  "missing": ["important points absent from the answer"],
  "improvements": ["ordered, actionable steps, highest impact first"],
  "better_answer": "a stronger version of THEIR answer in markdown: keep their correct ideas and structure, fix errors, add what is missing. For code questions include corrected, complete code in a fenced block with its complexity.",
  "follow_ups": ["2-3 follow-up questions an interviewer would likely ask next"],
  "confidence_notes": "anything you are unsure about or that depends on assumptions, else empty string"
}
If the answer is already excellent, say so, keep "improvements" short, and still add one stretch suggestion.`;
}

function level(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 50) return 'Developing';
  return 'Needs work';
}

/** Python's round() is banker's rounding; for x.5 it goes to the even integer. */
function pyRound(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

export async function evaluateAnswer(raw: unknown): Promise<Row> {
  const req = parseCoachReq(raw);
  if (!req.answerText.trim() && !(req.codeText || '').trim()) {
    throw new HttpError(400, 'Write an answer (or some code) first, then ask for an evaluation.');
  }
  try {
    const kind = detectKind(req.subType, req.category, req.questionText);
    const data = extractObject(await callAi(buildEvaluationPrompt(req, kind), req.settings, 4096));

    const byKey = new Map<unknown, Row>();
    for (const c of asList(data.criteria)) if (c && typeof c === 'object' && !Array.isArray(c)) byKey.set(c.key, c);
    const criteria: Row[] = [];
    let total = 0;
    for (const [key, label, weight] of RUBRICS[kind]) {
      const c = byKey.get(key) ?? {};
      let score = Number(c.score ?? 0);
      score = Number.isFinite(score) ? Math.max(0, Math.min(5, pyRound(score))) : 0;
      total += (score / 5) * weight;
      criteria.push({ key, label, weight, score, comment: s(c.comment), improve: s(c.improve) });
    }
    const overall = pyRound(total);

    const issues: Row[] = [];
    for (const i of asList(data.factual_issues)) {
      if (i && typeof i === 'object' && s(i.claim)) {
        issues.push({ claim: s(i.claim), correction: s(i.correction), severity: i.severity === 'major' ? 'major' : 'minor' });
      }
    }
    const strs = (v: unknown) => asList(v).map(s).filter(Boolean);
    return {
      kind,
      overall,
      level: level(overall),
      criteria,
      strengths: strs(data.strengths),
      factual_issues: issues,
      missing: strs(data.missing),
      improvements: strs(data.improvements),
      better_answer: s(data.better_answer),
      follow_ups: strs(data.follow_ups),
      confidence_notes: s(data.confidence_notes),
    };
  } catch (err) {
    throw new HttpError(502, `Evaluation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── expand-answer ─────────────────────────────────────────────────────────────────────────────────────────────

function starBlock(req: CoachReq): string {
  if ((req.style || '').toLowerCase() !== 'star') return '';
  const ctx = (req.context || '').trim();
  const ctxLine = ctx
    ? `\nCandidate's real background/context (ground the answer in this; do not invent facts beyond it):\n${ctx}\n`
    : '\nNo personal context was given: write a plausible model answer and mark any invented specifics as [placeholder] for the candidate to replace.\n';
  return `
OUTPUT STYLE - STAR: "expanded_answer" MUST be written as a spoken-style interview answer in the STAR pattern, using these markdown headings in order: **Situation**, **Task**, **Action**, **Result**. Keep Action the longest section (use "I", not "we"), and make Result concrete and measurable where the facts allow.${ctxLine}`;
}

function buildExpandPrompt(req: CoachReq, kind: string): string {
  return `You are a senior interviewer helping a candidate turn a rough draft into a complete, interview-ready answer.
Question type: ${KIND_TITLES[kind]}   Difficulty: ${req.difficulty || 'unspecified'}

Question:
${req.questionText}

${candidateBlock(req)}

Expand the candidate's draft into a strong, complete answer:
- Keep THEIR ideas, voice and structure; build on them rather than replacing them.
- Correct anything wrong and list each correction.
- Add what is missing for this question type (${KIND_TITLES[kind]}): for DSA brute force -> optimal approach, correct code, complexity, edge cases; for system design requirements, estimates, architecture, data model, bottlenecks, trade-offs; for debugging hypotheses, diagnosis steps, root cause, fix, prevention; for behavioral STAR with a measurable result; for CV/ML mechanism, maths, trade-offs, practice.
- If the draft is empty, write a model answer from scratch and say so in "summary".
${starBlock(req)}
${ACCURACY_RULES}

Return ONLY one JSON object with exactly these keys:
{
  "scratch": "your own brief working to get the facts right",
  "summary": "one sentence on what you changed",
  "expanded_answer": "the full expanded answer in markdown (code in fenced blocks where relevant)",
  "added_points": ["short list of the ideas you added"],
  "corrections": [{"claim": "what the draft said", "correction": "what is true"}],
  "confidence_notes": "assumptions or uncertainty, else empty string"
}`;
}

export async function expandAnswer(raw: unknown): Promise<Row> {
  const req = parseCoachReq(raw);
  try {
    const kind = detectKind(req.subType, req.category, req.questionText);
    const data = extractObject(await callAi(buildExpandPrompt(req, kind), req.settings, 4096));
    const corrections = asList(data.corrections)
      .filter((c) => c && typeof c === 'object' && s(c.claim))
      .map((c) => ({ claim: s(c.claim), correction: s(c.correction) }));
    return {
      kind,
      summary: s(data.summary),
      expanded_answer: s(data.expanded_answer),
      added_points: asList(data.added_points).map(s).filter(Boolean),
      corrections,
      confidence_notes: s(data.confidence_notes),
    };
  } catch (err) {
    throw new HttpError(502, `Expansion failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── learn-chat ────────────────────────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: string;
  content: string;
}

function buildLearnPrompt(
  questionText: string,
  messages: ChatMessage[],
  difficulty: string | undefined,
  maxTurns: number,
  kind: string,
  learnerTurns: number,
  forceWrap: boolean,
  /** memoryLines() for this user and the question's sub_type (tutorMemory.ts); empty = left out. */
  memory: string[] = []
): string {
  const [name, role] = TUTORS[kind];
  const convo =
    messages
      .slice(-24)
      .map((m) => `${m.role === 'tutor' ? 'Tutor' : 'Learner'}: ${m.content.trim().slice(0, 4000)}`)
      .join('\n') || '(the session has not started)';
  let task: string;
  if (!messages.length) {
    task =
      'This is the very start. Greet the learner in one short sentence, say what you will explore together, then ask ONE ' +
      'opening question that finds out what they already know about the topic (do not lecture yet). ' +
      'Set "depth" to 1.';
  } else if (forceWrap) {
    task =
      'We are out of time. Wrap up in 3-4 sentences: what the learner now understands well, the one or two ideas worth revisiting, ' +
      'and one thing to study next. Say they can end the session for a full review. Set "wrap_up" to true.';
  } else {
    task =
      "Reply to the learner's last message. First acknowledge what they got right (be specific), then move the learning forward. " +
      'Teach Socratically, one step at a time, and go progressively deeper, only moving up a level when they have the current one:\n' +
      '  1 definitions & intuition -> 2 mechanism, WHY it works -> 3 edge cases & failure modes -> 4 trade-offs & alternatives -> 5 scale, real systems, extensions.\n' +
      'If they are wrong or fuzzy, do not just correct them: ask a guiding question or give a tiny example so they can find the gap, and if they are still stuck after that, ' +
      'explain the idea clearly and briefly, then check understanding with a question. ' +
      'If they ask for an explanation or say they are stuck, teach: a short, clear explanation (an analogy or small worked example is welcome), then one question to check it landed. ' +
      'Wrap up if they say they are done or you have covered the topic in real depth. ' +
      `The learner has sent ${learnerTurns} of at most ${maxTurns} messages.`;
  }
  return `You are ${name}, a patient, encouraging and rigorous ${role} helping someone learn a topic in depth through conversation. This is for learning, not assessment: never grade, rank or pressure the learner.
Topic being explored (${KIND_TITLES[kind]}, level ${difficulty || 'unspecified'}), starting from this question:
${questionText}${memoryBlock(memory, 'learn')}

Conversation so far:
${convo}

YOUR TASK: ${task}

STYLE RULES:
- Talk like a good human teacher: plain, warm, concise. At most 5 short sentences per turn plus ONE question (an explanation turn may run a little longer). No headings.
- You may use a short code snippet in a fenced block when it genuinely teaches; otherwise no markdown lists.
- Ask ONE question per turn and do not repeat one already asked.

${ACCURACY_RULES}
- Everything you teach must be true. Prefer saying "it depends on X" over overstating. If you are not sure, say so.

Return ONLY one JSON object: {"message": "what you say", "depth": 1-5, "focus": "2-4 word concept you are exploring", "wrap_up": true|false}`;
}

/** `memory`: memoryLines() for this user and the question's sub_type, read by the route (index.ts). */
export async function learnChat(raw: unknown, memory: string[] = []): Promise<Row> {
  const b = bodyOf(raw);
  const questionText = requireString(b, 'question_text');
  const settings = aiSettings(b);
  const messages: ChatMessage[] = [];
  if (b.messages !== undefined && !Array.isArray(b.messages)) throw new HttpError(422, 'messages: Input should be a valid list');
  for (const m of asList(b.messages)) {
    if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
      throw new HttpError(422, 'messages: each message needs a string role and content');
    }
    messages.push({ role: m.role, content: m.content });
  }
  const maxTurns = Number.isInteger(b.max_turns) ? (b.max_turns as number) : MAX_LEARNER_TURNS;

  if (!questionText.trim()) throw new HttpError(400, 'question_text is required');
  if (messages.length && messages[messages.length - 1].role !== 'learner') {
    throw new HttpError(400, "It is the learner's turn: the last message must be from the learner.");
  }
  try {
    const category = optStr(b.category);
    const subType = optStr(b.sub_type);
    const difficulty = optStr(b.difficulty);
    const kind = detectKind(subType, category, questionText);
    const learnerTurns = messages.filter((m) => m.role === 'learner').length;
    const forceWrap = learnerTurns >= maxTurns;
    const text = await callAi(buildLearnPrompt(questionText, messages, difficulty, maxTurns, kind, learnerTurns, forceWrap, memory), settings, 1536);
    let data: Row = {};
    let message: string;
    try {
      data = extractObject(text);
      message = s(data.message);
    } catch {
      data = {};
      message = text.trim(); // model ignored the JSON format; use its text as-is
    }
    if (!message) throw new Error('The tutor returned an empty reply');
    let depth = Math.trunc(Number(data.depth ?? 1));
    depth = Number.isFinite(depth) ? Math.max(1, Math.min(5, depth)) : 1;
    const [name, role] = TUTORS[kind];
    return {
      tutor: { name, role },
      message,
      depth,
      focus: s(data.focus),
      wrap_up: Boolean(data.wrap_up) || forceWrap,
      learner_turns: learnerTurns,
      max_turns: maxTurns,
    };
  } catch (err) {
    throw new HttpError(502, `Tutor unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}
