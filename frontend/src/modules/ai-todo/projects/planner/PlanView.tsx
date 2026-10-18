'use client';

import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import type { DurationUnit, PlanPhase, PlannerState } from '@/lib/services/projectPlannerService';
import FeasibilityCard from './FeasibilityCard';
import type { PlannerBusy } from './types';
import { daysBetween, formatDay, formatRange, formatSpan } from './plannerDates';

const PHASE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#ef4444'];
const colorOf = (index: number) => PHASE_COLORS[index % PHASE_COLORS.length];

function PhaseTimeline({ phases, start, end }: { phases: PlanPhase[]; start: string; end: string }) {
  const total = daysBetween(start, end) || 1;
  return (
    <div className="todo-glass p-[1.25rem]">
      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Timeline</h4>
      <ol className="mt-3 flex flex-col gap-2">
        {phases.map((phase, index) => {
          const from = Math.max(0, daysBetween(start, phase.start_date) - 1);
          const length = Math.max(1, daysBetween(phase.start_date, phase.end_date));
          const left = Math.min(98.5, (from / total) * 100);
          const width = Math.min(100 - left, Math.max(1.5, (length / total) * 100));
          return (
            <li key={`${phase.name}-${index}`} className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
              <span className="truncate text-xs font-medium text-foreground" title={phase.name}>{phase.name}</span>
              <span className="relative h-[1.25rem] rounded-md" style={{ background: 'color-mix(in srgb, var(--color-foreground) 6%, transparent)' }}>
                <span
                  className="absolute inset-y-0 rounded-md"
                  style={{ left: `${left}%`, width: `${width}%`, background: colorOf(index) }}
                  title={`${formatRange(phase.start_date, phase.end_date)} · ${phase.duration}`}
                />
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{formatDay(start)}</span>
        <span>{formatDay(end)}</span>
      </div>
    </div>
  );
}

function Bullets({ title, items, check = false }: { title: string; items: string[]; check?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h5>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={`${i}-${item}`} className="flex items-start gap-2 text-sm leading-snug text-foreground">
            {check ? (
              <span className="mt-[0.3rem] h-3 w-3 shrink-0 rounded-[3px] border border-border" aria-hidden="true" />
            ) : (
              <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhaseCard({ phase, index }: { phase: PlanPhase; index: number }) {
  const color = colorOf(index);
  return (
    <article className="todo-glass overflow-hidden" style={{ borderLeft: `3px solid ${color}` }} aria-label={phase.name}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-[1.25rem] pb-2 pt-[1.25rem]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-[1.75rem] w-[1.75rem] shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ background: color }}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <h4 className="font-heading text-base font-semibold leading-snug text-foreground">{phase.name}</h4>
        </div>
        <p className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon name="CalendarDaysIcon" size={13} aria-hidden="true" />
          {formatRange(phase.start_date, phase.end_date)}
          {phase.duration && <span className="todo-chip bg-muted text-muted-foreground">{phase.duration}</span>}
        </p>
      </div>

      <div className="flex flex-col gap-[1rem] px-[1.25rem] pb-[1.25rem]">
        {phase.description && <p className="text-sm leading-relaxed text-muted-foreground">{phase.description}</p>}

        <div className="grid grid-cols-1 gap-[1rem] md:grid-cols-2">
          <Bullets title="Objectives" items={phase.objectives} />
          <Bullets title="Key tasks" items={phase.key_tasks} check />
          <Bullets title="Deliverables" items={phase.deliverables} />
          <Bullets title="Risks" items={phase.risks} />
        </div>

        {phase.milestone && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <FlatIcon name="trophy" size={16} className="mt-px shrink-0" />
            <span><span className="font-semibold">Milestone:</span> {phase.milestone}</span>
          </p>
        )}
      </div>
    </article>
  );
}

interface PlanViewProps {
  state: PlannerState;
  busy: PlannerBusy;
  /** Set after the plan was added to the project (so the button can say so). */
  appliedLabel: string | null;
  onCheck: () => void;
  onApply: () => void;
  onCopy: () => void;
  onEditTimeline: () => void;
  onUseSuggestion: (value: number, unit: DurationUnit) => void;
}

export default function PlanView({ state, busy, appliedLabel, onCheck, onApply, onCopy, onEditTimeline, onUseSuggestion }: PlanViewProps) {
  const plan = state.plan;
  if (!plan) return null;
  const window = state.plan_for ?? { start_date: state.start_date, end_date: state.end_date };
  const outOfSync = !!state.plan_for && (state.plan_for.start_date !== state.start_date || state.plan_for.end_date !== state.end_date) && !!state.start_date;
  const locked = busy !== null;
  const taskCount = plan.phases.reduce((sum, p) => sum + p.key_tasks.length, 0);

  return (
    <div className="flex min-w-0 flex-col gap-[1rem]">
      <section className="todo-glass flex flex-col gap-3 p-[1.25rem] sm:p-[1.5rem]" aria-labelledby="planner-plan-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="planner-plan-title" className="font-heading text-lg font-semibold text-foreground">Project plan</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatRange(window.start_date, window.end_date)} · {formatSpan(daysBetween(window.start_date, window.end_date))} · {plan.phases.length}{' '}
              {plan.phases.length === 1 ? 'phase' : 'phases'} · {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCopy} className="todo-btn todo-btn-secondary px-3 py-2">
              <Icon name="ClipboardDocumentIcon" size={14} /> Copy as Markdown
            </button>
            <button type="button" onClick={onApply} disabled={locked} className="todo-btn todo-btn-primary px-3 py-2">
              {busy === 'apply' ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <Icon name={appliedLabel ? 'CheckIcon' : 'PlusIcon'} size={14} />
              )}
              {busy === 'apply' ? 'Adding…' : appliedLabel ?? 'Add to project tasks'}
            </button>
          </div>
        </div>

        {outOfSync && (
          <div className="todo-alert todo-alert-warning" role="status">
            <Icon name="ClockIcon" size={14} className="mt-px shrink-0" aria-hidden="true" />
            <p className="flex-1 leading-relaxed">
              This plan was written for {formatRange(state.plan_for!.start_date, state.plan_for!.end_date)}, but the timeline is now{' '}
              {formatRange(state.start_date, state.end_date)}. Ask the AI to fit the plan to the new dates, or write a new plan.
            </p>
          </div>
        )}

        {plan.summary && <p className="text-sm leading-relaxed text-foreground">{plan.summary}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button type="button" onClick={onCheck} disabled={locked || !state.start_date} className="todo-btn todo-btn-quiet px-3 py-1.5">
            {busy === 'feasibility' ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            ) : (
              <Icon name="ScaleIcon" size={14} />
            )}
            {busy === 'feasibility' ? 'Checking…' : state.feasibility ? 'Check the timeline again' : 'Is this timeline realistic?'}
          </button>
          <button type="button" onClick={onEditTimeline} disabled={locked} className="todo-btn todo-btn-ghost px-3 py-1.5">
            <Icon name="CalendarDaysIcon" size={14} /> Change timeline
          </button>
        </div>
      </section>

      {state.feasibility && (
        <FeasibilityCard feasibility={state.feasibility} startDate={state.start_date} endDate={state.end_date} onUseSuggestion={onUseSuggestion} />
      )}

      <PhaseTimeline phases={plan.phases} start={window.start_date} end={window.end_date} />

      <div className="flex flex-col gap-[0.75rem]">
        {plan.phases.map((phase, index) => (
          <PhaseCard key={`${phase.name}-${index}`} phase={phase} index={index} />
        ))}
      </div>

      {(plan.assumptions.length > 0 || plan.risks.length > 0 || plan.success_metrics.length > 0) && (
        <div className="todo-glass flex flex-col gap-[1.25rem] p-[1.25rem]">
          <Bullets title="Assumptions" items={plan.assumptions} />
          {plan.risks.length > 0 && (
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Risks and how to handle them</h5>
              <ul className="mt-1.5 flex flex-col gap-2">
                {plan.risks.map((risk, i) => (
                  <li key={`${i}-${risk.risk}`} className="text-sm leading-snug text-foreground">
                    <span className="font-semibold">{risk.risk}</span>
                    {risk.mitigation && <span className="text-muted-foreground"> — {risk.mitigation}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Bullets title="Success metrics" items={plan.success_metrics} />
        </div>
      )}
    </div>
  );
}
