'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';

export type TodoTab = 'quick' | 'smart' | 'plan' | 'goals';

interface TabSwitcherProps {
  activeTab: TodoTab;
  onTabChange: (tab: TodoTab) => void;
}

const TABS: { id: TodoTab; label: string; short: string; icon: string; description: string }[] = [
  { id: 'quick', label: 'Quick Daily', short: 'Quick', icon: 'BoltIcon', description: 'Fast daily execution' },
  { id: 'smart', label: 'Smart To-Do', short: 'Smart', icon: 'CpuChipIcon', description: 'Full task manager' },
  { id: 'plan', label: 'Plan & Project', short: 'Plan', icon: 'MapIcon', description: 'Projects & roadmaps' },
  { id: 'goals', label: 'Goals', short: 'Goals', icon: 'ViewfinderCircleIcon', description: 'Big-picture planning' },
];

export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <nav aria-label="To-Do sections" className="todo-segmented flex w-full gap-1 rounded-xl p-1.5">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            title={tab.description}
            className="todo-segment flex-1 justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-semibold sm:px-[1.25rem] sm:py-3 sm:text-sm"
          >
            <Icon name={tab.icon} size={16} variant={isActive ? 'solid' : 'outline'} />
            <span className="sm:hidden" aria-hidden="true">{tab.short}</span>
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{tab.label}</span>
            {/* Secondary description only where there's room for it without wrapping */}
            {isActive && (
              <span className="hidden text-xs font-normal text-muted-foreground xl:inline">
                — {tab.description}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
