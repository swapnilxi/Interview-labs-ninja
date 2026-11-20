/**
 * A learner's private workspace in one workbook: the document the browser keeps and the server stores as is
 * (`PUT /api/lms/workbooks/<id>/progress`), plus the rules that read it. Pure functions, no React.
 *
 * The server only reads `done` (a map of block ids set to true) to count the percentage, and only for blocks that
 * exist in the workbook; everything else here is the browser's own. `withDone` recomputes `done` from the answers
 * after every change, so the two can never disagree.
 */

import type { QuizQuestion, WorkbookBlock, WorkbookContent, WorkbookSection } from './types';

export interface QuizAttempt {
  /** The learner's last answer: an option index, true/false, typed text, or the chosen right-hand side per pair. */
  value: unknown;
  correct: boolean;
  tries: number;
  /** "Show answer" was used. */
  revealed?: boolean;
}

export interface ProgressState {
  /** The chapter last opened, for "Continue". */
  section?: string;
  /** Per block id: true (read / done), text, { itemId: true }, { fieldId: text }, day numbers, or a rating. */
  answers: Record<string, unknown>;
  /** Per quiz question id. */
  quiz: Record<string, QuizAttempt>;
  /** Per block id, true when finished. Written by withDone only. */
  done: Record<string, true>;
}

export const TEXT_MAX = 5000;

export const emptyState = (): ProgressState => ({ answers: {}, quiz: {}, done: {} });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored document, defensively read (a field of the wrong shape starts over empty). */
export function readState(raw: unknown): ProgressState {
  if (!isObject(raw)) return emptyState();
  const quiz: Record<string, QuizAttempt> = {};
  if (isObject(raw.quiz)) {
    for (const [id, attempt] of Object.entries(raw.quiz)) {
      if (isObject(attempt) && typeof attempt.tries === 'number') {
        quiz[id] = {
          value: attempt.value,
          correct: attempt.correct === true,
          tries: attempt.tries,
          revealed: attempt.revealed === true,
        };
      }
    }
  }
  const done: Record<string, true> = {};
  if (isObject(raw.done)) {
    for (const [id, value] of Object.entries(raw.done)) if (value === true) done[id] = true;
  }
  return {
    section: typeof raw.section === 'string' ? raw.section : undefined,
    answers: isObject(raw.answers) ? { ...raw.answers } : {},
    quiz,
    done,
  };
}

// ── Answer checking ──────────────────────────────────────────────────────────────────────────────────────────────

/** Typed answers compare without case, surrounding punctuation or doubled spaces. */
export function normalizeTyped(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.,!?;:"'“”‘’()]+|[\s.,!?;:"'“”‘’()]+$/g, '');
}

export function isCorrect(question: QuizQuestion, value: unknown): boolean {
  switch (question.kind) {
    case 'mcq':
    case 'scenario':
      return value === question.answer;
    case 'true_false':
      return value === question.answer;
    case 'fill_blank': {
      if (typeof value !== 'string' || !normalizeTyped(value)) return false;
      const typed = normalizeTyped(value);
      return [question.answer, ...question.accept].some((ok) => normalizeTyped(ok) === typed);
    }
    case 'matching':
      return Array.isArray(value) && question.pairs.every((pair, i) => value[i] === pair.right);
  }
}

export const questionFinished = (attempt: QuizAttempt | undefined): boolean =>
  !!attempt && (attempt.correct || !!attempt.revealed);

// ── What counts as done ──────────────────────────────────────────────────────────────────────────────────────────

const filled = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function isBlockDone(block: WorkbookBlock, state: ProgressState): boolean {
  const answer = state.answers[block.id];
  switch (block.type) {
    case 'reading':
    case 'key_points':
    case 'action':
      return answer === true;
    case 'reflection':
    case 'short_answer':
      return filled(answer);
    case 'checklist':
      return isObject(answer) && block.items.every((item) => answer[item.id] === true);
    case 'planner':
      return isObject(answer) && block.fields.every((field) => filled(answer[field.id]));
    case 'habit_tracker':
      return Array.isArray(answer) && answer.length >= block.days;
    case 'scale':
      return typeof answer === 'number';
    case 'quiz':
      return block.questions.every((question) => questionFinished(state.quiz[question.id]));
  }
}

const readySections = (content: WorkbookContent | null | undefined): WorkbookSection[] =>
  (content?.sections ?? []).filter((section) => section.status === 'ready');

/** The state with `done` recomputed for every written block (blocks that no longer exist drop out). */
export function withDone(
  state: ProgressState,
  content: WorkbookContent | null | undefined
): ProgressState {
  const done: Record<string, true> = {};
  for (const section of readySections(content)) {
    for (const block of section.blocks) if (isBlockDone(block, state)) done[block.id] = true;
  }
  return { ...state, done };
}

export interface Stats {
  done: number;
  total: number;
}

export function sectionStats(section: WorkbookSection, state: ProgressState | null): Stats {
  const total = section.status === 'ready' ? section.blocks.length : 0;
  const done = state ? section.blocks.filter((block) => state.done[block.id]).length : 0;
  return { done: Math.min(done, total), total };
}

/** The same count the server makes (floor, so 100% only when everything is done). */
export function workbookStats(
  content: WorkbookContent | null | undefined,
  state: ProgressState | null
): Stats & { percent: number } {
  let done = 0;
  let total = 0;
  for (const section of readySections(content)) {
    const stats = sectionStats(section, state);
    done += stats.done;
    total += stats.total;
  }
  return { done, total, percent: total ? Math.floor((100 * done) / total) : 0 };
}

/** Where "Continue" goes: the chapter last opened if it is unfinished, else the first unfinished, else the first. */
export function continueSection(
  content: WorkbookContent | null | undefined,
  state: ProgressState | null
): WorkbookSection | null {
  const sections = readySections(content);
  if (!sections.length) return null;
  const unfinished = (s: WorkbookSection) => {
    const stats = sectionStats(s, state);
    return stats.done < stats.total;
  };
  const last = sections.find((s) => s.id === state?.section);
  if (last && unfinished(last)) return last;
  return sections.find(unfinished) ?? last ?? sections[0];
}

/** A stable shuffle (the same order every visit), so a matching question's choices do not jump around. */
export function stableShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
