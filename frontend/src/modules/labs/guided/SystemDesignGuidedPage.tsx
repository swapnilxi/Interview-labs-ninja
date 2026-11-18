'use client';

import { TOPICS } from '@/modules/labs/system-design-lab/topics';
import GuidedPracticePage from './GuidedPracticePage';

/** The System Design lab's Guided Practice page (route glue: it only supplies the lab and its built-in problems). */
export default function SystemDesignGuidedPage() {
  return <GuidedPracticePage lab="system_design" fallbackTopics={TOPICS} />;
}
