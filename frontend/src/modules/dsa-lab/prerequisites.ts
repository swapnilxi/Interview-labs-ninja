/**
 * The "Prerequisites" section of a DSA topic: a checklist of specific things to know before the
 * problem, grouped as Python concepts / Data structures / Algorithms & ideas.
 *
 * The lists are per pattern category (every topic in a category shares them) because the seeded
 * topics carry no prerequisites of their own. Anything a topic does list (`topic.prerequisites`)
 * goes first, under "Specific to this problem".
 */
import { prereqMarkdown } from '@/modules/common/lab/prereqMarkdown';

interface PrereqSet {
  python: string[];
  dataStructures: string[];
  algorithms: string[];
}

const PREREQS: Record<string, PrereqSet> = {
  prefixSum: {
    python: [
      'Running total in a loop (`total += x`) stored into a list',
      '`itertools.accumulate` for a one-line prefix sum',
      'Updating a dict value: `seen[k] = seen.get(k, 0) + 1`, `collections.defaultdict(int)`',
      'Slicing and inclusive/exclusive index ranges (`nums[l:r+1]`)',
    ],
    dataStructures: [
      'Array / list indexing, including padding with a leading 0 so `prefix[i+1]` works',
      'Hashmap that stores `prefix sum -> count` (or first index)',
    ],
    algorithms: [
      'Range sum as `prefix[r+1] - prefix[l]`',
      'Two-sum idea applied to prefix sums: look up `current_prefix - k`',
      'Why a sliding window breaks when the array has negative numbers',
      'Brute-force O(n²) subarray enumeration, to see what prefix sums save',
    ],
  },
  hashmap: {
    python: [
      'dict basics: insert, update, delete, `in`, iterate with `.items()`',
      'Update patterns: `d[k] = d.get(k, 0) + 1`, `d.setdefault(k, []).append(v)`, `d[k] += v`',
      '`collections.Counter` and `collections.defaultdict(list / int / set)`',
      'Storing two values per key (tuple or list) and unpacking them',
      '`set` for membership and dedupe; `sorted(word)` / tuples as dict keys (lists are not hashable)',
    ],
    dataStructures: [
      'Hash map / hash set: average O(1) insert and lookup, and why',
      'Hashmap of lists (group-by)',
    ],
    algorithms: [
      'Complement lookup (`target - x`) in a single pass',
      'Frequency counting and comparing two frequency maps',
      'Grouping items by a canonical key (e.g. sorted letters for anagrams)',
      'Check-before-insert ordering, so one element is not used twice',
    ],
  },
  twoPointers: {
    python: [
      'Index loops: `while l < r:` with `l += 1` / `r -= 1`',
      'Swapping in place: `a[i], a[j] = a[j], a[i]`',
      '`sorted()` and slicing; `str.isalnum()` / `.lower()` for palindrome-style checks',
    ],
    dataStructures: ['Arrays and strings (random access by index)', 'Sorted arrays'],
    algorithms: [
      'Opposite-end pointers on a sorted array',
      'Same-direction (read / write) pointers for in-place filtering and dedupe',
      'Why sorting first lets you decide which pointer to move (sum too big -> move right pointer left)',
      'Skipping duplicates after a match',
      'The O(n²) pair-enumeration baseline it replaces',
    ],
  },
  slidingWindow: {
    python: [
      '`for right in range(len(s))` with a separate `left` index',
      'Tracking the best window: `best = max(best, right - left + 1)`',
      'Incrementally updating a Counter / dict: add on expand, decrement (and `del` at zero) on shrink',
      '`collections.deque` (`append`, `popleft`) for a window of indices',
    ],
    dataStructures: [
      'Hashmap / set of the current window contents',
      'Deque for a monotonic window max / min',
    ],
    algorithms: [
      'Fixed-size window vs variable-size window',
      'Expand right, shrink left: `while window_is_invalid: shrink`',
      'Keeping a running sum / count instead of recomputing the window',
      'Prefix sums, to see why a window sum is just a difference',
    ],
  },
  fastSlow: {
    python: [
      'A node class (`class ListNode: val, next`) and `while node and node.next:`',
      'Advancing pointers: `slow = slow.next`, `fast = fast.next.next`, with `None` checks',
      'A `seen` set of nodes or values (the baseline approach)',
    ],
    dataStructures: [
      'Singly linked list traversal',
      'Arrays treated as an implicit linked list (`nums[i]` is the next pointer)',
    ],
    algorithms: [
      'Slow and fast pointers (tortoise and hare): find the middle, detect a cycle',
      'Cycle start: after they meet, reset one pointer to the head and move both one step at a time',
      'Why the fast pointer must catch the slow one inside a cycle (gap shrinks by 1 each step)',
      'Visited-set approach (O(n) space), to compare with the O(1) space pointers',
    ],
  },
  linkedList: {
    python: [
      'A `ListNode` class, attribute access, `None` checks',
      'Dummy head: `dummy = ListNode(0); dummy.next = head`',
      'Rewiring with multiple assignment: `prev, cur = cur, cur.next`',
    ],
    dataStructures: [
      'Singly and doubly linked lists: insert, delete, traverse, and how they differ from arrays',
    ],
    algorithms: [
      'In-place iterative reversal with `prev` / `cur` / `next`',
      'Slow and fast pointers to find the middle',
      'Merging two sorted lists with a dummy node',
      'Basic recursion (needed for the recursive reversal)',
    ],
  },
  monotonicStack: {
    python: [
      'A list as a stack: `append`, `pop`, `stack[-1]`, `while stack and ...`',
      '`enumerate`, and pushing `(index, value)` tuples',
      'Initialising results: `res = [-1] * n` / `[0] * n`',
    ],
    dataStructures: ['Stack (LIFO)', 'Deque basics'],
    algorithms: [
      'Next greater / next smaller element',
      'Keeping the stack monotonic (increasing or decreasing) by popping before each push',
      'Why every element is pushed and popped once, so the total is O(n)',
      'Storing indices rather than values, to compute distances and widths',
    ],
  },
  heap: {
    python: [
      '`heapq`: `heappush`, `heappop`, `heapify`, `nlargest` / `nsmallest`',
      'Max-heap by negating values (`heapq` is a min-heap only)',
      'Heap items as tuples `(priority, value)` and how tuple comparison breaks ties',
      '`collections.Counter` and `most_common(k)` to build a frequency dict first',
    ],
    dataStructures: [
      'Binary heap: push / pop O(log n), peek O(1)',
      'Hashmap + heap together: count first, then a heap of `(count, item)`',
    ],
    algorithms: [
      'Top-K with a size-k min-heap, O(n log k)',
      'Two-heap trick for a running median',
      'Sorting (O(n log n)) as the baseline, and when a heap beats it',
      'Bucket sort by frequency as the O(n) alternative for top-K frequent',
    ],
  },
  binarySearch: {
    python: [
      '`while lo <= hi:` vs `while lo < hi:` and `mid = lo + (hi - lo) // 2`',
      'Ceiling division: `-(-a // b)` or `math.ceil`',
      'Writing a helper `def feasible(x) -> bool` and calling it from the search loop',
      '`bisect_left` / `bisect_right`',
    ],
    dataStructures: [
      'Sorted array',
      'A numeric answer range `[lo, hi]` used as an implicit search space',
    ],
    algorithms: [
      'Classic binary search on a sorted array, and its off-by-one traps',
      'Monotonic predicate: if `x` works, every larger `x` also works',
      'Lower-bound template: find the minimum feasible value',
      'Choosing the bounds of the answer (e.g. `max(piles)`, `sum(weights)`)',
    ],
  },
  intervals: {
    python: [
      '`sorted(intervals, key=lambda x: x[0])` and sorting by end time (`x[1]`)',
      'Unpacking pairs: `for start, end in intervals`',
      'Mutating the last merged item: `merged[-1][1] = max(merged[-1][1], end)`',
      '`heapq` for meeting-room style problems',
    ],
    dataStructures: ['Array of `[start, end]` pairs', 'Min-heap of end times'],
    algorithms: [
      'Overlap test: `a.start <= b.end and b.start <= a.end`',
      'Sort, then sweep (merge intervals)',
      'Greedy by earliest end time (maximum non-overlapping set)',
      'Sweep line with +1 / -1 events to count concurrent intervals',
    ],
  },
  matrix: {
    python: [
      'Nested lists: `grid[r][c]`, `len(grid)` and `len(grid[0])`',
      'Building a grid correctly: `[[0] * cols for _ in range(rows)]` (not `[[0] * cols] * rows`)',
      'Direction arrays: `for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]`',
      'Bounds check `0 <= r < rows and 0 <= c < cols`; `zip(*matrix)` to transpose',
    ],
    dataStructures: ['2D array', 'Visited set of `(r, c)` tuples', '`deque` for BFS over a grid'],
    algorithms: [
      'Row-by-row, spiral and diagonal traversal order',
      'In-place transforms (transpose + reverse each row = rotate 90°)',
      'Flood fill with DFS / BFS on a grid',
      'Using the first row / column as markers for O(1) extra space',
    ],
  },
  tree: {
    python: [
      'A `TreeNode` class with `val`, `left`, `right`, and `None` checks',
      'Recursion: base case, return value, and how the call stack unwinds',
      'Passing state down through parameters and returning values up (`max(left, right) + 1`)',
      '`collections.deque` for level-order traversal',
    ],
    dataStructures: ['Binary tree and the binary search tree ordering property', 'Stack and queue'],
    algorithms: [
      'Preorder / inorder / postorder, recursive and iterative with an explicit stack',
      'Level-order BFS using the `for _ in range(len(queue))` level trick',
      'Height / depth and the "return a value from each subtree" pattern',
      'Complexity: O(n) time, O(h) space for the recursion stack',
    ],
  },
  graph: {
    python: [
      'Building an adjacency list: `graph = defaultdict(list)`, `graph[u].append(v)`',
      '`collections.deque` (`append`, `popleft`) for BFS',
      'A `visited` set, and recursive DFS (mind the recursion limit)',
      'Looping over an edge list: `for u, v in edges`',
    ],
    dataStructures: [
      'Graph representations: adjacency list vs adjacency matrix vs edge list',
      'Queue (BFS), stack / recursion (DFS), visited set',
    ],
    algorithms: [
      'BFS for shortest path in an unweighted graph, level by level',
      'DFS for connected components and cycle detection',
      'Directed vs undirected edges, and starting from every node for disconnected graphs',
      'Topological sort with in-degree counts (Kahn algorithm)',
    ],
  },
  backtracking: {
    python: [
      'Recursion with parameters like `start`, `path`, `result`',
      'Choose, recurse, undo: `path.append(x)` ... `path.pop()`',
      'Saving a copy, not the live list: `result.append(path[:])`',
      '`sorted()` and a `used` set / list to skip duplicates',
    ],
    dataStructures: [
      'The recursion call stack',
      'The implicit state-space tree (each level is one decision)',
    ],
    algorithms: [
      'Subsets, permutations and combinations as decision trees',
      'Pruning invalid branches early (N-Queens, Sudoku style)',
      'Skipping duplicates: `if i > start and nums[i] == nums[i - 1]: continue`',
      'Why the complexity is O(2^n) or O(n!) and why that is expected here',
    ],
  },
  dp1d: {
    python: [
      '`dp = [0] * (n + 1)` and the off-by-one in `dp[i - 1]`, `dp[i - 2]`',
      '`min()` / `max()` with `float("inf")` as a sentinel',
      '`functools.lru_cache` / `@cache` for top-down memoisation',
      'Nested loops such as `for coin in coins` inside `for amount in range(...)`',
    ],
    dataStructures: ['1D array as a table of sub-problem answers'],
    algorithms: [
      'Recursion, then memoisation, then a bottom-up table (the three steps)',
      'Defining the state (what `dp[i]` means) and the recurrence relation',
      'Base cases',
      'Space optimisation: keep only the last one or two values',
      'Fibonacci / climbing stairs as the template for all of these',
    ],
  },
  dp2d: {
    python: [
      'Building a 2D table: `dp = [[0] * (n + 1) for _ in range(m + 1)]`',
      'String indexing `s[i - 1]` and comparing characters',
      '`min(a, b, c)` over three neighbouring cells',
      'Nested loops `for i in range(1, m + 1): for j in range(1, n + 1)`',
      '`@lru_cache` with two arguments for the top-down version',
    ],
    dataStructures: [
      '2D array as the DP table',
      'What `dp[i][j]` means: prefixes of two strings, or a position in a grid',
    ],
    algorithms: [
      '1D DP first: state, recurrence, base cases',
      'Recurrence from the three neighbours `dp[i-1][j]`, `dp[i][j-1]`, `dp[i-1][j-1]`',
      'Initialising the first row and column (the empty-prefix base cases)',
      'Recursion + memoisation to table, then rolling-row space optimisation (O(m·n) to O(n))',
      'Rebuilding the actual answer by walking back through the table',
    ],
  },
  greedy: {
    python: [
      '`sorted(..., key=lambda x: ..., reverse=True)` and sorting by a tuple key',
      '`heapq` when the current best is needed repeatedly',
      'Running variables updated in one pass (`max_reach`, `balance`, `count`)',
    ],
    dataStructures: ['Arrays / lists', 'Min-heap or max-heap (sometimes)'],
    algorithms: [
      'Greedy-choice property: a locally best pick leads to a globally best answer',
      'Exchange argument, to check a greedy is correct',
      'Sort, then scan',
      'Spotting when greedy fails (coin change with arbitrary coins) and DP is needed',
      'Interval scheduling by earliest end time',
    ],
  },
  bit: {
    python: [
      'Bitwise operators: `&`, `|`, `^`, `~`, `<<`, `>>`',
      'Binary conversion: `bin(x)`, `0b1010`, `int("1010", 2)`, `format(x, "b")`',
      'Python ints never overflow; negatives need masking such as `x & 0xFFFFFFFF`',
      'Updating an integer in place: `x |= 1 << i`, `x &= ~(1 << i)`, `x ^= 1 << i`',
    ],
    dataStructures: [
      'An integer used as a bitmask / bitset',
      'Bitmask over n elements to represent a subset',
    ],
    algorithms: [
      'Check, set, clear and toggle the i-th bit',
      '`x & (x - 1)` clears the lowest set bit (count bits, power-of-two check)',
      'XOR rules: `a ^ a = 0`, `a ^ 0 = a` (find the single number)',
      "Two's complement representation of negative numbers",
      'Enumerating all subsets with `for mask in range(1 << n)`',
    ],
  },
  trie: {
    python: [
      'Nested dicts as nodes (`node = node.setdefault(ch, {})`) or a `TrieNode` class with `children` and `is_end`',
      'Iterating characters; `ord(c) - ord("a")` for array-based children',
      'Membership check on children: `ch in node.children`',
      'Recursion for DFS over trie nodes (autocomplete, word search)',
    ],
    dataStructures: [
      'N-ary tree where each edge is a character',
      'Hashmap for the children of a node',
      'Why a trie beats a hash set for prefix queries',
    ],
    algorithms: [
      'insert / search / startsWith, each O(L) for a word of length L',
      'DFS from a prefix node to collect every word below it',
      'Marking the end of a word (`is_end`), and why it is needed',
      'Combining a trie with backtracking (Word Search II)',
    ],
  },
  unionFind: {
    python: [
      'A parent array: `parent = list(range(n))`, plus `rank` / `size` lists',
      'Writing `find(x)` (recursive and iterative), as a nested function or a class method',
      'Looping over edges: `for a, b in edges`',
    ],
    dataStructures: ['Disjoint-set (parent, rank / size)', 'Graph as an edge list'],
    algorithms: [
      '`find` with path compression and `union` by rank / size',
      'Counting connected components: subtract 1 on every successful union',
      'Cycle detection in an undirected graph: union of two already-connected nodes',
      'DFS / BFS connectivity, to compare with union-find',
    ],
  },
};

