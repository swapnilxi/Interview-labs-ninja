'use client';

/**
 * The page of a topic lab (Communication, Finance, Python): the CV Lab's layout — topic tree, wiki index, topic
 * page with on-demand sections, copilot — driven by a TopicLabConfig (topicLabTypes.ts) instead of being copied
 * per lab. Differences from the CV page:
 * - topics come from the server only (`${apiPrefix}/topics`, seeded from the lab's topics.json), with a loading and
 *   an error state instead of a built-in fallback list;
 * - every section but Prerequisites (a template) is written by the AI, and the Quiz is the AI quiz (useLabQuiz);
 * - sidebar categories start collapsed; the open topic's category expands itself;
 * - a failed save is reported instead of being kept only in the page.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import Icon from '@/components/ui/AppIcon';
import LabCopilot, { LabCopilotRail } from '@/components/common/LabCopilot';
import OnDemandSection from '@/components/lab/OnDemandSection';
import QuizCarousel from '@/components/lab/QuizCarousel';
import { apiFetch } from '@/lib/http/apiClient';
import GenerateQuestionsPanel, {
  type GeneratedSubtopic,
} from '@/modules/common/GenerateQuestionsPanel';
import LabGuideModal from '@/modules/common/lab/LabGuideModal';
import {
  LabMobileBar,
  LabSheetBackdrop,
  useLabPanes,
  useLabSheets,
} from '@/modules/common/lab/LabMobile';
import { CompleteButton, DoneMark, LabProgressSummary } from '@/modules/common/lab/LabProgressUi';
import { LabSettingsButton, settingsSections } from '@/modules/common/lab/LabSettings';
import LabSettingsModal from '@/modules/common/lab/LabSettingsModal';
import {
  LAB_REVEAL,
  LabAddRow,
  LabInlineAdd,
  LabRecentList,
  LabSidebarHeader,
} from '@/modules/common/lab/LabSidebarParts';
import { DifficultyTag, difficultyDotClass } from '@/modules/common/lab/LabTags';
import MarkdownLite from '@/modules/common/lab/MarkdownLite';
import SectionPromptModal from '@/modules/common/lab/SectionPromptModal';
import {
  LAB_CHIP,
  LAB_CHIP_ACCENT,
  WIKI_CARD,
  WIKI_CARD_TITLE_HOVER,
  WIKI_CHIP,
  WikiHero,
  WikiIndexNav,
  WikiSectionHeading,
} from '@/modules/common/lab/WikiParts';
import {
  LabBackBar,
  LabScreenLoading,
  jumpToAnchor,
  useLabNav,
  useScrollToTopOnChange,
} from '@/modules/common/lab/labNavigation';
import type { SectionDef } from '@/modules/common/lab/labSectionDefaults';
import { prereqMarkdown } from '@/modules/common/lab/prereqMarkdown';
import ProjectSelector from '@/modules/common/lab/project/ProjectSelector';
import { sectionSaveInfo } from '@/modules/common/lab/project/sectionProject';
import type { TopicLabConfig, TopicLabTopic } from '@/modules/common/lab/topicLabTypes';
import { useLabQuiz } from '@/modules/common/lab/useLabQuiz';
import { useLabSections, type SectionState } from '@/modules/common/lab/useLabSections';
import { useLabSettings } from '@/modules/common/lab/useLabSettings';

interface LabSectionRow {
  id: number;
  labName: string;
  name: string;
  isCustom: boolean;
}

type Recent = { id: string; name: string; subId?: string; subName?: string };

const anchorFor = (lab: string, name: string) =>
  `${lab}-cat-${name.replace(/[^a-zA-Z0-9]+/g, '-')}`;

function prerequisitesFor(config: TopicLabConfig, topic: TopicLabTopic): string {
  const base = config.prereqBaseline[topic.category] ?? config.prereqBaseline['*'] ?? [];
  return prereqMarkdown(`Prerequisites for ${topic.name}`, [
    { title: config.ownPrereqTitle, items: topic.prerequisites },
    ...base,
  ]);
}

function readRecent(key: string): Recent[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecent(key: string, items: Recent[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* private mode or storage full: the list just isn't remembered */
  }
}

