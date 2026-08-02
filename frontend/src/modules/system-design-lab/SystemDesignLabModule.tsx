'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import LabCopilot from '@/components/common/LabCopilot';
import OnDemandSection from '@/components/lab/OnDemandSection';
import QuizCarousel from '@/components/lab/QuizCarousel';
import GenerateQuestionsPanel, { GeneratedSubtopic } from '@/modules/common/GenerateQuestionsPanel';
import MarkdownLite from '@/modules/common/lab/MarkdownLite';
import { apiFetch } from '@/lib/http/apiClient';

interface SDTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  scale: string;
  difficulty: 'Easy' | 'Easy-Medium' | 'Medium' | 'Medium-Hard' | 'Hard';
  isLLD?: boolean;
  subtopics: { id: string; name: string; brief: string; content?: string; sourceUrl?: string }[];
}
interface SectionState { generated: boolean; generating: boolean; content: string }

const TOPICS: SDTopic[] = [
  {
    id: 'scaling-fundamentals',
    name: 'Scaling Fundamentals',
    brief: 'Learn when and how to scale system tiers vertically or horizontally.',
    category: 'Fundamentals',
    scale: 'N/A',
    difficulty: 'Easy',
    subtopics: [
      { id: 'vertical-horizontal', name: 'Vertical vs Horizontal Scaling', brief: 'Scale up vs scale out tradeoffs.' },
      { id: 'stateless-stateful', name: 'Stateless vs Stateful Services', brief: 'Managing session state across instances.' },
      { id: 'when-to-scale', name: 'When to Scale What', brief: 'Metric-driven scaling criteria.' },
    ],
  },
  {
    id: 'load-balancing',
    name: 'Load Balancing',
    brief: 'Distribute network or application traffic across servers.',
    category: 'Fundamentals',
    scale: '100k+ RPS',
    difficulty: 'Easy',
    subtopics: [
      { id: 'l4-l7', name: 'L4 vs L7 Load Balancers', brief: 'Transport vs application layer routing.' },
      { id: 'lb-algorithms', name: 'Algorithms (Round Robin, Least Connections, Consistent Hashing)', brief: 'Traffic distribution policies.' },
      { id: 'health-failover', name: 'Health Checks & Failover', brief: 'Detecting and routing around unhealthy instances.' },
    ],
  },
  {
    id: 'caching-strategies',
    name: 'Caching Strategies',
    brief: 'Speed up reads and reduce database load using caching.',
    category: 'Fundamentals',
    scale: 'N/A',
    difficulty: 'Easy-Medium',
    subtopics: [
      { id: 'cache-patterns', name: 'Cache-Aside, Write-Through, Write-Behind', brief: 'Data synchronization patterns.' },
      { id: 'eviction-policies', name: 'Eviction Policies (LRU, LFU, TTL)', brief: 'How cache memory is reclaimed.' },
      { id: 'invalidation-patterns', name: 'Cache Invalidation Patterns', brief: 'Keeping cache and database in sync.' },
    ],
  },
  {
    id: 'cdn',
    name: 'CDN (Content Delivery Network)',
    brief: 'Deliver content quickly from locations close to users.',
    category: 'Fundamentals',
    scale: '100M+ Req/day',
    difficulty: 'Easy',
    subtopics: [
      { id: 'cdn-how-works', name: 'How CDNs Work (Pull vs Push)', brief: 'Origin offloading and content delivery.' },
      { id: 'cache-hierarchy', name: 'Cache Hierarchy & Edge Locations', brief: 'Regional caches and edge PoPs.' },
      { id: 'cdn-vs-origin', name: 'When to Use CDN vs Origin', brief: 'Static assets vs dynamic endpoints.' },
    ],
  },
  {
    id: 'database-fundamentals',
    name: 'Database Fundamentals',
    brief: 'Understand storage engines, indexing, and transactional guarantees.',
    category: 'Fundamentals',
    scale: 'N/A',
    difficulty: 'Easy-Medium',
    subtopics: [
      { id: 'sql-vs-nosql', name: 'SQL vs NoSQL (when to pick what)', brief: 'Relational vs non-relational storage.' },
      { id: 'acid-vs-base', name: 'ACID vs BASE', brief: 'Transactional safety vs availability.' },
      { id: 'indexing-query-opt', name: 'Indexing Strategies & Query Optimization', brief: 'B-Trees, Hash indexes, and execution plans.' },
    ],
  },
  {
    id: 'database-sharding',
    name: 'Database Sharding',
    brief: 'Partition data across multiple database instances.',
    category: 'Fundamentals',
    scale: '10TB+ Data',
    difficulty: 'Medium',
    subtopics: [
      { id: 'sharding-strategies', name: 'Sharding Strategies (hash, range, geo)', brief: 'Horizontal partitioning methods.' },
      { id: 'rebalancing-hotspots', name: 'Rebalancing & Hotspot Handling', brief: 'Dealing with skewed traffic/storage.' },
      { id: 'cross-shard-queries', name: 'Cross-Shard Queries & Joins', brief: 'Handling distributed transaction complexities.' },
    ],
  },
  {
    id: 'database-replication',
    name: 'Database Replication',
    brief: 'Copy data across multiple machines for durability and scale.',
    category: 'Fundamentals',
    scale: '10k writes/sec',
    difficulty: 'Medium',
    subtopics: [
      { id: 'replication-topologies', name: 'Leader-Follower, Leader-Leader', brief: 'Topology design and write management.' },
      { id: 'sync-vs-async-repl', name: 'Synchronous vs Asynchronous Replication', brief: 'Tradeoffs in durability vs latency.' },
      { id: 'repl-lag-consistency', name: 'Replication Lag & Read-After-Write Consistency', brief: 'Handling stale replica reads.' },
    ],
  },
  {
    id: 'cap-theorem',
    name: 'CAP Theorem & Consistency Models',
    brief: 'Learn CAP and PACELC trade-offs in distributed data systems.',
    category: 'Fundamentals',
    scale: 'N/A',
    difficulty: 'Medium',
    subtopics: [
      { id: 'cap-pacelc', name: 'CAP & PACELC', brief: 'Understanding consistency, availability, partitions, latency.' },
      { id: 'consistency-models', name: 'Strong, Eventual, Causal Consistency', brief: 'Hierarchy of consistency models.' },
      { id: 'real-world-tradeoffs', name: 'Real-World Tradeoffs (Dynamo, Cassandra, Spanner)', brief: 'How modern databases handle CAP.' },
    ],
  },
  {
    id: 'consistent-hashing',
    name: 'Consistent Hashing',
    brief: 'Minimize hash ring remapping when nodes join or leave.',
    category: 'Fundamentals',
    scale: '1M+ Nodes',
    difficulty: 'Medium',
    subtopics: [
      { id: 'virtual-nodes', name: 'Virtual Nodes & Ring-Based Distribution', brief: 'Even load distribution technique.' },
      { id: 'node-membership', name: 'Adding/Removing Nodes', brief: 'Data migration path during cluster scaling.' },
      { id: 'hashing-use-cases', name: 'Use Cases (distributed caches, partitioning)', brief: 'Redis, Memcached, Dynamo sharding.' },
    ],
  },
  {
    id: 'message-queues',
    name: 'Message Queues & Async Processing',
    brief: 'Deconstruct request flows using asynchronous event brokers.',
    category: 'Fundamentals',
    scale: '1M Events/sec',
    difficulty: 'Medium',
    subtopics: [
      { id: 'queue-pubsub-streaming', name: 'Queue vs Pub/Sub vs Streaming', brief: 'RabbitMQ vs Kafka vs SQS.' },
      { id: 'delivery-guarantees', name: 'At-Least-Once, At-Most-Once, Exactly-Once Delivery', brief: 'Message delivery mechanics.' },
      { id: 'backpressure-dlq', name: 'Backpressure & Dead Letter Queues', brief: 'Handling failures and slow consumers.' },
    ],
  },
  {
    id: 'api-design',
    name: 'API Design & Rate Limiting',
    brief: 'Design clean external interfaces and protect them from abuse.',
    category: 'API & Microservices',
    scale: 'N/A',
    difficulty: 'Easy-Medium',
    subtopics: [
      { id: 'protocols', name: 'REST vs gRPC vs GraphQL vs WebSockets', brief: 'API communication protocols.' },
      { id: 'pagination', name: 'Pagination (cursor vs offset)', brief: 'Query paging design.' },
      { id: 'rate-limiting-algos', name: 'Rate Limiting Algorithms (Token Bucket, Sliding Window)', brief: 'Traffic throttling methods.' },
    ],
  },
  {
    id: 'microservices-architecture',
    name: 'Microservices Architecture',
    brief: 'Design service boundaries, communication networks, and discovery systems.',
    category: 'API & Microservices',
    scale: '100+ Services',
    difficulty: 'Medium',
    subtopics: [
      { id: 'migration', name: 'Monolith → Microservices Migration', brief: 'Strangler Fig pattern and modular decoupling.' },
      { id: 'discovery-comm', name: 'Service Discovery & Communication', brief: 'DNS, Consul, and HTTP vs RPC protocols.' },
      { id: 'saga-pattern', name: 'Saga Pattern & Distributed Transactions', brief: 'Choreographed and orchestrated sagas.' },
    ],
  },
  {
    id: 'event-driven-architecture',
    name: 'Event-Driven Architecture',
    brief: 'Build decoupling systems by publishing and reacting to events.',
    category: 'API & Microservices',
    scale: '100M Events/day',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'event-sourcing', name: 'Event Sourcing', brief: 'Storing state modifications as event sequences.' },
      { id: 'cqrs', name: 'CQRS (Command Query Responsibility Segregation)', brief: 'Splitting read and write paths.' },
      { id: 'choreography-orchestration', name: 'Choreography vs Orchestration', brief: 'Decentralized vs centralized flows.' },
    ],
  },
  {
    id: 'url-shortener',
    name: 'Design a URL Shortener (TinyURL)',
    brief: 'Design a high-throughput, low-latency URL redirect service.',
    category: 'System Design (HLD)',
    scale: '100M URLs/day',
    difficulty: 'Easy',
    subtopics: [
      { id: 'hash-generation', name: 'Hash Generation & Collision Handling', brief: 'MD5 vs Base62 encoding.' },
      { id: 'read-heavy-opt', name: 'Read-Heavy Optimization', brief: 'Caching redirection mappings.' },
      { id: 'analytics-expiration', name: 'Analytics & Expiration', brief: 'Handling click counts and storage cleanup.' },
    ],
  },
  {
    id: 'pastebin',
    name: 'Design a Paste Bin',
    brief: 'Design a web application to share plain text snippet files.',
    category: 'System Design (HLD)',
    scale: '10M pastes/day',
    difficulty: 'Easy',
    subtopics: [
      { id: 'paste-storage', name: 'Storage Strategy for Text Blobs', brief: 'Object storage vs relational database.' },
      { id: 'paste-expiration', name: 'Expiration & Cleanup', brief: 'S3 lifecycle policies and cron jobs.' },
      { id: 'paste-rate-limiting', name: 'Rate Limiting Abuse', brief: 'IP-based restriction of paste uploads.' },
    ],
  },
  {
    id: 'rate-limiter',
    name: 'Design a Rate Limiter',
    brief: 'Design a high-scale API gateway utility to limit incoming traffic.',
    category: 'System Design (HLD)',
    scale: '1M RPS',
    difficulty: 'Easy-Medium',
    subtopics: [
      { id: 'rl-token-bucket', name: 'Token Bucket & Sliding Window Counter', brief: 'Comparing core algorithms.' },
      { id: 'distributed-rl', name: 'Distributed Rate Limiting (Redis-based)', brief: 'Using Redis cluster and Lua scripts.' },
      { id: 'rl-scopes', name: 'Per-User vs Per-IP vs Per-API', brief: 'Configuring rate limiter granularity.' },
    ],
  },
  {
    id: 'key-value-store',
    name: 'Design a Key-Value Store',
    brief: 'Design a distributed KV store with high-performance writes.',
    category: 'System Design (HLD)',
    scale: 'Petabyte scale',
    difficulty: 'Medium',
    subtopics: [
      { id: 'kv-persistence', name: 'In-Memory + Persistence (LSM Tree, SSTable)', brief: 'Write Path, Memtable, Commit Log.' },
      { id: 'kv-replication', name: 'Replication & Consistency', brief: 'Quorum writes, sloppy quorum.' },
      { id: 'conflict-resolution', name: 'Conflict Resolution (Vector Clocks, Last-Write-Wins)', brief: 'Handling concurrent edits.' },
    ],
  },
  {
    id: 'twitter',
    name: 'Design Twitter / X',
    brief: 'Design a social media network with news feed generation.',
    category: 'System Design (HLD)',
    scale: '500M Tweets/day',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'tweet-fanout', name: 'Fan-Out on Write vs Fan-Out on Read', brief: 'Push vs pull feed architecture.' },
      { id: 'tweet-timeline', name: 'Timeline Generation & Ranking', brief: 'Caching user home timelines.' },
      { id: 'celebrity-problem', name: 'Celebrity Problem & Hybrid Approach', brief: 'Handling users with millions of followers.' },
    ],
  },
  {
    id: 'instagram',
    name: 'Design Instagram',
    brief: 'Design a photo and video sharing social network.',
    category: 'System Design (HLD)',
    scale: '100M Uploads/day',
    difficulty: 'Medium',
    subtopics: [
      { id: 'insta-upload', name: 'Photo Upload & Storage Pipeline', brief: 'S3 storage, media transcoding, metadata.' },
      { id: 'insta-feed', name: 'News Feed Generation', brief: 'Caching posts of followed users.' },
      { id: 'insta-explore', name: 'Explore/Recommendation Feed', brief: 'Machine learning model ranking.' },
    ],
  },
  {
    id: 'whatsapp',
    name: 'Design WhatsApp / Messenger',
    brief: 'Design a secure, low-latency, real-time messaging application.',
    category: 'System Design (HLD)',
    scale: '100B Messages/day',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'wa-realtime', name: 'Real-Time Messaging (WebSockets, Long Polling)', brief: 'Connection manager and gateway design.' },
      { id: 'wa-guarantees', name: 'Message Delivery Guarantees', brief: 'Sent, delivered, and read indicators.' },
      { id: 'wa-group-encryption', name: 'Group Chat & End-to-End Encryption', brief: 'Signal Protocol, group sessions.' },
      { id: 'wa-offline', name: 'Offline Messaging & Sync', brief: 'Storing and delivering pending messages.' },
    ],
  },
  {
    id: 'youtube-netflix',
    name: 'Design YouTube / Netflix',
    brief: 'Design a high-scale video hosting and streaming service.',
    category: 'System Design (HLD)',
    scale: '200M concurrent users',
    difficulty: 'Hard',
    subtopics: [
      { id: 'yt-upload', name: 'Video Upload & Transcoding Pipeline', brief: 'Chunking, formats (MP4, WebM), resolutions.' },
      { id: 'yt-streaming', name: 'Adaptive Bitrate Streaming (HLS, DASH)', brief: 'Adjusting stream quality dynamically.' },
      { id: 'yt-recommendation', name: 'Recommendation Engine & CDN Strategy', brief: 'Optimizing edge cache hit rate.' },
      { id: 'yt-live', name: 'Live Streaming Architecture', brief: 'Low-latency ingestion and delivery.' },
    ],
  },
  {
    id: 'google-drive',
    name: 'Design Google Drive / Dropbox',
    brief: 'Design a file synchronization and storage cloud service.',
    category: 'System Design (HLD)',
    scale: '50M active users',
    difficulty: 'Hard',
    subtopics: [
      { id: 'gd-chunking', name: 'File Chunking & Deduplication', brief: 'Block-level sync and content-based hashing.' },
      { id: 'gd-conflict', name: 'Sync Conflict Resolution', brief: 'Client vs server side merge strategies.' },
      { id: 'gd-versioning', name: 'Versioning & Delta Sync', brief: 'Only uploading modified file blocks.' },
      { id: 'gd-notification', name: 'Notification Service for Changes', brief: 'WebSocket/SSE update pushes.' },
    ],
  },
  {
    id: 'uber',
    name: 'Design Uber / Ola',
    brief: 'Design a real-time ride-sharing dispatch system.',
    category: 'System Design (HLD)',
    scale: '1M active drivers',
    difficulty: 'Hard',
    subtopics: [
      { id: 'uber-tracking', name: 'Real-Time Location Tracking (Geohashing, Quadtrees)', brief: 'Storing driver GPS coordinates.' },
      { id: 'uber-matching', name: 'Ride Matching Algorithm', brief: 'Finding nearby drivers efficiently.' },
      { id: 'uber-eta', name: 'ETA Calculation & Surge Pricing', brief: 'Routing algorithms and supply-demand adjustments.' },
      { id: 'uber-statemachine', name: 'Driver/Rider State Machine', brief: 'Managing dispatch state transitions.' },
    ],
  },
  {
    id: 'zomato',
    name: 'Design Zomato / DoorDash',
    brief: 'Design a real-time food delivery discovery and order system.',
    category: 'System Design (HLD)',
    scale: '5M orders/day',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'zomato-search', name: 'Restaurant Search & Ranking', brief: 'Geospatial indexing and search query routing.' },
      { id: 'zomato-statemachine', name: 'Order State Machine & Delivery Assignment', brief: 'Matching orders with delivery partners.' },
      { id: 'zomato-tracking', name: 'Real-Time Tracking & ETA Updates', brief: 'Driver coordinate updates to customer.' },
      { id: 'zomato-payment', name: 'Payment & Refund Flows', brief: 'Handling transactions and failures.' },
    ],
  },
  {
    id: 'notification-system',
    name: 'Design a Notification System',
    brief: 'Design a distributed system to send push, SMS, and email alerts.',
    category: 'System Design (HLD)',
    scale: '1B notifications/day',
    difficulty: 'Medium',
    subtopics: [
      { id: 'notif-channels', name: 'Push, Email, SMS, In-App Channels', brief: 'Integrating third-party APIs (APNS, Twilio, SendGrid).' },
      { id: 'notif-throttling', name: 'Priority & Throttling', brief: 'Managing user preferences and message backlogs.' },
      { id: 'notif-templates', name: 'Template Engine & Preference Management', brief: 'Resolving dynamic content and user opt-outs.' },
      { id: 'notif-retry', name: 'Retry & Deduplication', brief: 'Idempotency keys and fallback paths.' },
    ],
  },
  {
    id: 'payment-system',
    name: 'Design a Payment System (Stripe/Razorpay)',
    brief: 'Design a payment processing system with double-spend prevention.',
    category: 'System Design (HLD)',
    scale: '10k tx/sec',
    difficulty: 'Hard',
    subtopics: [
      { id: 'pay-idempotency', name: 'Idempotency & Double-Spend Prevention', brief: 'Using unique transaction keys and distributed locks.' },
      { id: 'pay-statemachine', name: 'Payment State Machine', brief: 'Tracking pending, authorized, and captured states.' },
      { id: 'pay-ledger', name: 'Ledger Design & Reconciliation', brief: 'Double-entry bookkeeping and nightly audits.' },
      { id: 'pay-pci', name: 'PCI Compliance & Tokenization', brief: 'Handling credit card data securely.' },
    ],
  },
  {
    id: 'distributed-message-queue',
    name: 'Design a Distributed Message Queue (Kafka)',
    brief: 'Design a high-throughput, partitioned log broker.',
    category: 'System Design (HLD)',
    scale: '10B events/day',
    difficulty: 'Hard',
    subtopics: [
      { id: 'mq-partitioning', name: 'Partitioning & Consumer Groups', brief: 'Scale-out and message order preservation.' },
      { id: 'mq-offsets', name: 'Offset Management & Replayability', brief: 'Tracking consumer progress in partition logs.' },
      { id: 'mq-eos', name: 'Exactly-Once Semantics', brief: 'Transactional writes and read isolation.' },
      { id: 'mq-compaction', name: 'Retention & Compaction', brief: 'Log cleaning and key-based compaction.' },
    ],
  },
  {
    id: 'search-autocomplete',
    name: 'Design a Search Autocomplete / Typeahead',
    brief: 'Design a real-time prefix-matching query suggestion service.',
    category: 'System Design (HLD)',
    scale: '100k searches/sec',
    difficulty: 'Medium',
    subtopics: [
      { id: 'auto-trie', name: 'Trie-Based vs Prefix Search', brief: 'Structuring in-memory search structures.' },
      { id: 'auto-ranking', name: 'Ranking by Popularity & Personalization', brief: 'Determining autocomplete order.' },
      { id: 'auto-updates', name: 'Real-Time Updates & Caching', brief: 'Rebuilding indices with MapReduce/Spark.' },
    ],
  },
  {
    id: 'web-crawler',
    name: 'Design a Web Crawler',
    brief: 'Design a scalable crawler to index the World Wide Web.',
    category: 'System Design (HLD)',
    scale: '10B pages crawled',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'crawl-politeness', name: 'Politeness & robots.txt', brief: 'Avoiding DOS attacks on host servers.' },
      { id: 'crawl-frontier', name: 'URL Frontier & Priority Scheduling', brief: 'Managing queue priority and crawl frequency.' },
      { id: 'crawl-dedup', name: 'Deduplication (URL + Content)', brief: 'Minimizing redundant crawls using Bloom filters.' },
      { id: 'crawl-dist', name: 'Distributed Crawling Architecture', brief: 'Partitioning domains across crawl workers.' },
    ],
  },
  {
    id: 'google-maps',
    name: 'Design Google Maps',
    brief: 'Design a routing and geospatial tile serving system.',
    category: 'System Design (HLD)',
    scale: '1B DAU',
    difficulty: 'Hard',
    subtopics: [
      { id: 'maps-tiles', name: 'Map Tile Serving & Caching', brief: 'Mercator projection and server caches.' },
      { id: 'maps-routing', name: 'Shortest Path (Dijkstra, A*, Contraction Hierarchies)', brief: 'Low-latency route computation.' },
      { id: 'maps-eta', name: 'ETA Prediction & Traffic Data Pipeline', brief: 'Fusing historical and live GPS data.' },
      { id: 'maps-geospatial', name: 'Places Search & Geospatial Indexing', brief: 'Indexing points of interest using S2/H3.' },
    ],
  },
  {
    id: 'recommendation-engine',
    name: 'Design a Recommendation Engine',
    brief: 'Design a real-time recommender model pipeline.',
    category: 'System Design (HLD)',
    scale: '100M active users',
    difficulty: 'Hard',
    subtopics: [
      { id: 'rec-filtering', name: 'Collaborative Filtering vs Content-Based', brief: 'Comparing recommendation heuristics.' },
      { id: 'rec-timing', name: 'Real-Time vs Batch Recommendations', brief: 'Offline training vs online inference.' },
      { id: 'rec-features', name: 'Feature Store & Model Serving', brief: 'Feature retrieval at millisecond scale.' },
      { id: 'rec-coldstart', name: 'Cold Start Problem', brief: 'Handling new users or items.' },
    ],
  },
  {
    id: 'ad-click-aggregation',
    name: 'Design an Ad Click Aggregation System',
    brief: 'Design a stream processor to count global ad clicks.',
    category: 'System Design (HLD)',
    scale: '10B clicks/day',
    difficulty: 'Hard',
    subtopics: [
      { id: 'ad-counting', name: 'Real-Time Counting at Scale', brief: 'Aggregating events inside streaming windows.' },
      { id: 'ad-lambda', name: 'Lambda Architecture (batch + stream)', brief: 'Fast layer vs accurate batch layer.' },
      { id: 'ad-fraud', name: 'Deduplication & Fraud Detection', brief: 'Filtering bot traffic and double clicks.' },
      { id: 'ad-windowing', name: 'Windowed Aggregation', brief: 'Tumbling, sliding, and session windows.' },
    ],
  },
  {
    id: 'metrics-monitoring',
    name: 'Design a Metrics & Monitoring System (Datadog)',
    brief: 'Design a high-scale time-series data storage and alert engine.',
    category: 'System Design (HLD)',
    scale: '100M metrics/sec',
    difficulty: 'Hard',
    subtopics: [
      { id: 'metrics-ingest', name: 'Time-Series Data Ingestion at Scale', brief: 'Handling write-heavy numeric telemetry.' },
      { id: 'metrics-retention', name: 'Downsampling & Retention Policies', brief: 'Reducing data density for older logs.' },
      { id: 'metrics-alerting', name: 'Alerting Engine & Anomaly Detection', brief: 'Running periodic checks against metrics.' },
      { id: 'metrics-query', name: 'Dashboard Query Optimization', brief: 'Caching queries and index partitions.' },
    ],
  },
  {
    id: 'distributed-task-scheduler',
    name: 'Design a Distributed Task Scheduler (Airflow)',
    brief: 'Design a task runner with dependency execution rules.',
    category: 'System Design (HLD)',
    scale: '10M tasks/day',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'sched-dag', name: 'DAG Execution & Dependency Resolution', brief: 'Topological sorting of workflow graphs.' },
      { id: 'sched-workers', name: 'Worker Pool & Task Assignment', brief: 'Distributing jobs to distributed agents.' },
      { id: 'sched-failures', name: 'Retry, Timeout, Dead Letter Handling', brief: 'Managing task runtime failures.' },
      { id: 'sched-idempotency', name: 'Idempotent Task Execution', brief: 'Ensuring tasks can run multiple times safely.' },
    ],
  },
  {
    id: 'gaming-leaderboard',
    name: 'Design a Real-Time Gaming Leaderboard',
    brief: 'Design a scoreboard showing ranking among millions of active users.',
    category: 'System Design (HLD)',
    scale: '10M DAU',
    difficulty: 'Medium',
    subtopics: [
      { id: 'game-zset', name: 'Sorted Sets (Redis ZSET)', brief: 'Score sorting via skip-lists.' },
      { id: 'game-queries', name: 'Top-K & Rank Queries', brief: 'Getting user ranks in O(log N) time.' },
      { id: 'game-sharding', name: 'Sharding Strategies for Global Scale', brief: 'Partitioning score ranges across clusters.' },
      { id: 'game-realtime', name: 'Near-Real-Time vs Exact Ranking', brief: 'Caching rankings to reduce database load.' },
    ],
  },
  {
    id: 'distributed-cache',
    name: 'Design a Distributed Cache (Memcached Cluster)',
    brief: 'Design a custom caching cluster with consistent key routing.',
    category: 'System Design (HLD)',
    scale: '10M RPS',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'cache-part', name: 'Consistent Hashing for Partitioning', brief: 'Node routing without a central leader.' },
      { id: 'cache-stampede', name: 'Cache Stampede & Thundering Herd', brief: 'Mitigating simultaneous cache expires.' },
      { id: 'cache-hotkey', name: 'Hot Key Handling', brief: 'Local replication and caching of popular items.' },
      { id: 'cache-warming', name: 'Cache Warming Strategies', brief: 'Pre-populating cache keys before launch.' },
    ],
  },
  {
    id: 'fraud-detection',
    name: 'Design a Fraud Detection System',
    brief: 'Design a low-latency transaction scoring application.',
    category: 'System Design (HLD)',
    scale: '10k tx/sec',
    difficulty: 'Hard',
    subtopics: [
      { id: 'fraud-features', name: 'Real-Time Feature Computation', brief: 'Windowed aggregations for profile context.' },
      { id: 'fraud-rules', name: 'Rule Engine + ML Hybrid', brief: 'Applying heuristics and models simultaneously.' },
      { id: 'fraud-scoring', name: 'Low-Latency Scoring Pipeline', brief: 'Making decisions in under 50 milliseconds.' },
      { id: 'fraud-feedback', name: 'Feedback Loop & Model Retraining', brief: 'Updating models based on manual audits.' },
    ],
  },
  {
    id: 'content-moderation',
    name: 'Design a Content Moderation Pipeline',
    brief: 'Design an automated review queue for uploaded media files.',
    category: 'System Design (HLD)',
    scale: '10M uploads/day',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'mod-detection', name: 'Multi-Modal Detection (text, image, video)', brief: 'Routing media to ML classifiers.' },
      { id: 'mod-review', name: 'Human-in-the-Loop Review Queue', brief: 'Escalating edge cases to humans.' },
      { id: 'mod-appeal', name: 'Appeal & Escalation System', brief: 'Allowing users to challenge blocks.' },
      { id: 'mod-tradeoffs', name: 'Latency vs Accuracy Tradeoffs', brief: 'Synchronous vs asynchronous mod loops.' },
    ],
  },
  {
    id: 'splitwise',
    name: 'Design Splitwise (Expense Sharing)',
    brief: 'Model group balances and optimize debt settlements.',
    category: 'Low-Level Design (LLD)',
    scale: 'N/A',
    difficulty: 'Easy-Medium',
    isLLD: true,
    subtopics: [
      { id: 'split-debt', name: 'Debt Simplification Algorithm', brief: 'Minimizing transactions using graphs.' },
      { id: 'split-balances', name: 'Group & Friend Balances', brief: 'Class structures for users and transactions.' },
      { id: 'split-concurrent', name: 'Concurrent Settlement Handling', brief: 'Optimistic locking on group balances.' },
    ],
  },
  {
    id: 'parking-lot',
    name: 'Design a Parking Lot System',
    brief: 'Model vehicle parking allocation and billing systems.',
    category: 'Low-Level Design (LLD)',
    scale: 'N/A',
    difficulty: 'Easy',
    isLLD: true,
    subtopics: [
      { id: 'park-modeling', name: 'Object Modeling (Vehicle, Spot, Floor, Ticket)', brief: 'Defining class relationships.' },
      { id: 'park-strategy', name: 'Strategy Pattern for Spot Assignment', brief: 'Decoupling spot allocation logic.' },
      { id: 'park-billing', name: 'Payment & Exit Flow', brief: 'Ticket verification and pricing algorithms.' },
    ],
  },
  {
    id: 'bookmyshow',
    name: 'Design BookMyShow (Seat Booking)',
    brief: 'Model theater seat reservation under high concurrency.',
    category: 'Low-Level Design (LLD)',
    scale: '10k seats/sec',
    difficulty: 'Medium',
    isLLD: true,
    subtopics: [
      { id: 'book-locking', name: 'Seat Locking & Reservation Timeout', brief: 'Temporary locks in Redis/DB.' },
      { id: 'book-concurrency', name: 'Concurrency Handling (Optimistic Locking)', brief: 'Preventing double booking.' },
      { id: 'book-recovery', name: 'Payment Integration & Failure Recovery', brief: 'Reclaiming seats on payment fail.' },
    ],
  },
  {
    id: 'elevator-system',
    name: 'Design an Elevator System',
    brief: 'Model lift movement and floor passenger dispatch.',
    category: 'Low-Level Design (LLD)',
    scale: 'N/A',
    difficulty: 'Easy-Medium',
    isLLD: true,
    subtopics: [
      { id: 'elv-state', name: 'State Machine (Idle, Moving, Stopped)', brief: 'Defining elevator state transitions.' },
      { id: 'elv-scan', name: 'Scheduling Algorithms (SCAN, LOOK)', brief: 'Optimizing pick-up path.' },
      { id: 'elv-coordinate', name: 'Multi-Elevator Coordination', brief: 'Dispatching elevators dynamically.' },
    ],
  },
  {
    id: 'lru-cache',
    name: 'Design an LRU Cache',
    brief: 'Implement a thread-safe least recently used cache.',
    category: 'Low-Level Design (LLD)',
    scale: 'N/A',
    difficulty: 'Easy',
    isLLD: true,
    subtopics: [
      { id: 'lru-ds', name: 'HashMap + Doubly Linked List', brief: 'Getting O(1) reads and writes.' },
      { id: 'lru-threads', name: 'Thread-Safe Implementation', brief: 'Using locks or concurrent structures.' },
      { id: 'lru-ttl', name: 'Eviction & TTL Extension', brief: 'Combining LRU with time-based expiry.' },
    ],
  },
  {
    id: 'pub-sub-system',
    name: 'Design a Pub-Sub System',
    brief: 'Model dynamic topic subscriptions and memory buffer queues.',
    category: 'Low-Level Design (LLD)',
    scale: 'N/A',
    difficulty: 'Medium',
    isLLD: true,
    subtopics: [
      { id: 'pub-registry', name: 'Topic Management & Subscriber Registry', brief: 'Observer pattern representation.' },
      { id: 'pub-delivery', name: 'Message Delivery Guarantees', brief: 'Push vs pull message delivery.' },
      { id: 'pub-pressure', name: 'Backpressure & Slow Consumer Handling', brief: 'Buffering and overflow policies.' },
    ],
  },
  {
    id: 'chess-tictactoe',
    name: 'Design Chess / Tic-Tac-Toe',
    brief: 'Model turn-based board games with move verification.',
    category: 'Low-Level Design (LLD)',
    scale: 'N/A',
    difficulty: 'Easy',
    isLLD: true,
    subtopics: [
      { id: 'chess-board', name: 'Board Representation & Move Validation', brief: 'Array mapping and rule engines.' },
      { id: 'chess-state', name: 'Game State Machine', brief: 'Tracking player turns and game status.' },
      { id: 'chess-undo', name: 'Undo/Redo & Replay', brief: 'Command pattern implementation.' },
    ],
  },
  {
    id: 'observability-sre',
    name: 'Observability & SRE Fundamentals',
    brief: 'Understand monitoring frameworks and service level targets.',
    category: 'Infrastructure & Ops',
    scale: 'N/A',
    difficulty: 'Medium',
    subtopics: [
      { id: 'obs-pillars', name: 'Logs, Metrics, Traces (Three Pillars)', brief: 'Fusing telemetry formats together.' },
      { id: 'obs-sli', name: 'SLIs, SLOs, SLAs & Error Budgets', brief: 'Quantifying and budgeting service targets.' },
      { id: 'obs-incident', name: 'Incident Response & Postmortems', brief: 'Standard operations for outages.' },
    ],
  },
  {
    id: 'distributed-consensus',
    name: 'Distributed Consensus',
    brief: 'Understand consensus protocols for distributed state agreement.',
    category: 'Infrastructure & Ops',
    scale: 'N/A',
    difficulty: 'Hard',
    subtopics: [
      { id: 'cons-raft', name: 'Paxos & Raft', brief: 'Underpinnings of state machine replication.' },
      { id: 'cons-leader', name: 'Leader Election', brief: 'Heartbeats, randomized timeouts, term numbers.' },
      { id: 'cons-split', name: 'Split Brain & Network Partitions', brief: 'Handling partition recovery with majorities.' },
    ],
  },
  {
    id: 'data-pipelines',
    name: 'Data Pipelines & Stream Processing',
    brief: 'Understand batch and stream processing systems at scale.',
    category: 'Infrastructure & Ops',
    scale: '100TB/day',
    difficulty: 'Medium-Hard',
    subtopics: [
      { id: 'pipe-batch', name: 'Batch vs Stream (MapReduce vs Flink/Spark Streaming)', brief: 'Bounded vs unbounded data streams.' },
      { id: 'pipe-window', name: 'Windowing (Tumbling, Sliding, Session)', brief: 'Aggregation boundaries over time.' },
      { id: 'pipe-schema', name: 'Backfill & Schema Evolution', brief: 'Re-running pipelines and mapping schema changes.' },
    ],
  },
  {
    id: 'security-auth',
    name: 'Security & Auth at Scale',
    brief: 'Protect systems using token authorization and key vaults.',
    category: 'Infrastructure & Ops',
    scale: '10k auths/sec',
    difficulty: 'Medium',
    subtopics: [
      { id: 'sec-oauth', name: 'OAuth 2.0 & JWT Architecture', brief: 'Token format and centralized vs distributed validation.' },
      { id: 'sec-gateway', name: 'API Gateway & Zero Trust', brief: 'Ingress enforcement and service mTLS.' },
      { id: 'sec-secret', name: 'Secret Management & Key Rotation', brief: 'Safeguarding API tokens and database keys.' },
      { id: 'sec-ddos', name: 'DDoS Mitigation', brief: 'Rate limits, CDN filtering, Web Application Firewalls.' },
    ],
  },
  {
    id: 'cicd-pipeline',
    name: 'Design a CI/CD Pipeline',
    brief: 'Model automated compilation, testing, and deployment jobs.',
    category: 'Infrastructure & Ops',
    scale: '10k builds/day',
    difficulty: 'Medium',
    isLLD: true,
    subtopics: [
      { id: 'ci-dag', name: 'Pipeline DAG & Stage Execution', brief: 'Resolving job dependencies in order.' },
      { id: 'ci-cache', name: 'Artifact Storage & Caching', brief: 'Caching node_modules and compiler output.' },
      { id: 'ci-deploy', name: 'Rollback Strategies (Blue-Green, Canary)', brief: 'Mitigating risk during server releases.' },
      { id: 'ci-isolation', name: 'Concurrent Build Isolation', brief: 'Running jobs inside ephemeral containers.' },
    ],
  },
];

