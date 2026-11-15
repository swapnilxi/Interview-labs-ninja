'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import AutoSaveStatus from '@/components/ui/AutoSaveStatus';
import type { AutoSaveState } from '@/lib/ui/useAutoSave';

interface SaveControlProps {
  state: AutoSaveState;
  error?: string | null;
  /** Saves everything right away; resolves to whether it worked. */
  onSave: () => Promise<boolean>;
  onRetry?: () => void;
  idleText?: string;
  savedText?: string;
  /** `inline`: status and button on one line (a bar). `stacked`: status above a full-width button (a side rail). */
  layout?: 'inline' | 'stacked';
  className?: string;
}

/**
 * The auto-save status plus an explicit Save button. Edits still save on their own; the button saves at once and
 * confirms it. It is filled while an edit is waiting (or failed) and quiet once everything is stored.
 */
export default function SaveControl({
  state,
  error,
  onSave,
  onRetry,
  idleText,
  savedText,
  layout = 'inline',
  className = '',
}: SaveControlProps) {
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  // A new edit replaces the "Saved" confirmation.
  useEffect(() => {
    if (state === 'pending') setConfirmed(false);
  }, [state]);

  const save = async () => {
    setBusy(true);
    const ok = await onSave().catch(() => false);
    setBusy(false);
    if (!ok) return;
    setConfirmed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setConfirmed(false), 2200);
  };

  const waiting = state === 'pending' || state === 'error';
  const stacked = layout === 'stacked';

  return (
    <div
      className={`${
        stacked
          ? 'flex flex-col items-stretch gap-2.5'
          : 'flex min-w-0 items-center justify-between gap-3'
      } ${className}`}
    >
      <AutoSaveStatus
        state={state}
        error={error}
        onRetry={onRetry}
        idleText={idleText}
        savedText={savedText}
        className={stacked ? 'px-1' : ''}
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        aria-keyshortcuts="Control+S Meta+S"
        title="Save now (Ctrl+S or Cmd+S)"
        className={`todo-btn ${waiting && !confirmed ? 'todo-btn-primary' : 'todo-btn-quiet'} h-9 shrink-0 px-[1.125rem] text-sm`}
      >
        {confirmed ? (
          <>
            <Icon name="CheckIcon" size={15} variant="solid" />
            Saved
          </>
        ) : busy ? (
          'Saving…'
        ) : (
          'Save'
        )}
      </button>
    </div>
  );
}
