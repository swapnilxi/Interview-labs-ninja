'use client';

import GuidedPracticePage from './GuidedPracticePage';

/**
 * The GenAI & AI lab's Guided Practice page (route glue: it only supplies the lab). The lab has no built-in topic list in the browser:
 * its topics are seeded on the server, so the page asks `/genai/topics` and has nothing to fall back to.
 */
export default function GenAiGuidedPage() {
  return <GuidedPracticePage lab="genai" fallbackTopics={[]} />;
}
