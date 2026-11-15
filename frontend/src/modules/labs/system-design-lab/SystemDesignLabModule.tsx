'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import LabCopilot, { LabCopilotRail } from '@/modules/labs/common/LabCopilot';
import { LabMobileBar, LabSheetBackdrop, useLabPanes, useLabSheets } from '@/modules/labs/common/LabMobile';
import OnDemandSection from '@/modules/labs/common/OnDemandSection';
import QuizCarousel from '@/modules/labs/common/QuizCarousel';
import GenerateQuestionsPanel, { GeneratedSubtopic } from '@/modules/labs/common/GenerateQuestionsPanel';
import MarkdownLite from '@/modules/labs/common/MarkdownLite';
import { useLabSections } from '@/modules/labs/common/useLabSections';
import { useLabQuiz } from '@/modules/labs/common/useLabQuiz';
import { LabBackBar, LabScreenLoading, jumpToAnchor, useLabNav, useScrollToTopOnChange } from '@/modules/labs/common/labNavigation';
import { CompleteButton, DoneMark } from '@/modules/labs/common/LabProgressUi';
import { DifficultyTag } from '@/modules/labs/common/LabTags';
import { LAB_REVEAL, LabAddRow, LabInlineAdd, LabRecentList, LabSidebarHeader } from '@/modules/labs/common/LabSidebarParts';
import { LAB_CHIP, LAB_CHIP_ACCENT } from '@/modules/labs/common/WikiParts';
import { LabSettingsButton } from '@/modules/labs/common/LabSettings';
import LabSettingsModal from '@/modules/labs/common/LabSettingsModal';
import LabGuideModal from '@/modules/labs/common/LabGuideModal';
import ProjectSelector from '@/modules/labs/common/project/ProjectSelector';
import { sectionSaveInfo } from '@/modules/labs/common/project/sectionProject';
import SectionPromptModal from '@/modules/labs/common/SectionPromptModal';
import { useLabSettings } from '@/modules/labs/common/useLabSettings';
import { SD_DEFAULT_GUIDANCE } from './sectionGuidance';
import { apiFetch } from '@/lib/http/apiClient';

import type { SDTopic } from './types';
import { TOPICS } from './topics';
import { getContent, SECTION_DEFS, SETTINGS_SECTIONS } from './sectionContent';
import SDWikiIndex from './SDWikiIndex';

