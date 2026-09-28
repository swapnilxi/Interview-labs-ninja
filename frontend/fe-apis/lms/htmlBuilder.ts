/**
 * fe-apis/lms/htmlBuilder.ts
 *
 * Ensures all generated lessons follow a rigorous, beautiful ByteByteGo/NeetCode
 * technical educational structure. No lesson is ever blank, unstyled, or incomplete.
 */

import { generateNativeVisual } from './visualEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Shared "premium" design system: the single source of truth for lesson colors,
// used both by the deterministic fallback template below (buildStructuredLessonHtml)
// and embedded as a literal instruction block inside the AI lesson-generation prompt
// (see index.ts's handleGenerateLesson) -- so AI-generated and template-generated
// lessons land on the same palette instead of each inventing its own dark-navy/neon
// look. Palette mirrors the host app's own design tokens
// (frontend/src/styles/tailwind.css) so a lesson reads as part of the same product
// rather than a bolted-on AI artifact. Kept as a text-identical mirror of
// backend/modules/ai_lms/visual_engine.py's PREMIUM_DESIGN_TOKENS_CSS /
// PREMIUM_DESIGN_SYSTEM_PROMPT for the FastAPI-mode code path.
// ─────────────────────────────────────────────────────────────────────────────
export const PREMIUM_DESIGN_TOKENS_CSS = `:root {
      color-scheme: light dark;
      --bg: #f7f3ec;
      --surface: #fffaf2;
      --surface-2: #efe7d9;
      --text: #24201b;
      --text-muted: #71695f;
      --border: rgba(64, 55, 45, 0.14);
      --border-strong: rgba(64, 55, 45, 0.22);
      --primary: #5b5bd6;
      --primary-soft: rgba(91, 91, 214, 0.1);
      --secondary: #127c7a;
      --secondary-soft: rgba(18, 124, 122, 0.1);
      --accent: #b36b17;
      --accent-soft: rgba(179, 107, 23, 0.12);
      --success: #14845f;
      --success-soft: rgba(20, 132, 95, 0.12);
      --danger: #c24151;
      --danger-soft: rgba(194, 65, 81, 0.12);
      --code-bg: #1c1a17;
      --code-text: #f2ede2;
      --code-border: rgba(255, 255, 255, 0.08);
      --shadow: 0 1px 2px rgba(36, 32, 27, 0.05), 0 12px 28px -14px rgba(36, 32, 27, 0.2);
      --radius: 14px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #17140f;
        --surface: #201c16;
        --surface-2: #2a251d;
        --text: #f4efe7;
        --text-muted: #b3a696;
        --border: rgba(255, 246, 235, 0.1);
        --border-strong: rgba(255, 246, 235, 0.16);
        --primary: #9694f5;
        --primary-soft: rgba(150, 148, 245, 0.14);
        --secondary: #5fc6bd;
        --secondary-soft: rgba(95, 198, 189, 0.12);
        --accent: #f1ad55;
        --accent-soft: rgba(241, 173, 85, 0.14);
        --success: #54c79a;
        --success-soft: rgba(84, 199, 154, 0.14);
        --danger: #fb7185;
        --danger-soft: rgba(251, 113, 133, 0.14);
        --code-bg: #14110d;
        --code-text: #f2ede2;
        --code-border: rgba(255, 255, 255, 0.07);
        --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 14px 32px -16px rgba(0, 0, 0, 0.6);
      }
    }`;

export const PREMIUM_DESIGN_SYSTEM_PROMPT = `AESTHETICS & DESIGN SYSTEM (MANDATORY -- "premium, clean, modern", not generic
AI-slop dark-navy-with-neon-gradients):
- This lesson must look like it belongs inside a polished, cohesive product (think
  Stripe's docs, Linear, ByteByteGo) -- restrained and editorial, content-first.
  Avoid: neon glow effects, gradient-filled headline text, emoji used as primary
  iconography, an over-saturated "hacker" dark-blue palette, or excessive box-shadow.
- Embed this exact \`:root\` custom-property block near the top of your <style> --
  it auto-adapts to the reader's OS light/dark preference via prefers-color-scheme.
  You may add a few extra tokens if a specific visual genuinely needs one, but do
  not rename or drop these:
  \`\`\`css
  ${PREMIUM_DESIGN_TOKENS_CSS}
  \`\`\`
- Typography: system font stack (already specified above); body copy 1-1.05rem at
  1.7 line-height in var(--text). h1 ~2.1rem/800 weight, tight letter-spacing, plain
  var(--text) color (NOT a gradient fill -- at most one word may use var(--primary)
  for emphasis). h2 ~1.4rem/700 with a small 4px tall accent-colored bar to its left.
  Content column max-width ~760-820px, centered, with generous 2.5-3rem vertical
  rhythm between sections.
- Badges/pills: small uppercase label, border-radius:999px, soft tinted background
  (one of the *-soft tokens) with matching text color, no border, text only (e.g.
  "AI", "8 MIN READ") -- no emoji.
- Callout boxes (Key Takeaway / Tip / Warning / Deep Dive): background var(--surface-2),
  a 3-4px solid left border in the matching semantic color, border-radius rounded
  only on the right side, label text in that same color, body text in var(--text).
- Code blocks: a distinct dark "terminal" surface (var(--code-bg)/var(--code-text))
  even in light mode, with a small header bar above the code -- three small
  decorative dots and an optional language label on the left, a plain-text "Copy"
  button on the right -- rather than a button floating on top of the code itself.
- Quiz cards: var(--surface) background, options as full-width left-aligned buttons
  with a subtle hover (border becomes var(--primary)); once answered, apply
  var(--success-soft)/var(--success) or var(--danger-soft)/var(--danger) -- reference
  these CSS variables for state colors, never hardcode raw green/red hex, so the
  page stays correct in both themes.
- Takeaways: a checklist using a small custom circular checkmark (a CSS ::before,
  not an emoji), not the browser's default list bullets.
- Any inline SVG/Canvas diagram you draw should also pull its colors from these same
  CSS variables (var(--surface), var(--border), var(--primary), var(--secondary),
  var(--accent)) instead of inventing an unrelated palette, so the diagram reads as
  part of the same page rather than a pasted-in widget.
- Keep every color as a CSS variable reference -- no ad-hoc hardcoded hex scattered
  through component rules -- so the single prefers-color-scheme block above is the
  only place theme-switching logic lives.
- VISIBILITY CHECKLIST (verify each of these explicitly before finishing -- these are
  exactly the elements most often left with a hardcoded color that only works in ONE
  theme, breaking the other):
  * Every heading (h1-h6) has \`color: var(--text)\` (or a semantic accent variable) --
    never a bare hardcoded hex, and never left to inherit a browser default.
  * \`hr\` and any decorative divider line has \`border-color: var(--border)\` (or
    equivalent) -- a plain unstyled \`<hr>\` renders with the browser's own default
    color, which is not guaranteed to be visible against your \`--bg\` in both themes.
  * Links (\`a\`) have an explicit \`color\` from a variable, not the browser default blue.
  * Body text, list items, table cells, and blockquotes all resolve to \`var(--text)\`
    or \`var(--text-muted)\` -- never left unset to inherit something that only happens
    to look right in the theme you were previewing.
  * Every rule you write inside the \`@media (prefers-color-scheme: dark)\` block has a
    matching rule (or inherited variable) for light mode, and vice versa -- a color
    correctly overridden for only one theme is the single most common cause of
    invisible text.`;

