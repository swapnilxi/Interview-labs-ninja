/**
 * fe-apis/dsaLab/autoPlan.ts
 *
 * Port of backend/modules/dsa_lab/auto_plan.py: the pure half of POST /dsa/week-plan/auto (the AI week
 * organizer) -- request validation, the prompt, its token budget, and the normaliser that turns the
 * model's reply into a plan the week board accepts (known ids only, each once, at most perWeek a week).
 * No I/O here; the route lives in ./weekPlan. The prompt and every message are byte-identical to the
 * Python, and lengths/trimming follow Python's rules (../labProjects/text) -- keep the two in sync.
 */

import { collapseWhitespace, cpLength, cpSlice, pyStrip } from '../labProjects/text';
import { hasLoneSurrogate } from './text';

const WEEK_CAP = 7; // most questions a single week may hold
const MAX_WEEKS = 24;
const MAX_TOPICS = 400;
const MAX_PATTERNS = 20; // focus / weak list length
const PATTERN_MAX = 80;
const NOTES_MAX = 400;
const LABEL_MAX = 60;
const SUMMARY_MAX = 600;

const LEVEL_TEXT = {
  new: 'new to DSA, needs the fundamentals first',
  some: 'knows the basics and is comfortable with arrays and hashing',
  confident: 'interview-ready, polishing and filling gaps',
} as const;

const GOAL_TEXT = {
  'big-tech': 'big-tech (FAANG-style) interviews',
  product: 'product-company interviews',
  startup: 'startup interviews',
  general: 'general problem-solving practice',
} as const;

const DIFFICULTY_TEXT = {
  gentle: 'gentle: mostly Easy and Medium',
  balanced: 'balanced: mostly Medium with some Hard',
  stretch: 'stretch: plenty of Medium and Hard',
} as const;

const STYLE_TEXT = {
  focused: 'focused: one or two related patterns per week',
  mixed: 'mixed: blend patterns within each week for interleaved practice',
} as const;

export type AutoLevel = keyof typeof LEVEL_TEXT;
export type AutoGoal = keyof typeof GOAL_TEXT;
export type AutoDifficulty = keyof typeof DIFFICULTY_TEXT;
export type AutoStyle = keyof typeof STYLE_TEXT;

/** The learner's answers, validated, defaulted and trimmed. */
export interface AutoAnswers {
  weeks: number;
  perWeek: number;
  level: AutoLevel;
  goal: AutoGoal;
  difficulty: AutoDifficulty;
  style: AutoStyle;
  focus: string[];
  weak: string[];
  notes: string;
}

/** One question the learner can be planned, trimmed; listed in learning order. */
export interface AutoTopic {
  id: string;
  name: string;
  category: string;
  difficulty: string;
  done: boolean;
}

export interface AutoRequest {
  answers: AutoAnswers;
  topics: AutoTopic[];
}

/** The first problem with the request (the route answers 422 with it), or the cleaned-up request. */
export type AutoValidation =
  { error: string; request?: undefined } | { error: null; request: AutoRequest };

export interface AutoPlanResult {
  plan: {
    weeks: number;
    assignments: Record<string, number>;
    order: string[];
    labels: Record<string, string>;
  };
  summary: string;
  stats: { placed: number; dropped: number; slots: number };
}

// ── Validation ───────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Python's `isinstance(v, int) and not isinstance(v, bool)` for a parsed JSON value. */
function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Missing or null: the field takes its default. */
function absent(v: unknown): boolean {
  return v === undefined || v === null;
}

/** An optional choice: its default when absent, otherwise one of the allowed values (or null = invalid). */
function choice<T extends string>(v: unknown, allowed: Record<T, string>, fallback: T): T | null {
  if (absent(v)) return fallback;
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(allowed, v)
    ? (v as T)
    : null;
}

function choiceError(field: string, allowed: Record<string, string>): string {
  return `Field 'answers.${field}' must be one of: ${Object.keys(allowed).join(', ')}.`;
}

/** focus / weak: at most 20 pattern names, each 1-80 characters once trimmed (null = invalid). */
function patternList(v: unknown): string[] | null {
  if (absent(v)) return [];
  if (!Array.isArray(v) || v.length > MAX_PATTERNS) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string' || hasLoneSurrogate(item)) return null;
    const name = pyStrip(item);
    if (!name || cpLength(name) > PATTERN_MAX) return null;
    out.push(name);
  }
  return out;
}

