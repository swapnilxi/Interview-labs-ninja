'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import type { LmsClass } from '../types';
import { useGlowSpotlight } from './useGlowSpotlight';

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
  const { ref, onPointerMove, onPointerEnter, onPointerLeave } = useGlowSpotlight<HTMLDivElement>();
  const isOther = lmsClass.slug === 'other';
  const href = `/ai-lms/classes/${lmsClass.slug}`;
  const accent = lmsClass.accent_color || '#6366f1';

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
        className={`group relative flex flex-col justify-between rounded-2xl border bg-card p-[24px] shadow-sm focus-ring ${
          isOrganizeMode
            ? 'border-primary/40 ring-1 ring-primary/20 cursor-default'
            : 'glow-card cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1'
        }`}
      >
        {!isOrganizeMode && (
          <>
            <span className="glow-card-rim" aria-hidden="true" />
            <span className="glow-card-spotlight" aria-hidden="true" />
          </>
        )}

        {/* Top subtle accent gradient edge bar */}
        <div
          className="absolute top-0 left-6 right-6 h-[2.5px] rounded-full opacity-45 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />

        <div className="relative z-[2]">
          {/* Top Header: Icon & System badge/menu/reorder */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex h-[44px] w-[44px] items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-105"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
                  color: accent,
                }}
              >
                <Icon name={lmsClass.icon || 'BookmarkIcon'} size={22} />
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
          <div className="mt-5">
            <h3 className="font-heading text-lg font-semibold text-foreground transition-colors group-hover:text-[var(--card-accent)] group-focus-visible:text-[var(--card-accent)]">
              {lmsClass.name}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {lmsClass.description || 'Curated lessons and technical modules.'}
            </p>
            {lmsClass.ai_context && (
              <div
                className="mt-3 flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg border"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
                  borderColor: `color-mix(in srgb, ${accent} 22%, transparent)`,
                  color: accent,
                }}
              >
                <Icon name="SparklesIcon" size={12} className="flex-shrink-0" />
                <span className="truncate">AI: {lmsClass.ai_context}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Metadata & Open CTA */}
        <div className="relative z-[2] mt-[20px] flex items-center justify-between pt-[16px] border-t border-border/60">
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
            className="inline-flex items-center gap-1 text-xs font-semibold group-hover:translate-x-1 transition-transform"
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
