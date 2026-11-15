import type { TopicLabTopic } from '@/modules/labs/common/topicLabTypes';

/** A CV Lab topic: a shared topic whose prerequisites are always listed (the Prerequisites template uses them). */
export interface CVTopic extends TopicLabTopic {
  prerequisites: string[];
}
