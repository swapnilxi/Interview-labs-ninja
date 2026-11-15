import { Suspense } from 'react';
import type { Metadata } from 'next';
import PythonLabModule from '@/modules/python-lab/PythonLabModule';

import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/common/lab/labNavigation';

export const metadata: Metadata = {
  title: 'Python Lab — InterviewNinja',
  description:
    'Python from your first program to OOP, testing, concurrency and building data and AI apps.',
};

export default function Page() {
  return (
    <>
      <Header />
      <RequireAuth feature="the Python Lab">
        {/* The open topic/subtopic is read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <PythonLabModule />
        </Suspense>
      </RequireAuth>
    </>
  );
}
