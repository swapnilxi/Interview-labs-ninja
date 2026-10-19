'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import ConfirmHost from '@/components/ui/ConfirmHost';
import LabCopilot, { LabCopilotRail } from '@/components/common/LabCopilot';
import {
  LabMobileBar,
  LabSheetBackdrop,
  useLabPanes,
  useLabSheets,
} from '@/modules/common/lab/LabMobile';
import {
  LAB_REVEAL,
  LabAddRow,
  LabRecentList,
  LabSidebarHeader,
} from '@/modules/common/lab/LabSidebarParts';
import {
  WIKI_CARD,
  WIKI_CARD_TITLE_HOVER,
  WikiHero,
  WikiIndexNav,
  WikiSectionHeading,
} from '@/modules/common/lab/WikiParts';
import OnDemandSection from '@/components/lab/OnDemandSection';
import QuizCarousel from '@/components/lab/QuizCarousel';
import GenerateQuestionsPanel, { GeneratedSubtopic } from '@/modules/common/GenerateQuestionsPanel';
import MarkdownLite from '@/modules/common/lab/MarkdownLite';
import { useLabSections, type SectionState } from '@/modules/common/lab/useLabSections';
import { useLabQuiz } from '@/modules/common/lab/useLabQuiz';
import { buildPrerequisitesMarkdown } from './prerequisites';
import { useWeekPlan, type WeekPlanApi } from './useWeekPlan';
import WeekPlanView, { type OrganizeTrigger } from './WeekPlanView';
import WeekPill from './WeekPill';
import WeekOrganizer from './organizer/WeekOrganizer';
import { clearOrganizerUi } from './organizer/uiState';
import { DifficultyTag, LcTag, Tag, difficultyDotClass, tagClass } from './ui';
import { CompleteButton, DoneMark, LabProgressSummary } from '@/modules/common/lab/LabProgressUi';
import { LabSettingsButton, settingsSections } from '@/modules/common/lab/LabSettings';
import LabSettingsModal from '@/modules/common/lab/LabSettingsModal';
import ProjectSelector from '@/modules/common/lab/project/ProjectSelector';
import { sectionSaveInfo } from '@/modules/common/lab/project/sectionProject';
import SectionPromptModal from '@/modules/common/lab/SectionPromptModal';
import { useLabSettings } from '@/modules/common/lab/useLabSettings';
import { DSA_DEFAULT_GUIDANCE } from './sectionGuidance';
import ApproachTabs from './ApproachTabs';
import { buildUrl, useUrlState } from '@/lib/navigation/urlState';
import {
  LabBackBar,
  LabScreenLoading,
  jumpToAnchor,
  useLabNav,
  useScrollToTopOnChange,
} from '@/modules/common/lab/labNavigation';
import type { ContextMode } from '@/lib/services/labSectionsService';
import { apiFetch } from '@/lib/http/apiClient';

/* ─────────────────────────────────────────── types ──────────────────────── */
import { STATIC_DSA_TOPICS } from './fallbackTopics';

export interface DSATopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  prerequisites: string[];
  subtopics: { id: string; name: string; brief: string; content?: string; sourceUrl?: string }[];
  isCustom?: boolean;
}

