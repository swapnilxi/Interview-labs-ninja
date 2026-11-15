'use client';

import { toneClass, type Tone } from '@/modules/daily-session/components/ds';
import { RatingStars } from './QuestionTableRow';

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

/** The bank at a glance: four counts, the difficulty mix as one split bar, and the average self-rating. */
export default function QuestionStatsPanel({ stats, activeFilters }: QuestionStatsPanelProps) {
  const hasActiveFilters =
    activeFilters.category !== 'All Categories' ||
    activeFilters.difficulty !== 'All Levels' ||
    activeFilters.dateRange !== 'All Time' ||
    activeFilters.searchQuery !== '';

  const statCards = [
    { label: 'Questions', value: stats.totalQuestions },
    { label: 'Interview', value: stats.interviewQuestions },
    { label: 'CV skill', value: stats.cvSkillQuestions },
    { label: 'Reviewed this week', value: stats.reviewedThisWeek },
  ];

  const pct = (n: number) =>
    stats.totalQuestions > 0 ? Math.round((n / stats.totalQuestions) * 100) : 0;
  const difficultyStats: { label: string; value: number; tone: Tone }[] = [
    { label: 'Easy', value: stats.easyQuestions, tone: 'jade' },
    { label: 'Medium', value: stats.mediumQuestions, tone: 'gold' },
    { label: 'Hard', value: stats.hardQuestions, tone: 'rose' },
  ];
  const rated = stats.averagePerformance > 0;

  return (
    <section className="ds-card p-3 sm:p-4" aria-labelledby="ins-bank-stats">
      <h2 id="ins-bank-stats" className="sr-only">
        Question statistics
      </h2>
      <dl className="ins-tiles grid grid-cols-2 gap-2 md:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="ds-stat-tile">
            <dt className="truncate">{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-col gap-3 px-1 sm:mt-4 md:flex-row md:items-center md:gap-[1.5rem]">
        <div className="min-w-0 flex-1">
          <div
            className="ins-mix"
            role="img"
            aria-label={`Difficulty mix: ${difficultyStats.map((d) => `${d.label} ${d.value}`).join(', ')}`}
          >
            {stats.totalQuestions > 0 &&
              difficultyStats
                .filter((d) => d.value > 0)
                .map((d) => (
                  <span key={d.label} className={toneClass(d.tone)} style={{ flexGrow: d.value }} />
                ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {difficultyStats.map((d) => (
              <span key={d.label} className={`ins-key ${toneClass(d.tone)}`}>
                <i aria-hidden="true" />
                {d.label}
                <span className="font-semibold ds-ink ds-num">{d.value}</span>
                <span className="ds-faint ds-num">{pct(d.value)}%</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t ds-hairline pt-3 md:border-0 md:pt-0">
          <span className="text-[0.8rem] font-medium ds-faint">Average rating</span>
          {rated ? (
            <span className="inline-flex items-center gap-2">
              <RatingStars value={Math.floor(stats.averagePerformance)} size={14} />
              <span className="text-[0.88rem] font-semibold ds-ink ds-num">
                {stats.averagePerformance.toFixed(1)}
              </span>
            </span>
          ) : (
            <span className="text-[0.8rem] font-semibold ds-muted">Not rated yet</span>
          )}
        </div>
      </div>

      {hasActiveFilters && (
        <p className="mt-3 px-1 text-[0.76rem] ds-faint">
          Totals for your whole bank, not just the filtered list.
        </p>
      )}
    </section>
  );
}
