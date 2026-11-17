'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  agentService,
  applyAction,
  confirmDelete,
  loadThread,
  newItemId,
  saveThread,
  turnsFor,
  undoAction,
  type ActionEntry,
  type ChatTurn,
  type StoredThread,
  type ThreadItem,
} from '@/lib/services/agentService';
import {
  scheduleService,
  parseServerTime,
  SCHEDULES_CHANGED_EVENT,
  type ActivityRun,
} from '@/lib/services/scheduleService';

/** One row of the conversation: a message, or the result of a scheduled AI job. */
export type TimelineEntry =
  { kind: 'message'; item: ThreadItem; at: number } | { kind: 'run'; run: ActivityRun; at: number };

/** Job results from the last two days are part of what the Assistant reads, so "what did my report say?" works. */
const RUNS_IN_CONTEXT_MS = 2 * 86_400_000;
const RUN_TEXT_IN_CONTEXT = 1500;

/**
 * The Assistant's conversation: your messages and its replies (kept in this browser), merged with the results of your
 * scheduled AI jobs (from the server), plus sending, carrying out actions and undoing them.
 */
export function useAssistant() {
  const [thread, setThread] = useState<StoredThread>({ items: [], clearedAt: 0 });
  const [runs, setRuns] = useState<ActivityRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [runsLoaded, setRunsLoaded] = useState(false);
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const runsRef = useRef(runs);
  runsRef.current = runs;

  const update = useCallback((fn: (t: StoredThread) => StoredThread) => {
    setThread((cur) => {
      const next = fn(cur);
      saveThread(next);
      threadRef.current = next;
      return next;
    });
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await scheduleService.activity());
    } catch {
      /* the conversation still works without them */
    }
    setRunsLoaded(true);
  }, []);

  useEffect(() => {
    setThread(loadThread());
    setReady(true);
    void loadRuns();
    let timer: number | undefined;
    // A run finishing (here, on the phone, or from "Run now") changes the schedules: pick up its result.
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadRuns(), 400);
    };
    const onFocus = () => {
      if (document.visibilityState === 'visible') void loadRuns();
    };
    window.addEventListener(SCHEDULES_CHANGED_EVENT, onChange);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(SCHEDULES_CHANGED_EVENT, onChange);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [loadRuns]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const rows: TimelineEntry[] = thread.items.map((item) => ({
      kind: 'message',
      item,
      at: item.at,
    }));
    for (const run of runs) {
      const at = parseServerTime(run.finished_at || run.started_at);
      if (!Number.isNaN(at) && at > thread.clearedAt) rows.push({ kind: 'run', run, at });
    }
    return rows.sort((a, b) => a.at - b.at);
  }, [thread, runs]);

  /** What the server sees: the conversation, with recent job results woven in as the Assistant's own turns. */
  const contextTurns = (items: ThreadItem[]): ChatTurn[] => {
    const since = Date.now() - RUNS_IN_CONTEXT_MS;
    const merged: { at: number; turns: ChatTurn[] }[] = items.map((it) => ({
      at: it.at,
      turns: turnsFor([it]),
    }));
    for (const run of runsRef.current) {
      const at = parseServerTime(run.finished_at || run.started_at);
      if (
        Number.isNaN(at) ||
        at < since ||
        at <= threadRef.current.clearedAt ||
        run.status !== 'ok'
      )
        continue;
      const body = (run.report || run.output || '').slice(0, RUN_TEXT_IN_CONTEXT);
      merged.push({
        at,
        turns: [
          {
            role: 'assistant',
            content: `[Scheduled job "${run.schedule_title}" ran at ${new Date(at).toLocaleString()}] ${run.title ? `${run.title}. ` : ''}${body}`,
          },
        ],
      });
    }
    return merged.sort((a, b) => a.at - b.at).flatMap((m) => m.turns);
  };

  /** Sends a message; resolves with the Assistant's reply item (or the error item). */
  const send = useCallback(
    async (text: string, opts: { voice?: boolean } = {}): Promise<ThreadItem | null> => {
      const content = text.trim();
      if (!content) return null;
      const userItem: ThreadItem = {
        id: newItemId(),
        role: 'user',
        text: content,
        at: Date.now(),
        voice: !!opts.voice,
      };
      const items = [...threadRef.current.items, userItem];
      update((t) => ({ ...t, items: [...t.items, userItem] }));
      setBusy(true);
      let reply: ThreadItem;
      try {
        const answer = await agentService.chat(contextTurns(items), { voice: opts.voice });
        const entries: ActionEntry[] = [];
        for (const action of answer.actions) entries.push(await applyAction(action));
        reply = {
          id: newItemId(),
          role: 'assistant',
          text: answer.reply,
          speech: answer.speech,
          at: Date.now(),
          actions: entries,
          notes: answer.notes,
          sources: answer.sources,
          searched: answer.searched,
          voice: !!opts.voice,
        };
      } catch (err) {
        reply = {
          id: newItemId(),
          role: 'assistant',
          text:
            err instanceof Error && err.message ? err.message : 'Something went wrong. Try again.',
          at: Date.now(),
          failed: true,
        };
      }
      update((t) => ({ ...t, items: [...t.items, reply] }));
      setBusy(false);
      return reply;
    },
    // contextTurns reads refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update]
  );

  /** Resend the message an error answered. */
  const retry = useCallback(
    async (failedId: string) => {
      const items = threadRef.current.items;
      const index = items.findIndex((it) => it.id === failedId);
      const prev = index > 0 ? items[index - 1] : null;
      if (!prev || prev.role !== 'user') return;
      update((t) => ({
        ...t,
        items: t.items.filter((it) => it.id !== failedId && it.id !== prev.id),
      }));
      await send(prev.text, { voice: prev.voice });
    },
    [send, update]
  );

  const setEntry = useCallback(
    (itemId: string, index: number, entry: ActionEntry) =>
      update((t) => ({
        ...t,
        items: t.items.map((it) =>
          it.id === itemId && it.actions
            ? { ...it, actions: it.actions.map((e, i) => (i === index ? entry : e)) }
            : it
        ),
      })),
    [update]
  );

  const entryAt = (itemId: string, index: number) =>
    threadRef.current.items.find((it) => it.id === itemId)?.actions?.[index];

  const undo = useCallback(
    async (itemId: string, index: number) => {
      const entry = entryAt(itemId, index);
      if (!entry) return;
      setEntry(itemId, index, { ...entry, state: 'working' });
      setEntry(itemId, index, await undoAction(entry));
    },
    [setEntry]
  );

  const confirm = useCallback(
    async (itemId: string, index: number, yes: boolean) => {
      const entry = entryAt(itemId, index);
      if (!entry) return;
      if (!yes) return setEntry(itemId, index, { ...entry, state: 'kept' });
      setEntry(itemId, index, { ...entry, state: 'working' });
      setEntry(itemId, index, await confirmDelete(entry));
    },
    [setEntry]
  );

  const clear = useCallback(() => update(() => ({ items: [], clearedAt: Date.now() })), [update]);

  return {
    ready,
    runsLoaded,
    timeline,
    busy,
    send,
    retry,
    undo,
    confirm,
    clear,
    reloadRuns: loadRuns,
  };
}
