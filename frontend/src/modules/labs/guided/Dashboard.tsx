'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Rings from './Rings';
import { QuestionMeta } from './QuestionRow';
import { Switch } from './Switch';
import { setPref } from './prefs';
import { ProgressBar, plural } from './ui';
import { completedToday, levelFor, streakNow, weekStrip } from './xp';
import { overall, phaseOfQuestion, progressOf } from './tree';
import type { Prefs } from './prefs';
import type { GuidedState } from './types';

/** A number that counts up to its new value, so a reward is seen arriving (and is instant for reduced motion). */
function useCountUp(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (from.current === target) return;
    if (
      !enabled ||
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 650);
      setShown(Math.round(start + (target - start) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);
  return shown;
}

/** A stat card is a number: a label, the figure, and what it is out of. Nothing else. */
function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="gp-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold leading-none tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function LegendRow({
  ring,
  label,
  value,
  note,
}: {
  ring: 1 | 2 | 3;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="gp-dot self-center" data-ring={ring} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      </div>
      <p className="max-w-[9rem] text-right text-xs leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * The top of the page: the learner's numbers and the one next step. With Game mode on it is the three rings (path, today,
 * level), the week strip and the six numbers the page promises (phases, phases completed, questions completed, coding
 * exercises, XP, level); with it off, a quiet summary and the four numbers that are not a game. Either way the page's one
 * primary action is here: continue where the learner left off.
 */
export default function Dashboard({
  state,
  prefs,
  resumeId,
  onResume,
}: {
  state: GuidedState;
  prefs: Prefs;
  /** The question to continue with (null = the path is complete). */
  resumeId: string | null;
  onResume: (id: string) => void;
}) {
  const o = overall(state);
  const level = levelFor(state.player.xp);
  const xp = useCountUp(state.player.xp, prefs.celebrate);
  const streak = streakNow(state);
  const today = completedToday(state);
  const week = weekStrip(state);
  const resume = resumeId ? state.questions[resumeId] : null;
  const phase = resume ? phaseOfQuestion(state, resume.id) : null;
  const started = !!resume && (progressOf(state, resume.id).touchedAt !== null || o.completed > 0);
  const label = `Path ${o.percent} percent, today ${today} of ${prefs.dailyGoal} questions, level ${level.level} at ${level.pct} percent`;

  return (
    <section aria-label="Your progress" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Overview</h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          Game mode
          <Switch
            size="sm"
            checked={prefs.game}
            onChange={(v) => setPref('game', v)}
            label="Game mode: XP, levels, rings, streaks and badges"
          />
        </label>
      </div>

      <div className="gp-dash">
        {prefs.game ? (
          <div className="gp-card p-4 sm:p-[1.25rem]">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-[1.5rem]">
              <Rings
                path={o.percent / 100}
                today={prefs.dailyGoal ? today / prefs.dailyGoal : 0}
                level={level.next ? level.into / level.span : 1}
                levelNumber={level.level}
                label={label}
              />
              <div className="w-full min-w-0 flex-1 space-y-3">
                <LegendRow
                  ring={1}
                  label="Path"
                  value={`${o.percent}%`}
                  note={`${o.requiredDone} of ${o.requiredTotal} main questions`}
                />
                <LegendRow
                  ring={2}
                  label="Today"
                  value={`${today} of ${prefs.dailyGoal}`}
                  note={
                    today >= prefs.dailyGoal
                      ? 'Goal reached'
                      : `${plural(prefs.dailyGoal - today, 'question')} to go`
                  }
                />
                <LegendRow
                  ring={3}
                  label={`Level ${level.level} · ${level.title}`}
                  value={level.next ? `${level.into} / ${level.span} XP` : 'Top level'}
                  note={
                    level.next
                      ? `${level.toNext} XP to level ${level.next.level}`
                      : 'Nothing higher to reach'
                  }
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4">
              <ol
                className="flex items-center gap-2"
                aria-label="Coding exercises passed in the last seven days"
              >
                {week.map((d) => (
                  <li key={d.key} className="flex flex-col items-center gap-1">
                    <span className="gp-day" data-done={d.done} data-today={d.today} title={d.key}>
                      {d.done && <Icon name="CheckIcon" size={14} aria-hidden="true" />}
                      <span className="sr-only">
                        {d.key}: {d.done ? 'passed an exercise' : 'no exercise passed'}
                        {d.today ? ' (today)' : ''}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-xs text-muted-foreground">
                      {d.label}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="FireIcon" size={16} aria-hidden="true" />
                {streak > 0 ? (
                  <span>
                    <span className="font-semibold tabular-nums text-foreground">{streak}</span>-day
                    coding streak
                  </span>
                ) : (
                  <span>Pass an exercise to start a streak</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="gp-card p-4 sm:p-[1.25rem]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-muted-foreground">Path</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {o.requiredDone} of {o.requiredTotal} main questions
              </p>
            </div>
            <p className="mt-1 text-[2rem] font-semibold leading-none tabular-nums text-foreground">
              {o.percent}%
            </p>
            <ProgressBar
              value={o.requiredDone}
              max={o.requiredTotal}
              label={`Path: ${o.requiredDone} of ${o.requiredTotal} main questions`}
              className="mt-4"
            />
          </div>
        )}

        <div className="gp-card flex flex-col p-4 sm:p-[1.25rem]">
          <p className="text-xs text-muted-foreground">
            {resume ? (started ? 'Up next' : 'Start here') : 'Path complete'}
          </p>
          {resume ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {resume.relation === 'boss'
                  ? 'Final boss'
                  : phase
                    ? `Phase ${phase.number} · ${phase.title}`
                    : ''}
              </p>
              <h2 className="mt-1 text-base font-semibold leading-snug text-foreground">
                {resume.title}
              </h2>
              <div className="mt-2">
                <QuestionMeta q={resume} />
              </div>
              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={() => onResume(resume.id)}
                  className="todo-btn todo-btn-primary"
                >
                  {started ? 'Continue' : 'Start'}
                  <Icon name="ArrowRightIcon" size={14} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Every phase and the boss are done. Dive deeper into any question, or open one to
                review it.
              </p>
              {state.phases[0]?.questionIds[0] && (
                <div className="mt-auto pt-4">
                  <button
                    type="button"
                    onClick={() => onResume(state.phases[0].questionIds[0])}
                    className="todo-btn todo-btn-secondary"
                  >
                    Review from the start
                    <Icon name="ArrowRightIcon" size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="gp-stats" data-count={prefs.game ? 6 : 4}>
        <Stat label="Phases" value={o.phases} note="in this path" />
        <Stat label="Phases completed" value={o.phasesDone} note={`of ${o.phases}`} />
        <Stat label="Questions completed" value={o.completed} note={`of ${o.total} so far`} />
        <Stat
          label="Coding exercises"
          value={o.codingDone}
          note={o.codingTotal ? `of ${o.codingTotal} completed` : 'completed'}
        />
        {prefs.game && (
          <Stat
            label="XP earned"
            value={xp}
            note={level.next ? `${level.toNext} to level ${level.next.level}` : 'Top level reached'}
          />
        )}
        {prefs.game && <Stat label="Current level" value={level.level} note={level.title} />}
      </div>
    </section>
  );
}
