import type { LabName } from '@/lib/services/labSectionsService';
import type { LabGuideKey } from './labGuideData';
import type { SectionDef } from './labSectionDefaults';
import type { PrereqGroup } from './prereqMarkdown';

/** A topic as /<lab>/topics serves it (backend/modules/common/topic_lab.py). */
export interface TopicLabTopic {
  id: string;
  name: string;
  brief: string;
  category: string;
  difficulty: string;
  prerequisites: string[];
  subtopics: { id: string; name: string; brief: string; content?: string; sourceUrl?: string }[];
  isCustom?: boolean;
}

/**
 * Everything that differs between the topic labs (Communication, Finance, Python) rendered by TopicLab.tsx. Keep these
 * configs data-only: labSectionDefaults.ts imports their section lists, and the Config page loads that file.
 */
export interface TopicLabConfig {
  /** Server key (lab_sections.lab_name, progress, settings, generated sections). */
  lab: Extract<LabName, 'communication' | 'finance' | 'python'>;
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
  /** Every section in page order; `quiz` is the AI quiz, `prerequisites` has a template, the rest are AI-written. */
  sectionDefs: readonly SectionDef[];
  /** Note shown on the quiz entry of the lab settings dialog. */
  quizSettingsNote: string;
  /** Prerequisites template: the topic's own prerequisites under `ownPrereqTitle`, then these groups for its category ('*' = any other). */
  ownPrereqTitle: string;
  prereqBaseline: Record<string, PrereqGroup[]>;
  /** Defaults for a topic the learner adds from the sidebar. */
  customTopic: { brief: string; difficulty: string };
  /** localStorage key of the sidebar's Recent list. */
  recentKey: string;
}
