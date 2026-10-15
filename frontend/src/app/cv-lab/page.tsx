import { Suspense } from 'react';
import type { Metadata } from 'next';
import CVLabInteractive from '@/modules/cv-lab/CVLabModule';

import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/common/lab/labNavigation';

export const metadata: Metadata = {
  title: 'CV Lab — InterviewNinja',
  description: 'Interactive Computer Vision lab with AI-powered topic exploration, quizzes, and deep-dive sessions.',
};

export default function CVLabPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="the CV Lab">
        {/* The open topic/subtopic is read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <CVLabInteractive />
        </Suspense>
      </RequireAuth>
    </>
  );
}
