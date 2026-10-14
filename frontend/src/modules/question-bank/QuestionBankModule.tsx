'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import QuestionFilterToolbar from '@/components/common/QuestionFilterToolbar';
import QuestionTableRow from './QuestionTableRow';
import QuestionTableMobile from './QuestionTableMobile';
import QuestionStatsPanel from './QuestionStatsPanel';
import BulkActionsBar from './BulkActionsBar';
import SortControls from './SortControls';
import EmptyState from './EmptyState';
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

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

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
    router.push(`/daily-session?practice=${questionId}`);
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
        <div className="mb-36">
          <h1 className="font-heading text-4xl font-semibold text-foreground mb-12">
            Question Bank
          </h1>
          <p className="text-muted-foreground font-body">
            Review and practice previously encountered questions to reinforce your skills
          </p>
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
                      <div className="flex items-center gap-12">
                        <h2 className="font-heading text-lg font-medium text-foreground">
                          Questions
                        </h2>
                        <span className="px-12 py-6 rounded-md bg-primary/10 text-primary text-sm font-medium tabular-nums">
                          {filteredQuestions.length}
                        </span>
                      </div>
                      <SortControls
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSortChange={handleSortChange}
                        onOrderChange={handleOrderChange}
                      />
                    </div>
                  </div>

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

                  <div className="lg:hidden p-18">
                    <QuestionTableMobile
                      questions={filteredQuestions}
                      onReview={handleReview}
                      onPractice={handlePractice}
                      selectedQuestions={selectedQuestions}
                      onSelect={handleSelectQuestion}
                    />
                  </div>
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