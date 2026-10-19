import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import RequireAuth from '@/modules/auth/RequireAuth';
import LabsProjectModule from '@/modules/labs-project/LabsProjectModule';
import LabsProjectGuideHeader from '@/modules/labs-project/LabsProjectGuideHeader';

export const metadata: Metadata = {
  title: 'Labs Project — InterviewNinja',
  description:
    'Create projects, give the labs their context, and keep the sections you save from any lab in one place.',
};

export default function LabsProjectPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Labs Project">
        <div className="lab-page min-h-screen bg-background pt-[60px]">
          <div className="mx-auto max-w-[1100px] px-4 py-[1.5rem] sm:px-[2rem] sm:py-[2rem]">
            <LabsProjectGuideHeader />
            {/* The open project / section is read from the URL (useSearchParams), which needs a Suspense boundary */}
            <Suspense
              fallback={
                <div className="py-[3rem] text-center text-sm text-muted-foreground">Loading…</div>
              }
            >
              <LabsProjectModule />
            </Suspense>
          </div>
        </div>
      </RequireAuth>
    </>
  );
}
