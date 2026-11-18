'use client';

import Icon from '@/components/ui/AppIcon';
import { toast } from '@/lib/ui/toast';
import Markdown from '@/modules/labs/common/Markdown';
import { highlightFence } from './highlight';
import { InlineError, SkeletonLines, Spinner } from './ui';
import type { StarVariant } from './useGuided';
import type { Question, QuestionProgress } from './types';

const KIND_NOTE: Record<Question['kind'], string> = {
  concept: 'a structured explanation',
  implementation: 'an implementation walkthrough',
  algorithm: 'an algorithm walkthrough',
  scenario: 'a worked scenario',
};

/**
 * The structured answer, inline under the question: Situation, Task, Action, Result, then common mistakes and interview
 * tips, with Python code highlighted. It is written when the learner asks, kept with the question, and never completes it:
 * reading an answer is not the same as being able to give it.
 */
export default function StarPanel({
  question,
  progress,
  busy,
  error,
  onRun,
  onSelect,
  onHide,
  onAskTutor,
  onClearError,
  kindNotes,
}: {
  question: Question;
  progress: QuestionProgress;
  busy: boolean;
  error: string | undefined;
  onRun: (variant: StarVariant) => void;
  onSelect: (versionId: string) => void;
  onHide: (hidden: boolean) => void;
  onAskTutor: () => void;
  onClearError: () => void;
  /** The lab's own wording for a question kind where the default does not fit (labs.ts). */
  kindNotes?: Partial<Record<Question['kind'], string>>;
}) {
  const { versions, activeId, hidden } = progress.star;
  const active = versions.find((v) => v.id === activeId) ?? versions[versions.length - 1] ?? null;

  const copy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.text);
      toast.success('Answer copied');
    } catch {
      toast.error('Could not copy. Select the text and copy it instead.');
    }
  };

  return (
    <section className="gp-card p-4 sm:p-[1.25rem]" aria-label="Answer in STAR">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name="StarIcon" size={15} aria-hidden="true" />
          Answer in STAR
        </h3>
        <p className="text-xs text-muted-foreground">
          Situation, Task, Action, Result, written as{' '}
          {kindNotes?.[question.kind] ?? KIND_NOTE[question.kind]}.
        </p>
        <span className="flex-1" />
        {active && hidden && (
          <button type="button" onClick={() => onHide(false)} className="todo-btn todo-btn-quiet">
            <Icon name="EyeIcon" size={14} />
            Show answer
          </button>
        )}
      </div>

      {versions.length > 1 && !hidden && (
        <div className="todo-segmented mb-3" role="group" aria-label="Versions of the answer">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.id === active?.id}
              onClick={() => onSelect(v.id)}
              className="todo-segment todo-focus px-3 py-1.5 text-xs font-medium"
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3">
          <InlineError
            message={error}
            onRetry={() => onRun(active ? 'example' : 'generate')}
            onDismiss={onClearError}
          />
        </div>
      )}

      {busy && (
        <div className="mb-3">
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner size={12} />
            Writing the answer…
          </p>
          {!active && <SkeletonLines lines={6} label="Writing the answer" />}
        </div>
      )}

      {active && !hidden && (
        <>
          <div className="gp-enter" key={active.id}>
            <Markdown content={active.text} highlight={highlightFence} className="text-sm" />
          </div>
          <div
            className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"
            role="group"
            aria-label="Answer actions"
          >
            <button type="button" onClick={onAskTutor} className="todo-btn todo-btn-primary">
              <Icon name="SparklesIcon" size={14} />
              Ask AI Tutor about this answer
            </button>
            <button
              type="button"
              onClick={() => onRun('simplify')}
              disabled={busy}
              className="todo-btn todo-btn-quiet"
            >
              <Icon name="ArrowsPointingInIcon" size={14} />
              Simplify answer
            </button>
            <button
              type="button"
              onClick={() => onRun('example')}
              disabled={busy}
              className="todo-btn todo-btn-quiet"
            >
              <Icon name="PlusIcon" size={14} />
              Give another example
            </button>
            <button type="button" onClick={copy} className="todo-btn todo-btn-quiet">
              <Icon name="ClipboardDocumentIcon" size={14} />
              Copy answer
            </button>
            <button type="button" onClick={() => onHide(true)} className="todo-btn todo-btn-ghost">
              <Icon name="EyeSlashIcon" size={14} />
              Hide answer
            </button>
          </div>
          {!progress.completed && (
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              Reading the answer does not complete the question. Run the tests, or show the tutor
              you understand it.
            </p>
          )}
        </>
      )}

      {!active && !busy && !error && (
        <button
          type="button"
          onClick={() => onRun('generate')}
          className="todo-btn todo-btn-primary"
        >
          <Icon name="StarIcon" size={14} />
          Write the answer
        </button>
      )}
    </section>
  );
}
