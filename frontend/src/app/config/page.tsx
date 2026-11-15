import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import ConfigInteractive from '@/modules/config/ConfigModule';

export const metadata: Metadata = {
  title: 'Settings - InterviewNinja',
  description:
    'Configure your interview coach, LLM models, and API keys securely in your local environment.',
};

export default function ConfigPage() {
  return (
    <>
      <Header />
      <div className="lab-page min-h-screen bg-background pt-[60px]">
        <div className="mx-auto max-w-[900px] px-4 py-[1.5rem] sm:px-[2rem] sm:py-[2rem]">
          <div className="mb-[1.25rem] flex items-center gap-3 sm:mb-[1.5rem]">
            <div aria-hidden="true" className="lab-tile hidden h-[2.75rem] w-[2.75rem] sm:inline-flex">
              <Icon name="Cog6ToothIcon" size={22} />
            </div>
            <div>
              <h1 className="font-heading text-[1.75rem] font-bold leading-tight tracking-[-0.024em] text-foreground sm:text-2xl sm:font-semibold">
                System Configuration
              </h1>
              <p className="mt-1 text-sm font-medium font-body mix-text-foreground/[0.74]">
                Manage LLM APIs and set model architecture preferences for your daily interviews.
              </p>
            </div>
          </div>
          <ConfigInteractive />
        </div>
      </div>
    </>
  );
}
