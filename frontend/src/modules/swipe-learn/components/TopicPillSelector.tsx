'use client';

import React from 'react';
import { FeedMode, TopicMeta, QuizDisplayMode } from '../types';
import Icon from '@/components/ui/AppIcon';

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

  return (
    <div className="w-full sticky top-[60px] z-20 bg-background/90 backdrop-blur-md border-b border-border/50 py-2.5 transition-all">
      {/* 1. Main Horizontal Scrollable Topic Pills */}
      <div className="w-full overflow-x-auto scrollbar-none px-3 sm:px-5">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-max">
          {topics.map((topic) => {
            const isActive = selectedMode === topic.id;

            let activeClass = '';
            if (isActive) {
              if (topic.id === 'mixed') activeClass = 'bg-purple-600 text-white shadow-md shadow-purple-500/20';
              else if (topic.id === 'python') activeClass = 'bg-[#10957d] text-white shadow-md shadow-emerald-600/20';
              else if (topic.id === 'computer-vision') activeClass = 'bg-sky-600 text-white shadow-md shadow-sky-600/20';
              else if (topic.id === 'finance') activeClass = 'bg-blue-600 text-white shadow-md shadow-blue-600/20';
              else if (topic.id === 'ai') activeClass = 'bg-violet-600 text-white shadow-md shadow-violet-600/20';
              else if (topic.id === 'interview') activeClass = 'bg-amber-600 text-white shadow-md shadow-amber-600/20';
              else if (topic.id === 'quiz') activeClass = 'bg-rose-600 text-white shadow-md shadow-rose-600/20';
              else activeClass = 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20';
            } else {
              activeClass = 'bg-card border border-border/70 text-foreground/80 hover:bg-muted/70 hover:text-foreground';
            }

            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => onSelectMode(topic.id)}
                className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 ${activeClass}`}
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