export interface StructuredLessonOptions {
  title: string;
  className: string;
  subjectName?: string;
  topicOrContent: string;
  rawAiOutput?: string;
  classContext?: string;
  subjectContext?: string;
  classDescription?: string;
  subjectDescription?: string;
}

interface TopicProfile {
  category: string;
  subtitle: string;
  objectives: string[];
  conceptsHtml: string;
  calloutTitle: string;
  calloutText: string;
  codeLang: string;
  codeTitle: string;
  code: string;
  tradeoffs: [string, string, string, string][];
  quiz: {
    question: string;
    options: [string, boolean, string][];
  }[];
  takeaways: string[];
}

function getTopicProfile(title: string, className: string, subjectName: string, content: string): TopicProfile {
  const combined = `${title} ${className} ${subjectName} ${content}`.toLowerCase();

  // 1. Load Balancing & Reverse Proxies
  if (['load balancer', 'reverse proxy', 'traffic', 'nginx', 'haproxy', 'l4', 'l7', 'distribution'].some(k => combined.includes(k))) {
    return {
      category: 'Load Balancing & Traffic',
      subtitle: 'Architectural principles, routing topologies, and zero-downtime horizontal traffic distribution.',
      objectives: [
        'Master Layer 4 (Transport / TCP) vs Layer 7 (Application / HTTP) reverse proxy mechanics.',
        'Implement active vs passive health checks, connection draining, and failover pools.',
        'Explore real-time request packet distribution and server failure rerouting via interactive simulation.',
        'Evaluate operational trade-offs across Round Robin, Least Connections, and Consistent Hashing.'
      ],
      conceptsHtml: `<p>In modern high-scale architectures, single server bottlenecks represent a fatal single point of failure (SPOF). A <strong>Load Balancer</strong> acts as the central traffic controller, sitting between clients and backend worker pools to optimize resource utilization, maximize throughput, and prevent server saturation.</p>
<p>Modern reverse proxies operate at two distinct network layers: <strong>Layer 4 (L4)</strong> which routes raw packets based solely on IP addresses and TCP/UDP ports without inspecting packet payloads, and <strong>Layer 7 (L7)</strong> which terminates TLS handshakes, parses HTTP headers, reads cookies, and executes intelligent path-based routing (e.g. <code>/api</code> vs <code>/static</code>).</p>`,
      calloutTitle: 'Reverse Proxy Invariant',
      calloutText: 'An effective load balancer must decouple external clients from internal server topologies while guaranteeing sub-millisecond route decisions, proactive node isolation, and zero-downtime rolling deployments.',
      codeLang: 'typescript',
      codeTitle: 'LoadBalancer.ts',
      code: `// Production Round-Robin Load Balancer with Health Checks & Circuit Breaking
export interface BackendNode {
  id: string;
  url: string;
  isHealthy: boolean;
  activeRequests: number;
}

export class LoadBalancer {
  private currentIndex = 0;

  constructor(private servers: BackendNode[]) {}

  public getNextServer(): BackendNode {
    const healthyServers = this.servers.filter(s => s.isHealthy);
    if (healthyServers.length === 0) {
      throw new Error("HTTP 503 Service Unavailable: No healthy backend nodes in pool");
    }
    // Round-robin selection across active healthy instances
    const selected = healthyServers[this.currentIndex % healthyServers.length];
    this.currentIndex = (this.currentIndex + 1) % healthyServers.length;
    selected.activeRequests++;
    return selected;
  }

  public reportStatus(id: string, isHealthy: boolean): void {
    const server = this.servers.find(s => s.id === id);
    if (server) {
      server.isHealthy = isHealthy;
    }
  }
}`,
      tradeoffs: [
        ['Routing Layer', 'L4 (Transport / TCP/UDP)', 'L7 (Application / HTTP/gRPC)', 'Raw packet throughput vs deep header inspection & cookie routing'],
        ['Algorithm', 'Round Robin / Random', 'Least Connections / Latency', 'Zero state overhead vs optimal balancing during uneven task durations'],
        ['Session Affinity', 'Sticky Sessions (Cookie-based)', 'Stateless Token Architecture', 'Cache locality benefits vs server hotspots and uneven node load'],
        ['Health Checking', 'Passive (Traffic observation)', 'Active (Periodic synthetic ping)', 'Zero synthetic bandwidth vs delayed failure detection']
      ],
      quiz: [
        {
          question: 'What happens when an upstream server in a load balancer pool fails consecutive health checks?',
          options: [
            ['The load balancer immediately marks it unhealthy and routes incoming requests only to surviving nodes.', true, 'Active health checks prevent blackholing client traffic by immediately rerouting to healthy nodes.'],
            ['The load balancer halts all incoming traffic to prevent cluster inconsistencies.', false, 'Halting all traffic causes a complete outage, which violates high availability.'],
            ['The load balancer retries the failed node infinitely without timeout.', false, 'Infinite retries exhaust client connections and trigger cascading request timeouts.']
          ]
        },
        {
          question: 'Why is Layer 7 (L7) load balancing computationally more resource-intensive than Layer 4 (L4)?',
          options: [
            ['L7 must fully parse HTTP headers, TLS handshakes, cookies, and URI paths before routing.', true, 'L7 operates at the application layer, requiring TCP termination and full payload/header inspection.'],
            ['L7 operates purely on MAC addresses in kernel memory space.', false, 'Layer 2 operates on MAC addresses; L7 operates on application protocols like HTTP and gRPC.'],
            ['L7 cannot use hardware acceleration under any circumstances.', false, 'L7 can utilize TLS offloading chips, but payload parsing still requires substantial CPU cycles.']
          ]
        }
      ],
      takeaways: [
        'Always run load balancers in an Active-Passive or Anycast Active-Active pair to avoid single points of failure (SPOF).',
        'Prefer stateless application servers so any replica can handle any user request seamlessly.',
        'Tune connection timeouts and circuit breakers so slow upstreams are isolated before thread pools exhaust.',
        'Use L7 when microservices require path-based routing (/api vs /static) or JWT header inspection.'
      ]
    };
  }

  // 2. CAP Theorem & Distributed Systems
  if (['cap theorem', 'cap', 'consistency', 'partition', 'consensus', 'paxos', 'raft', 'brewer'].some(k => combined.includes(k))) {
    return {
      category: 'Distributed Consensus & Trade-Offs',
      subtitle: "Brewer's theorem, PACELC model, quorum mechanics, and partition resilience.",
      objectives: [
        'Understand why Network Partition tolerance (P) is mandatory across asynchronous networks.',
        'Explore the PACELC extension: If Partition (A vs C), Else (Latency vs Consistency).',
        'Analyze quorum read/write equations (R + W > N) guaranteeing strong consistency.',
        'Compare CP architectures (Raft, ZooKeeper, etcd) with AP systems (Cassandra, DynamoDB).'
      ],
      conceptsHtml: `<p>Formulated by Eric Brewer, the <strong>CAP Theorem</strong> proves that a distributed data store can simultaneously guarantee at most two out of three guarantees: <strong>Consistency (C)</strong>, <strong>Availability (A)</strong>, and <strong>Partition Tolerance (P)</strong>.</p>
<p>Because physical network switches, undersea cables, and cloud instances inevitably drop packets or experience latency spikes, <strong>Partition Tolerance is non-negotiable</strong>. Therefore, when a network partition strikes, architects face a binary trade-off: fail the request to preserve strict linearizability (CP), or accept the write and return potentially stale data to keep the system online (AP).</p>`,
      calloutTitle: 'PACELC Rule of Thumb',
      calloutText: 'Even during normal operating conditions without network partitions, distributed systems must trade off Latency (L) against Consistency (C). Fast responses require local caching or asynchronous replication.',
      codeLang: 'typescript',
      codeTitle: 'QuorumConsensus.ts',
      code: `// Quorum Consensus Validator: R + W > N guarantees Strong Consistency
export class QuorumCluster {
  constructor(public readonly totalNodes: number) {}

  public isStronglyConsistent(readQuorum: number, writeQuorum: number): boolean {
    // If read and write quorums overlap by at least 1 node,
    // the read set is guaranteed to observe the latest write.
    return (readQuorum + writeQuorum) > this.totalNodes;
  }

  public getRecommendedQuorums(): { R: number; W: number } {
    const majority = Math.floor(this.totalNodes / 2) + 1;
    return { R: majority, W: majority };
  }
}`,
      tradeoffs: [
        ['Guarantees', 'CP (Consistency + Partition Tolerance)', 'AP (Availability + Partition Tolerance)', 'Strict linearizability vs 100% operational uptime'],
        ['Typical Engines', 'etcd, ZooKeeper, CockroachDB, Raft', 'Amazon DynamoDB, Apache Cassandra, Couchbase', 'Consensus round-trips vs eventual convergence (vector clocks)'],
        ['Normal State (Else)', 'Low Latency (Eventual)', 'Strong Consistency', 'PACELC: trade read latency for guaranteed fresh data'],
        ['Failure Behavior', 'Returns Error / Waits for Consensus', 'Returns Stale / Degraded Data', 'Fail-stop semantics vs graceful degradation under load']
      ],
      quiz: [
        {
          question: "Why is 'CA' (Consistency + Availability without Partition Tolerance) impossible in distributed networks?",
          options: [
            ['Network partitions (cable cuts, latency spikes, switch failures) are an inevitable physical reality.', true, 'Because hardware/network partitions cannot be prevented, systems must choose between C and A during a split.'],
            ['Distributed algorithms are mathematically limited to two letters.', false, 'The limitation is fundamental to asynchronous network physics, not nomenclature.'],
            ['Relational databases forbid replication across data centers.', false, 'RDBMS can replicate, but they sacrifice availability during cross-DC partitions.']
          ]
        },
        {
          question: 'In a cluster with N = 5 nodes, which quorum configuration guarantees strong read-your-writes consistency?',
          options: [
            ['Write Quorum W = 3, Read Quorum R = 3 (since 3 + 3 = 6 > 5)', true, 'Since R + W > N, at least one node in the read quorum is guaranteed to participate in the write quorum.'],
            ['Write Quorum W = 2, Read Quorum R = 2 (since 2 + 2 = 4 < 5)', false, 'With R + W <= N, read and write quorums may not intersect, risking stale reads.'],
            ['Write Quorum W = 1, Read Quorum R = 1', false, 'Single node writes and reads provide only eventual consistency.']
          ]
        }
      ],
      takeaways: [
        'Assume network partitions will happen; design idempotency and timeout recovery from day one.',
        'Choose CP for financial transactions, authentication tokens, and distributed locking (etcd/ZooKeeper).',
        'Choose AP for social feeds, metrics ingestion, shopping cart items, and high-volume clickstreams.',
        'Leverage the PACELC framework to reason about latency overhead during healthy steady-state operations.'
      ]
    };
  }

  // 3. Binary Search & Pointer Elimination
  if (['binary search', 'pointer', 'logarithmic', 'dsa', 'search'].some(k => combined.includes(k))) {
    return {
      category: 'Algorithmic Complexity & Pointers',
      subtitle: 'Invariants, search space reduction, overflow prevention, and boundary conditions.',
      objectives: [
        'Master pointer invariants: maintaining the search space boundary low <= high.',
        'Prevent integer overflow bugs using mid = low + ((high - low) >> 1).',
        'Analyze logarithmic time complexity O(log n) through recursive space halving.',
        'Step through interactive array pointer elimination to build intuitive visual memory.'
      ],
      conceptsHtml: `<p><strong>Binary Search</strong> is the quintessential divide-and-conquer algorithm. Operating on monotonically ordered data, it eliminates half of the remaining candidate elements with a single comparison, achieving optimal <strong>O(log n)</strong> runtime.</p>
<p>The key to mastering binary search and its variations (e.g. search in rotated array, finding boundary elements) lies in rigorously establishing the <strong>Loop Invariant</strong>. At every iteration, the algorithm maintains that if the target exists in the array, it must reside within the closed interval <code>[low, high]</code>.</p>`,
      calloutTitle: 'The Historic Overflow Bug',
      calloutText: 'In many languages, computing mid as (low + high) / 2 overflows the 32-bit signed integer limit for large arrays (>= 2^30). Always use mid = low + ((high - low) >> 1).',
      codeLang: 'typescript',
      codeTitle: 'BinarySearch.ts',
      code: `// Production-Grade Robust Binary Search
export function binarySearch(arr: number[], target: number): number {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    // Prevent integer overflow and bitwise shift for speed
    const mid = low + ((high - low) >> 1);

    if (arr[mid] === target) {
      return mid; // Target identified
    } else if (arr[mid] < target) {
      low = mid + 1; // Discard left half
    } else {
      high = mid - 1; // Discard right half
    }
  }

  return -1; // Target not present
}`,
      tradeoffs: [
        ['Algorithm', 'Linear Search O(n)', 'Binary Search O(log n)', 'Unsorted arrays vs required upfront sort overhead O(n log n)'],
        ['Data Structure', 'Flat Array', 'Binary Search Tree (BST)', 'Cache-friendly contiguous memory vs dynamic insertion/deletion overhead'],
        ['Loop Boundary', 'while (low <= high)', 'while (low < high)', 'Exact target match vs left/right insertion boundary search'],
        ['Space Complexity', 'Iterative O(1) auxiliary', 'Recursive O(log n) call stack', 'Minimum memory overhead vs recursive elegance']
      ],
      quiz: [
        {
          question: 'How many comparisons does Binary Search require at most for an array of 1,000,000 sorted elements?',
          options: [
            ['At most 20 comparisons (since 2^20 = 1,048,576 > 1,000,000).', true, 'Log2(1,000,000) is approximately 19.93, requiring at most 20 comparisons in the worst case.'],
            ['Approximately 500,000 comparisons.', false, '500,000 would be the average for naive O(n) linear search, not logarithmic binary search.'],
            ['1,000 comparisons.', false, 'Square root search takes 1,000 steps, but binary search is exponentially faster at ~20 steps.']
          ]
        },
        {
          question: 'When searching for the first insertion position where arr[i] >= target, which condition updates the high pointer?',
          options: [
            ['high = mid; when arr[mid] >= target', true, 'Keeping mid preserves the candidate position while discarding elements strictly greater on the right.'],
            ['high = mid - 1; when arr[mid] < target', false, 'If arr[mid] is strictly less than target, the target must be to the right (low = mid + 1).'],
            ['high = 0;', false, 'Resetting high to 0 destroys the binary search space.']
          ]
        }
      ],
      takeaways: [
        'Always verify that data is strictly or monotonically sorted before applying binary search.',
        'Formulate boundary conditions carefully: choose between [low, high] closed vs [low, high) half-open intervals.',
        'Use bitwise mid calculations (low + ((high - low) >> 1)) to protect against 32-bit integer overflow.',
        'Binary search generalizes beyond arrays: binary search on answer spaces (e.g. capacity, minimum time) is an elite LeetCode pattern.'
      ]
    };
  }

  // 4. Dynamic Programming: Memoization vs Tabulation
  if (['memoization', 'tabulation', 'dynamic programming', 'dp', 'fibonacci', 'knapsack'].some(k => combined.includes(k))) {
    return {
      category: 'Dynamic Programming Paradigms',
      subtitle: 'Top-down recursive memoization vs bottom-up iterative tabulation.',
      objectives: [
        'Identify overlapping subproblems and optimal substructure in complex algorithms.',
        'Compare Top-Down (Memoization) with Bottom-Up (Tabulation) execution profiles.',
        'Analyze call stack depth, recursion overhead, and stack overflow vulnerabilities.',
        'Optimize memory footprint from O(N) tables to O(1) rolling variables.'
      ],
      conceptsHtml: `<p><strong>Dynamic Programming (DP)</strong> solves complex optimization problems by breaking them down into simpler subproblems, solving each subproblem once, and storing their solutions to eliminate redundant computations.</p>
<p>Two distinct paradigms exist: <strong>Top-Down Memoization</strong>, which maintains natural recursive call hierarchies while caching returned subproblem outputs in a hash table, and <strong>Bottom-Up Tabulation</strong>, which iteratively builds solutions starting from base cases in an explicit array or matrix, eliminating call stack overhead completely.</p>`,
      calloutTitle: 'Call Stack vs CPU Cache',
      calloutText: 'While Top-Down Memoization only computes reachable states, Bottom-Up Tabulation benefits from continuous memory locality, CPU cache prefetching, and zero call stack memory overhead.',
      codeLang: 'typescript',
      codeTitle: 'MemoVsTabulation.ts',
      code: `// Comparison: Top-Down Memoization vs Bottom-Up Tabulation
export class DPComparison {
  // 1. Top-Down Memoization (Recursive + Hash Cache)
  public static fibMemo(n: number, memo = new Map<number, number>()): number {
    if (n <= 1) return n;
    if (memo.has(n)) return memo.get(n)!;
    const res = this.fibMemo(n - 1, memo) + this.fibMemo(n - 2, memo);
    memo.set(n, res);
    return res;
  }

  // 2. Bottom-Up Tabulation (Iterative + O(1) Memory Space)
  public static fibTabulation(n: number): number {
    if (n <= 1) return n;
    let prev2 = 0;
    let prev1 = 1;
    for (let i = 2; i <= n; i++) {
      const current = prev1 + prev2;
      prev2 = prev1;
      prev1 = current;
    }
    return prev1;
  }
}`,
      tradeoffs: [
        ['Paradigm', 'Top-Down (Memoization)', 'Bottom-Up (Tabulation)', 'Intuitive recursive structure vs iterative cache locality'],
        ['Subproblem Evaluation', 'On-demand (only needed states)', 'Exhaustive (all table states)', 'Skips unneeded state permutations vs predictable execution loop'],
        ['Call Stack Risk', 'Vulnerable to Stack Overflow (O(n))', 'Zero Call Stack Risk (O(1) stack)', 'Max recursion limit exceeded on deep trees vs iterative safety'],
        ['Space Optimization', 'O(N) cache table required', 'Can compress to O(1) rolling state', 'Fixed map overhead vs rolling pointer optimizations']
      ],
      quiz: [
        {
          question: 'What is the primary operational advantage of Bottom-Up Tabulation over Top-Down Memoization?',
          options: [
            ['Tabulation completely avoids recursion call stack overhead and prevents stack overflow crashes.', true, 'Tabulation is strictly iterative, running in a flat loop without pushing stack frames.'],
            ['Tabulation solves problems in O(1) time complexity.', false, 'Time complexity is generally identical O(N); tabulation saves stack space and call overhead.'],
            ['Tabulation requires no memory allocation.', false, 'Tabulation still uses state memory, although it can often be compressed.']
          ]
        },
        {
          question: 'In what scenario is Top-Down Memoization preferred over Bottom-Up Tabulation?',
          options: [
            ['When only a small sparse fraction of all possible subproblem states need to be evaluated.', true, 'Memoization computes states lazily on demand, skipping vast portions of unreachable state space.'],
            ['When running in memory-constrained microcontrollers with tiny call stacks.', false, 'Microcontrollers benefit from iterative loops without recursion.'],
            ['When debugging multi-threaded locking race conditions.', false, 'Recursion adds complexity to multi-threaded debugging.']
          ]
        }
      ],
      takeaways: [
        'Verify optimal substructure before writing dynamic programming code.',
        'Start by drafting the top-down recursive formula to verify correctness, then convert to bottom-up tabulation.',
        'Look for rolling state optimizations: if state depends only on i-1 and i-2, discard the full O(N) array.',
        'Watch out for deep recursion in languages like Python where default recursion depth is capped at 1000.'
      ]
    };
  }

  // 5. Machine Learning / Gradient Descent Optimization
  if (['gradient', 'loss', 'optimization', 'neural', 'machine learning', 'ai', 'descent'].some(k => combined.includes(k))) {
    return {
      category: 'Mathematical Optimization & Deep Learning',
      subtitle: 'Convex loss landscapes, learning rate schedules, and backpropagation mechanics.',
      objectives: [
        'Understand the mathematical derivation of gradient descent: weight updates proportional to negative gradient.',
        'Analyze the impact of learning rate (alpha): underfitting vs oscillation and divergence.',
        'Compare Batch Gradient Descent, Mini-Batch SGD, and adaptive optimizers (Adam, RMSprop).',
        'Explore interactive loss surface navigation via HTML5 canvas simulation.'
      ],
      conceptsHtml: `<p><strong>Gradient Descent</strong> is the foundational optimization engine powering modern deep neural networks. By calculating the partial derivative of the loss objective function with respect to model parameters, it iteratively adjusts weights along the steepest descent path to reach local or global minima.</p>
<p>The parameter update rule is expressed as <code>w := w - alpha * (dJ/dw)</code>, where <code>alpha</code> denotes the <strong>learning rate</strong>. Choosing <code>alpha</code> is critical: if too small, convergence requires millions of compute cycles; if too large, the updates oscillate wildly and diverge across steep loss walls.</p>`,
      calloutTitle: 'Momentum & Adaptive Rates',
      calloutText: 'Modern optimizers like Adam combine momentum (exponentially decaying moving average of past gradients) with adaptive learning rates per parameter, preventing stagnation in saddle points and ravines.',
      codeLang: 'typescript',
      codeTitle: 'GradientDescent.ts',
      code: `// Stochastic Gradient Descent with Momentum Optimizer
export class SGDOptimizer {
  private velocity = 0;

  constructor(
    private learningRate: number = 0.05,
    private momentum: number = 0.9
  ) {}

  public updateWeight(currentWeight: number, gradient: number): number {
    // Update velocity vector with momentum
    this.velocity = (this.momentum * this.velocity) + (this.learningRate * gradient);
    // Step weight in the direction of negative gradient
    return currentWeight - this.velocity;
  }
}`,
      tradeoffs: [
        ['Optimizer', 'Vanilla Batch Gradient Descent', 'Adam / RMSprop (Adaptive)', 'Precise true gradient vs per-parameter adaptive momentum'],
        ['Batch Size', 'Full Batch (N)', 'Mini-Batch (32 - 512)', 'Exact gradient computation vs GPU parallel throughput and stochastic regularization'],
        ['Learning Rate', 'Constant Alpha', 'Cosine Annealing with Warmup', 'Simple hyperparameter vs escape from sharp local minima'],
        ['Loss Surface', 'Convex (Single Global Minima)', 'Non-Convex (Deep Neural Nets)', 'Guaranteed convergence vs saddle points, plateaus, and ravines']
      ],
      quiz: [
        {
          question: 'What occurs when the learning rate (alpha) in gradient descent is set too high?',
          options: [
            ['The optimization steps overshoot the minimum, potentially oscillating and diverging to infinity.', true, 'Overshooting the valley floor causes successively larger gradient calculations and numerical explosion.'],
            ['The model immediately gets stuck in a local minimum on the first step.', false, 'High learning rates leap over local minima rather than getting trapped.'],
            ['The gradient automatically vanishes to zero.', false, 'Vanishing gradients occur from deep sigmoid activations or tiny learning rates, not excessive alpha.']
          ]
        },
        {
          question: 'Why is Mini-Batch SGD preferred over Full-Batch Gradient Descent for training deep learning models?',
          options: [
            ['It maximizes GPU SIMD parallelism while introducing stochastic noise that helps escape local minima.', true, 'Mini-batches fit in VRAM, utilize tensor cores efficiently, and the gradient noise aids generalization.'],
            ['It guarantees finding the absolute global minimum in non-convex landscapes.', false, 'No gradient-based method guarantees the global minimum in non-convex neural net landscapes.'],
            ['It requires zero hyperparameter tuning.', false, 'Mini-batch training still requires tuning learning rate, batch size, and weight decay.']
          ]
        }
      ],
      takeaways: [
        'Always normalize or standardize input features (mean=0, std=1) to prevent elongated elliptical loss contours.',
        'Implement learning rate schedules (e.g. linear warmup followed by cosine decay) for stable training.',
        'Monitor gradient norms during training to detect exploding or vanishing gradients early.',
        'Default to AdamW (Adam with decoupled weight decay) for transformers and modern deep learning models.'
      ]
    };
  }

  // 6. LangGraph & Generative Agent Workflows
  if (['langgraph', 'agent', 'workflow', 'tools', 'mcp', 'claude', 'state'].some(k => combined.includes(k))) {
    return {
      category: 'Autonomous Agents & Graph Workflows',
      subtitle: 'StateGraph cycles, tool-calling loops, checkpoints, and human-in-the-loop control.',
      objectives: [
        'Understand why cyclical graphs overcome the fundamental limitations of linear DAG chains.',
        'Master StateGraph fundamentals: Shared State, Node executors, and Conditional Router edges.',
        'Implement persistent checkpointing for fault-tolerant agent execution and human-in-the-loop validation.',
        'Analyze reflection, self-correction, and tool invocation loop convergence.'
      ],
      conceptsHtml: `<p>Traditional LLM orchestration pipelines rely on <strong>Directed Acyclic Graphs (DAGs)</strong> that process prompt chains linearly. However, autonomous agents, code-generation loops, and iterative research require <strong>cyclical execution</strong>: drafting, invoking tools, observing feedback, and looping until completion conditions are satisfied.</p>
<p><strong>LangGraph</strong> models agentic systems as state machines. Nodes represent compute steps (e.g., an LLM prompt or tool execution), edges define routing logic, and conditional edges evaluate runtime state to decide whether to loop back for another tool call or terminate with a final answer.</p>`,
      calloutTitle: 'Cycle Termination Guardrails',
      calloutText: 'Autonomous agent graphs must strictly enforce a maximum recursion limit (e.g. max_steps = 15) to prevent infinite billing and runaway hallucination loops when external tools fail.',
      codeLang: 'typescript',
      codeTitle: 'AgentStateGraph.ts',
      code: `// Cyclical Agent State Machine Architecture
export interface AgentState {
  messages: Array<{ role: string; content: string }>;
  iterationCount: number;
  isComplete: boolean;
}

export class AgentStateGraph {
  constructor(private maxIterations: number = 8) {}

  public async runLoop(initialState: AgentState): Promise<AgentState> {
    let state = { ...initialState };

    while (!state.isComplete && state.iterationCount < this.maxIterations) {
      state.iterationCount++;
      // 1. Execute LLM Reasoning Node
      state = await this.reasoningNode(state);

      // 2. Conditional Routing Edge
      if (this.shouldCallTool(state)) {
        state = await this.toolExecutionNode(state);
      } else {
        state.isComplete = true; // Termination signal
      }
    }

    return state;
  }

  private async reasoningNode(state: AgentState): Promise<AgentState> {
    return state;
  }

  private async toolExecutionNode(state: AgentState): Promise<AgentState> {
    return state;
  }

  private shouldCallTool(state: AgentState): boolean {
    const lastMsg = state.messages[state.messages.length - 1];
    return lastMsg?.content.includes("TOOL_CALL") || false;
  }
}`,
      tradeoffs: [
        ['Architecture', 'Linear Chains (LangChain DAG)', 'Cyclic Graphs (LangGraph StateGraph)', 'Predictable step sequence vs autonomous multi-step problem solving'],
        ['Memory', 'Stateless Context Window', 'Persistent State Checkpointer', 'Ephemeral single-session vs resumable, fault-tolerant long workflows'],
        ['Control Flow', 'Fixed Orchestration', 'Dynamic Conditional Edges', 'Hardcoded control flow vs runtime model decision making'],
        ['Safety Guardrail', 'Timeout Timer', 'Human-in-the-Loop Interrupt', 'Unchecked automated execution vs critical review before destructive actions']
      ],
      quiz: [
        {
          question: 'What is the primary architectural differentiator of LangGraph compared to standard LangChain chains?',
          options: [
            ['LangGraph natively supports cyclical graphs with conditional routing and checkpointed state.', true, 'LangGraph allows loops and cycles, which are essential for agent reflection and iterative tool use.'],
            ['LangGraph only works with open-source local LLMs.', false, 'LangGraph works with any model provider including OpenAI, Anthropic, Gemini, and Ollama.'],
            ['LangGraph replaces Python with C++ for high performance.', false, 'LangGraph is implemented in Python and TypeScript.']
          ]
        },
        {
          question: 'Why is persistent checkpointing critical for production agent workflows?',
          options: [
            ['It allows long-running agent workflows to pause for human approval and resume from exact state after crashes.', true, 'Checkpoints persist state across node transitions, enabling fault tolerance and human-in-the-loop review.'],
            ['It eliminates the need for LLM API keys.', false, 'Checkpoints store workflow memory; they have no relation to API authorization.'],
            ['It reduces token costs to zero.', false, 'Tokens are still consumed; checkpoints ensure progress is not lost upon failure.']
          ]
        }
      ],
      takeaways: [
        'Structure agent state as append-only or reducer-based immutability to facilitate clean rollback and replay.',
        'Add explicit Human-in-the-Loop interrupt nodes before executing non-idempotent operations (DB writes, emails, payments).',
        'Implement tight token budgets and recursion limiters on every StateGraph instance.',
        'Separate the Planner Agent from the Executor Agent to improve reasoning precision and reduce hallucinations.'
      ]
    };
  }

  // 7. Scalability & System Architecture (Default fallback)
  return {
    category: 'Scalable Systems Engineering',
    subtitle: `Architectural invariants, high-availability patterns, and operational trade-offs for ${title}.`,
    objectives: [
      `Master the foundational mental model and internal mechanics of ${title}.`,
      'Analyze key design patterns, state invariants, and operational bottlenecks.',
      'Explore interactive visual topology diagrams and system simulations.',
      'Evaluate real-world engineering trade-offs and battle-tested industry practices.'
    ],
    conceptsHtml: `<p>Designing modern software architectures around <strong>${title}</strong> requires balancing modular decoupling, fault isolation, and predictable latency profiles under peak throughput.</p>
<p>Production engineering demands moving beyond naive implementations. By structuring systems with clear boundaries, automated health probes, and stateless scaling tiers, systems achieve robust resilience against unexpected traffic spikes and node degradation.</p>`,
    calloutTitle: 'Core Architectural Invariant',
    calloutText: `When implementing systems around ${title}, prioritize graceful degradation under load, modular isolation, and observable telemetry over premature micro-optimizations.`,
    codeLang: 'typescript',
    codeTitle: `${title.replace(/[^a-zA-Z0-9]/g, '')}Engine.ts`,
    code: `// Production Architectural Implementation for ${title}
export class ProductionEngine {
  private isHealthy = true;

  constructor(private readonly config: { timeoutMs: number; maxRetries: number }) {}

  async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isHealthy) {
      throw new Error("Circuit breaker open: Service degraded for ${title}");
    }
    try {
      return await operation();
    } catch (err) {
      this.handleDegradedState(err);
      throw err;
    }
  }

  private handleDegradedState(err: unknown): void {
    console.error("System degraded:", err);
    this.isHealthy = false;
  }
}`,
    tradeoffs: [
      ['Latency', 'In-Memory / L4 Caching', 'Disk-Based Persistent Lookups', 'Sub-millisecond access vs data capacity and persistence safety'],
      ['Consistency', 'Strong Consensus (Raft/Paxos)', 'Eventual Consistency', 'Write latency penalty vs stale read tolerance'],
      ['Fault Tolerance', 'Active-Active Multi-Region', 'Active-Passive Warm Standby', 'Zero-downtime failover vs infrastructure cost overhead'],
      ['Scalability', 'Horizontal Stateless Scaling', 'Vertical Hardware Upgrades', 'Elastic auto-scaling vs single machine capacity ceilings']
    ],
    quiz: [
      {
        question: `What is the primary operational trade-off when scaling ${title} in distributed environments?`,
        options: [
          ['Balancing system consistency, availability, and end-to-end latency across network boundaries.', true, 'Every distributed architecture must balance state consistency, network latency, and continuous availability.'],
          ['Maximizing raw CPU clock speed on a single monolithic server.', false, 'Horizontal distribution focuses on clusters of nodes rather than single CPU limits.'],
          ['Reducing memory consumption to absolute zero.', false, 'Memory is traded for caching and performance in modern systems.']
        ]
      },
      {
        question: 'How should an enterprise architecture handle transient node failures in production?',
        options: [
          ['Use circuit breakers, health checks, and automatic failover to isolate failed nodes instantly.', true, 'Isolating failing nodes prevents cascading failures and maintains overall cluster health.'],
          ['Block all client connections synchronously until the failed node reboots.', false, 'Synchronous blocking leads to request queuing and cluster-wide collapse.'],
          ['Immediately terminate all other worker nodes.', false, 'Terminating healthy nodes turns a minor incident into a total outage.']
        ]
      }
    ],
    takeaways: [
      `Isolate dependencies and decouple state to enable independent horizontal scaling of ${title}.`,
      'Instrument deep metrics (p50, p95, p99 latency, error rates, saturation) to inform capacity planning.',
      'Implement defensive timeouts, retry limits with exponential backoff, and circuit breakers.',
      'Continuously validate system failover through chaos testing and automated recovery drills.'
    ]
  };
}

