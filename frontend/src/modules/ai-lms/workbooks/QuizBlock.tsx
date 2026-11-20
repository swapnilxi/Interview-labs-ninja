'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  isCorrect,
  questionFinished,
  stableShuffle,
  type ProgressState,
  type QuizAttempt,
} from './progress';
import type { QuizQuestion, WorkbookBlock } from './types';

type Quiz = Extract<WorkbookBlock, { type: 'quiz' }>;
type Update = (change: (prev: ProgressState) => ProgressState) => void;

const KIND_LABEL: Record<QuizQuestion['kind'], string> = {
  mcq: 'Choose one',
  scenario: 'Scenario',
  true_false: 'True or false',
  fill_blank: 'Fill in the blank',
  matching: 'Match the pairs',
};

/** One question: answer, Check, then either "Correct" or "Try again / Show answer". Explanations follow a check. */
function Question({
  question,
  number,
  attempt,
  onAttempt,
}: {
  question: QuizQuestion;
  number: number;
  attempt: QuizAttempt | undefined;
  onAttempt: (next: QuizAttempt) => void;
}) {
  const [draft, setDraft] = useState<unknown>(attempt?.value ?? null);
  const finished = questionFinished(attempt);
  const wrong = !!attempt && !attempt.correct && !attempt.revealed;
  const locked = finished;

  const ready =
    question.kind === 'matching'
      ? Array.isArray(draft) &&
        question.pairs.every((_, i) => typeof (draft as unknown[])[i] === 'string')
      : question.kind === 'fill_blank'
        ? typeof draft === 'string' && draft.trim().length > 0
        : draft !== null && draft !== undefined;

  const check = () =>
    onAttempt({
      value: draft,
      correct: isCorrect(question, draft),
      tries: (attempt?.tries ?? 0) + 1,
      revealed: false,
    });

  const choice = (value: unknown, label: string, key: string | number) => {
    const picked = draft === value;
    const isAnswer = 'answer' in question && question.answer === value;
    let tone = '';
    if (finished && isAnswer) tone = 'wb-choice-right';
    else if (finished && picked && !attempt?.correct) tone = 'wb-choice-wrong';
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={picked}
        disabled={locked}
        className={`wb-choice ${tone}`}
        onClick={() => setDraft(value)}
      >
        <span className="wb-choice-dot" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words">{label}</span>
        {finished && isAnswer && <Icon name="CheckIcon" size={16} />}
      </button>
    );
  };

  const rights =
    question.kind === 'matching'
      ? stableShuffle(
          question.pairs.map((p) => p.right),
          question.id
        )
      : [];

  return (
    <li className="space-y-3">
      <p className="wb-hint">
        {number}. {KIND_LABEL[question.kind]}
      </p>
      {question.kind === 'scenario' && (
        <p className="wb-scenario whitespace-pre-line">{question.scenario}</p>
      )}
      {question.kind !== 'fill_blank' && (
        <p className="font-medium text-foreground">{question.prompt}</p>
      )}

      {(question.kind === 'mcq' || question.kind === 'scenario') && (
        <div role="radiogroup" aria-label={question.prompt} className="space-y-2">
          {question.options.map((option, i) => choice(i, option, i))}
        </div>
      )}
      {question.kind === 'true_false' && (
        <div role="radiogroup" aria-label={question.prompt} className="grid gap-2 sm:grid-cols-2">
          {choice(true, 'True', 't')}
          {choice(false, 'False', 'f')}
        </div>
      )}
      {question.kind === 'fill_blank' && (
        <label className="block space-y-2">
          <span className="block font-medium text-foreground">
            {question.prompt.split('___').map((piece, i, all) => (
              <span key={i}>
                {piece}
                {i < all.length - 1 && <span className="wb-gap">blank</span>}
              </span>
            ))}
          </span>
          <input
            type="text"
            className="wb-field"
            value={typeof draft === 'string' ? draft : ''}
            maxLength={200}
            disabled={locked}
            placeholder="Type the missing word"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && !locked) check();
            }}
          />
        </label>
      )}
      {question.kind === 'matching' && (
        <div className="space-y-2">
          {question.pairs.map((pair, i) => {
            const value = Array.isArray(draft) ? (draft as unknown[])[i] : undefined;
            const right = finished && value === pair.right;
            return (
              <label key={i} className="wb-match">
                <span className="min-w-0 break-words font-medium text-foreground">{pair.left}</span>
                <select
                  className="wb-field"
                  value={typeof value === 'string' ? value : ''}
                  disabled={locked}
                  onChange={(e) => {
                    const next = Array.isArray(draft)
                      ? [...(draft as unknown[])]
                      : new Array(question.pairs.length).fill(null);
                    next[i] = e.target.value || null;
                    setDraft(next);
                  }}
                >
                  <option value="">Choose…</option>
                  {rights.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {finished && (
                  <span className={`wb-hint ${right ? 'wb-ok' : ''}`}>
                    {right ? 'Right' : `Answer: ${pair.right}`}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {!finished && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="wb-btn wb-btn-sm wb-btn-primary"
            disabled={!ready}
            onClick={check}
          >
            Check
          </button>
          {wrong && (
            <button
              type="button"
              className="wb-btn wb-btn-sm"
              onClick={() => attempt && onAttempt({ ...attempt, revealed: true })}
            >
              Show answer
            </button>
          )}
        </div>
      )}

      <div aria-live="polite">
        {wrong && (
          <p className="wb-feedback wb-feedback-wrong">
            <Icon name="ArrowPathIcon" size={16} />
            Not quite. Change your answer and check again, or show the answer.
          </p>
        )}
        {finished && (
          <div className={`wb-feedback ${attempt?.correct ? 'wb-feedback-right' : ''}`}>
            <Icon name={attempt?.correct ? 'CheckCircleIcon' : 'LightBulbIcon'} size={16} />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">
                {attempt?.correct
                  ? attempt.tries === 1
                    ? 'Correct, first try.'
                    : 'Correct.'
                  : question.kind === 'fill_blank'
                    ? `The answer: ${question.answer}`
                    : 'Here is the answer.'}
              </p>
              {question.explanation && <p>{question.explanation}</p>}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/** A chapter's quiz: questions checked one by one, with retries, and a score once all are finished. */
export default function QuizBlock({
  block,
  state,
  update,
}: {
  block: Quiz;
  state: ProgressState;
  update: Update;
}) {
  // Bumped by "Retake the quiz" so every question forgets its local draft.
  const [round, setRound] = useState(0);
  const attempts = block.questions.map((q) => state.quiz[q.id]);
  const finished = attempts.filter(questionFinished).length;
  const firstTry = attempts.filter((a) => a?.correct && a.tries === 1).length;
  const all = finished === block.questions.length;

  return (
    <div className="space-y-5">
      <ol className="space-y-[1.5rem]">
        {block.questions.map((question, i) => (
          <Question
            key={`${question.id}-${round}`}
            question={question}
            number={i + 1}
            attempt={state.quiz[question.id]}
            onAttempt={(next) =>
              update((prev) => ({ ...prev, quiz: { ...prev.quiz, [question.id]: next } }))
            }
          />
        ))}
      </ol>
      {all && (
        <div className="wb-score" role="status">
          <p className="font-semibold text-foreground">
            {firstTry} of {block.questions.length} right first time
          </p>
          <button
            type="button"
            className="wb-btn wb-btn-sm"
            onClick={() => {
              update((prev) => {
                const quiz = { ...prev.quiz };
                for (const q of block.questions) delete quiz[q.id];
                return { ...prev, quiz };
              });
              setRound((r) => r + 1);
            }}
          >
            <Icon name="ArrowPathIcon" size={14} />
            Retake the quiz
          </button>
        </div>
      )}
    </div>
  );
}
