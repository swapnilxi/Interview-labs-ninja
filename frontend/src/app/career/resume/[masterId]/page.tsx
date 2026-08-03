import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import ResumeBuilder from '@/modules/career/ResumeBuilder';

export const metadata: Metadata = {
  title: 'Resume Builder - Career Studio',
  description: 'Create and edit resumes with a live preview and AI assistance.',
};

export default async function ResumeBuilderPage({ params }: { params: Promise<{ masterId: string }> }) {
  const { masterId } = await params;
  return (
    <>
      <Header />
      <ResumeBuilder masterId={masterId} />
    </>
  );
}
