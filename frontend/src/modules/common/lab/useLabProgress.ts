'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getToken, onAuthChange } from '@/lib/auth/tokenStore';
import {
  fetchLabProgress,
  setPageCompleted,
  type LabName,
} from '@/lib/services/labSectionsService';

/**
 * "Mark as complete" state for the labs (DSA, CV, System Design), one shared store per lab.
 *
 * Several places show the same state at once (the sidebar, the Wiki cards, the page header, the
 * bottom button), so it lives outside any component: every `useLabProgress(lab)` caller reads the
 * same data and a toggle in one place shows up in all of them. A page is a topic, or a subtopic of
 * one (`subtopicId` ''). Toggling is optimistic and rolls back, with a message, if the save fails.
 */

interface Snapshot {
  loaded: boolean;
  /** page key → server completion time ('' until the server confirms an optimistic completion). */
  done: ReadonlyMap<string, string>;
  pending: ReadonlySet<string>;
  errors: ReadonlyMap<string, string>;
}

interface LabStore {
  snap: Snapshot;
  listeners: Set<() => void>;
  /** The token the current snapshot was loaded for; a different login starts over. */
  forToken: string | null | undefined;
}

const EMPTY: Snapshot = { loaded: false, done: new Map(), pending: new Set(), errors: new Map() };
const stores = new Map<LabName, LabStore>();

const pageKey = (topicId: string, subtopicId = '') => `${topicId}|${subtopicId}`;

function storeFor(lab: LabName): LabStore {
  let s = stores.get(lab);
  if (!s) {
    s = { snap: EMPTY, listeners: new Set(), forToken: undefined };
    stores.set(lab, s);
  }
  return s;
}

function setSnap(store: LabStore, next: Snapshot) {
  store.snap = next;
  store.listeners.forEach((l) => l());
}

function ensureLoaded(lab: LabName) {
  const store = storeFor(lab);
  const token = getToken();
  if (store.forToken === token) return;
  store.forToken = token;
  setSnap(store, EMPTY);
  if (!token) return; // guests have no saved progress (and the labs need a login anyway)
  fetchLabProgress(lab)
    .then((items) => {
      if (store.forToken !== token) return; // logged out/in meanwhile
      setSnap(store, {
        ...store.snap,
        loaded: true,
        done: new Map(items.map((i) => [pageKey(i.topicId, i.subtopicId), i.completedAt])),
      });
    })
    .catch((e) => {
      console.error('lab progress:', e);
      if (store.forToken !== token) return;
      store.forToken = undefined; // let the next mount try again
      setSnap(store, { ...store.snap, loaded: true });
    });
}

onAuthChange(() => stores.forEach((_, lab) => ensureLoaded(lab)));

async function toggle(lab: LabName, topicId: string, subtopicId: string) {
  const store = storeFor(lab);
  const key = pageKey(topicId, subtopicId);
  if (store.snap.pending.has(key)) return;
  const before = store.snap.done.get(key); // undefined = not complete
  const completing = before === undefined;

  const withDone = (s: Snapshot, value: string | undefined) => {
    const done = new Map(s.done);
    if (value === undefined) done.delete(key);
    else done.set(key, value);
    return done;
  };
  const withPending = (s: Snapshot, on: boolean) => {
    const pending = new Set(s.pending);
    if (on) pending.add(key);
    else pending.delete(key);
    return pending;
  };
  const withError = (s: Snapshot, message: string | null) => {
    const errors = new Map(s.errors);
    if (message === null) errors.delete(key);
    else errors.set(key, message);
    return errors;
  };

  const token = store.forToken;
  setSnap(store, {
    ...store.snap,
    done: withDone(store.snap, completing ? '' : undefined),
    pending: withPending(store.snap, true),
    errors: withError(store.snap, null),
  });
  try {
    const res = await setPageCompleted(lab, topicId, subtopicId, completing);
    if (store.forToken !== token) return;
    setSnap(store, {
      ...store.snap,
      done: withDone(store.snap, res.completed ? (res.completedAt ?? '') : undefined),
      pending: withPending(store.snap, false),
    });
  } catch (e) {
    if (store.forToken !== token) return;
    setSnap(store, {
      ...store.snap,
      done: withDone(store.snap, before),
      pending: withPending(store.snap, false),
      errors: withError(
        store.snap,
        e instanceof Error ? e.message : 'Could not save your progress.'
      ),
    });
  }
}

export function useLabProgress(lab: LabName) {
  const snap = useSyncExternalStore(
    (cb) => {
      const store = storeFor(lab);
      store.listeners.add(cb);
      return () => {
        store.listeners.delete(cb);
      };
    },
    () => storeFor(lab).snap,
    () => EMPTY
  );
  useEffect(() => ensureLoaded(lab), [lab]);

  return useMemo(
    () => ({
      loaded: snap.loaded,
      isDone: (topicId: string, subtopicId = '') => snap.done.has(pageKey(topicId, subtopicId)),
      /** Server completion time (UTC "YYYY-MM-DD HH:MM:SS"), '' while an optimistic save is in flight, null if not complete. */
      completedAt: (topicId: string, subtopicId = '') =>
        snap.done.get(pageKey(topicId, subtopicId)) ?? null,
      isPending: (topicId: string, subtopicId = '') =>
        snap.pending.has(pageKey(topicId, subtopicId)),
      errorFor: (topicId: string, subtopicId = '') =>
        snap.errors.get(pageKey(topicId, subtopicId)) ?? null,
      /** How many of these topics (their own pages, not subtopics) are complete. */
      countDone: (topicIds: Iterable<string>) => {
        let n = 0;
        for (const id of topicIds) if (snap.done.has(pageKey(id))) n++;
        return n;
      },
      toggle: (topicId: string, subtopicId = '') => toggle(lab, topicId, subtopicId),
    }),
    [lab, snap]
  );
}

export type LabProgressApi = ReturnType<typeof useLabProgress>;