/**
 * True when `rawAiOutput` looks like a genuinely complete, usable lesson document
 * (as opposed to something truncated mid-generation or otherwise malformed) --
 * shared by the manual-lesson-creation fallback below and by the AI generation path
 * in index.ts, which errors out rather than silently substituting the generic
 * template in this file when this returns false.
 */
export function isCompleteAiLessonHtml(rawAiOutput: string): boolean {
  const raw = (rawAiOutput || '').trim();
  const rawLower = raw.toLowerCase();
  return (
    rawLower.includes('<html') &&
    rawLower.includes('</html>') &&
    (rawLower.includes('<style') || rawLower.includes('class=')) &&
    raw.length > 1000 &&
    (rawLower.includes('quiz') || rawLower.includes('objective') || rawLower.includes('visual'))
  );
}

export function buildStructuredLessonHtml(opts: StructuredLessonOptions): string {
  const raw = (opts.rawAiOutput || '').trim();

  // If the model already returned a complete, valid HTML document with styles and structure
  if (isCompleteAiLessonHtml(raw)) {
    let clean = raw;
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-zA-Z0-9_-]*\n?/, '');
      if (clean.endsWith('```')) clean = clean.slice(0, -3);
      clean = clean.trim();
    }
    return clean;
  }

  // Otherwise, construct the full standardized ByteByteGo-style lesson document
  const finalTitle = opts.title || 'Technical Architecture & Fundamentals';
  const clsName = opts.className || 'Engineering';
  const subjName = opts.subjectName || 'General';

  const profile = getTopicProfile(finalTitle, clsName, subjName, opts.topicOrContent);
  const visualWidget = generateNativeVisual(
    { title: finalTitle, class_name: clsName, subject_name: subjName },
    opts.topicOrContent
  );

  const objsHtml = profile.objectives.map(obj => `      <li>${obj}</li>`).join('\n');

  const tradeoffRows = profile.tradeoffs.map(([dim, appA, appB, tradeoff]) => `          <tr>
            <td><strong>${dim}</strong></td>
            <td>${appA}</td>
            <td>${appB}</td>
            <td>${tradeoff}</td>
          </tr>`).join('\n');

  const quizCards = profile.quiz.map((q, qIdx) => {
    const optButtons = q.options.map(([optText, isCorrect, exp], oIdx) => {
      const isCorrStr = isCorrect ? 'true' : 'false';
      const cleanExp = exp.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const letter = String.fromCharCode(65 + oIdx);
      return `        <button class="quiz-option-btn" onclick="handleQuiz(${qIdx}, ${oIdx}, ${isCorrStr}, '${cleanExp}')">
          ${letter}) ${optText}
        </button>`;
    }).join('\n');

    return `    <div class="quiz-card" id="qcard-${qIdx}">
      <div class="quiz-question">${qIdx + 1}. ${q.question}</div>
      <div class="quiz-options">
${optButtons}
      </div>
      <div class="quiz-feedback" id="feedback-${qIdx}"></div>
    </div>`;
  }).join('\n\n');

  const takeawaysHtml = profile.takeaways.map(item => `      <li>${item}</li>`).join('\n');

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const contextBannerItems: string[] = [];
  if (opts.classDescription) {
    contextBannerItems.push(`<div class="context-item"><span class="context-label">Domain Scope:</span> ${escapeHtml(opts.classDescription)}</div>`);
  }
  if (opts.classContext) {
    contextBannerItems.push(`<div class="context-item"><span class="context-label">AI Guidance:</span> ${escapeHtml(opts.classContext)}</div>`);
  }
  if (opts.subjectContext) {
    contextBannerItems.push(`<div class="context-item"><span class="context-label">Subject Focus:</span> ${escapeHtml(opts.subjectContext)}</div>`);
  }
  if (opts.subjectDescription) {
    contextBannerItems.push(`<div class="context-item"><span class="context-label">Subject Scope:</span> ${escapeHtml(opts.subjectDescription)}</div>`);
  }

  const contextBannerHtml = contextBannerItems.length > 0
    ? `  <div class="context-banner">
    <div class="context-badge">Class: <strong>${escapeHtml(clsName)}</strong> &bull; Subject: <strong>${escapeHtml(subjName)}</strong></div>
    ${contextBannerItems.join('\n    ')}
  </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${finalTitle} | AI LMS</title>
  <style>
    ${PREMIUM_DESIGN_TOKENS_CSS}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.7;
      padding: 3.5rem 1.5rem 5rem;
      max-width: 800px;
      margin: 0 auto;
    }
    ::selection { background: var(--primary-soft); color: var(--text); }
    header {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.75rem;
    }
    .badges {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 1.1rem;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.3rem 0.7rem;
      border-radius: 999px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .badge-class { background: var(--primary-soft); color: var(--primary); }
    .badge-subject { background: var(--secondary-soft); color: var(--secondary); }
    .badge-time { background: var(--surface-2); color: var(--text-muted); }
    .badge-interactive { background: var(--success-soft); color: var(--success); }
    h1 {
      font-size: 2.1rem;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
      margin-bottom: 0.6rem;
      line-height: 1.25;
    }
    .subtitle {
      font-size: 1.05rem;
      color: var(--text-muted);
      line-height: 1.6;
      max-width: 60ch;
    }
    .context-banner {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-left: 3px solid var(--primary);
      border-radius: 0 10px 10px 0;
      padding: 0.9rem 1.25rem;
      margin: 1.75rem 0 2rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .context-badge {
      color: var(--text);
      font-size: 0.88rem;
      font-weight: 600;
    }
    .context-item {
      line-height: 1.5;
    }
    .context-label {
      color: var(--primary);
      font-weight: 600;
      margin-right: 0.35rem;
    }
    .objectives-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem 1.75rem;
      margin: 2rem 0;
      box-shadow: var(--shadow);
    }
    .objectives-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--primary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.85rem;
    }
    .objectives-list {
      list-style: none;
      color: var(--text);
    }
    .objectives-list li {
      position: relative;
      padding-left: 1.4rem;
      margin-bottom: 0.55rem;
      line-height: 1.55;
    }
    .objectives-list li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.5em;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--primary);
    }
    section {
      margin-bottom: 3rem;
    }
    h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1.1rem;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    h2::before {
      content: '';
      display: inline-block;
      width: 4px;
      height: 1.1em;
      background: var(--primary);
      border-radius: 2px;
      flex-shrink: 0;
    }
    p {
      margin-bottom: 1.2rem;
      color: var(--text);
      opacity: 0.92;
      font-size: 1.02rem;
      line-height: 1.75;
    }
    .callout {
      background: var(--surface-2);
      border-left: 3px solid var(--primary);
      border-radius: 0 10px 10px 0;
      padding: 1.15rem 1.4rem;
      margin: 1.5rem 0;
      color: var(--text);
      font-size: 0.98rem;
      line-height: 1.65;
    }
    .callout strong {
      color: var(--primary);
    }
    .code-block {
      border: 1px solid var(--code-border);
      border-radius: 10px;
      overflow: hidden;
      margin: 1.5rem 0;
      box-shadow: var(--shadow);
    }
    .code-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.6rem 0.9rem;
      background: var(--code-bg);
      border-bottom: 1px solid var(--code-border);
    }
    .code-dots {
      display: flex;
      gap: 0.35rem;
    }
    .code-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: rgba(242, 237, 226, 0.18);
    }
    pre {
      background: var(--code-bg);
      padding: 1.25rem 1.4rem;
      overflow-x: auto;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.88rem;
      color: var(--code-text);
      margin: 0;
    }
    .copy-btn {
      background: transparent;
      border: 1px solid var(--code-border);
      color: rgba(242, 237, 226, 0.7);
      border-radius: 6px;
      padding: 0.25rem 0.65rem;
      font-size: 0.72rem;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.15s ease;
    }
    .copy-btn:hover {
      background: rgba(242, 237, 226, 0.08);
      color: var(--code-text);
    }
    .table-container {
      overflow-x: auto;
      margin: 1.5rem 0;
      border-radius: 10px;
      border: 1px solid var(--border);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.92rem;
    }
    th {
      background: var(--surface-2);
      color: var(--text);
      padding: 0.75rem 1rem;
      font-weight: 700;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--surface-2); }
    .quiz-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.75rem;
      margin-top: 3rem;
      box-shadow: var(--shadow);
    }
    .quiz-header {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .quiz-score-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      background: var(--surface-2);
      color: var(--text-muted);
    }
    .quiz-score-badge.is-correct {
      background: var(--success-soft);
      color: var(--success);
    }
    .quiz-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      margin-bottom: 1.1rem;
    }
    .quiz-question {
      font-weight: 600;
      margin-bottom: 1rem;
      color: var(--text);
      font-size: 0.98rem;
    }
    .quiz-options {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .quiz-option-btn {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.7rem 1rem;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
      font-size: 0.92rem;
      font-family: inherit;
      transition: all 0.15s ease;
    }
    .quiz-option-btn:hover {
      border-color: var(--primary);
      background: var(--primary-soft);
    }
    .quiz-option-btn:disabled { cursor: default; }
    .quiz-option-btn.is-correct {
      border-color: var(--success);
      background: var(--success-soft);
      color: var(--text);
    }
    .quiz-option-btn.is-incorrect {
      border-color: var(--danger);
      background: var(--danger-soft);
      color: var(--text);
    }
    .quiz-feedback {
      margin-top: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.88rem;
      line-height: 1.55;
      display: none;
    }
    .quiz-feedback.is-correct {
      display: block;
      background: var(--success-soft);
      color: var(--success);
      border: 1px solid var(--success);
    }
    .quiz-feedback.is-incorrect {
      display: block;
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid var(--danger);
    }
    .takeaways-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem 1.75rem;
      margin-top: 2rem;
    }
    .takeaways-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.85rem;
    }
    .takeaways-list {
      list-style: none;
    }
    .takeaways-list li {
      position: relative;
      padding-left: 1.6rem;
      margin-bottom: 0.6rem;
      color: var(--text);
      line-height: 1.55;
    }
    .takeaways-list li::before {
      content: '✓';
      position: absolute;
      left: 0;
      top: -0.05em;
      width: 1.05rem;
      height: 1.05rem;
      border-radius: 50%;
      background: var(--success-soft);
      color: var(--success);
      font-size: 0.65rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    @media (max-width: 640px) {
      body { padding: 2rem 1.1rem 4rem; }
      h1 { font-size: 1.6rem; }
    }
  </style>
</head>
<body>
  <header>
    <div class="badges">
      <span class="badge badge-class">${clsName}</span>
      <span class="badge badge-subject">${subjName}</span>
      <span class="badge badge-time">8 min read</span>
      <span class="badge badge-interactive">Interactive</span>
    </div>
    <h1>${finalTitle}</h1>
    <div class="subtitle">${profile.subtitle}</div>
  </header>

${contextBannerHtml}

  <div class="objectives-card">
    <div class="objectives-title">Learning Objectives</div>
    <ul class="objectives-list">
${objsHtml}
    </ul>
  </div>

  <section>
    <h2>Core Concepts & Fundamentals</h2>
    ${profile.conceptsHtml}
    <div class="callout">
      <strong>${profile.calloutTitle}:</strong> ${profile.calloutText}
    </div>
  </section>

  <!-- Interactive Visual Reinforcement -->
  <section>
    <h2>Visual & Interactive Reinforcement</h2>
    <p>Engage directly with this interactive simulation widget to build an intuitive mental model:</p>
    ${visualWidget.visual_html}
  </section>

  <section>
    <h2>Deep Dive & System Mechanics</h2>
    <p>In production engineering, selecting the right pattern requires analyzing critical operational trade-offs across dimensions:</p>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Primary Pattern</th>
            <th>Alternative Pattern</th>
            <th>Critical Trade-Off</th>
          </tr>
        </thead>
        <tbody>
${tradeoffRows}
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Production Implementation Pattern</h2>
    <p>Below is a production-grade TypeScript implementation illustrating the core architectural mechanics:</p>
    <div class="code-block">
      <div class="code-header">
        <span class="code-dots"><span class="code-dot"></span><span class="code-dot"></span><span class="code-dot"></span></span>
        <button class="copy-btn" onclick="const codeEl=this.closest('.code-block').querySelector('code'); navigator.clipboard.writeText(codeEl.innerText); this.innerText='Copied'; setTimeout(() => this.innerText='Copy', 2000)">Copy</button>
      </div>
      <pre><code>${escapeHtml(profile.code)}</code></pre>
    </div>
  </section>

  <!-- Interactive Knowledge Check Quiz -->
  <div class="quiz-section">
    <div class="quiz-header">
      <span>Knowledge Check</span>
      <span class="quiz-score-badge" id="quizScoreBadge">Score: 0 / ${profile.quiz.length}</span>
    </div>

${quizCards}
  </div>

  <div class="takeaways-card">
    <div class="takeaways-title">Key Takeaways</div>
    <ul class="takeaways-list">
${takeawaysHtml}
    </ul>
  </div>

  <script>
    let correctCount = 0;
    const totalQ = ${profile.quiz.length};

    function handleQuiz(qIdx, optIdx, isCorrect, explanation) {
      const card = document.getElementById('qcard-' + qIdx);
      const fb = document.getElementById('feedback-' + qIdx);
      const btns = card.querySelectorAll('.quiz-option-btn');
      btns.forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === optIdx) {
          btn.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');
        }
      });
      fb.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');
      fb.innerHTML = (isCorrect ? '<strong>Correct.</strong> ' : '<strong>Not quite.</strong> ') + explanation;

      if (isCorrect) correctCount++;
      const scoreBadge = document.getElementById('quizScoreBadge');
      if (scoreBadge) {
        scoreBadge.innerText = 'Score: ' + correctCount + ' / ' + totalQ;
        if (correctCount === totalQ) {
          scoreBadge.classList.add('is-correct');
        }
      }
    }
  </script>
</body>
</html>`;
}
