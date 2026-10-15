'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import AiError from '@/modules/common/lab/AiError';

interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explanation: string;
}

interface QuizCarouselProps {
  questions: QuizQuestion[];
  /** Static question banks: swap in the next batch. The carousel supplies the "generating" pause. */
  onGenerateMore?: () => void;
  /**
   * Real generation: append more questions to `questions` and resolve (reject with a readable message
   * to show an error). When this is set the carousel jumps to the first new question once it arrives,
   * keeping earlier answers and the running score, since the list only ever grows.
   */
  generateMore?: () => Promise<void>;
  hasMore?: boolean;
}

export default function QuizCarousel({ questions, onGenerateMore, generateMore, hasMore = true }: QuizCarouselProps) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showExplanation, setShowExplanation] = useState<Record<number, boolean>>({});
  const [generatingMore, setGeneratingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const advanceFrom = useRef<number | null>(null);

  useEffect(() => {
    if (advanceFrom.current !== null && questions.length > advanceFrom.current) {
      setIdx(advanceFrom.current);
      advanceFrom.current = null;
    }
  }, [questions.length]);

  const current = questions[idx];
  const hasAnswered = answers[idx] !== undefined;
  const isCorrect = hasAnswered && answers[idx] === current.answer;
  const score = Object.entries(answers).filter(([i, a]) => questions[Number(i)]?.answer === a).length;

  const handleAnswer = (optIdx: number) => {
    if (hasAnswered) return;
    setAnswers(prev => ({ ...prev, [idx]: optIdx }));
    setShowExplanation(prev => ({ ...prev, [idx]: true }));
  };

  const handleGenerateMore = async () => {
    setMoreError(null);
    setGeneratingMore(true);
    if (!generateMore) {
      setTimeout(() => {
        setGeneratingMore(false);
        onGenerateMore?.();
      }, 1600);
      return;
    }
    advanceFrom.current = questions.length;
    try {
      await generateMore();
    } catch (e) {
      advanceFrom.current = null;
      setMoreError(e instanceof Error ? e.message : 'Could not generate more questions.');
    } finally {
      setGeneratingMore(false);
    }
  };

  return (
    <div className="space-y-18">
      {/* Score + Progress bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-12">
          <span className="text-xs font-caption text-muted-foreground">
            Question {idx + 1} / {questions.length}
          </span>
          <span className={`text-xs font-semibold px-9 py-4 rounded-full ${
            score === 0 ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'
          }`}>
            Score: {score} / {Object.keys(answers).length}
          </span>
        </div>
        <div className="flex gap-6">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-8 h-8 rounded-full transition-smooth ${
                i === idx ? 'bg-primary' : answers[i] !== undefined
                  ? questions[i].answer === answers[i] ? 'bg-success' : 'bg-error'
                  : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question card */}
      <div className="lab-card-muted p-5">
        <p className="text-base font-semibold text-foreground mb-4 leading-relaxed">{current.q}</p>
        <div className="space-y-9">
          {current.options.map((opt, i) => {
            const isSelected = answers[idx] === i;
            const isRight = i === current.answer;
            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={hasAnswered}
                className={`w-full text-left text-sm px-3 py-2.5 rounded-md border transition-smooth flex items-center gap-3 ${
                  hasAnswered
                    ? isRight
                      ? 'bg-success/10 border-success text-success font-medium'
                      : isSelected
                        ? 'bg-error/10 border-error text-error'
                        : 'bg-card border-border text-muted-foreground opacity-60'
                    : 'bg-card border-border text-foreground hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
                }`}
              >
                <span className={`w-20 h-20 rounded-full border flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                  hasAnswered && isRight ? 'border-success bg-success text-white'
                    : hasAnswered && isSelected ? 'border-error bg-error text-white'
                    : 'border-current'
                }`}>
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Explanation */}
      {showExplanation[idx] && (
        <div className={`p-14 rounded-lg border text-xs leading-relaxed animate-fade-in ${
          isCorrect ? 'bg-success/5 border-success/30 text-foreground' : 'bg-warning/5 border-warning/30 text-foreground'
        }`}>
          <div className="flex items-center gap-6 mb-6 font-semibold">
            <Icon name={isCorrect ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={14} className={isCorrect ? 'text-success' : 'text-warning'} />
            {isCorrect ? 'Correct!' : 'Not quite — here\'s why:'}
          </div>
          {current.explanation}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6">
        <button
          disabled={idx === 0}
          onClick={() => setIdx(i => i - 1)}
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-muted transition-smooth disabled:opacity-30 disabled:pointer-events-none"
        >
          <Icon name="ArrowLeftIcon" size={14} /> Previous
        </button>

        {idx < questions.length - 1 ? (
          <button
            onClick={() => setIdx(i => i + 1)}
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm text-foreground hover:bg-muted transition-smooth"
          >
            Next <Icon name="ArrowRightIcon" size={14} />
          </button>
        ) : hasMore ? (
          <button
            onClick={handleGenerateMore}
            disabled={generatingMore}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/90 transition-smooth disabled:opacity-60"
          >
            {generatingMore ? (
              <><span className="w-10 h-10 border-2 border-secondary-foreground/30 border-t-secondary-foreground rounded-full animate-spin" /> Generating...</>
            ) : (
              <><Icon name="SparklesIcon" size={12} /> Generate 4 More</>
            )}
          </button>
        ) : (
          <span className="text-xs text-success flex items-center gap-6">
            <Icon name="TrophyIcon" size={14} /> Quiz Complete! {score}/{questions.length} correct
          </span>
        )}
      </div>
      {moreError && <AiError message={moreError} className="text-right" />}
    </div>
  );
}