/* ══════════════════════════════════════════════════════════════════════
   WIKI INDEX
══════════════════════════════════════════════════════════════════════ */
function TopicLabWikiIndex({
  config,
  groupedSections,
  allTopics,
  onSelectTopic,
  onSelectSub,
  onOpenGuide,
}: {
  config: TopicLabConfig;
  groupedSections: { name: string; topics: TopicLabTopic[] }[];
  allTopics: TopicLabTopic[];
  onSelectTopic: (id: string) => void;
  onSelectSub: (topicId: string, subId: string) => void;
  onOpenGuide: () => void;
}) {
  const totalSubs = allTopics.reduce((a, t) => a + t.subtopics.length, 0);
  const hardCount = allTopics.filter(
    (t) => t.difficulty === 'Hard' || t.difficulty === 'Medium-Hard'
  ).length;
  const easyCount = allTopics.filter(
    (t) => t.difficulty === 'Easy' || t.difficulty === 'Easy-Medium'
  ).length;
  const nounMany = config.noun.many.charAt(0).toUpperCase() + config.noun.many.slice(1);

  return (
    <div className="lab-container space-y-[1.5rem]">
      <WikiHero
        icon={config.icon}
        title={config.wikiTitle}
        description={config.wikiDescription}
        onOpenGuide={onOpenGuide}
        metrics={[
          { label: 'Categories', value: groupedSections.length },
          { label: nounMany, value: allTopics.length },
          { label: 'Subtopics', value: totalSubs },
          { label: 'Hard', value: hardCount, tone: 'hard' },
          { label: 'Easy', value: easyCount, tone: 'easy' },
        ]}
      >
        <LabProgressSummary
          lab={config.lab}
          topicIds={allTopics.map((t) => t.id)}
          noun={config.noun.many}
        />
      </WikiHero>

      {config.wikiNote && (
        <p className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
          <Icon name="InformationCircleIcon" size={14} className="mt-px flex-shrink-0" />
          <span>{config.wikiNote}</span>
        </p>
      )}

      <WikiIndexNav
        id={`${config.lab}-category-index`}
        title="Category index"
        countLabel={`${groupedSections.length} categories`}
        items={groupedSections.map((s) => ({
          name: s.name,
          count: s.topics.length,
          href: `#${anchorFor(config.lab, s.name)}`,
        }))}
      />

      <div className="space-y-[2rem]">
        {groupedSections.map((section) => {
          const anchor = anchorFor(config.lab, section.name);
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
                count={`${section.topics.length} ${section.topics.length === 1 ? config.noun.one : config.noun.many}`}
              />
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-[1rem]">
                {section.topics.map((t) => (
                  <li key={t.id}>
                    <div className={WIKI_CARD} onClick={() => onSelectTopic(t.id)}>
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
                              onSelectTopic(t.id);
                            }}
                            className={`todo-focus rounded text-left transition-colors ${WIKI_CARD_TITLE_HOVER}`}
                          >
                            {t.name}
                          </button>
                        </h3>
                        <div className="mt-[0.5rem] flex flex-wrap items-center gap-x-[0.5rem] gap-y-[0.25rem]">
                          <DifficultyTag difficulty={t.difficulty} />
                          <DoneMark lab={config.lab} topicId={t.id} />
                        </div>
                        <p className="mt-[0.625rem] text-[13px] font-medium leading-relaxed mix-text-foreground/[0.78]">
                          {t.brief}
                        </p>
                        {t.prerequisites.length > 0 && (
                          <p className="mt-[0.5rem] text-xs font-medium text-muted-foreground">
                            <span className="font-semibold">Prereqs</span>{' '}
                            {t.prerequisites.join(' · ')}
                          </p>
                        )}
                        {t.subtopics.length > 0 && (
                          <div className="mt-[0.75rem] flex flex-wrap gap-1.5">
                            {t.subtopics.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectSub(t.id, s.id);
                                }}
                                title={s.brief}
                                className={WIKI_CHIP}
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════════ */
export default function TopicLab({ config }: { config: TopicLabConfig }) {
  const { lab, apiPrefix } = config;
  const sectionDefs = config.sectionDefs;
  const defaultGuidance = useMemo(
    () =>
      Object.fromEntries(
        sectionDefs.filter((d) => d.guidance).map((d) => [d.id, d.guidance as string])
      ),
    [sectionDefs]
  );
  const settingsList = useMemo(
    () =>
      settingsSections(sectionDefs, defaultGuidance, { notes: { quiz: config.quizSettingsNote } }),
    [sectionDefs, defaultGuidance, config.quizSettingsNote]
  );

  const [topics, setTopics] = useState<TopicLabTopic[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const nav = useLabNav(topics, status !== 'loading');
  const selectedTopicId = nav.topicId;
  const selectedSubtopicId = nav.subId;
  const mainRef = useRef<HTMLElement>(null);

  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(
    () => new Set(nav.topicParam ? [nav.topicParam] : [])
  );
  // Categories start collapsed (the open topic's category expands itself, below).
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [sectionsData, setSectionsData] = useState<LabSectionRow[]>([]);
  const [showAddSec, setShowAddSec] = useState(false);
  const [customSectionInput, setCustomSectionInput] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [addingTopicToSection, setAddingTopicToSection] = useState<string | null>(null);
  const [newTopicInputSection, setNewTopicInputSection] = useState('');
  const [addingSubtopicTo, setAddingSubtopicTo] = useState<string | null>(null);
  const [newSubtopicInput, setNewSubtopicInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recentTopics, setRecentTopics] = useState<Recent[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [promptModalSection, setPromptModalSection] = useState<SectionDef | null>(null);
  const [labSettingsModalOpen, setLabSettingsModalOpen] = useState(false);

  const sheets = useLabSheets(`${selectedTopicId}|${selectedSubtopicId}`);
  const { leftExpanded, rightExpanded, setLeftOpen, setRightOpen, collapseLeft, collapseRight } =
    useLabPanes(sheets);

  const loadTopics = useCallback(() => {
    setStatus('loading');
    apiFetch(`${apiPrefix}/topics`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: TopicLabTopic[]) => {
        setTopics(Array.isArray(data) ? data : []);
        setStatus('ready');
      })
      .catch((err) => {
        console.error(`${config.labName}: could not load topics`, err);
        setStatus('error');
      });
  }, [apiPrefix, config.labName]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    apiFetch(`${apiPrefix}/sections`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: LabSectionRow[]) => setSectionsData(Array.isArray(data) ? data : []))
      // The categories also come from the topics, so the sidebar still works without these.
      .catch((err) => console.error(`${config.labName}: could not load categories`, err));
  }, [apiPrefix, config.labName]);

  useEffect(() => {
    setRecentTopics(readRecent(config.recentKey));
  }, [config.recentKey]);

  useScrollToTopOnChange(mainRef, `${selectedTopicId}|${selectedSubtopicId ?? ''}`);

  const allTopics = topics;
  const allSectionNames = Array.from(
    new Set([...sectionsData.map((s) => s.name), ...allTopics.map((t) => t.category)])
  );
  const groupedSections = allSectionNames.map((name) => ({
    name,
    topics: allTopics.filter((t) => t.category === name),
  }));
  const currentTopic = allTopics.find((t) => t.id === selectedTopicId) ?? null;
  const currentSubtopic = currentTopic?.subtopics.find((s) => s.id === selectedSubtopicId) ?? null;

  // The open topic's category (and the topic itself) expand in the sidebar, also on a deep link or Back/Forward.
  const currentCategory = currentTopic?.category ?? null;
  const currentTopicId = currentTopic?.id ?? null;
  useEffect(() => {
    if (currentCategory)
      setExpandedSections((prev) =>
        prev.has(currentCategory) ? prev : new Set([...prev, currentCategory])
      );
    if (currentTopicId)
      setExpandedTopics((prev) =>
        prev.has(currentTopicId) ? prev : new Set([...prev, currentTopicId])
      );
  }, [currentCategory, currentTopicId]);

  // ── Saving (topics and categories are shared by everyone; a custom category is the user's own) ──
  const postTopic = async (topic: Omit<TopicLabTopic, 'isCustom'>): Promise<boolean> => {
    setSaveError(null);
    try {
      const res = await apiFetch(`${apiPrefix}/topics`, {
        method: 'POST',
        body: JSON.stringify(topic),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      console.error(`${config.labName}: could not save`, err);
      setSaveError('Could not save that change. Check your connection and try again.');
      return false;
    }
  };

  const withoutFlags = ({ isCustom: _isCustom, ...rest }: TopicLabTopic) => rest;

  const handleAddCustomSection = async () => {
    const name = customSectionInput.trim();
    if (!name) return;
    setAddingSection(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`${apiPrefix}/sections`, {
        method: 'POST',
        body: JSON.stringify({ name, isCustom: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSectionsData((prev) =>
        prev.some((s) => s.name === name)
          ? prev
          : [...prev, { id: Date.now(), labName: lab, name, isCustom: true }]
      );
      setExpandedSections((prev) => new Set([...prev, name]));
      setCustomSectionInput('');
      setShowAddSec(false);
    } catch (err) {
      console.error(`${config.labName}: could not add category`, err);
      setSaveError('Could not add that category. Try again.');
    } finally {
      setAddingSection(false);
    }
  };

  const handleAddTopicToSection = async (sectionName: string) => {
    const name = newTopicInputSection.trim();
    if (!name) return;
    const topic = {
      id: `custom-${Date.now()}`,
      name,
      brief: config.customTopic.brief,
      category: sectionName,
      difficulty: config.customTopic.difficulty,
      prerequisites: [],
      subtopics: [],
    };
    if (!(await postTopic(topic))) return;
    setTopics((prev) => [...prev, { ...topic, isCustom: true }]);
    setNewTopicInputSection('');
    setAddingTopicToSection(null);
  };

  const appendSubtopic = async (topicId: string, sub: TopicLabTopic['subtopics'][number]) => {
    const parent = allTopics.find((t) => t.id === topicId);
    if (!parent) return false;
    const updated = { ...parent, subtopics: [...parent.subtopics, sub] };
    if (!(await postTopic(withoutFlags(updated)))) return false;
    setTopics((prev) => prev.map((t) => (t.id === topicId ? updated : t)));
    setExpandedTopics((prev) => new Set([...prev, topicId]));
    return true;
  };

  const handleAddSubtopic = async (topicId: string) => {
    const name = newSubtopicInput.trim();
    if (!name) return;
    if (
      await appendSubtopic(topicId, { id: `sub-${Date.now()}`, name, brief: 'Custom subtopic.' })
    ) {
      setNewSubtopicInput('');
      setAddingSubtopicTo(null);
    }
  };

  const handleAddGeneratedSubtopic = (topicId: string, generated: GeneratedSubtopic) => {
    void appendSubtopic(topicId, generated);
  };

  // ── Sections and quiz of the open page ──
  const labSettings = useLabSettings(lab);
  const {
    sections: baseSections,
    generate: generateSection,
    generateWithContext,
    canRegenerateWithoutContext,
  } = useLabSections({
    lab,
    topic: currentTopic,
    subtopic: currentSubtopic,
    sectionDefs,
    getDefaultContent: (id) =>
      currentTopic && id === 'prerequisites' ? prerequisitesFor(config, currentTopic) : '',
    defaultGuidance,
  });
  const quiz = useLabQuiz({
    lab,
    topic: currentTopic,
    subtopic: currentSubtopic,
    category: currentTopic?.category ?? '',
    defaultGuidance: defaultGuidance.quiz ?? '',
    prerequisites: currentTopic?.prerequisites ?? [],
    relatedTopics: currentTopic
      ? allTopics
          .filter((t) => t.category === currentTopic.category && t.id !== currentTopic.id)
          .map((t) => t.name)
          .slice(0, 8)
      : [],
  });
  // The quiz isn't a template section: its state comes from the AI quiz.
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

  const contextLabel =
    selectedTopicId === 'wiki'
      ? 'Wiki Index'
      : (currentSubtopic?.name ?? currentTopic?.name ?? config.title);

  // ── Navigation ──
  const flatItems = [
    { id: 'wiki', type: 'topic', topicId: 'wiki', label: 'Wiki Index' },
    ...allTopics.flatMap((t) => [
      { id: t.id, type: 'topic', topicId: t.id, label: t.name },
      ...t.subtopics.map((s) => ({ id: s.id, type: 'subtopic', topicId: t.id, label: s.name })),
    ]),
  ];
  const activeId = selectedSubtopicId ?? selectedTopicId;
  const currentIdx = flatItems.findIndex((x) => x.id === activeId);
  const prevItem = currentIdx > 0 ? flatItems[currentIdx - 1] : null;
  const nextItem =
    currentIdx >= 0 && currentIdx < flatItems.length - 1 ? flatItems[currentIdx + 1] : null;

  const addToRecent = (topicId: string, topicName: string, subId?: string, subName?: string) => {
    const key = subId ?? topicId;
    setRecentTopics((prev) => {
      const next = [
        { id: topicId, name: topicName, subId, subName },
        ...prev.filter((r) => (r.subId ?? r.id) !== key),
      ].slice(0, 10);
      writeRecent(config.recentKey, next);
      return next;
    });
  };

  const removeRecentTopic = (key: string) => {
    setRecentTopics((prev) => {
      const next = prev.filter((r) => (r.subId ?? r.id) !== key);
      writeRecent(config.recentKey, next);
      return next;
    });
  };

  const selectTopic = (id: string) => {
    nav.openTopic(id);
    if (id === 'wiki') return;
    const t = allTopics.find((tt) => tt.id === id);
    if (t) addToRecent(id, t.name);
  };

  const selectSubtopic = (topicId: string, subId: string) => {
    nav.openSub(topicId, subId);
    const t = allTopics.find((tt) => tt.id === topicId);
    const s = t?.subtopics.find((ss) => ss.id === subId);
    if (t && s) addToRecent(topicId, t.name, subId, s.name);
  };

  const navigateTo = (item: (typeof flatItems)[number]) => {
    if (item.type === 'subtopic') nav.openSub(item.topicId, item.id);
    else nav.openTopic(item.topicId);
  };

  const toggle = (set: Dispatch<SetStateAction<Set<string>>>, key: string) =>
    set((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const genCount = sectionDefs.filter((d) => sections[d.id]?.generated).length;

  return (
    <div className="lab-shell flex flex-col" data-lab={config.shellLab}>
      <div className="lab-workspace flex">
        {sheets.isMobile && sheets.sheet && <LabSheetBackdrop onClose={sheets.close} />}

        {/* ── LEFT: Topic tree ── */}
        <aside
          aria-label={config.noun.many.charAt(0).toUpperCase() + config.noun.many.slice(1)}
          data-sheet={sheets.sheet === 'left' ? 'open' : 'closed'}
          inert={sheets.isMobile && sheets.sheet !== 'left' ? true : undefined}
          className="lab-sidebar border-r flex flex-col overflow-hidden"
          style={{
            width: leftExpanded ? 264 : 48,
            minWidth: leftExpanded ? 264 : 48,
            flexShrink: 0,
            transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="flex-shrink-0">
            <LabSidebarHeader
              icon={config.icon}
              title={config.title}
              subtitle={`${allTopics.length} ${config.noun.many} · ${groupedSections.length} categories`}
              expanded={leftExpanded}
              onCollapse={() => collapseLeft()}
              onExpand={() => setLeftOpen(true)}
              collapseLabel={sheets.isMobile ? 'Close sidebar' : undefined}
              onOpenGuide={() => setGuideOpen(true)}
              settings={
                <LabSettingsButton lab={lab} labName={config.title} sections={settingsList} />
              }
            />
            {leftExpanded && (
              <div className="px-3 pb-3">
                {showAddSec ? (
                  <LabInlineAdd
                    value={customSectionInput}
                    onChange={setCustomSectionInput}
                    onSubmit={() => void handleAddCustomSection()}
                    onCancel={() => {
                      setShowAddSec(false);
                      setCustomSectionInput('');
                    }}
                    placeholder="New category…"
                    ariaLabel="New category name"
                    busy={addingSection || !customSectionInput.trim()}
                    submitLabel={addingSection ? 'Adding…' : 'Add'}
                  />
                ) : (
                  <LabAddRow label="Add category" onClick={() => setShowAddSec(true)} />
                )}
                {saveError && (
                  <p
                    role="alert"
                    className="mt-2 rounded-md px-2.5 py-2 text-xs font-medium text-error mix-bg-error/10"
                  >
                    {saveError}
                  </p>
                )}
              </div>
            )}
          </div>

          {leftExpanded && (
            <nav
              aria-label={`Categories and ${config.noun.many}`}
              className="flex-1 overflow-y-auto py-2 scrollbar-clean"
            >
              <div className="px-1.5">
                <button
                  type="button"
                  onClick={() => selectTopic('wiki')}
                  aria-current={selectedTopicId === 'wiki' ? 'page' : undefined}
                  className="lab-row lab-row-tall gap-2.5"
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

              {recentTopics.length > 0 && (
                <div className="mt-3">
                  <LabRecentList
                    storageKey={`${config.recentKey}-open`}
                    items={recentTopics.map((r) => ({
                      key: r.subId ?? r.id,
                      label: r.subName ?? r.name,
                      onOpen: () => (r.subId ? selectSubtopic(r.id, r.subId) : selectTopic(r.id)),
                    }))}
                    onRemove={removeRecentTopic}
                  />
                </div>
              )}

              <div className="mt-3">
                {groupedSections.map((section) => {
                  const isExp = expandedSections.has(section.name);
                  const adding = addingTopicToSection === section.name;
                  return (
                    <div key={section.name} className="mb-1">
                      <div className="group mx-1.5 flex items-center rounded-md transition-smooth hover:mix-bg-foreground/[0.05]">
                        <button
                          type="button"
                          aria-expanded={isExp}
                          onClick={() => toggle(setExpandedSections, section.name)}
                          className="todo-focus flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-2 pl-2 pr-1 text-left"
                        >
                          <Icon
                            name={isExp ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                            size={12}
                            className="flex-shrink-0 text-muted-foreground"
                          />
                          <span className="lab-caption min-w-0 flex-1 break-words">
                            {section.name}
                          </span>
                          <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                            {section.topics.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-expanded={adding}
                          aria-label={`Add a ${config.noun.one} to ${section.name}`}
                          title={`Add a ${config.noun.one} to this category`}
                          onClick={() => {
                            setAddingTopicToSection(adding ? null : section.name);
                            setNewTopicInputSection('');
                          }}
                          className={`todo-focus mr-1 flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:lab-tint hover:lab-ink ${LAB_REVEAL}`}
                        >
                          <Icon name="PlusIcon" size={14} />
                        </button>
                      </div>

                      {adding && (
                        <LabInlineAdd
                          className="mx-3 mb-1.5 mt-1"
                          iconOnly
                          value={newTopicInputSection}
                          onChange={setNewTopicInputSection}
                          onSubmit={() => void handleAddTopicToSection(section.name)}
                          onCancel={() => setAddingTopicToSection(null)}
                          placeholder={`${config.noun.one.charAt(0).toUpperCase() + config.noun.one.slice(1)} name…`}
                          ariaLabel={`New ${config.noun.one} in ${section.name}`}
                          busy={!newTopicInputSection.trim()}
                          submitLabel={`Add ${config.noun.one}`}
                        />
                      )}

                      {isExp && (
                        <ul className="space-y-0.5 pb-1">
                          {section.topics.map((topic, ti) => {
                            const isActive = selectedTopicId === topic.id && !selectedSubtopicId;
                            const isTopExp = expandedTopics.has(topic.id);
                            return (
                              <li key={topic.id}>
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
                                      <span className="block break-words text-[13px] font-semibold leading-snug">
                                        {topic.name}
                                      </span>
                                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <DifficultyTag difficulty={topic.difficulty} />
                                        <DoneMark lab={lab} topicId={topic.id} />
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-expanded={isTopExp}
                                    aria-label={`${isTopExp ? 'Hide' : 'Show'} subtopics of ${topic.name}`}
                                    onClick={() => toggle(setExpandedTopics, topic.id)}
                                    className="todo-focus mt-1 flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-smooth hover:text-foreground hover:mix-bg-foreground/[0.05]"
                                  >
                                    <Icon
                                      name={isTopExp ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                                      size={14}
                                    />
                                  </button>
                                </div>

                                {isTopExp && (
                                  <ul className="mb-1 ml-[2.25rem] mr-2 mt-0.5 space-y-0.5">
                                    {topic.subtopics.map((sub, idx) => {
                                      const isSubAct = selectedSubtopicId === sub.id;
                                      return (
                                        <li key={sub.id}>
                                          <button
                                            type="button"
                                            onClick={() => selectSubtopic(topic.id, sub.id)}
                                            aria-current={isSubAct ? 'page' : undefined}
                                            className="lab-row lab-row-muted py-1.5 text-xs leading-snug"
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
                                              lab={lab}
                                              topicId={topic.id}
                                              subtopicId={sub.id}
                                            />
                                          </button>
                                        </li>
                                      );
                                    })}
                                    <li>
                                      {addingSubtopicTo === topic.id ? (
                                        <LabInlineAdd
                                          className="mt-1"
                                          iconOnly
                                          value={newSubtopicInput}
                                          onChange={setNewSubtopicInput}
                                          onSubmit={() => void handleAddSubtopic(topic.id)}
                                          onCancel={() => setAddingSubtopicTo(null)}
                                          placeholder="Subtopic…"
                                          ariaLabel={`New subtopic of ${topic.name}`}
                                          busy={!newSubtopicInput.trim()}
                                          submitLabel="Add subtopic"
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setAddingSubtopicTo(topic.id)}
                                          className="lab-row lab-row-muted gap-1.5 text-xs"
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

        {/* ── CENTER ── */}
        <main ref={mainRef} className="lab-main scrollbar-clean">
          {sheets.isMobile && (
            <LabMobileBar
              title={contextLabel}
              onTopics={sheets.openTopics}
              onCopilot={sheets.openCopilot}
              onGuide={() => setGuideOpen(true)}
            />
          )}
          {selectedTopicId !== 'wiki' && currentTopic && (
            <LabBackBar
              href={currentSubtopic ? nav.topicHref : nav.wikiHref}
              parentName={currentSubtopic ? currentTopic.name : 'Wiki Index'}
              currentName={currentSubtopic ? currentSubtopic.name : currentTopic.name}
            />
          )}
          {nav.pending || (status === 'loading' && selectedTopicId === 'wiki') ? (
            <LabScreenLoading />
          ) : status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center px-[1.5rem] text-center">
              <Icon
                name="ExclamationCircleIcon"
                size={40}
                variant="outline"
                className="mb-3 text-muted-foreground"
              />
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Couldn&apos;t load the {config.labName}
              </h2>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                The server didn&apos;t answer. Check that the backend is running, then try again.
              </p>
              <button
                type="button"
                onClick={loadTopics}
                className="todo-btn todo-btn-secondary mt-4"
              >
                <Icon name="ArrowPathIcon" size={14} />
                <span>Try again</span>
              </button>
            </div>
          ) : selectedTopicId === 'wiki' ? (
            <TopicLabWikiIndex
              config={config}
              groupedSections={groupedSections}
              allTopics={allTopics}
              onSelectTopic={selectTopic}
              onSelectSub={selectSubtopic}
              onOpenGuide={() => setGuideOpen(true)}
            />
          ) : !currentTopic ? (
            <div className="flex h-full flex-col items-center justify-center px-[1.5rem] text-center">
              <Icon
                name={config.icon}
                size={48}
                variant="outline"
                className="mb-[1.125rem] text-muted-foreground"
              />
              <h2 className="font-heading text-xl font-semibold text-foreground">
                Select a {config.noun.one}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Choose a {config.noun.one} from the sidebar. Content is generated on demand, section
                by section.
              </p>
            </div>
          ) : (
            <div className="lab-container max-w-card space-y-[1.5rem]">
              {/* ── Header ── */}
              <header className="rounded-lg border bg-card p-[1.25rem] sm:p-[1.5rem]">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={LAB_CHIP_ACCENT}>{currentTopic.category}</span>
                  <DifficultyTag difficulty={currentTopic.difficulty} />
                  {currentSubtopic && <span className={LAB_CHIP}>Subtopic</span>}
                  {currentTopic.isCustom && <span className={LAB_CHIP}>Custom</span>}
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <ProjectSelector />
                    <button
                      type="button"
                      onClick={() => setGuideOpen(true)}
                      className="todo-btn todo-btn-secondary"
                      title={`${config.labName} guide`}
                    >
                      <Icon name="BookOpenIcon" size={14} className="text-primary" />
                      <span>Lab Guide</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabSettingsModalOpen(true)}
                      className="todo-btn todo-btn-secondary"
                      title={`${config.labName} settings & prompts`}
                    >
                      <Icon name="AdjustmentsHorizontalIcon" size={14} className="text-primary" />
                      <span>Lab Settings</span>
                      {labSettings.hasAny && (
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                    <CompleteButton
                      lab={lab}
                      topicId={currentTopic.id}
                      subtopicId={currentSubtopic?.id ?? ''}
                    />
                  </div>
                </div>

                <h1 className="mb-2 break-words text-xl font-semibold leading-snug tracking-tight text-foreground">
                  {currentSubtopic?.name ?? currentTopic.name}
                </h1>
                <p className="text-sm font-semibold leading-relaxed mix-text-foreground/[0.78]">
                  {currentSubtopic?.brief ?? currentTopic.brief}
                </p>

                {currentTopic.prerequisites.length > 0 && (
                  <div className="mt-[1rem] flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Prereqs</span>
                    {currentTopic.prerequisites.map((p) => (
                      <span key={p} className={LAB_CHIP}>
                        {p}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-[1.25rem]">
                  <div className="mb-1.5 flex justify-between text-xs font-medium text-muted-foreground">
                    <span>Sections generated</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {genCount} / {sectionDefs.length}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full mix-bg-foreground/10"
                    role="progressbar"
                    aria-label="Sections generated"
                    aria-valuemin={0}
                    aria-valuemax={sectionDefs.length}
                    aria-valuenow={genCount}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
                      style={{ width: `${(genCount / sectionDefs.length) * 100}%` }}
                    />
                  </div>
                </div>
              </header>

              {/* ── Video-based content (from the YouTube generator) ── */}
              {currentSubtopic?.content && (
                <div className="lab-card p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="lab-caption">Video-based Lab</p>
                    {currentSubtopic.sourceUrl && (
                      <a
                        href={currentSubtopic.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="todo-focus flex items-center gap-1 rounded text-xs font-medium lab-ink hover:underline"
                      >
                        <Icon name="PlayCircleIcon" size={14} />
                        Watch source video
                      </a>
                    )}
                  </div>
                  <MarkdownLite content={currentSubtopic.content} />
                </div>
              )}

              {/* ── Content outline ── */}
              <div className="lab-card-muted p-4">
                <p className="lab-caption mb-3">Content Outline</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(13rem,100%),1fr))] gap-1">
                  {sectionDefs.map((def) => {
                    const s = sections[def.id];
                    return (
                      <a
                        key={def.id}
                        href={`#sec-${def.id}`}
                        onClick={jumpToAnchor}
                        className={`todo-focus flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium leading-snug transition-smooth ${s?.generated ? 'lab-ink lab-tint hover:mix-bg-primary/[0.18]' : 'text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.05]'}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-[0.3125rem] h-1.5 w-1.5 flex-shrink-0 rounded-full ${s?.generated ? 'bg-primary' : s?.generating ? 'bg-primary animate-pulse motion-reduce:animate-none' : 'mix-bg-foreground/[0.25]'}`}
                        />
                        <span className="min-w-0 break-words">{def.label}</span>
                        {s?.generated && <span className="sr-only">(generated)</span>}
                      </a>
                    );
                  })}
                </div>
              </div>

              <GenerateQuestionsPanel
                topicName={currentTopic.name}
                subtopicName={currentSubtopic?.name}
                labName={lab}
                accentVar="--lab-accent"
                onAddSubtopic={(generated) =>
                  handleAddGeneratedSubtopic(currentTopic.id, generated)
                }
              />

              {/* ── On-demand sections ── */}
              <div className="space-y-4">
                {sectionDefs.map((def, idx) => {
                  const s = sections[def.id] ?? {
                    generated: false,
                    generating: false,
                    content: '',
                    context: '',
                    error: null,
                  };
                  const isQuiz = def.id === 'quiz';
                  return (
                    <div key={def.id} id={`sec-${def.id}`} className="scroll-mt-[4.5rem]">
                      <OnDemandSection
                        sectionIndex={idx + 1}
                        icon={def.icon}
                        title={def.label}
                        subtitle={def.subtitle}
                        content={s.content}
                        isGenerated={s.generated}
                        isGenerating={s.generating}
                        onGenerate={isQuiz ? quiz.generateFirst : () => generateSection(def.id)}
                        onGenerateWithContext={
                          isQuiz
                            ? undefined
                            : (context, mode) => generateWithContext(def.id, context, mode)
                        }
                        onOpenPromptSettings={isQuiz ? undefined : () => setPromptModalSection(def)}
                        savedContext={s.context}
                        customised={labSettings.isCustomised(def.id)}
                        allowEmptyRegenerate={!isQuiz && canRegenerateWithoutContext(def.id)}
                        projectSave={
                          isQuiz
                            ? undefined
                            : sectionSaveInfo({
                                lab,
                                topic: currentTopic,
                                subtopic: currentSubtopic ?? null,
                                sectionId: def.id,
                                sectionLabel: def.label,
                                state: s,
                              })
                        }
                        error={s.error}
                      >
                        {isQuiz && s.generated ? (
                          <QuizCarousel
                            key={`${currentTopic.id}|${currentSubtopic?.id ?? ''}`}
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

              <div className="flex justify-center pt-2">
                <CompleteButton
                  lab={lab}
                  topicId={currentTopic.id}
                  subtopicId={currentSubtopic?.id ?? ''}
                  size="lg"
                />
              </div>

              {/* ── Prev / Next (labels wrap, never cut) ── */}
              <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!prevItem}
                  onClick={() => prevItem && navigateTo(prevItem)}
                  className="todo-focus flex max-w-full items-center gap-2 justify-self-start rounded-md border border-border px-4 py-2 text-left text-sm font-medium leading-snug text-foreground transition-smooth hover:mix-bg-foreground/[0.05] disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon name="ArrowLeftIcon" size={14} className="flex-shrink-0" />
                  <span className="min-w-0 break-words">{prevItem?.label ?? 'No previous'}</span>
                </button>
                <button
                  type="button"
                  disabled={!nextItem}
                  onClick={() => nextItem && navigateTo(nextItem)}
                  className="todo-focus flex max-w-full items-center gap-2 justify-self-end rounded-md border border-border px-4 py-2 text-right text-sm font-medium leading-snug text-foreground transition-smooth hover:mix-bg-foreground/[0.05] disabled:pointer-events-none disabled:opacity-40"
                >
                  <span className="min-w-0 break-words">{nextItem?.label ?? 'No next'}</span>
                  <Icon name="ArrowRightIcon" size={14} className="flex-shrink-0" />
                </button>
              </div>

              {promptModalSection && (
                <SectionPromptModal
                  lab={lab}
                  section={promptModalSection}
                  currentSettings={labSettings.get(promptModalSection.id)}
                  labWideSettings={labSettings.labWide}
                  currentTopic={{
                    name: currentTopic.name,
                    brief: currentSubtopic?.brief ?? currentTopic.brief,
                    subtopicName: currentSubtopic?.name,
                  }}
                  isOpen={true}
                  onClose={() => setPromptModalSection(null)}
                  onSave={async (vals) => {
                    await labSettings.save(promptModalSection.id, vals);
                  }}
                  onSaveAndGenerate={async (vals) => {
                    await labSettings.save(promptModalSection.id, vals);
                    await generateWithContext(
                      promptModalSection.id,
                      vals.context || '',
                      'regenerate'
                    );
                  }}
                />
              )}

              <LabSettingsModal
                lab={lab}
                isOpen={labSettingsModalOpen}
                onClose={() => setLabSettingsModalOpen(false)}
                currentTopic={{
                  name: currentTopic.name,
                  brief: currentSubtopic?.brief ?? currentTopic.brief,
                  subtopicName: currentSubtopic?.name,
                }}
              />
            </div>
          )}
        </main>

        {/* ── RIGHT: Copilot ── */}
        <aside
          aria-label="AI Copilot"
          role={sheets.isMobile && sheets.sheet === 'right' ? 'dialog' : undefined}
          aria-modal={sheets.isMobile && sheets.sheet === 'right' ? true : undefined}
          data-sheet={sheets.sheet === 'right' ? 'open' : 'closed'}
          inert={sheets.isMobile && sheets.sheet !== 'right' ? true : undefined}
          className="lab-copilot border-l flex flex-col overflow-hidden"
          style={{
            width: rightExpanded ? 300 : 48,
            minWidth: rightExpanded ? 300 : 48,
            flexShrink: 0,
            transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Stays mounted while collapsed, so the conversation survives a collapse */}
          <div className={rightExpanded ? 'h-full w-[300px] max-md:w-full' : 'hidden'}>
            <LabCopilot
              context={contextLabel}
              labType={lab}
              collapseLabel={sheets.isMobile ? 'Close' : 'Collapse'}
              onCollapse={() => collapseRight()}
            />
          </div>
          {!rightExpanded && <LabCopilotRail onOpen={() => setRightOpen(true)} />}
        </aside>
      </div>

      <LabGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        initialLab={config.guideKey}
      />
    </div>
  );
}
