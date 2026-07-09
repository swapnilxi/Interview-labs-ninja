import type { Metadata } from 'next';
import Header from '@/components/common/Header';
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
        <div className="max-w-[1400px] mx-auto px-24 py-24">
          <div className="mb-12">
            <h1 className="font-heading text-4xl font-semibold text-foreground mb-6">
              LinkedIn Post Generator
            </h1>
            <p className="text-muted-foreground font-body">
              Turn a topic, story, or achievement into a ready-to-publish LinkedIn post.
            </p>
          </div>
          <LinkedInPostGeneratorInteractive />
        </div>
      </div>
    </>
  );
}
