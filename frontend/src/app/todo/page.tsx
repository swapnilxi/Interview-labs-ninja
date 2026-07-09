import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';

export const metadata: Metadata = {
  title: 'Personalised To-do - InterviewNinja',
  description: 'Your personalised interview prep to-do list.',
};

export default function TodoPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="max-w-[1000px] mx-auto px-24 py-36">
          <div className="mb-12">
            <h1 className="font-heading text-4xl font-semibold text-foreground mb-12">
              Personalised To-do
            </h1>
            <p className="text-muted-foreground font-body">
              Your personalised prep checklist will show up here.
            </p>
          </div>
          <div className="lab-card flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon name="ClipboardDocumentCheckIcon" size={28} variant="outline" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Coming soon</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                We&apos;re building a personalised to-do list based on your profile and progress. Check back soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
