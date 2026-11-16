'use client';

import TopicLab from '@/modules/labs/common/TopicLab';
import { GENAI_LAB } from './labConfig';

export default function GenAILabModule() {
  return <TopicLab config={GENAI_LAB} />;
}
