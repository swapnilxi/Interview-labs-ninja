/**
 * The DSA lab's week-by-week study plan: which question sits in which week, in what order, and each
 * week's short focus label.
 *
 * The suggested plan lives here: a curated core of 42 questions in learning order, cut into six
 * weeks of seven. The other seeded questions are deliberately in no week (the week tag is optional);
 * the learner can pull any of them in. A learner's own plans are saved server-side as plan profiles,
 * each holding the whole `{ weeks, assignments, order, labels }` object (see
 * backend/modules/dsa_lab/week_plan.py and fe-apis/dsaLab). Everything here is pure (no React, no
 * I/O): the edits the organizer makes, the recommendations, the plan insights and the no-AI quick plan.
 */
import { CATEGORY_KEYS } from './prerequisites';

/** Most questions one week may hold (the backend enforces the same limit). */
export const WEEK_CAP = 7;
/** Most weeks one plan may have (both backends enforce it). */
export const MAX_WEEKS = 24;
/** Most saved plans (profiles) one learner may keep. */
export const MAX_PROFILES = 20;
/** Longest plan name, after trimming. */
export const NAME_MAX = 60;
/** Longest week focus label, after trimming. */
export const LABEL_MAX = 60;
/** Longest plan summary, after trimming. */
export const SUMMARY_MAX = 600;
/** Most entries `assignments` and `order` may each hold on the wire. */
export const MAX_ENTRIES = 500;
/** Weeks per visual block in the week view and the organizer. */
export const BLOCK_SIZE = 4;
export const DEFAULT_WEEKS = 6;
export const DEFAULT_PER_WEEK = 7;
export const WEEK_COUNT_OPTIONS = [5, 6] as const;
export const PER_WEEK_OPTIONS = [5, 6, 7] as const;

export interface WeekPlan {
  weeks: number;
  /** topic id → week number (1-based). A question that isn't listed is in no week (the queue). */
  assignments: Record<string, number>;
  /** The learner's sequence: inside a week, questions sort by their index here. */
  order: string[];
  /** "<week number>" → short focus label (at most LABEL_MAX characters), e.g. { "3": "Graphs" }. */
  labels: Record<string, string>;
}

/** What the planning helpers need from a question (a DSATopic fits). */
export interface PlanTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
}

/** Learning-order position of a question id: lower comes first. */
export type RankFn = (id: string) => number;

/** Result of a plan edit: the new plan (the very same object when nothing changed) or a message for the learner. */
export type EditResult = { plan: WeekPlan } | { error: string };

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= 1 && v.length <= 200 && v !== '__proto__';
const clampInt = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.trunc(v) : lo));
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const NO_RANK: RankFn = () => 0;

/** The message every edit gives when a question would push a week past WEEK_CAP. */
export function weekFullMessage(week: number): string {
  return `Week ${week} is full (${WEEK_CAP}/${WEEK_CAP}). Move a question out of it first.`;
}
const noWeekMessage = (week: number) => `There is no week ${week} in this plan.`;
const isWeek = (plan: WeekPlan, week: unknown): week is number =>
  isInt(week) && week >= 1 && week <= plan.weeks;

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

