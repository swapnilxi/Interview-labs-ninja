'use client';

import Icon from '@/components/ui/AppIcon';
import type { ProjectStatus } from '@/lib/services/labProjectsService';
import { LAB_CHIP, LAB_CHIP_ACCENT } from '@/modules/common/lab/WikiParts';

/**
 * Class strings shared by the Labs Project screens. The page sits in a `.lab-page` frame (see app/labs-project/page.tsx), so
 * every `border` here is the one lab hairline. Accent colour comes from the theme tokens (`bg-primary`, `lab-ink`, `mix-*-primary`),
 * so the Settings accent restyles all of it live. Controls are 8px (`rounded-md`), cards 12px (`rounded-lg`).
 */

export const primaryButton =
  'todo-focus inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

/** Secondary action: a soft fill, no outline. */
export const quietButton =
  'todo-focus inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors mix-bg-foreground/[0.06] hover:mix-bg-foreground/10 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Error-coloured text that holds 4.5:1 on its own tint: the raw `text-error` is 4.2:1 on `mix-bg-error/10` in the light theme.
 * (85% error + 15% text colour: 5.1:1 light, 5.7:1 dark.)
 */
export const errorInk =
  'text-[color:color-mix(in_srgb,var(--color-error)_85%,var(--color-foreground))]';

export const dangerButton = `todo-focus inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors mix-bg-error/10 hover:mix-bg-error/15 disabled:cursor-not-allowed disabled:opacity-50 ${errorInk}`;

/** Text input, select and textarea: hairline border, the accent focus glow (`todo-input`). */
export const fieldClass = 'todo-input rounded-md px-3 py-2 text-sm disabled:opacity-60';

/** Active is a soft emerald pill (semantic: it is live); Archived is the neutral pill. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  return status === 'archived' ? (
    <span className={`${LAB_CHIP} gap-1`}>
      <Icon name="ArchiveBoxIcon" size={12} />
      Archived
    </span>
  ) : (
    <span
      data-semantic="done"
      className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-[0.1875rem] text-xs font-medium leading-none text-emerald-800 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300"
    >
      Active
    </span>
  );
}

/** The lab a section was generated in, e.g. "DSA Lab": the accent pill (a chip, so a very long name may truncate). */
export function LabBadge({ name }: { name: string }) {
  return (
    <span className={`${LAB_CHIP_ACCENT} max-w-full gap-1`}>
      <Icon name="BeakerIcon" size={12} className="flex-shrink-0" />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

/** "Used by the labs": this project is the one the labs generate for. */
export function UsedBadge() {
  return (
    <span className={`${LAB_CHIP_ACCENT} gap-1`}>
      <Icon name="CheckIcon" size={12} />
      Used by the labs
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
    <div role="alert" className={`rounded-lg mix-bg-error/10 p-4 text-sm ${errorInk}`}>
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="todo-focus mt-2 rounded-sm font-semibold underline underline-offset-2"
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
    <div className="rounded-lg border border-dashed border-border bg-card px-5 py-[2.5rem] text-center">
      <div className="mx-auto flex h-[3rem] w-[3rem] items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="mt-3 font-heading text-base font-semibold text-foreground">{title}</h3>
      <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
