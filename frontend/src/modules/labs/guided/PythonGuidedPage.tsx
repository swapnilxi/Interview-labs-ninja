'use client';

import GuidedPracticePage from './GuidedPracticePage';

/**
 * The Python lab's Guided Practice page (route glue: it only supplies the lab). The lab has no built-in topic list in the browser:
 * its topics are seeded on the server, so the page asks `/python/topics` and has nothing to fall back to.
 */
export default function PythonGuidedPage() {
  return <GuidedPracticePage lab="python" fallbackTopics={[]} />;
}