/* ─────────────────────────────────────────── helpers ─────────────────────── */
function parseBrief(brief: string) {
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

const SECTION_DEFS = [
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
const SETTINGS_SECTIONS = settingsSections(SECTION_DEFS, DSA_DEFAULT_GUIDANCE, {
  notes: {
    quiz: 'These instructions and your context are added to the requirements for each new batch of quiz questions.',
  },
});

/* ─────────────────────────────── content templates ─────────────────────── */
function getContent(sectionId: string, topic: DSATopic): string {
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

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
/**
 * Where the week plan was when the organizer opened: the content pane's scroll position and which Organize button was
 * pressed. The organizer replaces the plan page (it unmounts), so Back puts both back instead of landing on <body>.
 */
interface OrganizerReturn {
  scrollTop: number;
  trigger: OrganizeTrigger;
}

/**
 * Focus the Organize button the learner pressed. Right after Back it may not take focus yet: the page behind the organizer is
 * still inert for a moment, and the sticky toolbar stays inert (and fades in, hidden for its first frame) until the restored
 * scroll position has shown it. So keep trying for about half a second, and stop as soon as it worked or focus went elsewhere.
 */
function focusOrganizeTrigger(trigger: OrganizeTrigger) {
  const find = (t: OrganizeTrigger) =>
    document.querySelector<HTMLElement>(`[data-organize-trigger="${t}"]`);
  let tries = 0;
  const attempt = () => {
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest('[data-organize-trigger]')) return; // the learner moved on
    const el = find(trigger);
    if (el && !el.closest('[inert]')) {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) return;
    }
    if (++tries < 30) requestAnimationFrame(attempt);
    else find('header')?.focus({ preventScroll: true });
  };
  requestAnimationFrame(attempt);
}

export default function DSALabInteractive() {
  const [topics, setTopics] = useState<DSATopic[]>([]);
  const [topicsReady, setTopicsReady] = useState(false);
  const [sectionsData, setSectionsData] = useState<
    { id: number; labName: string; name: string; isCustom: boolean }[]
  >([]);
  // The open screen lives in the URL (?topic=&sub=), see labNavigation.tsx.
  const nav = useLabNav(topics, topicsReady);
  const selectedTopicId = nav.topicId;
  const selectedSubId = nav.subId;
  const { pathname, searchParams, get: getParam, update: updateUrl } = useUrlState();
  const [expandedSecs, setExpandedSecs] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set(nav.topicParam ? [nav.topicParam] : [])
  );

  // add-section
  const [showAddSec, setShowAddSec] = useState(false);
  const [newSecInput, setNewSecInput] = useState('');
  const [addingSec, setAddingSec] = useState(false);
  // add-topic
  const [addingTopicTo, setAddingTopicTo] = useState<string | null>(null);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);
  // add-subtopic
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubInput, setNewSubInput] = useState('');
  const lab = useLabSheets(`${selectedTopicId}|${selectedSubId}`);
  const { leftExpanded, rightExpanded, setLeftOpen, setRightOpen, collapseLeft, collapseRight } =
    useLabPanes(lab);
  const [recentTopics, setRecentTopics] = useState<
    { id: string; name: string; subId?: string; subName?: string }[]
  >([]);

  const mainRef = useRef<HTMLElement>(null);

  /* ── fetch ── */
  useEffect(() => {
    apiFetch('/dsa/sections')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { id: number; labName: string; name: string; isCustom: boolean }[]) => {
        setSectionsData(data);
        setExpandedSecs(new Set(data.map((s) => s.name)));
      })
      .catch((e) => console.error('sections:', e));

    apiFetch('/dsa/topics')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: DSATopic[]) => {
        if (data?.length) {
          setTopics(data);
        } else {
          setTopics(STATIC_DSA_TOPICS);
        }
        setTopicsReady(true);
      })
      .catch((e) => {
        console.error('topics:', e);
        setTopics(STATIC_DSA_TOPICS);
        setTopicsReady(true);
      });
  }, []);

  // Restore the "Recent" chips on mount. Which screen is open is not stored here any more: it lives in the URL.
  useEffect(() => {
    const savedRecent = localStorage.getItem('dsa-lab-recent-topics');
    if (savedRecent)
      try {
        setRecentTopics(JSON.parse(savedRecent));
      } catch {
        /* a corrupt list just starts empty */
      }
  }, []);

  // A different screen opened (also via Back/Forward): the content pane starts at its top.
  useScrollToTopOnChange(mainRef, `${selectedTopicId}|${selectedSubId ?? ''}`);

  // ?view=week&organize=1 is the week organizer, a full-screen board over the lab. It is only valid on the week view; any
  // other value (or organize without view=week) falls back to the view underneath, and the address bar is corrected.
  // With a topic open the param stays, so that topic's Back returns to the board it was opened from.
  const organizeParam = getParam('organize');
  const weekView = getParam('view') === 'week';
  const organizing =
    organizeParam === '1' && weekView && selectedTopicId === 'wiki' && !nav.pending;
  useEffect(() => {
    if (organizeParam !== null && (organizeParam !== '1' || !weekView))
      updateUrl({ organize: null }, 'replace');
  }, [organizeParam, weekView, updateUrl]);
  const organizerBackHref = buildUrl(pathname, searchParams.toString(), { organize: null });
  // Back from the organizer to the week plan: the plan page is mounted fresh, so put the pane back where it was and focus
  // the button that opened the organizer (a keyboard or screen-reader user would otherwise start again from the document top).
  const organizerReturn = useRef<OrganizerReturn | null>(null);
  const wasOrganizing = useRef(false);
  // The organizer is "in use" while it is the screen and while a question opened from it is (that question's Back returns to it).
  const organizerRoute = organizeParam === '1' && weekView;
  useLayoutEffect(() => {
    if (nav.pending) return;
    const was = wasOrganizing.current;
    wasOrganizing.current = organizing;
    if (organizing) return;
    if (was && selectedTopicId === 'wiki' && weekView) {
      const place = organizerReturn.current;
      if (place && mainRef.current) mainRef.current.scrollTop = place.scrollTop;
      focusOrganizeTrigger(place?.trigger ?? 'header');
    }
    // Left the organizer for good (Back, the Wiki Index, another view): the remembered place is stale from here on, and so is the
    // board's own state (filters, sort, scroll), which only has to survive opening a question and coming back.
    if (!organizerRoute) {
      organizerReturn.current = null;
      clearOrganizerUi();
    }
  }, [organizing, organizerRoute, nav.pending, selectedTopicId, weekView]);
  const rememberOrganizerPlace = (trigger: OrganizeTrigger) => {
    organizerReturn.current = { scrollTop: mainRef.current?.scrollTop ?? 0, trigger };
  };
  // What a topic's Back returns to: the board, the week plan, or the pattern-wise Wiki.
  const wikiParentName =
    organizeParam === '1' && weekView ? 'Week organizer' : weekView ? 'Week plan' : 'Wiki Index';

  /* ── derived ── */
  const allSecNames = Array.from(
    new Set([...sectionsData.map((s) => s.name), ...topics.map((t) => t.category)])
  );
  const grouped = allSecNames.map((name) => ({
    name,
    topics: topics.filter((t) => t.category === name),
  }));

  const currentTopic = topics.find((t) => t.id === selectedTopicId) ?? null;
  const currentSub = currentTopic?.subtopics.find((s) => s.id === selectedSubId) ?? null;
  const {
    sections,
    generate: generateSection,
    generateWithContext,
  } = useLabSections({
    lab: 'dsa',
    topic: currentTopic,
    subtopic: currentSub,
    sectionDefs: SECTION_DEFS,
    getDefaultContent: (id) => (currentTopic ? getContent(id, currentTopic) : ''),
    defaultGuidance: DSA_DEFAULT_GUIDANCE,
  });
  const quiz = useLabQuiz({
    lab: 'dsa',
    topic: currentTopic,
    subtopic: currentSub,
    category: currentTopic?.category ?? '',
    defaultGuidance: DSA_DEFAULT_GUIDANCE.quiz,
    prerequisites: currentTopic?.prerequisites ?? [],
    // the other problems in the same pattern family: what the quiz can compare this one against
    relatedTopics: currentTopic
      ? topics
          .filter((t) => t.category === currentTopic.category && t.id !== currentTopic.id)
          .map((t) => t.name)
          .slice(0, 8)
      : [],
  });
  const weekPlan = useWeekPlan(topics);
  const contextLabel =
    selectedTopicId === 'wiki'
      ? 'Wiki Index'
      : (currentSub?.name ?? currentTopic?.name ?? 'DSA Lab');

  const flatItems = [
    { id: 'wiki', type: 'topic' as const, topicId: 'wiki', label: 'Wiki Index' },
    ...topics.flatMap((t) => [
      { id: t.id, type: 'topic' as const, topicId: t.id, label: t.name },
      ...t.subtopics.map((s) => ({
        id: s.id,
        type: 'subtopic' as const,
        topicId: t.id,
        label: s.name,
      })),
    ]),
  ];
  const activeId = selectedSubId ?? selectedTopicId;
  const curIdx = flatItems.findIndex((x) => x.id === activeId);
  const prevItem = curIdx > 0 ? flatItems[curIdx - 1] : null;
  const nextItem = curIdx >= 0 && curIdx < flatItems.length - 1 ? flatItems[curIdx + 1] : null;

  /* ── actions ── */
  // Scrolling the content pane back to the top is done by useScrollToTopOnChange when the screen changes
  // (a smooth scroll started here would still be running when the new screen appears).

  const addToRecent = (topicId: string, topicName: string, subId?: string, subName?: string) => {
    const key = subId ?? topicId;
    setRecentTopics((prev) => {
      const filtered = prev.filter((r) => (r.subId ?? r.id) !== key);
      const next = [{ id: topicId, name: topicName, subId, subName }, ...filtered].slice(0, 10);
      localStorage.setItem('dsa-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const removeRecentTopic = (key: string) => {
    setRecentTopics((prev) => {
      const next = prev.filter((r) => (r.subId ?? r.id) !== key);
      localStorage.setItem('dsa-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const selectTopic = (id: string) => {
    nav.openTopic(id);
    if (id !== 'wiki') {
      setExpandedTopics((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
      const t = topics.find((tt) => tt.id === id);
      if (t) addToRecent(id, t.name);
    }
  };

  // The sidebar's Wiki Index entry: the Wiki itself (in its current view), never the organizer board.
  const openWiki = () => updateUrl({ topic: null, sub: null, organize: null });

  const selectSub = (topicId: string, subId: string) => {
    nav.openSub(topicId, subId);
    setExpandedTopics((prev) => new Set([...prev, topicId]));
    const t = topics.find((tt) => tt.id === topicId);
    const s = t?.subtopics.find((ss) => ss.id === subId);
    if (t && s) addToRecent(topicId, t.name, subId, s.name);
  };

  const navigateTo = (item: (typeof flatItems)[0]) => {
    if (item.type === 'subtopic') nav.openSub(item.topicId, item.id);
    else nav.openTopic(item.topicId);
    setExpandedTopics((prev) => new Set([...prev, item.topicId]));
  };

  const handleAddSection = () => {
    if (!newSecInput.trim()) return;
    setAddingSec(true);
    const name = newSecInput.trim();
    apiFetch('/dsa/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isCustom: true }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => {
        setSectionsData((prev) => [
          ...prev,
          { id: Date.now(), labName: 'dsa', name, isCustom: true },
        ]);
        setExpandedSecs((prev) => new Set([...prev, name]));
        setNewSecInput('');
        setShowAddSec(false);
      })
      .catch((e) => console.error('addSec:', e))
      .finally(() => setAddingSec(false));
  };

  const handleAddTopic = (sectionName: string) => {
    if (!newTopicInput.trim()) return;
    setAddingTopic(true);
    const newTopic: DSATopic = {
      id: `custom-${Date.now()}`,
      name: newTopicInput.trim(),
      brief: 'Custom topic.',
      category: sectionName,
      difficulty: 'Medium',
      prerequisites: [],
      subtopics: [],
      isCustom: true,
    };
    apiFetch('/dsa/topics', {
      method: 'POST',
      body: JSON.stringify(newTopic),
    })
      .then((r) => {
        if (!r.ok) console.error('addTopic: HTTP', r.status);
      })
      .catch((e) => console.error('addTopic:', e))
      .finally(() => {
        setTopics((prev) => [...prev, newTopic]);
        setNewTopicInput('');
        setAddingTopicTo(null);
        setAddingTopic(false);
      });
  };

  const handleAddSub = (topicId: string) => {
    if (!newSubInput.trim()) return;
    const parent = topics.find((t) => t.id === topicId);
    if (!parent) return;
    const newSub = { id: `sub-${Date.now()}`, name: newSubInput.trim(), brief: 'Custom subtopic.' };
    const updated = { ...parent, subtopics: [...parent.subtopics, newSub] };
    apiFetch('/dsa/topics', {
      method: 'POST',
      body: JSON.stringify(updated),
    })
      .then((r) => {
        if (!r.ok) console.error('addSub: HTTP', r.status);
      })
      .catch((e) => console.error('addSub:', e));
    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    setNewSubInput('');
    setAddingSubTo(null);
    setExpandedTopics((prev) => new Set([...prev, topicId]));
  };

  const handleAddGeneratedSubtopic = (topicId: string, generated: GeneratedSubtopic) => {
    const parent = topics.find((t) => t.id === topicId);
    if (!parent) return;
    const updated = { ...parent, subtopics: [...parent.subtopics, generated] };
    apiFetch('/dsa/topics', {
      method: 'POST',
      body: JSON.stringify(updated),
    })
      .then((r) => {
        if (!r.ok) console.error('addGeneratedSub: HTTP', r.status);
      })
      .catch((e) => console.error('addGeneratedSub:', e));
    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    setExpandedTopics((prev) => new Set([...prev, topicId]));
  };

  /* ── render ── */
  return (
    <div className="lab-shell dsa-type flex flex-col">
      <div className="lab-workspace flex">
        {lab.isMobile && lab.sheet && <LabSheetBackdrop onClose={lab.close} />}

        {/* ═══════════════════════ LEFT SIDEBAR ═══════════════════════════ */}
        <aside
          aria-label="DSA topics"
          data-sheet={lab.sheet === 'left' ? 'open' : 'closed'}
          inert={lab.isMobile && lab.sheet !== 'left' ? true : undefined}
          className="lab-sidebar border-r flex flex-col overflow-hidden"
          style={{
            width: leftExpanded ? 264 : 48,
            minWidth: leftExpanded ? 264 : 48,
            flexShrink: 0,
            transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Header: identity, settings and the collapse control (the 48px rail shows the tile and an expand button) */}
          <div className="flex-shrink-0">
            <LabSidebarHeader
              icon="CodeBracketIcon"
              title="DSA Lab"
              subtitle={`${topics.length} topics · ${allSecNames.length} patterns`}
              expanded={leftExpanded}
              onCollapse={collapseLeft}
              onExpand={() => setLeftOpen(true)}
              collapseLabel={lab.isMobile ? 'Close sidebar' : undefined}
              settings={
                <LabSettingsButton lab="dsa" labName="DSA Lab" sections={SETTINGS_SECTIONS} />
              }
            />
            {leftExpanded && (
              <div className="px-3 pb-3">
                {showAddSec ? (
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      value={newSecInput}
                      onChange={(e) => setNewSecInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddSection();
                        if (e.key === 'Escape') {
                          setShowAddSec(false);
                          setNewSecInput('');
                        }
                      }}
                      placeholder="New pattern or section"
                      aria-label="New pattern or section name"
                      className="todo-input todo-input-quiet min-w-0 flex-1 px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleAddSection}
                      disabled={addingSec || !newSecInput.trim()}
                      className="todo-btn todo-btn-primary"
                    >
                      {addingSec ? 'Adding…' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddSec(false);
                        setNewSecInput('');
                      }}
                      className="todo-btn todo-btn-ghost w-8 px-0"
                      aria-label="Cancel"
                      title="Cancel"
                    >
                      <Icon name="XMarkIcon" size={14} />
                    </button>
                  </div>
                ) : (
                  <LabAddRow label="Add pattern / section" onClick={() => setShowAddSec(true)} />
                )}
              </div>
            )}
          </div>

          {leftExpanded && (
            <nav aria-label="Topics" className="flex-1 overflow-y-auto pb-2 pt-1 scrollbar-clean">
              {/* Wiki Index */}
              <div className="px-1.5">
                <button
                  type="button"
                  onClick={openWiki}
                  aria-current={selectedTopicId === 'wiki' ? 'page' : undefined}
                  className="lab-row lab-row-tall"
                >
                  {selectedTopicId === 'wiki' && <span aria-hidden="true" className="todo-rail" />}
                  <Icon
                    name="BookOpenIcon"
                    size={16}
                    className={selectedTopicId === 'wiki' ? '' : 'text-muted-foreground'}
                  />
                  <span className="flex-1">Wiki Index</span>
                </button>
              </div>

              {/* Recently opened: a collapsible list (the stored ten, the newest four shown) */}
              {recentTopics.length > 0 && (
                <div className="mt-2">
                  <LabRecentList
                    items={recentTopics.map((r) => ({
                      key: r.subId ?? r.id,
                      label: r.subName ?? r.name,
                      onOpen: () => (r.subId ? selectSub(r.id, r.subId) : selectTopic(r.id)),
                    }))}
                    onRemove={removeRecentTopic}
                    storageKey="dsa-lab-recent-open"
                  />
                </div>
              )}

              {/* Sections */}
              <div className="mt-3">
                {grouped.map((section) => {
                  const isExp = expandedSecs.has(section.name);
                  const adding = addingTopicTo === section.name;
                  return (
                    <div key={section.name} className="mb-1">
                      {/* Section row: the name toggles the list; "+" adds a topic */}
                      <div className="group mx-1.5 flex items-center rounded-md transition-smooth hover:mix-bg-foreground/[0.05]">
                        <button
                          type="button"
                          aria-expanded={isExp}
                          onClick={() =>
                            setExpandedSecs((prev) => {
                              const n = new Set(prev);
                              if (n.has(section.name)) n.delete(section.name);
                              else n.add(section.name);
                              return n;
                            })
                          }
                          className="todo-focus flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-2 pl-2 pr-1 text-left"
                        >
                          <Icon
                            name={isExp ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                            size={12}
                            className="flex-shrink-0 text-muted-foreground"
                          />
                          <span className="dsa-caption min-w-0 flex-1 break-words text-muted-foreground">
                            {section.name}
                          </span>
                          <span className="flex-shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                            {section.topics.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-expanded={adding}
                          aria-label={`Add a topic to ${section.name}`}
                          title="Add topic to this pattern"
                          onClick={() => {
                            setAddingTopicTo(adding ? null : section.name);
                            setNewTopicInput('');
                          }}
                          className={`todo-focus mr-1 flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:lab-tint hover:lab-ink ${LAB_REVEAL}`}
                        >
                          <Icon name="PlusIcon" size={14} />
                        </button>
                      </div>

                      {/* Add topic inline */}
                      {adding && (
                        <div className="mx-3 mb-1.5 mt-1 flex gap-1.5">
                          <input
                            autoFocus
                            value={newTopicInput}
                            onChange={(e) => setNewTopicInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddTopic(section.name);
                              if (e.key === 'Escape') setAddingTopicTo(null);
                            }}
                            placeholder="Topic name"
                            aria-label={`New topic in ${section.name}`}
                            className="todo-input todo-input-quiet min-w-0 flex-1 px-2.5 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddTopic(section.name)}
                            disabled={addingTopic || !newTopicInput.trim()}
                            className="todo-btn todo-btn-quiet w-8 px-0"
                            aria-label="Add topic"
                            title="Add topic"
                          >
                            <Icon name="CheckIcon" size={14} />
                          </button>
                        </div>
                      )}

                      {/* Topics */}
                      {isExp && (
                        <ul className="space-y-0.5 pb-1">
                          {section.topics.map((topic, ti) => {
                            const isActive = selectedTopicId === topic.id && !selectedSubId;
                            const isTopExp = expandedTopics.has(topic.id);

                            return (
                              <li key={topic.id}>
                                {/* Topic row */}
                                <div className="mx-1.5 flex items-start gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => selectTopic(topic.id)}
                                    aria-current={isActive ? 'page' : undefined}
                                    className="lab-row flex-1 items-start py-2 pr-2"
                                  >
                                    {isActive && <span aria-hidden="true" className="todo-rail" />}
                                    <span
                                      aria-hidden="true"
                                      className="w-4 flex-shrink-0 pt-px text-right text-xs font-medium tabular-nums text-muted-foreground"
                                    >
                                      {ti + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      {/* The title takes its colour from the row: foreground, or the accent ink when it is the open page. */}
                                      <span className="dsa-heading block break-words text-[13px] leading-snug">
                                        {topic.name}
                                      </span>
                                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <LcTag brief={topic.brief} />
                                        <DifficultyTag difficulty={topic.difficulty} />
                                        <DoneMark lab="dsa" topicId={topic.id} />
                                        {topic.isCustom && (
                                          <span className="text-xs font-medium text-muted-foreground">
                                            Custom
                                          </span>
                                        )}
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-expanded={isTopExp}
                                    aria-label={`${isTopExp ? 'Hide' : 'Show'} subtopics of ${topic.name}`}
                                    onClick={() =>
                                      setExpandedTopics((prev) => {
                                        const n = new Set(prev);
                                        if (n.has(topic.id)) n.delete(topic.id);
                                        else n.add(topic.id);
                                        return n;
                                      })
                                    }
                                    className="todo-focus mt-1 flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-smooth hover:text-foreground hover:mix-bg-foreground/[0.05]"
                                  >
                                    <Icon
                                      name={isTopExp ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                                      size={14}
                                    />
                                  </button>
                                </div>

                                {/* Subtopics */}
                                {isTopExp && (
                                  <ul className="mb-1 ml-[2.25rem] mr-2 mt-0.5 space-y-0.5">
                                    {topic.subtopics.map((sub, idx) => {
                                      const isSubAct = selectedSubId === sub.id;
                                      return (
                                        <li key={sub.id}>
                                          <button
                                            type="button"
                                            onClick={() => selectSub(topic.id, sub.id)}
                                            aria-current={isSubAct ? 'page' : undefined}
                                            className="lab-row lab-row-muted min-h-8 py-1.5 text-xs leading-snug"
                                          >
                                            {isSubAct && (
                                              <span aria-hidden="true" className="todo-rail" />
                                            )}
                                            <span
                                              aria-hidden="true"
                                              className="flex-shrink-0 tabular-nums"
                                            >
                                              {(idx + 1).toString().padStart(2, '0')}
                                            </span>
                                            <span className="min-w-0 flex-1 break-words">
                                              {sub.name}
                                            </span>
                                            <DoneMark
                                              lab="dsa"
                                              topicId={topic.id}
                                              subtopicId={sub.id}
                                            />
                                          </button>
                                        </li>
                                      );
                                    })}
                                    {/* Add subtopic */}
                                    <li>
                                      {addingSubTo === topic.id ? (
                                        <div className="mt-1 flex gap-1.5">
                                          <input
                                            autoFocus
                                            value={newSubInput}
                                            onChange={(e) => setNewSubInput(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleAddSub(topic.id);
                                              if (e.key === 'Escape') setAddingSubTo(null);
                                            }}
                                            placeholder="Subtopic name"
                                            aria-label={`New subtopic of ${topic.name}`}
                                            className="todo-input todo-input-quiet min-w-0 flex-1 px-2.5 py-1.5 text-xs"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleAddSub(topic.id)}
                                            disabled={!newSubInput.trim()}
                                            className="todo-btn todo-btn-quiet w-8 px-0"
                                            aria-label="Add subtopic"
                                            title="Add subtopic"
                                          >
                                            <Icon name="CheckIcon" size={14} />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setAddingSubTo(topic.id)}
                                          className="lab-row lab-row-muted min-h-8 gap-1.5 py-1.5 text-xs"
                                        >
                                          <Icon name="PlusIcon" size={12} />
                                          Add subtopic
                                        </button>
                                      )}
                                    </li>
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>
          )}
        </aside>

        {/* ═══════════════════════ CENTER PANEL ═══════════════════════════ */}
        <main ref={mainRef} className="lab-main scrollbar-clean">
          {lab.isMobile && (
            <LabMobileBar
              title={contextLabel}
              onTopics={lab.openTopics}
              onCopilot={lab.openCopilot}
            />
          )}
          {/* Back to the parent screen: a topic goes back to the Wiki Index (or the week plan / organizer it was opened from), a subtopic to its topic */}
          {selectedTopicId !== 'wiki' && currentTopic && (
            <LabBackBar
              href={currentSub ? nav.topicHref : nav.wikiHref}
              parentName={currentSub ? currentTopic.name : wikiParentName}
              currentName={currentSub ? currentSub.name : currentTopic.name}
            />
          )}
          {nav.pending ? (
            <LabScreenLoading />
          ) : organizing ? (
            <WeekOrganizer
              topics={topics}
              weekPlan={weekPlan}
              backHref={organizerBackHref}
              onOpenTopic={selectTopic}
            />
          ) : selectedTopicId === 'wiki' ? (
            <WikiIndex
              grouped={grouped}
              topics={topics}
              weekPlan={weekPlan}
              onSelectTopic={selectTopic}
              onSelectSub={selectSub}
              onBeforeOrganize={rememberOrganizerPlace}
            />
          ) : !currentTopic ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <Icon name="CodeBracketIcon" size={28} className="mb-3 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Select a topic</h2>
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Choose a topic from the sidebar. Its sections are written on demand: open one and
                press Generate.
              </p>
            </div>
          ) : (
            <TopicDetail
              topic={currentTopic}
              subtopic={currentSub}
              sections={sections}
              quiz={quiz}
              week={weekPlan.weekOf(currentTopic.id)}
              prevItem={prevItem}
              nextItem={nextItem}
              onGenerate={generateSection}
              onGenerateWithContext={generateWithContext}
              onNavigate={navigateTo}
              onAddGeneratedSubtopic={handleAddGeneratedSubtopic}
            />
          )}
        </main>

        {/* ═══════════════════════ RIGHT COPILOT ══════════════════════════ */}
        <aside
          aria-label="AI Copilot"
          role={lab.isMobile && lab.sheet === 'right' ? 'dialog' : undefined}
          aria-modal={lab.isMobile && lab.sheet === 'right' ? true : undefined}
          data-sheet={lab.sheet === 'right' ? 'open' : 'closed'}
          inert={lab.isMobile && lab.sheet !== 'right' ? true : undefined}
          className="lab-copilot border-l flex flex-col overflow-hidden"
          style={{
            width: rightExpanded ? 300 : 48,
            minWidth: rightExpanded ? 300 : 48,
            flexShrink: 0,
            transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Stays mounted while collapsed (hidden), so the conversation survives a collapse. */}
          <div className={rightExpanded ? 'h-full w-[300px] max-md:w-full' : 'hidden'}>
            <LabCopilot
              context={contextLabel}
              labType="dsa"
              collapseLabel={lab.isMobile ? 'Close' : 'Collapse'}
              onCollapse={() => collapseRight()}
            />
          </div>
          {!rightExpanded && <LabCopilotRail onOpen={() => setRightOpen(true)} />}
        </aside>
      </div>

      {/* Answers confirmDialog() (deleting a plan, removing a week with questions): it is not mounted app-wide. */}
      <ConfirmHost panelClassName="dsa-type" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WIKI INDEX
══════════════════════════════════════════════════════════════════════════ */
const patternAnchor = (name: string) => `pattern-${name.replace(/[\s&/()]/g, '-')}`;

function WikiIndex({
  grouped,
  topics,
  weekPlan,
  onSelectTopic,
  onSelectSub,
  onBeforeOrganize,
}: {
  grouped: { name: string; topics: DSATopic[] }[];
  topics: DSATopic[];
  weekPlan: WeekPlanApi;
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
  onBeforeOrganize: (trigger: OrganizeTrigger) => void;
}) {
  // ?view=week shows the week-by-week plan; no param is the pattern-wise handbook.
  const { get: getParam, update: updateUrl } = useUrlState();
  const view = getParam('view') === 'week' ? 'week' : 'pattern';
  const totalSubs = topics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount = topics.filter(
    (t) => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard'
  ).length;
  const easyCount = topics.filter(
    (t) => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium'
  ).length;

  return (
    // 24px between the hero, the view switch and the index; the pattern sections below sit 32px apart.
    <div className="lab-container space-y-[1.5rem]">
      {/* ── Hero: identity, a compact row of numbers and one line of progress, in a single surface with the signature wash ── */}
      <WikiHero
        icon="BookOpenIcon"
        title="DSA Lab Wiki"
        description="Pattern-wise interview preparation handbook"
        metrics={[
          { label: 'Patterns', value: grouped.length },
          { label: 'Topics', value: topics.length },
          { label: 'Subtopics', value: totalSubs },
          { label: 'Hard', value: hardCount, tone: 'hard' },
          { label: 'Easy', value: easyCount, tone: 'easy' },
        ]}
      >
        <LabProgressSummary lab="dsa" topicIds={topics.map((t) => t.id)} noun="questions" />
      </WikiHero>

      {/* ── View switch: by pattern / by week (same screen, so `replace`) ── */}
      <div
        role="group"
        aria-label="Wiki view"
        className="todo-segmented todo-segmented-quiet todo-segmented-accent"
      >
        {(['pattern', 'week'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() =>
              updateUrl({ view: v === 'week' ? 'week' : null, organize: null }, 'replace')
            }
            className="todo-segment"
          >
            <Icon name={v === 'week' ? 'CalendarDaysIcon' : 'Squares2X2Icon'} size={14} />
            {v === 'week' ? 'By week' : 'By pattern'}
          </button>
        ))}
      </div>

      {view === 'week' ? (
        <WeekPlanView
          topics={topics}
          weekPlan={weekPlan}
          onOpen={onSelectTopic}
          onBeforeOrganize={onBeforeOrganize}
        />
      ) : (
        <>
          {/* ── Pattern index: the page's main block (all patterns, same anchors) ── */}
          <WikiIndexNav
            id="dsa-pattern-index"
            title="Pattern index"
            countLabel={`${grouped.length} patterns`}
            items={grouped.map((section) => ({
              name: section.name,
              count: section.topics.length,
              href: `#${patternAnchor(section.name)}`,
            }))}
          />

          {/* ── Per-pattern topic cards ── */}
          <div className="space-y-[2rem]">
            {grouped.map((section) => {
              const anchor = patternAnchor(section.name);
              return (
                <section
                  key={section.name}
                  id={anchor}
                  aria-labelledby={`${anchor}-title`}
                  className="scroll-mt-[4.5rem] space-y-[1rem] md:scroll-mt-[1.5rem]"
                >
                  <WikiSectionHeading
                    id={`${anchor}-title`}
                    name={section.name}
                    count={`${section.topics.length} ${section.topics.length === 1 ? 'question' : 'questions'}`}
                  />

                  {section.topics.length === 0 ? (
                    <p className="text-sm font-medium text-muted-foreground">
                      No questions in this pattern yet. Add one with the + next to it in the
                      sidebar.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-[1rem]">
                      {section.topics.map((t) => (
                        <li key={t.id}>
                          <TopicCard
                            topic={t}
                            week={weekPlan.weekOf(t.id)}
                            onOpen={onSelectTopic}
                            onOpenSub={onSelectSub}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** A question in the pattern-wise Wiki: title, one meta row, the hint, and its subtopics as chips. Flat card: no shadow, no lift. */
function TopicCard({
  topic: t,
  week,
  onOpen,
  onOpenSub,
}: {
  topic: DSATopic;
  week: number | null;
  onOpen: (id: string) => void;
  onOpenSub: (topicId: string, subId: string) => void;
}) {
  const { hint } = parseBrief(t.brief);
  return (
    // The whole card opens the question for a pointer; the title is the real button for keyboard and screen readers.
    <div data-wiki-card className={WIKI_CARD} onClick={() => onOpen(t.id)}>
      {/* Difficulty rail: the one coloured edge on a card (semantic, not the accent) */}
      <span
        aria-hidden="true"
        data-semantic="difficulty"
        className={`absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full opacity-50 transition-opacity group-hover:opacity-90 ${difficultyDotClass(t.difficulty)}`}
      />
      <div className="flex h-full flex-col px-[1.25rem] py-[1rem]">
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(t.id);
            }}
            className={`todo-focus rounded text-left transition-colors ${WIKI_CARD_TITLE_HOVER}`}
          >
            {t.name}
          </button>
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <DifficultyTag difficulty={t.difficulty} />
          <LcTag brief={t.brief} />
          <WeekPill week={week} />
          <DoneMark lab="dsa" topicId={t.id} />
          {t.isCustom && <Tag>Custom</Tag>}
        </div>
        <p className="mt-2.5 text-[13px] font-semibold leading-relaxed mix-text-foreground/[0.78]">
          {hint || t.brief}
        </p>

        {t.subtopics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.subtopics.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSub(t.id, s.id);
                }}
                title={s.brief}
                className={`todo-focus ${tagClass('neutral', { interactive: true, wrap: true })}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TOPIC DETAIL
══════════════════════════════════════════════════════════════════════════ */
/** A page Previous / Next can go to: a topic or one of its subtopics. */
type NavItem = { id: string; label: string; topicId: string; type: 'topic' | 'subtopic' };

function TopicDetail({
  topic,
  subtopic,
  sections: baseSections,
  quiz,
  week,
  prevItem,
  nextItem,
  onGenerate,
  onGenerateWithContext,
  onNavigate,
  onAddGeneratedSubtopic,
}: {
  topic: DSATopic;
  subtopic: DSATopic['subtopics'][0] | null;
  sections: Record<string, SectionState>;
  quiz: ReturnType<typeof useLabQuiz>;
  week: number | null;
  prevItem: NavItem | null;
  nextItem: NavItem | null;
  onGenerate: (id: string) => void;
  onGenerateWithContext: (id: string, context: string, mode: ContextMode) => Promise<void>;
  onNavigate: (item: NavItem) => void;
  onAddGeneratedSubtopic: (topicId: string, generated: GeneratedSubtopic) => void;
}) {
  const { hint } = parseBrief(topic.brief);
  const name = subtopic?.name ?? topic.name;
  const desc = subtopic?.brief ?? hint ?? topic.brief;
  const labSettings = useLabSettings('dsa');
  const [promptModalSection, setPromptModalSection] = useState<
    (typeof SECTION_DEFS)[number] | null
  >(null);
  const [labSettingsModalOpen, setLabSettingsModalOpen] = useState(false);
  // The quiz isn't a template section: its state comes from the AI quiz, not from `sections`.
  const sections: Record<string, SectionState> = {
    ...baseSections,
    quiz: {
      generated: quiz.questions.length > 0,
      generating: quiz.generating && quiz.questions.length === 0,
      content: '',
      context: '',
      error: quiz.error,
    },
  };
  const genCount = Object.values(sections).filter((s) => s.generated).length;
  const navCard =
    'todo-focus group flex min-w-0 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-smooth hover:mix-border-primary/40';

  return (
    <div className="lab-container max-w-card space-y-[1.5rem]">
      {/* ── Header: a plain hairline card (the signature wash is the wiki hero's); meta chips, title and description, prerequisites, progress, actions ── */}
      <header className="rounded-lg border bg-card p-[1.25rem] sm:p-[1.5rem]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Tag tone="accent">{topic.category}</Tag>
          <DifficultyTag difficulty={topic.difficulty} />
          <LcTag brief={topic.brief} />
          <WeekPill week={week} />
          {subtopic && <Tag>Subtopic</Tag>}
          {topic.isCustom && <Tag>Custom</Tag>}
        </div>

        <h1 className="mt-3.5 text-xl font-semibold leading-snug tracking-tight text-foreground">
          {name}
        </h1>
        <p className="mt-1.5 text-sm font-semibold leading-relaxed mix-text-foreground/[0.78]">
          {desc}
        </p>

        {/* Prerequisites */}
        {topic.prerequisites.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium mix-text-foreground/[0.74]">Prereqs:</span>
            {topic.prerequisites.map((p) => (
              <Tag key={p}>{p}</Tag>
            ))}
          </div>
        )}

        {/* Progress: always there, so the card does not change height when the first section is written */}
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs font-medium text-muted-foreground">
            <span>Sections generated</span>
            <span className="font-semibold tabular-nums text-foreground">
              {genCount} / {SECTION_DEFS.length}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full mix-bg-foreground/10"
            role="progressbar"
            aria-label="Sections generated"
            aria-valuemin={0}
            aria-valuemax={SECTION_DEFS.length}
            aria-valuenow={genCount}
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${(genCount / SECTION_DEFS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-[1.25rem] flex flex-wrap items-start gap-2">
          <ProjectSelector />
          <button
            type="button"
            onClick={() => setLabSettingsModalOpen(true)}
            className="todo-btn todo-btn-secondary"
            title="DSA Lab Settings & Prompts"
          >
            <Icon name="AdjustmentsHorizontalIcon" size={14} className="text-primary" />
            <span>Lab Settings</span>
            {labSettings.hasAny && (
              <>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="sr-only">(customised)</span>
              </>
            )}
          </button>
          <div className="ml-auto">
            <CompleteButton lab="dsa" topicId={topic.id} subtopicId={subtopic?.id ?? ''} />
          </div>
        </div>
      </header>

      {/* ── Video-based lab content (from YouTube generator) ── */}
      {subtopic?.content && (
        <div className="lab-card p-4 sm:p-[1.25rem]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="dsa-caption text-muted-foreground">Video-based lab</p>
            {subtopic.sourceUrl && (
              <a
                href={subtopic.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="todo-focus flex items-center gap-1 rounded text-xs font-medium lab-ink hover:underline"
              >
                <Icon name="PlayCircleIcon" size={14} />
                Watch source video
              </a>
            )}
          </div>
          <MarkdownLite content={subtopic.content} />
        </div>
      )}

      {/* ── Content outline (quick-jump) ── */}
      <nav aria-labelledby="dsa-content-outline" className="lab-card-muted p-4 sm:p-[1.25rem]">
        <p id="dsa-content-outline" className="dsa-caption mb-3 text-muted-foreground">
          Content outline
        </p>
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(min(10rem,100%),1fr))] gap-1">
          {SECTION_DEFS.map((def) => {
            const s = sections[def.id];
            return (
              <li key={def.id}>
                <a
                  href={`#sec-${def.id}`}
                  onClick={jumpToAnchor}
                  title={def.label}
                  data-semantic={s?.generated ? 'done' : undefined}
                  className={`todo-focus flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs leading-snug transition-smooth ${s?.generated ? 'text-success mix-bg-success/10 hover:mix-bg-success/[0.16]' : 'text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.05]'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s?.generated ? 'bg-success' : s?.generating ? 'bg-primary motion-safe:animate-pulse' : 'mix-bg-muted-foreground/30'}`}
                  />
                  <span className="min-w-0 break-words leading-snug">{def.label}</span>
                  {s?.generated && <span className="sr-only">(generated)</span>}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Generate Questions ── */}
      <GenerateQuestionsPanel
        topicName={topic.name}
        subtopicName={subtopic?.name}
        labName="dsa"
        accentVar="--lab-accent"
        onAddSubtopic={(generated) => onAddGeneratedSubtopic(topic.id, generated)}
      />

      {/* ── On-demand sections ── */}
      <div className="space-y-4">
        {SECTION_DEFS.map((def, idx) => {
          const s = sections[def.id] ?? {
            generated: false,
            generating: false,
            content: '',
            context: '',
            error: null,
          };
          return (
            // scroll-mt clears the sticky Back bar (md and up) or the Topics bar (phones) when the outline jumps here
            <div key={def.id} id={`sec-${def.id}`} className="scroll-mt-[4.5rem]">
              <OnDemandSection
                sectionIndex={idx + 1}
                icon={def.icon}
                title={def.label}
                subtitle={def.subtitle}
                content={s.content}
                isGenerated={s.generated}
                isGenerating={s.generating}
                onGenerate={def.id === 'quiz' ? quiz.generateFirst : () => onGenerate(def.id)}
                onGenerateWithContext={
                  def.id === 'quiz'
                    ? undefined
                    : (context, mode) => onGenerateWithContext(def.id, context, mode)
                }
                onOpenPromptSettings={
                  def.id === 'quiz' ? undefined : () => setPromptModalSection(def)
                }
                savedContext={s.context}
                customised={labSettings.isCustomised(def.id)}
                allowEmptyRegenerate={
                  def.id !== 'quiz' && !!(def.guidance || DSA_DEFAULT_GUIDANCE[def.id])
                }
                projectSave={
                  def.id === 'quiz'
                    ? undefined
                    : sectionSaveInfo({
                        lab: 'dsa',
                        topic,
                        subtopic,
                        sectionId: def.id,
                        sectionLabel: def.label,
                        state: s,
                      })
                }
                renderContent={
                  def.id === 'approaches' ? (c) => <ApproachTabs content={c} /> : undefined
                }
                error={s.error}
              >
                {def.id === 'quiz' && s.generated ? (
                  <QuizCarousel
                    key={`${topic.id}|${subtopic?.id ?? ''}`}
                    questions={quiz.questions}
                    hasMore={true}
                    generateMore={quiz.generate}
                  />
                ) : undefined}
              </OnDemandSection>
            </div>
          );
        })}
      </div>

      {/* ── Mark as complete (again, at the end of the page) ── */}
      <div className="flex justify-center pt-2">
        <CompleteButton lab="dsa" topicId={topic.id} subtopicId={subtopic?.id ?? ''} size="lg" />
      </div>

      {/* ── Prev / Next navigation ── */}
      <nav
        aria-label="Previous and next page"
        className="flex items-stretch justify-between gap-3 border-t pt-[1.5rem]"
      >
        {prevItem ? (
          <button
            type="button"
            onClick={() => onNavigate(prevItem)}
            className={`${navCard} text-left`}
          >
            <Icon
              name="ArrowLeftIcon"
              size={16}
              className="flex-shrink-0 text-muted-foreground transition-colors group-hover:lab-ink"
            />
            <span className="min-w-0 flex-1">
              <span className="dsa-caption block text-muted-foreground">Previous</span>
              <span className="mt-0.5 block break-words text-sm font-medium leading-snug text-foreground">
                {prevItem.label}
              </span>
            </span>
          </button>
        ) : (
          <span className="flex-1" />
        )}
        {nextItem ? (
          <button
            type="button"
            onClick={() => onNavigate(nextItem)}
            className={`${navCard} justify-end text-right`}
          >
            <span className="min-w-0 flex-1">
              <span className="dsa-caption block text-muted-foreground">Next</span>
              <span className="mt-0.5 block break-words text-sm font-medium leading-snug text-foreground">
                {nextItem.label}
              </span>
            </span>
            <Icon
              name="ArrowRightIcon"
              size={16}
              className="flex-shrink-0 text-muted-foreground transition-colors group-hover:lab-ink"
            />
          </button>
        ) : (
          <span className="flex-1" />
        )}
      </nav>

      {promptModalSection && (
        <SectionPromptModal
          lab="dsa"
          section={promptModalSection}
          currentSettings={labSettings.get(promptModalSection.id)}
          labWideSettings={labSettings.labWide}
          currentTopic={{ name: topic.name, brief: desc, subtopicName: subtopic?.name }}
          isOpen={true}
          onClose={() => setPromptModalSection(null)}
          onSave={async (vals) => {
            await labSettings.save(promptModalSection.id, vals);
          }}
          onSaveAndGenerate={async (vals) => {
            await labSettings.save(promptModalSection.id, vals);
            await onGenerateWithContext(promptModalSection.id, vals.context || '', 'regenerate');
          }}
        />
      )}

      <LabSettingsModal
        lab="dsa"
        isOpen={labSettingsModalOpen}
        onClose={() => setLabSettingsModalOpen(false)}
        currentTopic={{ name: topic.name, brief: desc, subtopicName: subtopic?.name }}
      />
    </div>
  );
}