/** Sizes that cut `n` items into `parts` groups as evenly as possible, the larger groups first. */
export function evenSizes(n: number, parts: number): number[] {
  if (parts < 1) return [];
  const base = Math.floor(Math.max(0, n) / parts);
  const extra = Math.max(0, n) % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Cuts a sequence into consecutive groups of the given sizes. */
function cut(ids: readonly string[], sizes: number[]): string[][] {
  let at = 0;
  return sizes.map((size) => {
    const group = ids.slice(at, at + size);
    at += size;
    return group;
  });
}

/** A plan whose weeks hold exactly these lists (lists[0] = week 1), in this order; labels are kept. */
function fromLists(labels: Record<string, string>, lists: string[][]): WeekPlan {
  const assignments: Record<string, number> = {};
  const order: string[] = [];
  lists.forEach((ids, i) => {
    for (const id of ids) {
      assignments[id] = i + 1;
      order.push(id);
    }
  });
  return { weeks: lists.length, assignments, order, labels };
}

/**
 * Fills `weeks` weeks in learning order, as evenly as possible and never above `perWeek` each.
 * Whatever doesn't fit (more than weeks × perWeek questions) is left out of the plan.
 */
export function generateWeekPlan(
  order: readonly string[],
  weeks: number,
  perWeek: number
): WeekPlan {
  const w = clampInt(weeks, 1, MAX_WEEKS);
  const ids = [...new Set(order)].slice(0, w * clampInt(perWeek, 1, WEEK_CAP));
  return fromLists({}, cut(ids, evenSizes(ids.length, w)));
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

/** A well-formed plan from anything (a server reply, saved JSON): junk entries dropped, weeks capped at WEEK_CAP. */
export function normalizePlan(raw: unknown): WeekPlan {
  const src = isRecord(raw) ? raw : {};
  const weeks = isInt(src.weeks) && src.weeks >= 1 ? Math.min(src.weeks, MAX_WEEKS) : DEFAULT_WEEKS;
  const pos = new Map<string, number>();
  for (const id of Array.isArray(src.order) ? src.order : [])
    if (isId(id) && !pos.has(id)) pos.set(id, pos.size);
  const listed = Object.entries(isRecord(src.assignments) ? src.assignments : {}).filter(
    (e): e is [string, number] => isId(e[0]) && isInt(e[1]) && e[1] >= 1 && e[1] <= weeks
  );
  // The learner's sequence first, so an over-full week keeps the questions placed first.
  const at = (id: string) => pos.get(id) ?? Number.MAX_SAFE_INTEGER;
  listed.sort((a, b) => at(a[0]) - at(b[0]));
  const assignments: Record<string, number> = {};
  const counts = new Map<number, number>();
  for (const [id, week] of listed) {
    if ((counts.get(week) ?? 0) >= WEEK_CAP) continue;
    counts.set(week, (counts.get(week) ?? 0) + 1);
    assignments[id] = week;
  }
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(isRecord(src.labels) ? src.labels : {})) {
    if (!/^[1-9][0-9]*$/.test(key) || Number(key) > weeks || typeof value !== 'string') continue;
    const label = value.trim().slice(0, LABEL_MAX).trim();
    if (label) labels[key] = label;
  }
  return {
    weeks,
    assignments,
    order: [...pos.keys()].filter((id) => hasOwn(assignments, id)),
    labels,
  };
}

/** True when two plans hold the same weeks, assignments, order and labels. */
export function samePlan(a: WeekPlan, b: WeekPlan): boolean {
  if (a === b) return true;
  if (a.weeks !== b.weeks || a.order.length !== b.order.length) return false;
  if (a.order.some((id, i) => id !== b.order[i])) return false;
  const sameMap = <T>(x: Record<string, T>, y: Record<string, T>) => {
    const keys = Object.keys(x);
    return (
      keys.length === Object.keys(y).length && keys.every((k) => hasOwn(y, k) && x[k] === y[k])
    );
  };
  return sameMap(a.assignments, b.assignments) && sameMap(a.labels, b.labels);
}

/** A rank function from ids in learning order; unknown ids rank after all of them. */
export function rankOf(ids: readonly string[]): RankFn {
  const index = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!index.has(id)) index.set(id, i);
  });
  return (id) => index.get(id) ?? ids.length;
}

/** The week a question sits in, or null when it is in no week (the queue). */
export function weekOf(plan: WeekPlan, id: string): number | null {
  const week = hasOwn(plan.assignments, id) ? plan.assignments[id] : undefined;
  return isWeek(plan, week) ? week : null;
}

/** Every week's ordered ids (lists[0] = week 1): by index in `order`, the rest by rank, then by id. */
function weekLists(plan: WeekPlan, rank: RankFn): string[][] {
  const pos = new Map<string, number>();
  plan.order.forEach((id, i) => {
    if (!pos.has(id)) pos.set(id, i);
  });
  const lists: string[][] = Array.from({ length: plan.weeks }, () => []);
  for (const [id, week] of Object.entries(plan.assignments))
    if (isWeek(plan, week)) lists[week - 1].push(id);
  for (const list of lists)
    list.sort((a, b) => {
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (pa !== undefined || pb !== undefined) {
        if (pa === undefined) return 1;
        if (pb === undefined) return -1;
        return pa - pb;
      }
      return rank(a) - rank(b) || compareIds(a, b);
    });
  return lists;
}

/** The ids in `week`, in the learner's order (ids missing from `order` follow by rank, then id). */
export function weekQuestions(plan: WeekPlan, week: number, rank: RankFn = NO_RANK): string[] {
  return isWeek(plan, week) ? weekLists(plan, rank)[week - 1] : [];
}

/** The ids of `allIds` that are in no week, keeping the order of `allIds`. */
export function queueIds(plan: WeekPlan, allIds: readonly string[]): string[] {
  return allIds.filter((id) => weekOf(plan, id) === null);
}

/** How many questions each week holds (index 0 = week 1). */
export function weekCounts(plan: WeekPlan): number[] {
  const counts = Array.from({ length: plan.weeks }, () => 0);
  for (const week of Object.values(plan.assignments)) if (isWeek(plan, week)) counts[week - 1]++;
  return counts;
}

/** The plan with assignments remapped by `mapWeek` (null = to the queue) and labels moved along. */
function remapWeeks(
  plan: WeekPlan,
  weeks: number,
  mapWeek: (week: number) => number | null
): WeekPlan {
  const assignments: Record<string, number> = {};
  for (const [id, week] of Object.entries(plan.assignments)) {
    const next = isWeek(plan, week) ? mapWeek(week) : null;
    if (next !== null) assignments[id] = next;
  }
  const labels: Record<string, string> = {};
  for (const [key, label] of Object.entries(plan.labels)) {
    const next = isWeek(plan, Number(key)) ? mapWeek(Number(key)) : null;
    if (next !== null) labels[String(next)] = label;
  }
  return { weeks, assignments, order: plan.order.filter((id) => hasOwn(assignments, id)), labels };
}

/**
 * Moves a question to `week` (null = out of every week, back to the queue), at `index` in that week's
 * ordered list (default: the end; for a move inside the same week, the question's new position).
 * Rewrites `order` as every week's list in turn. Fails, with a message, if the target week is full.
 */
