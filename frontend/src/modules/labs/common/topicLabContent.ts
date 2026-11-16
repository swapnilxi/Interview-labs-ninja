import { prereqMarkdown } from '@/modules/labs/common/prereqMarkdown';
import type { TopicLabConfig, TopicLabTopic } from '@/modules/labs/common/topicLabTypes';

/** The default Prerequisites template: the topic's own prerequisites, then the lab's baseline for its category. */
export function prerequisitesFor<T extends TopicLabTopic>(
  config: TopicLabConfig<T>,
  topic: T
): string {
  const baseline = config.prereqBaseline ?? {};
  const base = baseline[topic.category] ?? baseline['*'] ?? [];
  return prereqMarkdown(`Prerequisites for ${topic.name}`, [
    { title: config.ownPrereqTitle ?? 'Study these first', items: topic.prerequisites ?? [] },
    ...base,
  ]);
}

/**
 * What a plain Generate puts in a section without the AI: the lab's own template (`defaultContent`: CV, System
 * Design), else the Prerequisites template. '' when the section has no template and is only ever written by the AI.
 *
 * Read by the lab page (TopicLab) and by "Import module from labs" in AI LMS, so what a class imports for a template
 * section is exactly what the lab shows for it.
 */
export function templateSectionContent<T extends TopicLabTopic>(
  config: TopicLabConfig<T>,
  topic: T,
  sectionId: string
): string {
  if (config.defaultContent) return config.defaultContent(sectionId, topic);
  return sectionId === 'prerequisites' ? prerequisitesFor(config, topic) : '';
}
