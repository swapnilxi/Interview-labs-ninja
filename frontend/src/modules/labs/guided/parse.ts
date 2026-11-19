/**
 * Reads what the AI answered. The endpoints (fe-apis/guidedPractice, backend/modules/guided_practice) only run the prompts
 * and return the model's raw text, so this one parser serves both backends. It is tolerant about the JSON (fences,
 * raw newlines inside strings, trailing commas) and strict about the shape: anything it cannot trust is dropped.
 */

import { MIN_VERIFIED_TESTS } from './constants';
import type {
  DeeperLevel,
  Difficulty,
  Exercise,
  OutlineQuestion,
  ParsedBranch,
  ParsedCurriculum,
  ParsedOutline,
  ParsedPhase,
  QuestionContent,
  QuestionKind,
  TestCase,
  Verdict,
} from './types';

export class AiParseError extends Error {}

const KINDS: readonly QuestionKind[] = ['concept', 'implementation', 'algorithm', 'scenario'];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ── JSON ────────────────────────────────────────────────────────────────────

/** Escapes raw control characters inside strings, drops bad escapes (\') and trailing commas. */
export function repairJson(src: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        if ('"\\/bfnrtu'.includes(ch)) out += ch;
        else out = out.slice(0, -1) + ch; // an escape JSON does not know: keep the character, lose the backslash
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else out += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '}' || src[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

const NOT_JSON = 'The AI’s answer was not valid JSON. Try again.';
const CUT_OFF = 'The AI’s answer could not be read (it may have been cut off). Try again.';

/** JSON.parse, then JSON.parse of the repaired text; undefined when neither reads. */
function tryParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    /* try the repaired text */
  }
  try {
    return JSON.parse(repairJson(body));
  } catch {
    return undefined;
  }
}

interface Scan {
  /** Index just past the bracket that closes the one at `start`, or -1 when the text ends first (a cut-off answer). */
  end: number;
  /** Where the text could be cut and closed again: just past a closed `}`/`]`, with the brackets still open there. */
  safe: { at: number; open: string[] } | null;
}

/** Walks the JSON value that starts at `start` (a `{` or `[`), string-aware, without trusting the text to be valid. */
function scanValue(src: string, start: number): Scan {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let safe: Scan['safe'] = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') open.push(ch);
    else if (ch === '}' || ch === ']') {
      open.pop();
      if (!open.length) return { end: i + 1, safe };
      safe = { at: i + 1, open: [...open] };
    }
  }
  return { end: -1, safe };
}

/**
 * A cut-off answer made whole: everything after the last value that was closed is dropped and the brackets still open are
 * closed, so `{"phases":[{"title":"A"},{"title":"B","go` reads as `{"phases":[{"title":"A"}]}`.
 */
function closeTruncated(src: string, start: number, safe: NonNullable<Scan['safe']>): string {
  const body = src.slice(start, safe.at).replace(/[\s,]+$/, '');
  const closers = [...safe.open].reverse().map((b) => (b === '{' ? '}' : ']'));
  return body + closers.join('');
}

export interface ExtractOptions {
  /**
   * Read an answer that was cut off (the model's token budget ran out) by keeping the items that were complete. Only for
   * lists where fewer items are still useful (the plan, a page of questions); a lesson must be whole.
   */
  salvage?: boolean;
}

/**
 * The JSON object in the answer. Ignored: Markdown fences, chatter before and after, a reasoning model's `<think>` block, and
 * braces in that chatter. Repaired: raw newlines and control characters inside strings, trailing commas, bad escapes, and
 * (with `salvage`) an answer that was cut off. A bare top-level array is returned as is (the parsers below accept it).
 */
