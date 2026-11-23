import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import SystemDesignGuidedPage from '@/modules/labs/guided/SystemDesignGuidedPage';

export const metadata: Metadata = {
  title: 'Guided Path — System Design Lab',
  description:
    'A guided path through one system design problem: lessons, calculations and simulations with tests, an AI tutor, structured answers, XP and achievements.',
};

export default function SystemDesignGuidedPracticePage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Guided Path">
        {/* The open topic and question are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <SystemDesignGuidedPage />
        </Suspense>
      </RequireAuth>
    </>
  );
}
