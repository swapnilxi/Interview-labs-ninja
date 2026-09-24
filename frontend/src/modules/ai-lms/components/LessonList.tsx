'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { LmsLesson } from '../types';

interface LessonListProps {
  lessons: LmsLesson[];
  classSlug: string;
  subjectSlug?: string;
  onEdit?: (lesson: LmsLesson) => void;
  onDelete?: (lesson: LmsLesson) => void;
  onReorder?: (newOrderedIds: string[]) => void;
}

export default function LessonList({
  lessons,
  classSlug,
  subjectSlug,
  onEdit,
  onDelete,
  onReorder,
}: LessonListProps) {
  if (lessons.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon name="DocumentTextIcon" size={24} />
        </div>
        <h4 className="mt-3 font-heading text-sm font-semibold text-foreground">No lessons yet</h4>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          Generate an interactive lesson using AI or create one manually to start learning.
        </p>
      </div>
    );
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (!onReorder) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;

    const newLessons = [...lessons];
    const temp = newLessons[index];
    newLessons[index] = newLessons[targetIndex];
    newLessons[targetIndex] = temp;

    onReorder(newLessons.map((l) => l.id));
  };

  return (
    <div className="space-y-2.5">
      {lessons.map((lesson, idx) => {
        const lessonNumber = String(idx + 1).padStart(2, '0');
        const lessonHref = subjectSlug
          ? `/ai-lms/classes/${classSlug}/${subjectSlug}/${lesson.slug}`
          : `/ai-lms/classes/${classSlug}/lesson/${lesson.slug}`;

        return (
          <div
            key={lesson.id}
            className="group relative flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/40 hover:bg-card/80 hover:shadow-sm"
          >
            {/* Left: Sequence Number & Info */}
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <span className="font-mono text-sm font-bold text-muted-foreground group-hover:text-primary transition-colors w-7 flex-shrink-0">
                {lessonNumber}
              </span>

              <div className="min-w-0 flex-1 pr-4">
                <Link
                  href={lessonHref}
                  className="font-heading text-sm font-semibold text-foreground hover:text-primary transition-colors truncate block"
                >
                  {lesson.title}
                </Link>
                {lesson.summary && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {lesson.summary}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Read time, source badge, actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="ClockIcon" size={13} />
                <span>{lesson.read_time_minutes || 5} min read</span>
              </div>

              {lesson.source_type && (
                <span className="hidden md:inline-block px-2 py-0.5 rounded text-[10px] uppercase font-semibold tracking-wider bg-muted text-muted-foreground">
                  {lesson.source_type}
                </span>
              )}

              {/* Reorder buttons */}
              {onReorder && lessons.length > 1 && (
                <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'up')}
                    title="Move up"
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 hover:bg-muted"
                  >
                    <Icon name="ChevronUpIcon" size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === lessons.length - 1}
                    onClick={() => handleMove(idx, 'down')}
                    title="Move down"
                    className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 hover:bg-muted"
                  >
                    <Icon name="ChevronDownIcon" size={13} />
                  </button>
                </div>
              )}

              {/* Edit & Delete actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(lesson)}
                    title="Edit lesson"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Icon name="PencilIcon" size={14} />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(lesson)}
                    title="Delete lesson"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                  >
                    <Icon name="TrashIcon" size={14} />
                  </button>
                )}
              </div>

              {/* Open button */}
              <Link
                href={lessonHref}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-white transition-all flex items-center gap-1"
              >
                <span>Study</span>
                <Icon name="ArrowRightIcon" size={12} />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
