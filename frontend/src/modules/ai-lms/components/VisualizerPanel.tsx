'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsLesson, VisualExplanationResult } from '../types';

interface VisualizerPanelProps {
  lesson: LmsLesson;
  onVisualEmbedded?: () => void;
  onSwitchToRead?: () => void;
}

export default function VisualizerPanel({
  lesson,
  onVisualEmbedded,
  onSwitchToRead,
}: VisualizerPanelProps) {
  const [visual, setVisual] = useState<VisualExplanationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [customConcept, setCustomConcept] = useState('');
  const [showPromptInput, setShowPromptInput] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [embedSuccess, setEmbedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateVisual = async (focusConcept?: string) => {
    setLoading(true);
    setError(null);
    setEmbedSuccess(false);
    try {
      const result = await lmsService.visualizeLesson(lesson.id, focusConcept || undefined);
      setVisual(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate visual explanation. Check your AI key in Config.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmbedIntoLesson = async () => {
    if (!visual) return;
    setEmbedding(true);
    setError(null);
    try {
      await lmsService.embedVisualInLesson(lesson.id, {
        visual_html: visual.visual_html,
        title: visual.title,
      });
      setEmbedSuccess(true);
      if (onVisualEmbedded) {
        onVisualEmbedded();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to embed visual into lesson document.');
    } finally {
      setEmbedding(false);
    }
  };

  // Generate automatically if not generated yet
  React.useEffect(() => {
    if (!visual && !loading && !error) {
      handleGenerateVisual();
    }
  }, [lesson.id]);

  const wrapVisualInTemplate = (visualHtml: string) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --primary: #818cf8;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
      --border: #334155;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1.5rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .lms-visualizer {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.75rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    button {
      font-family: inherit;
      cursor: pointer;
    }
    svg {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 0 auto;
    }
    canvas {
      max-width: 100%;
      border-radius: 0.5rem;
      display: block;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  ${visualHtml}
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
              <Icon name="SparklesIcon" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-base font-bold text-foreground">
                  {visual?.title || 'Interactive AI Visualizer'}
                </h3>
                {visual && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    {visual.visual_type}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {visual?.explanation || 'AI autonomously chooses the optimal visual medium for this topic.'}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {visual && (
              <button
                type="button"
                onClick={handleEmbedIntoLesson}
                disabled={embedding || embedSuccess}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
              >
                <Icon name={embedSuccess ? 'CheckIcon' : 'ArrowDownTrayIcon'} size={14} />
                <span>{embedSuccess ? 'Embedded in Lesson!' : embedding ? 'Embedding...' : 'Embed into Lesson'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPromptInput((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition-colors"
            >
              <Icon name="ArrowPathIcon" size={14} />
              <span>Regenerate Visual</span>
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

        {/* Custom prompt focus input */}
        {showPromptInput && (
          <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center gap-2 animate-fadeIn">
            <input
              type="text"
              placeholder="e.g. Visualize the packet headers, or show 3-node partition..."
              value={customConcept}
              onChange={(e) => setCustomConcept(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-input text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                handleGenerateVisual(customConcept.trim());
                setShowPromptInput(false);
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:bg-primary/90"
            >
              Generate
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => handleGenerateVisual()}
              className="underline font-semibold ml-2"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Visual Canvas / Frame */}
      <div className="w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden min-h-[580px] flex flex-col relative">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="h-10 w-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1">
              <h4 className="font-heading text-base font-bold text-foreground">
                Synthesizing Visual Reinforcement...
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm">
                AI is analyzing the mental model and generating an interactive native web simulation or diagram.
              </p>
            </div>
          </div>
        ) : visual ? (
          <iframe
            srcDoc={wrapVisualInTemplate(visual.visual_html)}
            title={visual.title}
            sandbox="allow-scripts"
            className="w-full flex-1 border-0 min-h-[580px]"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="p-3 rounded-full bg-muted text-muted-foreground">
              <Icon name="PhotoIcon" size={28} />
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground">
              No visualization generated yet
            </h4>
            <button
              type="button"
              onClick={() => handleGenerateVisual()}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-sm hover:bg-primary/90"
            >
              Generate Visual
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
