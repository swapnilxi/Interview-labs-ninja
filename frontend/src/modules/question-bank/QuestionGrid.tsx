'use client';

import Icon from '@/components/ui/AppIcon';
import type { Question } from '@/lib/services/questionsService';

interface QuestionGridProps {
  questions: Question[];
  onReview: (questionId: string) => void;
  onPractice: (questionId: string) => void;
  selectedQuestions: string[];
  onSelect: (questionId: string) => void;
}

const difficultyStyle: Record<string, string> = {
  Easy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  Hard: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Card-grid view of the question bank: 1 column on phones, 2 on tablets, 3 on wide screens. */
export default function QuestionGrid({
  questions,
  onReview,
  onPractice,
  selectedQuestions,
  onSelect,
}: QuestionGridProps) {
  return (
    <div className="grid grid-cols-1 gap-[1rem] md:grid-cols-2 2xl:grid-cols-3">
      {questions.map((q) => {
        const selected = selectedQuestions.includes(q.id);
        return (
          <article
            key={q.id}
            onClick={() => onReview(q.id)}
            className={`group flex cursor-pointer flex-col rounded-2xl border bg-card p-[1.1rem] transition-all hover:-translate-y-0.5 hover:shadow-md ${
              selected
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="mb-[0.75rem] flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                    q.category === 'Interview'
                      ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300'
                      : 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                  }`}
                >
                  {q.category}
                </span>
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${difficultyStyle[q.difficulty] ?? 'bg-muted text-muted-foreground'}`}
                >
                  {q.difficulty}
                </span>
              </div>
              <input
                type="checkbox"
                checked={selected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onSelect(q.id)}
                className="h-[1.1rem] w-[1.1rem] flex-shrink-0 cursor-pointer rounded border-2 border-border bg-input checked:border-primary checked:bg-primary"
                aria-label={`Select question ${q.id}`}
              />
            </div>

            <h3 className="line-clamp-4 flex-1 text-sm font-medium leading-relaxed text-foreground transition-colors group-hover:text-primary">
              {q.questionText}
            </h3>

            <div className="mt-[0.75rem] text-xs font-medium text-muted-foreground">
              {q.subType}
            </div>

            <div className="mt-[0.75rem] flex items-end justify-between gap-2 border-t border-border pt-[0.75rem]">
              <div className="space-y-1 text-xs text-muted-foreground tabular-nums">
                <div className="flex items-center gap-1.5">
                  <Icon name="CalendarIcon" size={13} variant="outline" />
                  {formatDate(q.dateEncountered)}
                </div>
                <div className="flex items-center gap-1.5">
                  <Icon name="ClockIcon" size={13} variant="outline" />
                  Last: {q.lastReviewed ? formatDate(q.lastReviewed) : 'Never'}
                </div>
                {q.userPerformance !== undefined && (
                  <div
                    className="flex items-center gap-0.5"
                    aria-label={`Performance ${q.userPerformance} of 5`}
                  >
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Icon
                        key={s}
                        name="StarIcon"
                        size={13}
                        variant={s <= q.userPerformance! ? 'solid' : 'outline'}
                        className={
                          s <= q.userPerformance! ? 'text-amber-500' : 'text-muted-foreground'
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReview(q.id);
                  }}
                  className="rounded-lg p-2 mix-bg-primary/10 text-primary transition-colors hover:mix-bg-primary/20"
                  aria-label="Review question"
                  title="Review"
                >
                  <Icon name="EyeIcon" size={17} variant="outline" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPractice(q.id);
                  }}
                  className="rounded-lg bg-muted p-2 text-foreground transition-colors hover:bg-muted/70"
                  aria-label="Practice again"
                  title="Practice again"
                >
                  <Icon name="ArrowPathIcon" size={17} variant="outline" />
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
