'use client';

import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { LmsClass } from '../types';

interface ClassCardProps {
  lmsClass: LmsClass;
  onEdit?: (cls: LmsClass) => void;
  onDelete?: (cls: LmsClass) => void;
}

export default function ClassCard({ lmsClass, onEdit, onDelete }: ClassCardProps) {
  const isOther = lmsClass.slug === 'other';

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5">
      <div>
        {/* Top Header: Icon & System badge/menu */}
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
            <Icon name={(lmsClass.icon || 'BookmarkIcon') as any} size={24} />
          </div>

          <div className="flex items-center gap-1.5">
            {lmsClass.is_system === 1 ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                Core
              </span>
            ) : (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit(lmsClass);
                    }}
                    title="Edit class"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Icon name="PencilIcon" size={14} />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(lmsClass);
                    }}
                    title="Delete class"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  >
                    <Icon name="TrashIcon" size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Title & Description */}
        <div className="mt-5">
          <h3 className="font-heading text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
            {lmsClass.name}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {lmsClass.description || 'Curated lessons and technical modules.'}
          </p>
        </div>
      </div>

      {/* Footer: Metadata & Open CTA */}
      <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/60">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {isOther ? (
            <span className="flex items-center gap-1 text-accent">
              <Icon name="DocumentTextIcon" size={14} />
              {lmsClass.lesson_count} direct {lmsClass.lesson_count === 1 ? 'lesson' : 'lessons'}
            </span>
          ) : (
            <>
              <span>{lmsClass.subject_count} {lmsClass.subject_count === 1 ? 'subject' : 'subjects'}</span>
              <span>•</span>
              <span>{lmsClass.lesson_count} {lmsClass.lesson_count === 1 ? 'lesson' : 'lessons'}</span>
            </>
          )}
        </div>

        <Link
          href={`/ai-lms/classes/${lmsClass.slug}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform"
        >
          <span>Open</span>
          <Icon name="ArrowRightIcon" size={14} />
        </Link>
      </div>
    </div>
  );
}
