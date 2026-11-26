/**
 * The path as a tree, and the rules that read it. Everything here is pure: a function takes the state and returns a new
 * one (or a value), so the hook can apply an AI answer or a click to whatever the state is *when it lands*.
 *
 * Shape: phases hold their main questions; a question can have a Breakdown set and a Dive Deeper set of children, and
 * those can have their own (Breakdown is recursive). The final boss stands outside the phases.
 */

import { MAX_DEPTH, PHASE_QUESTIONS } from './constants';
import { labConfig } from './labs';
import { normTitle } from './parse';
import type {
  BranchSet,
  GuidedState,
  ParsedBranch,
  ParsedCurriculum,
  ParsedOutline,
  ParsedPhase,
  Phase,
  Question,
  QuestionContent,
  QuestionProgress,
  StarCode,
  StarVersion,
  TopicRef,
} from './types';

export const nowIso = () => new Date().toISOString();

const pad = (n: number) => String(n).padStart(2, '0');
/** The local calendar day, YYYY-MM-DD (a streak is counted in the learner's own days). */
export const dayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export type BranchKind = 'breakdown' | 'deeper';

// ── Progress ────────────────────────────────────────────────────────────────

export function emptyProgress(): QuestionProgress {
  return {
    completed: false,
    completedAt: null,
    via: null,
    independent: false,
    code: null,
    lastRun: null,
    codingDone: false,
    hintsUsed: 0,
    solutionRevealed: false,
    starViewed: false,
    mode: null,
    tutor: { messages: [], understood: false, hintLevel: 0 },
    star: { versions: [], activeId: null, hidden: false },
    touchedAt: null,
  };
}

const EMPTY_PROGRESS: QuestionProgress = Object.freeze(emptyProgress()) as QuestionProgress;

export function progressOf(state: GuidedState, id: string): QuestionProgress {
  return state.progress[id] ?? EMPTY_PROGRESS;
}

/** The STAR state after a new answer version: it becomes the one on show, and nothing else is lost (the code stays). */
export function starWithVersion(
  star: QuestionProgress['star'],
  version: StarVersion
): QuestionProgress['star'] {
  return { ...star, versions: [...star.versions, version], activeId: version.id, hidden: false };
}

/** A new state with `patch` applied to one question's progress (and its last-interaction time, unless `touch` is false). */
export function patchProgress(
  state: GuidedState,
  id: string,
  patch: Partial<QuestionProgress>,
  touch = true
): GuidedState {
  const next = { ...progressOf(state, id), ...patch };
  if (touch) next.touchedAt = nowIso();
  return { ...state, progress: { ...state.progress, [id]: next } };
}

export const isDone = (state: GuidedState, id: string) => progressOf(state, id).completed;

/** Whether the path lists a question: always, except in the "To do" view where finished ones (with all beneath them) are hidden unless open. */
export function visibleInPath(
  state: GuidedState,
  id: string,
  todoOnly: boolean,
  selectedId: string | null
): boolean {
  if (!todoOnly || hasOpenWork(state, id) || selectedId === id) return true;
  return !!selectedId && descendantsOf(state, id).some((d) => d.id === selectedId);
}

/** The question, or anything beneath it, is still to do (the "To do" view hides what has none of that). */
export function hasOpenWork(state: GuidedState, id: string): boolean {
  if (!isDone(state, id)) return true;
  return descendantsOf(state, id).some((d) => !isDone(state, d.id));
}

// ── Reading the tree ────────────────────────────────────────────────────────

export function branchOf(q: Question | undefined, kind: BranchKind): BranchSet | null {
  return q ? (kind === 'breakdown' ? q.breakdown : q.deeper) : null;
}

export function childrenOf(state: GuidedState, id: string, kind: BranchKind): Question[] {
  const set = branchOf(state.questions[id], kind);
  return set ? set.ids.map((c) => state.questions[c]).filter((c): c is Question => !!c) : [];
}

