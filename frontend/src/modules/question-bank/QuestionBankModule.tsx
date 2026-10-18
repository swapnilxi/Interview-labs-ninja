'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import QuestionFilterToolbar from '@/components/common/QuestionFilterToolbar';
import QuestionTableRow from './QuestionTableRow';
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


export default function QuestionBankInteractive({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    category: 'All Categories',
    difficulty: 'All Levels',
    dateRange: 'All Time',
    searchQuery: '',
  });
  const [sortBy, setSortBy] = useState('dateEncountered');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
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
  const [clearStatus, setClearStatus] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

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
        message: res.message || (count > 0 ? `Successfully cleared ${count} duplicate question(s)!` : 'No duplicate questions found.'),
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
          q.questionText.toLowerCase().includes(query) ||
          q.subType.toLowerCase().includes(query)
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

      filtered = filtered.filter(
        (q) => new Date(q.dateEncountered) >= cutoffDate
      );
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
    setSelectAll(false);
  };

  const handleSortChange = (newSortBy: string) => {
    setSortBy(newSortBy);
  };

  const handleOrderChange = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const handleSelectQuestion = (questionId: string) => {
    setSelectedQuestions((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(filteredQuestions.map((q) => q.id));
    }
    setSelectAll(!selectAll);
  };

  const handleReview = (questionId: string) => {
    router.push(`/question-review?id=${questionId}`);
  };

  const handlePractice = (questionId: string) => {
    // Practice Mode opens a one-question run for this id (see PracticeMode's `practice` entry link).
    router.push(`/daily-session?tab=practice&practice=${encodeURIComponent(questionId)}`);
  };

  const handleExport = () => {
    const selectedQuestionsData = questions.filter((q) =>
      selectedQuestions.includes(q.id)
    );

    const markdown = `# Question Bank Export\n\nExported on: ${new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })}\n\nTotal Questions: ${selectedQuestionsData.length}\n\n---\n\n${selectedQuestionsData
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
    setSelectAll(false);
  };

  const handleClearSelection = () => {
    setSelectedQuestions([]);
    setSelectAll(false);
  };

  const handleClearFilters = () => {
    setFilters({
      category: 'All Categories',
      difficulty: 'All Levels',
      dateRange: 'All Time',
      searchQuery: '',
    });
  };

  const hasActiveFilters =
    filters.category !== 'All Categories' ||
    filters.difficulty !== 'All Levels' ||
    filters.dateRange !== 'All Time' ||
    filters.searchQuery !== '';

  if (!isHydrated || loading) {
    if (embedded) {
      return (
        <div className="flex h-72 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="max-w-[1400px] mx-auto px-24 py-36">
          <div className="animate-pulse space-y-24">
            <div className="h-48 bg-muted rounded-lg w-1/3" />
            <div className="h-96 bg-muted rounded-lg" />
            <div className="h-[600px] bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const content = (
    <div className={embedded ? "space-y-6 pt-1 pb-10" : "max-w-[1400px] mx-auto px-24 py-36"}>
      {!embedded && (
        <div className="mb-36 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-18">
          <div>
            <h1 className="font-heading text-4xl font-semibold text-foreground mb-12">
              Question Bank
            </h1>
            <p className="text-muted-foreground font-body">
              Review and practice previously encountered questions to reinforce your skills
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearDuplicates}
            disabled={clearingDuplicates}
            title="Scan and remove duplicate questions using SQL"
            className="inline-flex items-center gap-8 px-18 py-10 rounded-lg border border-border bg-card hover:bg-muted text-foreground font-medium text-sm transition-smooth shadow-sm self-start sm:self-auto disabled:opacity-50"
          >
            <Icon
              name="SparklesIcon"
              size={18}
              variant="outline"
              className={clearingDuplicates ? "animate-spin text-primary" : "text-amber-500"}
            />
            <span>{clearingDuplicates ? "Clearing..." : "Clear Duplicates"}</span>
          </button>
        </div>
      )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-24">
          <div className="lg:col-span-3 space-y-24">
            <QuestionFilterToolbar
              onFilterChange={handleFilterChange}
              categories={['All Categories', 'Interview', 'CV Skill']}
              difficulties={['All Levels', 'Easy', 'Medium', 'Hard']}
            />

            {filteredQuestions.length > 0 ? (
              <>
                <div className="bg-card rounded-lg shadow-md border border-border overflow-hidden">
                  <div className="p-24 border-b border-border">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-18">
                      <div className="flex items-center gap-12 flex-wrap">
                        <h2 className="font-heading text-lg font-medium text-foreground">
                          Questions
                        </h2>
                        <span className="px-12 py-6 rounded-md bg-primary/10 text-primary text-sm font-medium tabular-nums">
                          {filteredQuestions.length}
                        </span>
                        <button
                          type="button"
                          onClick={handleClearDuplicates}
                          disabled={clearingDuplicates}
                          title="Scan and remove duplicate questions from question bank using SQL"
                          className="inline-flex items-center gap-6 px-12 py-6 rounded-md border border-border bg-card hover:bg-muted text-foreground text-xs font-medium transition-smooth shadow-sm disabled:opacity-50"
                        >
                          <Icon
                            name="SparklesIcon"
                            size={14}
                            variant="outline"
                            className={clearingDuplicates ? "animate-spin text-primary" : "text-amber-500"}
                          />
                          <span>{clearingDuplicates ? "Clearing..." : "Clear Duplicates"}</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div role="group" aria-label="View mode" className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
                          {([['list', 'ListBulletIcon', 'List'], ['grid', 'Squares2X2Icon', 'Grid']] as const).map(([m, icon, label]) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setViewMode(m)}
                              aria-pressed={viewMode === m}
                              title={`${label} view`}
                              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                                viewMode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <Icon name={icon} size={15} variant="outline" />
                              {label}
                            </button>
                          ))}
                        </div>
                        <SortControls
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSortChange={handleSortChange}
                          onOrderChange={handleOrderChange}
                        />
                      </div>
                    </div>
                    {clearStatus && (
                      <div className={`mt-12 px-14 py-8 rounded-md text-xs font-medium flex items-center gap-8 border transition-smooth ${
                        clearStatus.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : clearStatus.type === 'error'
                          ? 'bg-destructive/10 text-destructive border-destructive/20'
                          : 'bg-primary/10 text-primary border-primary/20'
                      }`}>
                        <Icon name="CheckCircleIcon" size={16} variant="solid" className={clearStatus.type === 'error' ? 'text-destructive' : 'text-emerald-500'} />
                        <span>{clearStatus.message}</span>
                      </div>
                    )}
                  </div>

                  {viewMode === 'list' && (
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-18 py-12 text-left">
                            <input
                              type="checkbox"
                              checked={selectAll}
                              onChange={handleSelectAll}
                              className="w-18 h-18 rounded border-2 border-border bg-input checked:bg-primary checked:border-primary transition-smooth cursor-pointer focus-ring"
                              aria-label="Select all questions"
                            />
                          </th>
                          <th className="px-18 py-12 text-left text-sm font-medium text-muted-foreground font-heading">
                            Question
                          </th>
                          <th className="px-18 py-12 text-left text-sm font-medium text-muted-foreground font-heading">
                            Category
                          </th>
                          <th className="px-18 py-12 text-left text-sm font-medium text-muted-foreground font-heading">
                            Sub-Type
                          </th>
                          <th className="px-18 py-12 text-left text-sm font-medium text-muted-foreground font-heading">
                            Difficulty
                          </th>
                          <th className="px-18 py-12 text-left text-sm font-medium text-muted-foreground font-heading">
                            Date
                          </th>
                          <th className="px-18 py-12 text-left text-sm font-medium text-muted-foreground font-heading">
                            Last Reviewed
                          </th>
                          <th className="px-18 py-12 text-left text-sm font-medium text-muted-foreground font-heading">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuestions.map((question) => (
                          <QuestionTableRow
                            key={question.id}
                            question={question}
                            onReview={handleReview}
                            onPractice={handlePractice}
                            isSelected={selectedQuestions.includes(question.id)}
                            onSelect={handleSelectQuestion}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  )}

                  {viewMode === 'list' && (
                  <div className="lg:hidden p-18">
                    <QuestionTableMobile
                      questions={filteredQuestions}
                      onReview={handleReview}
                      onPractice={handlePractice}
                      selectedQuestions={selectedQuestions}
                      onSelect={handleSelectQuestion}
                    />
                  </div>
                  )}

                  {viewMode === 'grid' && (
                    <div className="p-[1.1rem]">
                      <label className="mb-[0.9rem] inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={selectAll}
                          onChange={handleSelectAll}
                          className="h-[1.1rem] w-[1.1rem] cursor-pointer rounded border-2 border-border bg-input checked:border-primary checked:bg-primary"
                        />
                        Select all {filteredQuestions.length}
                      </label>
                      <QuestionGrid
                        questions={filteredQuestions}
                        onReview={handleReview}
                        onPractice={handlePractice}
                        selectedQuestions={selectedQuestions}
                        onSelect={handleSelectQuestion}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                hasFilters={hasActiveFilters}
                onClearFilters={handleClearFilters}
              />
            )}
          </div>

          <div className="lg:col-span-1">
            <QuestionStatsPanel stats={stats} activeFilters={filters} />
          </div>
        </div>

        <BulkActionsBar
          selectedCount={selectedQuestions.length}
          onExport={handleExport}
          onMarkForReview={handleMarkForReview}
          onClearSelection={handleClearSelection}
        />
      </div>
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-background pt-[60px]">
      {content}
    </div>
  );
}