export function moveQuestion(
  plan: WeekPlan,
  topicId: string,
  week: number | null,
  index?: number,
  rank: RankFn = NO_RANK
): EditResult {
  if (week !== null && !isWeek(plan, week)) return { error: noWeekMessage(week) };
  const current = weekOf(plan, topicId);
  if (week === null && current === null) return { plan };
  if (week !== null && week === current && index === undefined) return { plan };
  const lists = weekLists(plan, rank);
  if (week !== null && week !== current && lists[week - 1].length >= WEEK_CAP)
    return { error: weekFullMessage(week) };
  const from = current === null ? -1 : lists[current - 1].indexOf(topicId);
  if (current !== null) lists[current - 1].splice(from, 1);
  if (week !== null) {
    const target = lists[week - 1];
    const to = index === undefined ? target.length : clampInt(index, 0, target.length);
    if (week === current && to === from) return { plan };
    target.splice(to, 0, topicId);
  }
  return { plan: fromLists(plan.labels, lists) };
}

/**
 * Exchanges two questions' slots (week and position); either may be in the queue. Week sizes don't
 * change, so this is how a card dropped onto a card in a full week still lands.
 */
export function swapQuestions(
  plan: WeekPlan,
  a: string,
  b: string,
  rank: RankFn = NO_RANK
): EditResult {
  const wa = weekOf(plan, a);
  const wb = weekOf(plan, b);
  if (a === b || (wa === null && wb === null)) return { plan };
  const lists = weekLists(plan, rank);
  const ia = wa === null ? -1 : lists[wa - 1].indexOf(a);
  const ib = wb === null ? -1 : lists[wb - 1].indexOf(b);
  if (wa !== null) lists[wa - 1][ia] = b;
  if (wb !== null) lists[wb - 1][ib] = a;
  return { plan: fromLists(plan.labels, lists) };
}

/** Inserts an empty week after week `after` (0 = at the start; default: at the end). Later weeks and labels shift up. */
export function addWeek(plan: WeekPlan, after: number = plan.weeks): EditResult {
  if (plan.weeks >= MAX_WEEKS) return { error: `A plan can have at most ${MAX_WEEKS} weeks.` };
  const at = clampInt(after, 0, plan.weeks);
  return { plan: remapWeeks(plan, plan.weeks + 1, (w) => (w > at ? w + 1 : w)) };
}

/** Removes a week: its questions go back to the queue, later weeks and labels shift down. */
export function removeWeek(plan: WeekPlan, week: number): EditResult {
  if (!isWeek(plan, week)) return { error: noWeekMessage(week) };
  if (plan.weeks <= 1) return { error: 'A plan needs at least one week.' };
  return {
    plan: remapWeeks(plan, plan.weeks - 1, (w) => (w === week ? null : w > week ? w - 1 : w)),
  };
}

/** Moves week `from` to position `to` (questions, their order and the label travel together); the weeks between shift by one. */
export function moveWeek(plan: WeekPlan, from: number, to: number): EditResult {
  if (!isWeek(plan, from)) return { error: noWeekMessage(from) };
  if (!isWeek(plan, to)) return { error: noWeekMessage(to) };
  if (from === to) return { plan };
  return {
    plan: remapWeeks(plan, plan.weeks, (w) => {
      if (w === from) return to;
      if (from < to && w > from && w <= to) return w - 1;
      if (from > to && w >= to && w < from) return w + 1;
      return w;
    }),
  };
}

/** Sends every question in `week` back to the queue (the week and its label stay). */
export function clearWeek(plan: WeekPlan, week: number): EditResult {
  if (!isWeek(plan, week)) return { error: noWeekMessage(week) };
  if (!weekCounts(plan)[week - 1]) return { plan };
  const cleared = remapWeeks(plan, plan.weeks, (w) => (w === week ? null : w));
  return { plan: { ...cleared, labels: plan.labels } };
}

/** Sets a week's focus label (trimmed, at most LABEL_MAX characters; empty removes it). */
export function setWeekLabel(plan: WeekPlan, week: number, label: string): EditResult {
  if (!isWeek(plan, week)) return { error: noWeekMessage(week) };
  const key = String(week);
  const clean = label.trim().slice(0, LABEL_MAX).trim();
  if ((plan.labels[key] ?? '') === clean) return { plan };
  const labels = { ...plan.labels };
  if (clean) labels[key] = clean;
  else delete labels[key];
  return { plan: { ...plan, labels } };
}

/** Appends queue questions from `candidateIds` (in that order) to `week` until it holds WEEK_CAP. */
export function fillWeek(
  plan: WeekPlan,
  week: number,
  candidateIds: readonly string[],
  rank: RankFn = NO_RANK
): EditResult {
  if (!isWeek(plan, week)) return { error: noWeekMessage(week) };
  const lists = weekLists(plan, rank);
  const target = lists[week - 1];
  if (target.length >= WEEK_CAP) return { error: weekFullMessage(week) };
  const before = target.length;
  for (const id of candidateIds) {
    if (target.length >= WEEK_CAP) break;
    if (isId(id) && weekOf(plan, id) === null && !target.includes(id)) target.push(id);
  }
  if (target.length === before)
    return { error: `There are no questions left to add to week ${week}.` };
  return { plan: fromLists(plan.labels, lists) };
}

