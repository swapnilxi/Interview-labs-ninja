import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import ClassDetailModule from '@/modules/ai-lms/ClassDetailModule';
import RequireAuth from '@/modules/auth/RequireAuth';

interface PageProps {
  params: Promise<{
    classSlug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { classSlug } = await params;
  // A short slug is an acronym ("ai"), not a word.
  const formatted =
    classSlug.length <= 3
      ? classSlug.toUpperCase()
      : classSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const title = `${formatted} - AI LMS | InterviewNinja`;
  // The page is login-only, so what a shared link previews has to say so.
  const description = `Curated modules, subjects, and lessons for ${formatted}. Log in to LabNinja to open this class.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', siteName: 'LabNinja' },
  };
}

export default async function ClassDetailPage({ params }: PageProps) {
  const { classSlug } = await params;

  return (
    <>
      <Header />
      <RequireAuth feature="AI LMS">
        <main className="min-h-screen bg-background pt-[60px]">
          <ClassDetailModule classSlug={classSlug} />
        </main>
      </RequireAuth>
    </>
  );
}

