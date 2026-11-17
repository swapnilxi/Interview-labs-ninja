'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Icon from '@/components/ui/AppIcon';
import Markdown from '@/modules/labs/common/Markdown';
import { highlightFence } from './highlight';
import { InlineError } from './ui';
import type { TutorAction } from './useGuided';
import type { Question, QuestionProgress, Verdict } from './types';

const VERDICT_TEXT: Record<Verdict, { text: string; tone: string }> = {
  understood: { text: 'Judged as understood', tone: 'text-success' },
  partial: { text: 'Partly there', tone: 'text-warning' },
  not_yet: { text: 'Not there yet', tone: 'text-muted-foreground' },
};

/**
 * The AI Tutor, inline in the question's workspace: the question stays on the page above it, the conversation is a compact
 * area, and the controls are the seven ways a learner asks for help. The thread is saved with the question, so it is still
 * here after a refresh and when the learner comes back from the STAR answer.
 */
export default function TutorPanel({
  question,
  progress,
  busy,
  error,
  canExplainMistake,
  completeBlocked,
  onSend,
  onRetry,
  onClearError,
  onComplete,
}: {
  question: Question;
  progress: QuestionProgress;
  busy: boolean;
  error: string | undefined;
  canExplainMistake: boolean;
  /** Why the question cannot be completed yet ('' = it can). */
  completeBlocked: string;
  onSend: (action: TutorAction, message?: string) => void;
  onRetry: () => void;
  onClearError: () => void;
  onComplete: () => void;
}) {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const messages = progress.tutor.messages;
  const hintsGiven = progress.tutor.hintLevel;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, busy]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onSend('ask', text);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const quick: {
    action: Exclude<TutorAction, 'start' | 'ask' | 'star'>;
    label: string;
    icon: string;
    disabled?: boolean;
    title?: string;
  }[] = [
    {
      action: 'hint',
      label:
        hintsGiven > 0 ? `Give me a hint (${Math.min(hintsGiven + 1, 3)}/3)` : 'Give me a hint',
      icon: 'LightBulbIcon',
      disabled: hintsGiven >= 3,
      title: hintsGiven >= 3 ? 'The tutor gave all three hint levels' : undefined,
    },
    { action: 'example', label: 'Explain with an example', icon: 'BookOpenIcon' },
    { action: 'simplify', label: 'Simplify this concept', icon: 'ArrowsPointingInIcon' },
    { action: 'exercise', label: 'Give me a coding exercise', icon: 'CodeBracketIcon' },
    { action: 'test', label: 'Test my understanding', icon: 'ClipboardDocumentCheckIcon' },
    {
      action: 'mistake',
      label: 'Explain my mistake',
      icon: 'WrenchScrewdriverIcon',
      disabled: !canExplainMistake,
      title: canExplainMistake ? undefined : 'Write some code, or run the tests, first',
    },
  ];

  return (
    <section className="gp-card p-4 sm:p-[1.25rem]" aria-label="AI Tutor">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="SparklesIcon" size={15} aria-hidden="true" />
          AI Tutor
        </h3>
        <p className="text-xs text-muted-foreground">
          One question at a time. Hints before answers. It never hands over the full solution unless
          you ask for it.
        </p>
      </div>

      <div
        ref={list}
        className="gp-chat"
        role="log"
        aria-live="polite"
        aria-label="Conversation with the tutor"
      >
        {messages.map((m) => (
          <div key={m.id} className="gp-msg" data-role={m.role}>
            {m.role === 'tutor' ? (
              <Markdown
                content={m.text}
                highlight={highlightFence}
                className="text-sm !leading-6"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{m.text}</p>
            )}
            {m.verdict && (
              <p className={`mt-1.5 text-xs font-medium ${VERDICT_TEXT[m.verdict].tone}`}>
                {VERDICT_TEXT[m.verdict].text}
              </p>
            )}
          </div>
        ))}
        {busy && (
          <div className="gp-msg" data-role="tutor">
            <span className="gp-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="sr-only">The tutor is writing</span>
          </div>
        )}
        {!messages.length && !busy && !error && (
          <p className="text-sm text-muted-foreground">
            The tutor will start by asking what you already know about this question.
          </p>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <InlineError message={error} onRetry={onRetry} onDismiss={onClearError} />
        </div>
      )}

      {progress.tutor.understood && !progress.completed && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] p-3 mix-bg-success/10">
          <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
            The tutor judged your answer as understood. Mark this question complete to earn its XP.
          </p>
          <button
            type="button"
            onClick={onComplete}
            disabled={!!completeBlocked}
            title={completeBlocked || undefined}
            className="todo-btn todo-btn-primary"
          >
            <Icon name="CheckIcon" size={14} />
            Mark as completed
          </button>
        </div>
      )}

      <div
        className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none sm:flex-wrap sm:overflow-visible"
        role="group"
        aria-label="Ask the tutor"
      >
        <button
          type="button"
          onClick={() => input.current?.focus()}
          className="todo-btn todo-btn-quiet shrink-0"
        >
          <Icon name="ChatBubbleLeftRightIcon" size={14} />
          Ask a question
        </button>
        {quick.map((c) => (
          <button
            key={c.action}
            type="button"
            disabled={busy || c.disabled}
            title={c.title}
            onClick={() => onSend(c.action)}
            className="todo-btn todo-btn-quiet shrink-0"
          >
            <Icon name={c.icon} size={14} />
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <textarea
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={2000}
          placeholder="Ask anything about this question, or answer the tutor"
          aria-label="Message to the tutor"
          className="todo-input todo-input-quiet min-w-0 flex-1 resize-y px-3 py-2 text-[16px] sm:text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !draft.trim()}
          aria-label="Send"
          className="todo-btn todo-btn-primary h-10 w-10 shrink-0 px-0"
        >
          <Icon name="PaperAirplaneIcon" size={16} />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Enter sends · Shift+Enter adds a line</p>
      <span className="sr-only">{question.title}</span>
    </section>
  );
}
