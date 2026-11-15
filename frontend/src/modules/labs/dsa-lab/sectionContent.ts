import { settingsSections } from '@/modules/labs/common/LabSettings';
import { buildPrerequisitesMarkdown } from './prerequisites';
import { DSA_DEFAULT_GUIDANCE } from './sectionGuidance';
import type { DSATopic } from './types';

/* ─────────────────────────────────────────── helpers ─────────────────────── */
export function parseBrief(brief: string) {
  const lc = brief.match(/LC\s+(#\d+)/)?.[1] ?? null;
  const hint = brief.replace(/LC\s+#\d+\s+\[.*?\]\s+[—–-]\s*/, '').trim();
  return { lc, hint };
}

/* ─────────────────────────────── section definitions ────────────────────── */
// Standing instructions for the AI-written "Approaches" section; the backend (FastAPI or fe-apis)
// adds them to its prompt, for the first Generate and for any later update/regenerate with context.
const APPROACHES_GUIDANCE = `Teach this problem as a guided progression of approaches, the way a good mentor walks a learner from a first instinct to the optimal solution. Number the approaches in the order the learner should meet them: 3 or 4 approaches in total, starting with the most naive and ending with the optimal one. The LAST approach MUST be the optimal one and say so.

For EACH approach use exactly this layout:
**Approach N — <short name>** (append "(optimal)" on the last one)
- **Idea:** 2-3 plain sentences. For every approach after the first, open by naming the bottleneck of the previous approach and the observation that leads here.
- **Walkthrough:** trace a tiny concrete example in 4-6 steps.
- **Complexity:** time and space, each with a one-line reason.
- **Code:** a short, correct Python solution in a fenced python block.
- **Why it falls short:** (every approach EXCEPT the last) name the specific bottleneck, show a concrete input size where it breaks down (for example n = 10^5 means about 10^10 operations), and finish with "**The question that leads to Approach N+1:** ..." stating the insight or question that guides the learner forward.
- **Why this is optimal:** (last approach only) explain why no better time complexity is reachable (the lower bound or the key invariant) and what trade-off it makes.

After the last approach add:
**Progression at a glance** — a table with columns Approach | Time | Space | Verdict, one row per approach, where the verdict says what that approach taught or why it was replaced.
**How to say this in an interview** — 2-3 sentences narrating the progression out loud.

Stay specific to this problem, not generic. Never skip the failing step: the learner must understand why each approach is not enough before the next one appears. Aim for roughly 900-1500 words excluding code.`;

// Standing instructions for the Prerequisites section when it is rewritten with the pen (the plain
// Generate fills in the template from ./prerequisites.ts, which has the same three groups).
const PREREQUISITES_GUIDANCE = `List the specific things a learner must already know to solve THIS problem, as short bullets under these bold headings, in this order:
**Python concepts** - language features, built-ins and library calls the solution uses (for example how to update a dict value, heapq with tuples, deque, bitwise operators).
**Data structures** - the structures involved and the operations on them that must be second nature.
**Algorithms & ideas** - the techniques and simpler problems this one builds on (for example slow and fast pointers, prefix sums, binary search on a sorted array).
Add **Math / bit tricks** as a fourth group only if the problem needs it.

Every bullet names ONE concrete skill, never a vague area like "basic Python" or "arrays". Put a tiny example in backticks where it helps (for example \`d[k] = d.get(k, 0) + 1\`). Use 8-14 bullets in total, no paragraphs, and never write that no prerequisites are needed.`;

export const SECTION_DEFS = [
  {
    id: 'prerequisites',
    label: 'Prerequisites',
    icon: 'AcademicCapIcon',
    subtitle: 'Specific Python, data-structure and algorithm skills to have first',
    guidance: PREREQUISITES_GUIDANCE,
  },
  {
    id: 'theory',
    label: 'Core Theory',
    icon: 'CalculatorIcon',
    subtitle: 'Mathematical foundations + intuition',
  },
  {
    id: 'approaches',
    label: 'Approaches',
    icon: 'ArrowTrendingUpIcon',
    subtitle: 'Brute force → optimal, and why each one gives way',
    aiGenerated: true,
    guidance: APPROACHES_GUIDANCE,
  },
  {
    id: 'visual',
    label: 'Visual Architecture',
    icon: 'PhotoIcon',
    subtitle: 'Data flow diagrams + architecture',
  },
  {
    id: 'implementation',
    label: 'Practical Implementation',
    icon: 'CodeBracketIcon',
    subtitle: 'Python code, walkthrough, dry-run',
  },
  {
    id: 'hyperparameters',
    label: 'Design Choices',
    icon: 'AdjustmentsHorizontalIcon',
    subtitle: 'Patterns, variants, time/space trade-offs',
  },
  {
    id: 'pitfalls',
    label: 'Common Pitfalls',
    icon: 'BugAntIcon',
    subtitle: 'Edge cases, mistakes, and gotchas',
  },
  {
    id: 'applications',
    label: 'Real-World Applications',
    icon: 'BuildingOffice2Icon',
    subtitle: 'Industry use cases + company examples',
  },
  {
    id: 'interview',
    label: 'Interview Questions',
    icon: 'ChatBubbleLeftRightIcon',
    subtitle: 'Conceptual + coding + pattern signals',
  },
  {
    id: 'comparison',
    label: 'Comparison w/ Alternatives',
    icon: 'ScaleIcon',
    subtitle: 'Tradeoff table + when to use each',
  },
  {
    id: 'paper',
    label: 'Research Context',
    icon: 'DocumentMagnifyingGlassIcon',
    subtitle: 'References, SOTA, known variants',
  },
  {
    id: 'quiz',
    label: 'Quiz',
    icon: 'TrophyIcon',
    subtitle: '4 questions, score tracked, generate more',
  },
  {
    id: 'references',
    label: 'References & Resources',
    icon: 'BookOpenIcon',
    subtitle: 'NeetCode, LeetCode, Striver, GFG, MIT OCW',
  },
];

// The sections the lab settings dialog lists (each with its built-in instructions as the editable prompt).
export const SETTINGS_SECTIONS = settingsSections(SECTION_DEFS, DSA_DEFAULT_GUIDANCE, {
  notes: {
    quiz: 'These instructions and your context are added to the requirements for each new batch of quiz questions.',
  },
});

/* ─────────────────────────────── content templates ─────────────────────── */
export function getContent(sectionId: string, topic: DSATopic): string {
  const { lc, hint } = parseBrief(topic.brief);
  const n = topic.name;
  const subs = topic.subtopics.map((s) => `- **${s.name}**: ${s.brief}`).join('\n');

  const templates: Record<string, string> = {
    prerequisites: buildPrerequisitesMarkdown(n, topic.category, topic.prerequisites),

    theory:
      `**Core Theory: ${n}**${lc ? ` (LeetCode ${lc})` : ''}\n\n` +
      `**Pattern:** ${hint}\n\n` +
      `**Key Idea:**\nReduce naive O(n\xB2) scan to O(n) by maintaining extra state.\n\n` +
      `**Subtopics:**\n${subs}`,

    visual:
      `**Visual Architecture — ${n}**\n\n` +
      '```text\n' +
      `Input Array/String\n    ↓  Initialise auxiliary structure\n` +
      `Auxiliary State (HashMap / Stack / Deque / Pointers)\n    ↓  Single linear pass\n` +
      `Answer / Running Max / Count\n` +
      '```\n\n' +
      `**Pattern mechanics:**\n- Maintain invariant at each step\n- Update answer on valid state\n- Advance pointer(s) / pop stack / shrink window`,

    implementation:
      `**Python Implementation — ${n}**\n\n` +
      '```python\n' +
      `# ${n}${lc ? ` — LeetCode ${lc}` : ''}\n` +
      `# Pattern: ${hint}\n\n` +
      `def solve(nums):\n    state = {}  # hashmap / deque / stack\n    result = 0\n    for i, val in enumerate(nums):\n        if val in state:\n            result = max(result, i - state[val])\n        state[val] = i\n    return result\n` +
      '```\n\n' +
      `**Dry run:** Trace through a small example to verify your invariant.`,

    hyperparameters:
      `**Design Choices — ${n}**\n\n` +
      `**Time:** O(n) average — single pass\n**Space:** O(n) worst case — auxiliary structure\n\n` +
      `**Key decisions:**\n- Hashmap over array when key space is large/unknown\n` +
      `- Deque over list for O(1) front pop\n- Two variables instead of full DP array when only last 1-2 states matter`,

    pitfalls:
      `**Common Pitfalls — ${n}**\n\n` +
      `1. **Off-by-one** — left pointer update should be max(left, ...) to prevent backward movement\n` +
      `2. **Same element twice** — check complement BEFORE inserting into hashmap\n` +
      `3. **Base state missing** — prefix-sum map needs {0: 1}; sentinel -1 in histogram stack\n` +
      `4. **Duplicate skip** — 3Sum needs dedup at both outer loop AND two-pointer loop`,

    applications:
      `**Real-World Applications of ${n}**\n\n` +
      `- **Financial analytics:** Subarray sum windows for anomaly detection\n` +
      `- **Streaming systems:** Sliding window metrics (p95 latency, rolling max throughput)\n` +
      `- **Database query optimisation:** Hash-join uses hashmap-based lookup\n` +
      `- **Log analysis:** Smallest window containing all required error codes`,

    interview:
      `**Interview Questions — ${n}**\n\n` +
      `**Pattern recognition signals:**\n` +
      `- "Subarray/substring" + sum/condition → Prefix Sum or Sliding Window\n` +
      `- "Pairs/triples" → Two Pointers (sorted) or HashMap\n` +
      `- "Next greater/smaller" → Monotonic Stack\n` +
      `- "Cycle in list/graph" → Fast & Slow pointers\n\n` +
      `**Common follow-ups:**\n1. What if the array contains negatives?\n2. Can you do it O(1) space?\n3. How does your solution handle duplicates?`,

    comparison:
      `**Comparison with Alternatives — ${n}**\n\n` +
      `| Approach | Time | Space | When |\n|---|---|---|---|\n` +
      `| Brute Force | O(n\xB2) | O(1) | Baseline only |\n` +
      `| Sorting first | O(n log n) | O(n) | When order doesn't matter |\n` +
      `| **Optimal (this)** | **O(n)** | **O(n)** | **Most interviews** |\n` +
      `| Divide & Conquer | O(n log n) | O(log n) | Rarely needed |`,

    paper:
      `**Research & Reference Context**\n\n` +
      `- Knuth, Morris, Pratt (1977) — string search O(n) precursor to sliding window\n` +
      `- Cormen et al. "Introduction to Algorithms" (CLRS)\n` +
      `- LeetCode Editorial${lc ? ` for ${lc}` : ''} — official walkthrough\n` +
      `- NeetCode.io — visual pattern-based explanations`,

    references:
      `**References & Resources — ${n}**\n\n` +
      `- NeetCode 150 — pattern-organised problem set (neetcode.io)\n` +
      `- LeetCode Editorial${lc ? ` for problem ${lc}` : ''}\n` +
      `- Striver DSA Sheet — A to Z structured roadmap\n` +
      `- MIT 6.006 Introduction to Algorithms — OCW lecture notes\n` +
      `- CLRS (Introduction to Algorithms) — theoretical depth`,
  };

  return (
    templates[sectionId] ??
    `**${n} — ${sectionId}**\n\nDetailed content for this section.\nPattern: ${hint}.`
  );
}
