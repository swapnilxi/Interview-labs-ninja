'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutoSave<T> {
  state: AutoSaveState;
  /** The last failure's message (state === 'error'). */
  error: string | null;
  /** Call on every user edit with the new value; it is saved once edits pause for `delay` ms. */
  schedule: (value: T) => void;
  /** Save a pending value now (Enter in a field, before generating, before closing a dialog); resolves to whether
   *  the last save worked. */
  flush: () => Promise<boolean>;
  /** Save the last value again after an error. */
  retry: () => void;
  /** Save this value right away (an explicit Save button, Ctrl/⌘+S); resolves to whether that save worked. */
  saveNow: (value: T) => Promise<boolean>;
}

/**
 * Settings forms that save themselves: every change is saved shortly after the user stops typing. A form may also
 * offer a Save button (`saveNow`) for people who want to confirm it; both go through the same ordered queue.
 *
 * - Only edits passed to `schedule` are saved (never the initial load), the latest value wins, and saves run
 *   one at a time in order, so a slow request can't overwrite a newer one.
 * - A pending save is flushed when the page is hidden or the component unmounts, so leaving right after
 *   typing loses nothing.
 * - `save` may change between renders; the latest one is used.
 */
export function useAutoSave<T>(
  save: (value: T) => Promise<unknown> | unknown,
  delay = 600
): AutoSave<T> {
  const [state, setState] = useState<AutoSaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<{ value: T } | null>(null);
  const lastValue = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const lastOk = useRef(true);

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    if (!next) return chain.current.then(() => lastOk.current);
    pending.current = null;
    lastValue.current = next;
    setState('saving');
    chain.current = chain.current.then(async () => {
      try {
        await saveRef.current(next.value);
        lastOk.current = true;
        // A newer edit may be waiting; it reports its own result.
        if (!pending.current) {
          setState('saved');
          setError(null);
        }
      } catch (e) {
        lastOk.current = false;
        setState('error');
        setError(e instanceof Error ? e.message : 'Could not save');
      }
    });
    return chain.current.then(() => lastOk.current);
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setState('pending');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush]
  );

  const retry = useCallback(() => {
    if (!pending.current && lastValue.current) pending.current = lastValue.current;
    void flush();
  }, [flush]);

  const saveNow = useCallback(
    (value: T): Promise<boolean> => {
      pending.current = { value };
      return flush();
    },
    [flush]
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [flush]);

  return { state, error, schedule, flush, retry, saveNow };
}
