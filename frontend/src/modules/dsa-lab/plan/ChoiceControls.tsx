'use client';

import { useId } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Form controls for the auto organizer: a radio-card group (real radio inputs, so arrow keys move the
 * choice) and a multi-select chip group (buttons with aria-pressed). Selected states use the Settings
 * accent (tint + ink); resting states stay neutral and share the lab's one hairline.
 */

const SELECTED_BORDER = 'mix-border-primary/55';

export function FieldHeading({
  id,
  title,
  hint,
  hintId,
  as: Tag = 'legend',
}: {
  id?: string;
  title: string;
  hint?: string;
  hintId?: string;
  as?: 'legend' | 'p';
}) {
  return (
    <>
      <Tag id={id} className="text-sm font-semibold text-foreground">
        {title}
      </Tag>
      {hint && (
        <p
          id={hintId}
          className="mt-0.5 leading-relaxed text-[13px] font-medium mix-text-foreground/[0.74]"
        >
          {hint}
        </p>
      )}
    </>
  );
}

export interface CardOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

export function RadioCards<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
  columns = 'sm:grid-cols-2',
}: {
  legend: string;
  hint?: string;
  /** The radio group's `name` (unique within the page). */
  name: string;
  options: readonly CardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Grid columns from `sm` up, e.g. "sm:grid-cols-3". */
  columns?: string;
}) {
  const hintId = useId();
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <FieldHeading title={legend} hint={hint} hintId={hintId} />
      <div className={`mt-3 grid grid-cols-1 gap-2 ${columns}`}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label key={o.value} className="relative block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={on}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={`flex h-full items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${
                  on
                    ? `${SELECTED_BORDER} lab-tint`
                    : 'mix-bg-foreground/[0.02] hover:mix-border-primary/40 hover:mix-bg-foreground/[0.05]'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    on ? 'border-primary' : 'border-muted-foreground'
                  }`}
                >
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-foreground">
                    {o.label}
                  </span>
                  <span className="mt-0.5 block leading-snug text-[13px] font-medium mix-text-foreground/[0.74]">
                    {o.hint}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface ChipItem {
  key: string;
  name: string;
  count: number;
}

export function ChipGroup({
  legend,
  hint,
  items,
  selected,
  onToggle,
  onClear,
  blocked,
  blockedReason,
}: {
  legend: string;
  hint?: string;
  items: readonly ChipItem[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  /** Chips that can't be newly picked here because they are chosen in a sibling group (a chip already picked stays toggleable). */
  blocked?: ReadonlySet<string>;
  /** Why they are muted, e.g. "Already under Emphasise". */
  blockedReason?: string;
}) {
  const hintId = useId();
  const picked = items.filter((it) => selected.has(it.key)).length;
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <FieldHeading title={legend} hint={hint} hintId={hintId} />
        </div>
        {picked > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="todo-btn todo-btn-ghost -mr-1.5 shrink-0 px-2 py-1"
          >
            {/* The visible text leads the accessible name ("Clear (2) emphasise choices"), so voice control can say it. */}
            Clear ({picked})<span className="sr-only"> {legend.toLowerCase()} choices</span>
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.has(it.key);
          const muted = !on && !!blocked?.has(it.key);
          return (
            <button
              key={it.key}
              type="button"
              aria-pressed={on}
              aria-disabled={muted ? true : undefined}
              aria-label={`${it.name}, ${it.count} question${it.count === 1 ? '' : 's'}${muted && blockedReason ? `. ${blockedReason}` : ''}`}
              title={muted ? blockedReason : undefined}
              onClick={() => {
                if (!muted) onToggle(it.key);
              }}
              className={`todo-focus inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? `${SELECTED_BORDER} lab-tint lab-ink`
                  : muted
                    ? 'cursor-not-allowed border-dashed mix-text-foreground/[0.6]'
                    : 'mix-text-foreground/[0.8] hover:mix-border-primary/40 hover:mix-bg-foreground/[0.05] hover:text-foreground'
              }`}
            >
              {on && <Icon name="CheckIcon" size={12} className="shrink-0" />}
              <span className="truncate">{it.name}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
