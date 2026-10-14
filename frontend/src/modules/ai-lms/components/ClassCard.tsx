'use client';

import React from 'react';
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
  const accent = lmsClass.accent_color || '#6366f1';

  return (
    <div
      className="glow-card-wrap relative h-full"
      style={{ '--card-accent': accent } as React.CSSProperties}
    >
      {!isOrganizeMode && <span className="glow-card-halo" aria-hidden="true" />}
      <div
        onClick={() => {
          if (!isOrganizeMode) {
            router.push(href);
          }
        }}
        role={isOrganizeMode ? undefined : 'button'}
        tabIndex={isOrganizeMode ? undefined : 0}
        aria-label={isOrganizeMode ? undefined : `Open ${lmsClass.name}`}
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
        className={`group lms-card glow-card p-[1.75rem] ${
          isOrganizeMode ? 'cursor-default' : 'lms-card-interactive'
        }`}
      >
        {!isOrganizeMode && <span className="glow-card-rim" aria-hidden="true" />}

        <div className="relative z-[2] flex-1">
          {/* Top Header: Icon & System badge/menu/reorder */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl border"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
                  color: accent,
                }}
              >
                <Icon name={lmsClass.icon || 'BookmarkIcon'} size={20} />
              </div>

              {orderIndex !== undefined && (
                <span className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md border"
                  style={{ color: `color-mix(in srgb, ${accent} 70%, var(--color-foreground))`, borderColor: `color-mix(in srgb, ${accent} 22%, transparent)`, background: `color-mix(in srgb, ${accent} 8%, transparent)` }}>
                  #{orderIndex + 1}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Reorder Buttons */}
              {(onMoveLeft || onMoveRight) && (
                <div
                  className={`flex items-center gap-1 bg-muted/70 p-1 rounded-xl border border-border ${isOrganizeMode ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'} transition-opacity`}
                >
                  <button
                    type="button"
                    disabled={!canMoveLeft}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveLeft?.();
                    }}
                    title="Move left"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
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
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-20 disabled:pointer-events-none transition-colors"
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

              {!isOrganizeMode && (onEdit || onDelete) && (
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEdit(lmsClass);
                      }}
                      title="Edit class & AI context"
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Icon name="TrashIcon" size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Title & Description */}
          <div className="mt-[1.5rem]">
            <h3 className="lms-card-title font-heading text-lg font-semibold leading-snug text-foreground break-words line-clamp-2" title={lmsClass.name}>
              {lmsClass.name}
            </h3>
            <p
              className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2"
              title={lmsClass.description || undefined}
            >
              {lmsClass.description || 'Curated lessons and technical modules.'}
            </p>
            {lmsClass.ai_context && (
              <div className="mt-[1.25rem] flex">
                <span className="lms-meta-pill" title={`AI focus: ${lmsClass.ai_context}`}>
                  <Icon name="SparklesIcon" size={12} className="flex-shrink-0" />
                  <span className="truncate">{lmsClass.ai_context}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Metadata & Open CTA */}
        <div className="relative z-[2] mt-[1.75rem] flex items-center justify-between gap-2 border-t pt-[1.25rem]"
          style={{ borderColor: 'color-mix(in srgb, var(--color-foreground) 10%, transparent)' }}>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {isOther ? (
              <span className="flex items-center gap-1" style={{ color: accent }}>
                <Icon name="DocumentTextIcon" size={14} />
                {lmsClass.lesson_count} direct {lmsClass.lesson_count === 1 ? 'lesson' : 'lessons'}
              </span>
            ) : (
              <>
                <span>
                  {lmsClass.subject_count} {lmsClass.subject_count === 1 ? 'subject' : 'subjects'}
                </span>
                <span>•</span>
                <span>
                  {lmsClass.lesson_count} {lmsClass.lesson_count === 1 ? 'lesson' : 'lessons'}
                </span>
              </>
            )}
          </div>

          <div
            className="lms-card-open inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: accent }}
          >
            <span>Open</span>
            <Icon name="ArrowRightIcon" size={14} />
          </div>
        </div>
      </div>
    </div>
  );
}
