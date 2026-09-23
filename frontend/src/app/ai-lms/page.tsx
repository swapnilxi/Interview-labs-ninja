import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import LmsHomeModule from '@/modules/ai-lms/LmsHomeModule';

export const metadata: Metadata = {
  title: 'AI LMS - Interactive AI-Powered Curriculum | InterviewNinja',
  description: 'AI-powered learning platform inspired by ByteByteGo and NeetCode. Generate, organize, and study interactive lessons.',
};

export default function AiLmsPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-[60px]">
        <LmsHomeModule />
      </main>
    </>
  );
}
