import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import LinkedInPostGeneratorInteractive from '@/modules/linkedin-post-generator/LinkedInPostGeneratorModule';

export const metadata: Metadata = {
  title: 'LinkedIn Post Generator - InterviewNinja',
  description: 'An AI-powered workspace for writing personalised LinkedIn posts, with a reusable template library.',
};

export default function LinkedInPostGeneratorPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="mx-auto max-w-[1400px] px-4 py-[1.25rem] sm:px-24 sm:py-24">
          {/* Page header: large title and one line, like every other screen. */}
          <header className="mb-[1.5rem] flex items-center gap-3.5 sm:mb-[2rem]">
            <span aria-hidden="true" className="lab-tile hidden h-11 w-11 sm:inline-flex">
              <Icon name="SparklesIcon" size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-[1.75rem] font-bold leading-tight tracking-[-0.024em] text-foreground sm:text-2xl">
                LinkedIn Post Generator
              </h1>
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                Turn a topic, story, or achievement into a ready-to-publish LinkedIn post.
              </p>
            </div>
          </header>
          {/* The module reads ?tab= from the URL, which needs a Suspense boundary above it. */}
          <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>}>
            <LinkedInPostGeneratorInteractive />
          </Suspense>
        </div>
      </div>
    </>
  );
}
