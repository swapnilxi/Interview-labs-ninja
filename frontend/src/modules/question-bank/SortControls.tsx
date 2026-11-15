'use client';

import Icon from '@/components/ui/AppIcon';

interface SortControlsProps {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: string) => void;
  onOrderChange: () => void;
}

const sortOptions = [
  { value: 'dateEncountered', label: 'Date added' },
  { value: 'lastReviewed', label: 'Last reviewed' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'category', label: 'Category' },
  { value: 'performance', label: 'Rating' },
];

/** A sort menu pill and the order toggle beside it. */
export default function SortControls({
  sortBy,
  sortOrder,
  onSortChange,
  onOrderChange,
}: SortControlsProps) {
  const next = sortOrder === 'asc' ? 'descending' : 'ascending';
  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      <label className="ins-select">
        <span className="sr-only">Sort by</span>
        <Icon name="ArrowsUpDownIcon" size={15} variant="outline" className="ins-lead" />
        <select value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="ChevronDownIcon" size={14} variant="outline" />
      </label>

      <button
        type="button"
        onClick={onOrderChange}
        className="ins-icon-btn"
        aria-label={`Sort ${next}`}
        title={`Sort ${next}`}
      >
        <Icon
          name={sortOrder === 'asc' ? 'BarsArrowUpIcon' : 'BarsArrowDownIcon'}
          size={19}
          variant="outline"
        />
      </button>
    </div>
  );
}
