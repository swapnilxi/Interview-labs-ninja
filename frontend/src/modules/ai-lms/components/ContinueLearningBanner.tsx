'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { ContinueLearningItem } from '../types';

interface ContinueLearningBannerProps {
  item: ContinueLearningItem | null;
  recentItems?: ContinueLearningItem[];
  onSelectTrack?: (item: ContinueLearningItem) => void;
  loading?: boolean;
}

export default function ContinueLearningBanner({
  item,
  recentItems = [],
  onSelectTrack,
  loading,
}: ContinueLearningBannerProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-6 animate-pulse">
        <div className="h-4 w-36 bg-muted rounded mb-3" />
        <div className="h-7 w-72 bg-muted rounded mb-2" />
        <div className="h-4 w-48 bg-muted rounded" />
      </div>
    );
  }

  // Guidance fallback when user hasn't visited any lesson yet
  if (!item) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/80 backdrop-blur-md p-5 sm:p-6 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
              <Icon name="SparklesIcon" size={13} />
              <span>Welcome to AI LMS</span>
            </div>
            <h3 className="font-heading text-lg sm:text-xl font-bold text-foreground">
              Ready to begin your engineering journey?
            </h3>
            <p className="text-xs text-muted-foreground max-w-xl">
              Choose any curriculum class below to start structured lessons, or generate custom modules with AI personas.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/ai-lms/generate"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-xs shadow-sm hover:opacity-95 transition-all"
            >
              <Icon name="SparklesIcon" size={15} />
              <span>Generate Lesson</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCompleted = Boolean(item.completed);
  const hasNext = Boolean(item.next_lesson);

  // Link for the current lesson
  const currentLessonHref = item.subject_slug
    ? `/ai-lms/classes/${item.class_slug}/${item.subject_slug}/${item.lesson_slug}`
    : `/ai-lms/classes/${item.class_slug}/lesson/${item.lesson_slug}`;

  // Link for the next lesson (if current is completed and next exists)
  const nextLessonHref = item.next_lesson
    ? item.subject_slug
      ? `/ai-lms/classes/${item.class_slug}/${item.subject_slug}/${item.next_lesson.slug}`
      : `/ai-lms/classes/${item.class_slug}/lesson/${item.next_lesson.slug}`
    : currentLessonHref;

  // Overview track link
  const trackOverviewHref = item.subject_slug
    ? `/ai-lms/classes/${item.class_slug}/${item.subject_slug}`
    : `/ai-lms/classes/${item.class_slug}`;

  // Authentic progress calculation
  let progressPercent = 50;
  if (isCompleted) {
    progressPercent = 100;
  } else if (item.total_lessons > 1) {
    progressPercent = Math.max(
      15,
      Math.min(95, Math.round(((item.current_index - 0.5) / item.total_lessons) * 100))
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/90 backdrop-blur-md p-5 sm:p-6 shadow-md transition-all duration-300 hover:border-primary/50 hover:shadow-lg space-y-4">
      {/* Decorative ambient background glows */}
      <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Recent Tracks Quick Switcher (when multiple tracks active) */}
      {recentItems && recentItems.length > 1 && (
        <div className="relative z-10 flex items-center gap-2 overflow-x-auto pb-1 border-b border-border/50 scrollbar-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex-shrink-0 flex items-center gap-1">
            <Icon name="ClockIcon" size={12} />
            <span>Recent Tracks:</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {recentItems.slice(0, 4).map((rec) => {
              const isActive = rec.lesson_id === item.lesson_id;
              return (
                <button
                  key={rec.lesson_id}
                  type="button"
                  onClick={() => onSelectTrack?.(rec)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50'
                  }`}
                >
                  <span className="truncate max-w-[130px]">{rec.class_name || rec.lesson_title}</span>
                  {rec.completed && (
                    <Icon name="CheckCircleIcon" size={12} className={isActive ? 'text-white' : 'text-emerald-500'} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Continue Learning Card Content */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
        <div className="space-y-2.5">
          {/* Breadcrumbs & Status Tag */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isCompleted ? (
              <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                <Icon name="CheckCircleIcon" size={12} />
                <span>{hasNext ? 'Lesson Completed • Ready for Next Topic' : 'Module Completed'}</span>
              </span>
            ) : (
              <span className="font-bold text-primary uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                <Icon name="ArrowPathIcon" size={12} className="animate-spin-slow" />
                <span>Continue Learning</span>
              </span>
            )}

            <span className="text-muted-foreground">•</span>
            <Link
              href={`/ai-lms/classes/${item.class_slug}`}
              className="px-2.5 py-0.5 rounded-full bg-muted/90 text-foreground hover:bg-muted font-semibold text-xs border border-border/60 transition-colors"
            >
              {item.class_name}
            </Link>

            {item.subject_name && (
              <>
                <span className="text-muted-foreground">/</span>
                <Link
                  href={trackOverviewHref}
                  className="text-muted-foreground hover:text-foreground font-medium text-xs transition-colors"
                >
                  {item.subject_name}
                </Link>
              </>
            )}
          </div>

          {/* Lesson Title */}
          <div>
            <h3 className="font-heading text-lg sm:text-2xl font-extrabold text-foreground tracking-tight">
              {item.lesson_title}
            </h3>
            {/* Contextual User Guidance Prompt */}
            <p className="text-xs text-muted-foreground mt-0.5">
              {isCompleted && hasNext ? (
                <span className="text-foreground font-medium">
                  🎯 Next in Track: <span className="text-primary font-semibold">{item.next_lesson?.title}</span>
                </span>
              ) : isCompleted && !hasNext ? (
                <span>🎉 Great job! You finished all lessons in this subject module.</span>
              ) : (
                <span>
                  Resuming your active session • Est. ~{item.read_time_minutes || 5} min read
                </span>
              )}
            </p>
          </div>

          {/* Sequence info & Progress Bar */}
          <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground pt-0.5">
            <span className="font-medium">
              Lesson {item.current_index} of {item.total_lessons}
            </span>
            <div className="w-24 sm:w-36 h-2 rounded-full bg-muted overflow-hidden border border-border/40 p-[1px]">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isCompleted
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-r from-primary to-indigo-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                isCompleted
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-foreground'
              }`}
            >
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Guided Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-shrink-0">
          {/* If completed and next lesson is available, primary button guides to Next Lesson */}
          {isCompleted && hasNext ? (
            <>
              <Link
                href={nextLessonHref}
                className="group relative inline-flex items-center justify-center gap-2.5 px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300 border border-white/20 overflow-hidden flex-shrink-0"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out pointer-events-none" />
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white/20 backdrop-blur-md text-white">
                  <Icon name="ArrowRightIcon" size={13} className="text-white" />
                </span>
                <span className="tracking-wide">Start Next Lesson</span>
              </Link>

              <Link
                href={currentLessonHref}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold transition-all"
              >
                <Icon name="ArrowPathIcon" size={13} />
                <span>Review Lesson</span>
              </Link>
            </>
          ) : isCompleted && !hasNext ? (
            <>
              <Link
                href={trackOverviewHref}
                className="group relative inline-flex items-center justify-center gap-2.5 px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-primary text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300 border border-white/20 overflow-hidden flex-shrink-0"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out pointer-events-none" />
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white/20 backdrop-blur-md text-white">
                  <Icon name="Squares2X2Icon" size={13} className="text-white" />
                </span>
                <span className="tracking-wide">Explore Class Modules</span>
              </Link>

              <Link
                href={currentLessonHref}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold transition-all"
              >
                <Icon name="ArrowPathIcon" size={13} />
                <span>Review</span>
              </Link>
            </>
          ) : (
            /* Active in-progress lesson */
            <>
              <Link
                href={currentLessonHref}
                className="group relative inline-flex items-center justify-center gap-3 px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl bg-gradient-to-r from-primary via-indigo-600 to-violet-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300 border border-white/20 overflow-hidden flex-shrink-0"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 ease-in-out pointer-events-none" />
                <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-white/20 backdrop-blur-md text-white group-hover:bg-white/30 group-hover:scale-110 transition-all duration-300 shadow-xs">
                  <Icon name="PlayIcon" variant="solid" size={13} className="translate-x-0.5 text-white" />
                </span>
                <span className="tracking-wide">Continue Lesson</span>
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-white/10 group-hover:bg-white/20 group-hover:translate-x-1 transition-all duration-300">
                  <Icon name="ArrowRightIcon" size={14} className="text-white" />
                </span>
              </Link>

              <Link
                href={trackOverviewHref}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-semibold transition-all"
                title="View Track Outline"
              >
                <Icon name="ListBulletIcon" size={14} />
                <span className="hidden sm:inline">Track Outline</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
