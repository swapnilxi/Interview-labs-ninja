'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyState, readState, withDone, type ProgressState } from './progress';
import { workbookService } from './workbookService';
import type { WorkbookContent } from './types';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

const SAVE_DELAY_MS = 800;
/** A keepalive request (sent while the page goes away) may carry at most 64 KiB. */
const KEEPALIVE_MAX = 60_000;

/**
 * The learner's own progress in one workbook, saved automatically: every change is applied at once on screen and
 * saved 0.8 s after the last one, one save at a time, each quoting the version the previous one returned. A save
 * refused as stale (another tab or device saved first) stops autosave and asks for a reload instead of overwriting.
 */
export function useWorkbookProgress(
  workbookId: string,
  content: WorkbookContent | null | undefined,
  enabled: boolean
) {
  const [state, setState] = useState<ProgressState | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const stateRef = useRef<ProgressState | null>(null);
  const versionRef = useRef(0);
  const contentRef = useRef(content);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const dirty = useRef(false);
  const conflict = useRef(false);
  contentRef.current = content;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const view = await workbookService.getProgress(workbookId);
      versionRef.current = view.version;
      conflict.current = false;
      const next = withDone(readState(view.state), contentRef.current);
      stateRef.current = next;
      setState(next);
      setStarted(view.version > 0);
      setStatus('idle');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Your progress could not be loaded.');
    }
  }, [workbookId]);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  const flush = useCallback(
    async (keepalive = false) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (!dirty.current || conflict.current || !stateRef.current) return;
      if (inFlight.current) return; // the running save picks the change up when it finishes
      inFlight.current = true;
      dirty.current = false;
      setStatus('saving');
      const snapshot = stateRef.current;
      try {
        const body = JSON.stringify(snapshot);
        const view = await workbookService.saveProgress(
          workbookId,
          versionRef.current,
          snapshot,
          keepalive && body.length < KEEPALIVE_MAX
        );
        versionRef.current = view.version;
        setStarted(true);
        setSaveError(null);
        setStatus(dirty.current ? 'pending' : 'saved');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Not saved.';
        if (/changed in another tab/.test(message)) {
          conflict.current = true;
          setStatus('conflict');
        } else {
          dirty.current = true; // keep the change; the next edit or Retry saves it
          setStatus('error');
        }
        setSaveError(message);
      } finally {
        inFlight.current = false;
      }
      if (dirty.current && !conflict.current) {
        timer.current = setTimeout(() => flush(), SAVE_DELAY_MS);
      }
    },
    [workbookId]
  );

  /**
   * Apply a change now and save it shortly. `quiet` changes (which chapter was opened last) are kept but not saved
   * on their own: they go out with the next real answer, so merely opening a chapter in a second tab never turns the
   * first tab's copy stale.
   */
  const update = useCallback(
    (change: (prev: ProgressState) => ProgressState, options?: { quiet?: boolean }) => {
      if (conflict.current) return;
      const next = withDone(change(stateRef.current ?? emptyState()), contentRef.current);
      stateRef.current = next;
      setState(next);
      if (options?.quiet) return;
      dirty.current = true;
      setStatus('pending');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), SAVE_DELAY_MS);
    },
    [flush]
  );

  // Save what is pending when the tab is hidden or the page is left.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush(true);
    };
  }, [flush]);

  /** Delete this learner's own progress (the caller confirms first). */
  const reset = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    const view = await workbookService.resetProgress(workbookId);
    versionRef.current = view.version;
    conflict.current = false;
    const next = withDone(emptyState(), contentRef.current);
    stateRef.current = next;
    setState(next);
    setStarted(false);
    setSaveError(null);
    setStatus('idle');
  }, [workbookId]);

  return {
    state,
    status,
    started,
    loadError,
    saveError,
    update,
    reload: load,
    retry: () => flush(),
    reset,
  };
}

export type WorkbookProgress = ReturnType<typeof useWorkbookProgress>;
