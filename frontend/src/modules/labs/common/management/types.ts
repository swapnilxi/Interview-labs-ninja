import type { LabName } from '@/lib/services/labSectionsService';

/**
 * Lab management is built from parts any lab can reuse. A lab describes itself once, as a LabManagementConfig, and gets
 * the management page (`LabManagementPage`) with its two tabs:
 *
 *   Lab management    how the whole lab is written (section prompts, add-ons, lab-wide context) and how its
 *                     patterns and topics are arranged (`LabCatalogPanel`)
 *   Topic management  one topic: where it sits, who sees it, the context its sections are written with
 *                     (`TopicManagementPanel`)
 *
 * What a lab's backend cannot do yet is switched off in `can`, and its controls simply do not appear. To add a lab:
 * README ("Lab management").
 */

/** A topic as the management screens see it; every lab's topic has at least these. */
export interface ManagedTopic {
  id: string;
  name: string;
  brief: string;
  /** The pattern (or category) it sits in. */
  category: string;
  difficulty?: string;
  isCustom?: boolean;
  /** Everyone sees it. false = only the person who added it. */
  isShared?: boolean;
  /** A shared topic this person changed: they see their own version. */
  isModified?: boolean;
}

/** A pattern (a group of topics) as the sections endpoint lists it for the signed-in user. */
export interface LabGroupRow {
  name: string;
  isCustom: boolean;
}

export interface LabManagementConfig {
  /** The lab's key: its settings store and its section endpoints. */
  lab: LabName;
  /** "DSA Lab" */
  labName: string;
  /** A Heroicons name for the page's tile. */
  icon: string;
  /** The lab's own page, and the management page. */
  labPath: string;
  managePath: string;
  /** Where the lab's topics and sections endpoints live: `${apiBase}/topics`, `${apiBase}/sections`. */
  apiBase: string;
  /** What the lab calls a group of topics: DSA "pattern", the others "category". */
  groupNoun: { one: string; many: string };
  /** What the lab's backend supports. A missing power hides its controls. */
  can: {
    /** Move a topic to another group. */
    move: boolean;
    /** Remove a topic the person added. */
    remove: boolean;
    /** An admin makes a person's topic everyone's. */
    share: boolean;
    /** Add a group, and remove one the person added. */
    addGroup: boolean;
    removeGroup: boolean;
  };
  /** The page shell's lab hue (`data-lab`, see tailwind.css `.lab-shell[data-lab]`) and an extra type-scope class. */
  shell?: { dataLab?: string; className?: string };
  /** Shown when the lab's topics cannot be loaded. */
  fallbackTopics?: ManagedTopic[];
}

export type ManageTab = 'lab' | 'topic';
/** The two views of the Lab management tab. */
export type LabView = 'prompts' | 'catalog';

/**
 * The address of a management screen. `topic` / `sub` use the same params as the lab's own page, so one link moves between
 * the two. Defaults (the lab tab, the prompts view) are left out of the address; `section` is one section's settings page.
 */
export function manageHref(
  config: Pick<LabManagementConfig, 'managePath'>,
  opts: {
    tab?: ManageTab;
    view?: LabView;
    section?: string | null;
    topic?: string | null;
    sub?: string | null;
  } = {}
): string {
  const params = new URLSearchParams();
  if (opts.tab === 'topic') params.set('tab', 'topic');
  if (opts.tab !== 'topic' && opts.view === 'catalog') params.set('view', 'catalog');
  if (opts.tab !== 'topic' && opts.view !== 'catalog' && opts.section)
    params.set('section', opts.section);
  if (opts.topic) params.set('topic', opts.topic);
  if (opts.sub) params.set('sub', opts.sub);
  const query = params.toString();
  return query ? `${config.managePath}?${query}` : config.managePath;
}

export const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
