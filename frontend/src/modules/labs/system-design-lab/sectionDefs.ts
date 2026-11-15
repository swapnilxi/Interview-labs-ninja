import type { SectionDef } from '@/modules/labs/common/labSectionDefaults';

/*
 * System Design Lab sections in page order, each with its default AI prompt (`guidance`): what the AI is told when it writes
 * the section (the pen, or a Generate on a section the learner customised) and what the lab settings show as the
 * editable prompt. A plain Generate fills the template from sectionContent.ts instead.
 * Data only: labSectionDefaults.ts imports this file for the Config page, so it must not import the topic list or the
 * content templates.
 */

const PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to follow THIS design, as short bullets under these bold headings, in this order:
**Networking & web basics** - protocols and web pieces the design uses (for example HTTP redirects 301 vs 302, WebSocket vs polling, CDN caching headers).
**Data & storage** - the storage concepts it relies on (for example indexes, replication lag, Redis sorted sets, object storage vs a database).
**Distributed-systems concepts** - the ideas to know first (for example consistent hashing, quorum, idempotency, CAP, fan-out on write).
**Estimation & math** - the numbers and formulas used in the back-of-envelope step (for example QPS = requests per day / 86,400, storage = records x size x retention).
Add **Coding skills** as a fifth group only for low-level-design topics (classes, design patterns, data structures).

Every bullet names ONE concrete skill, never a vague area like "databases" or "networking". Put a tiny example in backticks where it helps. Use 8-14 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

/** The default prompt of every other section (problem, requirements, estimation, ...). The Quiz has none: it uses the shared quiz rules. */
const GUIDANCE = {
  problem:
    'State the problem in a few sentences: who uses the system and what for, why it is hard (scale, latency, consistency, cost), and why interviewers ask it. End with the questions you would ask to clarify scope.',
  requirements:
    'Split into functional requirements (as short user stories) and non-functional requirements (availability, latency, durability, consistency, scale) with concrete targets or SLOs. List what is explicitly out of scope.',
  estimation:
    'Do the back-of-envelope maths step by step: users and requests per day, QPS (average and peak), read/write ratio, storage per record and over the retention period, bandwidth and memory for caching. Show every formula and state each assumption.',
  api: 'Define the main endpoints (method, path, request and response bodies) for the core flows, with the pagination, idempotency and error conventions you would use, and note which calls are hot paths.',
  datamodel:
    'Give the data model: the main entities and their key fields (as a schema or table), the indexes and why, the access patterns they serve, the storage choice (SQL, NoSQL, object store) with reasons, and the sharding key.',
  architecture:
    'Describe the high-level architecture with a text diagram in a fenced `text` block (clients, load balancer, services, caches, queues, stores), then walk through the request flow for the main read and write paths.',
  scaling:
    'Explain how the system scales from one machine to the target load: where it first breaks, horizontal scaling, caching layers, CDN, partitioning and replication, and what you would do at each 10x step.',
  reliability:
    'Cover how it survives failures: replication and failover, retries with backoff and idempotency, circuit breakers, timeouts, graceful degradation, and what happens during a regional outage.',
  consistency:
    'Apply CAP and consistency models to THIS system: which operations need strong consistency and which can be eventual, the trade-offs chosen, and how conflicts or stale reads are handled.',
  security:
    'Cover authentication and authorisation, rate limiting and abuse protection, encryption in transit and at rest, handling of PII, and the most likely attack for this system with its mitigation.',
  monitoring:
    'List the SLIs/SLOs to track, the key metrics, logs and traces, the dashboards and alerts you would set up (with thresholds), and how you would find the cause of a latency spike.',
  bottlenecks:
    'Identify the real bottlenecks as load grows (hot keys, fan-out, a single writer, a slow dependency), how each shows up, and the specific fix and its trade-off.',
  interview_tips:
    'Give a 45-minute plan for this question (what to cover in each segment), what interviewers expect at senior level, the trade-offs worth volunteering, and common mistakes to avoid.',
  insights:
    'Share real-world production lessons for this kind of system: how well-known companies built or evolved it, the failure modes they hit, and the design lessons that transfer.',
  lld: 'Give a low-level design: the main classes and interfaces with their responsibilities, the design patterns used and why, a text class diagram in a fenced `text` block, and clean Python code for the core classes with a short usage example.',
};

export const SYSTEM_DESIGN_SECTION_DEFS: readonly SectionDef[] = [
  { id: 'prerequisites', label: 'Prerequisites', icon: 'AcademicCapIcon', subtitle: 'Specific networking, data and distributed-systems skills to have first', guidance: PREREQUISITES_GUIDANCE },
  { id: 'problem', label: 'Problem Statement & Why It Matters', icon: 'DocumentTextIcon', subtitle: 'Context, challenges, interview importance', guidance: GUIDANCE.problem },
  { id: 'requirements', label: 'Functional & Non-Functional Requirements', icon: 'ClipboardDocumentListIcon', subtitle: 'User stories, SLOs, constraints', guidance: GUIDANCE.requirements },
  { id: 'estimation', label: 'Back-of-Envelope Estimation', icon: 'CalculatorIcon', subtitle: 'QPS, storage, bandwidth, memory', guidance: GUIDANCE.estimation },
  { id: 'api', label: 'API Design', icon: 'CodeBracketSquareIcon', subtitle: 'REST endpoints, schemas, pagination', guidance: GUIDANCE.api },
  { id: 'datamodel', label: 'Data Model', icon: 'CircleStackIcon', subtitle: 'SQL schema, indexing, sharding key', guidance: GUIDANCE.datamodel },
  { id: 'architecture', label: 'High-Level Architecture', icon: 'ServerStackIcon', subtitle: 'Component diagram + request flow', guidance: GUIDANCE.architecture },
  { id: 'scaling', label: 'Scaling Strategy', icon: 'ArrowTrendingUpIcon', subtitle: 'Horizontal scaling, caching layers, CDN', guidance: GUIDANCE.scaling },
  { id: 'reliability', label: 'Reliability & Resiliency', icon: 'ShieldCheckIcon', subtitle: 'Replication, circuit breakers, retries', guidance: GUIDANCE.reliability },
  { id: 'consistency', label: 'Consistency vs Availability (CAP)', icon: 'ScaleIcon', subtitle: 'CAP applied to this specific system', guidance: GUIDANCE.consistency },
  { id: 'security', label: 'Security Design', icon: 'LockClosedIcon', subtitle: 'Auth, rate limiting, encryption, PII', guidance: GUIDANCE.security },
  { id: 'monitoring', label: 'Monitoring & Observability', icon: 'ChartBarIcon', subtitle: 'SLOs, metrics, traces, alerting', guidance: GUIDANCE.monitoring },
  { id: 'bottlenecks', label: 'Bottleneck Analysis', icon: 'BoltSlashIcon', subtitle: 'What breaks at scale + solutions', guidance: GUIDANCE.bottlenecks },
  { id: 'interview_tips', label: 'Interview Discussion Tips', icon: 'AcademicCapIcon', subtitle: '45-min structure, what FAANG expects', guidance: GUIDANCE.interview_tips },
  { id: 'insights', label: 'Real-World Production Insights', icon: 'BuildingOffice2Icon', subtitle: 'Big tech war stories, lessons learned', guidance: GUIDANCE.insights },
  { id: 'quiz', label: 'Quiz', icon: 'TrophyIcon', subtitle: '4 questions with explanations' },
  { id: 'lld', label: 'Low-Level Design', icon: 'PuzzlePieceIcon', subtitle: 'Design patterns, class diagrams, Python code', guidance: GUIDANCE.lld },
];
