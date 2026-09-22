'use client';

import React, { useState } from 'react';
import { ContentCard } from '../types';
import SwipeCardItem from './SwipeCardItem';
import Icon from '@/components/ui/AppIcon';

interface MixedVerticalFeedProps {
  cards: ContentCard[];
  savedCardIds: string[];
  onSaveCard: (card: ContentCard) => void;
  onSkipCard: (card: ContentCard) => void;
  onGenerateMore: () => void;
  isGenerating?: boolean;
  onReinforceQuiz?: (card: ContentCard) => void;
}

export default function MixedVerticalFeed({
  cards,
  savedCardIds,
  onSaveCard,
  onSkipCard,
  onGenerateMore,
  isGenerating = false,
  onReinforceQuiz,
}: MixedVerticalFeedProps) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const handleSkip = (card: ContentCard) => {
    setDismissedIds((prev) => [...prev, card.id]);
    onSkipCard(card);
  };

  const visibleCards = cards.filter((c) => !dismissedIds.includes(c.id));

  return (
    <div className="w-full max-w-[520px] mx-auto px-3 sm:px-4 py-3 space-y-6 pb-20">
      {/* Feed info banner */}
      <div className="px-4 py-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-900 dark:text-purple-200 text-xs flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="text-sm">🔀</span>
          <span>Mixed Feed: Scroll through Python, Vision, Finance & AI</span>
        </span>
        <span className="font-mono text-[11px] opacity-75">{visibleCards.length} cards</span>
      </div>

      {/* Vertical Stack of Cards matching input_file_1.png */}
      {visibleCards.length === 0 ? (
        <div className="p-10 rounded-3xl border border-border/80 bg-card text-center space-y-4 shadow-sm">
          <span className="text-3xl">🎉</span>
          <h3 className="text-xl font-bold text-foreground">You scrolled through everything!</h3>
          <p className="text-sm text-muted-foreground">
            Tap Generate to pull fresh concepts from AI into your feed.
          </p>
          <button
            type="button"
            onClick={onGenerateMore}
            disabled={isGenerating}
            className="px-6 py-2.5 rounded-2xl bg-primary text-white font-semibold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            {isGenerating ? 'Generating...' : '✨ Generate More Cards'}
          </button>
        </div>
      ) : (
        visibleCards.map((card) => {
          const isSaved = savedCardIds.includes(card.id);
          return (
            <div
              key={card.id}
              className="transition-all duration-300 transform"
            >
              <SwipeCardItem
                card={card}
                mode="feed"
                isSaved={isSaved}
                onSave={() => onSaveCard(card)}
                onSkip={() => handleSkip(card)}
                onReinforceQuiz={onReinforceQuiz}
              />
            </div>
          );
        })
      )}

      {/* Infinite Scroll / Bottom Load More */}
      {visibleCards.length > 0 && (
        <div className="pt-4 text-center">
          <button
            type="button"
            onClick={onGenerateMore}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-card hover:bg-muted border border-border shadow-sm text-xs sm:text-sm font-semibold text-foreground transition-all active:scale-95 disabled:opacity-60"
          >
            {isGenerating ? (
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <Icon name="SparklesIcon" size={17} className="text-primary" />
            )}
            <span>{isGenerating ? 'Generating Fresh Insights...' : 'Load & Generate More'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
