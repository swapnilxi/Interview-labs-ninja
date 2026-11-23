import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import PythonGuidedPage from '@/modules/labs/guided/PythonGuidedPage';

export const metadata: Metadata = {
  title: 'Guided Path — Python Lab',
  description:
    'A guided path through one Python lesson: coding exercises with tests that run in your browser, an AI tutor, structured answers, XP and achievements.',
};

export default function PythonGuidedPracticePage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Guided Path">
        {/* The open topic and question are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <PythonGuidedPage />
        </Suspense>
      </RequireAuth>
    </>
  );
}