/** Parents above a question, outermost first. */
export function ancestorsOf(state: GuidedState, id: string): Question[] {
  const out: Question[] = [];
  let cur = state.questions[id];
  const guard = new Set<string>();
  while (cur?.parentId && !guard.has(cur.parentId)) {
    guard.add(cur.parentId);
    const parent = state.questions[cur.parentId];
    if (!parent) break;
    out.unshift(parent);
    cur = parent;
  }
  return out;
}

export const depthOf = (state: GuidedState, id: string) => ancestorsOf(state, id).length;

export function phaseOfQuestion(state: GuidedState, id: string): Phase | null {
  const phaseId = state.questions[id]?.phaseId;
  return state.phases.find((p) => p.id === phaseId) ?? null;
}

export function branchStats(state: GuidedState, id: string, kind: BranchKind) {
  const kids = childrenOf(state, id, kind);
  return { total: kids.length, done: kids.filter((k) => isDone(state, k.id)).length };
}

/** Every question below `id` (Breakdown and Dive Deeper, all depths). */
export function descendantsOf(state: GuidedState, id: string): Question[] {
  const out: Question[] = [];
  const walk = (qid: string) => {
    for (const kind of ['breakdown', 'deeper'] as const) {
      for (const c of childrenOf(state, qid, kind)) {
        out.push(c);
        walk(c.id);
      }
    }
  };
  walk(id);
  return out;
}

/** All questions in the order the path shows them: each phase's questions, every question followed by its children. */
export function questionOrder(state: GuidedState): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    if (!state.questions[id]) return;
    out.push(id);
    for (const kind of ['breakdown', 'deeper'] as const)
      for (const c of childrenOf(state, id, kind)) walk(c.id);
  };
  for (const phase of state.phases) phase.questionIds.forEach(walk);
  if (state.bossId) walk(state.bossId);
  return out;
}

/** Normalized titles of every question the path has: what a new generation must not repeat. */
export function knownTitles(state: GuidedState): Set<string> {
  return new Set(Object.values(state.questions).map((q) => normTitle(q.title)));
}

/** Titles of the questions in one phase (children included), for the "never repeat" part of a prompt. */
export function phaseTitles(state: GuidedState, phaseId: string): string[] {
  return Object.values(state.questions)
    .filter((q) => q.phaseId === phaseId)
    .map((q) => q.title);
}

// ── Phases and the boss ─────────────────────────────────────────────────────

/**
 * Every phase is open from the start (Guided Path): completion records what the learner has done and never controls access.
 * 'active' is the phase the learner works in (the first one not complete; it opens by default), 'available' any other
 * phase not complete yet. 'locked' is kept in the type for older callers and is never returned.
 */
export type PhaseStatus = 'locked' | 'active' | 'available' | 'completed';

export function isPhaseDone(state: GuidedState, phase: Phase): boolean {
  if (phase.pending) return false;
  return phase.questionIds.length > 0 && phase.questionIds.every((id) => isDone(state, id));
}

export function phaseStatus(state: GuidedState, phase: Phase): PhaseStatus {
  if (isPhaseDone(state, phase)) return 'completed';
  return activePhase(state)?.id === phase.id ? 'active' : 'available';
}

/** The first phase that is not complete (the one the learner works in), or null once every phase is. */
export function activePhase(state: GuidedState): Phase | null {
  return state.phases.find((p) => !isPhaseDone(state, p)) ?? null;
}

/** 'locked' is kept in the type for older callers and is never returned: the boss can be faced at any time. */
export type BossStatus = 'none' | 'locked' | 'active' | 'completed';

export function bossStatus(state: GuidedState): BossStatus {
  if (!state.bossId || !state.questions[state.bossId]) return 'none';
  return isDone(state, state.bossId) ? 'completed' : 'active';
}

/** Every question of the path can be opened at any time (nothing is locked behind completion). */
export function isUnlocked(state: GuidedState, id: string): boolean {
  const q = state.questions[id];
  if (!q) return false;
  return q.relation === 'boss' || !!phaseOfQuestion(state, id);
}

export interface Overall {
  /** Main questions (and the boss) completed, as a whole percent: what the header shows. */
  percent: number;
  requiredDone: number;
  requiredTotal: number;
  /** Every question, generated children included. */
  completed: number;
  total: number;
  phases: number;
  phasesDone: number;
  codingDone: number;
  codingTotal: number;
}