/** Keeps the whole sequence (week 1 first) but redistributes it as evenly as possible over every week. */
export function spreadEvenly(plan: WeekPlan, rank: RankFn = NO_RANK): EditResult {
  const lists = weekLists(plan, rank);
  const sequence = lists.flat().slice(0, plan.weeks * WEEK_CAP);
  const next = cut(sequence, evenSizes(sequence.length, plan.weeks));
  if (next.every((ids, i) => ids.length === lists[i].length)) return { plan };
  return { plan: fromLists(plan.labels, next) };
}

/** How many blocks of BLOCK_SIZE weeks a plan of `weeks` weeks has. */
export function blockCount(weeks: number): number {
  return Math.max(0, Math.ceil(weeks / BLOCK_SIZE));
}

/** The week numbers in block `block` (0-based: block 0 is weeks 1-4); the last block may be shorter. */
export function blockWeeks(block: number, weeks: number): number[] {
  const first = block * BLOCK_SIZE + 1;
  const last = Math.min(weeks, first + BLOCK_SIZE - 1);
  return first > last ? [] : Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** The 0-based block a week falls in. */
export function blockOf(week: number): number {
  return Math.floor((week - 1) / BLOCK_SIZE);
}

/** "Weeks 1–4" for a block's caption ("Week 9" when the block has a single week). */
export function blockLabel(block: number, weeks: number): string {
  const list = blockWeeks(block, weeks);
  if (list.length <= 1) return `Week ${list[0] ?? block * BLOCK_SIZE + 1}`;
  return `Weeks ${list[0]}–${list[list.length - 1]}`;
}

/** Sort weight of a difficulty: Easy 0, Easy-Medium 1, Medium 2, Medium-Hard 3, Hard 4, anything else 2. */
export function difficultyRank(difficulty: string): number {
  switch (difficulty.trim().toLowerCase()) {
    case 'easy':
      return 0;
    case 'easy-medium':
      return 1;
    case 'medium-hard':
      return 3;
    case 'hard':
      return 4;
    default:
      return 2;
  }
}

export type DifficultyGroup = 'easy' | 'medium' | 'hard';
/** The Easy / Medium / Hard group a difficulty filters and charts under. */
export function difficultyGroup(difficulty: string): DifficultyGroup {
  const r = difficultyRank(difficulty);
  return r <= 1 ? 'easy' : r >= 3 ? 'hard' : 'medium';
}
const isHard = (difficulty: string) => difficultyRank(difficulty) === 4;

/** A pattern's matching key, so spellings like "BFS / DFS on Graphs" and "Bfs / Dfs On Graphs" agree. */
export function patternKey(category: string): string {
  const c = category.toLowerCase();
  const hit = CATEGORY_KEYS.find(([re]) => re.test(c));
  return hit ? hit[1] : c.replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Pattern keys in learning order: the core plan's weeks (hashing, pointers and windows, lists / stacks
 * / search, trees / graphs / backtracking, DP, greedy / intervals / heaps), with the patterns the core
 * leaves out placed after what they build on. Custom categories follow, in the order topics list them.
 */
const PATTERN_SEQUENCE = [
  'hashmap',
  'prefixSum',
  'twoPointers',
  'slidingWindow',
  'matrix',
  'linkedList',
  'fastSlow',
  'monotonicStack',
  'binarySearch',
  'tree',
  'graph',
  'backtracking',
  'trie',
  'unionFind',
  'dp1d',
  'dp2d',
  'greedy',
  'intervals',
  'heap',
  'bit',
];

/** Pattern key → position in learning order, covering every pattern in `topics`. */
function patternSequence(topics: readonly PlanTopic[]): Map<string, number> {
  const seq = new Map(PATTERN_SEQUENCE.map((key, i) => [key, i]));
  for (const t of topics) {
    const key = patternKey(t.category);
    if (!seq.has(key)) seq.set(key, seq.size);
  }
  return seq;
}

/** The patterns in `topics`, in learning order: key, display name (first spelling seen) and topic ids. */
export function patternGroups(
  topics: readonly PlanTopic[]
): { key: string; name: string; ids: string[] }[] {
  const seq = patternSequence(topics);
  const groups = new Map<string, { key: string; name: string; ids: string[] }>();
  for (const t of topics) {
    const key = patternKey(t.category);
    const group = groups.get(key) ?? { key, name: t.category, ids: [] };
    group.ids.push(t.id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (seq.get(a.key) ?? 0) - (seq.get(b.key) ?? 0));
}

/**
 * Every topic id in learning order: the core questions first, then the rest by pattern, difficulty and
 * LeetCode number (the same order in both topic sources, whatever order they list the topics in).
 */
export function learningOrder(
  topics: readonly PlanTopic[],
  core: readonly string[] = coreOrder(topics)
): string[] {
  const known = new Set(topics.map((t) => t.id));
  const head = [...new Set(core)].filter((id) => known.has(id));
  const seen = new Set(head);
  const seq = patternSequence(topics);
  const rest: { t: PlanTopic; i: number; p: number; d: number; lc: number }[] = [];
  topics.forEach((t, i) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    const p = seq.get(patternKey(t.category)) ?? 0;
    rest.push({ t, i, p, d: difficultyRank(t.difficulty), lc: lcNumber(t.brief) ?? Infinity });
  });
  rest.sort(
    (a, b) => a.p - b.p || a.d - b.d || (a.lc === b.lc ? 0 : a.lc < b.lc ? -1 : 1) || a.i - b.i
  );
  return [...head, ...rest.map((r) => r.t.id)];
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

/** weekTheme cut to LABEL_MAX characters (only the main pattern when the two don't fit). */
function themeLabel(categories: string[]): string {
  const theme = weekTheme(categories);
  if (theme.length <= LABEL_MAX) return theme;
  return theme.split(' · ')[0].slice(0, LABEL_MAX).trim();
}

/** "A, B and C" or, past `max` names, "A, B, C, D and 3 more". */
function listNames(names: string[], max = 4): string {
  if (names.length > max) return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What recommendations and insights look at: the plan, the lab's questions and what is solved. */
export interface PlanContext {
  plan: WeekPlan;
  topics: readonly PlanTopic[];
  coreOrder: readonly string[];
  isDone?: (id: string) => boolean;
}

/** Shared lookups for recommendations and insights, built once per call (cheap for 80 topics). */
function analyse(plan: WeekPlan, topics: readonly PlanTopic[], core: readonly string[]) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const seq = patternSequence(topics);
  const order = learningOrder(topics, core);
  const rank = rankOf(order);
  const keyOf = (id: string) => patternKey(byId.get(id)?.category ?? '');
  const lists = weekLists(plan, rank).map((ids) => ids.filter((id) => byId.has(id)));
  return { byId, seq, order, rank, keyOf, lists };
}

/**
 * Up to `limit` queue questions that fit `week`, best first: the week's own patterns first (for an
 * empty week, the previous non-empty week's patterns plus the next two patterns in learning order),
 * then the patterns that come next after the plan so far, then the rest. Inside each group: unsolved
 * first, then the difficulty that suits the week's place in the plan (early weeks easier), then
 * learning order. Doesn't look at how full the week is.
 */
export function recommendForWeek({
  plan,
  week,
  topics,
  coreOrder: core,
  isDone = () => false,
  limit = 3,
}: PlanContext & { week: number; limit?: number }): string[] {
  if (!isWeek(plan, week) || limit <= 0) return [];
  const { byId, seq, order, rank, keyOf, lists } = analyse(plan, topics, core);
  const queue = order.filter((id) => weekOf(plan, id) === null);
  if (!queue.length) return [];
  const seqOf = (key: string) => seq.get(key) ?? seq.size;
  const patternsIn = (w: number) => lists[w - 1].map(keyOf);

  const own = new Set(patternsIn(week));
  let frontier = -1; // furthest pattern (in learning order) planned up to this week
  for (let w = 1; w <= week; w++)
    for (const key of patternsIn(w)) frontier = Math.max(frontier, seqOf(key));
  if (!own.size) {
    for (let w = week - 1; w >= 1 && !own.size; w--) for (const key of patternsIn(w)) own.add(key);
    const next = [...new Set(queue.map(keyOf))]
      .filter((key) => seqOf(key) > frontier)
      .sort((a, b) => seqOf(a) - seqOf(b))
      .slice(0, 2);
    for (const key of next) own.add(key);
  }

  const place = plan.weeks <= 1 ? 0 : (week - 1) / (plan.weeks - 1);
  const target = 0.5 + place * 3; // between Easy and Easy-Medium in week 1, Medium-Hard to Hard at the end
  const score = (id: string): number[] => {
    const key = keyOf(id);
    const s = seqOf(key);
    const group = own.has(key) ? 0 : s > frontier ? 1 : 2;
    const distance = group === 0 ? 0 : Math.abs(s - frontier);
    const fit = Math.abs(difficultyRank(byId.get(id)?.difficulty ?? '') - target);
    return [group, distance, isDone(id) ? 1 : 0, fit, rank(id)];
  };
  const scored = queue.map((id) => ({ id, s: score(id) }));
  scored.sort((a, b) => {
    for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) return a.s[i] - b.s[i];
    return compareIds(a.id, b.id);
  });
  return scored.slice(0, limit).map((x) => x.id);
}

export interface Insight {
  id: string;
  tone: 'warning' | 'info' | 'success';
  title: string;
  detail: string;
  week?: number;
  action?: { kind: 'fill' | 'spread' | 'open-week'; week?: number; label: string };
}

/** Prerequisite → dependent pattern pairs the order check looks at. */
const PREREQ_PAIRS: [string, string][] = [
  ['twoPointers', 'slidingWindow'],
  ['linkedList', 'tree'],
  ['tree', 'graph'],
  ['backtracking', 'dp1d'],
  ['backtracking', 'dp2d'],
  ['dp1d', 'dp2d'],
  ['hashmap', 'prefixSum'],
];

/**
 * Plain-sentence observations about a plan, in a fixed order with stable ids: empty weeks between
 * planned ones, Hard-heavy weeks, a Hard question in week 1, patterns planned before what they build
 * on, an uneven weekly load, patterns with nothing planned, and completed weeks.
 */
export function planInsights({
  plan,
  topics,
  coreOrder: core,
  isDone = () => false,
}: PlanContext): Insight[] {
  const { byId, keyOf, lists } = analyse(plan, topics, core);
  const out: Insight[] = [];
  const counts = lists.map((ids) => ids.length);
  const groups = patternGroups(topics);
  const nameOf = new Map(groups.map((g) => [g.key, g.name]));
  const hardIn = (w: number) => lists[w - 1].filter((id) => isHard(byId.get(id)?.difficulty ?? ''));

  const firstPlanned = counts.findIndex((n) => n > 0) + 1;
  const lastPlanned = plan.weeks - [...counts].reverse().findIndex((n) => n > 0);
  for (let w = 1; w <= plan.weeks; w++) {
    if (firstPlanned > 0 && w > firstPlanned && w < lastPlanned && counts[w - 1] === 0)
      out.push({
        id: `empty-week-${w}`,
        tone: 'warning',
        title: `Week ${w} is empty`,
        detail:
          'It sits between weeks that have questions. Fill it with suggestions or remove the week.',
        week: w,
        action: { kind: 'fill', week: w, label: 'Fill with suggestions' },
      });
  }
  for (let w = 1; w <= plan.weeks; w++) {
    const hard = hardIn(w).length;
    if (hard >= 3)
      out.push({
        id: `hard-heavy-${w}`,
        tone: 'warning',
        title: `Week ${w} has ${hard} Hard questions`,
        detail:
          'That is a heavy week. Swap one or two for Medium questions, or move them to a later week.',
        week: w,
        action: { kind: 'open-week', week: w, label: `Go to week ${w}` },
      });
  }
  if (plan.weeks >= 1) {
    const hard = hardIn(1);
    if (hard.length)
      out.push({
        id: 'hard-week-1',
        tone: 'info',
        title:
          hard.length === 1
            ? 'Week 1 includes a Hard question'
            : `Week 1 includes ${hard.length} Hard questions`,
        detail: `${listNames(
          hard.map((id) => byId.get(id)?.name ?? id),
          2
        )} ${
          hard.length === 1 ? 'is' : 'are'
        } Hard. Opening with Easy and Medium questions builds momentum.`,
        week: 1,
      });
  }
  const firstWeek = new Map<string, number>();
  lists.forEach((ids, i) => {
    for (const id of ids) if (!firstWeek.has(keyOf(id))) firstWeek.set(keyOf(id), i + 1);
  });
  for (const [pre, dep] of PREREQ_PAIRS) {
    const preWeek = firstWeek.get(pre);
    const depWeek = firstWeek.get(dep);
    if (preWeek === undefined || depWeek === undefined || depWeek >= preWeek) continue;
    const preName = nameOf.get(pre) ?? pre;
    const depName = nameOf.get(dep) ?? dep;
    out.push({
      id: `order-${pre}-${dep}`,
      tone: 'info',
      title: `${depName} comes before ${preName}`,
      detail: `${depName} starts in week ${depWeek}, but ${preName}, which it builds on, starts in week ${preWeek}. Consider moving ${preName} earlier.`,
      week: depWeek,
    });
  }
  const loads = counts.filter((n) => n > 0);
  if (loads.length >= 2 && Math.max(...loads) - Math.min(...loads) >= 4)
    out.push({
      id: 'uneven-load',
      tone: 'info',
      title: 'Weekly load is uneven',
      detail: `Weeks hold between ${Math.min(...loads)} and ${Math.max(...loads)} questions. Spreading them evenly keeps every week about the same size.`,
      action: { kind: 'spread', label: 'Spread evenly' },
    });
  // Patterns with nothing planned (ignoring ones whose questions are all solved already).
  const missing = groups
    .filter((g) => !firstWeek.has(g.key) && g.ids.some((id) => !isDone(id)))
    .map((g) => g.name);
  if (missing.length)
    out.push({
      id: 'missing-patterns',
      tone: 'info',
      title:
        missing.length === 1
          ? '1 pattern has no planned question'
          : `${missing.length} patterns have no planned question`,
      detail: `${listNames(missing)} ${missing.length === 1 ? 'is' : 'are'} not in any week yet. Pull a question or two in to cover ${
        missing.length === 1 ? 'it' : 'them'
      }.`,
    });
  for (let w = 1; w <= plan.weeks; w++) {
    const ids = lists[w - 1];
    if (ids.length && ids.every((id) => isDone(id)))
      out.push({
        id: `done-week-${w}`,
        tone: 'success',
        title: `Week ${w} is complete`,
        detail:
          ids.length === 1
            ? `You have solved the only question in week ${w}.`
            : `You have solved all ${ids.length} questions in week ${w}.`,
        week: w,
      });
  }
  return out;
}

export type AutoLevel = 'new' | 'some' | 'confident';
export type AutoGoal = 'big-tech' | 'product' | 'startup' | 'general';
export type AutoDifficulty = 'gentle' | 'balanced' | 'stretch';
export type AutoStyle = 'focused' | 'mixed';

/** The auto organizer's questions: what POST /dsa/week-plan/auto takes as `answers`, plus the client-only `includeDone`. */
export interface AutoAnswers {
  weeks: number;
  perWeek: number;
  level: AutoLevel;
  goal: AutoGoal;
  difficulty: AutoDifficulty;
  style: AutoStyle;
  /** Pattern names to emphasise. */
  focus: string[];
  /** Pattern names the learner finds hard. */
  weak: string[];
  notes: string;
  /** Plan questions already marked complete too (otherwise they are left out). */
  includeDone: boolean;
}

/** The answers as the request sends them (no `includeDone`). */
export type AutoRequestAnswers = Omit<AutoAnswers, 'includeDone'>;

export interface AutoOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

export const LEVEL_OPTIONS: AutoOption<AutoLevel>[] = [
  { value: 'new', label: 'New to DSA', hint: 'Start with the fundamentals' },
  { value: 'some', label: 'Know the basics', hint: 'Comfortable with arrays and hashing' },
  { value: 'confident', label: 'Interview-ready', hint: 'Polishing and filling gaps' },
];
export const GOAL_OPTIONS: AutoOption<AutoGoal>[] = [
  { value: 'big-tech', label: 'Big tech', hint: 'FAANG-style interviews' },
  { value: 'product', label: 'Product companies', hint: 'Product-company interviews' },
  { value: 'startup', label: 'Startups', hint: 'Startup interviews' },
  { value: 'general', label: 'General practice', hint: 'Problem solving in general' },
];
export const DIFFICULTY_OPTIONS: AutoOption<AutoDifficulty>[] = [
  { value: 'gentle', label: 'Gentle', hint: 'Mostly Easy and Medium' },
  { value: 'balanced', label: 'Balanced', hint: 'Mostly Medium with some Hard' },
  { value: 'stretch', label: 'Stretch', hint: 'Plenty of Medium and Hard' },
];
export const STYLE_OPTIONS: AutoOption<AutoStyle>[] = [
  { value: 'focused', label: 'Focused weeks', hint: 'One or two related patterns per week' },
  { value: 'mixed', label: 'Mixed weeks', hint: 'Patterns blended within each week' },
];
/** Timeline presets offered by the wizard, in weeks. */
export const TIMELINE_PRESETS = [4, 6, 8, 12] as const;
/** Questions-per-week choices offered by the wizard. */
export const AUTO_PER_WEEK_OPTIONS = [3, 4, 5, 6, 7] as const;
/** Longest notes text the auto organizer accepts. */
export const NOTES_MAX = 400;

export const DEFAULT_AUTO_ANSWERS: AutoAnswers = {
  weeks: 8,
  perWeek: WEEK_CAP,
  level: 'some',
  goal: 'general',
  difficulty: 'balanced',
  style: 'focused',
  focus: [],
  weak: [],
  notes: '',
  includeDone: false,
};

/** Valid answers from anything (e.g. JSON restored from localStorage): bad fields fall back to the defaults. */
export function normalizeAutoAnswers(raw: unknown): AutoAnswers {
  const src = isRecord(raw) ? raw : {};
  const pick = <T extends string>(value: unknown, options: AutoOption<T>[], fallback: T): T =>
    options.some((o) => o.value === value) ? (value as T) : fallback;
  const names = (value: unknown) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value
              .filter((v): v is string => typeof v === 'string')
              .map((v) => v.trim())
              .filter((v) => v.length >= 1 && v.length <= 80)
          ),
        ].slice(0, 20)
      : [];
  const d = DEFAULT_AUTO_ANSWERS;
  return {
    weeks: isInt(src.weeks) ? clampInt(src.weeks, 1, MAX_WEEKS) : d.weeks,
    perWeek: isInt(src.perWeek) ? clampInt(src.perWeek, 1, WEEK_CAP) : d.perWeek,
    level: pick(src.level, LEVEL_OPTIONS, d.level),
    goal: pick(src.goal, GOAL_OPTIONS, d.goal),
    difficulty: pick(src.difficulty, DIFFICULTY_OPTIONS, d.difficulty),
    style: pick(src.style, STYLE_OPTIONS, d.style),
    focus: names(src.focus),
    weak: names(src.weak),
    notes: typeof src.notes === 'string' ? src.notes.slice(0, NOTES_MAX) : d.notes,
    includeDone: typeof src.includeDone === 'boolean' ? src.includeDone : d.includeDone,
  };
}

