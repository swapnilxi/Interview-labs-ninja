'use client';

import TopicLab from '@/modules/labs/common/TopicLab';
import { SYSTEM_DESIGN_LAB } from './labConfig';

export default function SystemDesignLabModule() {
  return <TopicLab config={SYSTEM_DESIGN_LAB} />;
}
