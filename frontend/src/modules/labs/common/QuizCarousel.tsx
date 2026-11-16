'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import AiError from '@/modules/labs/common/AiError';
import Markdown from '@/modules/labs/common/Markdown';
import { expandQuizExplanation, type LabName } from '@/lib/services/labSectionsService';

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
  generateMore?: (count: number) => Promise<void>;
  hasMore?: boolean;
  /** With `lab` and `topicName`, each explanation gets an "Expand with AI" button (repeatable, deeper each time). */
  lab?: LabName;
  topicName?: string;
  /** Told about every answer, e.g. to send the questions got wrong back with the next generate. */
  onAnswer?: (question: QuizQuestion, correct: boolean) => void;
}

export default function QuizCarousel({ questions, onGenerateMore, generateMore, hasMore = true, lab, topicName, onAnswer }: QuizCarouselProps) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showExplanation, setShowExplanation] = useState<Record<number, boolean>>({});
  const [generatingMore, setGeneratingMore] = useState(false);
  const [moreCount, setMoreCount] = useState(4);
  const [moreError, setMoreError] = useState<string | null>(null);
  const advanceFrom = useRef<number | null>(null);
  // AI expansions per question text (not index, so they survive the list growing), oldest first.
  const [expansions, setExpansions] = useState<Record<string, { focus: 'answer' | 'question'; text: string }[]>>({});
  const [expanding, setExpanding] = useState<string | null>(null);
  const [expandError, setExpandError] = useState<string | null>(null);

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
    onAnswer?.(current, optIdx === current.answer);
    setAnswers(prev => ({ ...prev, [idx]: optIdx }));
    setShowExplanation(prev => ({ ...prev, [idx]: true }));
  };

  // One button for the question and its answer: before answering it unpacks the question (no spoilers),
  // afterwards it explains why each option is right or wrong. Every click adds a deeper round.
  const handleExpand = async () => {
    if (!lab || expanding) return;
    const key = current.q;
    const focus = hasAnswered ? 'answer' : 'question';
    setExpandError(null);
    setExpanding(key);
    try {
      const text = await expandQuizExplanation({
        lab,
        topic: topicName ?? '',
        question: current,
        selected: answers[idx] ?? null,
        previous: (expansions[key] ?? []).map(e => e.text),
        focus,
      });
      setExpansions(prev => ({ ...prev, [key]: [...(prev[key] ?? []), { focus, text }] }));
    } catch (e) {
      setExpandError(e instanceof Error ? e.message : 'Could not expand with AI.');
    } finally {
      setExpanding(null);
    }
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
      await generateMore(moreCount);
    } catch (e) {
      advanceFrom.current = null;
      setMoreError(e instanceof Error ? e.message : 'Could not generate more questions.');
    } finally {
      setGeneratingMore(false);
    }
  };

  return (
    <div className="space-y-[1.125rem]">
      {/* Score + Progress dots */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-caption font-medium text-muted-foreground">
            Question {idx + 1} / {questions.length}
          </span>
          <span
            data-semantic="done"
            className={`text-xs font-semibold px-3 py-1 rounded-full ${
              score === 0 ? 'mix-bg-foreground/[0.06] text-muted-foreground' : 'mix-bg-success/15 text-success'
            }`}
          >
            Score: {score} / {Object.keys(answers).length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {questions.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Question ${i + 1}`}
              aria-current={i === idx ? 'step' : undefined}
              className="todo-focus flex h-[1.5rem] w-[1.5rem] items-center justify-center rounded-full"
            >
              <span
                className={`block h-2.5 w-2.5 rounded-full transition-smooth ${
                  i === idx
                    ? 'bg-primary ring-[3px] mix-ring-primary/25'
                    : answers[i] !== undefined
                      ? questions[i].answer === answers[i] ? 'bg-success' : 'bg-error'
                      : 'mix-bg-foreground/20'
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Question card */}
      <div className="lab-card-muted p-5">
        <p className="text-base font-semibold text-foreground mb-4 leading-relaxed">{current.q}</p>
        <div className="space-y-2">
          {current.options.map((opt, i) => {
            const isSelected = answers[idx] === i;
            const isRight = i === current.answer;
            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={hasAnswered}
                className={`todo-focus w-full text-left text-sm px-3 py-2.5 rounded-md border transition-smooth flex items-center gap-3 ${
                  hasAnswered
                    ? isRight
                      ? 'mix-bg-success/10 border-success text-foreground font-semibold'
                      : isSelected
                        ? 'mix-bg-error/[0.06] border-error text-foreground'
                        : 'bg-card border-border text-muted-foreground'
                    : 'bg-card border-border text-foreground hover:mix-border-primary/50 hover:mix-bg-primary/5 cursor-pointer'
                }`}
              >
                <span className={`h-[1.5rem] w-[1.5rem] rounded-full border flex-shrink-0 flex items-center justify-center text-xs font-semibold ${
                  hasAnswered && isRight ? 'border-success bg-success text-success-foreground'
                    : hasAnswered && isSelected ? 'border-error bg-error text-error-foreground'
                    : 'border-current'
                }`}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 flex-1 break-words">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Explanation */}
      {showExplanation[idx] && (
        <div
          data-semantic={isCorrect ? 'done' : 'hint'}
          className={`p-3.5 rounded-lg border text-sm leading-relaxed animate-fade-in text-foreground ${
            isCorrect ? 'mix-bg-success/[0.06] mix-border-success/30' : 'mix-bg-warning/[0.06] mix-border-warning/30'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1.5 font-semibold">
            <Icon name={isCorrect ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={14} className={isCorrect ? 'text-success' : 'text-warning'} />
            {isCorrect ? 'Correct!' : 'Not quite — here\'s why:'}
          </div>
          {current.explanation}
        </div>
      )}

      {lab && (expansions[current.q] ?? []).length > 0 && (
        <div className="space-y-3">
          {(expansions[current.q] ?? []).map((e, n) => (
            <div key={n} className="rounded-md border bg-card p-3">
              <p className="lab-caption mb-1.5">
                {e.focus === 'question' ? 'Understanding the question' : 'Why each option is right or wrong'}
                {n > 0 ? ` · round ${n + 1}` : ''}
              </p>
              <Markdown content={e.text} />
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1.5">
        <button
          disabled={idx === 0}
          onClick={() => setIdx(i => i - 1)}
          className="todo-btn todo-btn-secondary py-2 text-sm"
        >
          <Icon name="ArrowLeftIcon" size={14} /> Previous
        </button>

        {lab && (
          <button
            type="button"
            onClick={handleExpand}
            disabled={expanding !== null}
            className="todo-btn todo-btn-secondary py-2 text-sm"
          >
            {expanding === current.q ? (
              <><span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Expanding...</>
            ) : (
              <><Icon name="SparklesIcon" size={12} /> {(expansions[current.q] ?? []).length ? 'Expand more with AI' : 'Expand with AI'}</>
            )}
          </button>
        )}

        {idx < questions.length - 1 ? (
          <button
            onClick={() => setIdx(i => i + 1)}
            className="todo-btn todo-btn-secondary py-2 text-sm"
          >
            Next <Icon name="ArrowRightIcon" size={14} />
          </button>
        ) : hasMore ? (
          <div className="flex items-center gap-2">
            {generateMore && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="sr-only sm:not-sr-only">Questions</span>
                <select
                  value={moreCount}
                  onChange={e => setMoreCount(Number(e.target.value))}
                  disabled={generatingMore}
                  aria-label="Number of questions to generate"
                  className="todo-focus rounded-md border bg-card px-2 py-1.5 text-sm text-foreground"
                >
                  {[2, 4, 6, 8].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
          <button
            onClick={handleGenerateMore}
            disabled={generatingMore}
            className="todo-btn todo-btn-primary py-2"
          >
            {generatingMore ? (
              <><span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Generating...</>
            ) : (
              <><Icon name="SparklesIcon" size={12} /> Generate {moreCount} More</>
            )}
          </button>
          </div>
        ) : (
          <span data-semantic="done" className="text-xs font-semibold text-success flex items-center gap-1.5">
            <Icon name="TrophyIcon" size={14} /> Quiz Complete! {score}/{questions.length} correct
          </span>
        )}
      </div>
      {expandError && <AiError message={expandError} className="text-right" />}
      {moreError && <AiError message={moreError} className="text-right" />}
    </div>
  );
}
