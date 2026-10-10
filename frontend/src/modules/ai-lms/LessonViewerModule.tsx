'use client';

import React, { useState, useEffect } from 'react';
import { lmsService } from './services/lmsService';
import { recordLessonActivity } from './services/learningStateManager';
import type { LmsClass, LmsLesson, LmsNavigation, LmsSubject } from './types';
import LessonViewer from './components/LessonViewer';
import EmptyState from './components/EmptyState';
import { useLmsCopilotContext } from './context/LmsCopilotContext';
import { lessonCopilotContext } from './utils/copilotContext';

interface LessonViewerModuleProps {
  classSlug: string;
  subjectSlug?: string;
  lessonSlug: string;
}

export default function LessonViewerModule({
  classSlug,
  subjectSlug,
  lessonSlug,
}: LessonViewerModuleProps) {
  const [lesson, setLesson] = useState<LmsLesson | null>(null);
  const [navigation, setNavigation] = useState<LmsNavigation | null>(null);
  const [lmsClass, setLmsClass] = useState<LmsClass | null>(null);
  const [subject, setSubject] = useState<LmsSubject | null>(null);
  useLmsCopilotContext(lesson ? lessonCopilotContext(lesson, subject, lmsClass) : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        // Fetch lesson detail (which records view automatically). Scoped to the class and
        // subject in the URL: lesson slugs are only unique within a class.
        const lessonData = await lmsService.getLesson(lessonSlug, {
          classSlug,
          subjectSlug: subjectSlug && subjectSlug !== 'lesson' ? subjectSlug : undefined,
        });
        setLesson(lessonData);

        // Fetch navigation (prev/next)
        const navData = await lmsService.getNavigation(lessonData.id);
        setNavigation(navData);

        // Fetch class
        const clsData = await lmsService.getClass(classSlug);
        setLmsClass(clsData);

        // Fetch subject if present
        let subjData = null;
        if (subjectSlug && subjectSlug !== 'lesson') {
          subjData = await lmsService.getSubject(classSlug, subjectSlug);
          setSubject(subjData);
        }

        // Connect to active learning state
        recordLessonActivity({
          lesson: lessonData,
          navigation: navData,
          classSlug,
          className: clsData?.name,
          subjectSlug: subjectSlug && subjectSlug !== 'lesson' ? subjectSlug : undefined,
          subjectName: subjData?.name,
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load lesson.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [classSlug, subjectSlug, lessonSlug]);

  if (loading) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-64 bg-muted rounded" />
          <div className="h-8 w-32 bg-muted rounded" />
        </div>
        <div className="h-[600px] w-full rounded-2xl bg-muted" />
      </div>
    );
  }

  if (error || !lesson || !lmsClass) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-16 text-center">
        <EmptyState
          icon="ExclamationTriangleIcon"
          title="Lesson Not Found"
          description={error || 'The requested lesson could not be loaded.'}
          primaryAction={{
            label: 'Return to LMS Home',
            href: '/ai-lms',
            icon: 'ArrowLeftIcon',
          }}
        />
      </div>
    );
  }

  return (
    <LessonViewer lesson={lesson} navigation={navigation} lmsClass={lmsClass} subject={subject} />
  );
}
