import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import ResumeBuilder from '@/modules/career/ResumeBuilder';

export const metadata: Metadata = {
  title: 'Resume Builder - Career Studio',
  description: 'Create and edit resumes with a live preview and AI assistance.',
};

export default function ResumeBuilderIndexPage() {
  return (
    <>
      <Header />
      <ResumeBuilder />
    </>
  );
}
