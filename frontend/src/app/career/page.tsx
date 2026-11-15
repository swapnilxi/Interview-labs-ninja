import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import CareerStudioTabs from '@/modules/career-studio/views/CareerStudioTabs';

export const metadata: Metadata = {
  title: 'Career Studio - InterviewNinja',
  description: 'Fill your data once, then generate resumes and portfolios in any template — your personal career workspace.',
};

export default function CareerStudioPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="mx-auto max-w-[1400px] px-4 py-[1.25rem] sm:px-24 sm:py-24">
          {/* Page header: the large title and one line, like every other screen (the violet gradient card is retired). */}
          <header className="mb-[1.5rem] flex items-center gap-4 sm:mb-[2rem]">
            <span aria-hidden="true" className="lab-tile hidden h-[2.75rem] w-[2.75rem] sm:inline-flex">
              <Icon name="BriefcaseIcon" size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-[1.75rem] font-bold leading-tight tracking-[-0.024em] text-foreground sm:text-2xl">
                Career Studio
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-snug text-muted-foreground">
                Fill your data once in a profile, then generate resumes &amp; portfolios in any template. Edit the profile and every document updates.
              </p>
            </div>
          </header>
          <React.Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading Career Studio...</div>}>
            <CareerStudioTabs />
          </React.Suspense>
        </div>
      </div>
    </>
  );
}
