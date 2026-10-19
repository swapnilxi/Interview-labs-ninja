import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import RequireAuth from '@/modules/auth/RequireAuth';
import LabsProjectModule from '@/modules/labs-project/LabsProjectModule';

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
            <div className="mb-[1.5rem] flex items-center gap-3">
              <div aria-hidden="true" className="lab-tile h-[2.75rem] w-[2.75rem]">
                <Icon name="FolderOpenIcon" size={22} />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                  Labs Project
                </h1>
                <p className="mt-1 text-sm font-medium mix-text-foreground/[0.74]">
                  Projects, their context, and what you saved from the labs.
                </p>
              </div>
            </div>
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
