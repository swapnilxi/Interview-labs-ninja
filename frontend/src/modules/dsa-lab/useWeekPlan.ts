'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthChange } from '@/lib/auth/tokenStore';
import * as api from '@/lib/services/dsaWeekPlanService';
import type {
  ActivePlan,
  AutoPlanResult,
  AutoPlanTopic,
  ProfileSummary,
} from '@/lib/services/dsaWeekPlanService';
import { useLabProgress } from '@/modules/common/lab/useLabProgress';
import {
  addWeek as addWeekTo,
  autoRequestAnswers,
  clearWeek as clearWeekOf,
  coreOrder as coreOrderFor,
  DEFAULT_PER_WEEK,
  DEFAULT_WEEKS,
  fillWeek as fillWeekOf,
  generateWeekPlan,
  learningOrder,
  moveQuestion,
  moveWeek as moveWeekTo,
  NAME_MAX,
  normalizePlan,
  normalizeAutoAnswers,
  planInsights,
  queueIds,
  rankOf,
  recommendForWeek as recommendFor,
  removeWeek as removeWeekFrom,
  samePlan,
  setWeekLabel as setWeekLabelOf,
  spreadEvenly as spreadEvenlyOf,
  swapQuestions,
  weekOf as weekOfIn,
  weekQuestions as weekQuestionsOf,
  type AutoAnswers,
  type EditResult,
  type PlanTopic,
  type WeekPlan,
} from './weekPlan';

/** Most undo steps kept (the history is cleared when another plan profile becomes active). */
const HISTORY_MAX = 50;
const BUSY = 'Your plan is still loading. Try again in a moment.';
const LOAD_FAILED =
  'Your saved plan could not be loaded, so editing is switched off for now. Try again, or reload the page.';
const LOGIN_NEEDED = 'Log in to edit and save your week plan.';
const NOT_ACTIVE =
  'This plan is no longer the active one (it was changed in another tab or on another device), so your last change was not saved.';

/**
 * Keeps only assignments for questions the lab knows. Used for what is SHOWN (and for plans that replace
 * the current one on purpose); what is saved, snapshotted for undo or copied never goes through it, so a
 * question list that is missing or uses other ids (the lab falls back to a built-in list when the topics
 * request fails) can never wipe a stored plan.
 */
function prune(plan: WeekPlan, known: ReadonlySet<string>): WeekPlan {
  if (!known.size) return plan;
  const ids = Object.keys(plan.assignments);
  if (ids.every((id) => known.has(id))) return plan;
  const assignments: Record<string, number> = {};
  for (const id of ids) if (known.has(id)) assignments[id] = plan.assignments[id];
  return { ...plan, assignments, order: plan.order.filter((id) => known.has(id)) };
}

const plain = (p: ActivePlan): WeekPlan => ({
  weeks: p.weeks,
  assignments: p.assignments,
  order: p.order,
  labels: p.labels,
});
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * The learner's week plan, one instance per lab (DSALabModule passes it down): the active plan
 * profile if there is one, otherwise the suggested plan. Edits show immediately, go into an undo
 * history and are saved in the background one at a time; if a save fails the plan snaps back to the
 * last saved state and `error` says why. The first edit of the suggested plan makes the server
 * create (and activate) a profile called "My plan".
 *
 * Edits return a message for the learner when they aren't allowed (a full week, say) instead of
 * setting `error`, which is kept for failed saves, loads and plan switches. The profile functions
 * that take a typed name (saveAsProfile, renameProfile, duplicateProfile) and deleteProfile and
 * autoOrganize throw, so their dialogs can show the server's message inline.
 *
 * `topics` should be a stable array (state, not rebuilt every render).
 */
