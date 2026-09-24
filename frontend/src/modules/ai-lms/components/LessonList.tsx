'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [isOrganizeMode, setIsOrganizeMode] = React.useState(false);

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
    <div className="space-y-3">
      {/* Header bar with Organize Mode toggle */}
      <div className="flex items-center justify-between pb-1">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Icon name="QueueListIcon" size={14} className="text-primary" />
          <span>Curriculum Sequence ({lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'})</span>
        </div>

        {onReorder && lessons.length > 1 && (
          <button
            type="button"
            onClick={() => setIsOrganizeMode(!isOrganizeMode)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
              isOrganizeMode
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-card text-foreground border-border hover:bg-muted'
            }`}
          >
            <Icon name="ArrowsUpDownIcon" size={13} />
            <span>{isOrganizeMode ? 'Done Organizing' : 'Reorder Lessons'}</span>
          </button>
        )}
      </div>

      <div className="space-y-2.5">
      {lessons.map((lesson, idx) => {
        const lessonNumber = String(idx + 1).padStart(2, '0');
        const lessonHref = subjectSlug
          ? `/ai-lms/classes/${classSlug}/${subjectSlug}/${lesson.slug}`
          : `/ai-lms/classes/${classSlug}/lesson/${lesson.slug}`;

        return (
          <div
            key={lesson.id}
            onClick={() => {
              if (!isOrganizeMode) {
                router.push(lessonHref);
              }
            }}
            className={`group relative flex items-center justify-between rounded-xl border p-4 transition-all duration-200 ${
              isOrganizeMode
                ? 'border-primary/40 bg-card ring-1 ring-primary/20 cursor-default'
                : 'border-border bg-card cursor-pointer hover:border-primary/40 hover:bg-card/80 hover:shadow-sm'
            }`}
          >
            {/* Left: Sequence Number & Info */}
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <span className={`font-mono text-sm font-bold w-8 flex-shrink-0 transition-colors ${
                isOrganizeMode ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'
              }`}>
                {lessonNumber}
              </span>

              <div className="min-w-0 flex-1 pr-4">
                <div
                  className={`font-heading text-sm font-semibold truncate block transition-colors ${
                    isOrganizeMode ? 'text-foreground' : 'text-foreground group-hover:text-primary'
                  }`}
                >
                  {lesson.title}
                </div>
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
                <div className={`flex items-center gap-1 bg-muted/70 p-1 rounded-lg border border-border ${
                  isOrganizeMode ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'
                } transition-opacity`}>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => { e.stopPropagation(); handleMove(idx, 'up'); }}
                    title="Move up"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
                  >
                    <Icon name="ChevronUpIcon" size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === lessons.length - 1}
                    onClick={(e) => { e.stopPropagation(); handleMove(idx, 'down'); }}
                    title="Move down"
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
                  >
                    <Icon name="ChevronDownIcon" size={14} />
                  </button>
                </div>
              )}

              {/* Edit & Delete actions */}
              {!isOrganizeMode && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(lesson); }}
                      title="Edit lesson"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Icon name="PencilIcon" size={14} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(lesson); }}
                      title="Delete lesson"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                    >
                      <Icon name="TrashIcon" size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Open button */}
              {!isOrganizeMode && (
                <div
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/10 group-hover:bg-primary group-hover:text-white transition-all flex items-center gap-1"
                >
                  <span>Study</span>
                  <Icon name="ArrowRightIcon" size={12} />
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

