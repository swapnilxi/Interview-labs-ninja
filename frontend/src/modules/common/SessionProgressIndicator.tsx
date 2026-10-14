'use client';

import { useEffect, useState } from 'react';

interface SessionProgressIndicatorProps {
  currentQuestion: number;
  totalQuestions: number;
  completedQuestions: number[];
  onQuestionSelect?: (questionNumber: number) => void;
}

export default function SessionProgressIndicator({
  currentQuestion,
  totalQuestions,
  completedQuestions,
  onQuestionSelect,
}: SessionProgressIndicatorProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress((completedQuestions.length / totalQuestions) * 100);
  }, [completedQuestions.length, totalQuestions]);

  const isQuestionCompleted = (questionNumber: number) => {
    return completedQuestions.includes(questionNumber);
  };

  const isCurrentQuestion = (questionNumber: number) => {
    return currentQuestion === questionNumber;
  };

  return (
    <div className="bg-card rounded-lg p-24 shadow-md border border-border">
      <div className="flex items-center justify-between mb-18">
        <h3 className="font-heading text-lg font-medium text-foreground">
          Session Progress
        </h3>
        <span className="tabular-nums text-sm text-muted-foreground">
          {completedQuestions.length}/{totalQuestions} Complete
        </span>
      </div>

      <div className="mb-24">
        <div className="h-6 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-smooth shadow-glow"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-6 text-right">
          <span className="tabular-nums text-xs text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-10 gap-12">
        {Array.from({ length: totalQuestions }, (_, index) => {
          const questionNumber = index + 1;
          const completed = isQuestionCompleted(questionNumber);
          const current = isCurrentQuestion(questionNumber);

          return (
            <button
              key={questionNumber}
              onClick={() => onQuestionSelect?.(questionNumber)}
              disabled={!completed && !current}
              className={`
                aspect-square rounded-md flex items-center justify-center
                tabular-nums text-sm font-medium transition-smooth
                ${
                  completed
                    ? 'bg-success text-success-foreground shadow-sm hover:scale-105'
                    : current
                    ? 'bg-primary text-primary-foreground shadow-glow scale-105'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }
                ${
                  (completed || current) && onQuestionSelect
                    ? 'cursor-pointer hover:shadow-md'
                    : ''
                }
                focus-ring
              `}
              aria-label={`Question ${questionNumber}${
                completed ? ' - Completed' : current ? ' - Current' : ''
              }`}
            >
              {questionNumber}
            </button>
          );
        })}
      </div>

      <div className="md:hidden flex flex-wrap gap-6">
        {Array.from({ length: totalQuestions }, (_, index) => {
          const questionNumber = index + 1;
          const completed = isQuestionCompleted(questionNumber);
          const current = isCurrentQuestion(questionNumber);

          return (
            <button
              key={questionNumber}
              onClick={() => onQuestionSelect?.(questionNumber)}
              disabled={!completed && !current}
              className={`
                w-8 h-8 rounded-full flex items-center justify-center
                transition-smooth
                ${
                  completed
                    ? 'bg-success'
                    : current
                    ? 'bg-primary ring-2 ring-primary ring-offset-2 ring-offset-background' :'bg-muted'
                }
                ${
                  (completed || current) && onQuestionSelect
                    ? 'cursor-pointer' :'cursor-not-allowed'
                }
              `}
              aria-label={`Question ${questionNumber}${
                completed ? ' - Completed' : current ? ' - Current' : ''
              }`}
            >
              <span className="sr-only">{questionNumber}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-18 pt-18 border-t border-border flex items-center justify-between text-sm">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 rounded-full bg-success" />
            <span className="text-muted-foreground font-caption">Completed</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 rounded-full bg-primary" />
            <span className="text-muted-foreground font-caption">Current</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 rounded-full bg-muted" />
            <span className="text-muted-foreground font-caption">Pending</span>
          </div>
        </div>
      </div>
    </div>
  );
}