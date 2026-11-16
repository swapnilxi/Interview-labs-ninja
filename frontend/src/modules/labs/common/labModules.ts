import { LAB_CATALOG, type LabCatalogEntry } from '@/modules/labs/common/labCatalog';
import type { TopicLabConfig, TopicLabName } from '@/modules/labs/common/topicLabTypes';
import { COMMUNICATION_LAB } from '@/modules/labs/communication-lab/labConfig';
import { CV_LAB } from '@/modules/labs/cv-lab/labConfig';
import { FINANCE_LAB } from '@/modules/labs/finance-lab/labConfig';
import { GENAI_LAB } from '@/modules/labs/genai-lab/labConfig';
import { PYTHON_LAB } from '@/modules/labs/python-lab/labConfig';
import { SYSTEM_DESIGN_LAB } from '@/modules/labs/system-design-lab/labConfig';

/**
 * The labs a class can import modules from ("Import from labs" on a class page in AI LMS).
 *
 * A **lab module** is one topic of a lab: its description, its subtopics and the sections written for each page.
 * Every lab that TopicLab.tsx renders already describes itself completely through its `TopicLabConfig` (API prefix,
 * sections, templates), so a lab becomes importable by adding ONE line to `LAB_MODULE_CONFIGS`: no import code
 * is written per lab. DSA keeps its own page (problems, week plan) and is not a topic lab, so it is not listed.
 *
 * Loaded on demand (the class page imports this file only when the import dialog opens): the CV and System Design
 * configs carry their built-in topic lists.
 */

// The configs differ in their topic type (CV, System Design have extra fields); the import only reads the common part.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTopicLabConfig = TopicLabConfig<any>;

export const LAB_MODULE_CONFIGS: readonly AnyTopicLabConfig[] = [
  CV_LAB,
  SYSTEM_DESIGN_LAB,
  COMMUNICATION_LAB,
  FINANCE_LAB,
  PYTHON_LAB,
  GENAI_LAB,
];

/**
 * The accent a subject imported from the lab gets on its card (a hex: it is stored with the subject, so it cannot be
 * a CSS variable). Same hues as the lab identity colours in tailwind.css (`--lab-*`, light theme).
 */
const LAB_ACCENT: Record<TopicLabName, string> = {
  cv: '#0f8c80',
  system_design: '#b45f0e',
  communication: '#b03a7a',
  finance: '#2563a8',
  python: '#6d4fc2',
  genai: '#c4472a',
};

export interface LabModuleSource {
  lab: TopicLabName;
  config: AnyTopicLabConfig;
  catalog: LabCatalogEntry;
  accent: string;
}

/** Every importable lab with its catalog entry (name, icon, one-line description) and accent. */
export function getLabModuleSources(): LabModuleSource[] {
  const sources: LabModuleSource[] = [];
  for (const config of LAB_MODULE_CONFIGS) {
    const catalog = LAB_CATALOG.find((entry) => entry.key === config.lab);
    if (!catalog) continue;
    sources.push({ lab: config.lab, config, catalog, accent: LAB_ACCENT[config.lab] });
  }
  return sources;
}
