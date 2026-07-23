'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback } from 'react';

export type TodoTab = 'quick' | 'smart' | 'plan';

interface TabSwitcherProps {
  activeTab: TodoTab;
  onTabChange: (tab: TodoTab) => void;
}

const TABS: { id: TodoTab; label: string; icon: string; description: string }[] = [
  { id: 'quick', label: 'Quick Daily', icon: '⚡', description: 'Fast daily execution' },
  { id: 'smart', label: 'Smart To-Do', icon: '🧠', description: 'Full task manager' },
  { id: 'plan', label: 'Plan & Project', icon: '🗺️', description: 'Projects & roadmaps' },
];

export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <div className="relative flex items-center bg-muted/30 rounded-xl p-1 border border-border/60 shadow-sm">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-300 ${
              isActive
                ? 'bg-card text-foreground shadow-md border border-border/80'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            {isActive && (
              <span className="hidden md:inline text-[10px] font-normal text-muted-foreground ml-1">
                — {tab.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
