'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { SwipeLearnNavTab } from '../types';

interface BottomNavBarProps {
  currentTab: SwipeLearnNavTab;
  savedCount: number;
  onTabChange: (tab: SwipeLearnNavTab) => void;
}

export default function BottomNavBar({
  currentTab,
  savedCount,
  onTabChange,
}: BottomNavBarProps) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 border-t border-border/80 backdrop-blur-lg px-4 py-2 flex items-center justify-around shadow-2xl max-w-[600px] mx-auto rounded-t-3xl"
    >
      {/* 1. Home / Swipe Feed */}
      <button
        type="button"
        onClick={() => onTabChange('feed')}
        className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-2xl transition-all ${
          currentTab === 'feed'
            ? 'text-primary font-bold scale-105'
            : 'text-muted-foreground hover:text-foreground font-medium'
        }`}
      >
        <Icon name="Square3Stack3DIcon" size={20} variant={currentTab === 'feed' ? 'solid' : 'outline'} />
        <span className="text-[10px] tracking-tight">Swipe Feed</span>
      </button>

      {/* 2. Mixed Vertical Feed */}
      <button
        type="button"
        onClick={() => onTabChange('mixed')}
        className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-2xl transition-all ${
          currentTab === 'mixed'
            ? 'text-purple-600 dark:text-purple-400 font-bold scale-105'
            : 'text-muted-foreground hover:text-foreground font-medium'
        }`}
      >
        <Icon name="ArrowsUpDownIcon" size={20} />
        <span className="text-[10px] tracking-tight">Mixed Scroll</span>
      </button>

      {/* 3. Saved Cards */}
      <button
        type="button"
        onClick={() => onTabChange('saved')}
        className={`relative flex flex-col items-center gap-0.5 py-1 px-3 rounded-2xl transition-all ${
          currentTab === 'saved'
            ? 'text-blue-600 dark:text-blue-400 font-bold scale-105'
            : 'text-muted-foreground hover:text-foreground font-medium'
        }`}
      >
        <div className="relative">
          <Icon name="BookmarkIcon" size={20} variant={currentTab === 'saved' ? 'solid' : 'outline'} />
          {savedCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
              {savedCount > 99 ? '99+' : savedCount}
            </span>
          )}
        </div>
        <span className="text-[10px] tracking-tight">Saved</span>
      </button>

      {/* 4. Settings */}
      <button
        type="button"
        onClick={() => onTabChange('settings')}
        className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-2xl transition-all ${
          currentTab === 'settings'
            ? 'text-primary font-bold scale-105'
            : 'text-muted-foreground hover:text-foreground font-medium'
        }`}
      >
        <Icon name="Cog6ToothIcon" size={20} variant={currentTab === 'settings' ? 'solid' : 'outline'} />
        <span className="text-[10px] tracking-tight">Settings</span>
      </button>
    </nav>
  );
}
