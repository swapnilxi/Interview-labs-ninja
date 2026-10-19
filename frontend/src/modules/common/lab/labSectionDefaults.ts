import type { CSSProperties } from 'react';
import type { LabName } from '@/lib/services/labSectionsService';

export interface SectionDef {
  id: string;
  label: string;
  icon: string;
  subtitle: string;
  guidance?: string;
  aiGenerated?: boolean;
}

export interface LabMeta {
  key: LabName;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  /**
   * The lab's identity colour, as a CSS value for `--lab-identity` (read by `.lab-tile`): DSA is the Settings accent,
   * CV and System Design keep their own hue. Never use it for a button, row, link or progress bar.
   */
  identity: string;
  defaultPromptAddons: { label: string; text: string }[];
  sampleTopic: { name: string; brief: string; subtopic?: string };
}

/* ── DSA GUIDANCE ── */
export const DSA_APPROACHES_GUIDANCE = `Teach this problem as a guided progression of approaches, the way a good mentor walks a learner from a first instinct to the optimal solution. Number the approaches in the order the learner should meet them: 3 or 4 approaches in total, starting with the most naive and ending with the optimal one. The LAST approach MUST be the optimal one and say so.

For EACH approach use bold lines for these sub-headings in this order:
**Approach N: <descriptive name>**
**Intuition:** the mechanical idea in plain language — what state is kept, what invariant is preserved.
**Algorithm:** 3-5 concise numbered steps.
**Code:** complete, runnable Python inside a fenced \`\`\`python block. Use clean, idiomatic variable names and inline comments only where an invariant is subtle.
**Dry run:** a 3-4 row ASCII/text trace table on a small concrete input showing variables update per step.
**Complexity:** Time: O(...) with a one-line proof; Space: O(...) explaining exactly what consumes memory.
**Why move on?** (omit on the final approach): the concrete bottleneck that forces us to do better (for example "O(n²) time TLEs on n=10⁵; we repeatedly recompute prefix sums").

End with a summary table comparing all approaches on Time, Space, Implementation difficulty (Low/Med/High), and Best for (interview first instinct / small inputs / production).`;

