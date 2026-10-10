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
  // Sub-tabs
  activeSubTab: string;
  onSelectSubTab: (subTabId: string) => void;
  // Quiz display mode
  quizMode: QuizDisplayMode;
  onToggleQuizMode: (mode: QuizDisplayMode) => void;
  // Learn mode toggle
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
  // Find current topic meta to see if it has sub-tabs
  const currentTopicMeta = topics.find((t) => t.id === selectedMode);

  // Scrollable pill strip: the scrollbar is hidden, so support mouse wheel, click-drag and edge arrows.
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
    stripRef.current?.scrollBy({ left: dir * Math.max(160, (stripRef.current?.clientWidth ?? 0) * 0.6), behavior: 'smooth' });

  return (
    <div className="w-full sticky top-[60px] z-20 bg-background border-b border-border py-3 transition-all">
      {/* 1. Main Horizontal Scrollable Topic Pills */}
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
          drag.current = { active: true, moved: false, startX: e.clientX, startLeft: stripRef.current.scrollLeft };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.active || !stripRef.current) return;
          const dx = e.clientX - d.startX;
          if (Math.abs(dx) > 5) d.moved = true;
          if (d.moved) stripRef.current.scrollLeft = d.startLeft - dx;
        }}
        onPointerUp={() => { drag.current.active = false; }}
        onPointerLeave={() => { drag.current.active = false; }}
        onClickCapture={(e) => {
          if (drag.current.moved) {
            e.stopPropagation();
            e.preventDefault();
            drag.current.moved = false;
          }
        }}
        className="w-full overflow-x-auto scrollbar-none px-4 sm:px-[1.5rem] cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-max">
          {topics.map((topic) => {
            const isActive = selectedMode === topic.id;

            return (
              <button
                key={topic.id}
                type="button"
                data-active={isActive}
                onClick={() => onSelectMode(topic.id)}
                className="swipe-pill"
                style={{ '--tone': topicHue(topic.id) } as React.CSSProperties}
              >
                <span className="text-sm leading-none">{topic.emoji}</span>
                <span>{topic.label}</span>
                {topic.isCustom && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-0.5" title="Custom topic" />
                )}
              </button>
            );
          })}

          {/* Learn Mode Pill Toggle */}
          <button
            type="button"
            onClick={onToggleLearnMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold border transition-all ${
              learnModeEnabled
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-card border-border/70 text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle Learn Mode (Focus on deep conceptual cards)"
          >
            <span>💡</span>
            <span>Learn Mode</span>
          </button>

          {/* ＋ Add Topic Button */}
          <button
            type="button"
            onClick={onOpenAddTopic}
            className="flex items-center gap-1 px-3 py-1.5 rounded-2xl text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-all active:scale-95 shadow-sm"
            title="Add a custom learning topic"
          >
            <span className="text-sm leading-none">＋</span>
            <span>Add Topic</span>
          </button>
        </div>
      </div>
      {(['left', 'right'] as const).map((side) =>
        edges[side] ? (
          <button
            key={side}
            type="button"
            onClick={() => nudge(side === 'left' ? -1 : 1)}
            aria-label={side === 'left' ? 'Scroll topics left' : 'Scroll topics right'}
            className={`absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-transform hover:scale-105 active:scale-95 ${
              side === 'left' ? 'left-2' : 'right-2'
            }`}
          >
            <Icon name={side === 'left' ? 'ChevronLeftIcon' : 'ChevronRightIcon'} size={16} />
          </button>
        ) : null
      )}
      </div>

      {/* 2. Sub-Tabs Bar (When active topic has sub-tabs or quiz mode toggle) */}
      {(currentTopicMeta?.subTabs || selectedMode === 'quiz') && (
        <div className="w-full overflow-x-auto scrollbar-none px-3 sm:px-5 pt-2 flex items-center justify-between gap-3 text-xs">
          {/* Sub-tabs pills */}
          {currentTopicMeta?.subTabs && (
            <div className="flex items-center gap-1.5">
              {currentTopicMeta.subTabs.map((st) => {
                const isSubActive = activeSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onSelectSubTab(st.id)}
                    className={`px-2.5 py-0.8 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1 ${
                      isSubActive
                        ? 'bg-foreground text-background shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {st.emoji && <span>{st.emoji}</span>}
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quiz mode vs Flashcard mode toggle */}
          {selectedMode === 'quiz' && (
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-muted/60 border border-border/80 text-[11px] font-semibold ml-auto">
              <button
                type="button"
                onClick={() => onToggleQuizMode('quiz')}
                className={`px-2 py-0.5 rounded-lg transition-all ${
                  quizMode === 'quiz' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                ❓ Quiz Mode
              </button>
              <button
                type="button"
                onClick={() => onToggleQuizMode('flashcard')}
                className={`px-2 py-0.5 rounded-lg transition-all ${
                  quizMode === 'flashcard' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                🎴 Flashcard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
