'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsSubject } from '../types';

interface ContextSummaryPanelProps {
  subjectId: string;
  /** Length of the current raw text (README or ai_context) -- decides whether the
   * "this is getting long" banner shows at all. */
  rawTextLength: number;
  /** The currently stored AI summary, if any. */
  contextSummary?: string;
  /** Called with the freshly updated subject/project after a summarize or clear call,
   * so the parent can refresh its own state from the authoritative response. */
  onUpdated: (updated: LmsSubject) => void;
  /** "README / project context" or "AI generation guidance context" -- used in copy. */
  fieldLabel: string;
  /** Above this many characters, offer to summarize. Matches the point past which a
   * generation prompt's raw-prefix slice would start dropping real content. */
  thresholdChars?: number;
}

export default function ContextSummaryPanel({
  subjectId,
  rawTextLength,
  contextSummary,
  onUpdated,
  fieldLabel,
  thresholdChars = 10000,
}: ContextSummaryPanelProps) {
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSummary = Boolean(contextSummary && contextSummary.trim());
  const isLong = rawTextLength > thresholdChars;

  if (!isLong && !hasSummary) return null;

  const handleSummarize = async () => {
    setIsSummarizing(true);
    setError(null);
    try {
      const updated = await lmsService.summarizeContext(subjectId);
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to summarize context.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    setError(null);
    try {
      const updated = await lmsService.clearContextSummary(subjectId);
      onUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear summary.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div
      className={`mt-2 rounded-xl border p-3 text-xs ${
        hasSummary
          ? 'border-emerald-500/25 bg-emerald-500/5'
          : 'border-amber-500/25 bg-amber-500/5'
      }`}
    >
      {hasSummary ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
              <Icon name="SparklesIcon" size={13} />
              <span>AI Summary Active -- used for generation instead of the raw text</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                {expanded ? 'Hide summary' : 'View summary'}
              </button>
              <button
                type="button"
                disabled={isClearing || isSummarizing}
                onClick={handleClear}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-muted-foreground text-[11px] font-medium hover:text-destructive hover:border-destructive/40 disabled:opacity-50 transition-colors"
              >
                {isClearing ? 'Clearing...' : 'Clear'}
              </button>
              <button
                type="button"
                disabled={isSummarizing || isClearing}
                onClick={handleSummarize}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium hover:bg-emerald-500/15 disabled:opacity-50 transition-colors"
              >
                {isSummarizing ? 'Re-summarizing...' : 'Re-summarize'}
              </button>
            </div>
          </div>
          {expanded && (
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border-t border-emerald-500/15 pt-2">
              {contextSummary}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <Icon name="ExclamationTriangleIcon" size={13} className="mt-0.5 flex-shrink-0" />
            <span>
              This {fieldLabel} is long ({rawTextLength.toLocaleString()} characters). Only a
              prefix of raw text reaches each generation prompt -- summarizing first keeps the
              important parts from being silently cut off, and costs less per call.
            </span>
          </div>
          <button
            type="button"
            disabled={isSummarizing}
            onClick={handleSummarize}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-500/25 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {isSummarizing ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                <span>Summarizing...</span>
              </>
            ) : (
              <>
                <Icon name="SparklesIcon" size={13} />
                <span>Summarize &amp; Store</span>
              </>
            )}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
