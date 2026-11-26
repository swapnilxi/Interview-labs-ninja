/**
 * Import a Guided Practice path from JSON instead of having the AI write it: the person pastes (or opens a .json file of) a path
 * written somewhere else, and it becomes the page's path exactly like a generated one. The JSON goes through the same parser as
 * the AI's answer (`parseCurriculum`), so the same cleaning and limits apply: kinds and difficulties are checked, duplicate titles
 * dropped, a path holds at most MAX_PHASES phases of MAX_QUESTIONS_PER_PHASE questions.
 *
 * Accepted shapes (the first is what the AI writes):
 *   {"phases":[{"title","goal","questions":[{"title","objective","kind","difficulty","effort","exercise"}]}],"boss":{...}}
 *   [ {"title","goal","questions":[...]}, ... ]            a list of phases
 *   {"questions":[...]}  or  [ {"title":...}, "A question", ... ]   a flat list: grouped into phases of up to six
 * A question may be a plain string (its title). Only the title is required.
 */

import {
  AiParseError,
  extractJson,
  MAX_PHASES,
  MAX_QUESTIONS_PER_PHASE,
  parseCurriculum,
  repairJson,
} from './parse';
import type { ParsedCurriculum } from './types';

/** Far more than any path (48 questions); stops a pasted book from being parsed. */
export const MAX_IMPORT_CHARS = 300_000;

export interface ImportedPath {
  curriculum: ParsedCurriculum;
  /** Questions in the JSON, and how many made it into the path (duplicates, untitled items and the limits drop the rest). */
  found: number;
  kept: number;
  /** The JSON was cut off (the other AI hit its length limit) and only its complete part was read. */
  truncated?: boolean;
}

const NOT_JSON =
  'This is not valid JSON. Look for a missing bracket, comma or quote and try again.';

