/**
 * The game of Guided Practice: XP and levels, coding streaks, phase and boss rewards, achievements.
 *
 * Every function is pure (state in, `{ state, events }` out); the events are what the screen animates. XP is paid through a
 * ledger keyed by what earned it (`complete:<question>`, `code:<question>`, `phase:<phase>`, …), and a key is paid once
 * only: un-completing a question and completing it again, or regenerating a breakdown, never pays twice.
 */

import { ACHIEVEMENTS, LEVELS, XP, type AchievementDef } from './constants';
import {
  activePhase,
  bossStatus,
  branchStats,
  completionGate,
  dayKey,
  isDone,
  isPhaseDone,
  nowIso,
  overall,
  patchProgress,
  phaseOfQuestion,
  progressOf,
} from './tree';
import type { CompletionPath, GameEvent, GuidedState, GuidedSummary, RunSummary } from './types';

export interface Outcome {
  state: GuidedState;
  events: GameEvent[];
}

let seq = 0;
const eventId = () => `ev${Date.now().toString(36)}${(seq++).toString(36)}`;

// ── Levels ──────────────────────────────────────────────────────────────────

export function levelFor(xp: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.at) current = l;
  const next = LEVELS.find((l) => l.at > xp) ?? null;
  const into = xp - current.at;
  const span = next ? next.at - current.at : 0;
  return {
    level: current.level,
    title: current.title,
    next,
    into,
    span,
    toNext: next ? next.at - xp : 0,
    pct: next ? Math.round((into / span) * 100) : 100,
  };
}

// ── Paying XP ───────────────────────────────────────────────────────────────

/** Pays `amount` once for `key`; a key already in the ledger pays nothing. */
function pay(
  state: GuidedState,
  key: string,
  amount: number,
  label: string,
  events: GameEvent[]
): GuidedState {
  if (amount <= 0 || key in state.player.ledger) return state;
  const before = levelFor(state.player.xp).level;
  const xp = state.player.xp + amount;
  events.push({ id: eventId(), type: 'xp', amount, label });
  const after = levelFor(xp);
  if (after.level > before)
    events.push({ id: eventId(), type: 'level', level: after.level, title: after.title });
  return {
    ...state,
    player: { ...state.player, xp, ledger: { ...state.player.ledger, [key]: amount } },
  };
}

// ── Streaks ─────────────────────────────────────────────────────────────────

function yesterdayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** The streak as the learner would see it today: it lapses if no exercise was passed today or yesterday. */
export function streakNow(state: GuidedState, today: string = dayKey()): number {
  const { current, lastDay } = state.player.streak;
  if (!lastDay) return 0;
  return lastDay === today || lastDay === yesterdayOf(today) ? current : 0;
}

// ── Completing ──────────────────────────────────────────────────────────────

/**
 * Completes a question if the rules allow (see completionGate) and pays what it earns: the question's XP by difficulty,
 * the exploration bonus for a Dive Deeper question, the boss reward, and the phase reward when it finishes its phase.
 */
export function completeQuestion(
  state: GuidedState,
  id: string,
  via: CompletionPath = 'manual',
  now: Date = new Date()
): Outcome {
  const events: GameEvent[] = [];
  const q = state.questions[id];
  if (!q || isDone(state, id) || !completionGate(state, id).ok) return { state, events };

  const before = progressOf(state, id);
  let path = via;
  if (path === 'manual') {
    const { total, done } = branchStats(state, id, 'breakdown');
    if (total > 0 && done === total) path = 'children';
  }
  const proof = before.codingDone || before.tutor.understood;
  const independent =
    proof && before.hintsUsed === 0 && !before.solutionRevealed && !before.starViewed;

  let next = patchProgress(state, id, {
    completed: true,
    completedAt: now.toISOString(),
    via: path,
    independent,
  });
  next = pay(
    next,
    `complete:${id}`,
    XP.complete[q.difficulty] ?? XP.complete.medium,
    'Question completed',
    events
  );
  if (q.relation === 'deeper')
    next = pay(next, `explore:${id}`, XP.explore, 'Exploration bonus', events);
  if (q.relation === 'boss' && !('boss' in next.player.ledger)) {
    next = pay(next, 'boss', XP.boss, 'Final boss defeated', events);
    events.push({ id: eventId(), type: 'boss' });
  }
  const phase = phaseOfQuestion(next, id);
  if (phase && isPhaseDone(next, phase) && !(`phase:${phase.id}` in next.player.ledger)) {
    next = pay(next, `phase:${phase.id}`, XP.phase, `Phase ${phase.number} complete`, events);
    events.push({
      id: eventId(),
      type: 'phase',
      phaseId: phase.id,
      title: phase.title,
      bonus: XP.phase,
    });
  }
  const earned = evaluateAchievements(next);
  return { state: earned.state, events: [...events, ...earned.events] };
}

/** Takes a completion back. XP already paid stays paid (and cannot be paid again): the ledger is the memory. */
export function uncompleteQuestion(state: GuidedState, id: string): GuidedState {
  if (!isDone(state, id)) return state;
  return patchProgress(state, id, {
    completed: false,
    completedAt: null,
    via: null,
    independent: false,
  });
}

// ── Coding exercises ────────────────────────────────────────────────────────

/**
 * Records a test run. The first run that passes every test pays the coding XP, advances the coding streak (a first pass
 * on a new day continues or starts it; one that continues it pays a small bonus) and completes the question, because
 * passing the tests is the learner showing they understand it themselves.
 */
