import type { LabName } from '@/lib/services/labSectionsService';
import type { LabGuideKey } from './labGuideData';
import type { SectionDef } from './labSectionDefaults';
import type { PrereqGroup } from './prereqMarkdown';

/** A topic as /<lab>/topics serves it (backend/modules/common/topic_lab.py, cv_lab, system_design_lab). */
export interface TopicLabTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  /** Topics or skills to know first. System Design topics have none. */
  prerequisites?: string[];
  subtopics: { id: string; name: string; brief: string; content?: string; sourceUrl?: string }[];
  isCustom?: boolean;
}

/** The labs TopicLab.tsx renders. DSA has its own page (week plan, organizer, approaches). */
export type TopicLabName = Extract<
  LabName,
  'cv' | 'system_design' | 'communication' | 'finance' | 'python' | 'genai'
>;

/** A small label next to a topic's difficulty: `accent` and `chip` are pills, `text` is plain muted text. */
export interface TopicTag {
  label: string;
  tone: 'accent' | 'chip' | 'text';
}

/**
 * Everything that differs between the labs rendered by TopicLab.tsx. A lab with extra topic fields (System Design's
 * `scale` and `isLLD`) passes its own topic type as `T` and uses the optional hooks below to show them.
 *
 * Keep a lab's section list in a data-only file (its `sectionDefs.ts` or `labConfig.ts`): labSectionDefaults.ts imports
 * it, and the Config page loads that file, so it must not pull in topic lists or content templates.
 */
export interface TopicLabConfig<T extends TopicLabTopic = TopicLabTopic> {
  /** Server key (lab_sections.lab_name, progress, settings, generated sections). */
  lab: TopicLabName;
  guideKey: LabGuideKey;
  /** Route prefix of the topic/section API: `${apiPrefix}/topics`, `${apiPrefix}/sections`. */
  apiPrefix: string;
  /** `data-lab` on the shell: picks the lab's identity hue in tailwind.css. */
  shellLab: string;
  icon: string;
  /** Sidebar title and copilot fallback context, e.g. "Finance". */
  title: string;
  /** "Finance Lab": settings dialog, guide buttons, Generate Questions. */
  labName: string;
  wikiTitle: string;
  wikiDescription: string;
  /** A short line shown under the wiki hero (for example a "not financial advice" note). */
  wikiNote?: string;
  noun: { one: string; many: string };
  /** Every section in page order, each with its default `guidance` (the AI prompt the settings show and edit). */
  sectionDefs: readonly SectionDef[];
  /** Note shown on the quiz entry of the lab settings dialog. */
  quizSettingsNote: string;
  /**
   * Text a plain Generate fills a section with, without the AI. Without it, Prerequisites gets the template built from
   * `prereqBaseline` and every other section is written by the AI (`aiGenerated` in its SectionDef).
   */
  defaultContent?: (sectionId: string, topic: T) => string;
  /** Prerequisites template: the topic's own prerequisites under `ownPrereqTitle`, then these groups for its category ('*' = any other). */
  ownPrereqTitle?: string;
  prereqBaseline?: Record<string, PrereqGroup[]>;
  /**
   * Built-in topics, shown at once and kept when the server is unreachable or has none. Without them the lab waits for
   * the server and shows an error with a retry button when it fails.
   */
  fallbackTopics?: readonly T[];
  /** The fields of a topic the learner adds from the sidebar, besides its id, name, category and (empty) subtopics. */
  customTopic: Omit<T, 'id' | 'name' | 'category' | 'subtopics' | 'isCustom'>;
  /** Extra tags after a topic's difficulty: in the sidebar row, on its wiki card and in its page header. */
  topicTags?: (topic: T, where: 'row' | 'card' | 'header') => TopicTag[];
  /** Extra numbers in the wiki hero, shown after Subtopics. */
  wikiMetrics?: (topics: readonly T[]) => { label: string; value: number }[];
  /** The chip on a subtopic's page. Default "Subtopic". */
  subtopicLabel?: string;
  /** localStorage key of the sidebar's Recent list. */
  recentKey: string;
}
