'use client';

import Icon from '@/components/ui/AppIcon';
import { toast } from '@/lib/ui/toast';
import Markdown from '@/modules/labs/common/Markdown';
import { highlightFence } from './highlight';
import { fencedPython } from './parse';
import { InlineError, SkeletonLines, Spinner } from './ui';
import type { StarVariant } from './useGuided';
import type { Question, QuestionProgress, StarCode } from './types';

const KIND_NOTE: Record<Question['kind'], string> = {
  concept: 'a structured explanation',
  implementation: 'an implementation walkthrough',
  algorithm: 'an algorithm walkthrough',
  scenario: 'a worked scenario',
};

/** One button for the code: it writes the code the first time, then shows or hides it (nothing is written twice). */
function CodeToggle({
  code,
  busy,
  onWrite,
  onHide,
}: {
  code: StarCode | null;
  busy: boolean;
  onWrite: () => void;
  onHide: (hidden: boolean) => void;
}) {
  if (busy) {
    return (
      <button type="button" disabled className="todo-btn todo-btn-quiet">
        <Spinner size={12} />
        Writing the code…
      </button>
    );
  }
  const showing = !!code && !code.hidden;
  return (
    <button
      type="button"
      onClick={() => (code ? onHide(!code.hidden) : onWrite())}
      className="todo-btn todo-btn-quiet"
    >
      <Icon name="CodeBracketIcon" size={14} />
      {showing ? 'Hide code implementation' : 'Show code implementation'}
    </button>
  );
}

/** The code on show: one highlighted Python block (the block has its own Copy), and a way to write it again. */
function CodeCard({ code, busy, onWrite }: { code: StarCode; busy: boolean; onWrite: () => void }) {
  return (
    <div className="gp-enter mt-4 border-t pt-3" key={code.at} aria-label="Python implementation">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="text-xs font-semibold text-foreground">Python implementation</h4>
        <span className="text-xs text-muted-foreground">Python 3, standard library only.</span>
        <span className="flex-1" />
        <button type="button" onClick={onWrite} disabled={busy} className="todo-btn todo-btn-ghost">
          <Icon name="ArrowPathIcon" size={14} />
          Write it again
        </button>
      </div>
      <Markdown content={fencedPython(code.text)} highlight={highlightFence} className="text-sm" />
    </div>
  );
}

/**
 * The structured answer, inline under the question: Situation, Task, Action, Result, then common mistakes and interview
 * tips, with Python code highlighted. It is written when the learner asks, kept with the question, and never completes it:
 * reading an answer is not the same as being able to give it. "Show code implementation" writes the same question as one
 * complete Python program (Python only), also on request, kept apart from the answer's versions.
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
  codeEnabled,
  code,
  codeBusy,
  codeError,
  onWriteCode,
  onHideCode,
  onClearCodeError,
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
  /** The lab runs Python, so "Show code implementation" is offered (labs.ts `codeImplementation`). */
  codeEnabled: boolean;
  code: StarCode | null;
  codeBusy: boolean;
  codeError: string | undefined;
  onWriteCode: () => void;
  onHideCode: (hidden: boolean) => void;
  onClearCodeError: () => void;
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
        {active && hidden && codeEnabled && (
          <CodeToggle code={code} busy={codeBusy} onWrite={onWriteCode} onHide={onHideCode} />
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
            {codeEnabled && (
              <CodeToggle code={code} busy={codeBusy} onWrite={onWriteCode} onHide={onHideCode} />
            )}
            <button type="button" onClick={copy} className="todo-btn todo-btn-quiet">
              <Icon name="ClipboardDocumentIcon" size={14} />
              Copy answer
            </button>
            <button type="button" onClick={() => onHide(true)} className="todo-btn todo-btn-ghost">
              <Icon name="EyeSlashIcon" size={14} />
              Hide answer
            </button>
          </div>
        </>
      )}

      {!active && !busy && (
        <div className="flex flex-wrap items-center gap-2">
          {!error && (
            <button
              type="button"
              onClick={() => onRun('generate')}
              className="todo-btn todo-btn-primary"
            >
              <Icon name="StarIcon" size={14} />
              Write the answer
            </button>
          )}
          {codeEnabled && (
            <CodeToggle code={code} busy={codeBusy} onWrite={onWriteCode} onHide={onHideCode} />
          )}
        </div>
      )}

      {codeEnabled && (
        <>
          {codeError && (
            <div className="mt-3">
              <InlineError message={codeError} onRetry={onWriteCode} onDismiss={onClearCodeError} />
            </div>
          )}
          {code && !code.hidden && <CodeCard code={code} busy={codeBusy} onWrite={onWriteCode} />}
        </>
      )}

      {!progress.completed && ((active && !hidden) || (codeEnabled && code && !code.hidden)) && (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          Reading the {codeEnabled && code && !code.hidden ? 'answer or the code' : 'answer'} does
          not complete the question. Run the tests, or show the tutor you understand it.
        </p>
      )}
    </section>
  );
}