/** One topic, trimmed, or null when it doesn't have the required shape. */
function cleanTopic(v: unknown): AutoTopic | null {
  if (!isObject(v)) return null;
  const { id, name, category, difficulty, done } = v;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  if (typeof category !== 'string' || typeof difficulty !== 'string') return null;
  if ([id, name, category, difficulty].some(hasLoneSurrogate)) return null;
  if (!absent(done) && typeof done !== 'boolean') return null;
  const topic: AutoTopic = {
    id: pyStrip(id),
    name: pyStrip(name),
    category: pyStrip(category),
    difficulty: pyStrip(difficulty),
    done: done === true,
  };
  if (!topic.id || cpLength(topic.id) > 200 || !topic.name || cpLength(topic.name) > 200)
    return null;
  if (cpLength(topic.category) > 120 || cpLength(topic.difficulty) > 40) return null;
  return topic;
}

/** Checks run in the documented order; the first failure wins. */
export function validateAutoRequest(answers: unknown, topics: unknown): AutoValidation {
  if (!isObject(answers)) return { error: "Field 'answers' must be an object." };
  const { weeks, perWeek } = answers;
  if (!isInt(weeks) || weeks < 1 || weeks > MAX_WEEKS)
    return { error: `Field 'answers.weeks' must be an integer from 1 to ${MAX_WEEKS}.` };
  if (!isInt(perWeek) || perWeek < 1 || perWeek > WEEK_CAP)
    return { error: `Field 'answers.perWeek' must be an integer from 1 to ${WEEK_CAP}.` };

  const level = choice(answers.level, LEVEL_TEXT, 'some');
  if (level === null) return { error: choiceError('level', LEVEL_TEXT) };
  const goal = choice(answers.goal, GOAL_TEXT, 'general');
  if (goal === null) return { error: choiceError('goal', GOAL_TEXT) };
  const difficulty = choice(answers.difficulty, DIFFICULTY_TEXT, 'balanced');
  if (difficulty === null) return { error: choiceError('difficulty', DIFFICULTY_TEXT) };
  const style = choice(answers.style, STYLE_TEXT, 'focused');
  if (style === null) return { error: choiceError('style', STYLE_TEXT) };

  const focus = patternList(answers.focus);
  if (focus === null)
    return {
      error: `Field 'answers.focus' must be a list of at most ${MAX_PATTERNS} pattern names (1-${PATTERN_MAX} characters each).`,
    };
  const weak = patternList(answers.weak);
  if (weak === null)
    return {
      error: `Field 'answers.weak' must be a list of at most ${MAX_PATTERNS} pattern names (1-${PATTERN_MAX} characters each).`,
    };

  let notes = '';
  if (!absent(answers.notes)) {
    if (
      typeof answers.notes !== 'string' ||
      hasLoneSurrogate(answers.notes) ||
      cpLength(pyStrip(answers.notes)) > NOTES_MAX
    )
      return { error: `Field 'answers.notes' must be at most ${NOTES_MAX} characters.` };
    notes = pyStrip(answers.notes);
  }

  if (!Array.isArray(topics) || topics.length < 1 || topics.length > MAX_TOPICS)
    return { error: `Field 'topics' must be a list of 1-${MAX_TOPICS} questions.` };
  // One pass, like the Python: each topic's shape, then whether its id was already listed.
  const cleaned: AutoTopic[] = [];
  const seen = new Set<string>();
  for (const raw of topics) {
    const topic = cleanTopic(raw);
    if (!topic)
      return {
        error:
          'Every topic needs an id and a name (1-200 characters), a category (at most 120) and a difficulty (at most 40).',
      };
    if (seen.has(topic.id)) return { error: `Topic '${topic.id}' is listed twice.` };
    seen.add(topic.id);
    cleaned.push(topic);
  }

  return {
    error: null,
    request: {
      answers: { weeks, perWeek, level, goal, difficulty, style, focus, weak, notes },
      topics: cleaned,
    },
  };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export function buildAutoPlanPrompt(answers: AutoAnswers, topics: AutoTopic[]): string {
  const { weeks, perWeek } = answers;
  const topicLines = topics.map(
    (t) =>
      `- ${t.id} | ${t.name} | ${t.category} | ${t.difficulty}${t.done ? ' | already solved' : ''}`
  );
  return [
    'You are an expert coding-interview coach. Plan a week-by-week DSA study schedule for this learner.',
    '',
    'Learner profile:',
    `- Timeline: ${weeks} weeks`,
    `- Questions per week: at most ${perWeek} (a week may hold fewer, never more)`,
    `- Current level: ${LEVEL_TEXT[answers.level]}`,
    `- Goal: ${GOAL_TEXT[answers.goal]}`,
    `- Difficulty preference: ${DIFFICULTY_TEXT[answers.difficulty]}`,
    `- Week style: ${STYLE_TEXT[answers.style]}`,
    `- Patterns to emphasise: ${answers.focus.length ? answers.focus.join(', ') : 'none in particular'}`,
    `- Patterns the learner finds hard: ${answers.weak.length ? answers.weak.join(', ') : 'none given'}`,
    `- Notes from the learner: ${answers.notes || 'none'}`,
    '',
    'Available questions, in a recommended learning order (id | name | pattern | difficulty):',
    ...topicLines,
    '',
    'Rules:',
    '1. Use only ids from the list above, each at most once.',
    `2. Use weeks 1 to ${weeks} only, with at most ${perWeek} questions in any week.`,
    '3. Order the weeks so foundations come before the patterns that build on them: arrays, hashing and two pointers before sliding window; linked lists and stacks before trees; trees before graphs; recursion and backtracking before dynamic programming.',
    '4. Ramp the difficulty: easier questions early, harder ones later. Put at most 2 Hard questions in one week unless the learner asked for a stretch.',
    '5. Give the patterns to emphasise and the patterns the learner finds hard extra questions, and revisit a hard pattern in a later week for review.',
    '6. Questions marked "already solved" are for review only: use them sparingly.',
    '7. You do not have to use every question. Leave out what does not fit the timeline.',
    '8. Give every week a short focus label of at most 6 words naming what it trains.',
    '',
    'Reply with ONLY a JSON object, no prose and no code fences, in exactly this shape:',
    '{"summary": "2-3 sentences on how the plan is organised", "weeks": [{"week": 1, "focus": "Hashing basics", "questions": ["<id>", "<id>"]}]}',
  ].join('\n');
}

/** The reply budget: enough for every slot's id plus the labels and summary, capped. */
export function autoPlanMaxTokens(weeks: number, perWeek: number): number {
  return Math.min(6000, 800 + weeks * perWeek * 40);
}

// ── Normalising the reply ────────────────────────────────────────────────────

/** `re.sub(r"\s+", " ", s).strip()` cut to `max` code points, then stripped again. */
function cleanText(s: string, max: number): string {
  return pyStrip(cpSlice(pyStrip(collapseWhitespace(s)), 0, max));
}

/**
 * Turn the model's `{summary, weeks: [{week, focus, questions}]}` into a plan: weeks outside 1..weeks
 * are dropped whole, unknown/repeated ids and anything over min(perWeek, 7) in a week are dropped one by
 * one (and counted), and a week's label is its first non-empty focus, kept only if the week got a question.
 * Deterministic: entries are taken by week, then by their position in the reply.
 */
export function normalizeAutoPlan(
  raw: unknown,
  topicIds: string[],
  weeks: number,
  perWeek: number
): AutoPlanResult {
  const cap = Math.min(perWeek, WEEK_CAP);
  const known = new Set(topicIds);
  const entries: unknown[] = isObject(raw) && Array.isArray(raw.weeks) ? raw.weeks : [];

  const valid: { week: number; idx: number; entry: Obj }[] = [];
  let dropped = 0;
  entries.forEach((entry, idx) => {
    if (!isObject(entry)) return;
    const w = entry.week;
    const nQ = Array.isArray(entry.questions) ? entry.questions.length : 0;
    if (!isInt(w) || w < 1 || w > weeks) {
      dropped += nQ;
      return;
    }
    valid.push({ week: w, idx, entry });
  });
  valid.sort((a, b) => a.week - b.week || a.idx - b.idx);

  // Maps, not plain objects: an id like "constructor" or "__proto__" must behave like any other.
  const assignments = new Map<string, number>();
  const order: string[] = [];
  const labels = new Map<string, string>();
  const counts = new Map<number, number>();
  for (const { week, entry } of valid) {
    if (typeof entry.focus === 'string') {
      const focus = cleanText(entry.focus, LABEL_MAX);
      if (focus && !labels.has(String(week))) labels.set(String(week), focus);
    }
    if (!Array.isArray(entry.questions)) continue;
    for (const q of entry.questions) {
      if (typeof q !== 'string' || !known.has(q) || assignments.has(q)) {
        dropped += 1;
        continue;
      }
      if ((counts.get(week) ?? 0) >= cap) {
        dropped += 1;
        continue;
      }
      assignments.set(q, week);
      order.push(q);
      counts.set(week, (counts.get(week) ?? 0) + 1);
    }
  }

  const keptLabels = [...labels].filter(([key]) => (counts.get(Number(key)) ?? 0) > 0);
  const summary =
    isObject(raw) && typeof raw.summary === 'string' ? cleanText(raw.summary, SUMMARY_MAX) : '';
  return {
    plan: {
      weeks,
      assignments: Object.fromEntries(assignments),
      order,
      labels: Object.fromEntries(keptLabels),
    },
    summary,
    stats: { placed: assignments.size, dropped, slots: weeks * cap },
  };
}
