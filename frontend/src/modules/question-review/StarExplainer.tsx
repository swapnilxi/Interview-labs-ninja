'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import RichText from '@/modules/daily-session/coach/RichText';
import {
  answerCoachService,
  type Expansion,
} from '@/modules/daily-session/coach/answerCoachService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';
import { isMissingKeyError } from '@/lib/services/settingsService';

interface StarExplainerProps {
  questionText: string;
  /** Backend category code: `interview` or `cv_skill`. */
  category: string;
  subType: string;
  difficulty: string;
  /** The answer as it is in the box right now (may be empty). */
  answerText: string;
  /** Put the STAR version into the answer box. */
  onUse?: (text: string) => void;
}

/** "Shape it as a STAR story": the coach's expand-answer in Situation / Task / Action / Result form. */
export default function StarExplainer({
  questionText,
  category,
  subType,
  difficulty,
  answerText,
  onUse,
}: StarExplainerProps) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Expansion | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const contextId = useId();

  const run = async () => {
    if (!isLoggedIn()) {
      openLoginModal({
        feature: 'the STAR answer coach',
        redirectTo: `${window.location.pathname}${window.location.search}`,
      });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const out = await answerCoachService.expand({
        questionText,
        answerText,
        category,
        subType,
        difficulty,
        style: 'star',
        context,
      });
      // An empty reply must never replace the answer through "Use as my answer".
      if (!out.expanded_answer?.trim()) throw new Error('The AI came back empty. Try again.');
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the STAR version. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bs-coach" aria-labelledby={`${panelId}-title`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="ds-icon-tile ds-icon-tile-sm ds-tone-gold">
            <Icon name="StarIcon" variant="solid" size={16} />
          </span>
          <div className="min-w-0">
            <h3 id={`${panelId}-title`} className="text-sm font-semibold ds-ink">
              Shape it as a STAR story
            </h3>
            <p className="mt-0.5 text-[13px] leading-snug ds-muted">
              Situation, task, action, result. Built from your answer and, if you add it, your real
              context.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="ds-btn ds-btn-secondary ds-btn-sm flex-shrink-0"
        >
          <Icon name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={15} />
          {open ? 'Hide' : 'Open'}
        </button>
      </div>

      <div id={panelId} hidden={!open} className="mt-4 space-y-3">
        <div>
          <label htmlFor={contextId} className="bs-label">
            Your context (optional)
          </label>
          <textarea
            id={contextId}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="Your real project, role, team size, numbers, tools. The story is grounded in this instead of invented details."
            className="ds-field resize-y"
          />
          <p className="bs-footnote">
            {answerText.trim()
              ? 'Your answer above is used as the draft.'
              : 'No answer yet, so a model STAR answer is written from scratch.'}
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="ds-btn ds-btn-soft ds-tone-indigo ds-btn-sm"
        >
          {loading ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          ) : (
            <Icon name="SparklesIcon" size={15} />
          )}
          {loading ? 'Writing…' : result ? 'Write it again' : 'Write the STAR version'}
        </button>
        {error && (
          <p className="ds-banner ds-tone-rose text-sm" role="alert">
            <Icon name="ExclamationTriangleIcon" variant="solid" size={16} />
            <span>
              {error}
              {isMissingKeyError(error) && (
                <>
                  {' '}
                  <Link href="/config" className="font-semibold underline underline-offset-2">
                    Open Config
                  </Link>
                </>
              )}
            </span>
          </p>
        )}
        {result && (
          <div className="ds-panel ds-enter space-y-3" aria-live="polite">
            {result.summary && <p className="text-[13px] ds-muted">{result.summary}</p>}
            <RichText text={result.expanded_answer} className="ds-ink" />
            <div className="flex flex-wrap gap-2">
              {onUse && (
                <button
                  type="button"
                  onClick={() => onUse(result.expanded_answer)}
                  className="ds-btn ds-btn-soft ds-btn-sm ds-tone-indigo"
                >
                  <Icon name="ArrowDownOnSquareIcon" size={15} />
                  Use as my answer
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.expanded_answer);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
                className="ds-btn ds-btn-secondary ds-btn-sm"
              >
                <Icon name={copied ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={14} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {result.confidence_notes && (
              <p className="text-xs ds-faint">Worth double-checking: {result.confidence_notes}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
