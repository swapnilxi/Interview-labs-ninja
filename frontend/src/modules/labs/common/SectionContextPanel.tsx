'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { ContextMode } from '@/lib/services/labSectionsService';

interface SectionContextPanelProps {
  /** Context saved with the section last time; pre-fills the box. */
  initialContext: string;
  /** Whether the section already has content — "Update" only makes sense then. */
  hasContent: boolean;
  busy: boolean;
  /** Regenerate may run with the box empty: the section has instructions or standing context to write from. */
  allowEmptyRegenerate?: boolean;
  /** Lets the user click to open the prompt/addon editor modal */
  onOpenPromptSettings?: () => void;
  onSubmit: (context: string, mode: ContextMode) => Promise<void>;
  onClose: () => void;
}

export default function SectionContextPanel({
  initialContext,
  hasContent,
  busy,
  allowEmptyRegenerate = false,
  onOpenPromptSettings,
  onSubmit,
  onClose,
}: SectionContextPanelProps) {
  const [text, setText] = useState(initialContext);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ContextMode | null>(null);
  const empty = text.trim() === '';
  const working = busy || pending !== null;
  const updateDisabled = working || empty;
  const regenerateDisabled = working || (empty && !allowEmptyRegenerate);

  async function submit(mode: ContextMode) {
    if (mode === 'update' ? updateDisabled : regenerateDisabled) return;
    setError(null);
    setPending(mode);
    try {
      await onSubmit(text.trim(), mode);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed. Try again.');
      setPending(null);
    }
  }

  const spinner = (
    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
  );

  return (
    <div className="px-[1.25rem] py-[0.875rem] border-b mix-bg-foreground/[0.04] animate-fade-in">
      <label
        htmlFor="section-context"
        className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5"
      >
        Add context
      </label>
      <textarea
        id="section-context"
        autoFocus
        rows={3}
        value={text}
        maxLength={4000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && !pending && onClose()}
        disabled={pending !== null}
        placeholder="e.g. Focus on 2D grid problems, show the Java version, assume I know BFS but not DP…"
        className="todo-input resize-y px-3 py-2 text-[13px] leading-relaxed disabled:opacity-60"
      />
      <p className="mt-1.5 text-xs font-medium text-muted-foreground">
        {hasContent
          ? `Update works your context into the current section. Regenerate writes it again from scratch${
              allowEmptyRegenerate ? '; leave the box empty to use just your lab settings' : ''
            }. Either way the result is saved.`
          : `The section is written around your context and saved${
              allowEmptyRegenerate ? '; leave the box empty to use just your lab settings' : ''
            }.`}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-error">
          {error}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        {onOpenPromptSettings ? (
          <button
            type="button"
            onClick={onOpenPromptSettings}
            disabled={pending !== null}
            className="todo-focus rounded-md text-xs lab-ink hover:underline font-semibold flex items-center gap-1.5 py-1"
          >
            <Icon name="AdjustmentsHorizontalIcon" size={14} />
            Configure prompt & add-ons
          </button>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending !== null}
            className="todo-btn todo-btn-ghost"
          >
            Cancel
          </button>
          {hasContent && (
            <button
              type="button"
              onClick={() => submit('update')}
              disabled={updateDisabled}
              className="todo-btn todo-btn-secondary"
            >
              {pending === 'update' ? spinner : <Icon name="PencilSquareIcon" size={13} />}
              {pending === 'update' ? 'Updating…' : 'Update with context'}
            </button>
          )}
          <button
            type="button"
            onClick={() => submit('regenerate')}
            disabled={regenerateDisabled}
            className="todo-btn todo-btn-primary"
          >
            {pending === 'regenerate' ? spinner : <Icon name="SparklesIcon" size={13} />}
            {pending === 'regenerate'
              ? 'Generating…'
              : hasContent
                ? 'Regenerate with context'
                : 'Generate with context'}
          </button>
        </div>
      </div>
    </div>
  );
}
