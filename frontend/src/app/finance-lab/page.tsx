import { Suspense } from 'react';
import type { Metadata } from 'next';
import FinanceLabModule from '@/modules/labs/finance-lab/FinanceLabModule';

import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';

export const metadata: Metadata = {
  title: 'Finance Lab — Lab Ninja',
  description:
    'Finance for beginners, from money basics and markets to Python, machine learning and AI in finance.',
};

export default function Page() {
  return (
    <>
      <Header />
      <RequireAuth feature="the Finance Lab">
        {/* The open topic/subtopic is read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <FinanceLabModule />
        </Suspense>
      </RequireAuth>
    </>
  );
}
