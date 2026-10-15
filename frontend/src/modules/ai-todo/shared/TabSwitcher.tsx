'use client';

export type TodoTab = 'quick' | 'smart' | 'plan' | 'goals';

interface TabSwitcherProps {
  activeTab: TodoTab;
  onTabChange: (tab: TodoTab) => void;
}

const TABS: { id: TodoTab; label: string; short: string; description: string }[] = [
  { id: 'quick', label: 'Quick Daily', short: 'Quick', description: 'Fast daily execution' },
  { id: 'smart', label: 'Smart To-Do', short: 'Smart', description: 'Full task manager' },
  { id: 'plan', label: 'Plan & Project', short: 'Plan', description: 'Projects & roadmaps' },
  { id: 'goals', label: 'Goals', short: 'Goals', description: 'Big-picture planning' },
];

/** Page-level navigation: plain text tabs over a hairline, the current one marked by an underline. */
export default function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <nav aria-label="To-Do sections" className="flex w-full items-end gap-[1.5rem] border-b mix-border-foreground/10 sm:gap-[2rem]">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            title={tab.description}
            className="todo-focus relative -mb-px whitespace-nowrap rounded-md py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity aria-[current=page]:after:opacity-100 forced-colors:after:bg-[Highlight]"
          >
            <span className="sm:hidden" aria-hidden="true">{tab.short}</span>
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
