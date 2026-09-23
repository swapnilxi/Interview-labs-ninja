import type { Metadata } from 'next';
import { Suspense } from 'react';
import Header from '@/components/common/Header';
import GenerateLessonModule from '@/modules/ai-lms/GenerateLessonModule';

export const metadata: Metadata = {
  title: 'Generate Lesson - AI LMS | InterviewNinja',
  description: 'Turn topics, notes, or documents into an interactive standalone HTML lesson with quizzes and system design diagrams.',
};

export default function GenerateLessonPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-[60px]">
        <Suspense fallback={<div className="p-12 text-center text-sm text-muted-foreground">Loading lesson engine...</div>}>
          <GenerateLessonModule />
        </Suspense>
      </main>
    </>
  );
}
