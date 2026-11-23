import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import CvGuidedPage from '@/modules/labs/guided/CvGuidedPage';

export const metadata: Metadata = {
  title: 'Guided Path — CV Lab',
  description:
    'A guided path through one computer vision topic: lessons, plain-Python exercises with tests, an AI tutor, structured answers, XP and achievements.',
};

export default function CVGuidedPracticePage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Guided Path">
        {/* The open topic and question are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <CvGuidedPage />
        </Suspense>
      </RequireAuth>
    </>
  );
}
