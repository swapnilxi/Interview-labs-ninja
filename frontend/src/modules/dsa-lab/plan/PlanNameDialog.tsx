'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { NAME_MAX } from '../weekPlan';

/** The server's own wording, so a name refused here reads the same as one refused there. */
export const NAME_LENGTH_MESSAGE = `A plan name must be 1-${NAME_MAX} characters.`;

export interface PlanNameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  initialName: string;
  submitLabel: string;
  /** Button text while the request runs, e.g. "Saving…". */
  busyLabel: string;
  /** Shows the "Switch to it" checkbox, ticked or not. Leave out to hide it. */
  switchDefault?: boolean;
  /** A message when the (trimmed) name can't be used, checked before `onSubmit`; null when it can. */
  validate?: (name: string) => string | null;
  /** Runs with the trimmed name. Throwing shows the error's message inline (the server's 409 / 422 text). */
  onSubmit: (name: string, switchTo: boolean) => Promise<void>;
}

/**
 * Small "name this plan" dialog (save as, rename, duplicate). Mounted only while open, so every
 * opening starts from `initialName` and the dialog's own busy state.
 */
export default function PlanNameDialog(props: PlanNameDialogProps) {
  return props.isOpen ? <NameDialogBody {...props} /> : null;
}

function NameDialogBody({
  onClose,
  title,
  description,
  initialName,
  submitLabel,
  busyLabel,
  switchDefault,
  validate,
  onSubmit,
}: PlanNameDialogProps) {
  const titleId = useId();
  const descId = useId();
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

  const close = () => {
    if (!busy) onClose();
  };

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
      if (mounted.current) onClose();
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error && e.message ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={close}
      labelledBy={titleId}
      describedBy={description ? descId : undefined}
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
      backdropClassName="bg-black/35"
      className="dsa-type w-full max-w-sm rounded-xl border border-border bg-card shadow-lg"
    >
      <form onSubmit={submit} noValidate className="p-[1.25rem] sm:p-[1.5rem]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-heading text-base font-semibold leading-snug text-foreground"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descId}
                className="mt-1 leading-relaxed text-[13px] font-medium mix-text-foreground/[0.74]"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="todo-btn todo-btn-ghost -mr-1.5 -mt-1 h-8 w-8 shrink-0 px-0"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label htmlFor={inputId} className="text-xs font-semibold text-foreground">
              Plan name
            </label>
            <span aria-hidden className="text-xs tabular-nums text-muted-foreground">
              {name.trim().length}/{NAME_MAX}
            </span>
          </div>
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
            className="todo-input px-3 py-2 text-sm"
          />
          {error && (
            <p
              id={errorId}
              role="alert"
              className="mt-2 flex items-start gap-1.5 text-xs text-error"
            >
              <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>

        {switchDefault !== undefined && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
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

        <div className="mt-[1.5rem] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="todo-btn todo-btn-ghost px-3.5 py-2"
          >
            Cancel
          </button>
          <button type="submit" disabled={busy} className="todo-btn todo-btn-primary px-4 py-2">
            {busy && (
              <Icon name="ArrowPathIcon" size={14} className="shrink-0 motion-safe:animate-spin" />
            )}
            {busy ? busyLabel : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
