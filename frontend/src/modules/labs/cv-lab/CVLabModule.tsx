'use client';

import TopicLab from '@/modules/labs/common/TopicLab';
import { CV_LAB } from './labConfig';

export default function CVLabModule() {
  return <TopicLab config={CV_LAB} />;
}
