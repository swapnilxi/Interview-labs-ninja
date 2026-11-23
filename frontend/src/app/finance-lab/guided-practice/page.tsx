import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import FinanceGuidedPage from '@/modules/labs/guided/FinanceGuidedPage';

export const metadata: Metadata = {
  title: 'Guided Path — Finance Lab',
  description:
    'A guided path through one finance lesson: worked numbers, plain-Python calculations with tests, an AI tutor, structured answers, XP and achievements.',
};

export default function FinanceGuidedPracticePage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Guided Path">
        {/* The open topic and question are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <FinanceGuidedPage />
        </Suspense>
      </RequireAuth>
    </>
  );
}
