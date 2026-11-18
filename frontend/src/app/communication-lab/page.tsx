import { Suspense } from 'react';
import type { Metadata } from 'next';
import CommunicationLabModule from '@/modules/labs/communication-lab/CommunicationLabModule';

import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';

export const metadata: Metadata = {
  title: 'Communication Lab — Lab Ninja',
  description:
    'Business English, effective communication and leadership: phrases, frameworks, role-plays and an AI copilot.',
};

export default function Page() {
  return (
    <>
      <Header />
      <RequireAuth feature="the Communication Lab">
        {/* The open topic/subtopic is read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <CommunicationLabModule />
        </Suspense>
      </RequireAuth>
    </>
  );
}
