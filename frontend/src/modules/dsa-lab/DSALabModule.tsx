'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import LabCopilot from '@/components/common/LabCopilot';
import { LabMobileBar, LabSheetBackdrop, useLabSheets } from '@/modules/common/lab/LabMobile';
import OnDemandSection from '@/components/lab/OnDemandSection';
import QuizCarousel from '@/components/lab/QuizCarousel';
import GenerateQuestionsPanel, { GeneratedSubtopic } from '@/modules/common/GenerateQuestionsPanel';
import MarkdownLite from '@/modules/common/lab/MarkdownLite';
import { useLabSections, type SectionState } from '@/modules/common/lab/useLabSections';
import { useLabQuiz } from '@/modules/common/lab/useLabQuiz';
import { buildPrerequisitesMarkdown } from './prerequisites';
import { useWeekPlan, type WeekPlanApi } from './useWeekPlan';
import WeekPlanView from './WeekPlanView';
import WeekPill from './WeekPill';
import { CompleteButton, DoneMark, LabProgressSummary } from '@/modules/common/lab/LabProgressUi';
import { LabSettingsButton, settingsSections } from '@/modules/common/lab/LabSettings';
import LabSettingsModal from '@/modules/common/lab/LabSettingsModal';
import ProjectSelector from '@/modules/common/lab/project/ProjectSelector';
import { sectionSaveInfo } from '@/modules/common/lab/project/sectionProject';
import SectionPromptModal from '@/modules/common/lab/SectionPromptModal';
import { useLabSettings } from '@/modules/common/lab/useLabSettings';
import { DSA_DEFAULT_GUIDANCE } from './sectionGuidance';
import ApproachTabs from './ApproachTabs';
import { useUrlState } from '@/lib/navigation/urlState';
import { LabBackBar, LabScreenLoading, jumpToAnchor, useLabNav, useScrollToTopOnChange } from '@/modules/common/lab/labNavigation';
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
  const lc   = brief.match(/LC\s+(#\d+)/)?.[1] ?? null;
  const hint = brief.replace(/LC\s+#\d+\s+\[.*?\]\s+[—–-]\s*/, '').trim();
  return { lc, hint };
}

function diffStyle(d: string): { badge: string; bar: string } {
  switch (d) {
    case 'Easy':        return { badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', bar: 'bg-emerald-500' };
    case 'Easy-Medium': return { badge: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',           bar: 'bg-teal-500'   };
    case 'Medium':      return { badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',       bar: 'bg-amber-500'  };
    case 'Medium-Hard': return { badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',  bar: 'bg-orange-500' };
    case 'Mixed':       return { badge: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',  bar: 'bg-indigo-500' };
    default:            return { badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',           bar: 'bg-rose-500'   };
  }
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
  { id: 'prerequisites',   label: 'Prerequisites',               icon: 'AcademicCapIcon',            subtitle: 'Specific Python, data-structure and algorithm skills to have first', guidance: PREREQUISITES_GUIDANCE },
  { id: 'theory',          label: 'Core Theory',                 icon: 'CalculatorIcon',             subtitle: 'Mathematical foundations + intuition'      },
  { id: 'approaches',      label: 'Approaches',                  icon: 'ArrowTrendingUpIcon',        subtitle: 'Brute force → optimal, and why each one gives way', aiGenerated: true, guidance: APPROACHES_GUIDANCE },
  { id: 'visual',          label: 'Visual Architecture',         icon: 'PhotoIcon',                  subtitle: 'Data flow diagrams + architecture'         },
  { id: 'implementation',  label: 'Practical Implementation',    icon: 'CodeBracketIcon',            subtitle: 'Python code, walkthrough, dry-run'         },
  { id: 'hyperparameters', label: 'Design Choices',              icon: 'AdjustmentsHorizontalIcon',  subtitle: 'Patterns, variants, time/space trade-offs' },
  { id: 'pitfalls',        label: 'Common Pitfalls',             icon: 'BugAntIcon',                 subtitle: 'Edge cases, mistakes, and gotchas'         },
  { id: 'applications',    label: 'Real-World Applications',     icon: 'BuildingOffice2Icon',        subtitle: 'Industry use cases + company examples'    },
  { id: 'interview',       label: 'Interview Questions',         icon: 'ChatBubbleLeftRightIcon',    subtitle: 'Conceptual + coding + pattern signals'    },
  { id: 'comparison',      label: 'Comparison w/ Alternatives',  icon: 'ScaleIcon',                  subtitle: 'Tradeoff table + when to use each'        },
  { id: 'paper',           label: 'Research Context',            icon: 'DocumentMagnifyingGlassIcon',subtitle: 'References, SOTA, known variants'          },
  { id: 'quiz',            label: 'Quiz',                        icon: 'TrophyIcon',                 subtitle: '4 questions, score tracked, generate more' },
  { id: 'references',      label: 'References & Resources',      icon: 'BookOpenIcon',               subtitle: 'NeetCode, LeetCode, Striver, GFG, MIT OCW' },
];

// The sections the lab settings dialog lists (each with its built-in instructions as the editable prompt).
const SETTINGS_SECTIONS = settingsSections(SECTION_DEFS, DSA_DEFAULT_GUIDANCE, {
  notes: { quiz: 'These instructions and your context are added to the requirements for each new batch of quiz questions.' },
});

/* ─────────────────────────────── content templates ─────────────────────── */
function getContent(sectionId: string, topic: DSATopic): string {
  const { lc, hint } = parseBrief(topic.brief);
  const n = topic.name;
  const subs = topic.subtopics.map(s => `- **${s.name}**: ${s.brief}`).join('\n');

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

  return templates[sectionId] ?? `**${n} — ${sectionId}**\n\nDetailed content for this section.\nPattern: ${hint}.`;
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function DSALabInteractive() {
  const [topics,          setTopics]          = useState<DSATopic[]>([]);
  const [topicsReady,     setTopicsReady]     = useState(false);
  const [sectionsData,    setSectionsData]    = useState<{ id: number; labName: string; name: string; isCustom: boolean }[]>([]);
  // The open screen lives in the URL (?topic=&sub=), see labNavigation.tsx.
  const nav = useLabNav(topics, topicsReady);
  const selectedTopicId = nav.topicId;
  const selectedSubId   = nav.subId;
  const [expandedSecs,    setExpandedSecs]    = useState<Set<string>>(new Set());
  const [expandedTopics,  setExpandedTopics]  = useState<Set<string>>(() => new Set(nav.topicParam ? [nav.topicParam] : []));

  // add-section
  const [showAddSec,    setShowAddSec]    = useState(false);
  const [newSecInput,   setNewSecInput]   = useState('');
  const [addingSec,     setAddingSec]     = useState(false);
  // add-topic
  const [addingTopicTo, setAddingTopicTo] = useState<string | null>(null);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [addingTopic,   setAddingTopic]   = useState(false);
  // add-subtopic
  const [addingSubTo,   setAddingSubTo]   = useState<string | null>(null);
  const [newSubInput,   setNewSubInput]   = useState('');
  const [leftOpen,      setLeftOpen]      = useState(true);
  const [rightOpen,     setRightOpen]     = useState(true);
  const lab = useLabSheets(`${selectedTopicId}|${selectedSubId}`);
  const leftExpanded = leftOpen || lab.isMobile;
  const rightExpanded = rightOpen || lab.isMobile;
  const collapseLeft = () => (lab.isMobile ? lab.close() : setLeftOpen(false));
  const collapseRight = () => (lab.isMobile ? lab.close() : setRightOpen(false));
  const [recentTopics,  setRecentTopics]  = useState<{ id: string; name: string; subId?: string; subName?: string }[]>([]);

  const mainRef = useRef<HTMLElement>(null);

  /* ── fetch ── */
  useEffect(() => {
    apiFetch('/dsa/sections')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { id: number; labName: string; name: string; isCustom: boolean }[]) => {
        setSectionsData(data);
        setExpandedSecs(new Set(data.map(s => s.name)));
      })
      .catch(e => console.error('sections:', e));

    apiFetch('/dsa/topics')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: DSATopic[]) => { if (data?.length) { setTopics(data); } else { setTopics(STATIC_DSA_TOPICS); } setTopicsReady(true); })
      .catch(e => { console.error('topics:', e); setTopics(STATIC_DSA_TOPICS); setTopicsReady(true); });
  }, []);

  // Restore the "Recent" chips on mount. Which screen is open is not stored here any more: it lives in the URL.
  useEffect(() => {
    const savedRecent = localStorage.getItem('dsa-lab-recent-topics');
    if (savedRecent) try { setRecentTopics(JSON.parse(savedRecent)); } catch {}
  }, []);

  // A different screen opened (also via Back/Forward): the content pane starts at its top.
  useScrollToTopOnChange(mainRef, `${selectedTopicId}|${selectedSubId ?? ''}`);

  /* ── derived ── */
  const allSecNames = Array.from(new Set([
    ...sectionsData.map(s => s.name),
    ...topics.map(t => t.category),
  ]));
  const grouped = allSecNames.map(name => ({ name, topics: topics.filter(t => t.category === name) }));

  const currentTopic = topics.find(t => t.id === selectedTopicId) ?? null;
  const currentSub   = currentTopic?.subtopics.find(s => s.id === selectedSubId) ?? null;
  const { sections, generate: generateSection, generateWithContext } = useLabSections({
    lab: 'dsa', topic: currentTopic, subtopic: currentSub, sectionDefs: SECTION_DEFS,
    getDefaultContent: id => (currentTopic ? getContent(id, currentTopic) : ''),
    defaultGuidance: DSA_DEFAULT_GUIDANCE,
  });
  const quiz = useLabQuiz({
    lab: 'dsa', topic: currentTopic, subtopic: currentSub,
    category: currentTopic?.category ?? '',
    defaultGuidance: DSA_DEFAULT_GUIDANCE.quiz,
    prerequisites: currentTopic?.prerequisites ?? [],
    // the other problems in the same pattern family: what the quiz can compare this one against
    relatedTopics: currentTopic
      ? topics.filter(t => t.category === currentTopic.category && t.id !== currentTopic.id).map(t => t.name).slice(0, 8)
      : [],
  });
  const weekPlan = useWeekPlan(topics);
  const contextLabel = selectedTopicId === 'wiki' ? 'Wiki Index' : (currentSub?.name ?? currentTopic?.name ?? 'DSA Lab');

  const flatItems = [
    { id: 'wiki', type: 'topic' as const, topicId: 'wiki', label: 'Wiki Index' },
    ...topics.flatMap(t => [
      { id: t.id, type: 'topic' as const, topicId: t.id, label: t.name },
      ...t.subtopics.map(s => ({ id: s.id, type: 'subtopic' as const, topicId: t.id, label: s.name })),
    ]),
  ];
  const activeId   = selectedSubId ?? selectedTopicId;
  const curIdx     = flatItems.findIndex(x => x.id === activeId);
  const prevItem   = curIdx > 0 ? flatItems[curIdx - 1] : null;
  const nextItem   = curIdx >= 0 && curIdx < flatItems.length - 1 ? flatItems[curIdx + 1] : null;

  /* ── actions ── */
  // Scrolling the content pane back to the top is done by useScrollToTopOnChange when the screen changes
  // (a smooth scroll started here would still be running when the new screen appears).

  const addToRecent = (topicId: string, topicName: string, subId?: string, subName?: string) => {
    const key = subId ?? topicId;
    setRecentTopics(prev => {
      const filtered = prev.filter(r => (r.subId ?? r.id) !== key);
      const next = [{ id: topicId, name: topicName, subId, subName }, ...filtered].slice(0, 10);
      localStorage.setItem('dsa-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const removeRecentTopic = (key: string) => {
    setRecentTopics(prev => {
      const next = prev.filter(r => (r.subId ?? r.id) !== key);
      localStorage.setItem('dsa-lab-recent-topics', JSON.stringify(next));
      return next;
    });
  };

  const selectTopic = (id: string) => {
    nav.openTopic(id);
    if (id !== 'wiki') {
      setExpandedTopics(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
      const t = topics.find(tt => tt.id === id);
      if (t) addToRecent(id, t.name);
    }
  };

  const selectSub = (topicId: string, subId: string) => {
    nav.openSub(topicId, subId);
    setExpandedTopics(prev => new Set([...prev, topicId]));
    const t = topics.find(tt => tt.id === topicId);
    const s = t?.subtopics.find(ss => ss.id === subId);
    if (t && s) addToRecent(topicId, t.name, subId, s.name);
  };

  const navigateTo = (item: typeof flatItems[0]) => {
    if (item.type === 'subtopic') nav.openSub(item.topicId, item.id);
    else nav.openTopic(item.topicId);
    setExpandedTopics(prev => new Set([...prev, item.topicId]));
  };

  const handleAddSection = () => {
    if (!newSecInput.trim()) return;
    setAddingSec(true);
    const name = newSecInput.trim();
    apiFetch('/dsa/sections', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isCustom: true }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => {
        setSectionsData(prev => [...prev, { id: Date.now(), labName: 'dsa', name, isCustom: true }]);
        setExpandedSecs(prev => new Set([...prev, name]));
        setNewSecInput(''); setShowAddSec(false);
      })
      .catch(e => console.error('addSec:', e))
      .finally(() => setAddingSec(false));
  };

  const handleAddTopic = (sectionName: string) => {
    if (!newTopicInput.trim()) return;
    setAddingTopic(true);
    const newTopic: DSATopic = {
      id: `custom-${Date.now()}`, name: newTopicInput.trim(),
      brief: 'Custom topic.', category: sectionName,
      difficulty: 'Medium', prerequisites: [], subtopics: [], isCustom: true,
    };
    apiFetch('/dsa/topics', {
      method: 'POST',
      body: JSON.stringify(newTopic),
    }).then(r => { if (!r.ok) console.error('addTopic: HTTP', r.status); }).catch(e => console.error('addTopic:', e)).finally(() => {
      setTopics(prev => [...prev, newTopic]);
      setNewTopicInput(''); setAddingTopicTo(null); setAddingTopic(false);
    });
  };

  const handleAddSub = (topicId: string) => {
    if (!newSubInput.trim()) return;
    const parent = topics.find(t => t.id === topicId);
    if (!parent) return;
    const newSub = { id: `sub-${Date.now()}`, name: newSubInput.trim(), brief: 'Custom subtopic.' };
    const updated = { ...parent, subtopics: [...parent.subtopics, newSub] };
    apiFetch('/dsa/topics', {
      method: 'POST',
      body: JSON.stringify(updated),
    }).then(r => { if (!r.ok) console.error('addSub: HTTP', r.status); }).catch(e => console.error('addSub:', e));
    setTopics(prev => prev.map(t => t.id === topicId ? updated : t));
    setNewSubInput(''); setAddingSubTo(null);
    setExpandedTopics(prev => new Set([...prev, topicId]));
  };

  const handleAddGeneratedSubtopic = (topicId: string, generated: GeneratedSubtopic) => {
    const parent = topics.find(t => t.id === topicId);
    if (!parent) return;
    const updated = { ...parent, subtopics: [...parent.subtopics, generated] };
    apiFetch('/dsa/topics', {
      method: 'POST',
      body: JSON.stringify(updated),
    }).then(r => { if (!r.ok) console.error('addGeneratedSub: HTTP', r.status); }).catch(e => console.error('addGeneratedSub:', e));
    setTopics(prev => prev.map(t => t.id === topicId ? updated : t));
    setExpandedTopics(prev => new Set([...prev, topicId]));
  };

  /* ── render ── */
  return (
    <div className="lab-shell flex flex-col">
      <div className="lab-workspace flex">
        {lab.isMobile && lab.sheet && <LabSheetBackdrop onClose={lab.close} />}

        {/* ═══════════════════════ LEFT SIDEBAR ═══════════════════════════ */}
        <aside data-sheet={lab.sheet === 'left' ? 'open' : 'closed'} inert={lab.isMobile && lab.sheet !== 'left' ? true : undefined} className="lab-sidebar border-r flex flex-col overflow-hidden" style={{ width: leftExpanded ? 264 : 48, minWidth: leftExpanded ? 264 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}>

          {/* Header */}
          <div className="flex-shrink-0 border-b border-border">
            <div className="flex items-center gap-2.5 px-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/20">
                <Icon name="CodeBracketIcon" size={15} className="text-white" />
              </div>
              {leftExpanded && (
                <>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-foreground tracking-tight">DSA Lab</h2>
                    <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{topics.length} topics · {allSecNames.length} patterns</p>
                  </div>
                  <LabSettingsButton lab="dsa" labName="DSA Lab" sections={SETTINGS_SECTIONS} />
                  <button onClick={() => collapseLeft()} className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Collapse sidebar">
                    <Icon name="ChevronLeftIcon" size={14} />
                  </button>
                </>
              )}
            </div>
            {leftExpanded && (
              <div className="px-3 pb-3">
                {showAddSec ? (
                  <div className="flex gap-1.5">
                    <input autoFocus value={newSecInput} onChange={e => setNewSecInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setShowAddSec(false); setNewSecInput(''); } }}
                      placeholder="New pattern / section…"
                      className="flex-1 min-w-0 bg-input border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
                    <button onClick={handleAddSection} disabled={addingSec || !newSecInput.trim()}
                      className="px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all disabled:opacity-50">
                      {addingSec ? '…' : 'Add'}
                    </button>
                    <button onClick={() => { setShowAddSec(false); setNewSecInput(''); }}
                      className="px-2 py-1.5 text-muted-foreground hover:text-foreground text-xs rounded-lg hover:bg-muted transition-all">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setShowAddSec(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all group">
                    <Icon name="PlusIcon" size={11} className="group-hover:text-primary transition-colors" />
                    Add pattern / section
                  </button>
                )}
              </div>
            )}
          </div>
          {!leftExpanded && (
            <div className="flex justify-center py-1.5">
              <button onClick={() => setLeftOpen(true)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Expand sidebar">
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          )}

          {leftExpanded && (
          <div className="flex-1 overflow-y-auto py-2 scrollbar-clean">

            {/* Wiki Index */}
            <button onClick={() => selectTopic('wiki')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-xl text-xs font-semibold transition-all my-0.5 ${selectedTopicId === 'wiki' ? 'bg-[var(--lab-dsa-soft)] text-[var(--lab-dsa)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}
              style={{ width: 'calc(100% - 8px)' }}>
              <Icon name="BookOpenIcon" size={13} className={selectedTopicId === 'wiki' ? 'text-blue-400' : ''} />
              <span className="flex-1 text-left">Wiki Index</span>
              {selectedTopicId === 'wiki' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--lab-dsa)] flex-shrink-0" />}
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
                        onClick={() => r.subId ? selectSub(r.id, r.subId) : selectTopic(r.id)}
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
            {grouped.map(section => {
              const isExp = expandedSecs.has(section.name);
              return (
                <div key={section.name} className="mb-0.5">
                  {/* Section row */}
                  <div className="flex items-center gap-1 px-2 py-1.5 mx-1 cursor-pointer group hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setExpandedSecs(prev => { const n = new Set(prev); n.has(section.name) ? n.delete(section.name) : n.add(section.name); return n; })}>
                    <Icon name={isExp ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={10} className="text-muted-foreground/60 flex-shrink-0 transition-transform duration-150" />
                    <span className="flex-1 text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest truncate ml-0.5">
                      {section.name}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {section.topics.length}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setAddingTopicTo(addingTopicTo === section.name ? null : section.name); setNewTopicInput(''); }}
                      className="p-0.5 rounded-md text-muted-foreground/40 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-0.5"
                      title="Add topic to this pattern">
                      <Icon name="PlusIcon" size={9} />
                    </button>
                  </div>

                  {/* Add topic inline */}
                  {addingTopicTo === section.name && (
                    <div className="mx-3 mb-1 flex gap-1">
                      <input autoFocus value={newTopicInput} onChange={e => setNewTopicInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddTopic(section.name); if (e.key === 'Escape') setAddingTopicTo(null); }}
                        placeholder="Topic name…"
                        className="flex-1 min-w-0 bg-input border border-border rounded-md px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/50" />
                      <button onClick={() => handleAddTopic(section.name)} disabled={addingTopic || !newTopicInput.trim()}
                        className="px-1.5 py-1 bg-primary/20 text-primary rounded-md text-[11px] hover:bg-primary/30 disabled:opacity-40 transition-all">✓</button>
                    </div>
                  )}

                  {/* Topics */}
                  {isExp && (
                    <div className="space-y-px pb-1">
                      {section.topics.map((topic, ti) => {
                        const { lc } = parseBrief(topic.brief);
                        const ds = diffStyle(topic.difficulty);
                        const isActive = selectedTopicId === topic.id && !selectedSubId;
                        const isTopExp = expandedTopics.has(topic.id);

                        return (
                          <div key={topic.id}>
                            {/* Topic row */}
                            <div className="flex items-start mx-1">
                              <button onClick={() => selectTopic(topic.id)}
                                className={`flex-1 min-w-0 flex items-start gap-2 px-2.5 py-2 rounded-xl text-left transition-all ${isActive ? 'bg-[var(--lab-dsa-soft)] shadow-sm' : 'hover:bg-muted/50'}`}>
                                <span className={`flex-shrink-0 text-[9px] mt-0.5 w-4 text-right leading-none ${isActive ? 'text-blue-400/80' : 'text-muted-foreground/30'}`}>
                                  {ti + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className={`block text-[12px] font-medium leading-tight truncate ${isActive ? 'text-[var(--lab-dsa)]' : 'text-foreground/90'}`}>
                                    {topic.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {lc && <span className="text-[9px] text-muted-foreground/50 leading-none">{lc}</span>}
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md border font-bold leading-none ${ds.badge}`}>{topic.difficulty}</span>
                                    <WeekPill week={weekPlan.weekOf(topic.id)} className="!text-[8px]" />
                                    <DoneMark lab="dsa" topicId={topic.id} />
                                    {topic.isCustom && <span className="text-[8px] text-amber-500/80">custom</span>}
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
                                  const isSubAct = selectedSubId === sub.id;
                                  return (
                                    <button key={sub.id} onClick={() => selectSub(topic.id, sub.id)}
                                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] leading-tight transition-all ${isSubAct ? 'bg-[var(--lab-dsa-soft)] text-[var(--lab-dsa)]' : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'}`}>
                                      <span className={`text-[8px] mr-1.5 ${isSubAct ? 'text-[var(--lab-dsa)]' : 'text-muted-foreground/30'}`}>
                                        {(idx + 1).toString().padStart(2, '0')}
                                      </span>
                                      <span className="truncate">{sub.name}</span>
                                      <DoneMark lab="dsa" topicId={topic.id} subtopicId={sub.id} className="ml-1.5 align-middle" />
                                    </button>
                                  );
                                })}
                                {/* Add subtopic */}
                                {addingSubTo === topic.id ? (
                                  <div className="flex gap-1 mt-1">
                                    <input autoFocus value={newSubInput} onChange={e => setNewSubInput(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleAddSub(topic.id); if (e.key === 'Escape') setAddingSubTo(null); }}
                                      placeholder="Subtopic…"
                                      className="flex-1 min-w-0 bg-input border border-border rounded-md px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-violet-500/40 placeholder:text-muted-foreground/50" />
                                    <button onClick={() => handleAddSub(topic.id)}
                                      className="px-1.5 py-1 bg-violet-500/20 text-violet-400 rounded-md text-[10px] hover:bg-violet-500/30 transition-all">✓</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setAddingSubTo(topic.id)}
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

        {/* ═══════════════════════ CENTER PANEL ═══════════════════════════ */}
        <main ref={mainRef} className="lab-main scrollbar-clean">
          {lab.isMobile && <LabMobileBar title={contextLabel} onTopics={lab.openTopics} onCopilot={lab.openCopilot} />}
          {/* Back to the parent screen: a topic goes back to the Wiki Index, a subtopic to its topic */}
          {selectedTopicId !== 'wiki' && currentTopic && (
            <LabBackBar
              href={currentSub ? nav.topicHref : nav.wikiHref}
              parentName={currentSub ? currentTopic.name : 'Wiki Index'}
              currentName={currentSub ? currentSub.name : currentTopic.name}
            />
          )}
          {nav.pending ? (
            <LabScreenLoading />
          ) : selectedTopicId === 'wiki' ? (
            <WikiIndex grouped={grouped} topics={topics} weekPlan={weekPlan} onSelectTopic={selectTopic} onSelectSub={selectSub} />
          ) : !currentTopic ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon name="CodeBracketIcon" size={28} className="text-primary/40" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Select a Topic</h2>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Choose a topic from the sidebar. Sections generate on-demand — click ✨ to load any section.
              </p>
            </div>
          ) : (
            <TopicDetail
              topic={currentTopic} subtopic={currentSub}
              sections={sections} quiz={quiz} week={weekPlan.weekOf(currentTopic.id)}
              prevItem={prevItem} nextItem={nextItem}
              onGenerate={generateSection}
              onGenerateWithContext={generateWithContext}
              onNavigate={navigateTo}
              onAddGeneratedSubtopic={handleAddGeneratedSubtopic}
            />
          )}
        </main>

        {/* ═══════════════════════ RIGHT COPILOT ══════════════════════════ */}
        <aside data-sheet={lab.sheet === 'right' ? 'open' : 'closed'} inert={lab.isMobile && lab.sheet !== 'right' ? true : undefined} className="lab-copilot border-l flex flex-col overflow-hidden" style={{ width: rightExpanded ? 300 : 48, minWidth: rightExpanded ? 300 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}>
          {rightExpanded ? (
            <LabCopilot context={contextLabel} labType="dsa" onCollapse={() => collapseRight()} />
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

/* ══════════════════════════════════════════════════════════════════════════
   WIKI INDEX
══════════════════════════════════════════════════════════════════════════ */
function WikiIndex({
  grouped, topics, weekPlan, onSelectTopic, onSelectSub,
}: {
  grouped: { name: string; topics: DSATopic[] }[];
  topics: DSATopic[];
  weekPlan: WeekPlanApi;
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
}) {
  // ?view=week shows the week-by-week plan; no param is the pattern-wise handbook.
  const { get: getParam, update: updateUrl } = useUrlState();
  const view = getParam('view') === 'week' ? 'week' : 'pattern';
  const totalSubs   = topics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount   = topics.filter(t => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard').length;
  const easyCount   = topics.filter(t => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium').length;

  return (
    <div className="lab-container space-y-10">

      {/* ── Hero banner ── */}
      <div className="lab-hero p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.18),transparent_60%)] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Icon name="BookOpenIcon" size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">DSA Lab Wiki</h1>
              <p className="text-sm text-muted-foreground">Pattern-wise interview preparation handbook</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Patterns',  value: grouped.length,    color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-500/10'    },
              { label: 'Topics',    value: topics.length,     color: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-500/10'  },
              { label: 'Subtopics', value: totalSubs,         color: 'text-cyan-600 dark:text-cyan-400',    bg: 'bg-cyan-500/10'    },
              { label: 'Hard',      value: hardCount,         color: 'text-rose-600 dark:text-rose-400',    bg: 'bg-rose-500/10'    },
              { label: 'Easy',      value: easyCount,         color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
            ].map(stat => (
              <div key={stat.label} className={`${stat.bg} border border-border rounded-xl px-4 py-2.5 backdrop-blur-sm min-w-[64px]`}>
                <div className={`text-2xl font-bold ${stat.color} leading-none`}>{stat.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <LabProgressSummary lab="dsa" topicIds={topics.map(t => t.id)} noun="questions" />

      {/* ── View switch: by pattern / by week ── */}
      <div role="tablist" aria-label="Wiki view" className="flex items-center gap-2">
        {(['pattern', 'week'] as const).map(v => (
          <button key={v} type="button" role="tab" aria-selected={view === v}
            onClick={() => updateUrl({ view: v === 'week' ? 'week' : null }, 'replace')}
            className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-colors ${view === v ? 'border-primary text-primary mix-bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
            {v === 'week' ? 'By week' : 'By pattern'}
          </button>
        ))}
      </div>

      {view === 'week' ? (
        <WeekPlanView topics={topics} weekPlan={weekPlan} onOpen={onSelectTopic} />
      ) : (<>
      {/* ── Clickable Pattern Index ── */}
      <div className="lab-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <Icon name="ListBulletIcon" size={14} className="text-muted-foreground" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">Pattern Index</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{grouped.length} patterns</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-0.5">
            {grouped.map((section, i) => (
              <a key={section.name}
                href={`#pattern-${section.name.replace(/[\s&/()]/g, '-')}`} onClick={jumpToAnchor}
                className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all group">
                <span className="text-[9px] text-muted-foreground/30 w-4 text-right flex-shrink-0">{i + 1}</span>
                <span className="flex-1 truncate group-hover:text-blue-400 transition-colors">{section.name}</span>
                <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{section.topics.length}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Per-pattern topic cards ── */}
      {grouped.map(section => (
        <div key={section.name} id={`pattern-${section.name.replace(/[\s&/()]/g, '-')}`} className="space-y-3 scroll-mt-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-foreground whitespace-nowrap">{section.name}</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-border via-border/50 to-transparent" />
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{section.topics.length} topics</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-6">
            {section.topics.map(t => {
              const { lc, hint } = parseBrief(t.brief);
              const ds = diffStyle(t.difficulty);
              return (
                <div key={t.id}
                    className={`display-card group relative overflow-hidden cursor-pointer h-full`}
                  onClick={() => onSelectTopic(t.id)}>
                  {/* Diff accent */}
                  <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${ds.bar} opacity-40 group-hover:opacity-80 transition-opacity rounded-l-xl`} />
                  <div className="pl-4 pr-4 pt-3.5 pb-3">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-[var(--wiki-dsa-hover)] dark:group-hover:text-[var(--wiki-dsa-hover)] transition-colors leading-snug flex-1 min-w-0">
                        {t.name}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {lc && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border">{lc}</span>
                        )}
                        <WeekPill week={weekPlan.weekOf(t.id)} />
                        <DoneMark lab="dsa" topicId={t.id} />
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-bold leading-none ${ds.badge}`}>{t.difficulty}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">{hint || t.brief}</p>

                    {t.subtopics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {t.subtopics.map(s => (
                          <button key={s.id}
                            onClick={e => { e.stopPropagation(); onSelectSub(t.id, s.id); }}
                            title={s.brief}
                            className="text-[9px] px-2 py-1 rounded-md bg-muted/80 text-muted-foreground hover:bg-blue-500/15 hover:text-blue-400 transition-all border border-transparent hover:border-blue-500/20 leading-none">
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
      </>)}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TOPIC DETAIL
══════════════════════════════════════════════════════════════════════════ */
function TopicDetail({
  topic, subtopic, sections: baseSections, quiz, week, prevItem, nextItem,
  onGenerate, onGenerateWithContext, onNavigate, onAddGeneratedSubtopic,
}: {
  topic: DSATopic;
  subtopic: DSATopic['subtopics'][0] | null;
  sections: Record<string, SectionState>;
  quiz: ReturnType<typeof useLabQuiz>;
  week: number | null;
  prevItem: { id: string; label: string; topicId: string; type: 'topic' | 'subtopic' } | null;
  nextItem: { id: string; label: string; topicId: string; type: 'topic' | 'subtopic' } | null;
  onGenerate: (id: string) => void;
  onGenerateWithContext: (id: string, context: string, mode: ContextMode) => Promise<void>;
  onNavigate: (item: any) => void;
  onAddGeneratedSubtopic: (topicId: string, generated: GeneratedSubtopic) => void;
}) {
  const { lc, hint } = parseBrief(topic.brief);
  const ds = diffStyle(topic.difficulty);
  const name = subtopic?.name ?? topic.name;
  const desc = subtopic?.brief ?? hint ?? topic.brief;
  const labSettings = useLabSettings('dsa');
  const [promptModalSection, setPromptModalSection] = useState<any | null>(null);
  const [labSettingsModalOpen, setLabSettingsModalOpen] = useState(false);
  // The quiz isn't a template section: its state comes from the AI quiz, not from `sections`.
  const sections: Record<string, SectionState> = {
    ...baseSections,
    quiz: { generated: quiz.questions.length > 0, generating: quiz.generating && quiz.questions.length === 0, content: '', context: '', error: quiz.error },
  };
  const genCount = Object.values(sections).filter(s => s.generated).length;

  return (
    <div className="lab-container max-w-card space-y-5">

      {/* ── Header card ── */}
      <div className="lab-hero">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(99,102,241,0.07),transparent_55%)] pointer-events-none" />
        <div className="relative">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium leading-none">
              {topic.category}
            </span>
            <WeekPill week={week} />
            {lc && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-muted text-muted-foreground border border-border leading-none">
                LeetCode {lc}
              </span>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold leading-none ${ds.badge}`}>
              {topic.difficulty}
            </span>
            {subtopic && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 leading-none">
                Subtopic
              </span>
            )}
            {topic.isCustom && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none">
                Custom
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <ProjectSelector />
              <button
                type="button"
                onClick={() => setLabSettingsModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card/80 text-xs font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-all shadow-sm"
                title="DSA Lab Settings & Prompts"
              >
                <Icon name="AdjustmentsHorizontalIcon" size={13} className="text-primary" />
                <span>Lab Settings</span>
                {labSettings.hasAny && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
              <CompleteButton lab="dsa" topicId={topic.id} subtopicId={subtopic?.id ?? ''} />
            </div>
          </div>

          <h1 className="text-xl font-bold text-foreground mb-2 leading-snug tracking-tight">{name}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>

          {/* Prerequisites */}
          {topic.prerequisites.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground font-medium">Prereqs:</span>
              {topic.prerequisites.map(p => (
                <span key={p} className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">{p}</span>
              ))}
            </div>
          )}

          {/* Progress */}
          {genCount > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Sections generated</span>
                <span className="font-medium text-foreground/80">{genCount} / {SECTION_DEFS.length}</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${(genCount / SECTION_DEFS.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Video-based lab content (from YouTube generator) ── */}
      {subtopic?.content && (
        <div className="lab-card border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Video-based Lab</p>
            {subtopic.sourceUrl && (
              <a href={subtopic.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline">
                <Icon name="PlayCircleIcon" size={12} />
                Watch source video
              </a>
            )}
          </div>
          <MarkdownLite content={subtopic.content} />
        </div>
      )}

      {/* ── Content outline (quick-jump) ── */}
      <div className="lab-card-muted p-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Content Outline</p>
        <div className="grid grid-cols-3 gap-1">
          {SECTION_DEFS.map(def => {
            const s = sections[def.id];
            return (
              <a key={def.id} href={`#sec-${def.id}`} onClick={jumpToAnchor}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] transition-all leading-tight ${s?.generated ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s?.generated ? 'bg-emerald-400' : s?.generating ? 'bg-blue-400 animate-pulse' : 'bg-muted-foreground/20'}`} />
                <span className="truncate">{def.label}</span>
              </a>
            );
          })}
        </div>
      </div>

      {/* ── Generate Questions ── */}
      <GenerateQuestionsPanel
        topicName={topic.name}
        subtopicName={subtopic?.name}
        labName="dsa"
        accentVar="--lab-dsa"
        onAddSubtopic={generated => onAddGeneratedSubtopic(topic.id, generated)}
      />

      {/* ── On-demand sections ── */}
      <div className="space-y-4">
        {SECTION_DEFS.map((def, idx) => {
          const s = sections[def.id] ?? { generated: false, generating: false, content: '', context: '', error: null };
          return (
            <div key={def.id} id={`sec-${def.id}`} className="scroll-mt-4">
              <OnDemandSection
                sectionIndex={idx + 1} icon={def.icon} title={def.label} subtitle={def.subtitle}
                content={s.content} isGenerated={s.generated} isGenerating={s.generating}
                onGenerate={def.id === 'quiz' ? quiz.generateFirst : () => onGenerate(def.id)}
                onGenerateWithContext={def.id === 'quiz' ? undefined : (context, mode) => onGenerateWithContext(def.id, context, mode)}
                onOpenPromptSettings={def.id === 'quiz' ? undefined : () => setPromptModalSection(def)}
                savedContext={s.context}
                customised={labSettings.isCustomised(def.id)}
                allowEmptyRegenerate={def.id !== 'quiz' && !!(def.guidance || DSA_DEFAULT_GUIDANCE[def.id])}
                projectSave={def.id === 'quiz' ? undefined : sectionSaveInfo({ lab: 'dsa', topic, subtopic, sectionId: def.id, sectionLabel: def.label, state: s })}
                renderContent={def.id === 'approaches' ? c => <ApproachTabs content={c} /> : undefined}
                error={s.error}>
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
      <div className="flex items-stretch justify-between pt-6 border-t border-border gap-3">
        <button disabled={!prevItem} onClick={() => prevItem && onNavigate(prevItem)}
          className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card text-sm text-foreground hover:bg-muted hover:border-blue-500/25 transition-all disabled:opacity-25 disabled:pointer-events-none group text-left">
          <Icon name="ArrowLeftIcon" size={14} className="flex-shrink-0 text-muted-foreground group-hover:text-blue-400 transition-colors" />
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Previous</span>
            <span className="block text-xs font-medium truncate">{prevItem?.label ?? ''}</span>
          </span>
        </button>
        <button disabled={!nextItem} onClick={() => nextItem && onNavigate(nextItem)}
          className="flex-1 flex items-center justify-end gap-3 px-4 py-3 rounded-xl border border-border bg-card text-sm text-foreground hover:bg-muted hover:border-blue-500/25 transition-all disabled:opacity-25 disabled:pointer-events-none group text-right">
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Next</span>
            <span className="block text-xs font-medium truncate">{nextItem?.label ?? ''}</span>
          </span>
          <Icon name="ArrowRightIcon" size={14} className="flex-shrink-0 text-muted-foreground group-hover:text-blue-400 transition-colors" />
        </button>
      </div>

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
