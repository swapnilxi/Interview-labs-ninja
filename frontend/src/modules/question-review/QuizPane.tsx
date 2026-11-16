'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import QuizCarousel from '@/modules/labs/common/QuizCarousel';
import { confirmDialog } from '@/lib/ui/confirm';
import { ErrorBanner, requireLogin } from './ui';
import { toast } from '@/lib/ui/toast';
import {
  MAX_QUIZ_ITEMS,
  questionReviewService,
  type QuestionQuizItem,
} from './questionReviewService';

const FIRST_BATCH = 5;

/**
 * A multiple-choice quiz on the ideas behind the question, stored per user. It is generated on request (aimed partly
 * at the gaps in the answer written so far), grows a batch at a time up to 40 questions, and can be cleared.
 */
export default function QuizPane({ questionId, answer }: { questionId: number; answer: string }) {
  const [items, setItems] = useState<QuestionQuizItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [resetting, setResetting] = useState(false);
  // The server's "already has 40" answer (another tab may have filled it): shown with the Reset action.
  const [capMessage, setCapMessage] = useState('');
  // Bumped on reset, so the carousel starts again from question 1 with no answers.
  const [round, setRound] = useState(0);
  // Stems answered wrong in this run of the carousel: the next batch revisits those ideas.
  const missed = useRef<string[]>([]);
  const onAnswer = useCallback((q: { q: string }, correct: boolean) => {
    if (!correct && !missed.current.includes(q.q))
      missed.current = [...missed.current, q.q].slice(-8);
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError('');
    try {
      setItems(await questionReviewService.getQuiz(questionId));
      setStatus('ready');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the quiz.');
      setStatus('error');
    }
  }, [questionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateFirst = async () => {
    if (!requireLogin('the AI quiz')) return;
    setGenerating(true);
    setGenError('');
    try {
      setItems(await questionReviewService.generateQuiz(questionId, FIRST_BATCH, answer));
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Could not write the quiz. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  // The carousel shows its own spinner and error; it jumps to the first new question once the list grows.
  const generateMore = async (count: number) => {
    if (!requireLogin('the AI quiz')) throw new Error('Log in to generate more questions.');
    try {
      setItems(await questionReviewService.generateQuiz(questionId, count, answer, missed.current));
      missed.current = [];
    } catch (e) {
      if (e instanceof Error && /the most it keeps/i.test(e.message)) {
        setCapMessage(e.message);
        return;
      }
      throw e;
    }
  };

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Clear this quiz?',
      message: `All ${items.length} questions and your progress through them are removed. You can generate a new quiz afterwards.`,
      confirmLabel: 'Clear quiz',
      tone: 'danger',
    });
    if (!ok) return;
    setResetting(true);
    try {
      await questionReviewService.resetQuiz(questionId);
      setItems([]);
      missed.current = [];
      setRound((r) => r + 1);
      setGenError('');
      setCapMessage('');
    } catch (e) {
      toast.error(
        e instanceof Error ? `Could not clear the quiz: ${e.message}` : 'Could not clear the quiz.'
      );
    } finally {
      setResetting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading the quiz">
        <div className="qr-skel h-4 w-1/3" />
        <div className="qr-skel h-[7rem] w-full" />
        <div className="qr-skel h-10 w-full" />
      </div>
    );
  }
  if (status === 'error')
    return (
      <ErrorBanner message={`Could not load the quiz. ${loadError}`} onRetry={() => void load()} />
    );

  if (items.length === 0) {
    return (
      <div className="px-1 py-3 text-center">
        <span className="ds-icon-tile ds-icon-tile-lg ds-tone-indigo">
          <FlatIcon name="question" size={22} />
        </span>
        <h3 className="ds-h3 mt-3">Test yourself on the ideas behind it</h3>
        <p className="mx-auto mt-1 max-w-[30rem] text-sm leading-relaxed ds-muted">
          {FIRST_BATCH} multiple-choice questions on the concepts this question rests on, each with
          an explanation.
          {answer.trim() ? ' Some aim at the gaps in the answer you have written.' : ''}
        </p>
        <button
          type="button"
          onClick={generateFirst}
          disabled={generating}
          className="ds-btn ds-btn-primary mt-5 w-full sm:w-auto sm:min-w-[12rem]"
        >
          {generating ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : (
            <Icon name="SparklesIcon" size={16} />
          )}
          {generating ? 'Writing your quiz…' : 'Generate quiz'}
        </button>
        {genError && (
          <div className="mt-4 text-left">
            <ErrorBanner message={genError} />
          </div>
        )}
      </div>
    );
  }

  const full = items.length >= MAX_QUIZ_ITEMS || !!capMessage;
  return (
    <div className="space-y-4">
      {full && (
        <div className="ds-banner ds-banner-center ds-tone-indigo" role="status">
          <Icon name="InformationCircleIcon" size={18} />
          <span className="min-w-0 flex-1">
            {capMessage ||
              `This quiz has ${MAX_QUIZ_ITEMS} questions, the most it keeps. Reset it to generate new ones.`}
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={resetting}
            className="ds-btn ds-btn-secondary ds-btn-sm flex-shrink-0"
          >
            Reset quiz
          </button>
        </div>
      )}
      <QuizCarousel
        key={round}
        questions={items}
        generateMore={generateMore}
        hasMore={!full}
        onAnswer={onAnswer}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t ds-hairline pt-3">
        <p className="text-xs ds-faint">
          {items.length} of {MAX_QUIZ_ITEMS} questions · saved to your account
        </p>
        <button
          type="button"
          onClick={reset}
          disabled={resetting}
          className="ds-btn ds-btn-ghost ds-btn-sm ds-btn-danger"
        >
          <Icon name="TrashIcon" size={14} />
          {resetting ? 'Clearing…' : 'Reset quiz'}
        </button>
      </div>
    </div>
  );
}
