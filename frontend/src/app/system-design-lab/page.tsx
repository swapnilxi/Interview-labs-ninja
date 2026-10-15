import { Suspense } from 'react';
import type { Metadata } from 'next';
import SystemDesignLabInteractive from '@/modules/system-design-lab/SystemDesignLabModule';

import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/common/lab/labNavigation';

export const metadata: Metadata = {
  title: 'System Design Lab — InterviewNinja',
  description: 'Interactive System Design lab with 16 on-demand sections covering requirements, estimation, architecture, scaling, reliability, and more.',
};

export default function SystemDesignLabPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="the System Design Lab">
        {/* The open topic/subtopic is read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <SystemDesignLabInteractive />
        </Suspense>
      </RequireAuth>
    </>
  );
}
