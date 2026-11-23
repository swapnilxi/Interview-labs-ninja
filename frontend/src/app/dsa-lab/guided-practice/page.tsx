import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import DsaGuidedPage from '@/modules/labs/guided/DsaGuidedPage';

export const metadata: Metadata = {
  title: 'Guided Path — DSA Lab',
  description:
    'A guided path through one DSA problem: lessons, coding exercises with tests, an AI tutor, structured answers, XP and achievements.',
};

export default function DSAGuidedPracticePage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Guided Path">
        {/* The open problem and question are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <DsaGuidedPage />
        </Suspense>
      </RequireAuth>
    </>
  );
}
