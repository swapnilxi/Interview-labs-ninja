'use client';

import React, { useMemo, useState } from 'react';
import type { ContentCard, QuizDisplayMode, TopicMeta } from '../types';
import SwipeCardItem from './SwipeCardItem';
import Icon from '@/components/ui/AppIcon';

interface SavedCardsViewProps {
  cards: ContentCard[];
  topicById: (id: string) => TopicMeta | undefined;
  quizMode: QuizDisplayMode;
  onRemoveSaved: (cardId: string) => void;
  /** Empty state: back to the swipe deck. */
  onStartSwiping: () => void;
}

export default function SavedCardsView({
  cards,
  topicById,
  quizMode,
  onRemoveSaved,
  onStartSwiping,
}: SavedCardsViewProps) {
  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('all');

  // Topics that have saved cards, in first-seen order.
  const topicIds = useMemo(() => Array.from(new Set(cards.map((c) => c.topic))), [cards]);
  const activeFilter =
    topicFilter !== 'all' && topicIds.includes(topicFilter) ? topicFilter : 'all';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (activeFilter !== 'all' && c.topic !== activeFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        !!c.tags?.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [cards, activeFilter, query]);

  if (cards.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center px-5 py-10 text-center animate-fadeIn">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl mix-bg-muted/80 text-muted-foreground">
          <Icon name="BookmarkIcon" size={30} />
        </div>
        <h3 className="mt-4 font-heading text-xl font-bold text-foreground">Nothing saved yet</h3>
        <p className="mt-1.5 max-w-[18rem] text-sm leading-relaxed text-muted-foreground">
          Swipe a card right, or tap Save in the scroll feed, to keep it here.
        </p>
        <button type="button" onClick={onStartSwiping} className="swipe-primary-btn mt-5">
          Start swiping
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-3 px-3 pb-8 pt-3 sm:space-y-4 sm:px-4">
      <div className="relative">
        <Icon
          name="MagnifyingGlassIcon"
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${cards.length} saved cards`}
          aria-label="Search saved cards"
          className="swipe-input swipe-input-search"
        />
      </div>

      {topicIds.length > 1 && (
        <div className="-mx-3 overflow-x-auto px-3 scrollbar-none sm:-mx-4 sm:px-4">
          <div className="flex min-w-max gap-1.5">
            {['all', ...topicIds].map((id) => {
              const meta = id === 'all' ? null : topicById(id);
              const count =
                id === 'all' ? cards.length : cards.filter((c) => c.topic === id).length;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTopicFilter(id)}
                  aria-pressed={activeFilter === id}
                  data-active={activeFilter === id}
                  className="swipe-pill"
                >
                  {meta && <span aria-hidden="true">{meta.emoji}</span>}
                  <span>{id === 'all' ? 'All' : (meta?.label ?? id)}</span>
                  <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="px-1 py-10 text-center text-sm text-muted-foreground">
          No saved cards match “{query}”.
        </p>
      ) : (
        filtered.map((card) => (
          <SwipeCardItem
            key={card.id}
            card={card}
            topic={topicById(card.topic)}
            variant="saved"
            quizMode={quizMode}
            isSaved
            onDismiss={() => onRemoveSaved(card.id)}
          />
        ))
      )}
    </div>
  );
}
