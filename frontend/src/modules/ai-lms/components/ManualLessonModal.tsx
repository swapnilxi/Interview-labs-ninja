'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsClass, LmsLesson, LmsSubject } from '../types';

interface ManualLessonModalProps {
  isOpen: boolean;
  targetClass: LmsClass;
  targetSubject?: LmsSubject | null;
  lessonToEdit?: LmsLesson | null;
  onClose: () => void;
  onSaved: (lesson: LmsLesson) => void;
}

const STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lesson Title</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --border: #334155;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2.5rem 1.5rem;
      max-width: 860px;
      margin: 0 auto;
    }
    h1, h2, h3 { color: #fff; font-weight: 700; margin-top: 2rem; }
    h1 { font-size: 2.2rem; border-bottom: 2px solid var(--border); padding-bottom: 0.8rem; margin-top: 0; }
    .badge { display: inline-block; background: rgba(56, 189, 248, 0.15); color: var(--accent); padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem; }
    .callout { background: var(--card); border-left: 4px solid var(--accent); padding: 1.25rem; border-radius: 0.5rem; margin: 1.5rem 0; }
    pre { background: #020617; border: 1px solid var(--border); padding: 1rem; border-radius: 0.5rem; overflow-x: auto; color: #e2e8f0; font-family: monospace; }
  </style>
</head>
<body>
  <span class="badge">Interactive Lesson</span>
  <h1>Lesson Title</h1>
  <p class="lead">Introduction to this fundamental engineering concept.</p>

  <div class="callout">
    <strong>💡 Key Insight:</strong> Write the core mental model or architectural takeaway here.
  </div>

  <h2>1. Core Concepts</h2>
  <p>Explain the architecture, design choices, and trade-offs.</p>

  <h2>2. Code & Implementation</h2>
  <pre><code>// Example code snippet
function processRequest() {
  console.log("Processed!");
}</code></pre>
</body>
</html>`;

export default function ManualLessonModal({
  isOpen,
  targetClass,
  targetSubject,
  lessonToEdit,
  onClose,
  onSaved,
}: ManualLessonModalProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [htmlContent, setHtmlContent] = useState(STARTER_HTML);
  const [readMinutes, setReadMinutes] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lessonToEdit) {
      setTitle(lessonToEdit.title);
      setSummary(lessonToEdit.summary || '');
      setHtmlContent(lessonToEdit.generated_html || STARTER_HTML);
      setReadMinutes(lessonToEdit.read_time_minutes || 5);
    } else {
      setTitle('');
      setSummary('');
      setHtmlContent(STARTER_HTML);
      setReadMinutes(5);
    }
  }, [lessonToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !htmlContent.trim()) return;

    setLoading(true);
    setError(null);
    try {
      if (lessonToEdit) {
        const updated = await lmsService.updateLesson(lessonToEdit.id, {
          title: title.trim(),
          generated_html: htmlContent,
          summary: summary.trim(),
        });
        onSaved(updated);
      } else {
        const created = await lmsService.createLesson({
          class_id: targetClass.id,
          subject_id: targetSubject?.id || null,
          title: title.trim(),
          generated_html: htmlContent,
          summary: summary.trim(),
          read_time_minutes: readMinutes,
        });
        onSaved(created);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save lesson');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl p-6 transition-smooth max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon name="DocumentTextIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {lessonToEdit ? 'Edit Lesson' : 'Create Lesson Manually'}
              </h3>
              <p className="text-xs text-muted-foreground">
                Target: {targetClass.name} {targetSubject ? `→ ${targetSubject.name}` : '(Direct Class)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Lesson Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Consistent Hashing Mechanics"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                Est. Read Time (mins)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={readMinutes}
                onChange={(e) => setReadMinutes(parseInt(e.target.value) || 5)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Short Summary
            </label>
            <input
              type="text"
              placeholder="Brief 1-line overview for lesson lists..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Standalone HTML Lesson Document *
              </label>
              <span className="text-xs text-muted-foreground">Self-contained HTML + CSS + JS</span>
            </div>
            <textarea
              rows={14}
              required
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-4 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !htmlContent.trim()}
              className="px-5 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? 'Saving...' : lessonToEdit ? 'Update Lesson' : 'Save Lesson'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
