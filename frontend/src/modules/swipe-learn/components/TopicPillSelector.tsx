'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FeedMode, TopicMeta, QuizDisplayMode } from '../types';
import Icon from '@/components/ui/AppIcon';
import { topicHue } from '../utils/topicHue';

interface TopicPillSelectorProps {
  topics: TopicMeta[];
  selectedMode: FeedMode;
  onSelectMode: (mode: FeedMode) => void;
  onOpenAddTopic: () => void;
  activeSubTab: string;
  onSelectSubTab: (subTabId: string) => void;
  quizMode: QuizDisplayMode;
  onToggleQuizMode: (mode: QuizDisplayMode) => void;
  learnModeEnabled: boolean;
  onToggleLearnMode: () => void;
}

export default function TopicPillSelector({
  topics,
  selectedMode,
  onSelectMode,
  onOpenAddTopic,
  activeSubTab,
  onSelectSubTab,
  quizMode,
  onToggleQuizMode,
  learnModeEnabled,
  onToggleLearnMode,
}: TopicPillSelectorProps) {
  const currentTopicMeta = topics.find((t) => t.id === selectedMode);
  const subTabs = currentTopicMeta?.subTabs;
  const showQuizToggle = selectedMode === 'quiz';

  // The strip hides its scrollbar: support the mouse wheel, click-drag and (mouse only) edge arrows.
  const stripRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 });
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges, topics.length]);

  // Keep the selected pill in view.
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedMode]);

  const nudge = (dir: 1 | -1) =>
    stripRef.current?.scrollBy({
      left: dir * Math.max(160, (stripRef.current?.clientWidth ?? 0) * 0.6),
      behavior: 'smooth',
    });

  return (
    <div className="w-full shrink-0 border-b border-border bg-background py-2">
      <div className="relative">
        <div
          ref={stripRef}
          onScroll={updateEdges}
          onWheel={(e) => {
            const el = stripRef.current;
            if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse' || !stripRef.current) return;
            drag.current = {
              active: true,
              moved: false,
              startX: e.clientX,
              startLeft: stripRef.current.scrollLeft,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d.active || !stripRef.current) return;
            const dx = e.clientX - d.startX;
            if (Math.abs(dx) > 5) d.moved = true;
            if (d.moved) stripRef.current.scrollLeft = d.startLeft - dx;
          }}
          onPointerUp={() => {
            drag.current.active = false;
          }}
          onPointerLeave={() => {
            drag.current.active = false;
          }}
          onClickCapture={(e) => {
            if (drag.current.moved) {
              e.stopPropagation();
              e.preventDefault();
              drag.current.moved = false;
            }
          }}
          className="w-full overflow-x-auto scroll-px-3 px-3 scrollbar-none sm:px-4"
        >
          <div className="flex min-w-max items-center gap-1.5">
            {topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                data-active={selectedMode === topic.id}
                aria-pressed={selectedMode === topic.id}
                onClick={() => onSelectMode(topic.id)}
                className="swipe-pill"
                style={{ '--tone': topicHue(topic.id) } as React.CSSProperties}
              >
                <span className="text-sm leading-none" aria-hidden="true">
                  {topic.emoji}
                </span>
                <span>{topic.label}</span>
              </button>
            ))}

            <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

            <button
              type="button"
              onClick={onToggleLearnMode}
              data-active={learnModeEnabled}
              aria-pressed={learnModeEnabled}
              className="swipe-pill"
              style={{ '--tone': '#f59e0b' } as React.CSSProperties}
              title="Learn mode: only cards with a deeper explanation"
            >
              <Icon
                name="LightBulbIcon"
                size={15}
                variant={learnModeEnabled ? 'solid' : 'outline'}
              />
              <span>Learn mode</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddTopic}
              className="swipe-pill"
              title="Add or remove your own topics"
            >
              <Icon name="PlusIcon" size={15} />
              <span>Topic</span>
            </button>
          </div>
        </div>

        {/* Edge arrows for a mouse; a finger just swipes the strip. */}
        {(['left', 'right'] as const).map((side) =>
          edges[side] ? (
            <button
              key={side}
              type="button"
              onClick={() => nudge(side === 'left' ? -1 : 1)}
              aria-label={side === 'left' ? 'Scroll topics left' : 'Scroll topics right'}
              className={`absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-transform hover:scale-105 active:scale-95 [@media(pointer:fine)]:flex ${
                side === 'left' ? 'left-1.5' : 'right-1.5'
              }`}
            >
              <Icon name={side === 'left' ? 'ChevronLeftIcon' : 'ChevronRightIcon'} size={16} />
            </button>
          ) : null
        )}
      </div>

      {/* Sub-tabs (Interview Prep, Mixed) and the quiz/flashcard switch (Quiz deck) */}
      {(subTabs || showQuizToggle) && (
        <div className="mt-2 flex items-center gap-2 overflow-x-auto px-3 scrollbar-none sm:px-4">
          {subTabs && (
            <div className="flex min-w-max items-center gap-1">
              {subTabs.map((st) => {
                const active = activeSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onSelectSubTab(st.id)}
                    aria-pressed={active}
                    className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-foreground text-background'
                        : 'mix-bg-muted/70 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {st.emoji && <span aria-hidden="true">{st.emoji}</span>}
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {showQuizToggle && (
            <div
              className="swipe-chips swipe-chips-sm ml-auto shrink-0"
              role="group"
              aria-label="Quiz display"
            >
              {(
                [
                  { id: 'quiz', label: 'Multiple choice' },
                  { id: 'flashcard', label: 'Flashcards' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onToggleQuizMode(m.id)}
                  aria-pressed={quizMode === m.id}
                  className="swipe-chip"
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
