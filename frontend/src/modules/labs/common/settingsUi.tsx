import type { ReactNode } from 'react';

/**
 * The few pieces the lab settings screens share (the manager, the section editor): a preset chip, a labelled field and the
 * mono block that shows instructions. Quiet by default: the only colour is the one a selected chip carries, as a fill.
 */

/** A preset: a hairline outline at rest, a stronger neutral fill once it is in the text (the caller adds the check icon). */
export const presetChip = (on: boolean) =>
  `todo-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-left text-[13px] font-medium transition-colors ${
    on
      ? 'border-transparent bg-[var(--color-fill-strong)] text-foreground'
      : 'text-muted-foreground hover:bg-[var(--color-fill)] hover:text-foreground'
  }`;

/** Instructions and the assembled prompt: monospace on a soft fill, never an outlined box. */
export const monoBlock =
  'whitespace-pre-wrap rounded-xl bg-[var(--color-fill)] p-4 font-mono text-xs leading-relaxed text-foreground';

/** A textarea in the settings screens. */
export const settingsTextarea = 'todo-input w-full resize-y px-3 py-2 text-sm leading-relaxed';

export function Field({
  id,
  label,
  help,
  aside,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  /** Something quiet at the end of the label line (a counter). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        {aside}
      </div>
      {help && <p className="mt-0.5 text-[13px] text-muted-foreground">{help}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}
