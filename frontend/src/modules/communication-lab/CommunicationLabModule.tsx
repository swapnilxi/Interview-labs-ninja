'use client';

import TopicLab from '@/modules/common/lab/TopicLab';
import { COMMUNICATION_LAB } from './labConfig';

export default function CommunicationLabModule() {
  return <TopicLab config={COMMUNICATION_LAB} />;
}
