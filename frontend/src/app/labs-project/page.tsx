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
        <div className="min-h-screen bg-background pt-[60px]">
          <div className="mx-auto max-w-[1100px] px-4 py-[1.5rem] sm:px-[1.5rem]">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-[2.75rem] w-[2.75rem] flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-md">
                <Icon name="FolderOpenIcon" size={22} className="text-white" />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                  Labs Project
                </h1>
                <p className="text-sm text-muted-foreground">
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
