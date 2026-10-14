'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import type { LmsSubject } from '../types';
import { useGlowSpotlight } from './useGlowSpotlight';

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
  const { ref, onPointerMove, onPointerEnter, onPointerLeave } = useGlowSpotlight<HTMLDivElement>();
  const href = `/ai-lms/classes/${classSlug}/${subject.slug}`;
  const isProject = subject.kind === 'project';
  const accent = subject.accent_color || (isProject ? '#8b5cf6' : '#38bdf8');

  return (
    <div
      className="glow-card-wrap relative"
      style={{ '--card-accent': accent } as React.CSSProperties}
    >
      {!isOrganizeMode && <span className="glow-card-halo" aria-hidden="true" />}
      <div
        ref={isOrganizeMode ? undefined : ref}
        onClick={() => {
          if (!isOrganizeMode) {
            router.push(href);
          }
        }}
        onPointerMove={isOrganizeMode ? undefined : onPointerMove}
        onPointerEnter={isOrganizeMode ? undefined : onPointerEnter}
        onPointerLeave={isOrganizeMode ? undefined : onPointerLeave}
        role={isOrganizeMode ? undefined : 'button'}
        tabIndex={isOrganizeMode ? undefined : 0}
        onKeyDown={
          isOrganizeMode
            ? undefined
            : (e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(href);
                }
              }
        }
        className={`group relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm focus-ring ${
          isOrganizeMode
            ? 'border-secondary/40 ring-1 ring-secondary/20 cursor-default'
            : 'glow-card cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1'
        }`}
      >
        {!isOrganizeMode && (
          <>
            <span className="glow-card-rim" aria-hidden="true" />
            <span className="glow-card-spotlight" aria-hidden="true" />
          </>
        )}

        {/* Top subtle accent gradient bar */}
        <div
          className="absolute top-0 left-4 right-4 h-[2px] rounded-full opacity-40 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />

        <div className="relative z-[2]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg font-semibold text-xs border transition-transform duration-300 group-hover:scale-105"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${accent} 28%, transparent)`,
                  color: accent,
                }}
              >
                <Icon name={isProject ? 'CodeBracketSquareIcon' : 'FolderIcon'} size={18} />
              </div>

              {orderIndex !== undefined && (
                <span className="tabular-nums text-xs font-bold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                  #{orderIndex + 1}
                </span>
              )}

              {!isOrganizeMode && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
                    borderColor: `color-mix(in srgb, ${accent} 25%, transparent)`,
                    color: accent,
                  }}
                >
                  {isProject ? 'Project' : 'Subject'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Reorder Buttons */}
              {(onMoveLeft || onMoveRight) && (
                <div
                  className={`flex items-center gap-0.5 bg-muted/70 p-1 rounded-lg border border-border ${isOrganizeMode ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'} transition-opacity`}
                >
                  <button
                    type="button"
                    disabled={!canMoveLeft}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveLeft?.();
                    }}
                    title="Move left / up"
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
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
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
                  >
                    <Icon name="ArrowRightIcon" size={12} />
                  </button>
                </div>
              )}

              {!isOrganizeMode && (onEdit || onDelete) && (
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEdit(subject);
                      }}
                      title="Edit subject"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
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
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <Icon name="TrashIcon" size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-heading text-base font-semibold text-foreground transition-colors group-hover:text-[var(--card-accent)] group-focus-visible:text-[var(--card-accent)]">
              {subject.name}
            </h4>
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {subject.description ||
                (isProject
                  ? 'AI-generated implementation modules for this project.'
                  : 'Structured sequence of lessons.')}
            </p>
            {subject.ai_context && (
              <div
                className="mt-2.5 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
                  borderColor: `color-mix(in srgb, ${accent} 22%, transparent)`,
                  color: accent,
                }}
              >
                <Icon name="SparklesIcon" size={12} className="flex-shrink-0" />
                <span className="truncate">AI: {subject.ai_context}</span>
              </div>
            )}
          </div>
        </div>

        <div className="relative z-[2] mt-5 flex items-center justify-between pt-3 border-t border-border/60 text-xs">
          <span className="font-medium text-muted-foreground">
            {isProject
              ? `${subject.lesson_count} ${subject.lesson_count === 1 ? 'lesson generated' : 'lessons generated'}`
              : `${subject.lesson_count} ${subject.lesson_count === 1 ? 'lesson' : 'lessons'}`}
          </span>

          <div
            className="inline-flex items-center gap-1 font-semibold group-hover:translate-x-1 transition-transform"
            style={{ color: accent }}
          >
            <span>{isProject ? 'Open Project' : 'View Lessons'}</span>
            <Icon name="ArrowRightIcon" size={13} />
          </div>
        </div>
      </div>
    </div>
  );
}
