import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import ConfigInteractive from '@/modules/config/ConfigModule';

export const metadata: Metadata = {
  title: 'Settings - Lab Ninja',
  description:
    'Choose your AI model, add API keys, and set how the app looks. Keys stay in your browser.',
};

export default function ConfigPage() {
  return (
    <>
      <Header />
      <div className="lab-page min-h-screen bg-background pt-[60px]">
        <div className="mx-auto max-w-[1080px] px-4 pb-[2rem] pt-[1.5rem] sm:px-[2rem] sm:pt-[2rem]">
          <header className="mb-4 md:mb-[2rem]">
            <h1 className="font-heading text-[1.75rem] font-bold leading-tight tracking-[-0.024em] text-foreground sm:text-[2rem]">
              Settings
            </h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Choose your AI model, add your keys, and make the app look the way you like.
            </p>
          </header>
          <ConfigInteractive />
        </div>
      </div>
    </>
  );
}