export default function SystemDesignLabInteractive() {
  const [topics, setTopics] = useState<SDTopic[]>(TOPICS);
  const [topicsReady, setTopicsReady] = useState(false);
  // The open screen lives in the URL (?topic=&sub=), see labNavigation.tsx.
  const nav = useLabNav(topics, topicsReady);
  const selectedTopicId = nav.topicId;
  const selectedSubtopicId = nav.subId;
  const mainRef = useRef<HTMLElement>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(() => new Set(nav.topicParam ? [nav.topicParam] : []));
  const [customInput, setCustomInput] = useState('');
  const [addingCustom, setAddingCustom] = useState(false);
  const [addingSubtopicTo, setAddingSubtopicTo] = useState<string | null>(null);
  const [newSubtopicInput, setNewSubtopicInput] = useState('');

  const [sectionsData, setSectionsData] = useState<{id: number, labName: string, name: string, isCustom: boolean}[]>([]);
  const [addingSection, setAddingSection] = useState(false);
  const [customSectionInput, setCustomSectionInput] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showAddSec, setShowAddSec] = useState(false);
  const [addingTopicToSection, setAddingTopicToSection] = useState<string | null>(null);
  const [newTopicInput, setNewTopicInput] = useState('');
  const lab = useLabSheets(`${selectedTopicId}|${selectedSubtopicId}`);
  const { leftExpanded, rightExpanded, setLeftOpen, setRightOpen, collapseLeft, collapseRight } = useLabPanes(lab);
  const [recentTopics,  setRecentTopics]  = useState<{ id: string; name: string; subId?: string; subName?: string }[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);

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
        setTopicsReady(true);
      })
      .catch(err => {
        console.error("Error fetching system design topics, falling back to static list:", err);
        setTopics(TOPICS);
        setTopicsReady(true);
      });
  }, []);

  // Restore the "Recent" chips on mount. Which screen is open is not stored here any more: it lives in the URL.
  useEffect(() => {
    const savedRecent = localStorage.getItem('sd-lab-recent-topics');
    if (savedRecent) try { setRecentTopics(JSON.parse(savedRecent)); } catch {}
  }, []);

  // A different screen opened (also via Back/Forward): the content pane starts at its top.
  useScrollToTopOnChange(mainRef, `${selectedTopicId}|${selectedSubtopicId ?? ''}`);

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
  const labSettings = useLabSettings('system_design');
  const [promptModalSection, setPromptModalSection] = useState<any | null>(null);
  const [labSettingsModalOpen, setLabSettingsModalOpen] = useState(false);
  const { sections: baseSections, generate: generateSection, generateWithContext, canRegenerateWithoutContext } = useLabSections({
    lab: 'system_design', topic: currentTopic, subtopic: currentSubtopic, sectionDefs: SECTION_DEFS,
    getDefaultContent: id => (currentTopic ? getContent(id, currentTopic) : ''),
    defaultGuidance: SD_DEFAULT_GUIDANCE,
  });
  const quiz = useLabQuiz({
    lab: 'system_design', topic: currentTopic, subtopic: currentSubtopic,
    category: currentTopic?.category ?? '',
    defaultGuidance: SD_DEFAULT_GUIDANCE.quiz ?? '',
    prerequisites: [],
    relatedTopics: currentTopic
      ? allTopics.filter(t => t.category === currentTopic.category && t.id !== currentTopic.id).map(t => t.name).slice(0, 8)
      : [],
  });
  // The quiz isn't a template section: its state comes from the AI quiz.
  const sections = {
    ...baseSections,
    quiz: { generated: quiz.questions.length > 0, generating: quiz.generating && quiz.questions.length === 0, content: '', context: '', error: quiz.error },
  };
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
    if (item.type === 'subtopic') nav.openSub(item.topicId, item.id);
    else nav.openTopic(item.topicId);
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
    nav.openTopic(id);
    if (id !== 'wiki') {
      setExpandedTopics(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
      const t = allTopics.find(tt => tt.id === id);
      if (t) addToRecent(id, t.name);
    }
  };

  const selectSubtopic = (topicId: string, subId: string) => {
    nav.openSub(topicId, subId);
    setExpandedTopics(prev => new Set([...prev, topicId]));
    const t = allTopics.find(tt => tt.id === topicId);
    const s = t?.subtopics.find(ss => ss.id === subId);
    if (t && s) addToRecent(topicId, t.name, subId, s.name);
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
    <div className="lab-shell flex flex-col" data-lab="system-design">
      <div className="lab-workspace flex">
        {lab.isMobile && lab.sheet && <LabSheetBackdrop onClose={lab.close} />}

        {/* ── LEFT Sidebar ──────────────────────────────────────────────── */}
        <aside
          aria-label="Topics"
          data-sheet={lab.sheet === 'left' ? 'open' : 'closed'}
          inert={lab.isMobile && lab.sheet !== 'left' ? true : undefined}
          className="lab-sidebar border-r flex flex-col overflow-hidden"
          style={{ width: leftExpanded ? 264 : 48, minWidth: leftExpanded ? 264 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}
        >
          {/* Header: identity, settings, collapse (the 48px rail shows the tile and the expand button) */}
          <div className="flex-shrink-0">
            <LabSidebarHeader
              icon="ServerStackIcon"
              title="System Design"
              subtitle={`${allTopics.length} problems · ${groupedSections.length} categories`}
              expanded={leftExpanded}
              onCollapse={collapseLeft}
              onExpand={() => setLeftOpen(true)}
              collapseLabel={lab.isMobile ? 'Close sidebar' : undefined}
              onOpenGuide={() => setGuideOpen(true)}
              settings={<LabSettingsButton lab="system_design" labName="System Design" sections={SETTINGS_SECTIONS} />}
            />
            {leftExpanded && (
              <div className="px-3 pb-3">
                {showAddSec ? (
                  <LabInlineAdd
                    value={customSectionInput}
                    onChange={setCustomSectionInput}
                    onSubmit={() => {
                      handleAddCustomSection();
                      setShowAddSec(false);
                    }}
                    onCancel={() => {
                      setShowAddSec(false);
                      setCustomSectionInput('');
                    }}
                    placeholder="New category…"
                    ariaLabel="New category name"
                    busy={addingSection || !customSectionInput.trim()}
                    submitLabel="Add"
                  />
                ) : (
                  <LabAddRow label="Add category / section" onClick={() => setShowAddSec(true)} />
                )}
              </div>
            )}
          </div>

          {leftExpanded && (
            <nav aria-label="System Design problems" className="flex-1 overflow-y-auto py-2 scrollbar-clean">
              {/* Wiki Index */}
              <div className="px-1.5">
                <button
                  type="button"
                  onClick={() => selectTopic('wiki')}
                  aria-current={selectedTopicId === 'wiki' ? 'page' : undefined}
                  className="lab-row lab-row-tall"
                >
                  {selectedTopicId === 'wiki' && <span aria-hidden="true" className="todo-rail" />}
                  <Icon name="BookOpenIcon" size={16} className={selectedTopicId === 'wiki' ? '' : 'text-muted-foreground'} />
                  <span className="flex-1">Wiki Index</span>
                </button>
              </div>

              {/* Recently Opened */}
              {recentTopics.length > 0 && (
                <div className="mt-3">
                  <LabRecentList
                    items={recentTopics.map((r) => ({
                      key: r.subId ?? r.id,
                      label: r.subName ?? r.name,
                      onOpen: () => (r.subId ? selectSubtopic(r.id, r.subId) : selectTopic(r.id)),
                    }))}
                    onRemove={removeRecentTopic}
                    storageKey="sd-lab-recent-open"
                  />
                </div>
              )}

              {/* Sections */}
              <div className="mt-3">
                {groupedSections.map((section) => {
                  const isExp = expandedSections.has(section.name);
                  const adding = addingTopicToSection === section.name;
                  return (
                    <div key={section.name} className="mb-1">
                      {/* Section row: the name toggles the list; "+" adds a topic */}
                      <div className="group mx-1.5 flex items-center rounded-md transition-smooth hover:mix-bg-foreground/[0.05]">
                        <button
                          type="button"
                          aria-expanded={isExp}
                          onClick={() => setExpandedSections(prev => { const n = new Set(prev); if (n.has(section.name)) n.delete(section.name); else n.add(section.name); return n; })}
                          className="todo-focus flex min-w-0 flex-1 items-start gap-1.5 rounded-md py-2 pl-2 pr-1 text-left focus-visible:ring-inset focus-visible:ring-offset-0"
                        >
                          <Icon
                            name={isExp ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                            size={12}
                            className="mt-0.5 flex-shrink-0 text-muted-foreground"
                          />
                          <span className="lab-caption min-w-0 flex-1 break-words">{section.name}</span>
                          <span className="flex-shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                            {section.topics.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-expanded={adding}
                          aria-label={`Add a topic to ${section.name}`}
                          title="Add topic"
                          onClick={() => { setAddingTopicToSection(addingTopicToSection === section.name ? null : section.name); setNewTopicInput(''); }}
                          className={`todo-focus mr-1 flex-shrink-0 rounded-md p-1.5 text-muted-foreground hover:lab-tint hover:lab-ink focus-visible:ring-inset focus-visible:ring-offset-0 ${LAB_REVEAL}`}
                        >
                          <Icon name="PlusIcon" size={14} />
                        </button>
                      </div>

                      {/* Add topic inline */}
                      {adding && (
                        <LabInlineAdd
                          className="mx-3 mb-1.5 mt-1"
                          iconOnly
                          value={newTopicInput}
                          onChange={setNewTopicInput}
                          onSubmit={() => handleAddTopicToSection(section.name)}
                          onCancel={() => setAddingTopicToSection(null)}
                          placeholder="Topic name…"
                          ariaLabel={`New topic in ${section.name}`}
                          busy={!newTopicInput.trim()}
                          submitLabel="Add topic"
                        />
                      )}

                      {/* Topics */}
                      {isExp && (
                        <ul className="space-y-0.5 pb-1">
                          {section.topics.map((topic, ti) => {
                            const isActive = selectedTopicId === topic.id && !selectedSubtopicId;
                            const isTopExp = expandedTopics.has(topic.id);
                            return (
                              <li key={topic.id}>
                                {/* Topic row: select + a separate toggle for its subtopics */}
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
                                      <span className="block break-words text-[13px] font-semibold leading-snug">{topic.name}</span>
                                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <DifficultyTag difficulty={topic.difficulty} />
                                        {topic.isLLD && <span className={LAB_CHIP_ACCENT}>LLD</span>}
                                        {topic.scale !== 'N/A' && (
                                          <span className="text-xs font-medium tabular-nums text-muted-foreground">{topic.scale}</span>
                                        )}
                                        <DoneMark lab="system_design" topicId={topic.id} />
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-expanded={isTopExp}
                                    aria-label={`${isTopExp ? 'Hide' : 'Show'} subtopics of ${topic.name}`}
                                    onClick={() => setExpandedTopics(prev => { const n = new Set(prev); if (n.has(topic.id)) n.delete(topic.id); else n.add(topic.id); return n; })}
                                    className="todo-focus mt-1 flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-smooth hover:text-foreground hover:mix-bg-foreground/[0.05] focus-visible:ring-inset focus-visible:ring-offset-0"
                                  >
                                    <Icon name={isTopExp ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={14} />
                                  </button>
                                </div>

                                {/* Subtopics */}
                                {isTopExp && (
                                  <ul className="mb-1 ml-9 mr-2 mt-0.5 space-y-0.5">
                                    {topic.subtopics.map((sub, idx) => {
                                      const isSubAct = selectedSubtopicId === sub.id;
                                      return (
                                        <li key={sub.id}>
                                          <button
                                            type="button"
                                            onClick={() => selectSubtopic(topic.id, sub.id)}
                                            aria-current={isSubAct ? 'page' : undefined}
                                            className="lab-row lab-row-muted min-h-8 py-1.5 text-xs leading-snug"
                                          >
                                            {isSubAct && <span aria-hidden="true" className="todo-rail" />}
                                            <span aria-hidden="true" className="flex-shrink-0 tabular-nums">
                                              {(idx + 1).toString().padStart(2, '0')}
                                            </span>
                                            <span className="min-w-0 flex-1 break-words">{sub.name}</span>
                                            <DoneMark lab="system_design" topicId={topic.id} subtopicId={sub.id} />
                                          </button>
                                        </li>
                                      );
                                    })}
                                    {/* Add subtopic */}
                                    <li>
                                      {addingSubtopicTo === topic.id ? (
                                        <LabInlineAdd
                                          className="mt-1"
                                          iconOnly
                                          value={newSubtopicInput}
                                          onChange={setNewSubtopicInput}
                                          onSubmit={() => handleAddSubtopic(topic.id)}
                                          onCancel={() => setAddingSubtopicTo(null)}
                                          placeholder="Subtopic…"
                                          ariaLabel={`New subtopic of ${topic.name}`}
                                          submitLabel="Add subtopic"
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setAddingSubtopicTo(topic.id)}
                                          className="lab-row lab-row-muted min-h-8 py-1.5 text-xs"
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

        {/* ── CENTER ────────────────────────────────────────────────────── */}
        <main ref={mainRef} className="lab-main scrollbar-clean">
          {lab.isMobile && (
            <LabMobileBar
              title={contextLabel}
              onTopics={lab.openTopics}
              onCopilot={lab.openCopilot}
              onGuide={() => setGuideOpen(true)}
            />
          )}
          {/* Back to the parent screen: a topic goes back to the Wiki Index, a subtopic to its topic */}
          {selectedTopicId !== 'wiki' && currentTopic && (
            <LabBackBar
              href={currentSubtopic ? nav.topicHref : nav.wikiHref}
              parentName={currentSubtopic ? currentTopic.name : 'Wiki Index'}
              currentName={currentSubtopic ? currentSubtopic.name : currentTopic.name}
            />
          )}
          {nav.pending ? (
            <LabScreenLoading />
          ) : selectedTopicId === 'wiki' ? (
            <SDWikiIndex
              groupedSections={groupedSections}
              allTopics={allTopics}
              onSelectTopic={selectTopic}
              onSelectSub={selectSubtopic}
              onOpenGuide={() => setGuideOpen(true)}
            />
          ) : !currentTopic ? (
            <div className="flex h-full flex-col items-center justify-center px-[1.5rem] text-center">
              <Icon name="ServerStackIcon" size={48} variant="outline" className="mb-[1.125rem] text-muted-foreground" />
              <h2 className="font-heading text-xl font-semibold text-foreground mb-9">Select a System Design Problem</h2>
              <p className="text-sm font-medium text-muted-foreground max-w-sm">Choose a problem from the sidebar. Each of the 16 sections generates on-demand.</p>
            </div>
          ) : (
            <div className="lab-container max-w-card space-y-[1.5rem]">
              {/* ── Topic header: a plain hairline card (the glow belongs to the wiki hero) ── */}
              <div className="rounded-lg border bg-card p-[1.25rem] sm:p-[1.5rem]">
                {/* Badges */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={LAB_CHIP_ACCENT}>{currentTopic.category}</span>
                  <DifficultyTag difficulty={currentTopic.difficulty} />
                  {currentTopic.isLLD && <span className={LAB_CHIP_ACCENT}>LLD</span>}
                  {currentTopic.scale !== 'N/A' && <span className={LAB_CHIP}>Scale: {currentTopic.scale}</span>}
                  {currentSubtopic && <span className={LAB_CHIP}>Deep Dive</span>}
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <ProjectSelector />
                    <button
                      type="button"
                      onClick={() => setGuideOpen(true)}
                      className="todo-btn todo-btn-secondary"
                      title="System Design Lab Guide & Handbook"
                    >
                      <Icon name="BookOpenIcon" size={14} className="text-primary" />
                      <span>Lab Guide</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLabSettingsModalOpen(true)}
                      className="todo-btn todo-btn-secondary"
                      title="System Design Lab Settings & Prompts"
                    >
                      <Icon name="AdjustmentsHorizontalIcon" size={14} className="text-primary" />
                      <span>Lab Settings</span>
                      {labSettings.hasAny && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </button>
                    <CompleteButton lab="system_design" topicId={currentTopic.id} subtopicId={currentSubtopic?.id ?? ''} />
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="break-words text-xl font-semibold leading-snug tracking-tight text-foreground">
                      {currentSubtopic?.name ?? currentTopic.name}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setGuideOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium mix-bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground border mix-border-border/70 transition-colors shadow-2xs cursor-pointer flex-shrink-0"
                      title="Open System Design Lab Guide"
                    >
                      <Icon name="BookOpenIcon" size={12} className="text-primary flex-shrink-0" />
                      <span>Lab Guide</span>
                    </button>
                  </div>
                </div>
                <p className="text-sm font-semibold leading-relaxed mix-text-foreground/[0.78]">
                  {currentSubtopic?.brief ?? currentTopic.brief}
                </p>

                {/* Always rendered, so the card does not change height when the first section is generated */}
                {(() => {
                  const genCount = SECTION_DEFS.filter(d => sections[d.id]?.generated).length;
                  return (
                    <div className="mt-[1.25rem]">
                      <div className="mb-1.5 flex justify-between text-xs font-medium mix-text-foreground/[0.74]">
                        <span>Sections generated</span>
                        <span className="font-semibold tabular-nums text-foreground">{genCount} / {SECTION_DEFS.length}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full mix-bg-foreground/10">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
                          style={{ width: `${(genCount / SECTION_DEFS.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Video-based lab content (from YouTube generator) ── */}
              {currentSubtopic?.content && (
                <div className="lab-card p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="lab-caption">Video-based Lab</p>
                    {currentSubtopic.sourceUrl && (
                      <a href={currentSubtopic.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="todo-focus flex items-center gap-1 rounded text-xs font-medium lab-ink hover:underline">
                        <Icon name="PlayCircleIcon" size={14} />
                        Watch source video
                      </a>
                    )}
                  </div>
                  <MarkdownLite content={currentSubtopic.content} />
                </div>
              )}

              {/* ── Content Outline (quick-jump) ── */}
              <div className="lab-card-muted p-4">
                <p className="lab-caption mb-3">Content Outline</p>
                {/* Labels wrap (never an ellipsis); the columns follow the pane's width */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(14rem,100%),1fr))] gap-1">
                  {SECTION_DEFS.map(def => {
                    const s = sections[def.id];
                    return (
                      <a key={def.id} href={`#sec-${def.id}`} onClick={jumpToAnchor}
                        className={`todo-focus flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium leading-snug transition-smooth ${s?.generated ? 'lab-ink lab-tint hover:mix-bg-primary/[0.18]' : 'mix-text-foreground/[0.78] hover:mix-bg-foreground/[0.05]'}`}>
                        <span aria-hidden="true" className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${s?.generated ? 'bg-primary' : s?.generating ? 'mix-bg-primary/60 animate-pulse' : 'mix-bg-foreground/20'}`} />
                        <span className="min-w-0 break-words">{def.label}</span>
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
                accentVar="--lab-accent"
                onAddSubtopic={generated => handleAddGeneratedSubtopic(currentTopic.id, generated)}
              />

              {/* ── On-demand sections ── */}
              <div className="space-y-4">
                {SECTION_DEFS.map((def, idx) => {
                  const s = sections[def.id] ?? { generated: false, generating: false, content: '', context: '' };
                  return (
                    <div key={def.id} id={`sec-${def.id}`} className="scroll-mt-[4.5rem]">
                      <OnDemandSection key={def.id} sectionIndex={idx + 1} icon={def.icon} title={def.label} subtitle={def.subtitle}
                        content={s.content} isGenerated={s.generated} isGenerating={s.generating} onGenerate={def.id === 'quiz' ? quiz.generateFirst : () => generateSection(def.id)}
                        onGenerateWithContext={def.id === 'quiz' ? undefined : (context, mode) => generateWithContext(def.id, context, mode)}
                        savedContext={s.context}
                        customised={def.id !== 'quiz' && labSettings.isCustomised(def.id)}
                        projectSave={def.id === 'quiz' ? undefined : sectionSaveInfo({ lab: 'system_design', topic: currentTopic, subtopic: currentSubtopic ?? null, sectionId: def.id, sectionLabel: def.label, state: s })}
                        onOpenPromptSettings={def.id !== 'quiz' ? () => setPromptModalSection(def) : undefined}
                        allowEmptyRegenerate={canRegenerateWithoutContext(def.id)}>
                        {def.id === 'quiz' && s.generated ? (
                          <QuizCarousel key={`${currentTopic.id}|${currentSubtopic?.id ?? ''}`} questions={quiz.questions} hasMore generateMore={quiz.generate} lab="system_design" topicName={currentSubtopic?.name ?? currentTopic.name} />
                        ) : undefined}
                      </OnDemandSection>
                    </div>
                  );
                })}
              </div>

              {/* ── Mark as complete (again, at the end of the page) ── */}
              <div className="flex justify-center pt-2">
                <CompleteButton lab="system_design" topicId={currentTopic.id} subtopicId={currentSubtopic?.id ?? ''} size="lg" />
              </div>

              {/* ── Prev / Next ── (labels wrap; each button takes at most half the row) */}
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-border py-4">
                <button disabled={!prevItem} onClick={() => prevItem && navigateTo(prevItem)}
                  className="todo-focus flex min-w-0 max-w-[48%] items-center gap-2 rounded-md border border-border px-4 py-2 text-left text-sm font-medium leading-snug text-muted-foreground transition-smooth hover:text-foreground hover:mix-bg-foreground/[0.05] disabled:pointer-events-none disabled:opacity-40">
                  <Icon name="ArrowLeftIcon" size={14} className="flex-shrink-0" /><span className="min-w-0 break-words">{prevItem?.label ?? 'No previous'}</span>
                </button>
                <button disabled={!nextItem} onClick={() => nextItem && navigateTo(nextItem)}
                  className="todo-focus flex min-w-0 max-w-[48%] items-center gap-2 rounded-md border border-border px-4 py-2 text-right text-sm font-medium leading-snug text-muted-foreground transition-smooth hover:text-foreground hover:mix-bg-foreground/[0.05] disabled:pointer-events-none disabled:opacity-40">
                  <span className="min-w-0 break-words">{nextItem?.label ?? 'No next'}</span><Icon name="ArrowRightIcon" size={14} className="flex-shrink-0" />
                </button>
              </div>

              {promptModalSection && (
                <SectionPromptModal
                  lab="system_design"
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
                    await generateWithContext(promptModalSection.id, vals.context || '', 'regenerate');
                  }}
                />
              )}

              <LabSettingsModal
                lab="system_design"
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

        {/* ── RIGHT: Copilot ─────────────────────────────────────────────── */}
        <aside
          aria-label="AI Copilot"
          role={lab.isMobile && lab.sheet === 'right' ? 'dialog' : undefined}
          aria-modal={lab.isMobile && lab.sheet === 'right' ? true : undefined}
          data-sheet={lab.sheet === 'right' ? 'open' : 'closed'}
          inert={lab.isMobile && lab.sheet !== 'right' ? true : undefined}
          className="lab-copilot border-l flex flex-col overflow-hidden"
          style={{ width: rightExpanded ? 300 : 48, minWidth: rightExpanded ? 300 : 48, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }}
        >
          {/* stays mounted while collapsed: the conversation survives a collapse */}
          <div className={rightExpanded ? 'h-full w-[300px] max-md:w-full' : 'hidden'}>
            <LabCopilot context={contextLabel} labType="system-design" collapseLabel={lab.isMobile ? 'Close' : 'Collapse'} onCollapse={() => collapseRight()} />
          </div>
          {!rightExpanded && <LabCopilotRail onOpen={() => setRightOpen(true)} />}
        </aside>
      </div>

      <LabGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        initialLab="system_design"
      />
    </div>
  );
}
