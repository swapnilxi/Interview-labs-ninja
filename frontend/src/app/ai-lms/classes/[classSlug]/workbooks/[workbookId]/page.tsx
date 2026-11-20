import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import WorkbookModule from '@/modules/ai-lms/workbooks/WorkbookModule';
import RequireAuth from '@/modules/auth/RequireAuth';

interface PageProps {
  params: Promise<{ classSlug: string; workbookId: string }>;
}

export const metadata: Metadata = {
  title: 'Workbook | Lab Ninja',
  description: 'An interactive workbook: exercises, planners, trackers and reflections.',
};

export default async function WorkbookPage({ params }: PageProps) {
  const { classSlug, workbookId } = await params;
  return (
    <>
      <Header />
      <RequireAuth feature="AI LMS">
        <main className="wb-page">
          {/* WorkbookModule reads ?chapter= (useSearchParams), which needs a Suspense boundary. */}
          <Suspense fallback={null}>
            <WorkbookModule classSlug={classSlug} workbookId={workbookId} />
          </Suspense>
        </main>
      </RequireAuth>
    </>
  );
}
