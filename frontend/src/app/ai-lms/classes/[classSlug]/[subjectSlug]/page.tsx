import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import SubjectDetailModule from '@/modules/ai-lms/SubjectDetailModule';
import RequireAuth from '@/modules/auth/RequireAuth';

interface PageProps {
  params: Promise<{
    classSlug: string;
    subjectSlug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { subjectSlug } = await params;
  const formatted = subjectSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `${formatted} - AI LMS | InterviewNinja`,
    description: `Ordered technical curriculum lessons for ${formatted}.`,
  };
}

export default async function SubjectDetailPage({ params }: PageProps) {
  const { classSlug, subjectSlug } = await params;

  return (
    <>
      <Header />
      <RequireAuth feature="AI LMS">
        <main className="min-h-screen bg-background pt-[60px]">
          <SubjectDetailModule classSlug={classSlug} subjectSlug={subjectSlug} />
        </main>
      </RequireAuth>
    </>
  );
}