export function overall(state: GuidedState): Overall {
  const required = state.phases.flatMap((p) => p.questionIds);
  if (state.bossId) required.push(state.bossId);
  const requiredDone = required.filter((id) => isDone(state, id)).length;
  // A phase that is planned but not written yet is a page of questions still to come: without it the bar would read 100% after
  // the first page.
  const requiredTotal =
    required.length + state.phases.filter((p) => p.pending).length * PHASE_QUESTIONS;
  const ids = Object.keys(state.questions);
  return {
    percent: requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 0,
    requiredDone,
    requiredTotal,
    completed: ids.filter((id) => isDone(state, id)).length,
    total: ids.length,
    phases: state.phases.length,
    phasesDone: state.phases.filter((p) => isPhaseDone(state, p)).length,
    codingDone: ids.filter((id) => progressOf(state, id).codingDone).length,
    codingTotal: ids.filter(
      (id) => state.questions[id].wantsExercise || state.questions[id].content?.exercise
    ).length,
  };
}

/** Where to go after `id`: the next unfinished question in path order, else the first unfinished one anywhere. */
export function nextQuestionId(state: GuidedState, id: string): string | null {
  const order = questionOrder(state).filter((q) => isUnlocked(state, q));
  const from = order.indexOf(id);
  const after = from >= 0 ? order.slice(from + 1) : order;
  return (
    after.find((q) => !isDone(state, q)) ?? order.find((q) => q !== id && !isDone(state, q)) ?? null
  );
}

// ── The completion rule ─────────────────────────────────────────────────────

/**
 * Can the learner complete this question now? A question that was broken down is complete once its breakdown
 * questions are, or once the learner shows they understand it on their own (its tests pass, or the tutor judges their
 * answer as understood). The final boss waits for every phase.
 */
export function completionGate(state: GuidedState, id: string): { ok: boolean; reason: string } {
  const q = state.questions[id];
  if (!q) return { ok: false, reason: 'This question no longer exists.' };
  if (!isUnlocked(state, id))
    return { ok: false, reason: 'This question is not part of the path.' };
  const progress = progressOf(state, id);
  if (progress.completed) return { ok: true, reason: '' };
  const { total, done } = branchStats(state, id, 'breakdown');
  const shown = progress.codingDone || progress.tutor.understood;
  if (total > done && !shown) {
    const left = total - done;
    return {
      ok: false,
      reason: `Finish the ${left} remaining breakdown question${left === 1 ? '' : 's'}, or show you understand it yourself (pass its tests, or answer the tutor’s check), to complete this question.`,
    };
  }
  return { ok: true, reason: '' };
}

// ── Building and growing the path ───────────────────────────────────────────

function newQuestion(
  state: GuidedState,
  patch: Partial<Question> & Pick<Question, 'title' | 'phaseId' | 'relation'>
): { state: GuidedState; question: Question } {
  const counter = state.counter + 1;
  const question: Question = {
    id: `q${counter}`,
    parentId: null,
    level: null,
    angle: '',
    objective: '',
    why: '',
    kind: 'concept',
    difficulty: 'medium',
    effort: '5 min',
    wantsExercise: false,
    content: null,
    breakdown: null,
    deeper: null,
    createdAt: nowIso(),
    ...patch,
  };
  return {
    state: { ...state, counter, questions: { ...state.questions, [question.id]: question } },
    question,
  };
}

