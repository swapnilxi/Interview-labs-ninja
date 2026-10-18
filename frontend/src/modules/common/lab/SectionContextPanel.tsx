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
    <div className="px-4 py-3.5 border-b border-border mix-bg-muted/30 animate-fade-in">
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
        className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground
          placeholder:mix-text-muted-foreground/60 focus:outline-none focus:border-primary disabled:opacity-60"
      />
      <p className="mt-1.5 text-[11px] mix-text-muted-foreground/80">
        {hasContent
          ? `Update works your context into the current section. Regenerate writes it again from scratch${
              allowEmptyRegenerate ? '; leave the box empty to use just your lab settings' : ''
            }. Either way the result is saved.`
          : `The section is written around your context and saved${
              allowEmptyRegenerate ? '; leave the box empty to use just your lab settings' : ''
            }.`}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-error">
          {error}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        {onOpenPromptSettings ? (
          <button
            type="button"
            onClick={onOpenPromptSettings}
            disabled={pending !== null}
            className="text-xs text-primary hover:underline font-medium flex items-center gap-1.5 py-1"
          >
            <Icon name="AdjustmentsHorizontalIcon" size={14} />
            Configure prompt & add-ons
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {hasContent && (
            <button
              type="button"
              onClick={() => submit('update')}
              disabled={updateDisabled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground
              hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending === 'update' ? spinner : <Icon name="PencilSquareIcon" size={13} />}
              {pending === 'update' ? 'Updating…' : 'Update with context'}
            </button>
          )}
          <button
            type="button"
            onClick={() => submit('regenerate')}
            disabled={regenerateDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold mix-bg-primary/10 border mix-border-primary/25 text-primary
            hover:mix-bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
