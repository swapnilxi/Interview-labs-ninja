/**
 * What every AI request tells the model: the problem, the learner, and where the question sits in the path.
 * Field names are the endpoints' (snake_case); the limits are theirs too (fe-apis/guidedPractice/handlers.ts), and the
 * values are clipped to them here so a long title never turns into a 422.
 */

import { COMPLETED_TITLES_LIMIT, PATH_TITLES_LIMIT } from './constants';
import { levelFor } from './xp';
import { ancestorsOf, childrenOf, overall, phaseOfQuestion, phaseTitles, progressOf } from './tree';
import type { GuidedState, Question, TopicRef } from './types';

const clip = (v: string | null | undefined, max: number) => (v ?? '').slice(0, max);

/** The learner's difficulty band, from their level on this topic. */
function band(level: number): string {
  if (level <= 2) return 'beginner';
  if (level <= 5) return 'intermediate';
  return 'advanced';
}

export function learnerLabel(state: GuidedState | null): string {
  if (!state) return '';
  const lv = levelFor(state.player.xp);
  return `Level ${lv.level} (${lv.title}), ${band(lv.level)}`;
}

/** The problem and the learner: sent with every AI request. */
export function baseFields(topic: TopicRef, state: GuidedState | null): Record<string, unknown> {
  let progress = '';
  let completed: string[] = [];
  if (state) {
    const o = overall(state);
    progress = `${o.requiredDone} of ${o.requiredTotal} main questions completed, ${o.completed} of ${o.total} questions in all, ${state.player.xp} XP, ${o.phasesDone} of ${o.phases} phases complete`;
    completed = Object.values(state.questions)
      .filter((q) => progressOf(state, q.id).completed)
      .sort((a, b) =>
        (progressOf(state, b.id).completedAt ?? '').localeCompare(
          progressOf(state, a.id).completedAt ?? ''
        )
      )
      .slice(0, COMPLETED_TITLES_LIMIT)
      .map((q) => clip(q.title, 300));
  }
  return {
    lab: topic.lab,
    topic_id: topic.id,
    topic_name: clip(topic.name, 300),
    topic_brief: clip(topic.brief, 2000),
    category: clip(topic.category, 200),
    difficulty: clip(topic.difficulty, 40),
    subtopic_name: clip(topic.subName, 300),
    subtopic_brief: clip(topic.subBrief, 2000),
    learner_level: clip(learnerLabel(state), 120),
    learner_progress: clip(progress, 800),
    completed_titles: completed,
  };
}

export function questionField(q: Question): Record<string, unknown> {
  return {
    title: clip(q.title, 400),
    objective: clip(q.objective, 800),
    kind: q.kind,
    difficulty: q.difficulty,
    why: clip(q.why, 800),
    relation: q.relation,
    level: q.level,
    angle: clip(q.angle, 40),
    wants_exercise: q.wantsExercise || !!q.content?.exercise,
    effort: clip(q.effort, 40),
  };
}

/** Where the question sits: its phase and the parent questions above it. */
export function positionFields(state: GuidedState, q: Question): Record<string, unknown> {
  const phase = phaseOfQuestion(state, q.id);
  return {
    phase_number: phase?.number ?? 0,
    phase_title: clip(phase?.title ?? (q.relation === 'boss' ? 'Final boss' : ''), 200),
    phase_goal: clip(phase?.goal, 500),
    ancestry_titles: ancestorsOf(state, q.id)
      .slice(-8)
      .map((a) => clip(a.title, 400)),
  };
}

/** Everything about one question the lesson, tutor and STAR endpoints share. */
export function questionFields(state: GuidedState, q: Question): Record<string, unknown> {
  return { question: questionField(q), ...positionFields(state, q) };
}

export function pathTitles(state: GuidedState, q: Question): string[] {
  return phaseTitles(state, q.phaseId)
    .filter((t) => t !== q.title)
    .slice(0, PATH_TITLES_LIMIT)
    .map((t) => clip(t, 300));
}

export function siblingTitles(state: GuidedState, q: Question): string[] {
  const parent = q.parentId ? state.questions[q.parentId] : null;
  const pool = parent
    ? [...childrenOf(state, parent.id, 'breakdown'), ...childrenOf(state, parent.id, 'deeper')]
    : (state.phases.find((p) => p.id === q.phaseId)?.questionIds ?? [])
        .map((id) => state.questions[id])
        .filter(Boolean);
  return pool
    .filter((s) => s.id !== q.id)
    .slice(0, 12)
    .map((s) => clip(s.title, 300));
}
