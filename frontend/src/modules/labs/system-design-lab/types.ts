import type { TopicLabTopic } from '@/modules/labs/common/topicLabTypes';

/** A System Design problem: a shared topic plus the scale it targets ('N/A' = none) and whether it is a low-level design. */
export interface SDTopic extends TopicLabTopic {
  scale: string;
  difficulty: 'Easy' | 'Easy-Medium' | 'Medium' | 'Medium-Hard' | 'Hard';
  isLLD?: boolean;
}
