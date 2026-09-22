'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

interface SwipeLearnHeaderProps {
  savedCount: number;
  onOpenSaved: () => void;
  onOpenSettings: () => void;
  onGenerate: () => void;
  isGenerating?: boolean;
}

export default function SwipeLearnHeader({
  savedCount,
  onOpenSaved,
  onOpenSettings,
  onGenerate,
  isGenerating = false,
}: SwipeLearnHeaderProps) {
  return (
    <header className="w-full flex items-center justify-between py-4 px-4 sm:px-6 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-[60px] z-30">
      {/* Brand: Logo + SwipeLearn Title */}
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1d4ed8] flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground font-heading leading-tight">
            SwipeLearn
          </h1>
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            Micro-learning feed · Swipe to master
          </p>
        </div>
      </div>

      {/* Right Action Icons: Generate, Saved (with badge), Settings */}
      <div className="flex items-center gap-2">
        {/* Dynamic Generate Button */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm hover:shadow-md hover:from-primary/95 hover:to-indigo-500 transition-all active:scale-95 disabled:opacity-60"
          title="Generate fresh learning card using AI"
        >
          {isGenerating ? (
            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="text-sm">✨</span>
          )}
          <span>{isGenerating ? 'Generating...' : 'Generate'}</span>
        </button>

        {/* Saved Cards Bookmark with Badge */}
        <button
          type="button"
          onClick={onOpenSaved}
          className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
          title="Saved Cards"
          aria-label="View saved cards"
        >
          <Icon name="BookmarkIcon" size={22} />
          {savedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
              {savedCount > 99 ? '99+' : savedCount}
            </span>
          )}
        </button>

        {/* Settings Gear Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
          title="Gemini API & Settings"
          aria-label="SwipeLearn Settings"
        >
          <Icon name="Cog6ToothIcon" size={22} />
        </button>
      </div>
    </header>
  );
}
