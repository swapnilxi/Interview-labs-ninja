'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { SwipeLearnView } from '../types';

interface SwipeLearnHeaderProps {
  view: SwipeLearnView;
  savedCount: number;
  onNavigate: (view: SwipeLearnView) => void;
  onGenerate: () => void;
  onOpenSettings: () => void;
  isGenerating?: boolean;
}

const VIEWS: Array<{ id: SwipeLearnView; label: string; icon: string }> = [
  { id: 'swipe', label: 'Swipe', icon: 'Square3Stack3DIcon' },
  { id: 'scroll', label: 'Scroll', icon: 'QueueListIcon' },
  { id: 'saved', label: 'Saved', icon: 'BookmarkIcon' },
];

/**
 * One compact row: the view switch (the module's own navigation, so phones don't get a second bottom bar
 * on top of the app's tab bar), then Generate and Settings. The brand only shows where there is room.
 */
export default function SwipeLearnHeader({
  view,
  savedCount,
  onNavigate,
  onGenerate,
  onOpenSettings,
  isGenerating = false,
}: SwipeLearnHeaderProps) {
  return (
    <div className="z-30 flex w-full shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-2 sm:px-4">
      <div className="mr-1 hidden items-center gap-2.5 md:flex">
        <div className="swipe-empty-icon flex h-9 w-9 items-center justify-center rounded-xl">
          <Icon name="Square3Stack3DIcon" size={20} variant="solid" />
        </div>
        <div className="leading-tight">
          <p className="font-heading text-base font-bold text-foreground">SwipeLearn</p>
          <p className="text-xs text-muted-foreground">Micro-learning feed</p>
        </div>
      </div>

      <nav aria-label="SwipeLearn views" className="swipe-seg">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onNavigate(v.id)}
            aria-current={view === v.id ? 'page' : undefined}
            className="swipe-seg-btn"
          >
            <Icon
              name={v.icon}
              size={16}
              variant={view === v.id ? 'solid' : 'outline'}
              className="hidden sm:block"
            />
            <span>{v.label}</span>
            {v.id === 'saved' && savedCount > 0 && (
              <span className="swipe-count" aria-label={`${savedCount} saved`}>
                {savedCount > 99 ? '99+' : savedCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="swipe-generate-btn"
          aria-label="Generate new cards with AI"
          title="Generate new cards with AI"
        >
          {isGenerating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Icon name="SparklesIcon" size={17} variant="solid" />
          )}
          <span className="hidden min-[430px]:inline">
            {isGenerating ? 'Writing…' : 'Generate'}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="swipe-icon-btn"
          aria-label="SwipeLearn settings"
          title="Settings"
        >
          <Icon name="Cog6ToothIcon" size={21} />
        </button>
      </div>
    </div>
  );
}
