'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import type { LmsClass } from '../types';

interface ClassCardProps {
  lmsClass: LmsClass;
  onEdit?: (cls: LmsClass) => void;
  onDelete?: (cls: LmsClass) => void;
  isOrganizeMode?: boolean;
  orderIndex?: number;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

export default function ClassCard({
  lmsClass,
  onEdit,
  onDelete,
  isOrganizeMode = false,
  orderIndex,
  canMoveLeft = false,
  canMoveRight = false,
  onMoveLeft,
  onMoveRight,
}: ClassCardProps) {
  const router = useRouter();
  const isOther = lmsClass.slug === 'other';
  const href = `/ai-lms/classes/${lmsClass.slug}`;

  return (
    <div 
      onClick={() => {
        if (!isOrganizeMode) {
          router.push(href);
        }
      }}
      className={`group relative flex flex-col justify-between rounded-2xl border bg-card p-6 shadow-sm transition-all duration-300 ${
        isOrganizeMode
          ? 'border-primary/40 ring-1 ring-primary/20 cursor-default'
          : 'border-border cursor-pointer hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5'
      }`}
    >
      <div>
        {/* Top Header: Icon & System badge/menu/reorder */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
              <Icon name={(lmsClass.icon || 'BookmarkIcon') as any} size={24} />
            </div>

            {orderIndex !== undefined && (
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                #{orderIndex + 1}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Reorder Buttons */}
            {(onMoveLeft || onMoveRight) && (
              <div className={`flex items-center gap-1 bg-muted/70 p-1 rounded-xl border border-border ${isOrganizeMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                <button
                  type="button"
                  disabled={!canMoveLeft}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMoveLeft?.();
                  }}
                  title="Move left"
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
                >
                  <Icon name="ArrowLeftIcon" size={13} />
                </button>
                <button
                  type="button"
                  disabled={!canMoveRight}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMoveRight?.();
                  }}
                  title="Move right"
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
                >
                  <Icon name="ArrowRightIcon" size={13} />
                </button>
              </div>
            )}

            {lmsClass.is_system === 1 && !isOrganizeMode && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                Core
              </span>
            )}

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit(lmsClass);
                  }}
                  title="Edit class & AI context"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Icon name="PencilIcon" size={14} />
                </button>
              )}
              {onDelete && lmsClass.is_system !== 1 && (
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
          {lmsClass.ai_context && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-primary/90 font-mono bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10">
              <Icon name="SparklesIcon" size={12} className="flex-shrink-0 text-primary" />
              <span className="truncate">AI: {lmsClass.ai_context}</span>
            </div>
          )}
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

        <div
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary group-hover:translate-x-1 transition-transform"
        >
          <span>Open</span>
          <Icon name="ArrowRightIcon" size={14} />
        </div>
      </div>
    </div>
  );
}
