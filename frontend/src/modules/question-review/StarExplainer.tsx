'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import RichText from '@/modules/daily-session/coach/RichText';
import { answerCoachService, type Expansion } from '@/modules/daily-session/coach/answerCoachService';
import { toast } from '@/lib/ui/toast';

interface StarExplainerProps {
  questionText: string;
  category: string;
  subType: string;
  difficulty: string;
  /** The user's current written answer (may be empty). */
  answerText: string;
}

export default function StarExplainer({ questionText, category, subType, difficulty, answerText }: StarExplainerProps) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Expansion | null>(null);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(
        await answerCoachService.expand({
          questionText,
          answerText,
          category,
          subType,
          difficulty,
          style: 'star',
          context,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the answer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card rounded-lg p-24 shadow-md border border-border">
      <div className="flex items-center justify-between gap-12 flex-wrap">
        <div>
          <h3 className="font-heading text-lg font-medium text-foreground">Explain answer in STAR pattern</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Situation, Task, Action, Result. Built from your answer and, optionally, your own context.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-[2.5rem] px-18 rounded-md bg-primary text-primary-foreground font-medium text-sm transition-smooth focus-ring flex items-center gap-6"
        >
          <Icon name="SparklesIcon" size={18} variant="outline" />
          {open ? 'Hide' : 'Explain in STAR'}
        </button>
      </div>

      {open && (
        <div className="mt-18 space-y-12">
          <label className="block text-sm font-medium text-foreground" htmlFor="star-context">
            Add context (optional)
          </label>
          <textarea
            id="star-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
            placeholder="Your real project, role, team size, numbers, tools... The answer will be grounded in this instead of invented details."
            className="w-full rounded-md border border-border bg-background p-12 text-sm text-foreground focus-ring"
          />
          <p className="text-xs text-muted-foreground">
            {answerText.trim()
              ? 'Your current answer above is used as the draft.'
              : 'No answer written yet, so a model answer is written from scratch.'}
          </p>
          <button
            onClick={run}
            disabled={loading}
            className="h-[2.5rem] px-18 rounded-md bg-muted text-foreground font-medium text-sm transition-smooth focus-ring disabled:opacity-60"
          >
            {loading ? 'Generating...' : result ? 'Regenerate' : context.trim() ? 'Generate with my context' : 'Generate'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {result && (
        <div className="mt-18 pt-18 border-t border-border space-y-12">
          {result.summary && <p className="text-sm text-muted-foreground">{result.summary}</p>}
          <RichText text={result.expanded_answer} />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.expanded_answer);
                toast.success('Copied');
              } catch {
                toast.error('Copy failed');
              }
            }}
            className="h-[2.25rem] px-12 rounded-md bg-muted text-foreground text-sm focus-ring"
          >
            Copy
          </button>
          {result.confidence_notes && <p className="text-xs text-muted-foreground">{result.confidence_notes}</p>}
        </div>
      )}
    </div>
  );
}
