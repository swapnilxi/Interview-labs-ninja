/**
 * The "Prerequisites" section of a System Design topic: specific things to know before the topic,
 * grouped as Networking & web / Data & storage / Distributed-systems concepts / Estimation & math /
 * Coding skills.
 *
 * Each topic gets its own bullets (keyed by topic id, the same ids the backend seeds) followed by the
 * baseline of its category.
 */
import { prereqMarkdown } from '@/modules/common/lab/prereqMarkdown';

interface Skills {
  web?: string[];
  data?: string[];
  dist?: string[];
  math?: string[];
  code?: string[];
}

const BY_CATEGORY: Record<string, Skills> = {
  Fundamentals: {
    web: [
      'Client-server request / response lifecycle (DNS lookup, TCP, TLS, HTTP)',
      'HTTP methods and status codes (2xx, 3xx, 4xx, 5xx)',
    ],
    data: ['SQL vs NoSQL at a high level', 'What an index is and why reads get faster'],
    dist: [
      'Latency vs throughput',
      'Availability as a percentage ("nines") and single points of failure',
    ],
    math: [
      'Powers of two (KB, MB, GB, TB) and 86,400 seconds in a day',
      'Latency numbers: memory about 100 ns, SSD about 100 µs, same-datacenter network about 0.5 ms, cross-continent about 150 ms',
    ],
  },
  'API & Microservices': {
    web: [
      'REST: resources, verbs, status codes, JSON bodies',
      'Auth tokens: API keys, JWT, OAuth2 at a high level',
    ],
    data: ['A database per service, and why services do not share tables'],
    dist: [
      'Synchronous calls (REST / gRPC) vs asynchronous messages',
      'Timeouts, retries with exponential backoff, idempotency',
    ],
  },
  'System Design (HLD)': {
    web: [
      'HTTP / HTTPS, load balancers, reverse proxies, CDNs',
      'Caching layers: browser, CDN, application, database',
    ],
    data: [
      'Choosing SQL vs NoSQL for a workload',
      'Indexing, replication and sharding basics',
      'Object storage (S3-style) vs a database for large blobs',
    ],
    dist: [
      'CAP theorem and eventual consistency',
      'Idempotency and at-least-once delivery',
      'Message queues for async work',
    ],
    math: [
      'QPS = requests per day / 86,400; peak is about 2-3x average',
      'Storage = records x size x retention; bandwidth = QPS x payload size',
      'Read : write ratio and its effect on the design',
    ],
  },
  'Low-Level Design (LLD)': {
    code: [
      'Python classes, `abc.ABC` with `@abstractmethod`, `@dataclass`, `enum.Enum`',
      'OOP: encapsulation, inheritance, polymorphism, composition over inheritance',
      'SOLID principles',
      'Design patterns: Strategy, Factory, Observer, State, Singleton',
      'Reading and drawing a UML class diagram',
      'Core structures: `dict`, `list`, `heapq`, `collections.deque`, `OrderedDict`',
      'Thread safety basics: `threading.Lock`, race conditions',
    ],
  },
  'Infrastructure & Ops': {
    web: ['Containers and Docker at a high level', 'HTTP / TLS basics'],
    dist: ['Replication and failover', 'Retries, timeouts, graceful degradation'],
    math: ['Percentiles (p50, p95, p99) and why averages hide problems'],
  },
};