export function useWeekPlan(topics: readonly PlanTopic[]) {
  const progress = useLabProgress('dsa');
  const [saved, setSavedState] = useState<WeekPlan | null>(null);
  const [activeProfile, setActiveState] = useState<{ id: number; name: string } | null>(null);
  const [profiles, setProfilesState] = useState<ProfileSummary[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadErrorState] = useState<string | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [, setHistoryTick] = useState(0);

  // Refs mirror the state so callbacks (including ones running after an await) see the latest values.
  const savedRef = useRef<WeekPlan | null>(null);
  const activeRef = useRef<{ id: number; name: string } | null>(null);
  const profilesRef = useRef<ProfileSummary[]>([]);
  const loadedRef = useRef(false);
  const loadErrorRef = useRef<string | null>(null);
  const switchingRef = useRef(false);
  const versionRef = useRef(0); // bumped by every change of the plan on screen (edit, undo, redo, plan switch)
  const confirmed = useRef<WeekPlan | null>(null); // last state the server confirmed
  const queue = useRef<Promise<unknown>>(Promise.resolve()); // server calls go out one at a time, in order
  const epoch = useRef(0); // bumped when queued saves must not run any more (failed save, plan switch)
  const loadSeq = useRef(0); // the newest load of the active plan / plan list wins when several are in flight
  const profilesSeq = useRef(0);
  const undoStack = useRef<WeekPlan[]>([]);
  const redoStack = useRef<WeekPlan[]>([]);

  const setSaved = (p: WeekPlan | null) => {
    savedRef.current = p;
    setSavedState(p);
  };
  const setActive = (p: { id: number; name: string } | null) => {
    const cur = activeRef.current;
    if (cur === p || (cur && p && cur.id === p.id && cur.name === p.name)) return;
    activeRef.current = p;
    setActiveState(p);
  };
  const setProfiles = (list: ProfileSummary[]) => {
    profilesRef.current = list;
    setProfilesState(list);
  };
  const setLoadError = (message: string | null) => {
    loadErrorRef.current = message;
    setLoadErrorState(message);
  };
  /** The saved plan is on screen after all: drop the load failure and its banner (any other error stays). */
  const clearLoadError = () => {
    const why = loadErrorRef.current;
    if (!why) return;
    setLoadError(null);
    setError((e) => (e === why ? null : e));
  };
  const clearHistory = () => {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryTick((t) => t + 1);
  };
  const beginSwitch = () => {
    switchingRef.current = true;
    setSwitching(true);
    // A stale error goes now, before the wait: one raised meanwhile by a save queued earlier must outlive the switch.
    setError(null);
  };
  const endSwitch = () => {
    switchingRef.current = false;
    setSwitching(false);
  };
  /** Runs `job` after every server call queued before it; the queue itself never rejects. */
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job);
    queue.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  // Ids of the core questions present in this topic list, and every question in learning order.
  const coreOrder = useMemo(() => coreOrderFor(topics), [topics]);
  const order = useMemo(() => learningOrder(topics, coreOrder), [topics, coreOrder]);
  const rank = useMemo(() => rankOf(order), [order]);
  const known = useMemo(() => new Set(topics.map((t) => t.id)), [topics]);
  const suggested = useMemo(
    () => generateWeekPlan(coreOrder, DEFAULT_WEEKS, DEFAULT_PER_WEEK),
    [coreOrder]
  );
  const plan = useMemo(() => prune(saved ?? suggested, known), [saved, suggested, known]);
  /** Saved questions the lab's current question list doesn't know: kept in the stored plan, not shown. */
  const hiddenCount = useMemo(() => {
    if (!known.size) return 0;
    return Object.keys((saved ?? suggested).assignments).filter((id) => !known.has(id)).length;
  }, [saved, suggested, known]);
  const isDone = useCallback((id: string) => progress.isDone(id), [progress]);
  const queueList = useMemo(() => queueIds(plan, order), [plan, order]);
  const insights = useMemo(
    () => planInsights({ plan, topics, coreOrder, isDone }),
    [plan, topics, coreOrder, isDone]
  );

  // The latest render's inputs, for edits made from event handlers and async callbacks.
  const live = useRef({ topics, coreOrder, order, rank, known, suggested, isDone });
  live.current = { topics, coreOrder, order, rank, known, suggested, isDone };
  /** The plan as stored (or the suggested one): every edit, undo snapshot and copy starts from this, unpruned. */
  const current = () => savedRef.current ?? live.current.suggested;
  /** The plan as the learner sees it. */
  const shown = () => prune(current(), live.current.known);

  /**
   * Reloads the profile list. `profilesLoaded` turns true only once a list has actually arrived;
   * until then `profilesError` says why (the menu must not claim "no saved plans" for a failed request).
   */
  const refreshProfiles = async (): Promise<void> => {
    const seq = ++profilesSeq.current;
    try {
      const list = (await api.listProfiles()).profiles;
      if (seq !== profilesSeq.current) return;
      setProfiles(list);
      setProfilesError(null);
      setProfilesLoaded(true);
    } catch (e) {
      console.error('week plan profiles:', e);
      if (seq === profilesSeq.current) setProfilesError(message(e, 'Could not load your plans.'));
    }
  };

  /**
   * Loads the active plan. A failure is NOT the same as "no saved plan": while `loadError` is set every
   * edit is refused, because the suggested plan on screen is not what the server holds and saving it would
   * overwrite the learner's active plan. `loaded` still turns true so the page shows the suggested plan
   * (read-only) and the error instead of a spinner forever.
   */
  const loadActive = async (): Promise<void> => {
    const seq = ++loadSeq.current;
    try {
      const p = await api.fetchWeekPlan();
      if (seq !== loadSeq.current) return;
      confirmed.current = p ? plain(p) : null;
      setSaved(confirmed.current);
      setActive(p ? { id: p.profileId, name: p.name } : null);
      clearLoadError();
    } catch (e) {
      console.error('week plan:', e);
      if (seq !== loadSeq.current) return;
      // A guest has no saved plan to protect, but nothing they change could be saved either: say so, rather
      // than "try again".
      const notLoggedIn =
        e instanceof api.ApiError &&
        (e.status === 401 || (e.status === 403 && /not authenticated/i.test(e.message)));
      const why = notLoggedIn ? LOGIN_NEEDED : LOAD_FAILED;
      setLoadError(why);
      setError(why);
    } finally {
      if (seq === loadSeq.current) {
        loadedRef.current = true;
        setLoaded(true);
      }
    }
  };

  useEffect(() => {
    void loadActive();
    void refreshProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A login or logout (the login popup works in place, so nothing remounts): the plan and plan list on screen
   * belong to whoever was signed in before. Saves still queued for them must not run under the new account,
   * and the new account's own saved plan has to be loaded before anything can be edited (or an edit of the
   * suggested plan would overwrite it).
   */
  const reloadForAccount = async (): Promise<void> => {
    epoch.current++;
    versionRef.current++;
    confirmed.current = null;
    setSaved(null);
    setActive(null);
    setProfiles([]);
    setProfilesLoaded(false);
    setProfilesError(null);
    clearHistory();
    setError(null);
    setLoadError(null);
    loadedRef.current = false;
    setLoaded(false);
    await loadActive();
    void refreshProfiles();
  };
  useEffect(
    () => onAuthChange(() => void reloadForAccount()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** Tries again after a failed load (and reloads the plan list). */
  const retryLoad = async (): Promise<void> => {
    if (switchingRef.current) return;
    await loadActive();
    void refreshProfiles();
  };

  /** A save went through: remember who owns the active plan and keep its menu entry current. */
  const noteSaved = (res: ActivePlan) => {
    setActive({ id: res.profileId, name: res.name });
    if (!profilesRef.current.some((p) => p.id === res.profileId)) {
      void refreshProfiles(); // the server just created "My plan"
      return;
    }
    setProfiles(
      profilesRef.current.map((p) =>
        p.id === res.profileId
          ? {
              ...p,
              name: res.name,
              weeks: res.weeks,
              planned: Object.keys(res.assignments).length,
              updatedAt: res.updatedAt,
              active: true,
            }
          : { ...p, active: false }
      )
    );
  };

  /** Shows `next` now and saves it in the background; `history: false` for undo / redo themselves. */
  const commit = (next: WeekPlan, history = true) => {
    const prev = current();
    if (samePlan(prev, next)) return;
    if (history) {
      undoStack.current = [...undoStack.current, prev].slice(-HISTORY_MAX);
      redoStack.current = [];
      setHistoryTick((t) => t + 1);
    }
    versionRef.current++;
    setSaved(next);
    setError(null);
    const mine = epoch.current;
    setPendingSaves((n) => n + 1);
    void enqueue(async () => {
      try {
        if (mine !== epoch.current) return;
        // The plan this tab believes is active, read when the save runs (an earlier queued save may just
        // have created it): the server refuses the write if another tab or device changed it meanwhile.
        const res = await api.saveWeekPlan(next, activeRef.current?.id ?? null);
        if (mine !== epoch.current) return;
        confirmed.current = plain(res);
        noteSaved(res);
      } catch (e) {
        if (mine !== epoch.current) return;
        epoch.current++; // saves queued on top of this one were built on a plan the server never took
        if (e instanceof api.ApiError && e.status === 409 && e.message === api.NOT_ACTIVE_MESSAGE) {
          await followServerPlan();
          return;
        }
        versionRef.current++; // the plan on screen changes back: a toast's Undo for the lost edit must not fire
        setSaved(confirmed.current);
        // Every undo / redo snapshot was built on a plan the server never accepted: undoing into one
        // would save the very change it just refused.
        clearHistory();
        setError(message(e, 'Could not save the week plan.'));
      } finally {
        setPendingSaves((n) => n - 1);
      }
    });
  };

  /** Another tab or device changed which plan is active: show what the server has now, never overwrite it. */
  const followServerPlan = async (): Promise<void> => {
    try {
      const p = await api.fetchWeekPlan();
      showActive(p);
      void refreshProfiles();
      setError(`${NOT_ACTIVE} Showing the plan that is active now.`);
    } catch {
      versionRef.current++;
      setSaved(confirmed.current);
      clearHistory();
      setError(`${NOT_ACTIVE} Reload the page to see the plan that is active now.`);
    }
  };

  /** Why edits are refused right now, or null. */
  const blocker = (): string | null =>
    loadErrorRef.current ?? (!loadedRef.current || switchingRef.current ? BUSY : null);

  /** Applies a pure edit to the current plan; returns its message when it isn't allowed. */
  const edit = (fn: (p: WeekPlan) => EditResult): string | null => {
    const blocked = blocker();
    if (blocked) return blocked;
    const before = current();
    const result = fn(before);
    if ('error' in result) return result.error;
    if (result.plan !== before) commit(result.plan);
    return null;
  };

  /** Makes a server plan the one on screen, as a fresh start (no undo across plans). */
  const showActive = (p: ActivePlan | null) => {
    epoch.current++;
    versionRef.current++;
    confirmed.current = p ? plain(p) : null;
    setSaved(confirmed.current);
    setActive(p ? { id: p.profileId, name: p.name } : null);
    setProfiles(profilesRef.current.map((x) => ({ ...x, active: !!p && x.id === p.profileId })));
    clearHistory();
    // The server's own plan is on screen now, so a failed initial load no longer matters. Any other error is
    // left alone: a save that failed just before the switch must still be reported.
    clearLoadError();
  };

  const recommendForWeek = (week: number, limit = 3): string[] => {
    const { topics: all, coreOrder: core, isDone: done } = live.current;
    return recommendFor({
      plan: shown(),
      week,
      topics: all,
      coreOrder: core,
      isDone: done,
      limit,
    });
  };

  const step = (from: { current: WeekPlan[] }, to: { current: WeekPlan[] }) => {
    if (blocker()) return;
    const now = current();
    const stack = [...from.current];
    let snap = stack.pop();
    while (snap && samePlan(snap, now)) snap = stack.pop();
    from.current = stack;
    if (snap) {
      to.current = [...to.current, now].slice(-HISTORY_MAX);
      commit(snap, false);
    }
    setHistoryTick((t) => t + 1);
  };

  /** Waits for queued saves, then makes profile `id` active and shows it. */
  const switchProfile = async (id: number): Promise<void> => {
    if (switchingRef.current || activeRef.current?.id === id) return;
    beginSwitch();
    try {
      showActive(await enqueue(() => api.activateProfile(id)));
    } catch (e) {
      setError(message(e, 'Could not switch plans.'));
      void refreshProfiles(); // the plan may be gone (or renamed) elsewhere
    } finally {
      endSwitch();
    }
  };

  /** Waits for queued saves, then deactivates every profile so the suggested plan shows (nothing is deleted). */
  const showSuggested = async (): Promise<void> => {
    if (switchingRef.current) return;
    beginSwitch();
    try {
      await enqueue(() => api.resetWeekPlan());
      showActive(null);
    } catch (e) {
      setError(message(e, 'Could not switch to the suggested plan.'));
    } finally {
      endSwitch();
    }
  };

  /**
   * `index` counts the cards the learner can see; questions the lab's list doesn't know stay in the stored
   * week too (invisible), so a drop position is translated to a position in the full stored list.
   */
  const storedIndex = (p: WeekPlan, topicId: string, week: number, index: number): number => {
    const { known: ids, rank: rankFn } = live.current;
    if (!ids.size) return index;
    const rest = weekQuestionsOf(p, week, rankFn).filter((id) => id !== topicId);
    if (rest.every((id) => ids.has(id))) return index;
    const visible = rest.filter((id) => ids.has(id));
    return index < visible.length ? rest.indexOf(visible[index]) : rest.length;
  };

  const summaryOf = ({ plan: _plan, ...summary }: api.ProfileFull): ProfileSummary => summary;

  /** Saves a plan (default: the one on screen) as a new profile; `activate` also switches to it. */
  const saveAsProfile = async (
    name: string,
    opts: { plan?: WeekPlan; summary?: string; activate?: boolean } = {}
  ): Promise<ProfileSummary> => {
    const activate = opts.activate ?? false;
    if (activate && switchingRef.current) throw new Error(BUSY);
    // Never pruned: a copy keeps every stored question, including ones this question list doesn't show.
    const planToSave = opts.plan ? normalizePlan(opts.plan) : current();
    if (activate) beginSwitch();
    try {
      const full = await enqueue(() =>
        api.createProfile({ name, plan: planToSave, summary: opts.summary ?? '', activate })
      );
      const summary = summaryOf(full);
      setProfiles(
        [...profilesRef.current.filter((p) => p.id !== full.id), summary]
          .map((p) => (activate ? { ...p, active: p.id === full.id } : p))
          .sort((a, b) => a.id - b.id)
      );
      if (activate)
        showActive({
          ...full.plan,
          updatedAt: full.updatedAt,
          profileId: full.id,
          name: full.name,
        });
      return summary;
    } finally {
      if (activate) endSwitch();
    }
  };

  const renameProfile = async (id: number, name: string): Promise<void> => {
    const full = await api.updateProfile(id, { name });
    setProfiles(profilesRef.current.map((p) => (p.id === id ? summaryOf(full) : p)));
    if (activeRef.current?.id === id) setActive({ id, name: full.name });
  };

  const deleteProfile = async (id: number): Promise<void> => {
    const wasActive = activeRef.current?.id === id;
    if (wasActive) {
      if (switchingRef.current) throw new Error(BUSY);
      beginSwitch();
    }
    try {
      const res = await enqueue(() => api.deleteProfile(id));
      setProfiles(
        profilesRef.current
          .filter((p) => p.id !== id)
          .map((p) => ({ ...p, active: p.id === res.activeId }))
      );
      if (wasActive) showActive(null);
    } catch (e) {
      void refreshProfiles();
      throw e;
    } finally {
      if (wasActive) endSwitch();
    }
  };

  /** Copies a profile (its plan and summary; the active one as it is on screen) under a new name. */
  const duplicateProfile = async (id: number, name: string): Promise<ProfileSummary> => {
    const source =
      activeRef.current?.id === id
        ? {
            plan: current(),
            summary: profilesRef.current.find((p) => p.id === id)?.summary ?? '',
          }
        : await api.getProfile(id).catch((e) => {
            void refreshProfiles();
            throw e;
          });
    return saveAsProfile(name, { plan: source.plan, summary: source.summary, activate: false });
  };

  /** "Plan 2", "Plan 3" … (or `base` itself, then "base 2" …, for another base): the first name not taken. */
  const nextProfileName = (base = 'Plan'): string => {
    const taken = new Set(profilesRef.current.map((p) => p.name.trim().toLowerCase()));
    const root =
      base
        .trim()
        .slice(0, NAME_MAX - 3)
        .trim() || 'Plan';
    if (root !== 'Plan' && !taken.has(root.toLowerCase())) return root;
    for (let n = taken.size ? 2 : 1; ; n++) {
      const name = `${root} ${n}`;
      if (!taken.has(name.toLowerCase())) return name;
    }
  };

  /** Asks the AI for a plan from the wizard's answers; sends the questions (learning order, solved flags) itself. Not saved. */
  const autoOrganize = async (answers: AutoAnswers): Promise<AutoPlanResult> => {
    const a = normalizeAutoAnswers(answers);
    const { topics: all, order: ids, isDone: done, known: knownIds } = live.current;
    const byId = new Map(all.map((t) => [t.id, t]));
    const list: AutoPlanTopic[] = ids
      .filter((id) => a.includeDone || !done(id))
      .slice(0, 400)
      .map((id) => {
        const t = byId.get(id);
        return {
          id,
          name: t.name.trim().slice(0, 200) || id,
          category: t.category.trim().slice(0, 120),
          difficulty: t.difficulty.trim().slice(0, 40),
          done: done(id),
        };
      });
    if (!list.length)
      throw new Error(
        all.length
          ? 'Every question is already marked complete. Include solved questions to plan a review.'
          : 'The questions are still loading. Try again in a moment.'
      );
    const res = await api.autoOrganize({ answers: autoRequestAnswers(a), topics: list });
    return { ...res, plan: prune(res.plan, knownIds) };
  };

  return {
    plan,
    /** Ids of the core questions in learning order (what "Generate plan" fills the weeks from). */
    coreOrder,
    /** Learning-order position of a question (core questions first, then by pattern and difficulty). */
    rank,
    loaded,
    /** True while edits are waiting to be saved. */
    saving: pendingSaves > 0,
    /** True while another plan is being made active (edits wait until it is done). */
    switching,
    error,
    clearError: () => setError(null),
    /** Set when the saved plan could not be loaded: edits are refused until `retryLoad` succeeds. */
    loadError,
    retryLoad,
    /** Counts every change of the plan on screen (edit, undo, redo, plan switch); read it when the change is made. */
    getVersion: (): number => versionRef.current,
    /** Questions saved in the plan that the lab's current question list doesn't know (kept, not shown). */
    hiddenCount,
    /** True when the plan on screen is a saved profile rather than the suggested plan. */
    isCustom: saved !== null,
    activeProfile,
    profiles,
    /** True once a plan list has arrived (stays false while the request keeps failing: see `profilesError`). */
    profilesLoaded,
    /** Why the plan list could not be loaded, or null. `refreshProfiles` tries again. */
    profilesError,
    refreshProfiles,
    weekOf: (topicId: string): number | null => weekOfIn(plan, topicId),
    /** The ids in `week`, in the learner's order. */
    weekQuestions: (week: number): string[] => weekQuestionsOf(plan, week, rank),
    /** Ids of the lab's questions that are in no week, in learning order. */
    queue: queueList,
    /** Moves a question to `week` (null = the queue) at `index` in that week (default: the end). */
    move: (topicId: string, week: number | null, index?: number) =>
      edit((p) =>
        moveQuestion(
          p,
          topicId,
          week,
          index === undefined || week === null ? index : storedIndex(p, topicId, week, index),
          live.current.rank
        )
      ),
    swap: (a: string, b: string) => edit((p) => swapQuestions(p, a, b, live.current.rank)),
    addWeek: (after?: number) => edit((p) => addWeekTo(p, after)),
    removeWeek: (week: number) => edit((p) => removeWeekFrom(p, week)),
    moveWeek: (from: number, to: number) => edit((p) => moveWeekTo(p, from, to)),
    /** Empties `week` (its questions go back to the queue); returns why not, or null. */
    clearWeek: (week: number) => edit((p) => clearWeekOf(p, week)),
    /** Sets (or, with '', removes) the week's focus label; returns why not, or null. */
    setWeekLabel: (week: number, label: string) => edit((p) => setWeekLabelOf(p, week, label)),
    /** Fills `week` up to 7 from `ids` (default: the recommendations for that week). */
    fillWeek: (week: number, ids?: string[]) =>
      edit((p) => fillWeekOf(p, week, ids ?? recommendForWeek(week, 7), live.current.rank)),
    /** Redistributes the planned questions evenly over every week; returns why not, or null. */
    spreadEvenly: () => edit((p) => spreadEvenlyOf(p, live.current.rank)),
    /** Replaces the plan's content (undoable), e.g. with a quick plan. */
    apply: (next: WeekPlan): void => {
      edit(() => ({ plan: prune(normalizePlan(next), live.current.known) }));
    },
    /** Replaces the plan with the core questions cut into `weeks` weeks of at most `perWeek`. */
    generate: (weeks: number, perWeek: number): void => {
      edit(() => ({ plan: generateWeekPlan(live.current.coreOrder, weeks, perWeek) }));
    },
    /** Replaces the active plan's content with the suggested plan (undoable). */
    resetToSuggested: (): void => {
      edit(() => ({ plan: live.current.suggested }));
    },
    useSuggested: showSuggested,
    /** @deprecated Use `useSuggested` (shows the suggested plan) or `resetToSuggested` (overwrites the active one). */
    reset: (): void => {
      void showSuggested();
    },
    undo: () => step(undoStack, redoStack),
    redo: () => step(redoStack, undoStack),
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    switchProfile,
    saveAsProfile,
    renameProfile,
    deleteProfile,
    duplicateProfile,
    nextProfileName,
    autoOrganize,
    /** Up to `limit` queue questions that suit `week`, best first. */
    recommendForWeek,
    insights,
  };
}

export type WeekPlanApi = ReturnType<typeof useWeekPlan>;
