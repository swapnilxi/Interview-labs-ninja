'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import type { LmsSubject } from '../types';

interface SubjectCardProps {
  subject: LmsSubject;
  classSlug: string;
  onEdit?: (subj: LmsSubject) => void;
  onDelete?: (subj: LmsSubject) => void;
  isOrganizeMode?: boolean;
  orderIndex?: number;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

export default function SubjectCard({
  subject,
  classSlug,
  onEdit,
  onDelete,
  isOrganizeMode = false,
  orderIndex,
  canMoveLeft = false,
  canMoveRight = false,
  onMoveLeft,
  onMoveRight,
}: SubjectCardProps) {
  const router = useRouter();
  const href = `/ai-lms/classes/${classSlug}/${subject.slug}`;

  return (
    <div 
      onClick={() => {
        if (!isOrganizeMode) {
          router.push(href);
        }
      }}
      className={`group relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm transition-all duration-200 ${
        isOrganizeMode
          ? 'border-emerald-500/40 ring-1 ring-emerald-500/20 cursor-default'
          : 'border-border cursor-pointer hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 font-semibold text-xs border border-emerald-500/20">
              <Icon name="FolderIcon" size={18} />
            </div>

            {orderIndex !== undefined && (
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                #{orderIndex + 1}
              </span>
            )}

            {!isOrganizeMode && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                Module
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Reorder Buttons */}
            {(onMoveLeft || onMoveRight) && (
              <div className={`flex items-center gap-0.5 bg-muted/70 p-1 rounded-lg border border-border ${isOrganizeMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <button
                  type="button"
                  disabled={!canMoveLeft}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMoveLeft?.();
                  }}
                  title="Move left / up"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
                >
                  <Icon name="ArrowLeftIcon" size={12} />
                </button>
                <button
                  type="button"
                  disabled={!canMoveRight}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMoveRight?.();
                  }}
                  title="Move right / down"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
                >
                  <Icon name="ArrowRightIcon" size={12} />
                </button>
              </div>
            )}

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
        </div>

        <div className="mt-4">
          <h4 className="font-heading text-base font-semibold text-foreground group-hover:text-primary transition-colors">
            {subject.name}
          </h4>
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {subject.description || 'Structured sequence of lessons.'}
          </p>
          {subject.ai_context && (
            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/5 px-2.5 py-1 rounded-lg border border-emerald-500/10">
              <Icon name="SparklesIcon" size={12} className="flex-shrink-0 text-emerald-500" />
              <span className="truncate">AI: {subject.ai_context}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between pt-3 border-t border-border/50 text-xs">
        <span className="font-medium text-muted-foreground">
          {subject.lesson_count} {subject.lesson_count === 1 ? 'lesson' : 'lessons'}
        </span>

        <div
          className="inline-flex items-center gap-1 font-semibold text-primary group-hover:translate-x-1 transition-transform"
        >
          <span>View Lessons</span>
          <Icon name="ArrowRightIcon" size={13} />
        </div>
      </div>
    </div>
  );
}
