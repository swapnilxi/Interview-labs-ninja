'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { BreakdownResult, LmsLesson } from '../types';

interface BreakdownPanelProps {
  lesson: LmsLesson;
  breakdown: BreakdownResult | null;
  onBreakdownChange: (breakdown: BreakdownResult | null) => void;
  onSwitchToRead?: () => void;
}

export default function BreakdownPanel({
  lesson,
  breakdown,
  onBreakdownChange,
  onSwitchToRead,
}: BreakdownPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await lmsService.generateBreakdown(lesson.id);
      onBreakdownChange(result);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate a breakdown. Check your AI key in Config.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Only regenerate when the lesson itself changes -- `breakdown` is a lifted prop from
  // the parent so it survives a Read <-> Breakdown toggle without re-triggering.
  React.useEffect(() => {
    if (!breakdown && !loading && !error) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const wrapInTemplate = (bodyHtml: string) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f3ec; --surface: #fffaf2; --surface-2: #efe7d9;
      --text: #24201b; --text-muted: #71695f;
      --border: rgba(64, 55, 45, 0.14);
      --accent: #b36b17; --accent-soft: rgba(179, 107, 23, 0.12);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #17140f; --surface: #201c16; --surface-2: #2a251d;
        --text: #f4efe7; --text-muted: #b3a696;
        --border: rgba(255, 246, 235, 0.1);
        --accent: #f1ad55; --accent-soft: rgba(241, 173, 85, 0.14);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2rem 1.25rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .lms-breakdown {
      max-width: 640px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      counter-reset: chunk;
    }
    .lms-breakdown > * {
      counter-increment: chunk;
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.1rem 1.25rem 1.1rem 3.1rem;
    }
    .lms-breakdown > *::before {
      content: counter(chunk);
      position: absolute;
      left: 1.1rem;
      top: 1.1rem;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 800;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .lms-breakdown h2, .lms-breakdown h3 {
      font-size: 1rem;
      font-weight: 800;
      margin: 0 0 0.4rem;
      color: var(--text);
    }
    .lms-breakdown p {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.6;
      opacity: 0.92;
    }
    .lms-breakdown strong { color: var(--accent); font-weight: 700; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      {/* Top Banner / Controls */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent/10 text-accent border border-accent/20">
              <Icon name="Squares2X2Icon" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-base font-bold text-foreground">
                  {breakdown?.title ? `Breakdown: ${breakdown.title}` : 'Breakdown'}
                </h3>
                {breakdown?.chunk_count && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent/10 text-accent border border-accent/20">
                    {breakdown.chunk_count} chunks
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {breakdown?.summary ||
                  'Small, high-impact chunks — the essential point from each part of the lesson, trimmed to what matters.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50"
            >
              <Icon name="ArrowPathIcon" size={14} />
              <span>Regenerate</span>
            </button>

            {onSwitchToRead && (
              <button
                type="button"
                onClick={onSwitchToRead}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors"
              >
                <Icon name="BookOpenIcon" size={14} />
                <span>Read Lesson</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={handleGenerate} className="underline font-semibold ml-2">
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Breakdown Frame */}
      <div className="w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden min-h-[580px] flex flex-col relative">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="h-10 w-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1">
              <h4 className="font-heading text-base font-bold text-foreground">
                Breaking this down...
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                AI is condensing this lesson into small, high-impact chunks.
              </p>
            </div>
          </div>
        ) : breakdown ? (
          <iframe
            srcDoc={wrapInTemplate(breakdown.breakdown_html)}
            title={breakdown.title}
            sandbox=""
            className="w-full flex-1 border-0 min-h-[580px]"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 rounded-full bg-muted text-muted-foreground">
              <Icon name="Squares2X2Icon" size={28} />
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground">
              No breakdown generated yet
            </h4>
            <button
              type="button"
              onClick={handleGenerate}
              className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-semibold shadow-sm hover:opacity-90"
            >
              Break It Down
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
