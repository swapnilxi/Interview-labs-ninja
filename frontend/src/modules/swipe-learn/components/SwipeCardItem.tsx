'use client';

import React, { useState } from 'react';
import { ContentCard, QuizDisplayMode, TopicMeta } from '../types';
import Icon from '@/components/ui/AppIcon';
import { topicHue } from '../utils/topicHue';

interface SwipeCardItemProps {
  card: ContentCard;
  /** The card's topic (label + emoji for the banner); falls back to a title-cased id. */
  topic?: TopicMeta;
  /** deck: fills the swipe stack and scrolls inside; feed / saved: natural height in a list. */
  variant?: 'deck' | 'feed' | 'saved';
  quizMode?: QuizDisplayMode;
  isSaved?: boolean;
  /** feed: toggles saved. */
  onSave?: () => void;
  /** feed: hides the card for this visit; saved: removes it from saved. */
  onDismiss?: () => void;
  /** "Quiz me on this": generates questions about this card. */
  onQuizMe?: (card: ContentCard) => void;
  /** A quiz for this card is being written. */
  quizMeBusy?: boolean;
  /** Another generation is running (the button waits for it). */
  generateBusy?: boolean;
}

const TYPE_META: Record<string, { label: string; icon: string }> = {
  code: { label: 'Code', icon: 'CodeBracketIcon' },
  quiz: { label: 'Quiz', icon: 'QuestionMarkCircleIcon' },
  concept: { label: 'Concept', icon: 'LightBulbIcon' },
  tip: { label: 'Tip', icon: 'BoltIcon' },
  fact: { label: 'Fact', icon: 'NewspaperIcon' },
  'case-study': { label: 'Interview', icon: 'ChatBubbleLeftRightIcon' },
};

const DEPTH_ROWS: Array<{
  key: keyof NonNullable<ContentCard['depth']>;
  label: string;
  icon: string;
  tone?: string;
}> = [
  { key: 'howItWorks', label: 'How it works', icon: 'Cog6ToothIcon' },
  { key: 'architecture', label: 'Flow', icon: 'ArrowsRightLeftIcon' },
  { key: 'example', label: 'Real-world example', icon: 'GlobeAltIcon' },
  {
    key: 'commonMistakes',
    label: 'Common mistake',
    icon: 'ExclamationTriangleIcon',
    tone: 'text-rose-600 dark:text-rose-400',
  },
  {
    key: 'interviewQuestion',
    label: 'Interview follow-up',
    icon: 'ChatBubbleLeftRightIcon',
    tone: 'text-amber-600 dark:text-amber-400',
  },
];

