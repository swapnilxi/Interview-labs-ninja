'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

interface EmptyDeckStateProps {
  /** true: the deck has no cards at all; false: every card was swiped. */
  fresh: boolean;
  deckLabel: string;
  total: number;
  hasKey: boolean;
  /** A generate call is running; `quickBusyCount` is its size when it was started from here. */
  busy: boolean;
  quickBusyCount?: number;
  onQuickGenerate: () => void;
  onOpenGenerate: () => void;
  onOpenSettings: () => void;
  onReviewAgain?: () => void;
}

/** End of a deck (or a topic with no cards yet): one tap writes the next batch. */
export default function EmptyDeckState({
  fresh,
  deckLabel,
  total,
  hasKey,
  busy,
  quickBusyCount,
  onQuickGenerate,
  onOpenGenerate,
  onOpenSettings,
  onReviewAgain,
}: EmptyDeckStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-5 py-8 text-center animate-fadeIn">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
          fresh ? 'swipe-empty-icon' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
        }`}
      >
        <Icon name={fresh ? 'SparklesIcon' : 'CheckBadgeIcon'} size={32} variant="solid" />
      </div>
      <h3 className="mt-4 font-heading text-xl font-bold text-foreground">
        {fresh ? `No ${deckLabel} cards yet` : "You're all caught up"}
      </h3>
      <p className="mt-1.5 max-w-[19rem] text-sm leading-relaxed text-muted-foreground">
        {fresh
          ? 'Generate a first batch with AI and start learning.'
          : `You've been through all ${total} ${deckLabel} cards. Generate fresh ones, or go round again.`}
      </p>

      <div className="mt-5 flex w-full max-w-[17rem] flex-col gap-2">
        {hasKey ? (
          <>
            <button
              type="button"
              onClick={onQuickGenerate}
              disabled={busy}
              className="swipe-primary-btn"
            >
              {quickBusyCount ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon name="SparklesIcon" size={18} variant="solid" />
              )}
              {quickBusyCount ? `Writing ${quickBusyCount} cards…` : 'Generate 5 cards'}
            </button>
            <button
              type="button"
              onClick={onOpenGenerate}
              disabled={busy}
              className="swipe-secondary-btn"
            >
              <Icon name="AdjustmentsHorizontalIcon" size={17} />
              Choose type and focus
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onOpenSettings} className="swipe-primary-btn">
              <Icon name="KeyIcon" size={18} />
              Add a Gemini key
            </button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Cards are written by Google Gemini with your own free key from AI Studio.
            </p>
          </>
        )}
        {!fresh && onReviewAgain && (
          <button type="button" onClick={onReviewAgain} className="swipe-ghost-btn mx-auto mt-1">
            <Icon name="ArrowPathIcon" size={16} />
            Review these again
          </button>
        )}
      </div>
    </div>
  );
}