const BY_TOPIC: Record<string, Skills> = {
  'scaling-fundamentals': {
    web: ['The request path: client, load balancer, app servers, database'],
    data: ['Limits of a single database node (connections, disk, CPU)'],
    dist: [
      'Vertical vs horizontal scaling and the trade-offs',
      'Stateless vs stateful servers (sessions in a cookie or a shared store like Redis)',
    ],
    math: ['Servers needed = peak QPS / QPS per server, plus headroom'],
  },
  'load-balancing': {
    web: [
      'OSI layers: L4 (TCP) vs L7 (HTTP) load balancing',
      'Health checks, sticky sessions via cookies, TLS termination',
    ],
    dist: ['Algorithms: round robin, weighted, least connections, IP hash'],
  },
  'caching-strategies': {
    data: [
      'Cache-aside, read-through, write-through and write-back',
      'Eviction: LRU, LFU, TTL',
      'Redis vs Memcached',
      'Cache stampede and invalidation',
    ],
    math: ['Effective latency = `hit * t_cache + (1 - hit) * t_db`'],
    code: ['A hashmap plus a doubly linked list gives an O(1) LRU cache'],
  },
  cdn: {
    web: [
      'DNS resolution and geo / anycast routing',
      'HTTP caching headers: `Cache-Control`, `max-age`, `ETag`',
      'Push vs pull CDN; purging and versioned URLs',
      'Static vs dynamic content',
    ],
  },
  'database-fundamentals': {
    data: [
      'ACID transactions and isolation levels',
      'B-tree indexes and reading a query plan',
      'SQL joins; normalisation vs denormalisation',
      'Document, key-value, wide-column and graph stores',
    ],
  },
  'database-sharding': {
    data: [
      'Choosing a shard key and avoiding hot spots',
      'Range vs hash vs directory-based sharding',
      'Cross-shard queries, joins and transactions',
      'Resharding without downtime',
    ],
    dist: ['Consistent hashing (see that topic)'],
  },
  'database-replication': {
    data: [
      'Leader-follower, multi-leader and leaderless replication',
      'Synchronous vs asynchronous replication, and replication lag',
      'Write-ahead log / binlog shipping, read replicas',
    ],
    dist: [
      'Read-your-writes consistency',
      'Quorum reads and writes: `R + W > N`',
      'Failover and split brain',
    ],
  },
  'cap-theorem': {
    dist: [
      'Consistency, availability and partition tolerance, each defined precisely',
      'CP vs AP systems, with an example of each',
      'Strong, causal and eventual consistency; linearizability',
      'PACELC: the trade-off when there is no partition',
    ],
  },
  'consistent-hashing': {
    code: [
      'Hash functions (MD5, SHA, murmur) and `hash(key) % N`',
      'Sorted list and `bisect` to find the next node on a ring',
    ],
    dist: [
      'Why `% N` remaps almost every key when N changes',
      'Hash ring, virtual nodes, replicating onto the next nodes',
    ],
    math: ['Adding a node moves only about K / N keys'],
  },
  'message-queues': {
    dist: [
      'Producer / consumer and publish / subscribe',
      'At-most-once, at-least-once, exactly-once delivery',
      'Acknowledgements, retries, dead-letter queues',
      'Idempotent consumers; ordering and partitions; backpressure',
      'Kafka vs RabbitMQ vs SQS at a high level',
    ],
  },
  'api-design': {
    web: [
      'REST resources and idempotency of GET / PUT / DELETE vs POST',
      'Pagination: offset vs cursor; API versioning',
      'API keys, OAuth2, JWT',
      'Rate-limit algorithms: token bucket, leaky bucket, sliding window',
      'REST vs gRPC vs GraphQL at a high level',
    ],
  },
  'microservices-architecture': {
    dist: [
      'Monolith vs microservices and when to split',
      'Service boundaries (bounded contexts)',
      'API gateway and service discovery',
      'Circuit breaker, retries, timeouts',
      'Saga pattern for distributed transactions',
    ],
  },
  'event-driven-architecture': {
    dist: [
      'Events vs commands',
      'Topics, partitions and consumer groups',
      'Event sourcing and CQRS',
      'At-least-once delivery plus idempotency',
      'Schema evolution; eventual consistency',
    ],
  },
  'url-shortener': {
    code: [
      'Base62 encoding of an integer ID',
      'Hashing (MD5 / SHA, truncate) and handling collisions',
      'Unique ID generation: counter, range allocation, Snowflake',
    ],
    web: ['HTTP redirects: 301 (permanent) vs 302 (temporary) and the caching impact'],
    data: ['Key-value lookup by short code; caching hot URLs'],
    math: ['62^7 is about 3.5 trillion keys', 'Reads far outnumber writes (about 100 : 1)'],
  },
  pastebin: {
    data: [
      'Object storage for text blobs, a database for metadata',
      'TTL / expiry and a cleanup job',
      'Caching and a CDN for popular pastes',
    ],
    code: ['Key generation, as in the URL shortener'],
  },
  'rate-limiter': {
    code: ['Token bucket, leaky bucket, fixed window, sliding window log and counter algorithms'],
    data: ['Redis `INCR` + `EXPIRE`, and Lua scripts for atomic updates'],
    web: [
      'HTTP 429 and the `Retry-After` header',
      'Where to place it: gateway vs inside each service',
    ],
    dist: ['Race conditions across nodes', 'Clock skew'],
  },
  'key-value-store': {
    dist: [
      'Consistent hashing and replication',
      'Quorum: `R + W > N`',
      'Vector clocks vs last-write-wins',
      'Gossip protocol and failure detection; hinted handoff',
    ],
    data: ['LSM tree: memtable, SSTable, compaction', 'Write-ahead log and Bloom filters'],
  },
  twitter: {
    data: [
      'Fan-out on write vs fan-out on read, and the hybrid for celebrity accounts',
      'Timeline cache in Redis (sorted sets)',
      'Storing the follower graph',
    ],
    dist: ['Time-ordered ID generation (Snowflake)', 'Eventual consistency of timelines'],
  },
  instagram: {
    data: [
      'Object storage + CDN for photos, a database for metadata',
      'Async image processing (thumbnails) through a queue',
      'Feed generation (see Twitter)',
    ],
    math: ['Storage per day = uploads x average photo size x copies'],
  },
  whatsapp: {
    web: [
      'WebSocket vs long polling vs HTTP polling',
      'Persistent connections and connection servers',
    ],
    dist: [
      'Message ordering and delivery states (sent, delivered, read)',
      'Offline storage and store-and-forward',
      'Group fan-out; presence and heartbeats',
    ],
    data: ['Message ID generation'],
  },
  'youtube-netflix': {
    web: ['Adaptive bitrate streaming (HLS / DASH) and chunked segments', 'CDN edge caching'],
    data: ['Object storage for video, a database for metadata'],
    dist: ['Transcoding as a DAG of tasks on a queue with parallel workers'],
    math: [
      'Bandwidth = concurrent viewers x bitrate',
      'Storage per minute of video per resolution',
    ],
  },
  'google-drive': {
    data: [
      'Chunking files and content-addressed dedup (hash of each chunk)',
      'Block storage + a metadata database; file versioning',
    ],
    dist: ['Sync conflicts: last-write-wins vs merge', 'Delta sync and change notifications'],
    web: ['Pre-signed URLs and resumable uploads'],
  },
  uber: {
    data: [
      'Geospatial indexing: geohash, quadtree, S2 cells',
      'Nearest-neighbour search over moving points',
    ],
    web: ['WebSocket for live location updates'],
    dist: ['Write-heavy location stream', 'Matching / dispatch and ETA', 'Surge pricing'],
    math: ['Location updates per second = drivers x update rate'],
  },
  zomato: {
    data: ['Restaurant search with geospatial filters', 'Menu and inventory models'],
    dist: [
      'Order as a state machine (placed, accepted, picked up, delivered)',
      'Matching delivery partners',
      'Payment idempotency',
      'ETA estimation',
    ],
  },
  'notification-system': {
    dist: [
      'A queue per channel (push, SMS, email)',
      'Third-party providers (APNs, FCM, Twilio, SES) and retries',
      'Deduplication with idempotency keys',
      'Priority queues; per-user rate limits',
    ],
    data: ['User preferences and templates'],
  },
  'payment-system': {
    data: ['ACID transactions', 'A double-entry ledger'],
    dist: [
      'Idempotency keys for safe retries',
      'Saga and reconciliation',
      'Payment lifecycle as a state machine',
      'Webhooks and retries',
    ],
    web: ['Tokenisation and PCI-DSS at a high level'],
  },
  'distributed-message-queue': {
    data: [
      'Append-only commit log, partitions, offsets, segments',
      'Sequential disk I/O vs random I/O',
    ],
    dist: [
      'Replication (in-sync replicas) and leader election',
      'Consumer groups and rebalancing',
      'Retention and delivery semantics',
      'ZooKeeper / KRaft for coordination',
    ],
  },
  'search-autocomplete': {
    code: ['Trie and prefix lookup', 'Top-K per prefix with a heap'],
    data: ['Precomputed top suggestions per prefix, cached', 'Offline aggregation of query logs'],
    web: ['Client-side debounce', 'A latency budget under 100 ms'],
  },
  'web-crawler': {
    code: [
      'BFS over the URL graph with a frontier queue',
      'URL normalisation and dedup with a hash set or Bloom filter',
    ],
    web: ['`robots.txt` and per-host politeness', 'DNS caching; fetching and parsing HTML'],
    dist: ['Frontier partitioned by host', 'Near-duplicate detection (simhash)', 'Spider traps'],
  },
  'google-maps': {
    code: ['Graphs and weighted edges', 'Dijkstra, A*, and contraction hierarchies'],
    data: ['Map tiles, quadtree / geohash / S2', 'Vector tiles served from a CDN'],
    dist: ['ETA with live traffic', 'Sharding the map by region'],
  },
  'recommendation-engine': {
    code: [
      'Collaborative filtering vs content-based',
      'Embeddings, dot-product similarity, approximate nearest-neighbour search',
    ],
    dist: ['Two-stage design: candidate generation, then ranking', 'Cold start'],
    data: [
      'Feature store',
      'Offline training vs online serving; A/B testing; CTR, precision, recall',
    ],
  },
  'ad-click-aggregation': {
    dist: [
      'Stream processing (Kafka + Flink / Spark Streaming)',
      'Tumbling and sliding windows; late events and watermarks',
      'Exactly-once vs at-least-once + dedup',
      'Lambda vs Kappa architecture',
    ],
    data: ['OLAP / time-series stores', 'Pre-aggregation vs raw events'],
    math: ['Clicks per second and raw event storage per day'],
  },
  'metrics-monitoring': {
    data: [
      'Time-series databases, downsampling and retention',
      'Labels / tags and cardinality',
      'Pull (Prometheus) vs push collection',
    ],
    dist: ['Alerting rules and aggregation windows', 'Sharding by series'],
    math: ['SLI / SLO and p50 / p95 / p99'],
  },
  'distributed-task-scheduler': {
    code: ['DAGs and topological sort', 'Cron expressions', 'Min-heap keyed by next run time'],
    dist: [
      'Leader election and distributed locks',
      'At-least-once execution plus idempotent jobs',
      'Retries with backoff; worker heartbeats',
    ],
  },
  'gaming-leaderboard': {
    data: [
      'Redis sorted sets: `ZADD`, `ZRANK`, `ZREVRANGE`; skip lists',
      'Top-K vs the rank of one user',
      'Daily / weekly boards by time window',
    ],
    dist: ['Sharding by score range', 'Real-time updates and eventual consistency'],
  },
  'distributed-cache': {
    dist: [
      'Consistent hashing and replication',
      'Hot keys and cache stampede',
      'Client-side vs proxy-based sharding',
      'Rebalancing on node failure',
    ],
    data: ['Eviction (LRU / LFU) and write policies', 'Memcached vs Redis Cluster'],
  },
  'fraud-detection': {
    data: ['Streaming features such as counts per user per window', 'Labels and a feedback loop'],
    dist: [
      'Synchronous scoring (under 100 ms) vs asynchronous review',
      'Rules engine plus ML model',
      'Precision vs recall and the cost of false positives',
    ],
  },
  'content-moderation': {
    dist: [
      'Async pipeline on queues',
      'ML classifiers for text and images; perceptual-hash matching',
      'Human review queue and appeals',
      'Thresholds: precision vs recall',
    ],
    data: ['Audit log of decisions'],
  },
  splitwise: {
    code: [
      '`defaultdict(float)` for balances: `balances[u][v] += amount`',
      'Minimising transactions: greedy with a heap of creditors and debtors',
      'Split types (equal, exact, percent) as a Strategy pattern',
      'Money as integer cents or `Decimal`, never `float`',
    ],
  },
  'parking-lot': {
    code: [
      'Enums for vehicle and spot types',
      'Strategy pattern for pricing and spot allocation',
      '`heapq` for the nearest free spot',
      'Singleton for the lot; `threading.Lock` for concurrent entries',
    ],
  },
  bookmyshow: {
    code: [
      'Seat as a state machine: available, locked, booked',
      'Temporary seat lock with a TTL, to prevent double booking',
      'Database transactions and row locks',
    ],
  },
  'elevator-system': {
    code: [
      'State pattern: idle, moving, door open',
      'SCAN / LOOK scheduling',
      'Sorted pending stops with `bisect`, or two heaps (up and down)',
      'Command / Observer for requests',
    ],
  },
  'lru-cache': {
    code: [
      'Hashmap + doubly linked list for O(1) `get` and `put`',
      '`collections.OrderedDict`: `move_to_end`, `popitem(last=False)`',
      'Thread safety with `threading.Lock`',
      'Type hints and generics',
    ],
  },
  'pub-sub-system': {
    code: [
      'Observer pattern',
      'A dict mapping topic to a list of subscribers',
      '`queue.Queue` and threads, one queue per subscriber',
      'Callbacks, acknowledgements, ordering',
    ],
  },
  'chess-tictactoe': {
    code: [
      'The board as a list of lists',
      'Polymorphism: an abstract `Piece.can_move()` overridden per piece',
      'Move validation; win checks over rows, columns and diagonals',
      'State and Command patterns (turns and undo)',
    ],
  },
  'observability-sre': {
    dist: [
      'Metrics, logs and traces',
      'SLI, SLO, SLA and error budgets',
      'The four golden signals: latency, traffic, errors, saturation',
      'Alert fatigue; incident response and postmortems',
    ],
  },
  'distributed-consensus': {
    dist: [
      'Leader election and majority quorum',
      'Paxos and Raft: terms, log replication',
      'Crash vs Byzantine failures; split brain',
      'Logical clocks (Lamport), and 2PC vs consensus',
    ],
  },
  'data-pipelines': {
    dist: [
      'Batch vs stream processing',
      'Windowing and watermarks',
      'Idempotent writes',
      'Orchestration with a DAG (Airflow)',
    ],
    data: [
      'ETL vs ELT; data lake vs warehouse',
      'Schema registry and Kafka + Spark / Flink at a high level',
    ],
  },
  'security-auth': {
    web: [
      'Authentication vs authorisation',
      'Sessions vs JWT; OAuth2 and OIDC flows',
      'TLS and mTLS',
      'RBAC vs ABAC; secrets management',
      'OWASP top risks',
    ],
    data: ['Password hashing with bcrypt / argon2 and salts'],
  },
  'cicd-pipeline': {
    code: [
      'Git branching and pull requests',
      'Build, test and deploy stages as a DAG',
      'Docker images',
    ],
    dist: [
      'Blue-green and canary deployments, and rollbacks',
      'Artifact registry and build caching',
    ],
  },
};

const FALLBACK = BY_CATEGORY['System Design (HLD)'];

/** Markdown for the Prerequisites section of a System Design topic. */
export function buildSdPrerequisitesMarkdown(topic: {
  id: string;
  name: string;
  category: string;
}): string {
  const own = BY_TOPIC[topic.id] ?? {};
  const base = BY_CATEGORY[topic.category] ?? FALLBACK;
  const join = (k: keyof Skills) => [...(own[k] ?? []), ...(base[k] ?? [])];
  return prereqMarkdown(`Prerequisites for ${topic.name}`, [
    { title: 'Networking & web basics', items: join('web') },
    { title: 'Data & storage', items: join('data') },
    { title: 'Distributed-systems concepts', items: join('dist') },
    { title: 'Estimation & math', items: join('math') },
    { title: 'Coding skills', items: join('code') },
  ]);
}
