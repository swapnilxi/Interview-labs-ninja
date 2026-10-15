'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWeekPlan, resetWeekPlan, saveWeekPlan } from '@/lib/services/dsaWeekPlanService';
import {
  generateWeekPlan,
  moveQuestion,
  suggestedPlan,
  CORE_ORDER,
  type WeekPlan,
} from './weekPlan';

/**
 * The learner's week plan: their saved one if they have changed anything, otherwise the suggested
 * plan. Edits show immediately and are saved in the background; if a save fails the plan snaps back
 * to the last saved state and `error` says why.
 */
export function useWeekPlan(topics: { id: string }[]) {
  const [saved, setSaved] = useState<WeekPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = useRef<WeekPlan | null>(null); // last state the server confirmed
  const queue = useRef<Promise<void>>(Promise.resolve()); // saves go out one at a time, in order

  useEffect(() => {
    fetchWeekPlan()
      .then((p) => {
        confirmed.current = p;
        setSaved(p);
      })
      // Without a saved plan the suggested one still works; only saving would fail.
      .catch((e) => console.error('week plan:', e))
      .finally(() => setLoaded(true));
  }, []);

  const availableKey = topics.map((t) => t.id).join('|');
  const suggested = useMemo(
    () => suggestedPlan(new Set(availableKey ? availableKey.split('|') : [])),
    [availableKey]
  );
  const plan = saved ?? suggested;

  const commit = useCallback((next: WeekPlan | null) => {
    setSaved(next);
    setError(null);
    queue.current = queue.current.then(async () => {
      try {
        if (next === null) {
          await resetWeekPlan();
          confirmed.current = null;
        } else {
          confirmed.current = await saveWeekPlan(next);
        }
      } catch (e) {
        setSaved(confirmed.current);
        setError(e instanceof Error ? e.message : 'Could not save the week plan.');
      }
    });
  }, []);

  /** Returns a message when the move isn't allowed (target week full), otherwise null. */
  const move = (topicId: string, week: number | null): string | null => {
    const result = moveQuestion(plan, topicId, week);
    if ('error' in result) {
      setError(result.error);
      return result.error;
    }
    if (result.plan !== plan) commit(result.plan);
    return null;
  };

  const generate = (weeks: number, perWeek: number) => {
    const available = new Set(availableKey ? availableKey.split('|') : []);
    commit(
      generateWeekPlan(
        CORE_ORDER.filter((id) => available.has(id)),
        weeks,
        perWeek
      )
    );
  };

  const reset = () => commit(null);

  return {
    plan,
    loaded,
    error,
    clearError: () => setError(null),
    /** True once the learner has changed the suggested plan. */
    isCustom: saved !== null,
    weekOf: (topicId: string): number | null => plan.assignments[topicId] ?? null,
    move,
    generate,
    reset,
  };
}

export type WeekPlanApi = ReturnType<typeof useWeekPlan>;
