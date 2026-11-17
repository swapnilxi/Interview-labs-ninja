'use client';

import Icon from '@/components/ui/AppIcon';
import {
  SPRINT_WEEK_OPTIONS,
  type Feasibility,
  type PlanStyle,
  type SprintWeeks,
} from '@/lib/services/projectPlannerService';
import { sprintSlots } from './plannerDates';

/** How a timeline fits the work, going by the AI's check: too little time, much more than needed, or fine. */
export type TimelineFit = 'short' | 'wide' | null;

/** The fit the AI's verdict reports for the dates on screen (a verdict for other dates says nothing). */
export function timelineFit(
  feasibility: Feasibility | null,
  start: string,
  end: string
): TimelineFit {
  if (!feasibility) return null;
  const { checked_for: checked, verdict } = feasibility;
  if (checked.start_date !== start || checked.end_date !== end) return null;
  if (verdict === 'tight' || verdict === 'unrealistic') return 'short';
  if (verdict === 'generous') return 'wide';
  return null;
}

const COPY: Record<'short' | 'wide' | 'on' | 'current', { heading: string; body: string }> = {
  short: {
    heading: 'Not enough time for all of it? Work in sprints.',
    body: "The AI fills 1- or 2-week sprints with the most important work first, so every sprint ends with something usable. Whatever doesn't fit waits in a backlog.",
  },
  wide: {
    heading: 'More time than the work needs? Work in sprints.',
    body: 'The AI plans only as many 1- or 2-week sprints as the work takes, so you finish early instead of stretching the work across the whole timeline.',
  },
  on: {
    heading: 'Sprint mode',
    body: "The AI plans as many sprints as the work needs, inside your timeline. Whatever doesn't fit waits in a backlog.",
  },
  current: {
    heading: 'This plan is in sprint mode',
    body: 'Its sprints are sized to the work, so it can end before your timeline does. Try the other sprint length, or go back to phases that cover the whole timeline.',
  },
};

interface SprintModePanelProps {
  fit: TimelineFit;
  style: PlanStyle;
  weeks: SprintWeeks;
  start: string;
  end: string;
  disabled: boolean;
  onChange: (style: PlanStyle, weeks: SprintWeeks) => void;
  /**
   * 'choose' (Timeline step): picking a style only sets it, and the panel's own button writes the plan.
   * 'rewrite' (Plan step): picking a different style writes a new plan in it.
   */
  mode: 'choose' | 'rewrite';
  onWrite?: () => void;
  writing?: boolean;
  hasPlan?: boolean;
}

/**
 * The sprint mode offer: shown when the AI's timeline check finds the time too short or much longer than the work
 * needs, and kept on screen while sprint mode is on so it can be changed or turned off again.
 */
export default function SprintModePanel({
  fit,
  style,
  weeks,
  start,
  end,
  disabled,
  onChange,
  mode,
  onWrite,
  writing = false,
  hasPlan = false,
}: SprintModePanelProps) {
  const sprints = style === 'sprints';
  const copy = COPY[mode === 'rewrite' && sprints ? 'current' : (fit ?? 'on')];
  const room = sprintSlots(start, end, weeks).length;
  const headingId = `sprint-mode-${mode}`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border p-[1.25rem] mix-border-primary/[0.3] mix-bg-primary/[0.05]"
    >
      <div className="flex items-start gap-3">
        <span className="todo-icon-chip h-[2.25rem] w-[2.25rem] shrink-0" aria-hidden="true">
          <Icon name="ArrowPathRoundedSquareIcon" size={18} />
        </span>
        <div className="min-w-0">
          <h4 id={headingId} className="text-sm font-medium leading-snug text-foreground">
            {copy.heading}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div role="group" aria-label="Plan style" className="todo-segmented todo-segmented-accent">
          <button
            type="button"
            aria-pressed={!sprints}
            disabled={disabled}
            onClick={() => onChange('phases', weeks)}
            className="todo-segment px-3 py-1.5 text-sm font-medium"
          >
            Phases
          </button>
          {SPRINT_WEEK_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={sprints && weeks === n}
              disabled={disabled}
              onClick={() => onChange('sprints', n)}
              className="todo-segment px-3 py-1.5 text-sm font-medium"
            >
              {n}-week sprints
            </button>
          ))}
        </div>
        {sprints && room > 0 && (
          <p className="text-xs text-muted-foreground" role="status">
            Room for up to {room} {weeks}-week {room === 1 ? 'sprint' : 'sprints'} in this timeline.
          </p>
        )}
      </div>

      {mode === 'choose' && sprints && onWrite && (
        <button
          type="button"
          onClick={onWrite}
          disabled={disabled}
          className="todo-btn todo-btn-primary mt-4 px-4 py-2"
        >
          {writing ? (
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : (
            <Icon name="SparklesIcon" size={14} variant="solid" />
          )}
          {writing
            ? 'Writing the plan…'
            : hasPlan
              ? 'Write a new sprint plan'
              : 'Write the sprint plan'}
        </button>
      )}
      {mode === 'rewrite' && (
        <p className="mt-3 text-xs text-muted-foreground">
          Picking another style writes a new plan in it. The current plan is replaced.
        </p>
      )}
    </section>
  );
}
