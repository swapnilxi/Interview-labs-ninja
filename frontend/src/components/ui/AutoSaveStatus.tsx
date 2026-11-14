'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { AutoSaveState } from '@/lib/ui/useAutoSave';

interface AutoSaveStatusProps {
  state: AutoSaveState;
  error?: string | null;
  onRetry?: () => void;
  /** Shown before the first edit, e.g. "Changes save automatically". */
  idleText?: string;
  /** Shown once saved, e.g. "Saved in this browser". */
  savedText?: string;
  className?: string;
}

/** The quiet line that replaces a Save button: what happened to the last edit. */
export default function AutoSaveStatus({
  state,
  error,
  onRetry,
  idleText = 'Changes save automatically',
  savedText = 'Saved',
  className = '',
}: AutoSaveStatusProps) {
  return (
    <span
      role={state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`inline-flex min-w-0 items-center gap-1.5 text-xs font-medium ${
        state === 'error' ? 'text-error' : 'text-muted-foreground'
      } ${className}`}
    >
      {state === 'pending' || state === 'saving' ? (
        <>
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Saving…
        </>
      ) : state === 'saved' ? (
        <>
          <Icon
            name="CheckCircleIcon"
            size={15}
            variant="solid"
            className="shrink-0 text-success"
          />
          {savedText}
        </>
      ) : state === 'error' ? (
        <>
          <Icon name="ExclamationCircleIcon" size={15} variant="solid" className="shrink-0" />
          <span className="min-w-0 truncate" title={error ?? undefined}>
            Couldn&apos;t save{error ? `: ${error}` : ''}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="todo-focus shrink-0 rounded-sm font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Retry
            </button>
          )}
        </>
      ) : (
        <>
          <Icon name="CloudArrowUpIcon" size={15} className="shrink-0" />
          {idleText}
        </>
      )}
    </span>
  );
}
