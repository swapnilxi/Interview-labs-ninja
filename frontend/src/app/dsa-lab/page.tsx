import { Suspense } from 'react';
import type { Metadata } from 'next';
import DSALabInteractive from '@/modules/dsa-lab/DSALabModule';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/common/lab/labNavigation';

export const metadata: Metadata = {
  title: 'DSA Lab — InterviewNinja',
  description: 'Interactive Data Structures and Algorithms lab with AI-powered topic exploration, quizzes, and deep-dive sessions.',
};

export default function DSALabPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="the DSA Lab">
        {/* The open topic/subtopic is read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <DSALabInteractive />
        </Suspense>
      </RequireAuth>
    </>
  );
}
