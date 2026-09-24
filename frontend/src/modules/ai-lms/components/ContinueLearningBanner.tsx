'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { ContinueLearningItem } from '../types';

interface ContinueLearningBannerProps {
  item: ContinueLearningItem | null;
  loading?: boolean;
}

export default function ContinueLearningBanner({ item, loading }: ContinueLearningBannerProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-6 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="h-6 w-64 bg-muted rounded mb-2" />
        <div className="h-4 w-48 bg-muted rounded" />
      </div>
    );
  }

  if (!item) return null;

  const targetHref = item.subject_slug
    ? `/ai-lms/classes/${item.class_slug}/${item.subject_slug}/${item.lesson_slug}`
    : `/ai-lms/classes/${item.class_slug}/lesson/${item.lesson_slug}`;

  const progressPercent = item.total_lessons > 0
    ? Math.round((item.current_index / item.total_lessons) * 100)
    : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-card via-card to-primary/5 p-6 shadow-md transition-all duration-300 hover:border-primary/40">
      {/* Decorative background glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          {/* Breadcrumb badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-primary uppercase tracking-wider text-[11px] flex items-center gap-1">
              <Icon name="ArrowPathIcon" size={13} />
              Continue Learning
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="px-2 py-0.5 rounded-full bg-muted/80 text-foreground font-medium text-xs">
              {item.class_name}
            </span>
            {item.subject_name && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground font-medium text-xs">
                  {item.subject_name}
                </span>
              </>
            )}
          </div>

          {/* Lesson Title */}
          <h3 className="font-heading text-xl md:text-2xl font-bold text-foreground">
            {item.lesson_title}
          </h3>

          {/* Sequence info & Progress Bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            <span>
              Lesson {item.current_index} of {item.total_lessons}
            </span>
            <div className="w-28 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">{progressPercent}%</span>
          </div>
        </div>

        {/* CTA Button */}
        <div className="flex items-center gap-3">
          <Link
            href={targetHref}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-medium text-sm shadow-md shadow-primary/20 hover:bg-primary/90 transition-all hover:scale-102 flex-shrink-0"
          >
            <span>Continue Lesson</span>
            <Icon name="ArrowRightIcon" size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
