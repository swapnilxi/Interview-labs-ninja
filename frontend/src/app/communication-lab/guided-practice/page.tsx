import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import CommunicationGuidedPage from '@/modules/labs/guided/CommunicationGuidedPage';

export const metadata: Metadata = {
  title: 'Guided Practice — Communication Lab',
  description:
    'A guided path through one communication lesson: practice in your own words, an AI coach, structured answers, XP and achievements.',
};

export default function CommunicationGuidedPracticePage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Guided Practice">
        {/* The open topic and question are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <CommunicationGuidedPage />
        </Suspense>
      </RequireAuth>
    </>
  );
}