/** Where JSON.parse gave up on the repaired text, as "line 4: …snippet…", or null when it does not say. */
function whereItBreaks(body: string): string | null {
  const repaired = repairJson(body);
  try {
    JSON.parse(repaired);
    return null;
  } catch (e) {
    const m = /position (\d+)/.exec(e instanceof Error ? e.message : '');
    if (!m) return null;
    const pos = Math.min(Number(m[1]), repaired.length);
    const line = repaired.slice(0, pos).split('\n').length;
    const snippet = repaired
      .slice(Math.max(0, pos - 30), pos + 30)
      .replace(/\s+/g, ' ')
      .replace(/\\"/g, '"')
      .trim();
    return `line ${line}, near “${snippet}”`;
  }
}

function readJson(text: string): { value: unknown; truncated: boolean } {
  const t = (text ?? '')
    .replace(/^﻿/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!t) throw new AiParseError('Paste some JSON first.');
  if (t.length > MAX_IMPORT_CHARS) throw new AiParseError('This is too long to be a path.');
  if (t.startsWith('[')) {
    const body = t.slice(0, t.lastIndexOf(']') + 1) || t;
    try {
      return { value: JSON.parse(body), truncated: false };
    } catch {
      /* repaired below */
    }
    try {
      return { value: JSON.parse(repairJson(body)), truncated: false };
    } catch {
      /* fall through to extractJson, which also finds `{...}` */
    }
  }
  try {
    return { value: extractJson(t), truncated: false };
  } catch {
    /* maybe cut off: try keeping the complete part */
  }
  try {
    // An answer cut off by the other AI's length limit: keep every question that was complete.
    return { value: extractJson(t, { salvage: true }), truncated: true };
  } catch {
    const start = t.search(/[{[]/);
    const where = start === -1 ? null : whereItBreaks(t.slice(start));
    throw new AiParseError(
      where
        ? `This is not valid JSON (${where}). Look for a missing bracket, comma or quote there and try again.`
        : NOT_JSON
    );
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** A question given as a bare string is its title. */
const asQuestion = (q: unknown): unknown => (typeof q === 'string' ? { title: q } : q);

interface RawPhase {
  title?: unknown;
  goal?: unknown;
  questions: unknown[];
}

/** The phases in the JSON, whichever of the accepted shapes it is. */
function phasesOf(raw: unknown): { phases: RawPhase[]; boss: unknown } {
  const boss = isObject(raw) ? raw.boss : undefined;
  const hasQuestions = (p: unknown) => isObject(p) && Array.isArray(p.questions);

  let phases: unknown[] | null = null;
  let flat: unknown[] | null = null;
  if (Array.isArray(raw)) {
    if (raw.length && raw.every(hasQuestions)) phases = raw;
    else flat = raw;
  } else if (isObject(raw)) {
    if (Array.isArray(raw.phases)) phases = raw.phases;
    else if (Array.isArray(raw.questions)) flat = raw.questions;
  }

  if (phases) {
    return {
      phases: phases.filter(isObject).map((p) => ({
        title: p.title,
        goal: p.goal,
        questions: Array.isArray(p.questions) ? p.questions.map(asQuestion) : [],
      })),
      boss,
    };
  }
  if (flat) {
    const questions = flat.map(asQuestion);
    const parts: RawPhase[] = [];
    for (let i = 0; i < questions.length; i += MAX_QUESTIONS_PER_PHASE) {
      parts.push({
        title:
          questions.length > MAX_QUESTIONS_PER_PHASE ? `Part ${parts.length + 1}` : 'Questions',
        goal: '',
        questions: questions.slice(i, i + MAX_QUESTIONS_PER_PHASE),
      });
    }
    return { phases: parts, boss };
  }
  throw new AiParseError(
    'Could not find any questions. Expected {"phases": [...]} or a list of questions.'
  );
}

/** Reads the JSON text into a path. Throws `AiParseError` with a message that can be shown as is. */
export function parseImportedPath(text: string): ImportedPath {
  const { value, truncated } = readJson(text);
  const { phases, boss } = phasesOf(value);
  const found = phases.reduce((n, p) => n + p.questions.length, 0);
  let curriculum: ParsedCurriculum;
  try {
    curriculum = parseCurriculum(JSON.stringify({ phases, boss }));
  } catch (e) {
    if (e instanceof AiParseError) {
      throw new AiParseError(
        'No usable questions. Each one needs a title of at least 6 characters (a plain string works).'
      );
    }
    throw e;
  }
  const kept = curriculum.phases.reduce((n, p) => n + p.questions.length, 0);
  return { curriculum, found, kept, truncated };
}

/** What to tell the person when some questions did not make it, or null when all did. */
export function importNote(r: ImportedPath): string | null {
  const cut = r.truncated
    ? 'The JSON looked cut off, so only its complete questions were imported. Ask the other AI to continue for the rest.'
    : null;
  if (r.kept >= r.found) return cut;
  const skipped = r.found - r.kept;
  const left = `${skipped} question${skipped === 1 ? ' was' : 's were'} left out: duplicates, items without a title, and anything past ${MAX_PHASES} phases of ${MAX_QUESTIONS_PER_PHASE} questions.`;
  return cut ? `${cut} ${left}` : left;
}

/** A prompt to give any other AI so that its answer can be imported here. */
export function externalPrompt(topicName: string, focus: string): string {
  const wanted = focus.trim();
  return [
    `Design a guided practice path for ONE topic: "${topicName}". A learner works through it phase by phase, question by question.`,
    wanted ? `The learner wants the path to focus on: ${wanted}` : '',
    '',
    `- Up to ${MAX_PHASES} phases, each with 3 to ${MAX_QUESTIONS_PER_PHASE} questions in learning order, easiest first. Name the phases for this topic, not generically.`,
    '- Every question is one clear question or task about one idea, written as a full sentence. No two questions repeat.',
    '- "kind" is concept, implementation, algorithm or scenario. "difficulty" is easy, medium or hard. "exercise" is true when the learner should write code.',
    '- Do not include solutions. Add one final "boss" task.',
    '',
    'Respond with JSON only, no Markdown fences and no commentary, in exactly this shape:',
    '{"phases":[{"title":"...","goal":"one sentence","questions":[{"title":"...","objective":"one sentence","kind":"concept","difficulty":"easy","effort":"5 min","exercise":false}]}],"boss":{"title":"...","story":"...","objective":"...","difficulty":"hard","effort":"25 min"}}',
  ]
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n');
}