export function createState(topic: TopicRef, parsed: ParsedCurriculum, focus: string): GuidedState {
  const now = nowIso();
  let state: GuidedState = {
    schema: 1,
    topic,
    createdAt: now,
    updatedAt: now,
    focus,
    phases: [],
    bossId: null,
    questions: {},
    progress: {},
    player: {
      xp: 0,
      ledger: {},
      achievements: {},
      streak: { current: 0, best: 0, lastDay: '' },
      days: [],
    },
    ui: { phaseId: null, questionId: null, open: {} },
    counter: 0,
  };
  const phases: Phase[] = [];
  parsed.phases.forEach((p, i) => {
    const phase: Phase = {
      id: `p${i + 1}`,
      number: i + 1,
      title: p.title,
      goal: p.goal,
      questionIds: [],
      ...(p.pending ? { pending: true } : {}),
    };
    for (const q of p.questions) {
      const made = newQuestion(state, {
        title: q.title,
        phaseId: phase.id,
        relation: 'base',
        objective: q.objective,
        kind: q.kind,
        difficulty: q.difficulty,
        effort: q.effort,
        wantsExercise: q.exercise,
      });
      state = made.state;
      phase.questionIds.push(made.question.id);
    }
    phases.push(phase);
  });
  const boss = parsed.boss ?? {
    ...labConfig(topic.lab).boss(topic.subName || topic.name),
    difficulty: 'hard' as const,
    effort: '25 min',
  };
  const madeBoss = newQuestion(state, {
    title: boss.title,
    phaseId: 'boss',
    relation: 'boss',
    objective: boss.objective,
    why: boss.story,
    kind: 'algorithm',
    difficulty: 'hard',
    effort: boss.effort,
    wantsExercise: labConfig(topic.lab).bossExercise,
  });
  state = madeBoss.state;
  const first = phases[0];
  return {
    ...state,
    phases,
    bossId: madeBoss.question.id,
    // No accordion flag is set: a phase is open by default only while it is the active one (see the phase view), so
    // finishing a phase folds it and opens the next without any bookkeeping.
    ui: { phaseId: first.id, questionId: null, open: {} },
  };
}

/**
 * The start of a path written in pages: the plan (every phase, the boss) with only the first phase written. The other phases
 * wait as `pending` until the learner asks for them ("Generate more"), so no single answer has to hold the whole path.
 */
export function createPlannedState(
  topic: TopicRef,
  outline: ParsedOutline,
  first: ParsedPhase,
  focus: string
): GuidedState {
  const phases = outline.phases.map((p, i) =>
    i === 0
      ? { title: p.title, goal: first.goal || p.goal, questions: first.questions }
      : { title: p.title, goal: p.goal, questions: [], pending: true }
  );
  return createState(topic, { phases, boss: outline.boss }, focus);
}

export interface PageResult {
  state: GuidedState;
  added: number;
  removed: number;
}

/**
 * Applies one written page to a phase. A phase that was `pending` gets its questions (and stops waiting). A written phase that is
 * regenerated loses only the questions nobody worked on: those with progress stay, so XP and answers are never thrown away and a
 * regenerate cannot be used to farm XP (a replaced question had earned nothing yet).
 */
export function applyPhase(state: GuidedState, phaseId: string, parsed: ParsedPhase): PageResult {
  const phase = state.phases.find((p) => p.id === phaseId);
  if (!phase) return { state, added: 0, removed: 0 };
  const questions = { ...state.questions };
  const progress = { ...state.progress };
  const keep: string[] = [];
  let removed = 0;
  for (const id of phase.questionIds) {
    if (!questions[id]) continue;
    if (hasProgress(state, id)) {
      keep.push(id);
      continue;
    }
    for (const doomed of [id, ...descendantsOf(state, id).map((d) => d.id)]) {
      delete questions[doomed];
      delete progress[doomed];
    }
    removed += 1;
  }

  let working: GuidedState = { ...state, questions, progress };
  const created: string[] = [];
  for (const q of parsed.questions) {
    const made = newQuestion(working, {
      title: q.title,
      phaseId: phase.id,
      relation: 'base',
      objective: q.objective,
      kind: q.kind,
      difficulty: q.difficulty,
      effort: q.effort,
      wantsExercise: q.exercise,
    });
    working = made.state;
    created.push(made.question.id);
  }
  const next: Phase = {
    ...phase,
    // The plan's title stays; a phase the plan had no title for takes the AI's
    title: phase.title || parsed.title || `Phase ${phase.number}`,
    goal: phase.goal || parsed.goal,
    questionIds: [...keep, ...created],
  };
  delete next.pending;
  return {
    state: { ...working, phases: state.phases.map((p) => (p.id === phase.id ? next : p)) },
    added: created.length,
    removed,
  };
}

