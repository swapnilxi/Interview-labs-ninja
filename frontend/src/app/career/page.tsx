import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import CareerStudioTabs from '@/modules/career-studio/views/CareerStudioTabs';

export const metadata: Metadata = {
  title: 'Career Studio — Lab Ninja',
  description:
    'Fill your data once, then optimize with AI and generate resumes & portfolios in any template — your personal career workspace.',
};

export default function CareerStudioPage() {
  return (
    <>
      <Header />
      <div className="lab-page min-h-screen bg-background pt-[60px]">
        <div className="mx-auto max-w-[1320px] px-4 py-[1.25rem] sm:px-6 sm:py-[2rem]">
          <React.Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading Career Studio...</div>}>
            <CareerStudioTabs />
          </React.Suspense>
        </div>
      </div>
    </>
  );
}
