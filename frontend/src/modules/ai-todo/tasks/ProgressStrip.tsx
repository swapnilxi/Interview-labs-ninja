'use client';

import Icon from '@/components/ui/AppIcon';
import type { TodoStats } from '@/lib/services/todoService';

/**
 * Tasks to finish in a day. It is not stored anywhere (no setting, no API field), so this is the one place to change
 * it. The strip takes it as a prop and copes with 0 / missing, so it never divides by it blindly.
 */
export const DEFAULT_DAILY_TARGET = 3;

/** Same height in every state (numbers, placeholder, "unavailable"), so the list below never jumps when stats arrive. */
const ROW = 'flex min-h-[2rem] flex-wrap items-center gap-x-[1.75rem] gap-y-2';

// One accent per metric, by meaning: blue = today's progress, green = a streak and a reached target, cyan = the week.
// A zero is shown in the muted text colour, not the accent: nothing done yet is a calm state, not a missing one.
const TONE = {
  progress: { figure: 'mix-text-progress', track: 'mix-bg-progress/20', fill: 'mix-bg-progress' },
  success: { figure: 'text-success', track: 'mix-bg-success/20', fill: 'bg-success' },
  info: { figure: 'mix-text-info', track: 'mix-bg-info/20', fill: 'mix-bg-info' },
} as const;

const FIGURE = 'font-heading text-lg font-semibold leading-none tabular-nums';
const CAPTION = 'text-xs text-muted-foreground';

interface ProgressStripProps {
  /** `null` until the first load finishes (or when it failed with nothing earlier to show). */
  stats: TodoStats | null;
  /** The load failed and there are no earlier numbers: say so, rather than show zeros that would look real. */
  failed?: boolean;
  onRetry?: () => void;
  dailyTarget?: number;
}

/** A non-negative whole number, whatever the API sent. */
const count = (value: unknown): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Today / streak / last 7 days as one quiet line. No tiles and no outlines: the figure is the strongest thing, its label
 * sits right beside it, and the space between metrics does the separating. Real numbers only (from `/todo/stats`).
 */
export default function ProgressStrip({ stats, failed = false, onRetry, dailyTarget = DEFAULT_DAILY_TARGET }: ProgressStripProps) {
  if (!stats) {
    return failed ? (
      <p role="status" className="flex min-h-[2rem] flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>Progress isn&apos;t available right now.</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="todo-focus rounded font-medium text-primary hover:underline">
            Try again
          </button>
        )}
      </p>
    ) : (
      <div role="status" aria-label="Loading your progress" aria-busy="true" className={ROW}>
        {['w-[7.5rem]', 'w-[5.5rem]', 'w-[11.5rem]'].map(width => (
          <span key={width} className={`block h-[1.25rem] rounded-md mix-bg-foreground/[0.06] motion-safe:animate-pulse ${width}`} />
        ))}
      </div>
    );
  }

  const completed = count(stats.completed_today);
  const streak = count(stats.streak);
  const week = (stats.last_7_days || []).map(count);
  const weekTotal = week.reduce((sum, n) => sum + n, 0);

  const target = Number.isFinite(dailyTarget) && dailyTarget > 0 ? Math.floor(dailyTarget) : 0;
  const hasTarget = target > 0;
  const targetHit = hasTarget && completed >= target;
  const remaining = hasTarget ? Math.max(0, target - completed) : 0;
  // The bar fills in proportion and stops at the end: finishing more than the target does not push it past full.
  const fill = hasTarget ? Math.min(1, completed / target) : 0;
  const todayTone = targetHit ? TONE.success : TONE.progress;

  return (
    <div role="group" aria-label="Your progress" className={ROW}>
      <div
        className="flex items-center gap-2"
        title={!hasTarget ? undefined : targetHit ? 'Daily target reached — nice work.' : `${remaining} more to hit your daily goal`}
      >
        <span className={`${CAPTION} font-medium`}>Today</span>
        <span className="flex items-baseline gap-1">
          <span className={`${FIGURE} ${completed > 0 ? todayTone.figure : 'text-muted-foreground'}`}>{completed}</span>
          {hasTarget && <span className={`${CAPTION} tabular-nums`}>/ {target}</span>}
        </span>
        {hasTarget && (
          <div
            className={`h-1 w-[3.5rem] overflow-hidden rounded-full sm:w-[4.5rem] ${todayTone.track}`}
            role="progressbar"
            aria-label="Daily target progress"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(completed, target)}
            aria-valuetext={targetHit ? `${completed} of ${target}, target reached` : `${completed} of ${target}, ${remaining} to go`}
          >
            <div className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${todayTone.fill}`} style={{ width: `${fill * 100}%` }} />
          </div>
        )}
        {targetHit && (
          <>
            <Icon name="CheckCircleIcon" size={16} variant="solid" className="shrink-0 text-success" aria-hidden="true" />
            <span className="sr-only">Daily target reached</span>
          </>
        )}
      </div>

      <div
        className="flex items-center gap-2"
        title={
          streak === 0
            ? 'Complete a task today to start a streak.'
            : completed > 0
              ? "You're on track today — keep it going."
              : 'Complete a task today to keep your streak alive.'
        }
      >
        <span className={`${CAPTION} font-medium`}>Streak</span>
        <span className="flex items-baseline gap-1">
          <span className={`${FIGURE} ${streak > 0 ? TONE.success.figure : 'text-muted-foreground'}`}>{streak}</span>
          <span className={CAPTION}>{streak === 1 ? 'day' : 'days'}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className={`${CAPTION} font-medium`}>Last 7 days</span>
        <span className="flex items-baseline gap-1">
          <span className={`${FIGURE} ${weekTotal > 0 ? TONE.info.figure : 'text-muted-foreground'}`}>{weekTotal}</span>
          <span className={CAPTION}>done</span>
        </span>
        {week.length > 0 && <WeekBars counts={week} labels={stats.last_7_dates || []} />}
      </div>
    </div>
  );
}

/**
 * Seven small bars, oldest to today, each with its day's initial underneath. A day with nothing recorded is a short
 * neutral stub (never an invented count); today is the full-strength cyan bar with a brighter initial, no outline.
 */
function WeekBars({ counts, labels }: { counts: number[]; labels: string[] }) {
  const max = Math.max(...counts, 1);
  const name = (i: number) => labels[i] || `Day ${i + 1}`;
  const summary = counts.map((n, i) => `${name(i)}: ${n}`).join(', ');

  return (
    <div className="ml-1 flex items-end gap-[0.5rem]" role="img" aria-label={`Tasks completed per day, oldest to today. ${summary}`}>
      {counts.map((n, i) => {
        const isToday = i === counts.length - 1;
        return (
          <div key={i} className="flex flex-col items-center gap-[2px]" title={`${name(i)}: ${n} done`} aria-hidden="true">
            <div className="flex h-4 w-2 items-end">
              <div
                className="w-full rounded-[2px] transition-colors"
                style={{
                  height: n > 0 ? `${Math.max(25, (n / max) * 100)}%` : '3px',
                  background:
                    n === 0
                      ? 'color-mix(in srgb, var(--color-foreground) 20%, transparent)'
                      : isToday
                        ? 'var(--color-info)'
                        : 'color-mix(in srgb, var(--color-info) 45%, transparent)',
                }}
              />
            </div>
            <span className={`text-xs leading-none ${isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {name(i).charAt(0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
