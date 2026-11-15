'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { DifficultyChip } from '@/modules/daily-session/components/ds';

interface Question {
  id: string;
  questionText: string;
  category: 'Interview' | 'CV Skill';
  subType: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  dateEncountered: string;
  lastReviewed: string | null;
  userPerformance?: number;
}

interface QuestionTableRowProps {
  question: Question;
  onReview: (questionId: string) => void;
  onPractice: (questionId: string) => void;
  isSelected: boolean;
  onSelect: (questionId: string) => void;
}

/** A YYYY-MM-DD date at local midnight (`new Date('2026-11-14')` is UTC midnight, the day before west of Greenwich). */
function parseDay(s: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
}

/** "Nov 14" this year, "Nov 14, 2025" otherwise (in the reader's own order). */
export function formatDay(s: string): string {
  const d = parseDay(s);
  if (Number.isNaN(d.getTime())) return s;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(
    undefined,
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  );
}

export const categoryLabel = (c: string) => (c === 'CV Skill' ? 'CV skill' : c);

/** Five small stars for a 1-5 self-rating (the label carries the number). */
export function RatingStars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="ins-stars" role="img" aria-label={`Rated ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Icon
          key={s}
          name="StarIcon"
          size={size}
          variant="solid"
          data-off={s > value || undefined}
        />
      ))}
    </span>
  );
}

/** When: the date added, the last review and the rating (each after the first with its own "·"). */
function WhenItems({ question, className = '' }: { question: Question; className?: string }) {
  return (
    <>
      <time className={`ds-num ${className}`} data-sep="" dateTime={question.dateEncountered}>
        {formatDay(question.dateEncountered)}
      </time>
      {question.lastReviewed && (
        <span data-sep="" className={`ds-num ${className}`}>
          Reviewed {formatDay(question.lastReviewed)}
        </span>
      )}
      {question.userPerformance !== undefined && (
        <span className={className}>
          <RatingStars value={question.userPerformance} />
        </span>
      )}
    </>
  );
}

/**
 * The meta line under a question: difficulty, category · sub-type · date (· reviewed, rating). On a phone the line
 * stays one line (the sub-type shortens) and the date part moves to the row's foot, beside the actions.
 */
export function QuestionMeta({
  question,
  className = '',
}: {
  question: Question;
  className?: string;
}) {
  return (
    <div className={`ins-meta ${className}`}>
      {/* Each item marked data-sep draws its own "·" (insights.css), hidden when it starts a new line. */}
      <div className="ins-meta-in">
        <DifficultyChip difficulty={question.difficulty} />
        <span>{categoryLabel(question.category)}</span>
        {question.subType && (
          <span data-sep="" className="ins-sub">
            <span>{question.subType}</span>
          </span>
        )}
        <WhenItems question={question} className="ins-when" />
      </div>
    </div>
  );
}

/**
 * One question in the list (every width): select, the question in up to two lines, the meta line, and the row's
 * actions (review, practice again, show the whole question). Tapping the row opens the review.
 */
export default function QuestionTableRow({
  question,
  onReview,
  onPractice,
  isSelected,
  onSelect,
}: QuestionTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <li>
      <div
        className="ds-list-row ins-qrow"
        data-selected={isSelected || undefined}
        onClick={() => onReview(question.id)}
      >
        <label className="ins-check-hit" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="ins-check"
            checked={isSelected}
            onChange={() => onSelect(question.id)}
            aria-label={`Select: ${question.questionText}`}
          />
        </label>

        <button
          type="button"
          className="ins-qtext"
          data-expanded={isExpanded || undefined}
          onClick={(e) => {
            e.stopPropagation();
            onReview(question.id);
          }}
        >
          {question.questionText}
        </button>

        <QuestionMeta question={question} />

        <div className="ins-foot" aria-hidden="true">
          <div className="ins-meta-in">
            <WhenItems question={question} />
          </div>
        </div>

        <div className="ins-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onReview(question.id)}
            className="ins-icon-btn"
            aria-label="Review question"
            title="Review"
          >
            <Icon name="EyeIcon" size={18} variant="outline" />
          </button>
          <button
            type="button"
            onClick={() => onPractice(question.id)}
            className="ins-icon-btn"
            aria-label="Practice again"
            title="Practice again"
          >
            <Icon name="ArrowPathIcon" size={18} variant="outline" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="ins-icon-btn"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Show less' : 'Show the whole question'}
            title={isExpanded ? 'Show less' : 'Show all'}
          >
            <Icon name="ChevronDownIcon" size={18} variant="outline" />
          </button>
        </div>
      </div>
    </li>
  );
}
