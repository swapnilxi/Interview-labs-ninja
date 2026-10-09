'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  type TaskStatus,
  type ViewMode,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
} from '@/lib/services/todoService';

export interface TaskFilters {
  status: TaskStatus | 'all';
  priority: string;
  time: string;
  genType: string;
  search: string;
  view: ViewMode;
  top20: boolean;
}

interface FilterBarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

type ChipDef = { key: string; label: string; color?: string };

const STATUS_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k, label: v.label, color: v.color })),
];

const PRIORITY_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  ...Object.entries(PRIORITY_CONFIG).map(([k, v]) => ({ key: k, label: v.label.split(' ')[0], color: v.color })),
];

const TIME_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'quick', label: 'Quick ≤30m' },
  { key: 'medium', label: 'Medium ≤2h' },
  { key: 'deep', label: 'Deep 2h+' },
];

const GEN_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'manual', label: 'Manual' },
  { key: 'dive_deeper', label: 'Dive Deeper' },
  { key: 'chunk', label: 'Chunk' },
];

const VIEW_MODES: { key: ViewMode; label: string; icon: string; hint: string }[] = [
  { key: 'tree', label: 'Tree', icon: 'Bars3BottomLeftIcon', hint: 'Nested tasks and subtasks' },
  { key: 'list', label: 'List', icon: 'ListBulletIcon', hint: 'Every task as one flat list' },
  { key: 'focus', label: 'Focus', icon: 'PlayCircleIcon', hint: 'Only in-progress and overdue tasks' },
];

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const update = (key: keyof TaskFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const activeFilterCount =
    (filters.status !== 'all' ? 1 : 0) +
    (filters.priority !== 'all' ? 1 : 0) +
    (filters.time !== 'all' ? 1 : 0) +
    (filters.genType !== 'all' ? 1 : 0);

  const ChipGroup = ({ label, chips, activeKey, filterKey }: {
    label: string;
    chips: ChipDef[];
    activeKey: string;
    filterKey: keyof TaskFilters;
  }) => (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${label} filter`}>
      <span className="mr-1 w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {chips.map(chip => {
        const isActive = activeKey === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => update(filterKey, chip.key)}
            className={`todo-focus inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-smooth ${
              isActive ? 'todo-btn-active' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {chip.color && isActive && (
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chip.color }} aria-hidden="true" />
            )}
            {chip.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Wraps by available width (not viewport): the Copilot panel can halve the column at lg. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Find & narrow: search, Top 20%, filter panel */}
        <div className="flex min-w-[min(100%,20rem)] flex-1 basis-[28rem] items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Icon name="MagnifyingGlassIcon" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filters.search}
              onChange={e => update('search', e.target.value)}
              placeholder="Search tasks and context…"
              aria-label="Search tasks"
              className="todo-input py-2 pl-9 pr-8 text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => update('search', '')}
                className="todo-focus absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-smooth hover:text-foreground"
                aria-label="Clear search"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onChange({ ...filters, top20: !filters.top20 })}
            aria-pressed={filters.top20}
            className={`todo-btn todo-btn-secondary py-2 ${filters.top20 ? 'todo-btn-active' : ''}`}
            title="Show only the Top 20% high-leverage tasks"
          >
            <Icon name="StarIcon" size={14} variant={filters.top20 ? 'solid' : 'outline'} className={filters.top20 ? 'text-amber-500' : ''} />
            <span className="hidden sm:inline">Top 20%</span>
            <span className="sr-only sm:hidden">Top 20% only</span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="todo-filter-panel"
            className={`todo-btn todo-btn-secondary py-2 ${expanded || activeFilterCount > 0 ? 'todo-btn-active' : ''}`}
          >
            <Icon name="FunnelIcon" size={14} />
            <span className="hidden sm:inline">Filters</span>
            <span className="sr-only sm:hidden">Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
            <Icon name="ChevronDownIcon" size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Layout: how the task list is drawn */}
        <div className="todo-segmented" role="group" aria-label="Task layout">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.key}
              type="button"
              aria-pressed={filters.view === mode.key}
              onClick={() => update('view', mode.key)}
              className="todo-segment"
              title={mode.hint}
            >
              <Icon name={mode.icon} size={14} />
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Expanded filter chips */}
      {expanded && (
        <div id="todo-filter-panel" className="todo-glass space-y-2 p-3 animate-fade-in">
          <ChipGroup label="Status" chips={STATUS_CHIPS} activeKey={filters.status} filterKey="status" />
          <ChipGroup label="Priority" chips={PRIORITY_CHIPS} activeKey={filters.priority} filterKey="priority" />
          <ChipGroup label="Time" chips={TIME_CHIPS} activeKey={filters.time} filterKey="time" />
          <ChipGroup label="Type" chips={GEN_CHIPS} activeKey={filters.genType} filterKey="genType" />

          {/* Clear all */}
          {(activeFilterCount > 0 || filters.top20) && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, status: 'all', priority: 'all', time: 'all', genType: 'all', top20: false })}
              className="todo-focus rounded text-[11px] font-medium text-primary transition-smooth hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
