'use client';

import Icon from '@/components/ui/AppIcon';
import type { LabName } from '@/lib/services/labSectionsService';
import { useLabProgress } from '@/modules/common/lab/useLabProgress';

/** "2026-10-18 07:38:11" (server, UTC) → "18 Oct 2026" in the viewer's locale. */
function completedOn(serverTime: string | null): string {
  if (!serverTime) return '';
  const d = new Date(serverTime.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A small green check for a page the user has completed; renders nothing otherwise, like the optional week pill. */
export function DoneMark({
  lab,
  topicId,
  subtopicId = '',
  className = '',
}: {
  lab: LabName;
  topicId: string;
  subtopicId?: string;
  className?: string;
}) {
  const progress = useLabProgress(lab);
  if (!progress.isDone(topicId, subtopicId)) return null;
  return (
    <span
      role="img"
      aria-label="Completed"
      title="Completed"
      className={`inline-flex flex-shrink-0 ${className}`}
    >
      <Icon name="CheckCircleIcon" variant="solid" size={13} className="text-emerald-500" />
    </span>
  );
}

/** Marks the open page (a topic, or one of its subtopics) as complete, and back. */
export function CompleteButton({
  lab,
  topicId,
  subtopicId = '',
  size = 'md',
}: {
  lab: LabName;
  topicId: string;
  subtopicId?: string;
  size?: 'md' | 'lg';
}) {
  const progress = useLabProgress(lab);
  const done = progress.isDone(topicId, subtopicId);
  const busy = progress.isPending(topicId, subtopicId);
  const error = progress.errorFor(topicId, subtopicId);
  const on = completedOn(progress.completedAt(topicId, subtopicId));
  const pad = size === 'lg' ? 'px-5 py-2.5 text-sm' : 'px-3 py-1.5 text-xs';
  return (
    <div className={`inline-flex flex-col gap-1 ${size === 'lg' ? 'items-center' : 'items-end'}`}>
      <button
        type="button"
        onClick={() => progress.toggle(topicId, subtopicId)}
        // Until the saved state has loaded the button can't know which way a click should go.
        disabled={busy || !progress.loaded}
        aria-pressed={done}
        title={
          done
            ? `${on ? `Completed on ${on}. ` : ''}Click to mark as not complete`
            : 'Mark this page as complete'
        }
        className={`flex items-center gap-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait ${pad} ${
          done
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
            : 'border-border text-foreground hover:bg-muted'
        }`}
      >
        <Icon
          name="CheckCircleIcon"
          variant={done ? 'solid' : 'outline'}
          size={size === 'lg' ? 16 : 14}
        />
        {done ? 'Completed' : 'Mark as complete'}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-error max-w-[260px] text-right">
          {error}
        </p>
      )}
    </div>
  );
}

/** "12 of 80 completed" with a bar, for a lab's Wiki. Counts topic pages only. */
export function LabProgressSummary({
  lab,
  topicIds,
  noun = 'topics',
}: {
  lab: LabName;
  topicIds: string[];
  noun?: string;
}) {
  const progress = useLabProgress(lab);
  const total = topicIds.length;
  const done = progress.countDone(topicIds);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div
      className="lab-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2"
      aria-label="Your progress"
    >
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Your progress
        </p>
        <p className="text-sm text-foreground">
          <span className="font-bold">{done}</span> of {total} {noun} completed
        </p>
      </div>
      <div
        className="flex-1 min-w-[120px] h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-label={`${done} of ${total} ${noun} completed`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}
