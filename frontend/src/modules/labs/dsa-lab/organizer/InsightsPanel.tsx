'use client';

import Icon from '@/components/ui/AppIcon';
import type { Insight } from '../weekPlan';

const TONE: Record<Insight['tone'], { dot: string; sr: string }> = {
  warning: { dot: 'bg-warning', sr: 'Needs attention: ' },
  info: { dot: 'bg-primary', sr: 'Note: ' },
  success: { dot: 'bg-success', sr: 'Done: ' },
};

/**
 * Collapsible strip of plain-sentence observations about the plan (from `weekPlan.insights`), each
 * with its action: fill an empty week, spread the load evenly, or jump to the week it is about.
 * A plain hairline card (no glow, no glass). It sizes its columns to what it has to say: one insight is one column, however
 * wide the board is.
 */
export default function InsightsPanel({
  insights,
  open,
  onToggle,
  onAction,
  onOpenWeek,
  columns,
  busy,
}: {
  insights: Insight[];
  open: boolean;
  onToggle: () => void;
  /** Runs an insight's own action (fill / spread / open-week). */
  onAction: (insight: Insight) => void;
  /** "Go to week N" for insights that name a week but carry no action. */
  onOpenWeek: (week: number) => void;
  /** 1, 2 or 3 columns, from the board width. */
  columns: 1 | 2 | 3;
  busy: boolean;
}) {
  const warnings = insights.filter((i) => i.tone === 'warning').length;
  const used = Math.max(1, Math.min(columns, insights.length));
  const grid = used === 3 ? 'grid-cols-3' : used === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <section aria-labelledby="org-insights-title" className="rounded-lg border bg-card">
      <h2 className="text-base">
        <button
          id="org-insights-title"
          type="button"
          aria-expanded={open}
          aria-controls="org-insights-body"
          onClick={onToggle}
          className="todo-focus flex w-full items-center gap-2.5 rounded-lg px-4 py-3 text-left"
        >
          <Icon name="LightBulbIcon" size={16} className="shrink-0 text-primary" />
          <span className="text-sm font-semibold text-foreground">Insights</span>
          <span className="text-xs tabular-nums text-muted-foreground">{insights.length}</span>
          {!open && warnings > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
              {warnings === 1 ? '1 to look at' : `${warnings} to look at`}
            </span>
          )}
          <Icon
            name="ChevronDownIcon"
            size={16}
            className={`ml-auto shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {open && (
        <ul
          id="org-insights-body"
          className={`grid ${grid} gap-x-[1.75rem] gap-y-4 border-t px-4 pb-4 pt-3.5`}
        >
          {insights.map((insight) => {
            const tone = TONE[insight.tone];
            const action = insight.action;
            return (
              <li key={insight.id} className="flex min-w-0 gap-2.5">
                <span
                  aria-hidden
                  className={`mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-snug text-foreground">
                    <span className="sr-only">{tone.sr}</span>
                    {insight.title}
                  </p>
                  <p className="mt-1 text-[13px] font-medium leading-relaxed mix-text-foreground/[0.74]">
                    {insight.detail}
                  </p>
                  {action ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAction(insight)}
                      className="todo-btn todo-btn-quiet mt-2 px-2.5 py-1"
                    >
                      {action.label}
                    </button>
                  ) : (
                    insight.week !== undefined && (
                      <button
                        type="button"
                        onClick={() => onOpenWeek(insight.week as number)}
                        className="todo-btn todo-btn-ghost -ml-2 mt-1.5 px-2 py-1"
                      >
                        Go to week {insight.week}
                        <Icon name="ArrowRightIcon" size={12} />
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
