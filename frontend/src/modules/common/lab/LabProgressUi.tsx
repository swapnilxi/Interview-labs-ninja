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

/**
 * A small green check for a page the user has completed; renders nothing otherwise, like the optional week pill.
 * Green here means "done", not "interactive", so it stays emerald whatever the Settings accent is (`data-semantic="done"`
 * lets the accent-leak scan skip it).
 */
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
      data-semantic="done"
      className={`inline-flex flex-shrink-0 ${className}`}
    >
      <Icon name="CheckCircleIcon" variant="solid" size={13} className="text-emerald-500" />
    </span>
  );
}

/**
 * Marks the open page (a topic, or one of its subtopics) as complete, and back. At rest it is a neutral outline button;
 * once done it turns green (a semantic "done" colour, not the accent). The light text is emerald-800: -600 is 2.7:1 and
 * -700 is 4.0-4.6:1 on the done tint, -800 is >= 5.6:1.
 */
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
        data-semantic={done ? 'done' : undefined}
        className={`todo-focus flex items-center gap-1.5 rounded-lg border font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${pad} ${
          done
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-400'
            : 'border-border text-foreground hover:mix-bg-muted'
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
        <p role="alert" className="max-w-[260px] text-right text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * "12 of 80 questions completed" as ONE line with a bar: the progress row inside a lab's wiki hero (`WikiHero` children), so
 * it has no card, border or shadow of its own. The bar is the Settings accent (`bg-primary`); the green check on a finished
 * page (`DoneMark`) is a different, semantic job. Counts topic pages only. Text on the hero's wash uses the foreground mix,
 * not `text-muted-foreground` (that fails contrast on the tint).
 */
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
      role="group"
      aria-label="Your progress"
      className="flex flex-wrap items-center gap-x-[0.75rem] gap-y-[0.5rem]"
    >
      <p className="flex-shrink-0 text-[13px] font-medium mix-text-foreground/[0.74]">
        <span className="font-semibold tabular-nums text-foreground">{done}</span> of {total} {noun}{' '}
        completed
      </p>
      <div
        className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full mix-bg-foreground/10"
        role="progressbar"
        aria-label={`${done} of ${total} ${noun} completed`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 flex-shrink-0 text-right text-xs font-semibold tabular-nums mix-text-foreground/[0.74]">
        {pct}%
      </span>
    </div>
  );
}