export function recordRun(
  state: GuidedState,
  id: string,
  run: RunSummary,
  now: Date = new Date()
): Outcome {
  const events: GameEvent[] = [];
  let next = patchProgress(state, id, { lastRun: run });
  if (run.ok && run.total > 0 && !progressOf(state, id).codingDone) {
    next = patchProgress(next, id, { codingDone: true });
    next = pay(next, `code:${id}`, XP.code, 'Coding exercise passed', events);

    const today = dayKey(now);
    if (!next.player.days.includes(today))
      next = { ...next, player: { ...next.player, days: [...next.player.days, today].slice(-60) } };
    const streak = next.player.streak;
    if (streak.lastDay !== today) {
      const current = streak.lastDay === yesterdayOf(today) ? streak.current + 1 : 1;
      next = {
        ...next,
        player: {
          ...next.player,
          streak: { current, best: Math.max(streak.best, current), lastDay: today },
        },
      };
      if (current >= 2) {
        next = pay(next, `streak:${today}`, XP.streak, `${current}-day streak`, events);
        events.push({ id: eventId(), type: 'streak', days: current });
      }
    }
    const done = completeQuestion(next, id, 'tests', now);
    next = done.state;
    events.push(...done.events);
  }
  const earned = evaluateAchievements(next);
  return { state: earned.state, events: [...events, ...earned.events] };
}

// ── Achievements ────────────────────────────────────────────────────────────

export interface AchievementStatus {
  def: AchievementDef;
  value: number;
  target: number;
  /** ISO time it was earned, or null. */
  earnedAt: string | null;
}

function counts(state: GuidedState) {
  const ids = Object.keys(state.questions);
  const o = overall(state);
  return {
    completed: o.completed,
    coding: o.codingDone,
    phasesDone: o.phasesDone,
    phases: o.phases,
    deeperDone: ids.filter((id) => state.questions[id].relation === 'deeper' && isDone(state, id))
      .length,
    breakdownsFinished: ids.filter((id) => {
      const set = state.questions[id].breakdown;
      return !!set && set.ids.length > 0 && set.ids.every((c) => isDone(state, c));
    }).length,
    tutorSessions: ids.filter((id) => progressOf(state, id).tutor.understood).length,
    independent: ids.filter(
      (id) => progressOf(state, id).completed && progressOf(state, id).independent
    ).length,
    boss: bossStatus(state) === 'completed',
  };
}

export function achievementStatuses(state: GuidedState): AchievementStatus[] {
  const c = counts(state);
  const value: Record<string, number> = {
    'first-step': c.completed,
    'code-runner': c.coding,
    'streak-3': state.player.streak.best,
    'phase-cleared': c.phasesDone,
    'path-complete': c.phasesDone,
    'boss-slayer': c.boss ? 1 : 0,
    'curiosity-explorer': c.deeperDone,
    'concept-decomposer': c.breakdownsFinished,
    'curious-learner': c.tutorSessions,
    'concept-master': c.independent,
  };
  return ACHIEVEMENTS.map((def) => {
    const target = def.id === 'path-complete' ? Math.max(c.phases, 1) : def.target;
    return {
      def,
      value: Math.min(value[def.id] ?? 0, target),
      target,
      earnedAt: state.player.achievements[def.id] ?? null,
    };
  });
}

/** Earns every achievement whose condition is now met (and was not earned before). An earned one is never taken back. */
export function evaluateAchievements(state: GuidedState): Outcome {
  const events: GameEvent[] = [];
  const earned = { ...state.player.achievements };
  for (const status of achievementStatuses(state)) {
    if (!status.earnedAt && status.value >= status.target) {
      earned[status.def.id] = nowIso();
      events.push({ id: eventId(), type: 'achievement', achievementId: status.def.id });
    }
  }
  return events.length
    ? { state: { ...state, player: { ...state.player, achievements: earned } }, events }
    : { state, events };
}

// ── What the topic page's card shows ────────────────────────────────────────

export function summaryOf(state: GuidedState): GuidedSummary {
  const o = overall(state);
  const level = levelFor(state.player.xp);
  return {
    percent: o.percent,
    completed: o.requiredDone,
    total: o.requiredTotal,
    xp: state.player.xp,
    level: level.level,
    levelTitle: level.title,
    phasesDone: o.phasesDone,
    phases: o.phases,
    bossDefeated: bossStatus(state) === 'completed',
  };
}

/** The phase to open by default: the learner's last one if it is still reachable, else the active one. */
export function defaultPhaseId(state: GuidedState): string | null {
  return activePhase(state)?.id ?? state.phases[state.phases.length - 1]?.id ?? null;
}

// ── Today ───────────────────────────────────────────────────────────────────

/** Questions the learner completed on this local day (the daily goal's ring). */
export function completedToday(state: GuidedState, today: string = dayKey()): number {
  return Object.values(state.progress).filter(
    (p) => p.completed && p.completedAt && dayKey(new Date(p.completedAt)) === today
  ).length;
}

export interface WeekDay {
  key: string;
  /** Narrow weekday for the label: M T W T F S S. */
  label: string;
  done: boolean;
  today: boolean;
}

/** The last seven days, oldest first, marking the ones with a passed exercise. */
export function weekStrip(state: GuidedState, now: Date = new Date()): WeekDay[] {
  const todayKey = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const key = dayKey(d);
    return {
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      done: state.player.days.includes(key),
      today: key === todayKey,
    };
  });
}
