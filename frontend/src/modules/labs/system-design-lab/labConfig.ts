import type { TopicLabConfig, TopicTag } from '@/modules/labs/common/topicLabTypes';
import { getContent } from './sectionContent';
import { SYSTEM_DESIGN_SECTION_DEFS } from './sectionDefs';
import { TOPICS } from './topics';
import type { SDTopic } from './types';

/*
 * System Design Lab: production-scale architecture problems plus low-level designs. Rendered by the shared TopicLab
 * page; only what is System Design-specific lives in this folder:
 *   topics.ts         built-in problems (shown at once; kept if /system-design/topics fails or is empty)
 *   sectionDefs.ts    the sections and their default AI prompts (also read by the Config page)
 *   sectionContent.ts the template text of a plain Generate
 *   prerequisites.ts  the per-problem Prerequisites lists used by that template
 * A problem's `scale` and `isLLD` are shown through topicTags / wikiMetrics below.
 */

function sdTags(topic: SDTopic, where: 'row' | 'card' | 'header'): TopicTag[] {
  const tags: TopicTag[] = [];
  if (topic.isLLD) tags.push({ label: 'LLD', tone: 'accent' });
  if (topic.scale && topic.scale !== 'N/A') {
    tags.push(
      where === 'header'
        ? { label: `Scale: ${topic.scale}`, tone: 'chip' }
        : { label: topic.scale, tone: 'text' }
    );
  }
  return tags;
}

export const SYSTEM_DESIGN_LAB: TopicLabConfig<SDTopic> = {
  lab: 'system_design',
  guideKey: 'system_design',
  apiPrefix: '/system-design',
  shellLab: 'system-design',
  icon: 'ServerStackIcon',
  title: 'System Design',
  labName: 'System Design Lab',
  wikiTitle: 'System Design Wiki',
  wikiDescription: 'Production-scale architecture interview reference',
  noun: { one: 'problem', many: 'problems' },
  sectionDefs: SYSTEM_DESIGN_SECTION_DEFS,
  defaultContent: getContent,
  fallbackTopics: TOPICS,
  customTopic: {
    brief: 'Custom system design problem.',
    difficulty: 'Medium',
    scale: '1M RPS',
    isLLD: false,
  },
  topicTags: sdTags,
  wikiMetrics: (topics) => [{ label: 'LLD', value: topics.filter((t) => t.isLLD).length }],
  subtopicLabel: 'Deep Dive',
  recentKey: 'sd-lab-recent-topics',
};
