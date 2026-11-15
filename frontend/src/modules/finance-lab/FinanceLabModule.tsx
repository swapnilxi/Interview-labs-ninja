'use client';

import TopicLab from '@/modules/common/lab/TopicLab';
import { FINANCE_LAB } from './labConfig';

export default function FinanceLabModule() {
  return <TopicLab config={FINANCE_LAB} />;
}
