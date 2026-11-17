import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';
import LabManagementPage from './LabManagementPage';
import type { LabManagementConfig } from './types';

/** The page metadata of a lab's management page. */
export function manageMetadata(config: LabManagementConfig): Metadata {
  return {
    title: `${config.labName} management — InterviewNinja`,
    description: `Organise the ${config.labName}: ${config.groupNoun.many}, topics, section prompts and the context each topic is written with.`,
  };
}

/**
 * What every lab's `app/<lab>/manage/page.tsx` renders: the app header, the login gate and the management page for the lab's config.
 * A server component: the page files stay a few lines each, and all of the screen is shared.
 */
export default function LabManageRoute({ config }: { config: LabManagementConfig }) {
  return (
    <>
      <Header />
      <RequireAuth feature={`the ${config.labName}`}>
        {/* The tab, view, section and topic are read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <LabManagementPage config={config} />
        </Suspense>
      </RequireAuth>
    </>
  );
}
