import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import LessonViewerModule from '@/modules/ai-lms/LessonViewerModule';

interface PageProps {
  params: Promise<{
    classSlug: string;
    subjectSlug: string;
    lessonSlug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonSlug } = await params;
  const formatted = lessonSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: `${formatted} - AI LMS Lesson | InterviewNinja`,
    description: `Interactive lesson viewer for ${formatted}.`,
  };
}

export default async function LessonViewerPage({ params }: PageProps) {
  const { classSlug, subjectSlug, lessonSlug } = await params;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-[60px]">
        <LessonViewerModule
          classSlug={classSlug}
          subjectSlug={subjectSlug}
          lessonSlug={lessonSlug}
        />
      </main>
    </>
  );
}
