'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { DurationUnit, PlannerState } from '@/lib/services/projectPlannerService';
import FeasibilityCard from './FeasibilityCard';
import type { PlannerBusy } from './types';
import { addDays, daysBetween, durationOf, endFromDuration, formatRange, parseDay, todayLocal } from './plannerDates';

const PRESETS: { value: number; unit: DurationUnit; label: string }[] = [
  { value: 4, unit: 'weeks', label: '4 weeks' },
  { value: 8, unit: 'weeks', label: '8 weeks' },
  { value: 12, unit: 'weeks', label: '12 weeks' },
  { value: 3, unit: 'months', label: '3 months' },
  { value: 6, unit: 'months', label: '6 months' },
];

interface TimelineStepProps {
  state: PlannerState;
  busy: PlannerBusy;
  onChange: (patch: Partial<PlannerState>) => void;
  onCheck: () => void;
  onGenerate: () => void;
  onOpenPlan: () => void;
}

export default function TimelineStep({ state, busy, onChange, onCheck, onGenerate, onOpenPlan }: TimelineStepProps) {
  const { start_date: start, end_date: end, unit } = state;
  const days = daysBetween(start, end);
  const valid = days > 0;
  const derived = valid ? String(durationOf(start, end, unit)) : '';
  // While the number field is being typed in, show what was typed (it may be empty or half-finished).
  const [draft, setDraft] = useState<string | null>(null);

  const today = todayLocal();
  const locked = busy !== null;

  const setStart = (value: string) => {
    if (!parseDay(value)) return onChange({ start_date: '' });
    // Moving the start keeps the length of the plan: the end moves with it.
    onChange({ start_date: value, end_date: valid ? addDays(value, days - 1) : end && end >= value ? end : '' });
  };

  const setEnd = (value: string) => {
    if (!parseDay(value)) return onChange({ end_date: '' });
    onChange({ start_date: start || today, end_date: value < (start || today) ? start || today : value });
  };

  const setDuration = (raw: string) => {
    setDraft(raw);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return;
    const from = start || today;
    onChange({ start_date: from, end_date: endFromDuration(from, n, unit) });
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const from = start || today;
    setDraft(null);
    onChange({ start_date: from, end_date: endFromDuration(from, preset.value, preset.unit), unit: preset.unit });
  };

  const months = days / 30.4375;

  return (
    <section className="flex flex-col gap-[1rem]" aria-labelledby="planner-timeline-title">
      <div className="todo-glass flex flex-col gap-[1.25rem] p-[1.25rem] sm:p-[1.5rem]">
        <div>
          <h3 id="planner-timeline-title" className="font-heading text-base font-semibold text-foreground">When does it need to happen?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick the start and end dates, or the start and how long it should take. The AI will tell you whether the timeline is realistic
            before it writes the plan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Common durations">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Quick pick</span>
          {PRESETS.map((preset) => {
            const active = valid && unit === preset.unit && endFromDuration(start, preset.value, preset.unit) === end;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-pressed={active}
                className={`todo-btn todo-btn-quiet rounded-full px-3 py-1 ${active ? 'todo-btn-active' : ''}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-[1rem] sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <label htmlFor="planner-start" className="mb-1.5 block text-xs font-semibold text-foreground">Start date</label>
            <input id="planner-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="todo-input px-3 py-2 text-sm" />
          </div>

          <div>
            <label htmlFor="planner-duration" className="mb-1.5 block text-xs font-semibold text-foreground">Duration</label>
            <div className="flex gap-2">
              <input
                id="planner-duration"
                type="number"
                inputMode="numeric"
                min={1}
                max={unit === 'weeks' ? 260 : 60}
                value={draft ?? derived}
                onChange={(e) => setDuration(e.target.value)}
                onBlur={() => setDraft(null)}
                placeholder="–"
                className="todo-input w-[5.5rem] px-3 py-2 text-sm"
              />
              <select
                aria-label="Duration unit"
                value={unit}
                onChange={(e) => {
                  setDraft(null);
                  onChange({ unit: e.target.value === 'months' ? 'months' : 'weeks' });
                }}
                className="todo-input w-auto px-3 py-2 text-sm"
              >
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="planner-end" className="mb-1.5 block text-xs font-semibold text-foreground">End date</label>
            <input id="planner-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className="todo-input px-3 py-2 text-sm" />
          </div>
        </div>

        {valid ? (
          <p className="text-sm text-muted-foreground" role="status">
            <strong className="font-semibold text-foreground">{formatRange(start, end)}</strong> · {days} days · {(days / 7).toFixed(1)} weeks ·
            about {months.toFixed(1)} months
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Choose a start and an end date to continue.</p>
        )}

        {valid && start < today && (
          <p className="todo-alert todo-alert-warning" role="status">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" aria-hidden="true" />
            <span>The start date is in the past. That is fine if the work has already begun; the plan will still cover the whole range.</span>
          </p>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onCheck} disabled={!valid || locked} className="todo-btn todo-btn-secondary px-4 py-2">
            {busy === 'feasibility' ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            ) : (
              <Icon name="ScaleIcon" size={14} />
            )}
            {busy === 'feasibility' ? 'Checking…' : 'Is this timeline realistic?'}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {state.plan && (
              <button type="button" onClick={onOpenPlan} disabled={locked} className="todo-btn todo-btn-ghost px-3 py-2">
                Back to the plan
              </button>
            )}
            <button type="button" onClick={onGenerate} disabled={!valid || locked} className="todo-btn todo-btn-primary px-4 py-2">
              {busy === 'generate' ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
              ) : (
                <Icon name="SparklesIcon" size={14} variant="solid" />
              )}
              {busy === 'generate' ? 'Writing the plan…' : state.plan ? 'Write a new plan' : 'Write the plan'}
            </button>
          </div>
        </div>
      </div>

      {state.feasibility && (
        <FeasibilityCard
          feasibility={state.feasibility}
          startDate={start}
          endDate={end}
          onUseSuggestion={(value, suggestedUnit) => {
            const from = start || today;
            setDraft(null);
            onChange({ start_date: from, end_date: endFromDuration(from, value, suggestedUnit), unit: suggestedUnit });
          }}
        />
      )}
    </section>
  );
}
