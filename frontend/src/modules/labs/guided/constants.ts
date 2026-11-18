import type { DeeperLevel, Difficulty } from './types';

/** XP, per topic. A full path (about 20 questions, a coding exercise on most, 5 phases and the boss) lands near level 7. */
export const XP = {
  complete: { easy: 10, medium: 15, hard: 25 } as Record<Difficulty, number>,
  /** The first time every test of a coding exercise passes. */
  code: 10,
  /** Extra for completing a Dive Deeper question. */
  explore: 5,
  phase: 40,
  boss: 120,
  /** The first coding pass of a day that continues a streak. */
  streak: 5,
};

export interface LevelDef {
  level: number;
  /** XP at which the level starts. */
  at: number;
  title: string;
}

export const LEVELS: LevelDef[] = [
  { level: 1, at: 0, title: 'Novice' },
  { level: 2, at: 60, title: 'Apprentice' },
  { level: 3, at: 150, title: 'Practitioner' },
  { level: 4, at: 270, title: 'Solver' },
  { level: 5, at: 420, title: 'Strategist' },
  { level: 6, at: 600, title: 'Specialist' },
  { level: 7, at: 820, title: 'Expert' },
  { level: 8, at: 1080, title: 'Master' },
  { level: 9, at: 1380, title: 'Grandmaster' },
  { level: 10, at: 1720, title: 'Legend' },
];

export const DEEPER_LEVELS: Record<DeeperLevel, string> = {
  1: 'Conceptual understanding',
  2: 'Practical implementation',
  3: 'Optimization and trade-offs',
  4: 'Advanced problem solving',
  5: 'Interview-level exploration',
};

export const DEEPER_ANGLES: Record<string, string> = {
  internals: 'Internals',
  'why-it-works': 'Why it works',
  alternatives: 'Alternatives',
  'trade-offs': 'Trade-offs',
  complexity: 'Complexity',
  optimization: 'Optimization',
  'edge-cases': 'Edge cases',
  'real-world': 'Real world',
  interview: 'Interview',
  variation: 'Variation',
};

export const PHASE_COUNT = 5;
/** Questions the AI writes per page of the path (a phase). Twin: PHASE_QUESTIONS in fe-apis/guidedPractice/prompts.ts. */
export const PHASE_QUESTIONS = 5;
/** Phases the AI plans and "Generate more" can add: past this a path is long enough. */
export const MAX_GENERATED_PHASES = 8;
/** A breakdown of a breakdown of a breakdown ... stops here: past it a step is already as small as it gets. */
export const MAX_DEPTH = 5;

/** Tests the reference solution must agree with before the learner's code is graded against them. */
export const MIN_VERIFIED_TESTS = 2;

export const COMPLETED_TITLES_LIMIT = 40;
export const PATH_TITLES_LIMIT = 60;

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
}

/** The target of `path-complete` is the number of phases; the table holds the others. */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-step',
    title: 'First Step',
    description: 'Complete your first question.',
    icon: 'FlagIcon',
    target: 1,
  },
  {
    id: 'code-runner',
    title: 'Code Runner',
    description: 'Pass every test of a coding exercise.',
    icon: 'CommandLineIcon',
    target: 1,
  },
  {
    id: 'streak-3',
    title: 'Three-Day Streak',
    description: 'Pass a coding exercise on three days in a row.',
    icon: 'FireIcon',
    target: 3,
  },
  {
    id: 'phase-cleared',
    title: 'Phase Cleared',
    description: 'Complete your first phase.',
    icon: 'CheckBadgeIcon',
    target: 1,
  },
  {
    id: 'path-complete',
    title: 'Path Complete',
    description: 'Complete every phase.',
    icon: 'MapIcon',
    target: 1,
  },
  {
    id: 'boss-slayer',
    title: 'Boss Slayer',
    description: 'Defeat the final boss.',
    icon: 'TrophyIcon',
    target: 1,
  },
  {
    id: 'curiosity-explorer',
    title: 'Curiosity Explorer',
    description: 'Complete five Dive Deeper questions.',
    icon: 'MagnifyingGlassPlusIcon',
    target: 5,
  },
  {
    id: 'concept-decomposer',
    title: 'Concept Decomposer',
    description: 'Finish five breakdowns, nested ones included.',
    icon: 'Squares2X2Icon',
    target: 5,
  },
  {
    id: 'curious-learner',
    title: 'Curious Learner',
    description: 'Complete five AI Tutor learning sessions.',
    icon: 'SparklesIcon',
    target: 5,
  },
  {
    id: 'concept-master',
    title: 'Concept Master',
    description: 'Independently answer ten questions correctly.',
    icon: 'AcademicCapIcon',
    target: 10,
  },
];

/** Plain-language rules the achievements panel shows under the list, so no badge is a mystery. */
export const ACHIEVEMENT_NOTES = [
  'A Dive Deeper question counts once you complete it.',
  'A breakdown is finished when every question it produced is complete.',
  'A tutor session counts when the tutor judges your answer as understood.',
  'An independent answer passes its tests, or earns the tutor’s “understood”, without hints, the solution or a STAR answer.',
];
