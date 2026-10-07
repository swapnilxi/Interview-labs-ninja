import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import ClassLandingModule from '@/modules/ai-lms/ClassLandingModule';
import RequireAuth from '@/modules/auth/RequireAuth';

interface PageProps {
  params: Promise<{ classSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { classSlug } = await params;
  const formatted = classSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `${formatted} - Class Overview | InterviewNinja`,
    description: `Overview of subjects and projects in ${formatted}.`,
  };
}

export default async function ClassLandingPage({ params }: PageProps) {
  const { classSlug } = await params;

  return (
    <>
      <Header />
      <RequireAuth feature="AI LMS">
        <main className="min-h-screen bg-background pt-[60px]">
          <ClassLandingModule classSlug={classSlug} />
        </main>
      </RequireAuth>
    </>
  );
}