function titleCase(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function SwipeCardItem({
  card,
  topic,
  variant = 'deck',
  quizMode = 'quiz',
  isSaved = false,
  onSave,
  onDismiss,
  onQuizMe,
  quizMeBusy = false,
  generateBusy = false,
}: SwipeCardItemProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showDepth, setShowDepth] = useState(false);

  const isDeck = variant === 'deck';
  const hue = topicHue(card.topic);
  const typeMeta = TYPE_META[card.type] ?? { label: 'Insight', icon: 'LightBulbIcon' };
  const topicLabel = topic?.label ?? titleCase(card.topic);
  const subCategoryLabel = card.subCategory
    ? (topic?.subTabs?.find((s) => s.id === card.subCategory)?.label ?? titleCase(card.subCategory))
    : null;
  const depthRows = DEPTH_ROWS.filter((row) => card.depth?.[row.key]);
  const answered = selectedOption !== null;
  const quiz = card.quiz;

  return (
    <article
      className={`swipe-card flex w-full flex-col overflow-hidden ${isDeck ? 'h-full' : ''}`}
      style={{ '--tone': hue } as React.CSSProperties}
    >
      {/* Banner: topic on the left, kind + level on the right */}
      <header className="swipe-banner flex shrink-0 items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
        <div className="swipe-banner-label flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span aria-hidden="true">{topic?.emoji ?? '💡'}</span>
          <span className="truncate">{topicLabel}</span>
          {subCategoryLabel && (
            <span className="swipe-banner-chip hidden truncate text-xs sm:inline">
              {subCategoryLabel}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs font-semibold">
          {card.source === 'generated' && (
            <span
              className="swipe-banner-chip inline-flex items-center gap-1"
              title="Generated with AI"
            >
              <Icon name="SparklesIcon" size={12} variant="solid" />
              AI
            </span>
          )}
          <span className="swipe-banner-chip inline-flex items-center gap-1">
            <Icon name={typeMeta.icon} size={12} />
            {typeMeta.label}
          </span>
          {card.difficulty && (
            <span className="swipe-banner-chip hidden capitalize min-[420px]:inline">
              {card.difficulty}
            </span>
          )}
        </div>
      </header>

      {/* Body (the deck card scrolls here; a vertical drag scrolls, a horizontal one swipes) */}
      <div
        className={`flex flex-1 flex-col px-4 pb-4 pt-4 sm:px-[1.5rem] sm:pb-5 sm:pt-5 ${
          isDeck
            ? 'swipe-card-scroll min-h-0 overflow-y-auto overscroll-contain scrollbar-clean'
            : ''
        }`}
      >
        {card.hook && (
          <p className="swipe-hook mb-1.5 text-[13px] font-semibold leading-snug">{card.hook}</p>
        )}

        <h2 className="font-heading text-[1.3rem] font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
          {card.title}
        </h2>

        <p className="mt-2.5 whitespace-pre-line text-[15px] leading-relaxed mix-text-foreground/85 sm:text-base">
          {card.content}
        </p>

        {/* Code: wrapped, not side-scrolling, so a horizontal drag on it still swipes the card */}
        {card.code?.code && (
          <figure className="mt-4">
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a]">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 text-xs text-slate-400">
                <span className="font-mono">{card.code.language}</span>
                <Icon name="CodeBracketIcon" size={14} />
              </div>
              <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[12.5px] leading-relaxed text-slate-100 sm:text-[13px]">
                {card.code.code}
              </pre>
            </div>
            {card.code.explanation && (
              <figcaption className="mt-2 text-[13px] leading-snug text-muted-foreground">
                {card.code.explanation}
              </figcaption>
            )}
          </figure>
        )}

        {/* Quiz: multiple choice, or a flip card in flashcard mode */}
        {quiz && quizMode === 'flashcard' && (
          <div className="mt-4 rounded-xl border border-dashed border-border mix-bg-muted/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Flashcard
            </p>
            <p className="mt-1 text-[15px] font-semibold text-foreground">{quiz.question}</p>
            {revealed ? (
              <div className="mt-3 space-y-1.5 animate-fadeIn">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  <span className="font-semibold">Answer:</span> {quiz.options[quiz.correctAnswer]}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {quiz.explanation}
                </p>
                <button
                  type="button"
                  onClick={() => setRevealed(false)}
                  className="swipe-link mt-1"
                >
                  Flip back
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="swipe-soft-btn mt-3"
              >
                <Icon name="ArrowPathRoundedSquareIcon" size={16} />
                Reveal answer
              </button>
            )}
          </div>
        )}

        {quiz && quizMode !== 'flashcard' && (
          <div className="mt-4">
            {quiz.question && quiz.question !== card.content && (
              <p className="mb-2.5 text-[15px] font-semibold leading-snug text-foreground">
                {quiz.question}
              </p>
            )}
            <div className="space-y-2" role="group" aria-label="Answer options">
              {quiz.options.map((opt, idx) => {
                const isCorrect = idx === quiz.correctAnswer;
                const isPicked = selectedOption === idx;
                const state = !answered
                  ? 'idle'
                  : isCorrect
                    ? 'correct'
                    : isPicked
                      ? 'wrong'
                      : 'dim';
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={answered}
                    onClick={() => {
                      setSelectedOption(idx);
                      setRevealed(true);
                    }}
                    data-state={state}
                    className="swipe-option"
                  >
                    <span className="swipe-option-letter" aria-hidden="true">
                      {state === 'correct' ? (
                        <Icon name="CheckIcon" size={14} />
                      ) : state === 'wrong' ? (
                        <Icon name="XMarkIcon" size={14} />
                      ) : (
                        String.fromCharCode(65 + idx)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>

            {answered || revealed ? (
              <div
                className={`mt-3 rounded-xl border p-3.5 text-[13px] leading-relaxed animate-fadeIn sm:text-sm ${
                  !answered || selectedOption === quiz.correctAnswer
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                }`}
                role="status"
              >
                <p className="font-semibold">
                  {!answered
                    ? `Answer: ${String.fromCharCode(65 + quiz.correctAnswer)}`
                    : selectedOption === quiz.correctAnswer
                      ? 'Correct!'
                      : `Not quite. The answer is ${String.fromCharCode(65 + quiz.correctAnswer)}.`}
                </p>
                <p className="mt-0.5">{quiz.explanation}</p>
              </div>
            ) : (
              <button type="button" onClick={() => setRevealed(true)} className="swipe-link mt-2.5">
                <Icon name="EyeIcon" size={15} />
                Show answer
              </button>
            )}
          </div>
        )}

        {/* Explain deeper */}
        {depthRows.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowDepth((v) => !v)}
              aria-expanded={showDepth}
              className="swipe-soft-btn"
            >
              <Icon
                name="ChevronDownIcon"
                size={15}
                className={`transition-transform duration-200 ${showDepth ? 'rotate-180' : ''}`}
              />
              {showDepth ? 'Show less' : 'Explain deeper'}
            </button>

            {showDepth && card.depth && (
              <dl className="mt-3 space-y-3 animate-fadeIn">
                {depthRows.map((row) => (
                  <div key={row.key}>
                    <dt
                      className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${
                        row.tone ?? 'text-foreground'
                      }`}
                    >
                      <Icon name={row.icon} size={14} />
                      {row.label}
                    </dt>
                    <dd
                      className={`mt-1 text-[13px] leading-relaxed sm:text-sm ${
                        row.key === 'architecture'
                          ? 'whitespace-pre-wrap rounded-lg border border-border mix-bg-muted/40 px-3 py-2 font-mono text-xs text-foreground'
                          : row.key === 'interviewQuestion'
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {card.depth?.[row.key]}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}

        {/* Learn → test: questions about this exact card */}
        {card.type !== 'quiz' && onQuizMe && (
          <button
            type="button"
            onClick={() => onQuizMe(card)}
            disabled={quizMeBusy || generateBusy}
            className="swipe-quizme mt-3"
          >
            {quizMeBusy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="AcademicCapIcon" size={16} />
            )}
            <span>{quizMeBusy ? 'Writing your quiz…' : 'Quiz me on this'}</span>
          </button>
        )}

        {/* Tags + read time */}
        {(!!card.tags?.length || !!card.estimatedReadTime) && (
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {card.tags?.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-md mix-bg-muted/70 px-2 py-0.5">
                  #{tag}
                </span>
              ))}
            </div>
            {card.estimatedReadTime ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                <Icon name="ClockIcon" size={13} />
                {card.estimatedReadTime}s
              </span>
            ) : null}
          </div>
        )}

        {/* List actions (the deck has its own buttons under the stack) */}
        {variant === 'feed' && (
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
            <button type="button" onClick={onDismiss} className="swipe-ghost-btn">
              <Icon name="EyeSlashIcon" size={16} />
              Hide
            </button>
            <button
              type="button"
              onClick={onSave}
              aria-pressed={isSaved}
              className={`swipe-ghost-btn ${isSaved ? 'swipe-ghost-btn-on' : ''}`}
            >
              <Icon name="BookmarkIcon" size={16} variant={isSaved ? 'solid' : 'outline'} />
              {isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        )}
        {variant === 'saved' && (
          <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
            <button type="button" onClick={onDismiss} className="swipe-ghost-btn">
              <Icon name="BookmarkSlashIcon" size={16} />
              Remove from saved
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
