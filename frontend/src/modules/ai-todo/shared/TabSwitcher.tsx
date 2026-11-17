'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import FlatIcon, { type FlatIconName } from '@/components/ui/FlatIcon';

export type TodoTab = 'today' | 'quick' | 'routines' | 'smart' | 'plan' | 'goals' | 'schedule';

interface TabSwitcherProps {
  activeTab: TodoTab;
  onTabChange: (tab: TodoTab) => void;
}

const TABS: { id: TodoTab; label: string; short: string; description: string; icon: FlatIconName }[] = [
  { id: 'today', label: 'Today', short: 'Today', description: 'Speak a task, see what’s due, get reminded', icon: 'calendar' },
  { id: 'quick', label: 'Quick Daily', short: 'Daily', description: 'Fast daily execution', icon: 'quick' },
  { id: 'routines', label: 'Routines', short: 'Routines', description: 'Dailies and the routines for weekdays, weekends and special days', icon: 'phase' },
  { id: 'smart', label: 'Smart To-Do', short: 'Tasks', description: 'Full task manager with AI breakdowns', icon: 'brain' },
  { id: 'plan', label: 'Plan & Project', short: 'Projects', description: 'Projects & roadmaps', icon: 'plan' },
  { id: 'goals', label: 'Goals', short: 'Goals', description: 'Big-picture planning', icon: 'trophy' },
  { id: 'schedule', label: 'Assistant', short: 'Assistant', description: 'Ask, get reports and schedule anything with AI, by text or voice', icon: 'ai' },
];

/**
 * Page-level navigation.
 * Phones: an iOS segmented control with the short labels. Seven sections are wider than a phone, so the control
 * scrolls sideways: the current section is scrolled into view, and an edge fades where more sections are hidden
 * (data-fade, see routines.css). From sm: icon + text tabs over a hairline, the current one marked by an underline.
 */
export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  const navRef = useRef<HTMLElement>(null);
  const [fade, setFade] = useState('');

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const edges = [];
    if (nav.scrollLeft > 1) edges.push('start');
    if (nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1) edges.push('end');
    setFade(edges.join(' '));
  }, []);

  // Bring the current section into view (e.g. Assistant, the last one), without scrolling the page itself.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active) {
      const a = active.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      if (a.left < n.left) nav.scrollLeft -= n.left - a.left + 8;
      else if (a.right > n.right) nav.scrollLeft += a.right - n.right + 8;
    }
    measure();
  }, [activeTab, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <>
      <nav
        ref={navRef}
        onScroll={measure}
        data-fade={fade || undefined}
        aria-label="To-Do sections"
        className="ios-segmented todo-section-switch flex w-full sm:hidden"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`ios-segment flex-1 px-1 ${isActive ? 'ios-segment-active' : ''}`}
            >
              {tab.short}
            </button>
          );
        })}
      </nav>
      <TabStrip activeTab={activeTab} onTabChange={onTabChange} />
    </>
  );
}

function TabStrip({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <nav
      aria-label="To-Do sections"
      className="todo-tabs hidden w-full items-end gap-[1.25rem] overflow-x-auto border-b mix-border-foreground/10 scrollbar-none sm:flex sm:gap-[1.75rem]"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            title={tab.description}
            className="todo-tab todo-focus relative -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity aria-[current=page]:after:opacity-100 forced-colors:after:bg-[Highlight]"
          >
            <FlatIcon name={tab.icon} size={18} quiet className="text-current todo-tab-icon" />
            <span className="sm:hidden" aria-hidden="true">{tab.short}</span>
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
