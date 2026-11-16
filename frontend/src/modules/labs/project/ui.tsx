'use client';

import Icon from '@/components/ui/AppIcon';
import type { ProjectStatus } from '@/lib/services/labProjectsService';
import { LAB_CHIP, LAB_CHIP_ACCENT } from '@/modules/labs/common/WikiParts';

/**
 * Class strings shared by the Labs Project screens. The page sits in a `.lab-page` frame (see app/labs-project/page.tsx), so
 * every `border` here is the one lab hairline. Accent colour comes from the theme tokens (`bg-primary`, `lab-ink`, `mix-*-primary`),
 * so the Settings accent restyles all of it live. Controls use the app-wide `todo-btn` capsule system (iOS style).
 */

/** Primary CTA: filled capsule using the accent colour, `todo-btn` base. */
export const primaryButton = 'todo-btn todo-btn-primary';

/** Secondary action: outlined capsule. */
export const quietButton = 'todo-btn todo-btn-secondary';

/**
 * Error-coloured text that holds 4.5:1 on its own tint: the raw `text-error` is 4.2:1 on `mix-bg-error/10` in the light theme.
 * (85% error + 15% text colour: 5.1:1 light, 5.7:1 dark.)
 */
export const errorInk =
  'text-[color:color-mix(in_srgb,var(--color-error)_85%,var(--color-foreground))]';

/** Danger action: soft error tint capsule. */
export const dangerButton = `todo-btn mix-bg-error/10 hover:mix-bg-error/15 ${errorInk}`;

/** Text input, select and textarea: rounded-[12px] iOS field, the accent focus glow (`todo-input`). */
export const fieldClass = 'todo-input px-3 py-2 text-sm disabled:opacity-60';

/** Active is a soft emerald pill (semantic: it is live); Archived is the neutral pill. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  return status === 'archived' ? (
    <span className={`${LAB_CHIP} gap-1`}>
      <Icon name="ArchiveBoxIcon" size={11} />
      Archived
    </span>
  ) : (
    <span
      data-semantic="done"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-[0.1875rem] text-xs font-semibold leading-none text-emerald-800 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300"
    >
      <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
      Active
    </span>
  );
}

/** The lab a section was generated in, e.g. "DSA Lab": the accent pill (a chip, so a very long name may truncate). */
export function LabBadge({ name }: { name: string }) {
  return (
    <span className={`${LAB_CHIP_ACCENT} max-w-full gap-1`}>
      <Icon name="BeakerIcon" size={11} className="flex-shrink-0" />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

/** "Used by the labs": this project is the one the labs generate for. */
export function UsedBadge() {
  return (
    <span className={`${LAB_CHIP_ACCENT} gap-1`}>
      <Icon name="BoltIcon" size={11} />
      In use
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
      className="flex items-center justify-center gap-3 py-[4rem] text-sm text-muted-foreground"
    >
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-2xl mix-bg-error/10 p-4 text-sm ${errorInk}`}>
      <Icon name="ExclamationCircleIcon" size={18} className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="todo-focus mt-1.5 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        )}
      </div>
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
    <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-[3rem] text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl lab-tint">
        <Icon name={icon} size={26} className="lab-ink" />
      </div>
      <h3 className="mt-4 font-heading text-base font-semibold text-foreground">{title}</h3>
      <div className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
