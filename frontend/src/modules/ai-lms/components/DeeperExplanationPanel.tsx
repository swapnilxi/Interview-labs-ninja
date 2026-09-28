'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { DeeperExplanationResult, LmsLesson } from '../types';

interface DeeperExplanationPanelProps {
  lesson: LmsLesson;
  deeper: DeeperExplanationResult | null;
  onDeeperChange: (deeper: DeeperExplanationResult | null) => void;
  onSwitchToRead?: () => void;
}

export default function DeeperExplanationPanel({
  lesson,
  deeper,
  onDeeperChange,
  onSwitchToRead,
}: DeeperExplanationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await lmsService.generateDeeperExplanation(lesson.id);
      onDeeperChange(result);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate a deeper explanation. Check your AI key in Config.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Only regenerate when the lesson itself changes -- `deeper` is a lifted prop from
  // the parent so it survives a Read <-> Explain Deeper toggle without re-triggering.
  React.useEffect(() => {
    if (!deeper && !loading && !error) {
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
      --primary: #5b5bd6; --primary-soft: rgba(91, 91, 214, 0.1);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #17140f; --surface: #201c16; --surface-2: #2a251d;
        --text: #f4efe7; --text-muted: #b3a696;
        --border: rgba(255, 246, 235, 0.1);
        --primary: #9694f5; --primary-soft: rgba(150, 148, 245, 0.14);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2.5rem 1.5rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .lms-deeper {
      max-width: 720px;
      margin: 0 auto;
      font-size: 1.02rem;
      line-height: 1.75;
    }
    .lms-deeper h2 {
      font-size: 1.3rem;
      font-weight: 800;
      margin: 2.25rem 0 0.75rem;
      color: var(--text);
    }
    .lms-deeper h2:first-child { margin-top: 0; }
    .lms-deeper h3 {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 1.5rem 0 0.5rem;
      color: var(--text);
    }
    .lms-deeper p { margin: 0 0 1.1rem; opacity: 0.92; }
    .lms-deeper ul, .lms-deeper ol {
      margin: 0 0 1.25rem;
      padding-left: 1.4rem;
    }
    .lms-deeper li { margin-bottom: 0.5rem; }
    .lms-deeper strong { color: var(--primary); font-weight: 700; }
    .lms-deeper code {
      background: var(--surface-2);
      padding: 0.15rem 0.4rem;
      border-radius: 0.3rem;
      font-size: 0.9em;
    }
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
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Icon name="ArrowTrendingUpIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                {deeper?.title ? `Deeper: ${deeper.title}` : 'Explain Deeper'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {deeper?.summary ||
                  'A deeper-dive extension — edge cases, mechanics, and trade-offs the intro lesson skips.'}
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

      {/* Deeper Explanation Frame */}
      <div className="w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden min-h-[580px] flex flex-col relative">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="h-10 w-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1">
              <h4 className="font-heading text-base font-bold text-foreground">
                Digging deeper...
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                AI is extending this lesson with edge cases, mechanics, and trade-offs the intro
                skipped.
              </p>
            </div>
          </div>
        ) : deeper ? (
          <iframe
            srcDoc={wrapInTemplate(deeper.deeper_html)}
            title={deeper.title}
            sandbox=""
            className="w-full flex-1 border-0 min-h-[580px]"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 rounded-full bg-muted text-muted-foreground">
              <Icon name="ArrowTrendingUpIcon" size={28} />
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground">
              No deeper explanation generated yet
            </h4>
            <button
              type="button"
              onClick={handleGenerate}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-sm hover:bg-primary/90"
            >
              Explain Deeper
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