export const DSA_PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to solve THIS problem, as short bullets under these bold headings, in this order:
**Python language features** - specific constructs this solution uses (for example dictionary comprehension, \`enumerate()\`, \`collections.deque\`, \`heapq.heappush\`).
**Data structures** - the concrete structures it operates on or relies on (for example singly-linked list node mutation, 0-indexed binary heap array, circular queue).
**Algorithms & ideas** - the techniques and simpler problems this one builds on (for example slow and fast pointers, prefix sums, binary search on a sorted array).
Add **Math / bit tricks** as a fourth group only if the problem needs it.

Every bullet names ONE concrete skill, never a vague area like "basic Python" or "arrays". Put a tiny example in backticks where it helps (for example \`d[k] = d.get(k, 0) + 1\`). Use 8-14 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const DSA_SECTION_DEFS: readonly SectionDef[] = [
  { id: 'prerequisites',   label: 'Prerequisites',               icon: 'AcademicCapIcon',            subtitle: 'Specific Python, data-structure and algorithm skills to have first', guidance: DSA_PREREQUISITES_GUIDANCE },
  { id: 'theory',          label: 'Core Theory',                 icon: 'CalculatorIcon',             subtitle: 'Mathematical foundations + intuition', guidance: 'Explain the core algorithmic pattern, invariants, mathematical proof, and mental intuition for this problem.' },
  { id: 'approaches',      label: 'Approaches',                  icon: 'ArrowTrendingUpIcon',        subtitle: 'Brute force → optimal, and why each one gives way', aiGenerated: true, guidance: DSA_APPROACHES_GUIDANCE },
  { id: 'visual',          label: 'Visual Architecture',         icon: 'PhotoIcon',                  subtitle: 'Data flow diagrams + architecture', guidance: 'Provide clear ASCII art diagrams and step-by-step visual transitions illustrating pointer movement, array partitioning, or state stack changes.' },
  { id: 'implementation',  label: 'Practical Implementation',    icon: 'CodeBracketIcon',            subtitle: 'Python code, walkthrough, dry-run', guidance: 'Provide production-grade, bug-free Python code with robust type hints, docstrings, variable invariants, and detailed line-by-line dry run.' },
  { id: 'hyperparameters', label: 'Design Choices',              icon: 'AdjustmentsHorizontalIcon',  subtitle: 'Patterns, variants, time/space trade-offs', guidance: 'Examine design tradeoffs, memory layout implications, recursion vs iteration, cache friendliness, and alternate data structure choices.' },
  { id: 'pitfalls',        label: 'Common Pitfalls',             icon: 'BugAntIcon',                 subtitle: 'Edge cases, mistakes, and gotchas', guidance: 'List critical edge cases (empty input, duplicates, overflow, single element, negative numbers, cycles) and common interview bugs.' },
  { id: 'applications',    label: 'Real-World Applications',     icon: 'BuildingOffice2Icon',        subtitle: 'Industry use cases + company examples', guidance: 'Connect this algorithmic pattern to real production systems (e.g., database indexing, network routing, garbage collection, LRU caches, sliding window rate limiters).' },
  { id: 'interview',       label: 'Interview Questions',         icon: 'ChatBubbleLeftRightIcon',    subtitle: 'Conceptual + coding + pattern signals', guidance: 'Provide realistic senior tech interview questions, verbal problem-solving signals, clarifying questions to ask, and candidate follow-ups.' },
  { id: 'comparison',      label: 'Comparison w/ Alternatives',  icon: 'ScaleIcon',                  subtitle: 'Tradeoff table + when to use each', guidance: 'Build a Markdown table comparing this algorithmic approach against 2-3 competitive alternatives across time, space, code complexity, and constraints.' },
  { id: 'paper',           label: 'Research Context',            icon: 'DocumentMagnifyingGlassIcon',subtitle: 'References, SOTA, known variants', guidance: 'Cite seminal computer science papers, originators of the algorithm, theoretical lower bounds, and advanced modern variations.' },
  { id: 'quiz',            label: 'Quiz',                        icon: 'TrophyIcon',                 subtitle: '4 questions, score tracked, generate more' },
  { id: 'references',      label: 'References & Resources',      icon: 'BookOpenIcon',               subtitle: 'NeetCode, LeetCode, Striver, GFG, MIT OCW', guidance: 'Curate top reference links, problem IDs, NeetCode/Striver roadmap mappings, and MIT OCW lectures.' },
];

/* ── CV GUIDANCE ── */
export const CV_PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to follow THIS topic, as short bullets under these bold headings, in this order:
**Python & library skills** - concrete NumPy / OpenCV / PyTorch skills the topic uses (for example matrix multiplication with \`@\`, tensor shapes and permute, updating a dict of results after converting arrays to lists, hashmap lookups).
**Math & tensor operations** - the maths the topic leans on (for example matrix multiplication, homogeneous coordinates, gradients, softmax).
**Core concepts** - vision and deep-learning ideas to know first (for example intrinsic vs extrinsic camera parameters, convolution, IoU), and the earlier topics in this lab it builds on.

Every bullet names ONE concrete skill, never a vague area like "basic Python" or "linear algebra". Put a tiny example in backticks where it helps. Use 8-14 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const CV_SECTION_DEFS: readonly SectionDef[] = [
  { id: 'prerequisites',   label: 'Prerequisites',                       icon: 'AcademicCapIcon',            subtitle: 'Specific Python, math and vision skills to have first', guidance: CV_PREREQUISITES_GUIDANCE },
  { id: 'theory',          label: 'Core Theory',                         icon: 'CalculatorIcon',             subtitle: 'Mathematical foundations + equations', guidance: 'Present the rigorous mathematical foundations, coordinate geometry, continuous/discrete transforms, and theoretical derivations.' },
  { id: 'visual',          label: 'Visual Explanation & Architecture',   icon: 'PhotoIcon',                  subtitle: 'Data flow diagrams + architecture', guidance: 'Provide ASCII diagrams of pixel coordinate transformations, convolutional kernels, receptive fields, feature maps, or neural network pipelines.' },
  { id: 'implementation',  label: 'Practical Implementation',            icon: 'CodeBracketIcon',            subtitle: 'OpenCV / PyTorch code examples', guidance: 'Provide production-ready Python code using OpenCV and PyTorch with tensor dimension assertions, input normalization, and visualization hooks.' },
  { id: 'hyperparameters', label: 'Hyperparameters & Design Choices',     icon: 'AdjustmentsHorizontalIcon',  subtitle: 'What to tune, typical values, tradeoffs', guidance: 'Break down kernel sizes, thresholds, learning rates, anchor boxes, loss weights, and resolution tradeoffs with recommended default ranges.' },
  { id: 'pitfalls',        label: 'Common Pitfalls & Debugging',         icon: 'BugAntIcon',                 subtitle: 'What goes wrong and how to fix it', guidance: 'Cover sensor noise, illumination variations, color space mix-ups (RGB vs BGR), stride alignment, coordinate flips, and vanishing gradients.' },
  { id: 'applications',    label: 'Real-World Applications',             icon: 'BuildingOffice2Icon',        subtitle: 'Industry use cases + company examples', guidance: 'Explain deployment in autonomous vehicles, medical imaging, robotics, satellite imagery, industrial quality inspection, and mobile AR.' },
  { id: 'interview',       label: 'Important Interview Questions',       icon: 'ChatBubbleLeftRightIcon',    subtitle: 'Conceptual + coding + detailed answers', guidance: 'Top Computer Vision engineer interview questions (Tesla, Waymo, Apple, Meta), mathematical whiteboarding probes, and coding questions.' },
  { id: 'comparison',      label: 'Comparison with Alternatives',         icon: 'ScaleIcon',                  subtitle: 'Tradeoff table + when to use each', guidance: 'Detailed comparison table of classical vs deep learning approaches, computational latency, parameter counts, and edge device suitability.' },
  { id: 'paper',           label: 'Paper & Research Context',            icon: 'DocumentMagnifyingGlassIcon',subtitle: 'Original paper + SOTA evolution', guidance: 'Trace the history from classical papers to modern transformer/diffusion vision breakthroughs and state-of-the-art benchmarks.' },
  { id: 'quiz',            label: 'Quiz',                                icon: 'TrophyIcon',                 subtitle: '4 questions, score tracked, generate more' },
  { id: 'references',      label: 'References & Resources',              icon: 'BookOpenIcon',               subtitle: 'CS231n, Papers With Code, OpenCV docs', guidance: 'Key references to Stanford CS231n, PapersWithCode, official OpenCV/PyTorch documentation, and CVPR benchmark papers.' },
];

/* ── SYSTEM DESIGN GUIDANCE ── */
export const SD_PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to follow THIS design, as short bullets under these bold headings, in this order:
**Networking & web basics** - protocols and web pieces the design uses (for example HTTP redirects 301 vs 302, WebSocket vs polling, CDN caching headers).
**Data & storage** - the storage concepts it relies on (for example indexes, replication lag, Redis sorted sets, object storage vs a database).
**Distributed-systems concepts** - the ideas to know first (for example consistent hashing, quorum, idempotency, CAP, fan-out on write).
**Estimation & math** - the numbers and formulas used in the back-of-envelope step (for example QPS = requests per day / 86,400, storage = records x size x retention).
Add **Coding skills** as a fifth group only for low-level-design topics (classes, design patterns, data structures).

Every bullet names ONE concrete skill, never a vague area like "databases" or "networking". Put a tiny example in backticks where it helps. Use 8-14 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const SYSTEM_DESIGN_SECTION_DEFS: readonly SectionDef[] = [
  { id: 'prerequisites',   label: 'Prerequisites',                       icon: 'AcademicCapIcon',            subtitle: 'Specific networking, data and distributed-systems skills to have first', guidance: SD_PREREQUISITES_GUIDANCE },
  { id: 'problem',         label: 'Problem Statement & Why It Matters',  icon: 'DocumentTextIcon',           subtitle: 'Context, challenges, interview importance', guidance: 'Clarify the core business context, scale challenges, why this system is architecturally challenging, and what FAANG interviewers assess.' },
  { id: 'requirements',    label: 'Functional & Non-Functional Requirements', icon: 'ClipboardDocumentListIcon', subtitle: 'User stories, SLOs, constraints', guidance: 'Formulate crisp functional user stories, non-functional targets (99.99% availability, p99 latency < 50ms, strong vs eventual consistency), and out-of-scope boundaries.' },
  { id: 'estimation',      label: 'Back-of-Envelope Estimation',         icon: 'CalculatorIcon',             subtitle: 'QPS, storage, bandwidth, memory', guidance: 'Calculate read/write QPS, peak multipliers, 5-year storage growth, network ingress/egress bandwidth in MB/s, and Redis cache RAM using 80/20 Pareto rule.' },
  { id: 'api',             label: 'API Design',                          icon: 'CodeBracketSquareIcon',      subtitle: 'REST endpoints, schemas, pagination', guidance: 'Define exact REST or gRPC endpoint signatures, request/response JSON payloads, status codes, idempotent keys, and cursor-based pagination.' },
  { id: 'datamodel',       label: 'Data Model',                          icon: 'CircleStackIcon',            subtitle: 'SQL schema, indexing, sharding key', guidance: 'Provide database schemas, primary/foreign keys, B-tree indexes, NoSQL document/wide-column choices, and partition/sharding key strategies.' },
  { id: 'architecture',    label: 'High-Level Architecture',             icon: 'ServerStackIcon',            subtitle: 'Component diagram + request flow', guidance: 'Provide a complete ASCII architectural block diagram with Load Balancers, API Gateways, Microservices, Caches, Queues, DBs, and step-by-step numbered request flow.' },
  { id: 'scaling',         label: 'Scaling Strategy',                    icon: 'ArrowTrendingUpIcon',        subtitle: 'Horizontal scaling, caching layers, CDN', guidance: 'Detail horizontal stateless service scaling, cache eviction (LRU), read replicas, database sharding/partitioning, and CDN edge termination.' },
  { id: 'reliability',     label: 'Reliability & Resiliency',            icon: 'ShieldCheckIcon',            subtitle: 'Replication, circuit breakers, retries', guidance: 'Explain failure handling: circuit breakers (Netflix Hystrix pattern), exponential backoff with jitter, dead letter queues, and multi-region failover.' },
  { id: 'consistency',     label: 'Consistency vs Availability (CAP)',   icon: 'ScaleIcon',                  subtitle: 'CAP applied to this specific system', guidance: 'Analyze the CAP and PACELC tradeoff for this exact system, explaining where consistency is mandatory (payments/balances) vs where eventual consistency is optimal.' },
  { id: 'security',        label: 'Security Design',                     icon: 'LockClosedIcon',             subtitle: 'Auth, rate limiting, encryption, PII', guidance: 'Cover OAuth2/JWT auth, token bucket / leaky bucket rate limiting, TLS 1.3 in-transit, AES-256 at-rest, HMAC request signing, and PII anonymization.' },
  { id: 'monitoring',      label: 'Monitoring & Observability',          icon: 'ChartBarIcon',               subtitle: 'SLOs, metrics, traces, alerting', guidance: 'Define the Golden Signals (latency, traffic, errors, saturation), Prometheus metrics, OpenTelemetry distributed traces, and P1 on-call alert thresholds.' },
  { id: 'bottlenecks',     label: 'Bottleneck Analysis',                 icon: 'BoltSlashIcon',              subtitle: 'What breaks at scale + solutions', guidance: 'Identify single points of failure (SPOFs), database hot partitions (celebrity problem), cache stampedes, thundering herds, and their architectural fixes.' },
  { id: 'interview_tips',  label: 'Interview Discussion Tips',           icon: 'AcademicCapIcon',            subtitle: '45-min structure, what FAANG expects', guidance: 'Provide a 45-minute interview pacing timeline (5m reqs, 5m estimation, 15m high-level, 15m deep-dive, 5m wrap-up) and pitfalls that fail candidates.' },
  { id: 'insights',        label: 'Real-World Production Insights',      icon: 'BuildingOffice2Icon',        subtitle: 'Big tech war stories, lessons learned', guidance: 'Share real engineering war stories and post-mortems from Netflix, Uber, Stripe, Amazon, or Google on how similar architectures evolved under 100x growth.' },
  { id: 'quiz',            label: 'Quiz',                                icon: 'TrophyIcon',                 subtitle: '4 questions with explanations' },
  { id: 'lld',             label: 'Low-Level Design',                    icon: 'PuzzlePieceIcon',            subtitle: 'Design patterns, class diagrams, Python code', guidance: 'Provide concrete object-oriented design (SOLID principles, GoF patterns), class hierarchy ASCII diagram, and clean thread-safe Python implementation.' },
];

/* ── LAB METADATA & QUICK ADDONS ── */
export const LABS_CONFIG: Record<LabName, LabMeta> = {
  dsa: {
    key: 'dsa',
    name: 'Data Structures & Algorithms Lab',
    shortName: 'DSA Lab',
    icon: 'CpuChipIcon',
    description: 'LeetCode patterns, optimal algorithms, time/space complexity, and coding interview walkthroughs.',
    identity: 'var(--color-primary)',
    sampleTopic: { name: 'Two Pointer Technique', brief: 'Shrink or expand opposite ends of a sorted array to find target sum in O(n) time.', subtopic: 'Container With Most Water' },
    defaultPromptAddons: [
      { label: '🐍 Idiomatic Python 3', text: 'Write all code solutions in modern, highly-readable Python 3 with type hints and concise docstrings.' },
      { label: '⚡ High-Performance C++20', text: 'Provide all code snippets in modern C++20 utilizing STL containers, references, and fast I/O idioms.' },
      { label: '☕ Clean Java Solution', text: 'Provide complete Java solutions using standard collections with proper class naming and zero external libraries.' },
      { label: '🔍 Dry-Run Trace Table', text: 'Always include a 3-5 row step-by-step ASCII trace table showing pointers, variables, and data structures at each step.' },
      { label: '⏱️ Rigorous Big-O Proof', text: 'Provide explicit mathematical proofs for both worst-case and average-case time and auxiliary space complexity.' },
      { label: '🎯 FAANG Interview Tips', text: 'Highlight the exact clarifying questions to ask an interviewer and verbalize the progression of thoughts.' },
      { label: '🧪 Edge Cases Checklist', text: 'Provide a checklist of 5+ tricky corner cases with expected inputs and return values.' },
    ],
  },
  system_design: {
    key: 'system_design',
    name: 'System Design Lab',
    shortName: 'System Design',
    icon: 'ServerStackIcon',
    description: 'High-level architecture, back-of-envelope calculations, distributed systems, and FAANG design rounds.',
    identity: 'var(--lab-system)',
    sampleTopic: { name: 'Distributed Rate Limiter', brief: 'Protect services from abuse across a global cluster of API gateways.', subtopic: 'Token Bucket with Redis Cluster' },
    defaultPromptAddons: [
      { label: '📊 Detailed Capacity Math', text: 'Show explicit back-of-envelope math for QPS (reads/writes), 5-year storage retention, ingress/egress bandwidth, and RAM.' },
      { label: '🛡️ Resiliency & Circuit Breakers', text: 'Emphasize graceful degradation, circuit breaker patterns, dead letter queues, and multi-region disaster recovery.' },
      { label: '💾 DB Sharding & Indexing', text: 'Explicitly specify the database choice, composite indexing strategy, and partition/sharding key with collision resolution.' },
      { label: '🔄 Event-Driven & Async Queues', text: 'Use an event-driven architecture with Kafka/RabbitMQ for decoupling high-write traffic from asynchronous workers.' },
      { label: '⚡ Micro-second Caching', text: 'Detail multi-tier caching (Client, CDN, Redis cluster) with cache eviction policy (LRU) and stampede mitigation.' },
      { label: '⚖️ CAP & Consistency Tradeoffs', text: 'Analyze PACELC trade-offs explicitly, justifying where strong consistency is required versus eventual consistency.' },
      { label: '🏢 Real-World Tech Stack', text: 'Reference battle-tested technologies used in production at companies like Netflix, Uber, Stripe, and Discord.' },
    ],
  },
  cv: {
    key: 'cv',
    name: 'Computer Vision Lab',
    shortName: 'Computer Vision',
    icon: 'EyeIcon',
    description: 'Image processing, mathematical filters, OpenCV operations, PyTorch neural vision, and SOTA models.',
    identity: 'var(--lab-cv)',
    sampleTopic: { name: 'Canny Edge Detection', brief: 'Multi-stage edge detector using Gaussian smoothing, Sobel gradients, non-max suppression, and hysteresis.', subtopic: 'Non-Maximum Suppression' },
    defaultPromptAddons: [
      { label: '👁️ OpenCV Python Idioms', text: 'Provide ready-to-run OpenCV (cv2) code with proper color conversions (BGR vs RGB) and NumPy array indexing.' },
      { label: '🔥 PyTorch GPU Tensor Code', text: 'Provide clean PyTorch code demonstrating tensor shapes, convolutions, batch processing, and GPU device placement.' },
      { label: '📐 Rigorous Math & Matrices', text: 'Include explicit matrix equations, coordinate transformations, kernel formulas, and spatial gradient equations.' },
      { label: '🖼️ ASCII Flowchart Diagrams', text: 'Include ASCII diagrams illustrating spatial convolution kernels, sliding windows, or neural layer flows.' },
      { label: '⚡ Real-Time FPS Optimizations', text: 'Highlight latency bottlenecks, vectorization tricks, and techniques to achieve 60+ FPS on edge hardware.' },
      { label: '🐛 Visual Artifacts & Pitfalls', text: 'Highlight common real-world failures: lighting changes, sensor noise, aspect ratio distortion, and blur.' },
    ],
  },
};

export function getSectionDefsForLab(lab: LabName): readonly SectionDef[] {
  switch (lab) {
    case 'dsa': return DSA_SECTION_DEFS;
    case 'cv': return CV_SECTION_DEFS;
    case 'system_design': return SYSTEM_DESIGN_SECTION_DEFS;
  }
}

/**
 * Inline style for a `.lab-tile` that stands for a lab (`<span className="lab-tile h-8 w-8" style={labTileStyle(lab)}>`).
 * Without a lab the tile is the Settings accent. The value is always set, so a tile rendered inside the CV or System Design
 * shell does not inherit that lab's hue by accident.
 */
export function labTileStyle(lab?: LabName): CSSProperties {
  return { '--lab-identity': lab ? LABS_CONFIG[lab].identity : 'var(--color-primary)' } as CSSProperties;
}
