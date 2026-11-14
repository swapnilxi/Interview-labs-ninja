'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
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
  icon: string;
  description: string;
}

/** The order is the flow: today's session first, then the ways to practise, then looking back. */
export const DAILY_SESSION_TABS: TabConfig[] = [
  {
    id: 'session',
    label: 'Today',
    icon: 'SunIcon',
    description: "Today's 10 personalised questions",
  },
  {
    id: 'practice',
    label: 'Practice',
    icon: 'AcademicCapIcon',
    description: 'Build a drill by topic and level',
  },
  {
    id: 'quick-practice',
    label: 'Quick blitz',
    icon: 'BoltIcon',
    description: 'Rapid flashcards with instant answers',
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: 'ChartBarIcon',
    description: 'Readiness, streaks and skill trends',
  },
  {
    id: 'question-bank',
    label: 'Question bank',
    icon: 'BookOpenIcon',
    description: 'Browse, filter and search every question',
  },
];

export const tabHref = (id: DailySessionTab) =>
  id === 'session' ? '/daily-session' : `/daily-session?tab=${id}`;

interface DailySessionTabSwitcherProps {
  activeTab: DailySessionTab;
}

export default function DailySessionTabSwitcher({ activeTab }: DailySessionTabSwitcherProps) {
  const { user } = useAuth();
  const isSwapnilxi = user?.email?.toLowerCase() === 'swapnilgupta.xi@gmail.com';
  const navRef = useRef<HTMLElement>(null);

  const mySpaceTab: TabConfig = {
    id: isSwapnilxi ? 'swapnilxi-space' : 'myspace',
    label: isSwapnilxi ? 'swapnilxi space' : 'My Space',
    icon: isSwapnilxi ? 'ShieldCheckIcon' : 'LockClosedIcon',
    description: isSwapnilxi
      ? 'Private creator command deck & controls'
      : 'Private notes, targets and your own questions',
  };

  const visibleTabs = [...DAILY_SESSION_TABS, mySpaceTab];

  // On a phone the bar scrolls sideways: keep the active tab in view (the bar only, never the page).
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2 });
  }, [activeTab]);

  return (
    <nav ref={navRef} aria-label="Daily Session sections" className="ds-tabs">
      {visibleTabs.map((tab) => {
        const isMySpaceTab = tab.id === 'myspace' || tab.id === 'swapnilxi-space';
        const isActive =
          activeTab === tab.id ||
          (isMySpaceTab && (activeTab === 'myspace' || activeTab === 'swapnilxi-space'));
        return (
          <Link
            key={tab.id}
            href={tabHref(tab.id)}
            scroll={false}
            prefetch={false}
            aria-current={isActive ? 'page' : undefined}
            title={tab.description}
            className="ds-tab"
          >
            <Icon
              name={tab.icon}
              size={18}
              variant={isActive ? 'solid' : 'outline'}
              className="flex-shrink-0"
            />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
