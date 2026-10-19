'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { NAME_MAX } from '../weekPlan';
import { NAME_LENGTH_MESSAGE } from './PlanNameDialog';

/**
 * A plan name typed in place (inside the auto organizer's result): Enter saves, Escape cancels
 * without closing the dialog around it. Errors from `onSubmit` (the server's 409 / 422 text) show
 * inline under the field.
 */
export default function InlineNameForm({
  label,
  initialName,
  submitLabel,
  busyLabel,
  switchDefault,
  validate,
  onSubmit,
  onCancel,
}: {
  label: string;
  initialName: string;
  submitLabel: string;
  busyLabel: string;
  /** Shows a "Switch to it" checkbox, ticked or not. Leave out to hide it. */
  switchDefault?: boolean;
  validate?: (name: string) => string | null;
  onSubmit: (name: string, switchTo: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [switchTo, setSwitchTo] = useState(switchDefault ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    const problem =
      trimmed.length < 1 || trimmed.length > NAME_MAX
        ? NAME_LENGTH_MESSAGE
        : (validate?.(trimmed) ?? null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed, switchTo);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-lg border p-3.5 mix-bg-foreground/[0.03]">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-foreground">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={inputId}
          type="text"
          autoFocus
          value={name}
          maxLength={NAME_MAX}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || busy) return;
            e.preventDefault(); // keep the dialog around the form open
            onCancel();
          }}
          className="todo-input min-w-0 flex-1 px-3 py-2 text-sm"
        />
        <div className="flex shrink-0 items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="todo-btn todo-btn-ghost px-3 py-2"
          >
            Cancel
          </button>
          <button type="submit" disabled={busy} className="todo-btn todo-btn-primary px-3.5 py-2">
            {busy && (
              <Icon name="ArrowPathIcon" size={14} className="shrink-0 motion-safe:animate-spin" />
            )}
            {busy ? busyLabel : submitLabel}
          </button>
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-error">
          <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {switchDefault !== undefined && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={switchTo}
            disabled={busy}
            onChange={(e) => setSwitchTo(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Switch to it</span>
            <span className="block text-[13px] font-medium mix-text-foreground/[0.74]">
              Show this plan in the week view right away.
            </span>
          </span>
        </label>
      )}
    </form>
  );
}
