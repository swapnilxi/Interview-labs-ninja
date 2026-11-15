'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface FilterOptions {
  category: string;
  difficulty: string;
  dateRange: string;
  searchQuery: string;
}

interface QuestionFilterToolbarProps {
  onFilterChange: (filters: FilterOptions) => void;
  categories?: string[];
  difficulties?: string[];
}

const defaultCategories = [
  'All Categories',
  'Algorithms',
  'Data Structures',
  'System Design',
  'Computer Vision',
  'Machine Learning',
  'Behavioral',
];

const defaultDifficulties = ['All Levels', 'Easy', 'Medium', 'Hard'];

const dateRanges = [
  'All Time',
  'Last 7 Days',
  'Last 30 Days',
  'Last 90 Days',
  'This Year',
];

export default function QuestionFilterToolbar({
  onFilterChange,
  categories = defaultCategories,
  difficulties = defaultDifficulties,
}: QuestionFilterToolbarProps) {
  const [filters, setFilters] = useState<FilterOptions>({
    category: categories[0],
    difficulty: difficulties[0],
    dateRange: dateRanges[0],
    searchQuery: '',
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    handleFilterChange('searchQuery', value);
  };

  const handleClearFilters = () => {
    const clearedFilters: FilterOptions = {
      category: categories[0],
      difficulty: difficulties[0],
      dateRange: dateRanges[0],
      searchQuery: '',
    };
    setFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  const hasActiveFilters =
    filters.category !== categories[0] ||
    filters.difficulty !== difficulties[0] ||
    filters.dateRange !== dateRanges[0] ||
    filters.searchQuery !== '';

  return (
    <div className="rounded-[20px] border mix-border-foreground/[0.07] bg-card p-4 shadow-card sm:p-24">
      {/* No gap under the title while the filters are folded away (phones / tablets). */}
      <div className={`flex items-center justify-between lg:mb-0 ${isExpanded ? 'mb-18' : ''}`}>
        <div className="flex items-center gap-12">
          <Icon name="FunnelIcon" size={20} variant="outline" />
          <h3 className="font-heading text-lg font-medium text-foreground">
            Filter Questions
          </h3>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="lg:hidden p-6 rounded-md hover:bg-muted transition-smooth focus-ring"
          aria-label="Toggle filters"
          aria-expanded={isExpanded}
        >
          <Icon
            name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
            size={20}
            variant="outline"
          />
        </button>
      </div>

      <div
        className={`
          ${isExpanded ? 'block' : 'hidden'} lg:block
          space-y-18 lg:space-y-0 lg:grid lg:grid-cols-4 lg:gap-18 mt-18 lg:mt-24
        `}
      >
        <div className="relative">
          <label
            htmlFor="search"
            className="block text-sm font-medium text-muted-foreground mb-6 font-caption"
          >
            Search
          </label>
          <div className="relative">
            <input
              id="search"
              type="text"
              value={filters.searchQuery}
              onChange={handleSearchChange}
              placeholder="Search questions..."
              className="
                w-full h-48 pl-42 pr-18 rounded-md
                bg-input border border-border
                text-foreground placeholder:text-muted-foreground
                transition-smooth focus-ring
                font-body text-sm
              "
            />
            <Icon
              name="MagnifyingGlassIcon"
              size={18}
              variant="outline"
              className="absolute left-18 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium text-muted-foreground mb-6 font-caption"
          >
            Category
          </label>
          <select
            id="category"
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            className="
              w-full h-48 px-18 rounded-md
              bg-input border border-border
              text-foreground
              transition-smooth focus-ring
              font-body text-sm
              cursor-pointer
            "
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="difficulty"
            className="block text-sm font-medium text-muted-foreground mb-6 font-caption"
          >
            Difficulty
          </label>
          <select
            id="difficulty"
            value={filters.difficulty}
            onChange={(e) => handleFilterChange('difficulty', e.target.value)}
            className="
              w-full h-48 px-18 rounded-md
              bg-input border border-border
              text-foreground
              transition-smooth focus-ring
              font-body text-sm
              cursor-pointer
            "
          >
            {difficulties.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficulty}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="dateRange"
            className="block text-sm font-medium text-muted-foreground mb-6 font-caption"
          >
            Date Range
          </label>
          <select
            id="dateRange"
            value={filters.dateRange}
            onChange={(e) => handleFilterChange('dateRange', e.target.value)}
            className="
              w-full h-48 px-18 rounded-md
              bg-input border border-border
              text-foreground
              transition-smooth focus-ring
              font-body text-sm
              cursor-pointer
            "
          >
            {dateRanges.map((range) => (
              <option key={range} value={range}>
                {range}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mt-18 pt-18 border-t border-border flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-caption">
            Active filters applied
          </span>
          <button
            onClick={handleClearFilters}
            className="
              flex items-center gap-6 px-18 py-6 rounded-md
              text-sm font-medium text-primary
              hover:bg-muted transition-smooth focus-ring
            "
          >
            <Icon name="XMarkIcon" size={16} variant="outline" />
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}