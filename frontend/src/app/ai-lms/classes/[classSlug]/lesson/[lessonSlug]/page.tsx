import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import LessonViewerModule from '@/modules/ai-lms/LessonViewerModule';
import RequireAuth from '@/modules/auth/RequireAuth';

interface PageProps {
  params: Promise<{
    classSlug: string;
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

export default async function DirectLessonViewerPage({ params }: PageProps) {
  const { classSlug, lessonSlug } = await params;

  return (
    <>
      <Header />
      <RequireAuth feature="AI LMS">
        <main className="min-h-screen bg-background pt-[60px]">
          <LessonViewerModule
            classSlug={classSlug}
            lessonSlug={lessonSlug}
          />
        </main>
      </RequireAuth>
    </>
  );
}

