'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { EasyReadResult, LmsLesson } from '../types';

interface EasyReadPanelProps {
  lesson: LmsLesson;
  easyRead: EasyReadResult | null;
  onEasyReadChange: (easyRead: EasyReadResult | null) => void;
  onSwitchToRead?: () => void;
}

export default function EasyReadPanel({
  lesson,
  easyRead,
  onEasyReadChange,
  onSwitchToRead,
}: EasyReadPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await lmsService.generateEasyRead(lesson.id);
      onEasyReadChange(result);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate an Easy Read version. Check your AI key in Config.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Only regenerate when the lesson itself changes -- `easyRead` is a lifted prop from
  // the parent so it survives a Read <-> Easy Read toggle without re-triggering.
  React.useEffect(() => {
    if (!easyRead && !loading && !error) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const wrapEasyReadInTemplate = (bodyHtml: string) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f3ec;
      --surface-2: #efe7d9;
      --text: #24201b;
      --muted: #71695f;
      --accent: #5b5bd6;
      --border: rgba(64, 55, 45, 0.16);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #17140f;
        --surface-2: #2a251d;
        --text: #f4efe7;
        --muted: #b3a696;
        --accent: #9694f5;
        --border: rgba(255, 246, 235, 0.14);
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
    .lms-easy-read {
      max-width: 680px;
      margin: 0 auto;
      font-size: 1.05rem;
      line-height: 1.75;
    }
    .lms-easy-read h2 {
      font-size: 1.3rem;
      font-weight: 800;
      margin: 2rem 0 0.75rem;
      color: var(--text);
    }
    .lms-easy-read h2:first-child { margin-top: 0; }
    .lms-easy-read h3 {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 1.5rem 0 0.5rem;
      color: var(--text);
    }
    .lms-easy-read p { margin: 0 0 1rem; color: var(--text); }
    .lms-easy-read ul, .lms-easy-read ol {
      margin: 0 0 1.25rem;
      padding-left: 1.4rem;
      color: var(--text);
    }
    .lms-easy-read li { margin-bottom: 0.5rem; }
    .lms-easy-read strong { color: var(--accent); font-weight: 700; }
    .lms-easy-read a { color: var(--accent); }
    .lms-easy-read code {
      background: var(--surface-2);
      color: var(--text);
      padding: 0.15rem 0.4rem;
      border-radius: 0.3rem;
      font-size: 0.9em;
    }
    .lms-easy-read hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2rem 0;
    }
    .lms-easy-read blockquote {
      margin: 1rem 0;
      padding: 0.25rem 0 0.25rem 1rem;
      border-left: 3px solid var(--border);
      color: var(--muted);
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
              <Icon name="DocumentTextIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">
                {easyRead?.title || 'Easy Read'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {easyRead?.summary ||
                  'A lighter, less text-heavy rewrite of this lesson — key takeaways, short sections, and bullets.'}
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
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={handleGenerate} className="underline font-semibold ml-2">
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Easy Read Frame */}
      <div className="w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden min-h-[580px] flex flex-col relative">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="h-10 w-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1">
              <h4 className="font-heading text-base font-bold text-foreground">
                Simplifying this lesson...
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                AI is restructuring the lesson into key takeaways, short sections, and bullets.
              </p>
            </div>
          </div>
        ) : easyRead ? (
          <iframe
            srcDoc={wrapEasyReadInTemplate(easyRead.easy_read_html)}
            title={easyRead.title}
            sandbox=""
            className="w-full flex-1 border-0 min-h-[580px]"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 rounded-full bg-muted text-muted-foreground">
              <Icon name="DocumentTextIcon" size={28} />
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground">
              No Easy Read version yet
            </h4>
            <button
              type="button"
              onClick={handleGenerate}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-sm hover:bg-primary/90"
            >
              Generate Easy Read
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