// Used for custom categories that match none of the patterns above.
const BASELINE: PrereqSet = {
  python: [
    'list, dict and set: create, index, update and iterate',
    'Slicing, `enumerate`, `zip` and list comprehensions',
    'Writing functions with early returns',
  ],
  dataStructures: [
    'Array / list indexing',
    'Hashmap lookup',
    'Stack and queue (`collections.deque`)',
  ],
  algorithms: [
    'Reading time and space from a loop: O(1), O(n), O(n log n), O(n²)',
    'Writing the brute-force solution first, then finding its bottleneck',
  ],
};

// First match wins, so the narrower names (trie, 2D) come before the broader ones (tree, DP).
const CATEGORY_KEYS: [RegExp, string][] = [
  [/\btrie\b/, 'trie'],
  [/union/, 'unionFind'],
  [/graph/, 'graph'],
  [/\btree\b/, 'tree'],
  [/prefix sum|cumulative/, 'prefixSum'],
  [/hashmap|frequency/, 'hashmap'],
  [/two pointers/, 'twoPointers'],
  [/sliding window/, 'slidingWindow'],
  [/fast.*slow/, 'fastSlow'],
  [/linked list/, 'linkedList'],
  [/monotonic/, 'monotonicStack'],
  [/heap|priority/, 'heap'],
  [/binary search/, 'binarySearch'],
  [/interval/, 'intervals'],
  [/matrix/, 'matrix'],
  [/backtrack/, 'backtracking'],
  [/dynamic programming.*2d|\b2d dp\b/, 'dp2d'],
  [/dynamic programming|\bdp\b/, 'dp1d'],
  [/greedy/, 'greedy'],
  [/bit manipulation|bitwise/, 'bit'],
];

function prereqSetFor(category: string): PrereqSet {
  const c = category.toLowerCase();
  const hit = CATEGORY_KEYS.find(([re]) => re.test(c));
  return (hit && PREREQS[hit[1]]) || BASELINE;
}

/** Markdown for the Prerequisites section of `topicName`, a topic in `category`. */
export function buildPrerequisitesMarkdown(
  topicName: string,
  category: string,
  own: string[]
): string {
  const set = prereqSetFor(category);
  return prereqMarkdown(`Prerequisites for ${topicName}`, [
    { title: 'Specific to this problem', items: own },
    { title: 'Python concepts', items: set.python },
    { title: 'Data structures', items: set.dataStructures },
    { title: 'Algorithms & ideas', items: set.algorithms },
  ]);
}
