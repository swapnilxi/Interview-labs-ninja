import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import GenAiGuidedPage from '@/modules/labs/guided/GenAiGuidedPage';

export const metadata: Metadata = {
  title: 'Guided Practice — GenAI & AI Lab',
  description:
    'A guided path through one GenAI lesson: the mental model, small deterministic exercises, an AI tutor, structured answers, XP and achievements.',
};

export default function GenAiGuidedPracticePage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Guided Practice">
        {/* The open topic and question are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <GenAiGuidedPage />
        </Suspense>
      </RequireAuth>
    </>
  );
}
