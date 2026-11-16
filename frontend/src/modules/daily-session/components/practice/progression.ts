/**
 * Practice game rules in one place: levels and ranks, XP per answer, how an AI score becomes a grade, and the 1-5
 * rating saved to the question bank. Pure functions, no React, so the numbers on every screen agree.
 */

import type { Tone } from '../ds';
import type { QuestionKind } from '../../coach/questionKind';

export type Grade = 'nailed' | 'almost' | 'review';

/** XP one answer earned: its base and the combo bonus on top. */
export interface Earned {
  base: number;
  combo: number;
}

// ── Levels ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Level n -> n+1 costs 40 + 20(n-1) XP: 40, 60, 80, ... A ten-question drill earns roughly 60-140 XP, so the first
// levels come every drill or two and later ones take a few days.
const stepFor = (level: number) => 40 + 20 * (level - 1);

/** Ranks follow the engineering ladder the practice is preparing for. */
const RANKS: { from: number; title: string }[] = [
  { from: 1, title: 'Intern' },
  { from: 3, title: 'Junior engineer' },
  { from: 6, title: 'Engineer' },
  { from: 10, title: 'Senior engineer' },
  { from: 15, title: 'Staff engineer' },
  { from: 21, title: 'Principal engineer' },
];

export interface LevelInfo {
  level: number;
  rank: string;
  /** XP at which this level started, and at which the next one starts. */
  floor: number;
  next: number;
  /** 0..1 through this level. */
  progress: number;
  toNext: number;
  /** The next rank up and the level it starts at (null at the top). */
  nextRank: { title: string; level: number } | null;
}

export function levelInfo(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  let floor = 0;
  while (total >= floor + stepFor(level) && level < 999) {
    floor += stepFor(level);
    level += 1;
  }
  const next = floor + stepFor(level);
  const rankIdx = RANKS.reduce((idx, r, i) => (level >= r.from ? i : idx), 0);
  const up = RANKS[rankIdx + 1];
  return {
    level,
    rank: RANKS[rankIdx].title,
    floor,
    next,
    progress: (total - floor) / (next - floor),
    toNext: next - total,
    nextRank: up ? { title: up.title, level: up.from } : null,
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** An AI score (0-100) as a grade. */
export const gradeFromScore = (score: number): Grade => (score >= 80 ? 'nailed' : score >= 55 ? 'almost' : 'review');

/** XP for one answer. A checked answer earns more than a self-graded one, so checking is worth the wait. */
export const AI_BONUS = 2;
export const SELF_XP: Record<Grade, number> = { nailed: 6, almost: 4, review: 2 };
export const COMBO_BONUS = 5;
/** The third nailed answer in a row (and every one after it) earns the combo bonus. */
export const COMBO_FROM = 3;
export const FINISH_XP = 20;
export const MAX_ANSWER_XP = 10 + AI_BONUS + COMBO_BONUS;

export const answerXp = (grade: Grade, score: number | null) =>
  score === null ? SELF_XP[grade] : AI_BONUS + Math.max(0, Math.min(10, Math.round(score / 10)));

/** The 1-5 rating saved to the question bank (5 = mastered): from the AI score when there is one. */
export const ratingFor = (grade: Grade, score: number | null) =>
  score === null ? { nailed: 5, almost: 3, review: 1 }[grade] : Math.max(1, Math.min(5, Math.round(score / 20)));

export const GRADE_META: Record<Grade, { label: string; title: string; icon: string; tone: Tone }> = {
  review: { label: 'Needs review', title: 'One to revisit', icon: 'ArrowPathIcon', tone: 'rose' },
  almost: { label: 'Almost', title: 'Nearly there', icon: 'HandThumbUpIcon', tone: 'gold' },
  nailed: { label: 'Nailed it', title: 'Nailed it', icon: 'CheckBadgeIcon', tone: 'jade' },
};

// ── Self-check ───────────────────────────────────────────────────────────────────────────────────────────────────
/** What to compare your own answer against when grading it yourself, per kind of question. */
export const SELF_CHECK: Record<QuestionKind, string[]> = {
  dsa: [
    'Stated the input, output and constraints before coding',
    'Named the approach and why it beats brute force',
    'Gave the time and space complexity',
    'Walked through an edge case (empty, one item, duplicates)',
  ],
  system_design: [
    'Pinned down requirements and rough scale first',
    'Drew the main components and how data flows between them',
    'Picked storage and said why',
    'Named a bottleneck or failure and how to handle it',
  ],
  debugging: [
    'Reproduced or narrowed the problem before guessing',
    'Listed likely causes in order of probability',
    'Said what you would measure or log to confirm',
    'Described the fix and how to stop it coming back',
  ],
  behavioral: [
    'Set the situation and your task in two sentences',
    'Said what you did, not what the team did',
    'Ended with a result, ideally a number',
    'Said what you learned or would change',
  ],
  cv_ml: [
    'Defined the idea in one plain sentence',
    'Explained how it works, step by step or with the maths',
    'Gave a trade-off or a case where it fails',
    'Tied it to a real model, dataset or deployment',
  ],
};

// ── Daily goal ───────────────────────────────────────────────────────────────────────────────────────────────────
export const GOAL_KEY = 'labninja.practice.goal.v1';
export const GOAL_OPTIONS = [
  { xp: 30, label: 'Light', sub: 'About one short drill' },
  { xp: 50, label: 'Steady', sub: 'A drill most days' },
  { xp: 100, label: 'Intense', sub: 'Two full drills' },
] as const;
export const DEFAULT_GOAL = 50;

export function readGoal(): number {
  try {
    const v = Number(localStorage.getItem(GOAL_KEY));
    return GOAL_OPTIONS.some((o) => o.xp === v) ? v : DEFAULT_GOAL;
  } catch {
    return DEFAULT_GOAL;
  }
}

export function writeGoal(xp: number) {
  try {
    localStorage.setItem(GOAL_KEY, String(xp));
  } catch {
    /* the goal is a preference: it just won't survive a reload */
  }
}
