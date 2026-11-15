'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import QuestionTableMobile from './QuestionTableMobile';
import QuestionGrid from './QuestionGrid';
import QuestionStatsPanel from './QuestionStatsPanel';
import BulkActionsBar from './BulkActionsBar';
import SortControls from './SortControls';
import EmptyState from './EmptyState';
import Icon from '@/components/ui/AppIcon';
import { questionsService, Question } from '@/lib/services/questionsService';

interface FilterOptions {
  category: string;
  difficulty: string;
  dateRange: string;
  searchQuery: string;
}

const DEFAULT_FILTERS: FilterOptions = {
  category: 'All Categories',
  difficulty: 'All Levels',
  dateRange: 'All Time',
  searchQuery: '',
};

// Values are what the filter compares against (unchanged); labels are what the menus show.
const CATEGORY_OPTIONS = [
  { value: 'All Categories', label: 'All categories' },
  { value: 'Interview', label: 'Interview' },
  { value: 'CV Skill', label: 'CV skill' },
];
const DIFFICULTY_OPTIONS = [
  { value: 'All Levels', label: 'All levels' },
  { value: 'Easy', label: 'Easy' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Hard', label: 'Hard' },
];
const DATE_OPTIONS = [
  { value: 'All Time', label: 'Any date' },
  { value: 'Last 7 Days', label: 'Last 7 days' },
  { value: 'Last 30 Days', label: 'Last 30 days' },
  { value: 'Last 90 Days', label: 'Last 90 days' },
  { value: 'This Year', label: 'This year' },
];

export default function QuestionBankInteractive({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState('dateEncountered');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [viewMode, setViewModeState] = useState<'list' | 'grid'>('list');
  const setViewMode = (m: 'list' | 'grid') => {
    setViewModeState(m);
    try {
      localStorage.setItem('labninja.questionbank.view', m);
    } catch {
      /* preference is best-effort */
    }
  };

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearingDuplicates, setClearingDuplicates] = useState(false);
  const [clearStatus, setClearStatus] = useState<{
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  const reloadQuestions = async () => {
    try {
      const data = await questionsService.getAll();
      setQuestions(data);
    } catch (err) {
      console.error('Failed to reload questions:', err);
    }
  };

  const handleClearDuplicates = async () => {
    setClearingDuplicates(true);
    setClearStatus(null);
    try {
      const res = await questionsService.clearDuplicates();
      const count = res.cleared_count ?? 0;
      setClearStatus({
        message:
          res.message ||
          (count > 0
            ? `Successfully cleared ${count} duplicate question(s)!`
            : 'No duplicate questions found.'),
        type: count > 0 ? 'success' : 'info',
      });
      await reloadQuestions();
      setTimeout(() => setClearStatus(null), 5000);
    } catch (err: any) {
      console.error('Failed to clear duplicate questions:', err);
      setClearStatus({
        message: err?.message || 'Failed to clear duplicate questions.',
        type: 'error',
      });
    } finally {
      setClearingDuplicates(false);
    }
  };

  useEffect(() => {
    try {
      if (localStorage.getItem('labninja.questionbank.view') === 'grid') setViewModeState('grid');
    } catch {
      /* default to list */
    }
  }, []);

  useEffect(() => {
    setIsHydrated(true);
    async function loadQuestions() {
      try {
        const data = await questionsService.getAll();
        setQuestions(data);
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        setLoading(false);
      }
    }
    loadQuestions();
  }, []);

  const filteredQuestions = useMemo(() => {
    let filtered = [...questions];

    if (filters.category !== 'All Categories') {
      filtered = filtered.filter((q) => q.category === filters.category);
    }

    if (filters.difficulty !== 'All Levels') {
      filtered = filtered.filter((q) => q.difficulty === filters.difficulty);
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (q) =>
          q.questionText.toLowerCase().includes(query) || q.subType.toLowerCase().includes(query)
      );
    }

    if (filters.dateRange !== 'All Time') {
      const now = new Date();
      const cutoffDate = new Date();

      switch (filters.dateRange) {
        case 'Last 7 Days':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case 'Last 30 Days':
          cutoffDate.setDate(now.getDate() - 30);
          break;
        case 'Last 90 Days':
          cutoffDate.setDate(now.getDate() - 90);
          break;
        case 'This Year':
          cutoffDate.setMonth(0, 1);
          break;
      }

      filtered = filtered.filter((q) => new Date(q.dateEncountered) >= cutoffDate);
    }

    filtered.sort((a, b) => {
      let aValue: any = a[sortBy as keyof Question];
      let bValue: any = b[sortBy as keyof Question];

      if (sortBy === 'difficulty') {
        const difficultyOrder = { Easy: 1, Medium: 2, Hard: 3 };
        aValue = difficultyOrder[a.difficulty];
        bValue = difficultyOrder[b.difficulty];
      }

      if (sortBy === 'performance') {
        aValue = a.userPerformance || 0;
        bValue = b.userPerformance || 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [questions, filters, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const total = questions.length;
    const interview = questions.filter((q) => q.category === 'Interview').length;
    const cvSkill = questions.filter((q) => q.category === 'CV Skill').length;
    const easy = questions.filter((q) => q.difficulty === 'Easy').length;
    const medium = questions.filter((q) => q.difficulty === 'Medium').length;
    const hard = questions.filter((q) => q.difficulty === 'Hard').length;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const reviewedThisWeek = questions.filter(
      (q) => q.lastReviewed && new Date(q.lastReviewed) >= weekAgo
    ).length;

    const performanceScores = questions
      .filter((q) => q.userPerformance !== undefined)
      .map((q) => q.userPerformance!);
    const avgPerformance =
      performanceScores.length > 0
        ? performanceScores.reduce((a, b) => a + b, 0) / performanceScores.length
        : 0;

    return {
      totalQuestions: total,
      interviewQuestions: interview,
      cvSkillQuestions: cvSkill,
      easyQuestions: easy,
      mediumQuestions: medium,
      hardQuestions: hard,
      reviewedThisWeek,
      averagePerformance: avgPerformance,
    };
  }, [questions]);

  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    setSelectedQuestions([]);
  };

  const handleSortChange = (newSortBy: string) => {
    setSortBy(newSortBy);
  };

  const handleOrderChange = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const handleSelectQuestion = (questionId: string) => {
    setSelectedQuestions((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const handleSelectAll = () => {
    // Read the selection itself, so the box also clears after picking every row by hand.
    const everySelected =
      filteredQuestions.length > 0 &&
      filteredQuestions.every((q) => selectedQuestions.includes(q.id));
    if (everySelected) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(filteredQuestions.map((q) => q.id));
    }
  };

  const handleReview = (questionId: string) => {
    router.push(`/question-review?id=${questionId}`);
  };

  const handlePractice = (questionId: string) => {
    // Practice Mode opens a one-question run for this id (see PracticeMode's `practice` entry link).
    router.push(`/daily-session?tab=practice&practice=${encodeURIComponent(questionId)}`);
  };

  const handleExport = () => {
    const selectedQuestionsData = questions.filter((q) => selectedQuestions.includes(q.id));

    const markdown = `# Question Bank Export\n\nExported on: ${new Date().toLocaleDateString(
      'en-US',
      {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }
    )}\n\nTotal Questions: ${selectedQuestionsData.length}\n\n---\n\n${selectedQuestionsData
      .map(
        (q, index) =>
          `## Question ${index + 1}\n\n**Category:** ${q.category}\n**Sub-Type:** ${q.subType}\n**Difficulty:** ${q.difficulty}\n**Date Encountered:** ${q.dateEncountered}\n\n${q.questionText}\n\n---\n`
      )
      .join('\n')}`;

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `question-bank-export-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleMarkForReview = () => {
    console.log('Marking questions for review:', selectedQuestions);
    setSelectedQuestions([]);
  };

  const handleClearSelection = () => {
    setSelectedQuestions([]);
  };

  const updateFilter = (key: keyof FilterOptions, value: string) => {
    handleFilterChange({ ...filters, [key]: value });
  };

  const handleClearFilters = () => {
    handleFilterChange(DEFAULT_FILTERS);
  };

  const hasActiveFilters =
    filters.category !== 'All Categories' ||
    filters.difficulty !== 'All Levels' ||
    filters.dateRange !== 'All Time' ||
    filters.searchQuery !== '';

  if (!isHydrated || loading) {
    const skeleton = (
      <div className="space-y-4 pb-10 pt-1" aria-busy="true" aria-label="Loading questions">
        <div className="ins-skel h-[9rem]" />
        <div className="ins-skel h-[2.75rem] rounded-[12px]" />
        <div className="ins-skel h-[24rem]" />
      </div>
    );
    if (embedded) return skeleton;
    return (
      <div className="lab-page ds-skin min-h-screen pt-[60px]">
        <div className="mx-auto max-w-[1200px] px-4 py-[2rem] sm:px-[2rem]">{skeleton}</div>
      </div>
    );
  }

  const filterMenus: {
    key: 'category' | 'difficulty' | 'dateRange';
    label: string;
    options: { value: string; label: string }[];
  }[] = [
    {
      key: 'category',
      label: 'Category',
      options: CATEGORY_OPTIONS,
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      options: DIFFICULTY_OPTIONS,
    },
    {
      key: 'dateRange',
      label: 'Date added',
      options: DATE_OPTIONS,
    },
  ];

  const allSelected =
    filteredQuestions.length > 0 &&
    filteredQuestions.every((q) => selectedQuestions.includes(q.id));

  const content = (
    <div
      className={
        embedded
          ? 'space-y-4 pb-10 pt-1'
          : 'mx-auto max-w-[1200px] space-y-4 px-4 py-[2rem] sm:px-[2rem]'
      }
    >
      {!embedded && (
        <div className="mb-2">
          <h1 className="ds-display">Question bank</h1>
          <p className="ds-body mt-1">
            Every question you&apos;ve seen, searchable and filterable.
          </p>
        </div>
      )}

      <QuestionStatsPanel stats={stats} activeFilters={filters} />

      {/* Toolbar: search and the list / grid switch, then the filter and sort menus (one sideways-scrolling line
          on a phone, all on one row from the laptop up). */}
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="ins-search order-1 min-w-0 flex-1 lg:max-w-[22rem]">
          <Icon name="MagnifyingGlassIcon" size={17} variant="outline" />
          <input
            type="search"
            value={filters.searchQuery}
            onChange={(e) => updateFilter('searchQuery', e.target.value)}
            placeholder="Search questions"
            aria-label="Search questions"
            enterKeyHint="search"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => updateFilter('searchQuery', '')}
              aria-label="Clear search"
            >
              <Icon name="XCircleIcon" size={18} variant="solid" />
            </button>
          )}
        </div>

        <div role="group" aria-label="View" className="ds-seg ins-seg order-2 lg:order-3">
          {(
            [
              ['list', 'ListBulletIcon', 'List'],
              ['grid', 'Squares2X2Icon', 'Grid'],
            ] as const
          ).map(([m, icon, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              aria-pressed={viewMode === m}
              aria-label={`${label} view`}
              title={`${label} view`}
            >
              <Icon name={icon} size={16} variant="outline" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className="ins-pills order-3 w-full lg:order-2 lg:w-auto lg:flex-1">
          {filterMenus.map((menu) => {
            const active = filters[menu.key] !== menu.options[0].value;
            return (
              <label key={menu.key} className="ins-select" data-active={active || undefined}>
                <span className="sr-only">{menu.label}</span>
                <select
                  value={filters[menu.key]}
                  onChange={(e) => updateFilter(menu.key, e.target.value)}
                >
                  {menu.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Icon name="ChevronDownIcon" size={14} variant="outline" />
              </label>
            );
          })}
          <span className="ins-vrule" aria-hidden="true" />
          <SortControls
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onOrderChange={handleOrderChange}
          />
        </div>
      </div>

      {clearStatus && (
        <div
          role="status"
          className={`ds-banner ds-banner-center ${
            clearStatus.type === 'success'
              ? 'ds-tone-jade'
              : clearStatus.type === 'error'
                ? 'ds-tone-rose'
                : 'ds-tone-indigo'
          }`}
        >
          <Icon
            name={clearStatus.type === 'error' ? 'ExclamationCircleIcon' : 'CheckCircleIcon'}
            size={18}
            variant="solid"
          />
          <span className="min-w-0 flex-1">{clearStatus.message}</span>
          <button
            type="button"
            onClick={() => setClearStatus(null)}
            className="ins-icon-btn -my-2 -mr-2"
            aria-label="Dismiss"
          >
            <Icon name="XMarkIcon" size={16} variant="outline" />
          </button>
        </div>
      )}

      <div className="ins-resultbar">
        {filteredQuestions.length > 0 && (
          <label className="ins-check-hit" title={allSelected ? 'Deselect all' : 'Select all'}>
            <input
              type="checkbox"
              className="ins-check"
              checked={allSelected}
              onChange={handleSelectAll}
              aria-label={
                allSelected
                  ? 'Deselect all questions'
                  : `Select all ${filteredQuestions.length} questions`
              }
            />
          </label>
        )}
        <p className="ins-count min-w-0 truncate">
          {hasActiveFilters ? (
            <>
              {filteredQuestions.length} of {questions.length}
              <span className="hidden sm:inline">
                {questions.length === 1 ? ' question' : ' questions'}
              </span>
            </>
          ) : (
            `${filteredQuestions.length} ${filteredQuestions.length === 1 ? 'question' : 'questions'}`
          )}
        </p>
        {hasActiveFilters && (
          <button type="button" onClick={handleClearFilters} className="ds-link text-[0.86rem]">
            Clear filters
          </button>
        )}
        <button
          type="button"
          onClick={handleClearDuplicates}
          disabled={clearingDuplicates}
          title="Find and remove duplicate questions in your bank"
          className="ds-btn ds-btn-ghost ds-btn-sm ml-auto"
        >
          <Icon
            name={clearingDuplicates ? 'ArrowPathIcon' : 'SparklesIcon'}
            size={16}
            variant="outline"
            className={clearingDuplicates ? 'animate-spin' : ''}
          />
          {clearingDuplicates ? 'Clearing…' : 'Clear duplicates'}
        </button>
      </div>

      {filteredQuestions.length > 0 ? (
        viewMode === 'list' ? (
          <QuestionTableMobile
            questions={filteredQuestions}
            onReview={handleReview}
            onPractice={handlePractice}
            selectedQuestions={selectedQuestions}
            onSelect={handleSelectQuestion}
          />
        ) : (
          <QuestionGrid
            questions={filteredQuestions}
            onReview={handleReview}
            onPractice={handlePractice}
            selectedQuestions={selectedQuestions}
            onSelect={handleSelectQuestion}
          />
        )
      ) : (
        <EmptyState hasFilters={hasActiveFilters} onClearFilters={handleClearFilters} />
      )}

      <BulkActionsBar
        selectedCount={selectedQuestions.length}
        onExport={handleExport}
        onMarkForReview={handleMarkForReview}
        onClearSelection={handleClearSelection}
      />
    </div>
  );

  if (embedded) return content;

  return <div className="lab-page ds-skin min-h-screen pt-[60px]">{content}</div>;
}
