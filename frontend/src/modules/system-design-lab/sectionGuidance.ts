/**
 * Built-in instructions for each System Design section that doesn't carry its own `guidance` in
 * SECTION_DEFS (Prerequisites does). They are what the AI is told when a section is written by the
 * AI (the pen's regenerate, or a Generate on a section the learner customised) and what the lab
 * settings dialog shows as the editable "prompt". The Quiz is a fixed question bank here, so it has none.
 */
export const SD_DEFAULT_GUIDANCE: Record<string, string> = {
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
