'use client';

/**
 * Holds the learner's Guided Practice document for one DSA page: loads it, applies changes, saves it.
 *
 * - Changes are made with `mutate(recipe)`, and the recipe runs on the state as it is *at that moment*. An AI answer that
 *   lands a minute after the click is therefore applied to the learner's current progress, never to a stale copy.
 * - Saves are versioned (see fe-apis/guidedPractice/db.ts). Important changes save at once, small ones (a keystroke in
 *   the editor, opening an accordion) after a short pause, and everything is flushed when the tab is hidden or the page
 *   is left. A save the server refuses because another tab saved first stops the page (`conflict`) instead of
 *   overwriting that progress.
 * - A page whose saved document cannot be read is never overwritten: `unreadable` waits for the learner's decision.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GuidedApiError, deleteGuided, loadGuided, saveGuided } from './service';
import { hydrateState, nowIso } from './tree';
import { summaryOf } from './xp';
import type { GameEvent, GuidedState, TopicRef } from './types';

export type StoreStatus = 'loading' | 'error' | 'empty' | 'unreadable' | 'ready' | 'conflict';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Recipe = (
  state: GuidedState
) => GuidedState | { state: GuidedState; events?: GameEvent[] } | null;

const SAVE_DELAY_MS = 700;

export function useGuidedStore(topic: TopicRef | null) {
  const [status, setStatus] = useState<StoreStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<GuidedState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [events, setEvents] = useState<GameEvent[]>([]);

  const stateRef = useRef<GuidedState | null>(null);
  const statusRef = useRef<StoreStatus>('loading');
  const versionRef = useRef(0);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadToken = useRef(0);
  const topicRef = useRef(topic);
  topicRef.current = topic;
  const topicKey = topic ? `${topic.lab}|${topic.id}|${topic.subId}` : '';

  const setStatusBoth = useCallback((next: StoreStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // ── Saving ────────────────────────────────────────────────────────────────

  const flush = useCallback(async () => {
    if (savingRef.current) return; // the running save loops again when it finishes
    const t = topicRef.current;
    while (dirtyRef.current && stateRef.current && t && statusRef.current === 'ready') {
      savingRef.current = true;
      dirtyRef.current = false;
      const snapshot = stateRef.current;
      setSaveStatus('saving');
      try {
        const out = await saveGuided(
          t.lab,
          t.id,
          t.subId,
          versionRef.current,
          snapshot,
          summaryOf(snapshot)
        );
        versionRef.current = out.version;
        setSaveStatus(dirtyRef.current ? 'saving' : 'saved');
      } catch (err) {
        savingRef.current = false;
        if (err instanceof GuidedApiError && err.status === 409) {
          dirtyRef.current = false;
          setStatusBoth('conflict');
          setSaveStatus('error');
          return;
        }
        dirtyRef.current = true; // the next change (or Retry) tries again
        setSaveStatus('error');
        setError(err instanceof Error ? err.message : 'Could not save your progress.');
        return;
      }
      savingRef.current = false;
    }
  }, [setStatusBoth]);

  const requestSave = useCallback(
    (immediate: boolean) => {
      dirtyRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (immediate) {
        void flush();
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush();
      }, SAVE_DELAY_MS);
    },
    [flush]
  );

  // ── Loading ───────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const t = topicRef.current;
    if (!t) return;
    const token = ++loadToken.current;
    setStatusBoth('loading');
    setError(null);
    try {
      const loaded = await loadGuided(t.lab, t.id, t.subId);
      if (loadToken.current !== token) return;
      versionRef.current = loaded.version;
      dirtyRef.current = false;
      if (!loaded.exists) {
        stateRef.current = null;
        setState(null);
        setStatusBoth('empty');
        return;
      }
      const hydrated = hydrateState(loaded.state);
      if (!hydrated) {
        stateRef.current = null;
        setState(null);
        setError('The saved progress for this page could not be read.');
        setStatusBoth('unreadable');
        return;
      }
      stateRef.current = hydrated;
      setState(hydrated);
      setSaveStatus('idle');
      setStatusBoth('ready');
    } catch (err) {
      if (loadToken.current !== token) return;
      setError(err instanceof Error ? err.message : 'Could not load your progress.');
      setStatusBoth('error');
    }
  }, [setStatusBoth]);

  useEffect(() => {
    if (!topicKey) return;
    void load();
    return () => {
      // Invalidates a load still in flight: it must not land on another page's state.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadToken.current++;
    };
  }, [topicKey, load]);

  // Whatever is still waiting to be saved goes out when the tab is hidden and when the page is left.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirtyRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (dirtyRef.current) void flush();
    };
  }, [flush]);

  // ── Changing ──────────────────────────────────────────────────────────────

  const mutate = useCallback(
    (recipe: Recipe, opts: { immediate?: boolean } = {}): GuidedState | null => {
      const current = stateRef.current;
      if (!current || statusRef.current !== 'ready') return null;
      const out = recipe(current);
      if (!out) return null;
      const result =
        'schema' in out
          ? { state: out as GuidedState, events: [] as GameEvent[] }
          : { state: out.state, events: out.events ?? [] };
      if (result.state === current && !result.events.length) return current;
      const next = result.state === current ? current : { ...result.state, updatedAt: nowIso() };
      stateRef.current = next;
      setState(next);
      if (result.events.length) setEvents((prev) => [...prev, ...result.events]);
      if (next !== current) requestSave(!!opts.immediate);
      return next;
    },
    [requestSave]
  );

  /** Starts the page's document (the learner generated the path). */
  const create = useCallback(
    (fresh: GuidedState) => {
      stateRef.current = fresh;
      setState(fresh);
      setSaveStatus('idle');
      setStatusBoth('ready');
      requestSave(true);
    },
    [requestSave, setStatusBoth]
  );

  /** Forgets the saved path and progress of this page. */
  const reset = useCallback(async () => {
    const t = topicRef.current;
    if (!t) return;
    await deleteGuided(t.lab, t.id, t.subId);
    versionRef.current = 0;
    dirtyRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    stateRef.current = null;
    setState(null);
    setError(null);
    setSaveStatus('idle');
    setStatusBoth('empty');
  }, [setStatusBoth]);

  const retrySave = useCallback(() => {
    setError(null);
    requestSave(true);
  }, [requestSave]);

  const dismissEvent = useCallback(
    (id: string) => setEvents((prev) => prev.filter((e) => e.id !== id)),
    []
  );

  const get = useCallback(() => stateRef.current, []);

  return {
    status,
    error,
    state,
    saveStatus,
    events,
    get,
    mutate,
    create,
    reset,
    reload: load,
    retrySave,
    dismissEvent,
  };
}

export type GuidedStore = ReturnType<typeof useGuidedStore>;