function getContent(sectionId: string, topic: SDTopic): string {
  const name = topic.name;

  const templates: Record<string, string> = {
    problem: `**Problem Statement: ${name}**\n\n**Why this matters:**\nThis system is at the core of modern digital infrastructure. Getting the design right is the difference between a system that serves millions and one that falls over under load.\n\n**The core challenge:**\n${topic.brief}\n\n**What makes this hard:**\n1. Scale: ${topic.scale}\n2. Reliability: Users expect 99.99%+ uptime\n3. Consistency vs Availability trade-offs under network partitions\n4. Cost: Compute and storage at this scale is expensive\n\n**Interview context:**\nThis is a favourite at FAANG because it tests: system thinking, knowledge of distributed systems, ability to make and justify trade-offs, and practical engineering experience.`,

    requirements: `**Requirements for ${name}**\n\n**Functional Requirements (what the system must DO):**\n1. Core feature: primary use case, end-to-end\n2. CRUD operations: create, read, update, delete as applicable\n3. Search/query capabilities if needed\n4. User authentication and authorisation\n5. Notifications/webhooks for async events\n\n**Non-Functional Requirements (how well it must do it):**\n| Requirement | Target | Notes |\n|---|---|---|\n| Latency | < 100ms p99 | End-to-end for read |\n| Availability | 99.99% | 52min downtime/year |\n| Consistency | Eventual | Tolerate staleness < 1s |\n| Scale | ${topic.scale} | Peak traffic |\n| Durability | 99.999999999% | 11 nines for data |\n\n**What to clarify in interview:**\n- Read-heavy or write-heavy? (affects caching strategy)\n- Global or single-region? (affects replication design)\n- Strong or eventual consistency? (fundamental design driver)\n- What are the SLOs and who are the users?`,

    estimation: `**Back-of-Envelope Estimation**\n\n**Assumptions:**\n- Scale: ${topic.scale}\n- Read:Write ratio = 100:1 (most systems are read-heavy)\n- Average payload size = 1KB\n\n**QPS Calculation:**\n\`\`\`\nTotal requests/day = ${topic.scale.split('/')[0]} × reads\nPeak QPS = daily_requests / 86400 × 3 (3x peak factor)\n         ≈ 100,000 RPS peak\n\`\`\`\n\n**Storage Calculation:**\n\`\`\`\nNew data/day   = 10M new records × 1KB = 10GB/day\nFor 5 years    = 10GB × 365 × 5 = ~18TB\nWith replication (3x): 54TB total\n\`\`\`\n\n**Bandwidth:**\n\`\`\`\nIncoming: 10M writes/day × 1KB = ~115MB/s peak\nOutgoing: 100M reads/day × 1KB = ~1.15GB/s peak\n→ Need CDN offloading for read traffic\n\`\`\`\n\n**Memory (caching):**\n\`\`\`\nCache hot 20% of reads: 20M records × 1KB = 20GB Redis cluster\n\`\`\``,

    api: `**API Design for ${name}**\n\n**REST Endpoints:**\n\`\`\`\n# Primary CRUD\nPOST   /api/v1/resource         → Create\nGET    /api/v1/resource/{id}    → Read by ID  \nPUT    /api/v1/resource/{id}    → Update\nDELETE /api/v1/resource/{id}   → Delete\nGET    /api/v1/resources?cursor=xxx&limit=20  → Paginated list\n\`\`\`\n\n**Request/Response Schema:**\n\`\`\`json\n// POST /api/v1/resource\n{\n  "data": "...",\n  "metadata": { "ttl": 86400, "tags": ["tag1"] },\n  "client_id": "uuid"\n}\n\n// Response\n{\n  "id": "abc123",\n  "short_url": "https://example.com/abc123",\n  "created_at": "2024-01-01T00:00:00Z",\n  "expires_at": "2025-01-01T00:00:00Z"\n}\n\`\`\`\n\n**Pagination strategy:**\n- Cursor-based pagination (not offset) — consistent under concurrent inserts\n- Cursor = base64(timestamp + last_id)\n- Default page_size = 20, max = 100\n\n**Rate limiting headers:**\n\`\`\`\nX-RateLimit-Limit: 1000\nX-RateLimit-Remaining: 999\nX-RateLimit-Reset: 1704067200\n\`\`\``,

    datamodel: `**Data Model for ${name}**\n\n**Primary Table (SQL / DynamoDB):**\n\`\`\`sql\nCREATE TABLE records (\n    id          VARCHAR(8)   PRIMARY KEY,    -- Short key\n    data        TEXT         NOT NULL,\n    user_id     BIGINT       NOT NULL,\n    created_at  TIMESTAMP    DEFAULT NOW(),\n    expires_at  TIMESTAMP,\n    is_active   BOOLEAN      DEFAULT TRUE,\n    \n    -- Partitioning key for horizontal scaling\n    shard_key   SMALLINT GENERATED ALWAYS AS (HASH(id) % 256)\n);\n\n-- Indexes\nCREATE INDEX idx_user_id ON records(user_id, created_at DESC);\nCREATE INDEX idx_expires ON records(expires_at) WHERE is_active = TRUE;\n\`\`\`\n\n**Sharding strategy:**\n- Shard by hash(primary_key) → 256 shards → ~400M records/shard before rebalancing\n- Each shard = 1 primary + 2 read replicas\n- Cross-shard queries require scatter-gather (avoid for hot paths)\n\n**Caching layer (Redis):**\n\`\`\`\nKey:   resource:{id}\nValue: JSON blob\nTTL:   3600s (1 hour, or match expiry)\nWrite: write-through on create, lazy on update\nEviction: allkeys-lru\n\`\`\``,

    architecture: `**High-Level Architecture for ${name}**\n\n\`\`\`\nClients\n  ↓  HTTPS\nCDN (CloudFront / Fastly)\n  ↓  Cache miss\nAPI Gateway (Kong / AWS API GW)\n  ├── Auth Service (JWT validation)\n  ├── Rate Limiter (Redis sliding window)\n  └── Load Balancer (Round-robin L7)\n       ↓\nApplication Servers (stateless, auto-scaled)\n  ├── Read path  → Redis Cache → DB Read Replica\n  └── Write path → Message Queue (Kafka) → DB Primary\n                                         → Async workers\nDatabase Layer\n  ├── Primary: PostgreSQL (writes)\n  ├── Read replicas: 3 replicas (reads)\n  └── Cache: Redis Cluster (hot data)\n\nAsync Layer\n  ├── Kafka (event streaming)\n  ├── Workers (analytics, notifications)\n  └── Data Warehouse (S3 + Athena)\n\`\`\`\n\n**Request flow:**\n1. Client → CDN (cache hit? serve directly)\n2. CDN miss → API Gateway (auth, rate limit)\n3. Gateway → App Server (stateless, any instance)\n4. App → Redis (cache hit? return in <5ms)\n5. Cache miss → DB read replica (< 50ms)\n6. Write → DB primary → async replication → replicas`,

    scaling: `**Scaling Strategy for ${name}**\n\n**Horizontal Scaling (stateless app tier):**\n- Auto-scaling groups based on CPU (target 60%)\n- Blue-green deployment for zero-downtime releases\n- Connection pooling (PgBouncer) — each server has 10k conns, DB handles 500\n\n**Database Scaling:**\n- Read replicas: Start with 1, add more at >80% read load on primary\n- Sharding: When primary > 1TB or QPS > 10k writes/sec\n- Consider CockroachDB/Spanner for automatic horizontal sharding\n\n**Caching Strategy (cache hierarchy):**\n1. Browser cache (CDN headers, ETag, max-age)\n2. CDN cache (edge nodes, 200+ PoPs globally)\n3. Application cache (local in-process LRU, 1000 items)\n4. Distributed cache (Redis cluster, sub-millisecond)\n5. Database (last resort)\n\n**Cache eviction policies:**\n- LRU for general purpose\n- LFU for content with stable popularity (CDN)\n- TTL-based for session data and tokens\n\n**Async processing (offload from critical path):**\n- Email sending, push notifications, analytics → Kafka\n- Image processing, PDF generation → SQS + Lambda\n- Never block a user-facing request on background work`,

    reliability: `**Reliability & Resiliency**\n\n**Replication:**\n- Database: synchronous replication to 1 replica (durability), async to 2 more (availability)\n- Multi-AZ deployment: primary in us-east-1a, replica in us-east-1b and us-east-1c\n- RPO: < 1 second, RTO: < 30 seconds for AZ failure\n\n**Circuit Breaker Pattern:**\n\`\`\`python\nfrom circuitbreaker import circuit\n\n@circuit(failure_threshold=5, recovery_timeout=30)\ndef call_database(query):\n    return db.execute(query)  # Opens circuit after 5 failures\n\`\`\`\n\n**Retry Strategy:**\n- Exponential backoff: retry at 1s, 2s, 4s, 8s (max 3 retries)\n- Jitter: add random 0-1s to prevent thundering herd\n- Idempotency keys for safe retries on write operations\n\n**Graceful Degradation:**\n- If cache is down → serve from DB (slower but functional)\n- If recommendations fail → serve chronological feed\n- If search is down → return "search temporarily unavailable" (not 500)\n\n**Health Checks:**\n- Shallow: /health → returns 200 (process alive)\n- Deep: /health/ready → checks DB, cache, dependencies\n- Load balancer uses shallow, orchestrator uses deep`,

    consistency: `**Consistency vs Availability Trade-offs (CAP Theorem Applied)**\n\n**CAP Theorem Reality for ${name}:**\nNetwork partitions WILL happen. You're choosing between C and A.\n\n**What this system chooses:**\n- Prefer Availability for reads (users can tolerate slightly stale data)\n- Prefer Consistency for critical writes (payments, auth tokens)\n\n**Consistency levels in practice:**\n| Operation | Level | Rationale |\n|---|---|---|\n| Read user profile | Eventual | Staleness < 1s is fine |\n| Read payments | Strong | Must be accurate |\n| Write new post | Eventual | Followers see it ~1s later |\n| Auth token validation | Strong | Security critical |\n\n**Techniques for strong consistency:**\n- Read from primary (not replica) for critical reads\n- Versioned writes with optimistic locking (compare-and-swap)\n- Two-phase commit for cross-service transactions (avoid if possible)\n\n**Techniques for eventual consistency:**\n- Event sourcing: single source of truth in event log\n- CRDT data structures for conflict-free merging\n- Saga pattern for distributed transactions without 2PC`,

    security: `**Security Design for ${name}**\n\n**Authentication & Authorization:**\n\`\`\`\nAuth flow:\n  Client → Login → Auth Service → JWT (15min TTL)\n  Client → API → Gateway validates JWT → Request proceeds\n  Refresh: Refresh token (7 days) → new JWT pair\n\`\`\`\n\n**Rate Limiting (multi-layer):**\n- Layer 1: CDN rate limiting (coarse, DDoS protection)\n- Layer 2: API Gateway (per-IP, 1000 req/min)\n- Layer 3: Application (per-user, 100 req/min for writes)\n\n**Data Security:**\n- Encryption at rest: AES-256 (AWS KMS managed keys)\n- Encryption in transit: TLS 1.3 minimum\n- PII fields: encrypt at application layer with user-specific keys\n- Secrets: AWS Secrets Manager, never in code or env vars\n\n**Input Validation:**\n\`\`\`python\nimport re\nfrom pydantic import BaseModel, validator\n\nclass CreateRequest(BaseModel):\n    url: str\n    \n    @validator('url')\n    def validate_url(cls, v):\n        pattern = r'^https?://[^\\s/$.?#].[^\\s]*$'\n        if not re.match(pattern, v):\n            raise ValueError('Invalid URL format')\n        if len(v) > 2048:\n            raise ValueError('URL too long')\n        return v\n\`\`\`\n\n**SQL Injection prevention:**\n- Always use parameterised queries (never f-strings in SQL)\n- ORM with query builder (SQLAlchemy, Prisma)`,

    monitoring: `**Monitoring & Observability for ${name}**\n\n**The Three Pillars:**\n\n**1. Metrics (Prometheus + Grafana):**\n\`\`\`\nKey SLI Metrics to track:\n- request_duration_seconds (p50, p95, p99)\n- request_error_rate (5xx / total)\n- cache_hit_ratio (target > 95%)\n- db_query_duration_seconds\n- queue_depth (if async workers)\n\`\`\`\n\n**2. Logs (ELK / DataDog):**\n\`\`\`json\n{\n  "timestamp": "2024-01-01T00:00:00Z",\n  "level": "INFO",\n  "service": "api",\n  "trace_id": "abc123",\n  "user_id": "u456",\n  "endpoint": "POST /api/v1/resource",\n  "duration_ms": 45,\n  "status": 200\n}\n\`\`\`\n\n**3. Traces (Jaeger / AWS X-Ray):**\n- Distributed tracing across all services\n- Identify which service is slow (not just "the request was slow")\n\n**SLO/SLA Definition:**\n- SLO: 99.9% of requests succeed in < 200ms\n- Error budget: 0.1% = 43.2min/month\n- Burn rate alert: if using error budget 2x faster than planned → page on-call\n\n**Alerting (PagerDuty):**\n- P1 (immediate): error rate > 1%, latency > 1s\n- P2 (30min): cache hit < 90%, queue depth > 10k\n- P3 (business hours): storage > 80%, slow queries > 100ms`,

    bottlenecks: `**Bottleneck Analysis for ${name}**\n\n**What breaks at different scales:**\n\n| Scale | Bottleneck | Solution |\n|---|---|---|\n| 1k RPS | Single app server CPU | Horizontal scaling |\n| 10k RPS | Database connections | Connection pooling |\n| 100k RPS | DB read I/O | Read replicas + caching |\n| 1M RPS | Network bandwidth | CDN + data locality |\n| 10M RPS | Cache memory | Distributed cache cluster |\n\n**Hot Spots (the N+1 problem):**\n\`\`\`python\n# BAD: N+1 query pattern\nfor user_id in user_ids:          # 1 query\n    profile = db.get(user_id)     # N queries → catastrophic at scale\n\n# GOOD: Batch fetch\nprofiles = db.get_many(user_ids)  # 1 query\n\`\`\`\n\n**Celebrity / Hot Key Problem:**\nWhen a famous user's post goes viral → millions of reads to same cache key\n- Solution 1: Read-through cache with consistent hashing\n- Solution 2: Local in-process cache (first 1000 copies served from memory)\n- Solution 3: Proactive cache warming before anticipated spike\n\n**Capacity Planning:**\n- Run load tests at 2x, 5x, 10x expected peak before launch\n- Monitor p99 latency, not just averages (averages lie)\n- Auto-scaling with headroom (scale at 60% CPU, not 90%)`,

    interview_tips: `**Interview Discussion Tips for ${name}**\n\n**The 45-minute structure:**\n- 0-5min: Clarify requirements, ask smart questions\n- 5-10min: Estimation (QPS, storage, bandwidth)\n- 10-20min: High-level architecture discussion\n- 20-30min: Component deep dives (pick 2-3 the interviewer cares about)\n- 30-40min: Trade-off discussion, failure scenarios\n- 40-45min: Questions to interviewer, wrap up\n\n**Questions to ask the interviewer (signals seniority):**\n1. "What consistency guarantees do we need?"\n2. "Is this read-heavy or write-heavy? What's the ratio?"\n3. "Are we optimising for cost, latency, or simplicity first?"\n4. "Do we need global distribution or single region?"\n5. "What's the DAU and peak concurrency?"\n\n**Common mistakes candidates make:**\n1. Jumping to microservices for a problem that doesn't need it\n2. Not doing estimation (leads to wrong architecture choices)\n3. Being too vague: "use a cache" vs "Redis cluster with LRU eviction"\n4. Ignoring failure modes: "what happens if the DB is slow?"\n5. Not knowing CAP theorem well enough to apply it\n\n**What FAANG interviewers want to see:**\n- Structured thinking (requirements → estimation → design → deep dive)\n- Justify EVERY decision with trade-offs\n- Proactively identify failure modes before being asked\n- Know 2-3 design patterns deeply: consistent hashing, saga, circuit breaker`,

    insights: `**Real-World Production Insights**\n\n**How big tech actually builds ${name}:**\n\n**Lesson 1: Start simple, evolve later**\nNetflix ran on a monolith until they needed to scale. Twitter started with Ruby on Rails and MySQL. Don't over-engineer at launch — you'll optimise the wrong things.\n\n**Lesson 2: The database is usually the bottleneck**\nApp servers are stateless and trivially scalable. Your primary DB can't be. Invest early in: connection pooling, query optimisation, appropriate indexes, and read replicas.\n\n**Lesson 3: Caching is dangerous**\nCache invalidation is one of the two hard problems in CS. Stale cache + write-through + TTL mismatch caused major outages at Twitter, Amazon, and Facebook. Design your cache invalidation strategy before caching anything.\n\n**Lesson 4: Distributed transactions are evil**\nTwo-phase commit is slow (holds locks) and complex (failure handling). If you need cross-service consistency, use the Saga pattern + compensating transactions instead.\n\n**Lesson 5: Observability is not optional**\nYou WILL have a 3am incident. The question is whether you can find the root cause in 10 minutes or 3 hours. Log structured data, trace everything, and alert on burn rates not thresholds.`,

    quiz: '',
    lld: `**Low-Level Design: ${name}**\n\n**Core Classes:**\n\`\`\`python\nfrom abc import ABC, abstractmethod\nfrom dataclasses import dataclass\nfrom datetime import datetime\nfrom typing import Optional\nimport hashlib\nimport base64\n\n@dataclass\nclass Resource:\n    id: str\n    data: str\n    user_id: str\n    created_at: datetime\n    expires_at: Optional[datetime] = None\n    is_active: bool = True\n\nclass StorageBackend(ABC):\n    @abstractmethod\n    def get(self, resource_id: str) -> Optional[Resource]: ...\n    \n    @abstractmethod  \n    def set(self, resource: Resource) -> bool: ...\n    \n    @abstractmethod\n    def delete(self, resource_id: str) -> bool: ...\n\nclass CacheDecorator(StorageBackend):\n    """Cache-aside pattern decorator over any storage backend."""\n    \n    def __init__(self, backend: StorageBackend, cache):\n        self.backend = backend\n        self.cache = cache\n    \n    def get(self, resource_id: str) -> Optional[Resource]:\n        # Try cache first\n        cached = self.cache.get(f"resource:{resource_id}")\n        if cached:\n            return cached\n        \n        # Cache miss → fetch from backend\n        resource = self.backend.get(resource_id)\n        if resource:\n            self.cache.set(f"resource:{resource_id}", resource, ttl=3600)\n        return resource\n\`\`\`\n\n**Design Patterns used:**\n- Repository pattern: decouple storage from business logic\n- Decorator pattern: add caching without modifying storage class\n- Strategy pattern: swap storage backends (SQL → NoSQL) without changing callers`,
  };

  return templates[sectionId] ?? `**${name} — ${sectionId}**\n\nProduction-quality system design content for this section.`;
}

