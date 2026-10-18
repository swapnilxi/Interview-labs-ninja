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
 * Learning order of the core questions, by LeetCode number. Cut in sevens it gives: 1 hashing & prefix
 * sums, 2 pointers & windows, 3 lists / stacks / search, 4 trees / graphs / backtracking, 5 dynamic
 * programming, 6 greedy / intervals / heaps. The tail is what a shorter plan drops first.
 *
 * Matched by LeetCode number rather than topic id because the same questions have different ids in the
 * two places the lab gets its topics from: the seeded database (`hm-two-sum`, FastAPI mode) and the
 * built-in fallback list (`dsa-20`, nextjs-api mode). Both carry "LC #n" in the brief.
 */
export const CORE_LC = [
  // Week 1 — hashing & prefix sums
  1, // Two Sum
  49, // Group Anagrams
  347, // Top K Frequent Elements
  128, // Longest Consecutive Sequence
  303, // Range Sum Query - Immutable
  560, // Subarray Sum Equals K
  238, // Product of Array Except Self
  // Week 2 — two pointers & sliding window
  680, // Valid Palindrome II
  15, // 3Sum
  11, // Container With Most Water
  42, // Trapping Rain Water
  3, // Longest Substring Without Repeating Characters
  424, // Longest Repeating Character Replacement
  76, // Minimum Window Substring
  // Week 3 — linked lists, stacks & binary search
  206, // Reverse Linked List
  21, // Merge Two Sorted Lists
  142, // Linked List Cycle II
  496, // Next Greater Element I
  739, // Daily Temperatures
  33, // Search in Rotated Sorted Array
  875, // Koko Eating Bananas
  // Week 4 — trees, graphs & backtracking
  102, // Binary Tree Level Order Traversal
  98, // Validate Binary Search Tree
  236, // Lowest Common Ancestor
  200, // Number of Islands
  133, // Clone Graph
  207, // Course Schedule
  39, // Combination Sum
  // Week 5 — dynamic programming
  198, // House Robber
  322, // Coin Change
  300, // Longest Increasing Subsequence
  91, // Decode Ways
  62, // Unique Paths
  1143, // Longest Common Subsequence
  72, // Edit Distance
  // Week 6 — greedy, intervals & heaps
  55, // Jump Game
  134, // Gas Station
  56, // Merge Intervals
  435, // Non-Overlapping Intervals
  215, // Kth Largest Element in an Array
  23, // Merge K Sorted Lists
  621, // Task Scheduler
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

/** The LeetCode number in a topic's brief ("LC #560 [Medium] — …" or "LC #560 - …"), or null. */
export function lcNumber(brief: string): number | null {
  const m = /LC\s+#(\d+)/.exec(brief);
  return m ? Number(m[1]) : null;
}

/** Ids of the core questions that exist in `topics`, in learning order (see CORE_LC for why by LC number). */
export function coreOrder(topics: readonly { id: string; brief: string }[]): string[] {
  const idByLc = new Map<number, string>();
  for (const t of topics) {
    const n = lcNumber(t.brief);
    if (n !== null && !idByLc.has(n)) idByLc.set(n, t.id);
  }
  return CORE_LC.flatMap((n) => {
    const id = idByLc.get(n);
    return id ? [id] : [];
  });
}

/** The suggested plan: the core questions that exist in `topics`, six weeks of seven. */
export function suggestedPlan(topics: readonly { id: string; brief: string }[]): WeekPlan {
  return generateWeekPlan(coreOrder(topics), DEFAULT_WEEKS, DEFAULT_PER_WEEK);
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
