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
      <div className="lms-panel p-5 sm:p-6 animate-pulse">
        <div className="h-4 w-36 bg-muted rounded mb-3" />
        <div className="h-7 w-72 bg-muted rounded mb-2" />
        <div className="h-4 w-48 bg-muted rounded" />
      </div>
    );
  }

  // Guidance fallback when user hasn't visited any lesson yet
  if (!item) {
    return (
      <div className="lms-panel p-[1.5rem] sm:p-[2rem]">
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
              className="lms-btn-primary lms-btn-lg"
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

  const tintStyle = (token: string, bg: number, bd: number): React.CSSProperties => ({
    color: `var(${token})`,
    background: `color-mix(in srgb, var(${token}) ${bg}%, transparent)`,
    borderColor: `color-mix(in srgb, var(${token}) ${bd}%, transparent)`,
  });

  return (
    <section className="lms-panel lms-lit p-[1.5rem] sm:p-[2rem] space-y-[1.5rem]" aria-label="Continue learning">
      {/* Recent Tracks Quick Switcher (when multiple tracks active) */}
      {recentItems && recentItems.length > 1 && (
        <div
          className="flex items-center gap-2 overflow-x-auto border-b pb-4 scrollbar-none"
          style={{ borderColor: 'color-mix(in srgb, var(--color-foreground) 10%, transparent)' }}
        >
          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Icon name="ClockIcon" size={12} />
            <span>Recent Tracks</span>
          </span>
          <div className="flex items-center gap-1.5">
            {recentItems.slice(0, 4).map((rec) => {
              const isActive = rec.lesson_id === item.lesson_id;
              return (
                <button
                  key={rec.lesson_id}
                  type="button"
                  onClick={() => onSelectTrack?.(rec)}
                  aria-pressed={isActive}
                  className={`lms-focus inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="max-w-[130px] truncate">{rec.class_name || rec.lesson_title}</span>
                  {rec.completed && <Icon name="CheckCircleIcon" size={12} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-[1.5rem] lg:flex-row lg:items-center lg:justify-between lg:gap-[2.5rem]">
        <div className="min-w-0 flex-1 space-y-[1.25rem]">
          {/* Status label + class / subject context */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            {isCompleted ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                style={tintStyle('--color-success', 12, 28)}
              >
                <Icon name="CheckCircleIcon" size={12} />
                <span>{hasNext ? 'Completed · Next topic ready' : 'Module completed'}</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                style={tintStyle('--color-primary', 12, 28)}
              >
                <Icon name="ArrowPathIcon" size={12} />
                <span>Continue Learning</span>
              </span>
            )}

            <Link
              href={`/ai-lms/classes/${item.class_slug}`}
              className="lms-focus rounded-md font-semibold text-foreground hover:text-primary transition-colors"
            >
              {item.class_name}
            </Link>

            {item.subject_name && (
              <>
                <Icon name="ChevronRightIcon" size={12} className="text-muted-foreground" />
                <Link
                  href={trackOverviewHref}
                  className="lms-focus rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.subject_name}
                </Link>
              </>
            )}
          </div>

          {/* Lesson title */}
          <div>
            <h3
              className="font-heading text-xl sm:text-2xl font-bold leading-tight tracking-tight text-foreground line-clamp-2 [text-wrap:balance]"
              title={item.lesson_title}
            >
              {item.lesson_title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {isCompleted && hasNext ? (
                <>
                  Next in track:{' '}
                  <span className="font-semibold text-foreground">{item.next_lesson?.title}</span>
                </>
              ) : isCompleted ? (
                <>You finished all lessons in this subject module.</>
              ) : (
                <>
                  Resuming your active session
                  {item.read_time_minutes ? <> · ~{item.read_time_minutes} min read</> : null}
                </>
              )}
            </p>
          </div>

          {/* Sequence info & progress */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums">
              Lesson {item.current_index} of {item.total_lessons}
            </span>
            <div
              className="h-1.5 w-28 overflow-hidden rounded-full sm:w-40"
              style={{ background: 'color-mix(in srgb, var(--color-foreground) 12%, transparent)' }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Lesson progress"
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPercent}%`,
                  background: isCompleted ? 'var(--color-success)' : 'var(--color-primary)',
                }}
              />
            </div>
            <span className="font-semibold tabular-nums text-foreground">{progressPercent}%</span>
          </div>
        </div>

        {/* Actions: one solid primary, one secondary */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-shrink-0">
          {isCompleted && hasNext ? (
            <>
              <Link href={nextLessonHref} className="lms-btn-primary lms-btn-lg">
                <Icon name="ArrowRightIcon" size={16} />
                <span>Start Next Lesson</span>
              </Link>
              <Link href={currentLessonHref} className="lms-btn-secondary lms-btn-lg">
                <Icon name="ArrowPathIcon" size={15} />
                <span>Review Lesson</span>
              </Link>
            </>
          ) : isCompleted ? (
            <>
              <Link href={trackOverviewHref} className="lms-btn-primary lms-btn-lg">
                <Icon name="Squares2X2Icon" size={16} />
                <span>Explore Class Modules</span>
              </Link>
              <Link href={currentLessonHref} className="lms-btn-secondary lms-btn-lg">
                <Icon name="ArrowPathIcon" size={15} />
                <span>Review</span>
              </Link>
            </>
          ) : (
            <>
              <Link href={currentLessonHref} className="lms-btn-primary lms-btn-lg">
                <Icon name="PlayIcon" variant="solid" size={14} />
                <span>Continue Lesson</span>
              </Link>
              <Link
                href={trackOverviewHref}
                className="lms-btn-secondary lms-btn-lg"
                title="View Track Outline"
              >
                <Icon name="ListBulletIcon" size={15} />
                <span>Track Outline</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
