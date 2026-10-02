'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsLesson } from '../types';

export interface LessonRevision {
  instruction: string;
  generated_html: string;
  summary: string;
}

interface UpdateLessonPanelProps {
  lesson: LmsLesson;
  revision: LessonRevision | null;
  onRevisionChange: (revision: LessonRevision | null) => void;
  onApplied: (updated: LmsLesson) => void;
}

const QUICK_PROMPTS = [
  'Add more code examples',
  'Explain the core idea with a simpler analogy',
  'Add a section on common mistakes',
  'Add two more quiz questions',
];

/** Reprompt a lesson: describe a change, preview the AI's updated version, then apply or discard. */
export default function UpdateLessonPanel({
  lesson,
  revision,
  onRevisionChange,
  onApplied,
}: UpdateLessonPanelProps) {
  const [instruction, setInstruction] = useState(revision?.instruction || '');
  const [loading, setLoading] = useState<'update' | 'regenerate' | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runRevision = async (mode: 'update' | 'regenerate') => {
    if (mode === 'update' && instruction.trim().length < 3) return;
    setLoading(mode);
    setError(null);
    try {
      const result = await lmsService.reviseLesson(lesson.id, instruction.trim(), mode);
      onRevisionChange({
        instruction: instruction.trim(),
        generated_html: result.generated_html,
        summary: result.summary,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update the lesson. Check your AI key in Config.'
      );
    } finally {
      setLoading(null);
    }
  };

  const handleApply = async () => {
    if (!revision) return;
    setApplying(true);
    setError(null);
    try {
      const updated = await lmsService.updateLesson(lesson.id, {
        generated_html: revision.generated_html,
        ...(revision.summary ? { summary: revision.summary } : {}),
      });
      onRevisionChange(null);
      setInstruction('');
      onApplied(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save the updated lesson.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Icon name="PencilSquareIcon" size={20} />
          </div>
          <div>
            <h3 className="font-heading text-base font-bold text-foreground">Update Lesson</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Update edits this lesson in place; Regenerate rebuilds it from its source. You preview
              the result before anything is replaced.
            </p>
          </div>
        </div>

        <textarea
          rows={4}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Add a section on rate limiting, and make the quiz harder."
          className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInstruction(q)}
                className="px-2.5 py-1 rounded-full border border-border bg-muted/40 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50"
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => runRevision('regenerate')}
              disabled={loading !== null}
              title="Rebuild the whole lesson from its original source (your instruction is optional guidance)"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              <Icon name="ArrowPathIcon" size={14} />
              <span>{loading === 'regenerate' ? 'Regenerating...' : 'Regenerate'}</span>
            </button>
            <button
              type="button"
              onClick={() => runRevision('update')}
              disabled={loading !== null || instruction.trim().length < 3}
              title="Edit the existing lesson in place, keeping everything you didn't mention"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              <Icon name="SparklesIcon" size={14} />
              <span>{loading === 'update' ? 'Updating...' : 'Update existing'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            {error}
          </div>
        )}
      </div>

      <div className="w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden min-h-[480px] flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="h-10 w-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">
              {loading === 'regenerate'
                ? 'Regenerating the lesson from its source...'
                : 'Rewriting the lesson with your changes...'}
            </p>
          </div>
        ) : revision ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30">
              <span className="text-xs text-muted-foreground">
                Preview of the updated lesson — not saved yet.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onRevisionChange(null)}
                  disabled={applying}
                  className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {applying ? 'Saving...' : 'Apply update'}
                </button>
              </div>
            </div>
            <iframe
              srcDoc={revision.generated_html}
              title="Updated lesson preview"
              sandbox="allow-scripts"
              className="w-full flex-1 border-0 min-h-[560px]"
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12 text-center text-xs text-muted-foreground">
            Your updated lesson preview will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
