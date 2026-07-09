import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';

export const metadata: Metadata = {
  title: 'AI LMS - InterviewNinja',
  description: 'AI-powered learning management for interview preparation.',
};

export default function AiLmsPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="max-w-[1000px] mx-auto px-24 py-36">
          <div className="mb-12">
            <h1 className="font-heading text-4xl font-semibold text-foreground mb-12">
              AI LMS
            </h1>
            <p className="text-muted-foreground font-body">
              An AI-powered learning management system to guide your interview prep.
            </p>
          </div>
          <div className="lab-card flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon name="SparklesIcon" size={28} variant="outline" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Coming soon</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                We&apos;re building an AI-driven learning path with curated courses and tracked mastery. Check back soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
