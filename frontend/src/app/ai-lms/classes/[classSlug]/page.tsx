import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import ClassDetailModule from '@/modules/ai-lms/ClassDetailModule';

interface PageProps {
  params: Promise<{
    classSlug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { classSlug } = await params;
  const formatted = classSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `${formatted} - AI LMS | InterviewNinja`,
    description: `Curated modules, subjects, and lessons for ${formatted}.`,
  };
}

export default async function ClassDetailPage({ params }: PageProps) {
  const { classSlug } = await params;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-[60px]">
        <ClassDetailModule classSlug={classSlug} />
      </main>
    </>
  );
}
