'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { questionsService } from '@/lib/services/questionsService';
import { defaultAIRequestFields } from '@/lib/services/settingsService';

interface Props {
  topicName: string;
  subtopicName?: string;
  labName: string;
  accentVar?: string; // e.g. '--lab-cv', '--lab-dsa', '--lab-system'
}

type GenQ = { id: string; text: string; difficulty: string; subType: string; deleted: boolean };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082';

function diffBadge(d: string) {
  if (d === 'Easy') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
  if (d === 'Hard') return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
  return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
}

export default function GenerateQuestionsPanel({ topicName, subtopicName, labName, accentVar = '--lab-dsa' }: Props) {
  const [open,       setOpen]       = useState(false);
  const [showCtx,    setShowCtx]    = useState(false);
  const [context,    setContext]    = useState('');
  const [generating, setGenerating] = useState(false);
  const [questions,  setQuestions]  = useState<GenQ[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const accent = `var(${accentVar})`;
  const accentSoft = `var(${accentVar}-soft, color-mix(in srgb, var(${accentVar}) 12%, transparent))`;

  const activeCount = questions.filter(q => !q.deleted).length;

  async function generate() {
    setGenerating(true);
    setError(null);
    setSavedCount(null);
    setQuestions([]);
    try {
      const res = await fetch(`${API_BASE}/lab/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topicName,
          subtopic: subtopicName || undefined,
          lab: labName,
          context: context.trim() || undefined,
          count: 5,
          ...defaultAIRequestFields(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      setQuestions(
        (data.questions as { text: string; difficulty: string; sub_type: string }[]).map((q, i) => ({
          id: String(i),
          text: q.text,
          difficulty: q.difficulty,
          subType: q.sub_type,
          deleted: false,
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? 'Generation failed. Check API key in Config.');
    } finally {
      setGenerating(false);
    }
  }

  async function saveToBank() {
    const toSave = questions.filter(q => !q.deleted);
    if (!toSave.length) return;
    setSaving(true);
    setError(null);
    try {
      await questionsService.upsertMany(
        toSave.map(q => ({
          questionText: q.text,
          category: 'Interview' as const,
          subType: subtopicName ?? topicName,
          difficulty: (q.difficulty === 'Easy' || q.difficulty === 'Hard' ? q.difficulty : 'Medium') as 'Easy' | 'Medium' | 'Hard',
          questionType: q.subType,
          dateEncountered: new Date().toISOString().split('T')[0],
          lastReviewed: null,
        }))
      );
      setSavedCount(toSave.length);
      setQuestions([]);
    } catch (e: any) {
      setError('Failed to save. Check backend connection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lab-card border border-border overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => { setOpen(o => !o); setSavedCount(null); setError(null); }}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-all group"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accentSoft }}>
          <Icon name="QuestionMarkCircleIcon" size={14} style={{ color: accent }} />
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-foreground">Generate Questions</span>
          <span className="text-xs text-muted-foreground ml-2">Save 5 AI-generated questions to your Question Bank</span>
        </div>
        <Icon
          name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'}
          size={14}
          className="text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0"
        />
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">

          {/* Context toggle */}
          <button
            onClick={() => setShowCtx(s => !s)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name={showCtx ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={11} />
            {showCtx ? 'Hide context' : 'Add context / document (optional)'}
          </button>

          {showCtx && (
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Paste relevant notes, documentation, or any extra context to guide question generation…"
              rows={4}
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 resize-none scrollbar-clean"
              style={{ '--tw-ring-color': accent } as React.CSSProperties}
            />
          )}

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{ background: accent }}
          >
            {generating ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Icon name="SparklesIcon" size={14} />
            )}
            {generating ? 'Generating…' : 'Generate 5 Questions'}
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
              <Icon name="ExclamationTriangleIcon" size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Questions list */}
          {questions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Generated — {activeCount} remaining
              </p>
              {questions.map((q, idx) =>
                q.deleted ? null : (
                  <div
                    key={q.id}
                    className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-muted/40 border border-border group"
                  >
                    <span className="flex-shrink-0 text-[10px] text-muted-foreground/40 mt-0.5 w-4 text-right leading-5">
                      {idx + 1}
                    </span>
                    <p className="flex-1 text-sm text-foreground leading-relaxed min-w-0">{q.text}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold leading-none ${diffBadge(q.difficulty)}`}>
                        {q.difficulty}
                      </span>
                      <button
                        onClick={() => setQuestions(prev => prev.map(p => p.id === q.id ? { ...p, deleted: true } : p))}
                        title="Remove question"
                        className="p-1 rounded-md text-muted-foreground/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Icon name="XMarkIcon" size={13} />
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* Save */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={saveToBank}
                  disabled={saving || activeCount === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all disabled:opacity-40"
                  style={{ borderColor: accent, color: accent }}
                >
                  {saving ? (
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                    <Icon name="BookmarkIcon" size={14} />
                  )}
                  {saving ? 'Saving…' : `Save ${activeCount} to Question Bank`}
                </button>
                <button
                  onClick={() => setQuestions([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {savedCount !== null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              <Icon name="CheckCircleIcon" size={13} />
              <span>{savedCount} question{savedCount !== 1 ? 's' : ''} saved to Question Bank</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
