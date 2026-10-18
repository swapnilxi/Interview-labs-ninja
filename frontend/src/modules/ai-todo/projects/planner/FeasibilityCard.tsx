'use client';

import Icon from '@/components/ui/AppIcon';
import type { DurationUnit, Feasibility, Verdict } from '@/lib/services/projectPlannerService';
import { endFromDuration, formatDay } from './plannerDates';

const VERDICTS: Record<Verdict, { label: string; icon: string; badge: string; panel: string }> = {
  realistic: {
    label: 'Realistic',
    icon: 'CheckCircleIcon',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    panel: 'border-emerald-500/30 bg-emerald-500/5',
  },
  tight: {
    label: 'Tight',
    icon: 'ExclamationTriangleIcon',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    panel: 'border-amber-500/30 bg-amber-500/5',
  },
  unrealistic: {
    label: 'Unrealistic',
    icon: 'XCircleIcon',
    badge: 'bg-red-500/15 text-red-700 dark:text-red-300',
    panel: 'border-red-500/30 bg-red-500/5',
  },
  generous: {
    label: 'More time than needed',
    icon: 'InformationCircleIcon',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    panel: 'border-blue-500/30 bg-blue-500/5',
  },
};

export function VerdictBadge({ verdict, stale = false }: { verdict: Verdict; stale?: boolean }) {
  const meta = VERDICTS[verdict];
  return (
    <span className={`todo-chip ${meta.badge} ${stale ? 'opacity-60' : ''}`}>
      <Icon name={meta.icon} size={12} variant="solid" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

interface FeasibilityCardProps {
  feasibility: Feasibility;
  /** The dates on screen now: the verdict is only good for the dates it was given for. */
  startDate: string;
  endDate: string;
  onUseSuggestion: (value: number, unit: DurationUnit) => void;
}

export default function FeasibilityCard({ feasibility, startDate, endDate, onUseSuggestion }: FeasibilityCardProps) {
  const meta = VERDICTS[feasibility.verdict];
  const stale = feasibility.checked_for.start_date !== startDate || feasibility.checked_for.end_date !== endDate;
  const suggestion = feasibility.suggested_duration;
  const suggestedEnd = suggestion ? endFromDuration(startDate || feasibility.checked_for.start_date, suggestion.value, suggestion.unit) : '';

  return (
    <div className={`rounded-xl border p-[1.25rem] ${meta.panel}`} role="region" aria-label="AI timeline check">
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={feasibility.verdict} stale={stale} />
        <span className="text-xs font-semibold text-muted-foreground">AI timeline check{feasibility.with_plan ? ' · based on the written plan' : ''}</span>
      </div>

      {stale && (
        <p className="todo-alert todo-alert-warning mt-3" role="status">
          <Icon name="ClockIcon" size={14} className="mt-px shrink-0" aria-hidden="true" />
          <span>The dates changed after this check. Run it again to see how the new timeline looks.</span>
        </p>
      )}

      <div className={stale ? 'opacity-60' : ''}>
        <p className="mt-3 text-sm font-semibold leading-snug text-foreground">{feasibility.headline}</p>
        {feasibility.reasoning && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feasibility.reasoning}</p>}

        {feasibility.concerns.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Concerns</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {feasibility.concerns.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <Icon name="ExclamationCircleIcon" size={14} className="mt-[0.2rem] shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {feasibility.recommendations.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What the AI would do</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {feasibility.recommendations.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                  <Icon name="LightBulbIcon" size={14} className="mt-[0.2rem] shrink-0 text-primary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {suggestion && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <p className="min-w-0 flex-1 text-sm text-foreground">
            Suggested: <strong>{suggestion.value} {suggestion.value === 1 ? suggestion.unit.slice(0, -1) : suggestion.unit}</strong>
            {suggestedEnd && <span className="text-muted-foreground"> — finishing {formatDay(suggestedEnd)}</span>}
          </p>
          <button type="button" onClick={() => onUseSuggestion(suggestion.value, suggestion.unit)} className="todo-btn todo-btn-secondary px-3 py-2">
            Use this timeline
          </button>
        </div>
      )}
    </div>
  );
}