export function extractJson(text: string, opts: ExtractOptions = {}): unknown {
  let t = (text ?? '').replace(/^﻿/, '').trim();
  // A reasoning model's thinking, when the provider leaves it in the text.
  t = t.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();
  // A fenced block anywhere in the answer is the JSON; without one (or a fence that was never closed), the whole text.
  const fenced = /```(?:json|javascript|js)?[ \t]*\r?\n?([\s\S]*?)```/i.exec(t);
  if (fenced && /[{[]/.test(fenced[1])) t = fenced[1].trim();
  else
    t = t
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  // Curly quotes as JSON's own quotes (only when the answer has no straight double quote at all, so content is never touched).
  if (!t.includes('"') && /[“”]/.test(t)) t = t.replace(/[“”]/g, '"');

  // A bare array of objects (`[{"title":...}]`) that comes before any object.
  const firstObject = t.indexOf('{');
  const firstArray = t.indexOf('[');
  if (firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)) {
    const scan = scanValue(t, firstArray);
    const value = scan.end === -1 ? undefined : tryParse(t.slice(firstArray, scan.end));
    if (Array.isArray(value) && value.some((v) => v && typeof v === 'object')) return value;
  }
  if (firstObject === -1) throw new AiParseError(NOT_JSON);

  // Each top-level `{` is a candidate and the first that reads wins, so braces in chatter before the JSON are skipped. A
  // candidate that does not read is skipped whole (its inner objects are fragments, not the answer).
  let empty: unknown;
  for (let start = firstObject, tries = 0; start !== -1 && tries < 40; tries++) {
    const scan = scanValue(t, start);
    if (scan.end === -1) {
      // It runs to the end of the answer: the answer was cut off.
      if (opts.salvage && scan.safe) {
        const value = tryParse(closeTruncated(t, start, scan.safe));
        if (value && typeof value === 'object') return value;
      }
      if (empty !== undefined) return empty;
      throw new AiParseError(CUT_OFF);
    }
    const value = tryParse(t.slice(start, scan.end));
    if (value && typeof value === 'object') {
      if (Object.keys(value).length) return value;
      if (empty === undefined) empty = value; // `{}` in chatter: only the answer if nothing better follows
    }
    start = t.indexOf('{', scan.end);
  }
  if (empty !== undefined) return empty;
  throw new AiParseError(CUT_OFF);
}

/** The list a parser reads: `raw[key]`, or the answer itself when the model sent the bare array. */
function listOf(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  const v = (raw as Record<string, unknown> | null)?.[key];
  return Array.isArray(v) ? v : [];
}

// ── Text ────────────────────────────────────────────────────────────────────

/** Titles compare equal when they differ only in case, punctuation or spacing. */
export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function oneLine(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Markdown: arrays are joined, and a double-escaped "\\n" (a model quirk) becomes a real newline. */
function block(v: unknown, max: number): string {
  let value = v;
  if (Array.isArray(value)) value = value.filter((x) => typeof x === 'string').join('\n\n');
  if (typeof value !== 'string') return '';
  let text = value.replace(/\r\n/g, '\n').trim();
  if (!text.includes('\n') && text.includes('\\n')) text = text.replace(/\\n/g, '\n');
  return text.slice(0, max);
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function toLevel(v: unknown): DeeperLevel | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as DeeperLevel) : null;
}

/** A markdown answer: a wrapping fence the model added despite being told not to is removed. */
export function cleanMarkdown(text: string): string {
  const t = (text ?? '').trim();
  const m = /^\s*```(?:markdown|md)?\s*\n([\s\S]*)\n```\s*$/i.exec(t);
  return (m ? m[1] : t).trim();
}

// ── Outline questions (the path, a breakdown, deeper questions) ─────────────

function outlineQuestion(raw: unknown): OutlineQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const title = oneLine(q.title ?? q.question, 300);
  if (title.length < 6) return null;
  return {
    title,
    objective: oneLine(q.objective, 400),
    kind: pick(q.kind, KINDS, 'concept'),
    difficulty: pick(q.difficulty, DIFFICULTIES, 'medium'),
    effort: oneLine(q.effort, 30) || '5 min',
    exercise: q.exercise === true || q.exercise === 'true',
    why: oneLine(q.why, 400),
    level: toLevel(q.level),
    angle: oneLine(q.angle, 30).toLowerCase(),
  };
}