const SECTION_DEFS = [
  { id: 'problem', label: 'Problem Statement & Why It Matters', icon: 'DocumentTextIcon', subtitle: 'Context, challenges, interview importance' },
  { id: 'requirements', label: 'Functional & Non-Functional Requirements', icon: 'ClipboardDocumentListIcon', subtitle: 'User stories, SLOs, constraints' },
  { id: 'estimation', label: 'Back-of-Envelope Estimation', icon: 'CalculatorIcon', subtitle: 'QPS, storage, bandwidth, memory' },
  { id: 'api', label: 'API Design', icon: 'CodeBracketSquareIcon', subtitle: 'REST endpoints, schemas, pagination' },
  { id: 'datamodel', label: 'Data Model', icon: 'CircleStackIcon', subtitle: 'SQL schema, indexing, sharding key' },
  { id: 'architecture', label: 'High-Level Architecture', icon: 'ServerStackIcon', subtitle: 'Component diagram + request flow' },
  { id: 'scaling', label: 'Scaling Strategy', icon: 'ArrowTrendingUpIcon', subtitle: 'Horizontal scaling, caching layers, CDN' },
  { id: 'reliability', label: 'Reliability & Resiliency', icon: 'ShieldCheckIcon', subtitle: 'Replication, circuit breakers, retries' },
  { id: 'consistency', label: 'Consistency vs Availability (CAP)', icon: 'ScaleIcon', subtitle: 'CAP applied to this specific system' },
  { id: 'security', label: 'Security Design', icon: 'LockClosedIcon', subtitle: 'Auth, rate limiting, encryption, PII' },
  { id: 'monitoring', label: 'Monitoring & Observability', icon: 'ChartBarIcon', subtitle: 'SLOs, metrics, traces, alerting' },
  { id: 'bottlenecks', label: 'Bottleneck Analysis', icon: 'BoltSlashIcon', subtitle: 'What breaks at scale + solutions' },
  { id: 'interview_tips', label: 'Interview Discussion Tips', icon: 'AcademicCapIcon', subtitle: '45-min structure, what FAANG expects' },
  { id: 'insights', label: 'Real-World Production Insights', icon: 'BuildingOffice2Icon', subtitle: 'Big tech war stories, lessons learned' },
  { id: 'quiz', label: 'Quiz', icon: 'TrophyIcon', subtitle: '4 questions with explanations' },
  { id: 'lld', label: 'Low-Level Design', icon: 'PuzzlePieceIcon', subtitle: 'Design patterns, class diagrams, Python code' },
];