/** The most phases a path takes through import or "Add phase": more than that is a different path. */
const MAX_PATH_PHASES = 30;

/** An id no phase of the path has yet (ids stay put when phases are renumbered, so they can run ahead of the numbers). */
function nextPhaseId(phases: Phase[]): string {
  const used = new Set(phases.map((p) => p.id));
  let n =
    Math.max(
      0,
      ...phases.map((p) => Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0)),
      ...phases.map((p) => p.number)
    ) + 1;
  while (used.has(`p${n}`)) n += 1;
  return `p${n}`;
}

/** Builds written phases (with their questions) from parsed ones, numbered from `firstNumber`; at most `room` of them. */
function buildPhases(
  state: GuidedState,
  parsed: ParsedCurriculum['phases'],
  firstNumber: number,
  room: number
): { working: GuidedState; built: Phase[]; added: number } {
  let working = state;
  const built: Phase[] = [];
  let added = 0;
  for (const p of parsed) {
    if (built.length >= room) break;
    const number = firstNumber + built.length;
    const phase: Phase = {
      id: nextPhaseId([...state.phases, ...built]),
      number,
      title: p.title || `Phase ${number}`,
      goal: p.goal,
      questionIds: [],
    };
    for (const q of p.questions) {
      const made = newQuestion(working, {
        title: q.title,
        phaseId: phase.id,
        relation: 'base',
        objective: q.objective,
        kind: q.kind,
        difficulty: q.difficulty,
        effort: q.effort,
        wantsExercise: q.exercise,
      });
      working = made.state;
      phase.questionIds.push(made.question.id);
      added += 1;
    }
    built.push(phase);
  }
  return { working, built, added };
}

/**
 * Adds written phases after the last one (before the boss). Used by "Generate more" past the plan.
 * The boss stays last, and a finished phase never reopens: the new phase is simply the next one.
 */
export function appendPhases(state: GuidedState, parsed: ParsedCurriculum['phases']): PageResult {
  const first = Math.max(0, ...state.phases.map((x) => x.number)) + 1;
  const { working, built, added } = buildPhases(
    state,
    parsed,
    first,
    MAX_PATH_PHASES - state.phases.length
  );
  return { state: { ...working, phases: [...state.phases, ...built] }, added, removed: 0 };
}

/**
 * Puts phases imported from JSON at the top of the path, before every phase it already has (written or still planned), and
 * renumbers those after them. Phase ids do not change, so progress, answers and XP stay where they were; the boss stays last.
 */
export function prependPhases(state: GuidedState, parsed: ParsedCurriculum['phases']): PageResult {
  const { working, built, added } = buildPhases(
    state,
    parsed,
    1,
    MAX_PATH_PHASES - state.phases.length
  );
  if (!built.length) return { state, added: 0, removed: 0 };
  const rest = state.phases.map((p, i) => ({ ...p, number: built.length + i + 1 }));
  return { state: { ...working, phases: [...built, ...rest] }, added, removed: 0 };
}

/** Most questions one phase may hold ("Add questions" stops there). */
export const MAX_PHASE_QUESTIONS = 40;

/**
 * "Add questions": appends new main questions to one phase after the ones it has. Existing questions keep their order and
 * ids; a title the path already has is skipped (so a retried request can never add the same question twice). A phase that
 * was still planned (`pending`) becomes a written one.
 */
export function appendToPhase(
  state: GuidedState,
  phaseId: string,
  parsed: ParsedPhase
): PageResult {
  const phase = state.phases.find((p) => p.id === phaseId);
  if (!phase) return { state, added: 0, removed: 0 };
  const known = knownTitles(state);
  let working = state;
  const created: string[] = [];
  for (const q of parsed.questions) {
    if (phase.questionIds.length + created.length >= MAX_PHASE_QUESTIONS) break;
    const key = normTitle(q.title);
    if (known.has(key)) continue;
    known.add(key);
    const made = newQuestion(working, {
      title: q.title,
      phaseId: phase.id,
      relation: 'base',
      objective: q.objective,
      kind: q.kind,
      difficulty: q.difficulty,
      effort: q.effort,
      wantsExercise: q.exercise,
    });
    working = made.state;
    created.push(made.question.id);
  }
  if (!created.length) return { state, added: 0, removed: 0 };
  const next: Phase = {
    ...phase,
    title: phase.title || parsed.title || `Phase ${phase.number}`,
    goal: phase.goal || parsed.goal,
    questionIds: [...phase.questionIds, ...created],
  };
  delete next.pending;
  return {
    state: { ...working, phases: state.phases.map((p) => (p.id === phase.id ? next : p)) },
    added: created.length,
    removed: 0,
  };
}

