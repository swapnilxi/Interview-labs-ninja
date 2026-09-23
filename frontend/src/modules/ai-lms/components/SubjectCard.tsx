'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { LmsSubject } from '../types';

interface SubjectCardProps {
  subject: LmsSubject;
  classSlug: string;
  onEdit?: (subj: LmsSubject) => void;
  onDelete?: (subj: LmsSubject) => void;
}

export default function SubjectCard({ subject, classSlug, onEdit, onDelete }: SubjectCardProps) {
  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 font-semibold text-xs border border-emerald-500/20">
              <Icon name="FolderIcon" size={18} />
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Module
            </span>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEdit(subject);
                }}
                title="Edit subject"
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Icon name="PencilIcon" size={13} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(subject);
                }}
                title="Delete subject"
                className="p-1 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
              >
                <Icon name="TrashIcon" size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          <h4 className="font-heading text-base font-semibold text-foreground group-hover:text-primary transition-colors">
            {subject.name}
          </h4>
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {subject.description || 'Structured sequence of lessons.'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between pt-3 border-t border-border/50 text-xs">
        <span className="font-medium text-muted-foreground">
          {subject.lesson_count} {subject.lesson_count === 1 ? 'lesson' : 'lessons'}
        </span>

        <Link
          href={`/ai-lms/classes/${classSlug}/${subject.slug}`}
          className="inline-flex items-center gap-1 font-semibold text-primary group-hover:translate-x-1 transition-transform"
        >
          <span>View Lessons</span>
          <Icon name="ArrowRightIcon" size={13} />
        </Link>
      </div>
    </div>
  );
}
