'use client';

import { TOPICS } from '@/modules/labs/cv-lab/topics';
import GuidedPracticePage from './GuidedPracticePage';

/** The CV lab's Guided Practice page (route glue: it only supplies the lab and its built-in topics). */
export default function CvGuidedPage() {
  return <GuidedPracticePage lab="cv" fallbackTopics={TOPICS} />;
}
