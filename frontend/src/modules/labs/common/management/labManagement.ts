import type { LabName } from '@/lib/services/labSectionsService';
import type { LabManagementConfig } from './types';

/**
 * Every lab's management config, in one place: the seven labs follow the same pattern, so the management page, its panels and
 * the lab pages' gears all read what they need from here. To give a new lab a management page: add it to LAB_MANAGEMENT, add
 * `app/<lab>/manage/page.tsx` (a six-line file, see app/cv-lab/manage/page.tsx) and point the lab's gears at `manageHref`.
 *
 * Data only (no components, no topic lists), so a server page can import it. `can` says what the lab's backend supports; all seven
 * share backend/modules/common/{topic_lab,owned_topics}.py and its twin fe-apis/labs/index.ts, so all can everything today.
 */

const CAN_ALL = {
  move: true,
  remove: true,
  share: true,
  addGroup: true,
  removeGroup: true,
} as const;

function entry(
  lab: LabName,
  labName: string,
  icon: string,
  labPath: string,
  apiBase: string,
  extra: Pick<LabManagementConfig, 'groupNoun' | 'shell'>
): LabManagementConfig {
  return {
    lab,
    labName,
    icon,
    labPath,
    managePath: `${labPath}/manage`,
    apiBase,
    can: { ...CAN_ALL },
    ...extra,
  };
}

const CATEGORY = { one: 'category', many: 'categories' } as const;

export const LAB_MANAGEMENT: Record<LabName, LabManagementConfig> = {
  dsa: entry('dsa', 'DSA Lab', 'CodeBracketIcon', '/dsa-lab', '/dsa', {
    groupNoun: { one: 'pattern', many: 'patterns' },
    shell: { className: 'dsa-type' },
  }),
  system_design: entry(
    'system_design',
    'System Design Lab',
    'ServerStackIcon',
    '/system-design-lab',
    '/system-design',
    {
      groupNoun: CATEGORY,
      shell: { dataLab: 'system-design' },
    }
  ),
  cv: entry('cv', 'CV Lab', 'EyeIcon', '/cv-lab', '/cv', {
    groupNoun: CATEGORY,
    shell: { dataLab: 'cv' },
  }),
  communication: entry(
    'communication',
    'Communication Lab',
    'ChatBubbleOvalLeftEllipsisIcon',
    '/communication-lab',
    '/communication',
    {
      groupNoun: CATEGORY,
      shell: { dataLab: 'communication' },
    }
  ),
  finance: entry('finance', 'Finance Lab', 'BanknotesIcon', '/finance-lab', '/finance', {
    groupNoun: CATEGORY,
    shell: { dataLab: 'finance' },
  }),
  python: entry('python', 'Python Lab', 'CommandLineIcon', '/python-lab', '/python', {
    groupNoun: CATEGORY,
    shell: { dataLab: 'python' },
  }),
  genai: entry('genai', 'GenAI & AI Lab', 'SparklesIcon', '/genai-lab', '/genai', {
    groupNoun: CATEGORY,
    shell: { dataLab: 'genai' },
  }),
};

export function labManagementConfig(lab: LabName): LabManagementConfig {
  return LAB_MANAGEMENT[lab];
}
