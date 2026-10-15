/**
 * The DSA lab's week-by-week study plan: which question sits in which week.
 *
 * The suggested plan lives here: a curated core of 42 questions in learning order, cut into six
 * weeks of seven. The other seeded questions are deliberately in no week (the week tag is optional);
 * the learner can pull any of them in. A learner's own plan is saved server-side as the whole
 * `{ weeks, assignments }` map (see backend/modules/dsa_lab/week_plan.py and fe-apis/dsaLab).
 */

/** Most questions one week may hold (the backend enforces the same limit). */
export const WEEK_CAP = 7;
export const DEFAULT_WEEKS = 6;
export const DEFAULT_PER_WEEK = 7;
export const WEEK_COUNT_OPTIONS = [5, 6] as const;
export const PER_WEEK_OPTIONS = [5, 6, 7] as const;

export interface WeekPlan {
  weeks: number;
  /** topic id → week number (1-based). A question that isn't listed is in no week. */
  assignments: Record<string, number>;
}

/**
 * Learning order of the core questions. Cut in sevens it gives: 1 hashing & prefix sums, 2 pointers &
 * windows, 3 lists / stacks / search, 4 trees / graphs / backtracking, 5 dynamic programming,
 * 6 greedy / intervals / heaps. The tail is what a shorter plan drops first.
 */
export const CORE_ORDER = [
  // Week 1 — hashing & prefix sums
  'hm-two-sum',
  'hm-group-anagrams',
  'hm-top-k-frequent',
  'hm-longest-consecutive',
  'ps-range-sum-query',
  'ps-subarray-sum-k',
  'ps-product-except-self',
  // Week 2 — two pointers & sliding window
  'tp-valid-palindrome-ii',
  'tp-3sum',
  'tp-container-most-water',
  'tp-trapping-rain-water',
  'sw-longest-no-repeat',
  'sw-longest-repeating-replacement',
  'sw-min-window-substring',
  // Week 3 — linked lists, stacks & binary search
  'll-reverse-linked-list',
  'll-merge-two-sorted-lists',
  'fs-linked-list-cycle-ii',
  'ms-next-greater-element',
  'ms-daily-temperatures',
  'bs-search-rotated-array',
  'bs-koko-bananas',
  // Week 4 — trees, graphs & backtracking
  'tr-level-order-traversal',
  'tr-validate-bst',
  'tr-lowest-common-ancestor',
  'gr-number-of-islands',
  'gr-clone-graph',
  'gr-course-schedule',
  'bt-combination-sum',
  // Week 5 — dynamic programming
  'dp1-house-robber',
  'dp1-coin-change',
  'dp1-lis',
  'dp1-decode-ways',
  'dp2-unique-paths',
  'dp2-lcs',
  'dp2-edit-distance',
  // Week 6 — greedy, intervals & heaps
  'gr2-jump-game',
  'gr2-gas-station',
  'iv-merge-intervals',
  'iv-non-overlapping-intervals',
  'hp-kth-largest',
  'hp-merge-k-sorted-lists',
  'hp-task-scheduler',
] as const;

/**
 * Fills `weeks` weeks in learning order, as evenly as possible and never above `perWeek` each.
 * Whatever doesn't fit (more than weeks × perWeek questions) is left out of the plan.
 */
export function generateWeekPlan(
  order: readonly string[],
  weeks: number,
  perWeek: number
): WeekPlan {
  const n = Math.min(order.length, weeks * perWeek);
  const size = Math.max(1, Math.ceil(n / weeks));
  const assignments: Record<string, number> = {};
  order.slice(0, n).forEach((id, i) => {
    assignments[id] = Math.floor(i / size) + 1;
  });
  return { weeks, assignments };
}

/** The suggested plan for whichever of the core questions exist in `availableIds`. */
export function suggestedPlan(availableIds: ReadonlySet<string>): WeekPlan {
  return generateWeekPlan(
    CORE_ORDER.filter((id) => availableIds.has(id)),
    DEFAULT_WEEKS,
    DEFAULT_PER_WEEK
  );
}

export function weekCounts(plan: WeekPlan): number[] {
  const counts = Array.from({ length: plan.weeks }, () => 0);
  for (const week of Object.values(plan.assignments))
    if (week >= 1 && week <= plan.weeks) counts[week - 1]++;
  return counts;
}

/** Moves a question to `week` (null = out of every week). Fails, with a message, if that week is full. */
export function moveQuestion(
  plan: WeekPlan,
  topicId: string,
  week: number | null
): { plan: WeekPlan } | { error: string } {
  const current = plan.assignments[topicId] ?? null;
  if (current === week) return { plan };
  const assignments = { ...plan.assignments };
  if (week === null) {
    delete assignments[topicId];
    return { plan: { ...plan, assignments } };
  }
  if (week < 1 || week > plan.weeks) return { error: `There is no week ${week} in this plan.` };
  if (weekCounts(plan)[week - 1] >= WEEK_CAP) {
    return {
      error: `Week ${week} is full (${WEEK_CAP}/${WEEK_CAP}). Move a question out of it first.`,
    };
  }
  assignments[topicId] = week;
  return { plan: { ...plan, assignments } };
}

/** "Hashmap & Frequency Counting · Prefix Sum & Cumulative Logic": the patterns a week mostly covers. */
export function weekTheme(categories: string[]): string {
  const counts = new Map<string, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name)
    .join(' · ');
}
