'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Autosave state for a dialog whose fields save one by one (on blur / on change).
 *
 * `run(key, save)` — `save` resolves `true` when it worked. A failed key stays failed, so the
 * indicator keeps saying "Couldn't save" until that field succeeds; another field saving fine
 * can't hide it. `retry()` re-runs everything that failed.
 *
 * Pass `{ retryable: false }` for controls that snap back to their old value on failure (selects,
 * date pickers): there is nothing to retry, so the error is shown briefly and then clears.
 */
export function useSaveStatus() {
  const [state, setState] = useState<SaveState>('idle');
  const [canRetry, setCanRetry] = useState(false);
  const transientError = useRef(false);
  const inFlight = useRef(0);
  const failed = useRef(new Map<string, () => Promise<boolean>>());
  const pending = useRef(new Set<Promise<boolean>>());
  // Bumped by reset(): a save that was in flight for the previous record must not touch the new one's state.
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const settle = useCallback(() => {
    clearTimer();
    const hasFailed = failed.current.size > 0;
    setCanRetry(hasFailed);
    if (hasFailed) {
      setState('error');
      return;
    }
    if (transientError.current) {
      transientError.current = false;
      setState('error');
      timer.current = setTimeout(() => setState('idle'), 4000);
      return;
    }
    setState('saved');
    timer.current = setTimeout(() => setState('idle'), 2000);
  }, []);

  const run = useCallback(
    (
      key: string,
      save: () => Promise<boolean>,
      options: { retryable?: boolean } = {}
    ): Promise<boolean> => {
      const { retryable = true } = options;
      const gen = generation.current;
      clearTimer();
      // A newer save of the same field supersedes an older failed one. Without this, "Retry" could
      // replay the old failed payload over what the user has typed since.
      failed.current.delete(key);
      inFlight.current += 1;
      setState('saving');
      const task = (async () => {
        let ok = false;
        try {
          ok = await save();
        } catch {
          ok = false;
        }
        if (gen !== generation.current) return ok; // reset() ran meanwhile: not this record's bookkeeping any more
        if (ok) failed.current.delete(key);
        else if (retryable) failed.current.set(key, save);
        else {
          failed.current.delete(key);
          transientError.current = true;
        }
        inFlight.current -= 1;
        if (inFlight.current === 0) settle();
        return ok;
      })();
      pending.current.add(task);
      void task.finally(() => pending.current.delete(task));
      return task;
    },
    [settle]
  );

  /**
   * For "save, then close": resolves once every save started so far has finished, and says whether
   * it is safe to close — `false` while a retryable save (a text field) is left failed.
   */
  const settled = useCallback(async (): Promise<boolean> => {
    await Promise.allSettled(Array.from(pending.current));
    return failed.current.size === 0;
  }, []);

  /** True while a retryable save is failed — the user has already been told. */
  const hasFailures = useCallback(() => failed.current.size > 0, []);

  const retry = useCallback(() => {
    for (const [key, save] of Array.from(failed.current.entries())) void run(key, save);
  }, [run]);

  /** Forget everything — call when the dialog is opened for another record. */
  const reset = useCallback(() => {
    clearTimer();
    generation.current += 1;
    failed.current.clear();
    pending.current.clear();
    transientError.current = false;
    inFlight.current = 0;
    setCanRetry(false);
    setState('idle');
  }, []);

  useEffect(() => clearTimer, []);

  return { state, canRetry, run, retry, reset, settled, hasFailures };
}

export function SaveIndicator({
  state,
  canRetry = true,
  onRetry,
}: {
  state: SaveState;
  /** False when the failed save already snapped the control back — nothing left to retry. */
  canRetry?: boolean;
  onRetry: () => void;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex min-h-[1rem] items-center text-xs"
    >
      {state === 'saving' && <span className="text-muted-foreground">Saving…</span>}
      {state === 'saved' && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Icon name="CheckIcon" size={12} className="text-success" aria-hidden="true" />
          Saved
        </span>
      )}
      {state === 'error' && (
        <span className="text-error">
          Couldn&apos;t save
          {canRetry && (
            <>
              {' '}
              ·{' '}
              <button
                type="button"
                onClick={onRetry}
                className="todo-focus rounded font-semibold underline"
              >
                Retry
              </button>
            </>
          )}
        </span>
      )}
    </span>
  );
}
