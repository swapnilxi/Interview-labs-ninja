'use client';

import Icon from '@/components/ui/AppIcon';
import type { ProjectStatus } from '@/lib/services/labProjectsService';

export const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export const quietButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export const dangerButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border mix-border-error/40 bg-card px-3 py-2 text-sm font-medium text-error transition-colors hover:mix-bg-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export const fieldClass =
  'w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return status === 'archived' ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Icon name="ArchiveBoxIcon" size={12} />
      Archived
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      Active
    </span>
  );
}

/** The lab a section was generated in, e.g. "DSA Lab". */
export function LabBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
      <Icon name="BeakerIcon" size={12} className="flex-shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 py-[3rem] text-sm text-muted-foreground"
    >
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border mix-border-error/30 mix-bg-error/10 p-4 text-sm text-error"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 font-semibold underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-[2.5rem] text-center">
      <div className="mx-auto flex h-[3rem] w-[3rem] items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="mt-3 font-heading text-base font-semibold text-foreground">{title}</h3>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
