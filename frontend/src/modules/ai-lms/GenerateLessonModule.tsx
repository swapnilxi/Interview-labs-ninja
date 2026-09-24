'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import GenerateLessonForm from './components/GenerateLessonForm';

export default function GenerateLessonModule() {
  const searchParams = useSearchParams();
  const classSlug = searchParams.get('class') || undefined;
  const subjectSlug = searchParams.get('subject') || undefined;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-8">
      {/* Navigation link */}
      <div>
        <Link
          href="/ai-lms"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="ArrowLeftIcon" size={14} />
          <span>Back to AI LMS</span>
        </Link>
      </div>

      <GenerateLessonForm
        initialClassSlug={classSlug}
        initialSubjectSlug={subjectSlug}
      />
    </div>
  );
}
