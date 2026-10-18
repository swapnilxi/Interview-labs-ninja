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

interface QuestionTableMobileProps {
  questions: Question[];
  onReview: (questionId: string) => void;
  onPractice: (questionId: string) => void;
  selectedQuestions: string[];
  onSelect: (questionId: string) => void;
}

export default function QuestionTableMobile({
  questions,
  onReview,
  onPractice,
  selectedQuestions,
  onSelect,
}: QuestionTableMobileProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const toggleExpand = (questionId: string) => {
    setExpandedId(expandedId === questionId ? null : questionId);
  };

  return (
    <div className="space-y-12">
      {questions.map((question) => {
        const isExpanded = expandedId === question.id;
        const isSelected = selectedQuestions.includes(question.id);

        return (
          <div
            key={question.id}
            onClick={() => onReview(question.id)}
            className="bg-card rounded-lg border border-border overflow-hidden cursor-pointer hover:border-primary/50 transition-all group"
          >
            <div className="p-18">
              <div className="flex items-start gap-12 mb-12">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onSelect(question.id)}
                  className="w-18 h-18 rounded border-2 border-border bg-input checked:bg-primary checked:border-primary transition-smooth cursor-pointer focus-ring mt-3"
                  aria-label={`Select question ${question.id}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium line-clamp-2 mb-12 group-hover:text-primary transition-colors">
                    {question.questionText}
                  </p>
                  <div className="flex flex-wrap items-center gap-6">
                    <span
                      className={`inline-flex items-center px-12 py-6 rounded-md text-xs font-medium ${getCategoryColor(
                        question.category
                      )}`}
                    >
                      {question.category}
                    </span>
                    <span
                      className={`inline-flex items-center px-12 py-6 rounded-md text-xs font-medium ${getDifficultyColor(
                        question.difficulty
                      )}`}
                    >
                      {question.difficulty}
                    </span>
                    <span className="text-xs text-muted-foreground font-caption">
                      {question.subType}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-12 border-t border-border">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-6">
                    <Icon
                      name="CalendarIcon"
                      size={14}
                      variant="outline"
                      className="text-muted-foreground"
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(question.dateEncountered)}
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    <Icon
                      name="ClockIcon"
                      size={14}
                      variant="outline"
                      className="text-muted-foreground"
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Last: {question.lastReviewed ? formatDate(question.lastReviewed) : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview(question.id);
                    }}
                    className="p-9 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-smooth focus-ring"
                    aria-label="Review question"
                  >
                    <Icon name="EyeIcon" size={18} variant="outline" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPractice(question.id);
                    }}
                    className="p-9 rounded-md bg-secondary/10 text-secondary hover:bg-secondary/20 transition-smooth focus-ring"
                    aria-label="Practice again"
                  >
                    <Icon name="ArrowPathIcon" size={18} variant="outline" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // expanding must not also open the card
                      toggleExpand(question.id);
                    }}
                    className="p-9 rounded-md hover:bg-muted transition-smooth focus-ring"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    <Icon
                      name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                      size={18}
                      variant="outline"
                    />
                  </button>
                </div>
              </div>

              {question.userPerformance !== undefined && (
                <div className="flex items-center gap-6 mt-12 pt-12 border-t border-border">
                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Icon
                        key={star}
                        name="StarIcon"
                        size={14}
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

            {isExpanded && (
              <div className="px-18 pb-18 pt-0">
                <div className="p-18 bg-muted/30 rounded-md">
                  <p className="text-sm text-foreground leading-relaxed">
                    {question.questionText}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}