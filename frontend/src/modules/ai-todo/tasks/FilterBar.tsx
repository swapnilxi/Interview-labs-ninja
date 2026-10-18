'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  type TaskPriority,
  type TaskStatus,
  type ViewMode,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
} from '@/lib/services/todoService';
import { PRIORITY_COLOR, STATUS_COLOR } from '../shared/semanticColors';

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
  ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k, label: v.label, color: STATUS_COLOR[k as TaskStatus] })),
];

const PRIORITY_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  ...Object.entries(PRIORITY_CONFIG).map(([k, v]) => ({ key: k, label: v.label.split(' ')[0], color: PRIORITY_COLOR[k as TaskPriority] })),
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

// Top 20% is a filter like the others (it narrows the list), so it lives in the panel rather than as a loose button.
const LEVERAGE_CHIPS: ChipDef[] = [
  { key: 'all', label: 'All' },
  { key: 'top20', label: 'Top 20%' },
];

const VIEW_MODES: { key: ViewMode; label: string; icon: string; hint: string }[] = [
  { key: 'tree', label: 'Tree', icon: 'Bars3BottomLeftIcon', hint: 'Nested tasks and subtasks' },
  { key: 'list', label: 'List', icon: 'ListBulletIcon', hint: 'Every task as one flat list' },
  { key: 'focus', label: 'Focus', icon: 'PlayCircleIcon', hint: 'Only in-progress and overdue tasks' },
];

/** How many narrowing filters are on. Search and the layout are not filters; Top 20% is. */
export function countActiveFilters(f: TaskFilters): number {
  return (
    (f.status !== 'all' ? 1 : 0) +
    (f.priority !== 'all' ? 1 : 0) +
    (f.time !== 'all' ? 1 : 0) +
    (f.genType !== 'all' ? 1 : 0) +
    (f.top20 ? 1 : 0)
  );
}

/** Resets every narrowing filter but keeps the search text and the chosen layout. */
export function clearNarrowingFilters(f: TaskFilters): TaskFilters {
  return { ...f, status: 'all', priority: 'all', time: 'all', genType: 'all', top20: false };
}

/**
 * One row of filter chips. Declared at module level on purpose: defined inside FilterBar it was a new
 * component type on every render, so React remounted the buttons and a keyboard user lost focus after
 * each click.
 */