/**
 * "Add phase": new phases with a title and a goal and no questions yet (`pending`), after the last one. A title the path
 * already has as a phase is skipped, so a retried request does not add the same phase twice.
 */
export function addPlannedPhases(
  state: GuidedState,
  outlines: { title: string; goal: string }[]
): PageResult {
  const phases = [...state.phases];
  const have = new Set(phases.map((p) => normTitle(p.title)));
  let added = 0;
  for (const o of outlines) {
    if (phases.length >= MAX_PATH_PHASES) break;
    const key = normTitle(o.title);
    if (!o.title || have.has(key)) continue;
    have.add(key);
    const number = Math.max(0, ...phases.map((x) => x.number)) + 1;
    phases.push({
      id: nextPhaseId(phases),
      number,
      title: o.title,
      goal: o.goal,
      questionIds: [],
      pending: true,
    });
    added += 1;
  }
  return { state: added ? { ...state, phases } : state, added, removed: 0 };
}

/** A question, any of its descendants, has been worked on (so regenerating must not throw that work away). */
export function hasProgress(state: GuidedState, id: string): boolean {
  const own = (qid: string) => {
    const p = progressOf(state, qid);
    return (
      p.completed ||
      p.code !== null ||
      p.hintsUsed > 0 ||
      p.solutionRevealed ||
      p.tutor.messages.length > 0 ||
      p.star.versions.length > 0
    );
  };
  return own(id) || descendantsOf(state, id).some((d) => own(d.id));
}

export interface BranchResult {
  state: GuidedState;
  added: number;
  removed: number;
}

/**
 * Adds the questions of a Breakdown or Dive Deeper under `parentId`. With `regenerate`, the children that were never
 * worked on are replaced; those the learner started or completed stay (so XP and progress are never lost and a
 * regenerate cannot be used to farm XP).
 */
export function applyBranch(
  state: GuidedState,
  parentId: string,
  kind: BranchKind,
  parsed: ParsedBranch,
  regenerate: boolean
): BranchResult {
  const parent = state.questions[parentId];
  if (!parent) return { state, added: 0, removed: 0 };
  const previous = branchOf(parent, kind);
  const questions = { ...state.questions };
  const progress = { ...state.progress };
  let keep: string[] = previous?.ids.filter((id) => questions[id]) ?? [];
  let removed = 0;

  if (regenerate && previous) {
    const stay: string[] = [];
    for (const id of keep) {
      if (hasProgress(state, id)) {
        stay.push(id);
        continue;
      }
      const doomed = [id, ...descendantsOf(state, id).map((d) => d.id)];
      for (const d of doomed) {
        delete questions[d];
        delete progress[d];
      }
      removed += 1;
    }
    keep = stay;
  }

  let working: GuidedState = { ...state, questions, progress };
  const created: Question[] = [];
  for (const q of parsed.questions) {
    const made = newQuestion(working, {
      title: q.title,
      phaseId: parent.phaseId,
      parentId,
      relation: kind,
      level: kind === 'deeper' ? (q.level ?? 2) : null,
      angle: kind === 'deeper' ? q.angle : '',
      objective: q.objective,
      why: kind === 'breakdown' ? q.why : '',
      kind: q.kind,
      difficulty: q.difficulty,
      effort: q.effort,
      wantsExercise: q.exercise,
    });
    working = made.state;
    created.push(made.question);
  }

  let ids = [...keep, ...created.map((c) => c.id)];
  if (kind === 'deeper') {
    const levelOf = (id: string) => working.questions[id]?.level ?? 2;
    ids = ids
      .map((id, i) => ({ id, i }))
      .sort((a, b) => levelOf(a.id) - levelOf(b.id) || a.i - b.i)
      .map((x) => x.id);
  }
  const prerequisites = parsed.prerequisites.length
    ? parsed.prerequisites
    : (previous?.prerequisites ?? []);
  const set: BranchSet = {
    ids,
    prerequisites,
    generatedAt: nowIso(),
    generations: (previous?.generations ?? 0) + 1,
  };
  const updatedParent: Question = { ...working.questions[parentId], [kind]: set };
  const open = { ...working.ui.open, [`${kind === 'breakdown' ? 'bd' : 'dp'}:${parentId}`]: true };
  const gone = working.ui.questionId && !working.questions[working.ui.questionId];
  return {
    state: {
      ...working,
      questions: { ...working.questions, [parentId]: updatedParent },
      ui: { ...working.ui, open, questionId: gone ? parentId : working.ui.questionId },
    },
    added: created.length,
    removed,
  };
}