/** The request's `answers` (trimmed and within the server's limits; `includeDone` left out). */
export function autoRequestAnswers(answers: AutoAnswers): AutoRequestAnswers {
  const a = normalizeAutoAnswers(answers);
  return {
    weeks: a.weeks,
    perWeek: a.perWeek,
    level: a.level,
    goal: a.goal,
    difficulty: a.difficulty,
    style: a.style,
    focus: a.focus,
    weak: a.weak,
    notes: a.notes.trim().slice(0, NOTES_MAX),
  };
}

/** Whole weeks from `now` until an interview date ("YYYY-MM-DD"), rounded up and clamped to 1..MAX_WEEKS; null if unreadable. */
export function weeksUntil(date: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return clampInt(Math.ceil(days / 7), 1, MAX_WEEKS);
}

/** Round-robin over patterns inside each window of `size` questions, keeping each pattern's own order. */
function interleave(ids: string[], keyOf: (id: string) => string, size: number): string[] {
  const out: string[] = [];
  for (let at = 0; at < ids.length; at += size) {
    const groups = new Map<string, string[]>();
    for (const id of ids.slice(at, at + size)) {
      const key = keyOf(id);
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    const queues = [...groups.values()];
    while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
  }
  return out;
}

const lastIndex = (ids: string[], test: (id: string) => boolean) => {
  for (let i = ids.length - 1; i >= 0; i--) if (test(ids[i])) return i;
  return -1;
};

/**
 * At most `max` Hard questions per week: from the last week back, an extra Hard question swaps places
 * with the last non-Hard question of the nearest earlier week that still has room for one.
 */
function balanceHard(lists: string[][], hard: (id: string) => boolean, max = 2): void {
  const hardCount = (ids: string[]) => ids.filter(hard).length;
  for (let w = lists.length - 1; w >= 1; w--) {
    while (hardCount(lists[w]) > max) {
      let v = w - 1;
      while (v >= 0 && (hardCount(lists[v]) >= max || lists[v].every(hard))) v--;
      if (v < 0) return;
      const hi = lastIndex(lists[w], hard);
      const ei = lastIndex(lists[v], (id) => !hard(id));
      [lists[w][hi], lists[v][ei]] = [lists[v][ei], lists[w][hi]];
    }
  }
}

/**
 * A plan built without AI from the same answers ("Quick plan"): the candidates in learning order
 * (solved ones dropped unless `includeDone`; 'gentle' moves Hard questions to the end), the emphasised
 * and hard-for-you patterns picked first when they don't all fit ('stretch' drops Easy ones first),
 * put back in learning order, blended per two weeks for 'mixed', cut evenly into the weeks with at most
 * 2 Hard a week (except 'stretch'), and labelled by each week's main patterns.
 */
export function localOrganize({
  topics,
  coreOrder: core,
  answers,
  isDone = () => false,
}: {
  topics: readonly PlanTopic[];
  coreOrder: readonly string[];
  answers: AutoAnswers;
  isDone?: (id: string) => boolean;
}): { plan: WeekPlan; summary: string } {
  const a = normalizeAutoAnswers(answers);
  const byId = new Map(topics.map((t) => [t.id, t]));
  const keyOf = (id: string) => patternKey(byId.get(id)?.category ?? '');
  const hard = (id: string) => isHard(byId.get(id)?.difficulty ?? '');
  const easy = (id: string) => difficultyRank(byId.get(id)?.difficulty ?? '') === 0;

  const all = learningOrder(topics, core);
  const solved = all.filter((id) => isDone(id));
  let candidates = a.includeDone ? all : all.filter((id) => !isDone(id));
  if (a.difficulty === 'gentle')
    candidates = [...candidates.filter((id) => !hard(id)), ...candidates.filter(hard)];

  const capacity = a.weeks * a.perWeek;
  const emphasis = new Set([...a.focus, ...a.weak].map(patternKey));
  let selected = candidates;
  if (candidates.length > capacity) {
    const place = new Map(candidates.map((id, i) => [id, i]));
    const weight = (id: string) =>
      (emphasis.has(keyOf(id)) ? 0 : 2) + (a.difficulty === 'stretch' && easy(id) ? 1 : 0);
    selected = [...candidates]
      .sort((x, y) => weight(x) - weight(y) || place.get(x)! - place.get(y)!)
      .slice(0, capacity)
      .sort((x, y) => place.get(x)! - place.get(y)!);
  }
  if (a.style === 'mixed') selected = interleave(selected, keyOf, a.perWeek * 2);

  const lists = cut(selected, evenSizes(selected.length, a.weeks));
  if (a.difficulty !== 'stretch') balanceHard(lists, hard);
  const labels: Record<string, string> = {};
  lists.forEach((ids, i) => {
    const label = themeLabel(ids.map((id) => byId.get(id)?.category ?? '').filter(Boolean));
    if (label) labels[String(i + 1)] = label;
  });

  const placed = selected.length;
  const left = candidates.length - placed;
  const sentences = [
    `Quick plan: ${placed} question${placed === 1 ? '' : 's'} over ${a.weeks} week${
      a.weeks === 1 ? '' : 's'
    }, at most ${a.perWeek} a week, ${
      a.style === 'mixed'
        ? 'with patterns blended inside each week'
        : 'one or two patterns at a time'
    }, in learning order.`,
  ];
  const emphasised = [...new Set([...a.focus, ...a.weak])];
  if (emphasised.length && left > 0)
    sentences.push(
      `${listNames(emphasised)} ${emphasised.length === 1 ? 'was' : 'were'} picked first.`
    );
  if (left > 0)
    sentences.push(
      `${left} question${left === 1 ? '' : 's'} did not fit the timeline and stay${
        left === 1 ? 's' : ''
      } in the queue.`
    );
  if (!a.includeDone && solved.length)
    sentences.push(
      `${solved.length} solved question${solved.length === 1 ? ' was' : 's were'} left out.`
    );
  const hardPlaced = selected.filter(hard).length;
  if (a.difficulty === 'gentle' && hardPlaced)
    sentences.push('Hard questions come in the last weeks.');
  if (a.difficulty === 'gentle' && !hardPlaced && candidates.some(hard))
    sentences.push('Hard questions were left out to keep it gentle.');
  if (a.difficulty === 'stretch' && left > 0)
    sentences.push('Easy questions were the first to go.');
  return { plan: fromLists(labels, lists), summary: sentences.join(' ') };
}
