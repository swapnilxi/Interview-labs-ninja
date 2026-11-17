/**
 * Guided Practice (the dedicated page behind a DSA topic's "Guided Practice" card).
 *
 * One `GuidedState` document per learner and DSA page. The browser owns it: the server only stores it (versioned, see
 * fe-apis/guidedPractice/db.ts) and runs the AI prompts. Everything the learner generated or earned lives here, so a
 * refresh, another tab or another device restores the same path.
 */

import type { GuidedLab } from './labs';

export type QuestionKind = 'concept' | 'implementation' | 'algorithm' | 'scenario';
export type Difficulty = 'easy' | 'medium' | 'hard';
/** How a question came to be: a main question of a phase, a Breakdown step, a Dive Deeper follow-up, or the final boss. */
export type Relation = 'base' | 'breakdown' | 'deeper' | 'boss';
export type DeeperLevel = 1 | 2 | 3 | 4 | 5;
export type LearnMode = 'tutor' | 'star';
export type CompletionPath = 'tests' | 'tutor' | 'children' | 'manual';
export type Verdict = 'understood' | 'partial' | 'not_yet';

// ── The generated path ──────────────────────────────────────────────────────

export interface TestCase {
  args: unknown[];
  expected: unknown;
  label: string;
}

export interface Exercise {
  prompt: string;
  functionName: string;
  starterCode: string;
  tests: TestCase[];
  compare: 'exact' | 'unordered';
  /** The reference solution: hidden until the learner asks, and what the tests are checked against. */
  solution: string;
  /** The reference solution has been run against the tests in the browser (the AI's expected values are never trusted blind). */
  verified: boolean;
  /** How many of the AI's tests the reference solution disagreed with (they were dropped). */
  droppedTests: number;
  /** Enough tests survived to grade the learner's code. False = the exercise is shown but cannot be graded. */
  gradable: boolean;
}

/** A question's lesson, written the first time the learner opens it. */
export interface QuestionContent {
  explanation: string;
  example: string;
  exercise: Exercise | null;
  hints: string[];
  solutionExplanation: string;
}

/** The children one action produced for a question (Breakdown, or Dive Deeper), in display order. */
export interface BranchSet {
  ids: string[];
  /** Breakdown only: the prerequisite concepts the AI named. */
  prerequisites: string[];
  generatedAt: string;
  /** How many times it was generated (a regenerate adds one). */
  generations: number;
}

export interface Question {
  id: string;
  /** The phase this question belongs to; 'boss' for the final boss. Children carry their root's phase. */
  phaseId: string;
  parentId: string | null;
  relation: Relation;
  /** Dive Deeper only. */
  level: DeeperLevel | null;
  angle: string;
  title: string;
  objective: string;
  /** Breakdown: why this step is needed for its parent. Boss: the framing story. */
  why: string;
  kind: QuestionKind;
  difficulty: Difficulty;
  effort: string;
  /** The outline said the learner should write code for it. */
  wantsExercise: boolean;
  /** null until the lesson is generated (on first open). */
  content: QuestionContent | null;
  breakdown: BranchSet | null;
  deeper: BranchSet | null;
  createdAt: string;
}

export interface Phase {
  id: string;
  number: number;
  title: string;
  goal: string;
  questionIds: string[];
}

// ── The learner's progress ──────────────────────────────────────────────────

export interface RunSummary {
  passed: number;
  total: number;
  /** Every test passed. */
  ok: boolean;
  at: string;
  /** A short plain-text account of the failures, for the tutor ("Explain my mistake"). */
  report: string;
}

export interface TutorMessage {
  id: string;
  role: 'learner' | 'tutor';
  text: string;
  /** What the learner pressed, for a quick-action message. */
  action?: string;
  verdict?: Verdict;
  at: string;
}

export interface StarVersion {
  id: string;
  variant: 'generate' | 'simplify' | 'example';
  label: string;
  text: string;
  at: string;
}

export interface QuestionProgress {
  completed: boolean;
  completedAt: string | null;
  via: CompletionPath | null;
  /** Completed with proof (tests or the tutor's verdict) and without hints, the solution or the STAR answer. */
  independent: boolean;
  /** The learner's latest code (null = never edited, the starter shows). */
  code: string | null;
  lastRun: RunSummary | null;
  /** Every test has passed at least once. */
  codingDone: boolean;
  hintsUsed: number;
  solutionRevealed: boolean;
  /** A STAR answer was opened before the question was completed. */
  starViewed: boolean;
  mode: LearnMode | null;
  tutor: { messages: TutorMessage[]; understood: boolean; hintLevel: number };
  star: { versions: StarVersion[]; activeId: string | null; hidden: boolean };
  /** Last interaction, ISO. */
  touchedAt: string | null;
}

export interface Streak {
  current: number;
  best: number;
  /** Local day (YYYY-MM-DD) of the last passed coding exercise. */
  lastDay: string;
}

export interface Player {
  xp: number;
  /** Award key -> XP. A key can only be paid once, which is what stops a question paying twice. */
  ledger: Record<string, number>;
  /** Achievement id -> ISO time earned. */
  achievements: Record<string, string>;
  streak: Streak;
  /** Local days (YYYY-MM-DD) on which a coding exercise was first passed, newest last (the week strip reads it). */
  days: string[];
}

export interface GuidedUi {
  /** The phase and question the learner was last on (restored on return). */
  phaseId: string | null;
  questionId: string | null;
  /** Accordion flags: `ph:<phase>`, `bd:<question>` (its Breakdown panel), `dp:<question>` (its Dive Deeper panel). */
  open: Record<string, boolean>;
}

export interface TopicRef {
  /** The lab the topic belongs to (a document saved before there were two labs has none: it is DSA). */
  lab: GuidedLab;
  id: string;
  /** '' for the topic's own page. */
  subId: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  subName: string;
  subBrief: string;
}

export interface GuidedState {
  schema: 1;
  topic: TopicRef;
  createdAt: string;
  updatedAt: string;
  /** What the learner asked the path to focus on. */
  focus: string;
  phases: Phase[];
  bossId: string | null;
  questions: Record<string, Question>;
  progress: Record<string, QuestionProgress>;
  player: Player;
  ui: GuidedUi;
  /** Id counter for generated questions. */
  counter: number;
}

export interface GuidedSummary {
  percent: number;
  completed: number;
  total: number;
  xp: number;
  level: number;
  levelTitle: string;
  phasesDone: number;
  phases: number;
  bossDefeated: boolean;
}

// ── What the game tells the screen ──────────────────────────────────────────

export type GameEvent =
  | { id: string; type: 'xp'; amount: number; label: string }
  | { id: string; type: 'level'; level: number; title: string }
  | { id: string; type: 'phase'; phaseId: string; title: string; bonus: number }
  | { id: string; type: 'achievement'; achievementId: string }
  | { id: string; type: 'boss' }
  | { id: string; type: 'streak'; days: number };

// ── Parsed AI answers (parse.ts) ────────────────────────────────────────────

export interface OutlineQuestion {
  title: string;
  objective: string;
  kind: QuestionKind;
  difficulty: Difficulty;
  effort: string;
  exercise: boolean;
  why: string;
  level: DeeperLevel | null;
  angle: string;
}

export interface ParsedCurriculum {
  phases: { title: string; goal: string; questions: OutlineQuestion[] }[];
  boss: {
    title: string;
    story: string;
    objective: string;
    difficulty: Difficulty;
    effort: string;
  } | null;
}

export interface ParsedBranch {
  prerequisites: string[];
  questions: OutlineQuestion[];
}
