'use client';

import React, { useState } from 'react';
import type { ContentCard, QuizDisplayMode, TopicMeta } from '../types';
import SwipeCardItem from './SwipeCardItem';
import EmptyDeckState from './EmptyDeckState';
import Icon from '@/components/ui/AppIcon';
import type { GeneratingState } from './SwipeDeckView';

interface ScrollFeedViewProps {
  cards: ContentCard[];
  deckLabel: string;
  topicById: (id: string) => TopicMeta | undefined;
  savedCardIds: string[];
  quizMode: QuizDisplayMode;
  onToggleSave: (card: ContentCard) => void;
  onQuizMe: (card: ContentCard) => void;
  onQuickGenerate: () => void;
  onOpenGenerate: () => void;
  onOpenSettings: () => void;
  generating: GeneratingState | null;
  hasKey: boolean;
}

/** Every card of the topic as a vertical feed (newest generated first). Hide takes a card out for this visit. */
export default function ScrollFeedView({
  cards,
  deckLabel,
  topicById,
  savedCardIds,
  quizMode,
  onToggleSave,
  onQuizMe,
  onQuickGenerate,
  onOpenGenerate,
  onOpenSettings,
  generating,
  hasKey,
}: ScrollFeedViewProps) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const visible = cards.filter((c) => !hiddenIds.includes(c.id));
  const quickBusy = !!generating && !generating.forCardId;

  if (visible.length === 0) {
    return (
      <EmptyDeckState
        fresh={cards.length === 0}
        deckLabel={deckLabel}
        total={cards.length}
        hasKey={hasKey}
        busy={!!generating}
        quickBusyCount={quickBusy ? generating?.count : undefined}
        onQuickGenerate={onQuickGenerate}
        onOpenGenerate={onOpenGenerate}
        onOpenSettings={onOpenSettings}
        onReviewAgain={hiddenIds.length ? () => setHiddenIds([]) : undefined}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-3 px-3 pb-8 pt-3 sm:space-y-4 sm:px-4">
      <div className="flex items-center justify-between gap-2 px-1 text-xs font-medium text-muted-foreground">
        <span>
          {visible.length} {visible.length === 1 ? 'card' : 'cards'} · {deckLabel}
        </span>
        {hiddenIds.length > 0 && (
          <button type="button" onClick={() => setHiddenIds([])} className="swipe-link">
            Show {hiddenIds.length} hidden
          </button>
        )}
      </div>

      {visible.map((card) => (
        <SwipeCardItem
          key={card.id}
          card={card}
          topic={topicById(card.topic)}
          variant="feed"
          quizMode={quizMode}
          isSaved={savedCardIds.includes(card.id)}
          onSave={() => onToggleSave(card)}
          onDismiss={() => setHiddenIds((prev) => [...prev, card.id])}
          onQuizMe={onQuizMe}
          quizMeBusy={generating?.forCardId === card.id}
          generateBusy={!!generating}
        />
      ))}

      {/* Bottom of the feed: the next batch */}
      <div className="rounded-[1.375rem] border border-dashed border-border px-4 py-5 text-center">
        <p className="text-sm font-semibold text-foreground">Want more?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Fresh {deckLabel} cards, written for you.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {hasKey ? (
            <>
              <button
                type="button"
                onClick={onQuickGenerate}
                disabled={!!generating}
                className="swipe-primary-btn swipe-btn-sm"
              >
                {quickBusy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Icon name="SparklesIcon" size={17} variant="solid" />
                )}
                {quickBusy ? `Writing ${generating?.count}…` : 'Generate 5'}
              </button>
              <button
                type="button"
                onClick={onOpenGenerate}
                disabled={!!generating}
                className="swipe-secondary-btn swipe-btn-sm"
              >
                <Icon name="AdjustmentsHorizontalIcon" size={16} />
                Options
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenSettings}
              className="swipe-primary-btn swipe-btn-sm"
            >
              <Icon name="KeyIcon" size={17} />
              Add a Gemini key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
