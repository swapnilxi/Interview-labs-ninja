import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import LabsProjectFrame from '@/modules/labs/project/LabsProjectFrame';
import LabsProjectModule from '@/modules/labs/project/LabsProjectModule';
import LabsProjectGuideHeader from '@/modules/labs/project/LabsProjectGuideHeader';

export const metadata: Metadata = {
  title: 'Labs Project — Lab Ninja',
  description:
    'Create projects, give the labs their context, and keep the sections you save from any lab in one place.',
};

export default async function LabsProjectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // New project used to be a dialog opened by ?new=1; it is a page now (/labs-project/new). Old links and bookmarks land there.
  if ((await searchParams).new === '1') redirect('/labs-project/new');

  return (
    <LabsProjectFrame>
      <LabsProjectGuideHeader />
      {/* The open project / section is read from the URL (useSearchParams), which needs a Suspense boundary */}
      <Suspense
        fallback={
          <div className="py-[3rem] text-center text-sm text-muted-foreground">Loading…</div>
        }
      >
        <LabsProjectModule />
      </Suspense>
    </LabsProjectFrame>
  );
}