function ChipGroup({ label, chips, activeKey, onPick }: {
  label: string;
  chips: ChipDef[];
  activeKey: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${label} filter`}>
      <span className="mr-2 w-[4.5rem] shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {chips.map(chip => {
        const isActive = activeKey === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onPick(chip.key)}
            className={`todo-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-smooth ${
              isActive ? 'todo-btn-active' : 'text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.07]'
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
}

/** The active narrowing filters as plain {label, how to remove it} pairs, for the summary under the toolbar. */
function activeFilterChips(filters: TaskFilters): { id: string; group: string; label: string; color?: string; next: Partial<TaskFilters> }[] {
  const chips: { id: string; group: string; label: string; color?: string; next: Partial<TaskFilters> }[] = [];
  const pick = (defs: ChipDef[], key: string) => defs.find(c => c.key === key);
  if (filters.status !== 'all') {
    const c = pick(STATUS_CHIPS, filters.status);
    chips.push({ id: 'status', group: 'Status', label: c?.label ?? filters.status, color: c?.color, next: { status: 'all' } });
  }
  if (filters.priority !== 'all') {
    const c = pick(PRIORITY_CHIPS, filters.priority);
    chips.push({ id: 'priority', group: 'Priority', label: c?.label ?? filters.priority, color: c?.color, next: { priority: 'all' } });
  }
  if (filters.time !== 'all') {
    chips.push({ id: 'time', group: 'Time', label: pick(TIME_CHIPS, filters.time)?.label ?? filters.time, next: { time: 'all' } });
  }
  if (filters.genType !== 'all') {
    chips.push({ id: 'genType', group: 'Type', label: pick(GEN_CHIPS, filters.genType)?.label ?? filters.genType, next: { genType: 'all' } });
  }
  if (filters.top20) {
    chips.push({ id: 'top20', group: 'Leverage', label: 'Top 20%', next: { top20: false } });
  }
  return chips;
}

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const update = (key: keyof TaskFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const activeFilterCount = countActiveFilters(filters);
  const activeChips = activeFilterChips(filters);

  return (
    <div className="flex flex-col gap-3">
      {/* One row: find, narrow, then choose how the list is drawn. It wraps by the column's width (not the viewport):
          the Copilot panel can halve the column at lg. On a phone, search takes a row and the other two share the next. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="relative min-w-0 flex-[1_1_11rem]">
          <Icon name="MagnifyingGlassIcon" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={filters.search}
            onChange={e => update('search', e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks and their context"
            className="todo-input todo-input-quiet h-9 py-0 pl-9 pr-9 text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => update('search', '')}
              className="todo-focus absolute right-1.5 top-1/2 flex h-[1.5rem] w-[1.5rem] -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-smooth hover:text-foreground"
              aria-label="Clear search"
            >
              <Icon name="XMarkIcon" size={14} />
            </button>
          )}
        </div>

        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="todo-filter-panel"
            className={`todo-btn todo-btn-quiet h-9 px-3 ${activeFilterCount > 0 ? 'todo-btn-active' : expanded ? 'mix-bg-foreground/[0.11]' : ''}`}
          >
            <Icon name="FunnelIcon" size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold leading-none text-primary-foreground"
                aria-label={`${activeFilterCount} active`}
              >
                {activeFilterCount}
              </span>
            )}
            <Icon name="ChevronDownIcon" size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>

          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

          {/* Layout: how the task list is drawn. The one place to switch it. */}
          <div className="todo-segmented todo-segmented-quiet todo-segmented-accent h-9" role="group" aria-label="Task view">
            {VIEW_MODES.map(mode => (
              <button
                key={mode.key}
                type="button"
                aria-pressed={filters.view === mode.key}
                onClick={() => update('view', mode.key)}
                className="todo-segment h-full justify-center"
                title={mode.hint}
              >
                <Icon name={mode.icon} size={14} />
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* What is narrowing the list, without opening the panel: one tap on a chip drops that filter. */}
      {!expanded && activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Active filters">
          {activeChips.map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onChange({ ...filters, ...chip.next })}
              aria-label={`Remove filter ${chip.group}: ${chip.label}`}
              title={`Remove: ${chip.group} · ${chip.label}`}
              className="todo-focus group inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-xs font-medium text-foreground transition-smooth mix-bg-foreground/[0.07] hover:mix-bg-foreground/[0.12]"
            >
              {chip.color && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chip.color }} aria-hidden="true" />}
              <span className="text-muted-foreground">{chip.group}</span>
              {chip.label}
              <Icon name="XMarkIcon" size={12} className="text-muted-foreground group-hover:text-foreground" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange(clearNarrowingFilters(filters))}
            className="todo-focus rounded px-1.5 py-1 text-xs font-medium text-primary transition-smooth hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Expanded filter chips: a soft panel, not an outlined card */}
      {expanded && (
        <div id="todo-filter-panel" className="todo-surface flex flex-col gap-3 px-[1.25rem] py-4 animate-fade-in">
          <ChipGroup label="Status" chips={STATUS_CHIPS} activeKey={filters.status} onPick={key => update('status', key)} />
          <ChipGroup label="Priority" chips={PRIORITY_CHIPS} activeKey={filters.priority} onPick={key => update('priority', key)} />
          <ChipGroup label="Time" chips={TIME_CHIPS} activeKey={filters.time} onPick={key => update('time', key)} />
          <ChipGroup label="Type" chips={GEN_CHIPS} activeKey={filters.genType} onPick={key => update('genType', key)} />
          <ChipGroup
            label="Leverage"
            chips={LEVERAGE_CHIPS}
            activeKey={filters.top20 ? 'top20' : 'all'}
            onPick={key => onChange({ ...filters, top20: key === 'top20' })}
          />

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(clearNarrowingFilters(filters))}
              className="todo-focus self-start rounded text-xs font-medium text-primary transition-smooth hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
