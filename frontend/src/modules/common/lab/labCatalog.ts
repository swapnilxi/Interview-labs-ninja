import type { LabName } from '@/lib/services/labSectionsService';

/**
 * Every lab page, in the two groups the navigation shows them in. One list for the Labs home (/labs), the sidebar's
 * Labs menu, the phone Labs sheet and the Labs Project empty state, so a new lab is added in one place.
 */

export type LabGroupId = 'interview' | 'learning';

export interface LabGroup {
  id: LabGroupId;
  label: string;
  description: string;
}

export const LAB_GROUPS: readonly LabGroup[] = [
  {
    id: 'interview',
    label: 'Interview Labs',
    description: 'Technical interview prep: algorithms, system design and computer vision.',
  },
  {
    id: 'learning',
    label: 'Learning Labs',
    description: 'Skills built from the basics up: communication, finance and Python.',
  },
];

export interface LabCatalogEntry {
  /** The lab's key on the server (progress, settings, generated sections). */
  key: LabName;
  group: LabGroupId;
  path: string;
  /** Short name for menus. */
  label: string;
  icon: string;
  /** One line under the name in menus. */
  hint: string;
  /** Two lines on the Labs home card. */
  description: string;
  /** What the topic list calls one entry ("topics", "lessons", "problems"). */
  noun: string;
}

export const LAB_CATALOG: readonly LabCatalogEntry[] = [
  {
    key: 'dsa',
    group: 'interview',
    path: '/dsa-lab',
    label: 'DSA Lab',
    icon: 'CpuChipIcon',
    hint: 'Data structures & algorithms',
    description:
      'Problems grouped by pattern, from brute force to optimal, with a weekly study plan.',
    noun: 'problems',
  },
  {
    key: 'system_design',
    group: 'interview',
    path: '/system-design-lab',
    label: 'System Design',
    icon: 'ServerStackIcon',
    hint: 'Architecture & scale',
    description:
      'Requirements, estimation, architecture, scaling and trade-offs for design rounds.',
    noun: 'topics',
  },
  {
    key: 'cv',
    group: 'interview',
    path: '/cv-lab',
    label: 'CV Lab',
    icon: 'EyeIcon',
    hint: 'Computer vision',
    description: 'Classical image processing to deep learning, deployment and research context.',
    noun: 'topics',
  },
  {
    key: 'communication',
    group: 'learning',
    path: '/communication-lab',
    label: 'Communication Lab',
    icon: 'ChatBubbleOvalLeftEllipsisIcon',
    hint: 'Business English, communication & leadership',
    description:
      'Business English, everyday workplace communication and leadership, with scripts and role-plays.',
    noun: 'lessons',
  },
  {
    key: 'finance',
    group: 'learning',
    path: '/finance-lab',
    label: 'Finance Lab',
    icon: 'BanknotesIcon',
    hint: 'From finance basics to AI in finance',
    description:
      'A beginner path from money basics and markets to Python, machine learning and LLMs in finance.',
    noun: 'lessons',
  },
  {
    key: 'python',
    group: 'learning',
    path: '/python-lab',
    label: 'Python Lab',
    icon: 'CommandLineIcon',
    hint: 'From basics to data & AI',
    description:
      'Python from first program to OOP, testing and concurrency, then data and AI apps.',
    noun: 'lessons',
  },
];

export const LABS_HOME = { path: '/labs', label: 'All labs', icon: 'Squares2X2Icon' } as const;

export const LABS_PROJECT_LINK = {
  path: '/labs-project',
  label: 'Labs Project',
  icon: 'FolderOpenIcon',
  hint: 'Projects the labs generate for',
} as const;

export function labsInGroup(group: LabGroupId): LabCatalogEntry[] {
  return LAB_CATALOG.filter((lab) => lab.group === group);
}

/** True on the Labs home, any lab page and Labs Project (the routes the Labs menu owns). */
export function isLabsPath(pathname: string): boolean {
  return (
    pathname === LABS_HOME.path ||
    pathname === LABS_PROJECT_LINK.path ||
    LAB_CATALOG.some((lab) => lab.path === pathname)
  );
}
