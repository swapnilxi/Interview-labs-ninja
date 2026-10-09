import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import ModuleLandingModule from '@/modules/ai-lms/ModuleLandingModule';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'AI LMS - About | InterviewNinja',
  description: 'What AI LMS is, how it works, and every class currently available.',
};

export default function AiLmsLandingPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="AI LMS">
        <main className="min-h-screen bg-background pt-[60px]">
          <ModuleLandingModule />
        </main>
      </RequireAuth>
    </>
  );
}
