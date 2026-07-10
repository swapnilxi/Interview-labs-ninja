'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  type TaskStatus,
  type TaskPriority,
  type GenerationType,
  type ViewMode,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
} from '@/lib/services/todoService';

interface Filters {
  status: TaskStatus | 'all';
  priority: string;
  time: string;
  genType: string;
  search: string;
  view: ViewMode;
}

interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
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
  { key: 'dive_deeper', label: '🔍 Dive Deeper' },
  { key: 'chunk', label: '⚡ Chunk' },
];

const VIEW_MODES: { key: ViewMode; label: string; icon: string }[] = [
  { key: 'tree', label: 'Tree', icon: '🌲' },
  { key: 'list', label: 'List', icon: '📋' },
  { key: 'focus', label: 'Focus', icon: '🎯' },
];

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  const update = (key: keyof Filters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const ChipGroup = ({ label, chips, activeKey, filterKey }: {
    label: string;
    chips: ChipDef[];
    activeKey: string;
    filterKey: keyof Filters;
  }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mr-1">{label}</span>
      {chips.map(chip => (
        <button
          key={chip.key}
          onClick={() => update(filterKey, chip.key)}
          className={`text-[10px] px-2 py-1 rounded-full border transition-smooth font-medium ${
            activeKey === chip.key
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
          }`}
        >
          {chip.color && activeKey === chip.key && (
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: chip.color }} />
          )}
          {chip.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Top bar: search + view toggle + expand filters */}
      <div className="flex items-center gap-3">
        {/* Search (feedback #8) */}
        <div className="flex-1 relative">
          <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={filters.search}
            onChange={e => update('search', e.target.value)}
            placeholder="Search tasks..."
            className="w-full bg-input border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground focus-ring placeholder:text-muted-foreground"
          />
          {filters.search && (
            <button
              onClick={() => update('search', '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-smooth"
            >
              <Icon name="XMarkIcon" size={14} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.key}
              onClick={() => update('view', mode.key)}
              className={`text-[10px] px-2.5 py-1.5 rounded-md transition-smooth font-medium flex items-center gap-1 ${
                filters.view === mode.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{mode.icon}</span>
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>

        {/* Expand filters button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-smooth flex items-center gap-1 ${
            expanded ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="FunnelIcon" size={12} />
          <span className="hidden sm:inline">Filters</span>
          <Icon name="ChevronDownIcon" size={10} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded filter chips */}
      {expanded && (
        <div className="space-y-2 p-3 rounded-lg bg-card border border-border animate-fade-in">
          <ChipGroup label="Status" chips={STATUS_CHIPS} activeKey={filters.status} filterKey="status" />
          <ChipGroup label="Priority" chips={PRIORITY_CHIPS} activeKey={filters.priority} filterKey="priority" />
          <ChipGroup label="Time" chips={TIME_CHIPS} activeKey={filters.time} filterKey="time" />
          <ChipGroup label="Type" chips={GEN_CHIPS} activeKey={filters.genType} filterKey="genType" />

          {/* Clear all */}
          {(filters.status !== 'all' || filters.priority !== 'all' || filters.time !== 'all' || filters.genType !== 'all') && (
            <button
              onClick={() => onChange({ ...filters, status: 'all', priority: 'all', time: 'all', genType: 'all' })}
              className="text-[10px] text-primary hover:text-primary/80 transition-smooth font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
