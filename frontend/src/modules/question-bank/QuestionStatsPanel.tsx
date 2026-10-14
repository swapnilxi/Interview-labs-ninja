'use client';

import Icon from '@/components/ui/AppIcon';

interface QuestionStats {
  totalQuestions: number;
  interviewQuestions: number;
  cvSkillQuestions: number;
  easyQuestions: number;
  mediumQuestions: number;
  hardQuestions: number;
  reviewedThisWeek: number;
  averagePerformance: number;
}

interface QuestionStatsPanelProps {
  stats: QuestionStats;
  activeFilters: {
    category: string;
    difficulty: string;
    dateRange: string;
    searchQuery: string;
  };
}

export default function QuestionStatsPanel({
  stats,
  activeFilters,
}: QuestionStatsPanelProps) {
  const hasActiveFilters =
    activeFilters.category !== 'All Categories' ||
    activeFilters.difficulty !== 'All Levels' ||
    activeFilters.dateRange !== 'All Time' ||
    activeFilters.searchQuery !== '';

  const statCards = [
    {
      label: 'Total Questions',
      value: stats.totalQuestions,
      icon: 'BookOpenIcon' as const,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Interview',
      value: stats.interviewQuestions,
      icon: 'BriefcaseIcon' as const,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'CV Skill',
      value: stats.cvSkillQuestions,
      icon: 'CpuChipIcon' as const,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
    },
    {
      label: 'Reviewed This Week',
      value: stats.reviewedThisWeek,
      icon: 'CheckCircleIcon' as const,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
  ];

  const difficultyStats = [
    {
      label: 'Easy',
      value: stats.easyQuestions,
      color: 'bg-success',
      percentage: (stats.easyQuestions / stats.totalQuestions) * 100,
    },
    {
      label: 'Medium',
      value: stats.mediumQuestions,
      color: 'bg-warning',
      percentage: (stats.mediumQuestions / stats.totalQuestions) * 100,
    },
    {
      label: 'Hard',
      value: stats.hardQuestions,
      color: 'bg-error',
      percentage: (stats.hardQuestions / stats.totalQuestions) * 100,
    },
  ];

  return (
    <div className="space-y-18">
      {hasActiveFilters && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-18">
          <div className="flex items-center gap-12">
            <Icon
              name="FunnelIcon"
              size={18}
              variant="outline"
              className="text-primary"
            />
            <div>
              <p className="text-sm font-medium text-primary">
                Filters Active
              </p>
              <p className="text-xs text-primary/80 font-caption mt-3">
                Showing filtered results
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-lg p-24 shadow-md border border-border">
        <h3 className="font-heading text-lg font-medium text-foreground mb-18">
          Question Statistics
        </h3>

        <div className="grid grid-cols-2 gap-12 mb-24">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-background rounded-lg p-18 border border-border"
            >
              <div className="flex items-center gap-12 mb-12">
                <div
                  className={`w-36 h-36 rounded-md ${stat.bgColor} flex items-center justify-center`}
                >
                  <Icon
                    name={stat.icon}
                    size={18}
                    variant="outline"
                    className={stat.color}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-caption">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-semibold text-foreground font-heading">
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-18 border-t border-border">
          <h4 className="text-sm font-medium text-foreground mb-12 font-heading">
            Difficulty Distribution
          </h4>
          <div className="space-y-12">
            {difficultyStats.map((stat) => (
              <div key={stat.label}>
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm text-muted-foreground font-caption">
                    {stat.label}
                  </span>
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    {stat.value} ({Math.round(stat.percentage)}%)
                  </span>
                </div>
                <div className="h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stat.color} transition-smooth`}
                    style={{ width: `${stat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-18 pt-18 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-caption">
              Average Performance
            </span>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Icon
                    key={star}
                    name="StarIcon"
                    size={16}
                    variant={star <= stats.averagePerformance ? 'solid' : 'outline'}
                    className={
                      star <= stats.averagePerformance
                        ? 'text-warning' :'text-muted-foreground'
                    }
                  />
                ))}
              </div>
              <span className="text-sm font-medium text-foreground tabular-nums">
                {stats.averagePerformance.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}