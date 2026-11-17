'use client';

import type { CSSProperties, ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import { LAB_PILL_BASE } from '@/modules/labs/common/LabTags';

/** Small pieces shared by the Guided Practice views. */

/** An accordion body: its height animates (styles/guided-practice.css, `.gp-collapse`) and, closed, it is `inert`. */
export function Collapse({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="gp-collapse" data-open={open}>
      <div className="gp-collapse-inner" inert={open ? undefined : true}>
        {children}
      </div>
    </div>
  );
}

/** A thin progress bar: the accent fill, success once complete. The fill is clipped by `--p`, so it animates without layout. */
export function ProgressBar({
  value,
  max,
  label,
  className = '',
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`gp-bar ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      data-complete={max > 0 && value >= max}
    >
      <span style={{ '--p': `${pct}%` } as CSSProperties} />
    </div>
  );
}

export function Spinner({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:[animation-duration:2.4s] ${className}`}
    />
  );
}

/** An error where it happened, with Retry when there is something to retry. */
export function InlineError({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div role="alert" className="todo-alert todo-alert-error items-start">
      <Icon name="ExclamationCircleIcon" size={16} variant="solid" className="mt-px shrink-0" />
      <p className="min-w-0 flex-1 break-words leading-snug">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="todo-focus shrink-0 rounded px-1 font-semibold underline-offset-2 hover:underline"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="todo-focus shrink-0 rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <Icon name="XMarkIcon" size={14} />
        </button>
      )}
    </div>
  );
}

/** Placeholder lines while something is written. */
export function SkeletonLines({ lines = 4, label }: { lines?: number; label: string }) {
  const widths = ['100%', '92%', '97%', '64%', '88%', '72%'];
  return (
    <div role="status" aria-label={label} className="space-y-2.5">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="gp-skeleton h-3.5" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  );
}

/** A section heading inside a card (sentence case, 14px 600). */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      {aside}
    </div>
  );
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A small neutral (or accent) label: a pattern family, an area, a count. The same pill the labs use for their meta chips. */
export function Tag({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent';
  children: ReactNode;
}) {
  return (
    <span
      className={`${LAB_PILL_BASE} px-2 py-[0.1875rem] text-xs ${
        tone === 'accent'
          ? 'lab-ink lab-tint mix-ring-primary/25'
          : 'mix-text-foreground/[0.78] mix-bg-foreground/[0.05] mix-ring-foreground/[0.1]'
      }`}
    >
      {children}
    </span>
  );
}

/** "#560": the LeetCode number in a DSA topic's brief ("LC #560 - Subarray Sum Equals K"); nothing for a topic without one. */
export function LcTag({ brief }: { brief: string }) {
  const n = /LC\s+#(\d+)/.exec(brief)?.[1];
  if (!n) return null;
  return (
    <span
      title={`LeetCode problem ${n}`}
      className={`${LAB_PILL_BASE} px-2 py-[0.1875rem] text-xs font-semibold tabular-nums mix-text-foreground/[0.78] mix-bg-foreground/[0.05] mix-ring-foreground/[0.1]`}
    >
      <span className="sr-only">LeetCode </span>#{n}
    </span>
  );
}