export function setLesson(state: GuidedState, id: string, content: QuestionContent): GuidedState {
  const q = state.questions[id];
  if (!q) return state;
  return { ...state, questions: { ...state.questions, [id]: { ...q, content } } };
}

/**
 * Whether a question can still grow children (Breakdown or Dive Deeper): every question can, down to MAX_DEPTH levels
 * below its phase, after which a step is already as small as it gets.
 */
export const canGrow = (state: GuidedState, id: string) =>
  !!state.questions[id] && depthOf(state, id) < MAX_DEPTH;

// ── Loading a saved document ────────────────────────────────────────────────

/** A saved "code implementation" of a question, or null for anything that is not one (older documents have none). */
function savedCode(raw: unknown): StarCode | null {
  const c = (raw && typeof raw === 'object' ? raw : null) as Partial<StarCode> | null;
  if (!c || typeof c.text !== 'string' || !c.text.trim()) return null;
  return { text: c.text, at: typeof c.at === 'string' ? c.at : '', hidden: c.hidden === true };
}

/**
 * A saved document, checked and filled in. It returns null for anything that is not one: the caller then refuses to
 * save over it (starting over is the learner's decision, never a silent overwrite).
 */
export function hydrateState(raw: unknown): GuidedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<GuidedState>;
  if (
    s.schema !== 1 ||
    !Array.isArray(s.phases) ||
    !s.questions ||
    typeof s.questions !== 'object' ||
    !s.topic
  )
    return null;
  const progress: Record<string, QuestionProgress> = {};
  const base = emptyProgress();
  for (const [id, p] of Object.entries(s.progress ?? {})) {
    if (!p || typeof p !== 'object') continue;
    const given = p as Partial<QuestionProgress>;
    progress[id] = {
      ...base,
      ...given,
      tutor: {
        ...base.tutor,
        ...(given.tutor ?? {}),
        messages: Array.isArray(given.tutor?.messages) ? given.tutor.messages : [],
      },
      star: {
        ...base.star,
        ...(given.star ?? {}),
        versions: Array.isArray(given.star?.versions) ? given.star.versions : [],
        code: savedCode(given.star?.code),
      },
    };
  }
  const player = s.player ?? ({} as Partial<GuidedState['player']>);
  return {
    schema: 1,
    topic: { ...s.topic, lab: labConfig(s.topic.lab).lab },
    createdAt: s.createdAt ?? nowIso(),
    updatedAt: s.updatedAt ?? nowIso(),
    focus: s.focus ?? '',
    phases: s.phases as Phase[],
    bossId: s.bossId ?? null,
    questions: s.questions as Record<string, Question>,
    progress,
    player: {
      xp: player.xp ?? 0,
      ledger: player.ledger ?? {},
      achievements: player.achievements ?? {},
      streak: { current: 0, best: 0, lastDay: '', ...(player.streak ?? {}) },
      days: Array.isArray(player.days)
        ? player.days.filter((d): d is string => typeof d === 'string').slice(-60)
        : [],
    },
    ui: { phaseId: null, questionId: null, open: {}, ...(s.ui ?? {}) },
    counter: typeof s.counter === 'number' ? s.counter : Object.keys(s.questions).length,
  };
}
