import type { CSSProperties } from 'react';
import type { LabName } from '@/lib/services/labSectionsService';
import { COMMUNICATION_SECTION_DEFS } from '@/modules/labs/communication-lab/labConfig';
import { CV_SECTION_DEFS } from '@/modules/labs/cv-lab/sectionDefs';
import { FINANCE_SECTION_DEFS } from '@/modules/labs/finance-lab/labConfig';
import { PYTHON_SECTION_DEFS } from '@/modules/labs/python-lab/labConfig';
import { SYSTEM_DESIGN_SECTION_DEFS } from '@/modules/labs/system-design-lab/sectionDefs';

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
   * CV, System Design, Communication, Finance and Python keep their own hue. Never use it for a button, row, link or progress bar.
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

/* CV and System Design keep their sections (with the default AI prompts the lab pages use) in their own folders, like
   the topic labs; the Config page's prompt editor reads them from here. */
export { CV_SECTION_DEFS, SYSTEM_DESIGN_SECTION_DEFS };

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
  communication: {
    key: 'communication',
    name: 'Communication Lab',
    shortName: 'Communication',
    icon: 'ChatBubbleOvalLeftEllipsisIcon',
    description: 'Business English, effective communication and leadership: phrases, frameworks, role-plays and drills.',
    identity: 'var(--lab-communication)',
    sampleTopic: { name: 'Giving & Receiving Feedback', brief: 'Share specific, kind and useful feedback, and take it well.', subtopic: 'The SBI Model (Situation-Behavior-Impact)' },
    defaultPromptAddons: [
      { label: '🌍 Simple English', text: 'Use simple, clear English (CEFR B1-B2), explain every idiom, and point out mistakes non-native speakers commonly make.' },
      { label: '💼 Corporate & Formal', text: 'Set every example in a formal corporate setting: a large company, senior stakeholders and client-facing work.' },
      { label: '🚀 Startup & Tech Team', text: 'Set examples in a fast-moving tech team: Slack threads, stand-ups, product reviews, engineers and product managers.' },
      { label: '🎤 Interview Ready', text: 'Tie every section back to how this skill is tested in interviews, with STAR-format sample answers.' },
      { label: '🌏 Cross-Cultural Teams', text: 'Highlight how this works with colleagues from India, the US, Europe and East Asia, and how to adapt between them.' },
      { label: '🧑‍💼 New Manager', text: 'Assume I have just become the manager of a small team and need practical, word-for-word scripts.' },
    ],
  },
  finance: {
    key: 'finance',
    name: 'Finance Lab',
    shortName: 'Finance',
    icon: 'BanknotesIcon',
    description: 'Finance for beginners, from money basics and markets to Python, machine learning and LLMs in finance.',
    identity: 'var(--lab-finance)',
    sampleTopic: { name: 'Time Value of Money', brief: 'Why money today is worth more than the same money next year.', subtopic: 'Present Value & Future Value' },
    defaultPromptAddons: [
      { label: '🔰 Absolute Beginner', text: 'Assume no finance background: define every term, avoid jargon, and use everyday analogies.' },
      { label: '🇮🇳 Indian Context (₹)', text: 'Use Indian examples and rupees: SIPs, PPF, EPF, the Nifty 50, the RBI repo rate and Indian banks.' },
      { label: '🇺🇸 US Context ($)', text: 'Use US examples and dollars: 401(k), IRAs, the S&P 500, the Federal Reserve and US banks.' },
      { label: '🐍 More Python', text: 'Include a short runnable pandas example wherever numbers are involved.' },
      { label: '📊 Spreadsheet First', text: 'Prefer Excel / Google Sheets formulas over code, with the exact formula for each cell.' },
      { label: '🤖 AI Angle Everywhere', text: 'In every section, add one short note on how AI or machine learning applies to this topic.' },
      { label: '💼 Finance Interview Prep', text: 'Tie the content to entry-level finance and fintech interview questions.' },
    ],
  },
  python: {
    key: 'python',
    name: 'Python Lab',
    shortName: 'Python',
    icon: 'CommandLineIcon',
    description: 'Python from the first program to OOP, testing, concurrency and building data and AI apps.',
    identity: 'var(--lab-python)',
    sampleTopic: { name: 'Iterators & Generators', brief: 'Produce values one at a time to save memory and simplify code.', subtopic: 'Generators & yield' },
    defaultPromptAddons: [
      { label: '🔰 Total Beginner', text: 'Assume I have never programmed before: explain every line and avoid jargon.' },
      { label: '🧪 Test-Driven', text: 'Show a pytest test for every example and exercise.' },
      { label: '🏷️ Type Hints Everywhere', text: 'Use modern type hints (Python 3.11+) in all code.' },
      { label: '📊 Data & AI Examples', text: 'Set examples in data analysis and AI work: pandas DataFrames, model inputs and LLM API responses.' },
      { label: '⚡ Performance Notes', text: 'Mention the time and memory cost of each approach and the faster alternative.' },
      { label: '🎯 Interview Focus', text: 'Emphasise what Python interviews ask about this topic, including output-prediction questions.' },
    ],
  },
};

export function getSectionDefsForLab(lab: LabName): readonly SectionDef[] {
  switch (lab) {
    case 'dsa': return DSA_SECTION_DEFS;
    case 'cv': return CV_SECTION_DEFS;
    case 'system_design': return SYSTEM_DESIGN_SECTION_DEFS;
    case 'communication': return COMMUNICATION_SECTION_DEFS;
    case 'finance': return FINANCE_SECTION_DEFS;
    case 'python': return PYTHON_SECTION_DEFS;
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
