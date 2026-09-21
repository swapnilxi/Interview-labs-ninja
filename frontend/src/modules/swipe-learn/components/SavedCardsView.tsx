'use client';

import React, { useState, useMemo } from 'react';
import { ContentCard, TopicType } from '../types';
import SwipeCardItem from './SwipeCardItem';
import Icon from '@/components/ui/AppIcon';

interface SavedCardsViewProps {
  cards: ContentCard[];
  onRemoveSaved: (cardId: string) => void;
  onBackToFeed: () => void;
}

export default function SavedCardsView({
  cards,
  onRemoveSaved,
  onBackToFeed,
}: SavedCardsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTopic, setFilterTopic] = useState<TopicType | 'all'>('all');

  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      const matchTopic = filterTopic === 'all' || c.topic === filterTopic;
      const matchQuery =
        !searchQuery.trim() ||
        c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchTopic && matchQuery;
    });
  }, [cards, filterTopic, searchQuery]);

  return (
    <div className="w-full max-w-[540px] mx-auto px-4 py-4 space-y-5 pb-20">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToFeed}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <Icon name="ArrowLeftIcon" size={16} />
          <span>Back to Feed</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
          <Icon name="BookmarkIcon" size={15} variant="solid" className="text-blue-600" />
          <span>{cards.length} Saved Cards</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved cards..."
            className="w-full pl-9 pr-3.5 py-2 rounded-2xl bg-card border border-border/80 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          />
          <div className="absolute left-3 top-2.5 text-muted-foreground">
            <Icon name="MagnifyingGlassIcon" size={16} />
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Cards List */}
      {filteredCards.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-border bg-card space-y-3 shadow-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
            <Icon name="BookmarkSlashIcon" size={28} />
          </div>
          <h4 className="text-base font-bold text-foreground">No Saved Cards</h4>
          <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
            {cards.length === 0
              ? 'Swipe right on any card or tap Save in Mixed mode to collect cards here.'
              : 'No cards match your search filter.'}
          </p>
          <button
            type="button"
            onClick={onBackToFeed}
            className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-sm"
          >
            Start Swiping
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredCards.map((card) => (
            <div key={card.id} className="relative group">
              <SwipeCardItem
                card={card}
                mode="feed"
                isSaved={true}
                onSave={() => onRemoveSaved(card.id)}
                onSkip={() => onRemoveSaved(card.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