/** Keeps the first of every title the path already has (or that came earlier in this list). */
function dedupe(list: OutlineQuestion[], seen: Set<string>): OutlineQuestion[] {
  const out: OutlineQuestion[] = [];
  for (const q of list) {
    const key = normTitle(q.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/** What a path holds: parseCurriculum drops the rest (importPath.ts reports it). */
export const MAX_PHASES = 8;
export const MAX_QUESTIONS_PER_PHASE = 6;

export function parseCurriculum(text: string): ParsedCurriculum {
  const raw = extractJson(text, { salvage: true }) as { phases?: unknown; boss?: unknown };
  const list = listOf(raw, 'phases') as Record<string, unknown>[];
  const seen = new Set<string>();
  const phases = list
    .slice(0, MAX_PHASES)
    .map((p: Record<string, unknown>) => ({
      title: oneLine(p?.title, 120) || 'Phase',
      goal: oneLine(p?.goal, 260),
      questions: dedupe(
        (Array.isArray(p?.questions) ? (p.questions as unknown[]) : [])
          .slice(0, MAX_QUESTIONS_PER_PHASE)
          .map(outlineQuestion)
          .filter((q): q is OutlineQuestion => !!q),
        seen
      ),
    }))
    .filter((p: { questions: unknown[] }) => p.questions.length > 0);
  if (!phases.length) throw new AiParseError('The AI did not write any phases. Try again.');

  return { phases, boss: parseBoss(raw?.boss) };
}

/** The final boss of an answer, or null when it has none worth keeping (the lab's own boss is used then). */
function parseBoss(raw: unknown): ParsedCurriculum['boss'] {
  const b = raw as Record<string, unknown> | undefined;
  if (!b || typeof b !== 'object' || oneLine(b.title, 200).length < 4) return null;
  return {
    title: oneLine(b.title, 200),
    story: oneLine(b.story, 400),
    objective: oneLine(b.objective, 400),
    difficulty: 'hard',
    effort: oneLine(b.effort, 30) || '25 min',
  };
}

/** The plan of a path (`/outline`): phases with a title and a goal, and the boss. */
export function parseOutline(text: string): ParsedOutline {
  const raw = extractJson(text, { salvage: true }) as { phases?: unknown; boss?: unknown };
  const list = listOf(raw, 'phases') as Record<string, unknown>[];
  const phases = list.slice(0, MAX_PHASES).map((p: Record<string, unknown>, i: number) => ({
    title: oneLine(p?.title, 120) || `Phase ${i + 1}`,
    goal: oneLine(p?.goal, 260),
  }));
  if (!phases.length) throw new AiParseError('The AI did not plan any phases. Try again.');
  return { phases, boss: parseBoss(raw?.boss) };
}

/**
 * One page of the path (`/phase`): the questions of one phase. `known` is every normalized title the rest of the path
 * has (and the questions of this phase that stay): a question that repeats one is dropped.
 */
export function parsePhase(text: string, known: Set<string>): ParsedPhase {
  const raw = extractJson(text, { salvage: true }) as {
    title?: unknown;
    goal?: unknown;
    questions?: unknown;
  };
  const list = listOf(raw, 'questions')
    .map(outlineQuestion)
    .filter((q: OutlineQuestion | null): q is OutlineQuestion => !!q);
  const questions = dedupe(list, new Set(known)).slice(0, MAX_QUESTIONS_PER_PHASE);
  if (!questions.length) {
    throw new AiParseError(
      list.length
        ? 'The AI only repeated questions you already have. Try again.'
        : 'The AI did not write any questions. Try again.'
    );
  }
  return { title: oneLine(raw?.title, 120), goal: oneLine(raw?.goal, 260), questions };
}

/**
 * The questions of a Breakdown (`deeper` false) or a Dive Deeper (`deeper` true). `known` is every normalized title the
 * path already has: a question that repeats one is dropped, which is the "never duplicate" rule.
 */
export function parseBranch(text: string, deeper: boolean, known: Set<string>): ParsedBranch {
  const raw = extractJson(text, { salvage: true }) as {
    prerequisites?: unknown;
    questions?: unknown;
  };
  const list = listOf(raw, 'questions')
    .map(outlineQuestion)
    .filter((q: OutlineQuestion | null): q is OutlineQuestion => !!q);
  let questions = dedupe(list, new Set(known));
  if (deeper) {
    questions = questions
      .map((q, i) => ({ q: { ...q, level: q.level ?? (2 as DeeperLevel) }, i }))
      .sort((a, b) => (a.q.level as number) - (b.q.level as number) || a.i - b.i)
      .map((x) => x.q);
  }
  questions = questions.slice(0, 7);
  if (!questions.length)
    throw new AiParseError('The AI only repeated questions you already have. Try again.');
  const prerequisites = Array.isArray(raw?.prerequisites)
    ? (raw.prerequisites as unknown[])
        .map((p) => oneLine(p, 60))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  return { prerequisites, questions };
}

// ── A lesson ────────────────────────────────────────────────────────────────

function parseTests(raw: unknown): TestCase[] {
  if (!Array.isArray(raw)) return [];
  const out: TestCase[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    if (!Array.isArray(t.args) || !('expected' in t)) continue;
    const key = JSON.stringify([t.args, t.expected]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      args: t.args,
      expected: t.expected,
      label: oneLine(t.label, 60) || `Test ${out.length + 1}`,
    });
    if (out.length === 10) break;
  }
  return out;
}

function starterFor(fn: string, tests: TestCase[]): string {
  const count = tests[0]?.args.length ?? 0;
  const params = Array.from({ length: count }, (_, i) => `arg${i + 1}`).join(', ');
  return `def ${fn}(${params}):\n    """Your solution."""\n    pass\n`;
}

function parseExercise(raw: unknown): Exercise | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const prompt = block(e.prompt, 1500);
  const fn =
    typeof (e.function_name ?? e.functionName) === 'string'
      ? String(e.function_name ?? e.functionName).trim()
      : '';
  if (prompt.length < 10 || !IDENTIFIER.test(fn)) return null;
  const tests = parseTests(e.tests);
  let starter =
    typeof e.starter_code === 'string'
      ? e.starter_code.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n'
      : '';
  if (!new RegExp(`def\\s+${fn}\\s*\\(`).test(starter)) starter = starterFor(fn, tests);
  const solution = typeof e.solution === 'string' ? e.solution.replace(/\r\n/g, '\n').trim() : '';
  return {
    prompt,
    functionName: fn,
    starterCode: starter.slice(0, 4000),
    tests,
    compare: e.compare === 'unordered' ? 'unordered' : 'exact',
    solution: solution.slice(0, 6000),
    verified: false,
    droppedTests: 0,
    // Tests are only trusted once the reference solution agrees with them (verifyExercise), so a lesson with no
    // solution, or with fewer tests than that needs, cannot grade.
    gradable: tests.length >= MIN_VERIFIED_TESTS && solution.length > 0,
  };
}

export function parseLesson(text: string): QuestionContent {
  const raw = extractJson(text) as Record<string, unknown>;
  const explanation = block(raw?.explanation, 4000);
  if (!explanation) throw new AiParseError('The lesson came back empty. Try again.');
  const hints = Array.isArray(raw.hints)
    ? (raw.hints as unknown[])
        .map((h) => oneLine(h, 500))
        .filter(Boolean)
        .slice(0, 4)
    : [];
  return {
    explanation,
    example: block(raw.example, 3000),
    exercise: parseExercise(raw.exercise),
    hints,
    solutionExplanation: block(raw.solution_explanation ?? raw.solutionExplanation, 4000),
  };
}

// ── Tutor ───────────────────────────────────────────────────────────────────

const VERDICT_TAG = /\[\[\s*verdict\s*:\s*(understood|partial|not[_ ]yet)\s*\]\]/gi;

/** Splits the tutor's reply from its machine-readable verdict line. */
export function splitTutorReply(text: string): { text: string; verdict: Verdict | null } {
  let verdict: Verdict | null = null;
  const cleaned = (text ?? '').replace(VERDICT_TAG, (_, v: string) => {
    verdict = v.toLowerCase().replace(' ', '_') as Verdict;
    return '';
  });
  return { text: cleaned.replace(/\s+$/, '').trim(), verdict };
}
