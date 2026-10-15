'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import BackButton from '@/components/ui/BackButton';
import GenerateLessonForm from './components/GenerateLessonForm';

export default function GenerateLessonModule() {
  const searchParams = useSearchParams();
  const classSlug = searchParams.get('class') || undefined;
  const subjectSlug = searchParams.get('subject') || undefined;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-8">
      {/* Reached from the AI LMS home, a class and a subject: Back returns to whichever of them the user came
          from, and to the AI LMS home when there is no earlier screen (a refresh, a shared link). */}
      <div>
        <BackButton href="/ai-lms" label="Back" preferHistory className="-ml-2.5" />
      </div>

      <GenerateLessonForm initialClassSlug={classSlug} initialSubjectSlug={subjectSlug} />
    </div>
  );
}
