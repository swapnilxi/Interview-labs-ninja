'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

export type DailySessionTab =
  | 'session'
  | 'practice'
  | 'quick-practice'
  | 'progress'
  | 'question-bank'
  | 'myspace'
  | 'swapnilxi-space';

export interface TabConfig {
  id: DailySessionTab;
  label: string;
  short: string;
  icon: string;
  description: string;
  badge?: string;
}

export const DAILY_SESSION_TABS: TabConfig[] = [
  {
    id: 'session',
    label: 'Daily Session',
    short: 'Daily',
    icon: 'AcademicCapIcon',
    description: '10 personalized questions with AI hints & timer',
    badge: '10 Qs',
  },
  {
    id: 'practice',
    label: 'Practice Mode',
    short: 'Practice',
    icon: 'SparklesIcon',
    description: 'Custom drill by category & difficulty',
  },
  {
    id: 'quick-practice',
    label: 'Quick Practice',
    short: 'Quick Blitz',
    icon: 'BoltIcon',
    description: 'Rapid-fire blitz with instant model answers',
    badge: 'Fast',
  },
  {
    id: 'progress',
    label: 'Progress Dashboard',
    short: 'Progress',
    icon: 'ChartBarIcon',
    description: 'Readiness analytics, streak & skill trends',
  },
  {
    id: 'question-bank',
    label: 'Question Bank',
    short: 'Questions',
    icon: 'BookOpenIcon',
    description: 'Browse, filter & search full repository',
  },
];

interface DailySessionTabSwitcherProps {
  activeTab: DailySessionTab;
  onTabChange: (tab: DailySessionTab) => void;
}

export default function DailySessionTabSwitcher({
  activeTab,
  onTabChange,
}: DailySessionTabSwitcherProps) {
  const { user } = useAuth();
  const isSwapnilxi = user?.email?.toLowerCase() === 'swapnilgupta.xi@gmail.com';

  const mySpaceTab: TabConfig = {
    id: isSwapnilxi ? 'swapnilxi-space' : 'myspace',
    label: isSwapnilxi ? 'swapnilxi space' : 'MySpace',
    short: isSwapnilxi ? 'swapnilxi' : 'MySpace',
    icon: isSwapnilxi ? 'ShieldCheckIcon' : 'SparklesIcon',
    description: isSwapnilxi
      ? 'Private creator command deck & controls'
      : 'Personal private workspace & scratchpad',
    badge: isSwapnilxi ? 'VIP' : 'Private',
  };

  const visibleTabs = [...DAILY_SESSION_TABS, mySpaceTab];

  return (
    <nav
      aria-label="Daily Session sections"
      className="flex w-full items-center gap-1.5 overflow-x-auto scrollbar-none rounded-2xl border border-border bg-card/80 p-1.5 backdrop-blur-md shadow-sm"
    >
      {visibleTabs.map((tab) => {
        const isMySpaceTab = tab.id === 'myspace' || tab.id === 'swapnilxi-space';
        const isActive = activeTab === tab.id || (isMySpaceTab && (activeTab === 'myspace' || activeTab === 'swapnilxi-space'));
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            title={tab.description}
            className={`group relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:py-2.5 sm:text-sm whitespace-nowrap ${
              isActive
                ? 'bg-gradient-to-r from-primary to-violet-600 text-white shadow-md shadow-primary/25 font-bold'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            }`}
          >
            <Icon
              name={tab.icon as any}
              size={17}
              variant={isActive ? 'solid' : 'outline'}
              className={`flex-shrink-0 transition-transform ${
                isActive ? 'scale-105 text-white' : 'text-muted-foreground group-hover:text-foreground'
              }`}
            />
            <span className="hidden md:inline">{tab.label}</span>
            <span className="inline md:hidden">{tab.short}</span>

            {tab.badge && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
