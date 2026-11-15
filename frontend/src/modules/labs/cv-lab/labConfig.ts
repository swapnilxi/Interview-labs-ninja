import type { TopicLabConfig } from '@/modules/labs/common/topicLabTypes';
import { getContent } from './sectionContent';
import { CV_SECTION_DEFS } from './sectionDefs';
import { TOPICS } from './topics';
import type { CVTopic } from './types';

/*
 * CV Lab: computer vision from image basics to detection, segmentation and generative models. Rendered by the shared
 * TopicLab page; only what is CV-specific lives in this folder:
 *   topics.ts         built-in topics (shown at once; kept if /cv/topics fails or is empty)
 *   sectionDefs.ts    the sections and their default AI prompts (also read by the Config page)
 *   sectionContent.ts the template text of a plain Generate
 *   prerequisites.ts  the per-topic Prerequisites lists used by that template
 */
export const CV_LAB: TopicLabConfig<CVTopic> = {
  lab: 'cv',
  guideKey: 'cv',
  apiPrefix: '/cv',
  shellLab: 'cv',
  icon: 'EyeIcon',
  title: 'Computer Vision',
  labName: 'CV Lab',
  wikiTitle: 'CV Lab Wiki',
  wikiDescription: 'Computer vision interview preparation handbook',
  noun: { one: 'topic', many: 'topics' },
  sectionDefs: CV_SECTION_DEFS,
  quizSettingsNote:
    'These instructions and your context are added to the requirements for each new batch of quiz questions.',
  defaultContent: getContent,
  fallbackTopics: TOPICS,
  customTopic: { brief: 'Custom topic.', difficulty: 'Medium', prerequisites: [] },
  recentKey: 'cv-lab-recent-topics',
};
