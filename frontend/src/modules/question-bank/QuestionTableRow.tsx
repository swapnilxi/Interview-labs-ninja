'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

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

export default function QuestionTableRow({
  question,
  onReview,
  onPractice,
  isSelected,
  onSelect,
}: QuestionTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'text-success bg-success/10';
      case 'Medium':
        return 'text-warning bg-warning/10';
      case 'Hard':
        return 'text-error bg-error/10';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const getCategoryColor = (category: string) => {
    return category === 'Interview' ?'text-primary bg-primary/10' :'text-secondary bg-secondary/10';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
      <tr 
        onClick={() => onReview(question.id)}
        className="border-b border-border hover:bg-muted/50 transition-smooth cursor-pointer group"
      >
        <td className="px-18 py-12" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onSelect(question.id)}
            className="w-18 h-18 rounded border-2 border-border bg-input checked:bg-primary checked:border-primary transition-smooth cursor-pointer focus-ring"
            aria-label={`Select question ${question.id}`}
          />
        </td>
        <td className="px-18 py-12">
          <div className="flex items-start gap-12">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-6 rounded-md hover:bg-muted transition-smooth focus-ring mt-6"
              aria-label={isExpanded ? 'Collapse question' : 'Expand question'}
            >
              <Icon
                name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                size={16}
                variant="outline"
              />
            </button>
            <div className="flex-1 min-w-0">
              <button 
                onClick={() => onReview(question.id)}
                className="text-sm text-left text-foreground font-medium whitespace-normal break-words hover:text-primary hover:underline transition-smooth focus-ring outline-none"
              >
                {question.questionText}
              </button>
              {question.userPerformance !== undefined && (
                <div className="flex items-center gap-6 mt-6">
                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Icon
                        key={star}
                        name="StarIcon"
                        size={12}
                        variant={
                          star <= question.userPerformance! ? 'solid' : 'outline'
                        }
                        className={
                          star <= question.userPerformance!
                            ? 'text-warning' :'text-muted-foreground'
                        }
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground font-caption">
                    Performance
                  </span>
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-18 py-12">
          <span
            className={`inline-flex items-center px-12 py-6 rounded-md text-xs font-medium ${getCategoryColor(
              question.category
            )}`}
          >
            {question.category}
          </span>
        </td>
        <td className="px-18 py-12">
          <span className="text-sm text-muted-foreground font-caption">
            {question.subType}
          </span>
        </td>
        <td className="px-18 py-12">
          <span
            className={`inline-flex items-center px-12 py-6 rounded-md text-xs font-medium ${getDifficultyColor(
              question.difficulty
            )}`}
          >
            {question.difficulty}
          </span>
        </td>
        <td className="px-18 py-12">
          <span className="text-sm text-foreground tabular-nums">
            {formatDate(question.dateEncountered)}
          </span>
        </td>
        <td className="px-18 py-12">
          <span className="text-sm text-muted-foreground tabular-nums">
            {question.lastReviewed ? formatDate(question.lastReviewed) : 'Never'}
          </span>
        </td>
        <td className="px-18 py-12" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-6">
            <button
              onClick={() => onReview(question.id)}
              className="p-6 rounded-md hover:bg-primary/10 text-primary transition-smooth focus-ring"
              aria-label="Review question"
              title="Review Question"
            >
              <Icon name="EyeIcon" size={18} variant="outline" />
            </button>
            <button
              onClick={() => onPractice(question.id)}
              className="p-6 rounded-md hover:bg-secondary/10 text-secondary transition-smooth focus-ring"
              aria-label="Practice again"
              title="Practice Again"
            >
              <Icon name="ArrowPathIcon" size={18} variant="outline" />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={8} className="px-18 py-18">
            <div className="pl-48">
              <p className="text-sm text-foreground leading-relaxed">
                {question.questionText}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}