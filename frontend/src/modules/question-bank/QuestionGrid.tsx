'use client';

import Icon from '@/components/ui/AppIcon';
import { DifficultyChip } from '@/modules/daily-session/components/ds';
import type { Question } from '@/lib/services/questionsService';
import { categoryLabel, formatDay, RatingStars } from './QuestionTableRow';

interface QuestionGridProps {
  questions: Question[];
  onReview: (questionId: string) => void;
  onPractice: (questionId: string) => void;
  selectedQuestions: string[];
  onSelect: (questionId: string) => void;
}

/** Card-grid view of the question bank: 1 column on phones, 2 on tablets, 3 on wide screens. */
export default function QuestionGrid({
  questions,
  onReview,
  onPractice,
  selectedQuestions,
  onSelect,
}: QuestionGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Questions">
      {questions.map((q) => {
        const selected = selectedQuestions.includes(q.id);
        return (
          <li key={q.id} className="flex">
            <article
              onClick={() => onReview(q.id)}
              className="ins-qcard w-full"
              data-selected={selected || undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-1.5">
                  <DifficultyChip difficulty={q.difficulty} />
                  <span className="ds-chip ds-tone-neutral">{categoryLabel(q.category)}</span>
                </div>
                <label
                  className="ins-check-hit -mr-1.5 -mt-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="ins-check"
                    checked={selected}
                    onChange={() => onSelect(q.id)}
                    aria-label={`Select: ${q.questionText}`}
                  />
                </label>
              </div>

              <button
                type="button"
                className="ins-qtext"
                onClick={(e) => {
                  e.stopPropagation();
                  onReview(q.id);
                }}
              >
                {q.questionText}
              </button>

              <p className="mb-3 mt-1.5 truncate text-[0.78rem] ds-faint">{q.subType}</p>

              <div className="ins-qcard-foot">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.76rem] ds-faint ds-num">
                  <time className="whitespace-nowrap" dateTime={q.dateEncountered}>
                    {formatDay(q.dateEncountered)}
                  </time>
                  <span className="whitespace-nowrap">
                    {q.lastReviewed ? `Reviewed ${formatDay(q.lastReviewed)}` : 'Not reviewed'}
                  </span>
                  {q.userPerformance !== undefined && <RatingStars value={q.userPerformance} />}
                </div>
                <div
                  className="-mr-1 flex flex-shrink-0 items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onReview(q.id)}
                    className="ins-icon-btn"
                    aria-label="Review question"
                    title="Review"
                  >
                    <Icon name="EyeIcon" size={18} variant="outline" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onPractice(q.id)}
                    className="ins-icon-btn"
                    aria-label="Practice again"
                    title="Practice again"
                  >
                    <Icon name="ArrowPathIcon" size={18} variant="outline" />
                  </button>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
