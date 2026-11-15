'use client';

import { useMemo } from 'react';
import {
  blockCount,
  blockLabel,
  blockWeeks,
  WEEK_CAP,
  weekQuestions,
  weekTheme,
  type PlanTopic,
  type RankFn,
  type WeekPlan,
} from '../weekPlan';

/**
 * A compact read-only look at a plan, in blocks of four weeks: each week's number, focus label,
 * count and its first few question names. Used by the auto organizer's result step.
 */
export default function PlanPreview({
  plan,
  topics,
  rank,
  namesShown = 3,
}: {
  plan: WeekPlan;
  topics: readonly PlanTopic[];
  rank: RankFn;
  namesShown?: number;
}) {
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const blocks = useMemo(
    () =>
      Array.from({ length: blockCount(plan.weeks) }, (_, b) => {
        const weeks = blockWeeks(b, plan.weeks).map((week) => {
          const ids = weekQuestions(plan, week, rank);
          const topicsInWeek = ids
            .map((id) => byId.get(id))
            .filter((t): t is PlanTopic => t !== undefined);
          const label = plan.labels[String(week)] || weekTheme(topicsInWeek.map((t) => t.category));
          return { week, label, count: ids.length, names: topicsInWeek.map((t) => t.name) };
        });
        return {
          label: blockLabel(b, plan.weeks),
          weeks,
          total: weeks.reduce((n, w) => n + w.count, 0),
        };
      }),
    [plan, rank, byId]
  );

  return (
    <div className="space-y-5">
      {blocks.map((block) => (
        <section key={block.label} aria-label={`${block.label}, ${block.total} questions`}>
          <div className="mb-2 flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <h4 className="dsa-caption mix-text-foreground/[0.74]">{block.label}</h4>
            <span className="text-xs font-medium tabular-nums mix-text-foreground/[0.74]">
              {block.total} question{block.total === 1 ? '' : 's'}
            </span>
          </div>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {block.weeks.map((w) => {
              const shown = w.names.slice(0, namesShown);
              const more = w.names.length - shown.length;
              return (
                <li key={w.week} className="rounded-lg border px-3.5 py-3 mix-bg-foreground/[0.02]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="dsa-heading shrink-0 text-xs font-semibold lab-ink">
                      Week {w.week}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${
                        w.count >= WEEK_CAP
                          ? 'font-semibold text-foreground'
                          : 'font-medium mix-text-foreground/[0.74]'
                      }`}
                    >
                      {w.count}/{WEEK_CAP}
                    </span>
                  </div>
                  {/* Its own line, and it wraps: a focus label is a name, never cut with an ellipsis. */}
                  <p
                    className="mt-0.5 break-words text-[13px] font-medium leading-snug mix-text-foreground/[0.74]"
                    title={w.label || undefined}
                  >
                    {w.label}
                  </p>
                  <p
                    className={`mt-1 break-words text-[13px] font-medium leading-relaxed ${
                      shown.length ? 'text-foreground' : 'mix-text-foreground/[0.74]'
                    }`}
                  >
                    {shown.length ? shown.join(', ') : 'No questions this week'}
                    {more > 0 && (
                      <span className="mix-text-foreground/[0.74]"> and {more} more</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
