'use client';

import FlatIcon, { type FlatIconName } from '@/components/ui/FlatIcon';

export type TodoTab = 'today' | 'quick' | 'smart' | 'plan' | 'goals' | 'schedule';

interface TabSwitcherProps {
  activeTab: TodoTab;
  onTabChange: (tab: TodoTab) => void;
}

const TABS: { id: TodoTab; label: string; short: string; description: string; icon: FlatIconName }[] = [
  { id: 'today', label: 'Today', short: 'Today', description: 'Speak a task, see what’s due, get reminded', icon: 'calendar' },
  { id: 'quick', label: 'Quick Daily', short: 'Daily', description: 'Fast daily execution', icon: 'quick' },
  { id: 'smart', label: 'Smart To-Do', short: 'Tasks', description: 'Full task manager with AI breakdowns', icon: 'brain' },
  { id: 'plan', label: 'Plan & Project', short: 'Projects', description: 'Projects & roadmaps', icon: 'plan' },
  { id: 'goals', label: 'Goals', short: 'Goals', description: 'Big-picture planning', icon: 'trophy' },
  { id: 'schedule', label: 'Scheduler', short: 'Schedule', description: 'Reminders and AI jobs that run on a schedule', icon: 'clock' },
];

/**
 * Page-level navigation.
 * Phones: an iOS segmented control with the six short labels, every section visible at once (as a scrolling strip,
 * Goals sat off the right edge). From sm: icon + text tabs over a hairline, the current one marked by an underline.
 */
export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <>
      <nav aria-label="To-Do sections" className="ios-segmented todo-section-switch flex w-full sm:hidden">
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
            <FlatIcon name={tab.icon} size={18} className="todo-tab-icon" />
            <span className="sm:hidden" aria-hidden="true">{tab.short}</span>
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