const QUIZ_BANK = [
  { q: 'What does CAP theorem state?', options: ['A system can have Consistency, Availability, and Partition tolerance', 'A distributed system can only guarantee 2 of: Consistency, Availability, Partition tolerance', 'Consistency and Availability are always achievable', 'Partition tolerance is optional'], answer: 1, explanation: 'CAP theorem: in the presence of a network Partition, you must choose between Consistency (all nodes see same data) and Availability (every request gets a response).' },
  { q: 'Which pagination strategy is better for systems with high write concurrency?', options: ['Offset-based pagination', 'Cursor-based pagination', 'Page number pagination', 'Time-based pagination'], answer: 1, explanation: 'Cursor-based pagination is consistent under concurrent writes. Offset pagination can miss or repeat records when rows are inserted between pages.' },
  { q: 'What is the primary purpose of consistent hashing in distributed systems?', options: ['Ensuring data consistency', 'Minimising key remapping when nodes are added/removed', 'Load balancing HTTP requests', 'Preventing hash collisions'], answer: 1, explanation: 'Consistent hashing maps keys to a ring. Adding/removing a node only remaps keys that were assigned to that specific node, minimising data movement.' },
  { q: 'What does a circuit breaker do when it "opens"?', options: ['Retries the request with exponential backoff', 'Fails fast without calling the downstream service', 'Routes traffic to a backup service', 'Sends an alert to the on-call engineer'], answer: 1, explanation: 'An open circuit breaker fails fast (returns error immediately) without calling the failing downstream service, preventing cascade failures.' },
];

