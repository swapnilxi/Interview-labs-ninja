'use client';

import { STATIC_DSA_TOPICS } from '@/modules/labs/dsa-lab/fallbackTopics';
import GuidedPracticePage from './GuidedPracticePage';

/** The DSA lab's Guided Practice page (route glue: it only supplies the lab and its built-in topics). */
export default function DsaGuidedPage() {
  return <GuidedPracticePage lab="dsa" fallbackTopics={STATIC_DSA_TOPICS} />;
}