function sdDiffStyle(d: string): { badge: string; bar: string } {
  switch (d) {
    case 'Easy':        return { badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', bar: 'bg-emerald-500' };
    case 'Easy-Medium': return { badge: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',           bar: 'bg-teal-500'   };
    case 'Medium':      return { badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',       bar: 'bg-amber-500'  };
    case 'Medium-Hard': return { badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',  bar: 'bg-orange-500' };
    default:            return { badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',           bar: 'bg-rose-500'   };
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SYSTEM DESIGN WIKI INDEX
══════════════════════════════════════════════════════════════════════ */
function SDWikiIndex({
  groupedSections, allTopics, onSelectTopic, onSelectSub,
}: {
  groupedSections: { name: string; topics: SDTopic[] }[];
  allTopics: SDTopic[];
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
}) {
  const totalSubs  = allTopics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount  = allTopics.filter(t => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard').length;
  const easyCount  = allTopics.filter(t => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium').length;
  const lldCount   = allTopics.filter(t => t.isLLD).length;

  return (
    <div className="lab-container space-y-10">

      {/* ── Hero banner ── */}
      <div className="lab-hero p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(179,107,23,0.18),transparent_60%)] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Icon name="ServerStackIcon" size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">System Design Wiki</h1>
              <p className="text-sm text-muted-foreground">Production-scale architecture interview reference</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Categories', value: groupedSections.length,  color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-500/10'   },
              { label: 'Problems',   value: allTopics.length,         color: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-500/10'  },
              { label: 'Subtopics', value: totalSubs,                 color: 'text-cyan-600 dark:text-cyan-400',    bg: 'bg-cyan-500/10'    },
              { label: 'LLD',        value: lldCount,                 color: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-500/10'  },
              { label: 'Hard',       value: hardCount,                color: 'text-rose-600 dark:text-rose-400',    bg: 'bg-rose-500/10'    },
              { label: 'Easy',       value: easyCount,                color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
            ].map(stat => (
              <div key={stat.label} className={`${stat.bg} border border-border rounded-xl px-4 py-2.5 backdrop-blur-sm min-w-[64px]`}>
                <div className={`text-2xl font-bold ${stat.color} leading-none`}>{stat.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Clickable Category Index ── */}
      <div className="lab-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <Icon name="ListBulletIcon" size={14} className="text-muted-foreground" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">Category Index</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{groupedSections.length} categories</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-0.5">
            {groupedSections.map((section, i) => (
              <a key={section.name}
                href={`#sd-cat-${section.name.replace(/[\s&/()']/g, '-')}`}
                className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all group">
                <span className="text-[9px] text-muted-foreground/30 w-4 text-right flex-shrink-0">{i + 1}</span>
                <span className="flex-1 truncate group-hover:text-amber-400 transition-colors">{section.name}</span>
                <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{section.topics.length}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Per-category topic cards ── */}
      {groupedSections.map(section => (
        <div key={section.name} id={`sd-cat-${section.name.replace(/[\s&/()']/g, '-')}`} className="space-y-3 scroll-mt-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-foreground whitespace-nowrap">{section.name}</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-border via-border/50 to-transparent" />
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{section.topics.length} problems</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-6">
            {section.topics.map(t => {
              const ds = sdDiffStyle(t.difficulty);
              return (
                <div key={t.id}
                  className="display-card group relative overflow-hidden cursor-pointer h-full"
                  onClick={() => onSelectTopic(t.id)}>
                  <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${ds.bar} opacity-40 group-hover:opacity-80 transition-opacity rounded-l-xl`} />
                  <div className="pl-4 pr-4 pt-3.5 pb-3">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-[var(--wiki-system-hover)] transition-colors leading-snug flex-1 min-w-0">
                        {t.name}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {t.isLLD && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/30 font-bold leading-none">LLD</span>
                        )}
                        {t.scale !== 'N/A' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border leading-none">{t.scale}</span>
                        )}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-bold leading-none ${ds.badge}`}>{t.difficulty}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{t.brief}</p>

                    {t.subtopics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {t.subtopics.map(s => (
                          <button key={s.id}
                            onClick={e => { e.stopPropagation(); onSelectSub(t.id, s.id); }}
                            title={s.brief}
                            className="text-[9px] px-2 py-1 rounded-md bg-muted/80 text-muted-foreground hover:bg-amber-500/15 hover:text-amber-400 transition-all border border-transparent hover:border-amber-500/20 leading-none">
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function initSections(): Record<string, SectionState> {
  return Object.fromEntries(SECTION_DEFS.map(s => [s.id, { generated: false, generating: false, content: '' }]));
}

export default function SystemDesignLabInteractive() {
  const [topics, setTopics] = useState<SDTopic[]>(TOPICS);
  const [selectedTopicId, setSelectedTopicId] = useState('wiki');
  const [selectedSubtopicId, setSelectedSubtopicId] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [sections, setSections] = useState<Record<string, SectionState>>(initSections());
  const [customInput, setCustomInput] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);
  const [addingSubtopicTo, setAddingSubtopicTo] = useState<string | null>(null);
  const [newSubtopicInput, setNewSubtopicInput] = useState('');
  const [quizBatch, setQuizBatch] = useState(0);

  const [sectionsData, setSectionsData] = useState<{id: number, labName: string, name: string, isCustom: boolean}[]>([]);
  const [addingSection, setAddingSection] = useState(false);
  const [customSectionInput, setCustomSectionInput] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showAddSec, setShowAddSec] = useState(false);
  const [addingTopicToSection, setAddingTopicToSection] = useState<string | null>(null);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [leftOpen,      setLeftOpen]      = useState(true);
  const [rightOpen,     setRightOpen]     = useState(true);
  const [recentTopics,  setRecentTopics]  = useState<{ id: string; name: string; subId?: string; subName?: string }[]>([]);

  useEffect(() => {
    apiFetch('/system-design/sections')
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(data => {
        setSectionsData(data);
        setExpandedSections(new Set(data.map((s: any) => s.name)));
      })
      .catch(err => console.error("Error fetching sections:", err));

    apiFetch('/system-design/topics')
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then((data: SDTopic[]) => {
        if (data && data.length > 0) {
          setTopics(data);
        } else {
          setTopics(TOPICS);
        }
      })
      .catch(err => {
        console.error("Error fetching system design topics, falling back to static list:", err);
        setTopics(TOPICS);
      });
  }, []);

  // Restore last opened topic from localStorage on mount
  useEffect(() => {
    const savedTopic  = localStorage.getItem('sd-lab-topic');
    const savedSub    = localStorage.getItem('sd-lab-subtopic');
    const savedRecent = localStorage.getItem('sd-lab-recent-topics');
    if (savedTopic) {
      setSelectedTopicId(savedTopic);
      if (savedTopic !== 'wiki') setExpandedTopics(prev => new Set([...prev, savedTopic]));
    }
    if (savedSub) setSelectedSubtopicId(savedSub);
    if (savedRecent) try { setRecentTopics(JSON.parse(savedRecent)); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('sd-lab-topic', selectedTopicId);
    if (selectedSubtopicId) localStorage.setItem('sd-lab-subtopic', selectedSubtopicId);
    else localStorage.removeItem('sd-lab-subtopic');
  }, [selectedTopicId, selectedSubtopicId]);

  const handleAddCustomSection = () => {
    if (!customSectionInput.trim()) return;
    setAddingSection(true);
    const newSection = { name: customSectionInput.trim(), isCustom: true };
    apiFetch('/system-design/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSection)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setSectionsData(prev => [...prev, { id: Date.now(), labName: 'system_design', name: newSection.name, isCustom: true }]);
        setExpandedSections(prev => new Set([...prev, newSection.name]));
        setCustomSectionInput('');
        setAddingSection(false);
      })
      .catch(err => {
        console.error("Error saving custom section:", err);
        setAddingSection(false);
      });
  };

  const handleAddSubtopic = (topicId: string) => {
    if (!newSubtopicInput.trim()) return;
    const parentTopic = allTopics.find(t => t.id === topicId);
    if (!parentTopic) return;

    const newSubtopic = {
      id: `sub-${Date.now()}`,
      name: newSubtopicInput.trim(),
      brief: 'Custom subtopic.'
    };

    const updatedTopic = {
      ...parentTopic,
      subtopics: [...parentTopic.subtopics, newSubtopic]
    };

    apiFetch('/system-design/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTopic)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setTopics(prev => prev.map(t => t.id === topicId ? updatedTopic : t));
        setNewSubtopicInput('');
        setAddingSubtopicTo(null);
        setExpandedTopics(prev => new Set([...prev, topicId]));
      })
      .catch(err => {
        console.error("Error saving subtopic to DB, saving in client state as fallback:", err);
        setTopics(prev => prev.map(t => t.id === topicId ? updatedTopic : t));
        setNewSubtopicInput('');
        setAddingSubtopicTo(null);
        setExpandedTopics(prev => new Set([...prev, topicId]));
      });
  };

  const handleAddGeneratedSubtopic = (topicId: string, generated: GeneratedSubtopic) => {
    const parentTopic = allTopics.find(t => t.id === topicId);
    if (!parentTopic) return;

    const updatedTopic = {
      ...parentTopic,
      subtopics: [...parentTopic.subtopics, generated],
    };

    apiFetch('/system-design/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedTopic)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setTopics(prev => prev.map(t => t.id === topicId ? updatedTopic : t));
        setExpandedTopics(prev => new Set([...prev, topicId]));
      })
      .catch(err => {
        console.error("Error saving generated subtopic to DB, saving in client state as fallback:", err);
        setTopics(prev => prev.map(t => t.id === topicId ? updatedTopic : t));
        setExpandedTopics(prev => new Set([...prev, topicId]));
      });
  };

  const allTopics = topics;
  const currentTopic = allTopics.find(t => t.id === selectedTopicId) ?? null;
  const currentSubtopic = currentTopic?.subtopics.find(s => s.id === selectedSubtopicId) ?? null;
  const contextLabel = selectedTopicId === 'wiki' ? 'Wiki Index' : (currentSubtopic?.name ?? currentTopic?.name ?? 'System Design');

  const flatItems = [
    { id: 'wiki', type: 'topic', topicId: 'wiki', label: 'Wiki Index' },
    ...allTopics.flatMap(t => [
      { id: t.id, type: 'topic', topicId: t.id, label: t.name },
      ...t.subtopics.map(s => ({ id: s.id, type: 'subtopic', topicId: t.id, label: s.name })),
    ])
  ];
  const activeId = selectedSubtopicId ?? selectedTopicId;
  const currentIdx = flatItems.findIndex(x => x.id === activeId);
  const prevItem = currentIdx > 0 ? flatItems[currentIdx - 1] : null;
  const nextItem = currentIdx >= 0 && currentIdx < flatItems.length - 1 ? flatItems[currentIdx + 1] : null;

  const navigateTo = (item: typeof flatItems[0]) => {
    setSelectedTopicId(item.topicId);
    setSelectedSubtopicId(item.type === 'subtopic' ? item.id : null);
    setSections(initSections());
    setQuizBatch(0);
    setExpandedTopics(prev => new Set([...prev, item.topicId]));
  };

  const addToRecent = (topicId: string, topicName: string, subId?: string, subName?: string) => {
    const key = subId ?? topicId;
    setRecentTopics(prev => {
      const filtered = prev.filter(r => (r.subId ?? r.id) !== key);
      const next = [{ id: topicId, name: topicName, subId, subName }, ...filtered].slice(0, 10);
      localStorage.setItem('sd-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const removeRecentTopic = (key: string) => {
    setRecentTopics(prev => {
      const next = prev.filter(r => (r.subId ?? r.id) !== key);
      localStorage.setItem('sd-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const selectTopic = (id: string) => {
    setSelectedTopicId(id);
    setSelectedSubtopicId(null);
    setSections(initSections());
    setQuizBatch(0);
    if (id !== 'wiki') {
      setExpandedTopics(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
      const t = allTopics.find(tt => tt.id === id);
      if (t) addToRecent(id, t.name);
    }
  };

  const selectSubtopic = (topicId: string, subId: string) => {
    setSelectedTopicId(topicId);
    setSelectedSubtopicId(subId);
    setSections(initSections());
    setQuizBatch(0);
    setExpandedTopics(prev => new Set([...prev, topicId]));
    const t = allTopics.find(tt => tt.id === topicId);
    const s = t?.subtopics.find(ss => ss.id === subId);
    if (t && s) addToRecent(topicId, t.name, subId, s.name);
  };

  const generateSection = (sectionId: string) => {
    if (!currentTopic) return;
    setSections(prev => ({ ...prev, [sectionId]: { ...prev[sectionId], generating: true } }));
    setTimeout(() => {
      setSections(prev => ({ ...prev, [sectionId]: { generated: true, generating: false, content: getContent(sectionId, currentTopic) } }));
    }, 1500);
  };


  const handleAddTopicToSection = (sectionName: string) => {
    if (!newTopicInput.trim()) return;
    const newTopic: SDTopic = {
      id: `custom-${Date.now()}`,
      name: newTopicInput.trim(),
      brief: 'Custom system design problem.',
      category: sectionName,
      scale: '1M RPS',
      difficulty: 'Medium',
      isLLD: false,
      subtopics: []
    };

    apiFetch('/system-design/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTopic)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setTopics(prev => [...prev, newTopic]);
        setNewTopicInput('');
        setAddingTopicToSection(null);
      })
      .catch(err => {
        console.error("Error saving topic to DB:", err);
        setTopics(prev => [...prev, newTopic]);
        setNewTopicInput('');
        setAddingTopicToSection(null);
      });
  };

  const dynamicSections = sectionsData.map(s => s.name);
  const allSectionNames = Array.from(new Set([...dynamicSections, ...allTopics.map(t => t.category)]));
  const groupedSections = allSectionNames.map(sectionName => ({
    name: sectionName,
    topics: allTopics.filter(t => t.category === sectionName)
  }));

  const handleAddCustom = () => {
    if (!customInput.trim()) return;
    setAddingCustom(true);
    const newTopic: SDTopic = {
      id: `custom-${Date.now()}`,
      name: customInput.trim(),
      brief: 'Custom system design problem.',
      category: 'Custom',
      scale: '1M RPS',
      difficulty: 'Medium',
      isLLD: false,
      subtopics: []
    };

    apiFetch('/system-design/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTopic)
    })
      .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
      })
      .then(() => {
        setTopics(prev => [...prev, newTopic]);
        setCustomInput('');
        setAddingCustom(false);
      })
      .catch(err => {
        console.error("Error saving custom topic to DB, saving in client state as fallback:", err);
        setTopics(prev => [...prev, newTopic]);
        setCustomInput('');
        setAddingCustom(false);
      });
  };

  return (
    <div className="lab-shell flex flex-col">
      <div className="lab-workspace flex">

        {/* ── LEFT Sidebar ──────────────────────────────────────────────── */}
        <aside className="lab-sidebar border-r flex flex-col overflow-hidden" style={{ width: leftOpen ? 264 : 48, minWidth: leftOpen ? 264 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}>

          {/* Header */}
          <div className="flex-shrink-0 border-b border-border">
            <div className="flex items-center gap-2.5 px-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/20">
                <Icon name="ServerStackIcon" size={15} className="text-white" />
              </div>
              {leftOpen && (
                <>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-foreground tracking-tight">System Design</h2>
                    <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{allTopics.length} problems · {groupedSections.length} categories</p>
                  </div>
                  <button onClick={() => setLeftOpen(false)} className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Collapse sidebar">
                    <Icon name="ChevronLeftIcon" size={14} />
                  </button>
                </>
              )}
            </div>
            {leftOpen && (
              <div className="px-3 pb-3">
                {showAddSec ? (
                  <div className="flex gap-1.5">
                    <input autoFocus value={customSectionInput} onChange={e => setCustomSectionInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { handleAddCustomSection(); setShowAddSec(false); } if (e.key === 'Escape') { setShowAddSec(false); setCustomSectionInput(''); } }}
                      placeholder="New category…"
                      className="flex-1 min-w-0 bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--lab-system)]/50 placeholder:text-muted-foreground/50" />
                    <button onClick={() => { handleAddCustomSection(); setShowAddSec(false); }} disabled={addingSection || !customSectionInput.trim()}
                      className="px-2.5 py-1.5 bg-[var(--lab-system)] text-white rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50">
                      {addingSection ? '…' : 'Add'}
                    </button>
                    <button onClick={() => { setShowAddSec(false); setCustomSectionInput(''); }}
                      className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-xs rounded-lg hover:bg-muted transition-all">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddSec(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-[var(--lab-system)] hover:border-[var(--lab-system)]/40 hover:bg-[var(--lab-system-soft)] transition-all group">
                    <Icon name="PlusIcon" size={11} className="group-hover:text-[var(--lab-system)] transition-colors" />
                    Add category / section
                  </button>
                )}
              </div>
            )}
          </div>
          {!leftOpen && (
            <div className="flex justify-center py-1.5">
              <button onClick={() => setLeftOpen(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Expand sidebar">
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          )}

          {leftOpen && (
          <div className="flex-1 overflow-y-auto py-2 scrollbar-clean">

            {/* Wiki Index */}
            <button onClick={() => selectTopic('wiki')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-xl text-xs font-semibold transition-all my-0.5 ${selectedTopicId === 'wiki' ? 'bg-[var(--lab-system-soft)] text-[var(--lab-system)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}
              style={{ width: 'calc(100% - 8px)' }}>
              <Icon name="BookOpenIcon" size={13} className={selectedTopicId === 'wiki' ? 'text-[var(--lab-system)]' : ''} />
              <span className="flex-1 text-left">Wiki Index</span>
              {selectedTopicId === 'wiki' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--lab-system)] flex-shrink-0" />}
            </button>

            {/* Recently Opened */}
            {recentTopics.length > 0 && (
              <div className="px-2 mt-1 mb-1">
                <div className="flex items-center gap-1 px-1 mb-1.5">
                  <Icon name="ClockIcon" size={10} className="text-muted-foreground/50" />
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Recent</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {recentTopics.map(r => (
                    <div key={r.subId ?? r.id}
                      className="group flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded-full bg-muted/60 hover:bg-muted transition-all">
                      <button
                        onClick={() => r.subId ? selectSubtopic(r.id, r.subId) : selectTopic(r.id)}
                        className="truncate max-w-[130px] text-[11px] text-muted-foreground hover:text-foreground text-left leading-none py-0.5">
                        {r.subName ?? r.name}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); removeRecentTopic(r.subId ?? r.id); }}
                        className="ml-0.5 p-0.5 rounded-full hover:bg-muted-foreground/20 text-muted-foreground/40 hover:text-foreground transition-all flex-shrink-0">
                        <Icon name="XMarkIcon" size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mx-3 my-2 h-px bg-border/60" />

            {/* Sections */}
            {groupedSections.map(section => {
              const isExp = expandedSections.has(section.name);
              return (
                <div key={section.name} className="mb-0.5">
                  {/* Section row */}
                  <div className="flex items-center gap-1 px-2 py-1.5 mx-1 cursor-pointer group hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setExpandedSections(prev => { const n = new Set(prev); n.has(section.name) ? n.delete(section.name) : n.add(section.name); return n; })}>
                    <Icon name={isExp ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={10} className="text-muted-foreground/60 flex-shrink-0 transition-transform duration-150" />
                    <span className="flex-1 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest truncate ml-0.5">
                      {section.name}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {section.topics.length}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setAddingTopicToSection(addingTopicToSection === section.name ? null : section.name); setNewTopicInput(''); }}
                      className="p-0.5 rounded-md text-muted-foreground/40 hover:text-[var(--lab-system)] hover:bg-[var(--lab-system-soft)] opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-0.5"
                      title="Add topic">
                      <Icon name="PlusIcon" size={9} />
                    </button>
                  </div>

                  {/* Add topic inline */}
                  {addingTopicToSection === section.name && (
                    <div className="mx-3 mb-1 flex gap-1">
                      <input autoFocus value={newTopicInput} onChange={e => setNewTopicInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddTopicToSection(section.name); if (e.key === 'Escape') setAddingTopicToSection(null); }}
                        placeholder="Topic name…"
                        className="flex-1 min-w-0 bg-input border border-border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--lab-system)]/40 placeholder:text-muted-foreground/50" />
                      <button onClick={() => handleAddTopicToSection(section.name)} disabled={!newTopicInput.trim()}
                        className="px-1.5 py-1 bg-[var(--lab-system)]/20 text-[var(--lab-system)] rounded-md text-[11px] hover:bg-[var(--lab-system)]/30 disabled:opacity-40 transition-all">✓</button>
                    </div>
                  )}

                  {/* Topics */}
                  {isExp && (
                    <div className="space-y-px pb-1">
                      {section.topics.map((topic, ti) => {
                        const isActive = selectedTopicId === topic.id && !selectedSubtopicId;
                        const isTopExp = expandedTopics.has(topic.id);
                        const ds = sdDiffStyle(topic.difficulty);
                        return (
                          <div key={topic.id}>
                            {/* Topic row */}
                            <div className="flex items-start mx-1">
                              <button onClick={() => selectTopic(topic.id)}
                                className={`flex-1 min-w-0 flex items-start gap-2 px-2.5 py-2 rounded-xl text-left transition-all ${isActive ? 'bg-[var(--lab-system-soft)] shadow-sm' : 'hover:bg-muted/50'}`}>
                                <span className={`flex-shrink-0 text-[9px] mt-0.5 w-4 text-right leading-none ${isActive ? 'text-[var(--lab-system)]/80' : 'text-muted-foreground/30'}`}>
                                  {ti + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className={`block text-[12px] font-medium leading-tight truncate ${isActive ? 'text-[var(--lab-system)]' : 'text-foreground/90'}`}>
                                    {topic.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md border font-bold leading-none ${ds.badge}`}>{topic.difficulty}</span>
                                    {topic.isLLD && <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/20 font-bold leading-none">LLD</span>}
                                    {topic.scale !== 'N/A' && <span className="text-[8px] text-muted-foreground/50 leading-none">{topic.scale}</span>}
                                  </div>
                                </div>
                              </button>
                              <button
                                onClick={() => setExpandedTopics(prev => { const n = new Set(prev); n.has(topic.id) ? n.delete(topic.id) : n.add(topic.id); return n; })}
                                className="flex-shrink-0 p-1.5 mt-0.5 rounded-lg text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60 transition-all">
                                <Icon name={isTopExp ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={9} />
                              </button>
                            </div>

                            {/* Subtopics */}
                            {isTopExp && (
                              <div className="ml-9 mr-2 space-y-px mb-1">
                                {topic.subtopics.map((sub, idx) => {
                                  const isSubAct = selectedSubtopicId === sub.id;
                                  return (
                                    <button key={sub.id}
                                      onClick={() => selectSubtopic(topic.id, sub.id)}
                                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] leading-tight transition-all ${isSubAct ? 'bg-[var(--lab-system-soft)] text-[var(--lab-system)]' : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'}`}>
                                      <span className={`text-[8px] mr-1.5 ${isSubAct ? 'text-[var(--lab-system)]' : 'text-muted-foreground/30'}`}>
                                        {(idx + 1).toString().padStart(2, '0')}
                                      </span>
                                      <span className="truncate">{sub.name}</span>
                                    </button>
                                  );
                                })}
                                {/* Add subtopic */}
                                {addingSubtopicTo === topic.id ? (
                                  <div className="flex gap-1 mt-1">
                                    <input autoFocus value={newSubtopicInput} onChange={e => setNewSubtopicInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleAddSubtopic(topic.id); if (e.key === 'Escape') setAddingSubtopicTo(null); }}
                                      placeholder="Subtopic…"
                                      className="flex-1 min-w-0 bg-input border border-border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--lab-system)]/40 placeholder:text-muted-foreground/50" />
                                    <button onClick={() => handleAddSubtopic(topic.id)}
                                      className="px-1.5 py-1 bg-[var(--lab-system)]/20 text-[var(--lab-system)] rounded-md text-[11px] hover:bg-[var(--lab-system)]/30 transition-all">✓</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setAddingSubtopicTo(topic.id)}
                                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[9px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30 rounded-lg transition-all">
                                    <Icon name="PlusIcon" size={8} />
                                    Add subtopic
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </aside>

        {/* ── CENTER ────────────────────────────────────────────────────── */}
        <main className="lab-main scrollbar-clean">
          {selectedTopicId !== 'wiki' && (
            <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background/95 backdrop-blur-sm">
              <button onClick={() => selectTopic('wiki')}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-amber-400 transition-colors group">
                <Icon name="ArrowLeftIcon" size={12} className="group-hover:-translate-x-0.5 transition-transform" />
                <span>Wiki Index</span>
              </button>
              {currentTopic && (
                <>
                  <Icon name="ChevronRightIcon" size={10} className="text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate">{currentTopic.name}</span>
                </>
              )}
              {currentSubtopic && (
                <>
                  <Icon name="ChevronRightIcon" size={10} className="text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{currentSubtopic.name}</span>
                </>
              )}
            </div>
          )}
          {selectedTopicId === 'wiki' ? (
            <SDWikiIndex
              groupedSections={groupedSections}
              allTopics={allTopics}
              onSelectTopic={selectTopic}
              onSelectSub={selectSubtopic}
            />
          ) : !currentTopic ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-24">
              <Icon name="ServerStackIcon" size={48} variant="outline" className="text-muted-foreground/30 mb-18" />
              <h2 className="font-heading text-xl font-semibold text-foreground mb-9">Select a System Design Problem</h2>
              <p className="text-sm text-muted-foreground max-w-sm">Choose a problem from the sidebar. Each of the 16 sections generates on-demand.</p>
            </div>
          ) : (
            <div className="lab-container max-w-card space-y-5">
              {/* ── Hero Topic Header ── */}
              <div className="lab-hero relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(179,107,23,0.12),transparent_60%)] pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="relative">
                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow shadow-amber-500/30 mr-1">
                      <Icon name="ServerStackIcon" size={15} className="text-white" />
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-[var(--lab-system-soft)] text-[var(--lab-system)] border border-[var(--lab-system)]/20 font-medium leading-none">
                      {currentTopic.category}
                    </span>
                    {(() => { const ds = sdDiffStyle(currentTopic.difficulty); return (
                      <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold leading-none ${ds.badge}`}>
                        {currentTopic.difficulty}
                      </span>
                    ); })()}
                    {currentTopic.isLLD && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 font-semibold leading-none">LLD</span>
                    )}
                    {currentTopic.scale !== 'N/A' && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-muted text-muted-foreground border border-border leading-none">Scale: {currentTopic.scale}</span>
                    )}
                    {currentSubtopic && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-secondary/10 text-secondary border border-secondary/20 leading-none">Deep Dive</span>
                    )}
                  </div>

                  <h1 className="text-xl font-bold text-foreground mb-2 leading-snug tracking-tight">
                    {currentSubtopic?.name ?? currentTopic.name}
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {currentSubtopic?.brief ?? currentTopic.brief}
                  </p>

                  {(() => {
                    const genCount = SECTION_DEFS.filter(d => sections[d.id]?.generated).length;
                    return genCount > 0 ? (
                      <div className="mt-4">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                          <span>Sections generated</span>
                          <span className="font-medium text-foreground/80">{genCount} / {SECTION_DEFS.length}</span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${(genCount / SECTION_DEFS.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* ── Video-based lab content (from YouTube generator) ── */}
              {currentSubtopic?.content && (
                <div className="lab-card border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Video-based Lab</p>
                    {currentSubtopic.sourceUrl && (
                      <a href={currentSubtopic.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline">
                        <Icon name="PlayCircleIcon" size={12} />
                        Watch source video
                      </a>
                    )}
                  </div>
                  <MarkdownLite content={currentSubtopic.content} />
                </div>
              )}

              {/* ── Content Outline (quick-jump) ── */}
              <div className="lab-card-muted p-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Content Outline</p>
                <div className="grid grid-cols-3 gap-1">
                  {SECTION_DEFS.map(def => {
                    const s = sections[def.id];
                    return (
                      <a key={def.id} href={`#sec-${def.id}`}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] transition-all leading-tight ${s?.generated ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s?.generated ? 'bg-amber-400' : s?.generating ? 'bg-blue-400 animate-pulse' : 'bg-muted-foreground/20'}`} />
                        <span className="truncate">{def.label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>

              {/* ── Generate Questions ── */}
              <GenerateQuestionsPanel
                topicName={currentTopic.name}
                subtopicName={currentSubtopic?.name}
                labName="system-design"
                accentVar="--lab-system"
                onAddSubtopic={generated => handleAddGeneratedSubtopic(currentTopic.id, generated)}
              />

              {/* ── On-demand sections ── */}
              <div className="space-y-4">
                {SECTION_DEFS.map((def, idx) => {
                  const s = sections[def.id] ?? { generated: false, generating: false, content: '' };
                  return (
                    <div key={def.id} id={`sec-${def.id}`} className="scroll-mt-4">
                      <OnDemandSection key={def.id} sectionIndex={idx + 1} icon={def.icon} title={def.label} subtitle={def.subtitle}
                        content={s.content} isGenerated={s.generated} isGenerating={s.generating} onGenerate={() => generateSection(def.id)}>
                        {def.id === 'quiz' && s.generated ? (
                          <QuizCarousel questions={QUIZ_BANK.slice(quizBatch * 4, quizBatch * 4 + 4)} hasMore={true} onGenerateMore={() => setQuizBatch(b => b + 1)} />
                        ) : undefined}
                      </OnDemandSection>
                    </div>
                  );
                })}
              </div>

              {/* ── Prev / Next ── */}
              <div className="flex items-center justify-between py-4 border-t border-border mt-2">
                <button disabled={!prevItem} onClick={() => prevItem && navigateTo(prevItem)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30 disabled:pointer-events-none">
                  <Icon name="ArrowLeftIcon" size={14} />{prevItem?.label ?? 'No previous'}
                </button>
                <button disabled={!nextItem} onClick={() => nextItem && navigateTo(nextItem)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30 disabled:pointer-events-none">
                  {nextItem?.label ?? 'No next'}<Icon name="ArrowRightIcon" size={14} />
                </button>
              </div>
            </div>
          )}
        </main>

        {/* ── RIGHT: Copilot ─────────────────────────────────────────────── */}
        <aside className="lab-copilot border-l flex flex-col overflow-hidden" style={{ width: rightOpen ? 300 : 48, minWidth: rightOpen ? 300 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}>
          {rightOpen ? (
            <LabCopilot context={contextLabel} labType="system-design" onCollapse={() => setRightOpen(false)} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-3">
              <button onClick={() => setRightOpen(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Show Copilot">
                <Icon name="ChevronLeftIcon" size={14} />
              </button>
              <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center mt-1">
                <Icon name="SparklesIcon" size={12} className="text-secondary" variant="solid" />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
