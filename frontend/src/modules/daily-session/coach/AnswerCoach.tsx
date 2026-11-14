'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import RichText from './RichText';
import { Bar, Ring, toneClass, type Tone } from '../components/ds';
import { answerCoachService, type CoachInput, type Evaluation, type Expansion } from './answerCoachService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';

interface Props {
  input: CoachInput;
  /** Put the AI-expanded answer into the answer box. */
  onUseExpanded?: (text: string) => void;
}

const levelTone: Record<Evaluation['level'], Tone> = {
  Excellent: 'jade',
  Strong: 'jade',
  Developing: 'gold',
  'Needs work': 'rose',
};

const scoreTone = (s: number): Tone => (s >= 4 ? 'jade' : s >= 3 ? 'indigo' : s >= 2 ? 'gold' : 'rose');

/** A titled panel, tinted by a palette tone (styles: .ds-panel in daily-session.css). */
const Section = ({ title, tone, children }: { title: string; tone?: Tone; children: React.ReactNode }) => (
  <section className={`ds-panel ${tone ? toneClass(tone) : ''}`}>
    <h4 className="ds-panel-title">{title}</h4>
    {children}
  </section>
);

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed ds-ink">
    {items.map((t, i) => (
      <li key={i}>{t}</li>
    ))}
  </ul>
);

const DoubleCheck = ({ note }: { note: string }) => (
  <p className="ds-banner ds-tone-gold text-xs">
    <Icon name="ExclamationTriangleIcon" size={15} />
    <span>Worth double-checking: {note}</span>
  </p>
);

/** AI coach: rubric evaluation + "expand my answer", with the mascot reacting to the result. */
export default function AnswerCoach({ input, onUseExpanded }: Props) {
  const [busy, setBusy] = useState<'eval' | 'expand' | null>(null);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [ex, setEx] = useState<Expansion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasContent = !!(input.answerText.trim() || (input.codeText || '').trim());

  const run = async (which: 'eval' | 'expand') => {
    if (!isLoggedIn()) {
      openLoginModal({ feature: 'the AI answer coach', redirectTo: `${window.location.pathname}${window.location.search}` });
      return;
    }
    setBusy(which);
    setError(null);
    try {
      if (which === 'eval') {
        setEv(await answerCoachService.evaluate(input));
      } else {
        setEx(await answerCoachService.expand(input));
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const bubble = busy
    ? busy === 'eval'
      ? 'Reading your answer carefully and checking every claim…'
      : 'Building on your draft and double-checking the facts…'
    : error
      ? "Hmm, I couldn't finish that. Check your AI key in Settings and try again."
      : ev
        ? ev.overall >= 85
          ? 'Brilliant! That is interview-ready. Here is how to polish it further.'
          : ev.overall >= 70
            ? 'Strong answer! A few upgrades will make it excellent.'
            : ev.overall >= 50
              ? "Good start. Let's close the gaps, step by step."
              : "No worries, this is how we grow. Here's exactly what to fix."
        : 'Write your answer, then ask me to evaluate it or expand it. I will be honest and precise.';

  return (
    <div className="space-y-4">
      <div className="ds-inset flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="ds-icon-tile ds-icon-tile-sm ds-tone-indigo">
            <Icon name="SparklesIcon" size={16} className={busy ? 'animate-pulse' : ''} />
          </span>
          <div className="min-w-0" aria-live="polite">
            <p className="text-sm font-semibold ds-ink">AI coach</p>
            <p className="text-xs leading-snug ds-muted">{bubble}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-shrink-0">
          <button
            type="button"
            onClick={() => run('eval')}
            disabled={!!busy || !hasContent}
            title={hasContent ? 'Score your answer against a rubric' : 'Write something first to get an evaluation'}
            className="ds-btn ds-btn-primary ds-btn-sm"
          >
            {busy === 'eval' ? <Spinner /> : <Icon name="ChartBarIcon" size={15} />}
            Evaluate
          </button>
          <button
            type="button"
            onClick={() => run('expand')}
            disabled={!!busy}
            title="Builds on your draft, or writes a model answer if it is empty"
            className="ds-btn ds-btn-secondary ds-btn-sm"
          >
            {busy === 'expand' ? <Spinner dark /> : <Icon name="SparklesIcon" size={15} />}
            Expand
          </button>
        </div>
      </div>
      {error && (
        <p className="ds-banner ds-tone-rose" role="alert">
          <Icon name="ExclamationTriangleIcon" size={16} />
          <span>{error}</span>
        </p>
      )}

      {ev && <EvaluationView ev={ev} onUseExpanded={onUseExpanded} />}

      {ex && (
        <div className="space-y-3 ds-enter">
          <Section title="Expanded answer" tone="indigo">
            {ex.summary && <p className="mb-2 text-xs font-semibold italic ds-muted">{ex.summary}</p>}
            <RichText text={ex.expanded_answer} />
            <div className="mt-3 flex flex-wrap gap-2">
              {onUseExpanded && (
                <button type="button" onClick={() => onUseExpanded(ex.expanded_answer)} className="ds-btn ds-btn-primary ds-btn-sm">
                  Use as my answer
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(ex.expanded_answer);
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
          </Section>
          {ex.corrections.length > 0 && (
            <Section title="Corrections to your draft" tone="rose">
              <ul className="space-y-2 text-sm">
                {ex.corrections.map((c, i) => (
                  <li key={i}>
                    <span className="ds-muted line-through">{c.claim}</span>
                    <div className="font-semibold ds-ink">{c.correction}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {ex.added_points.length > 0 && (
            <Section title="What was added">
              <List items={ex.added_points} />
            </Section>
          )}
          {ex.confidence_notes && <DoubleCheck note={ex.confidence_notes} />}
        </div>
      )}
    </div>
  );
}

/** Rubric result: score ring, criteria, corrections, improvements, stronger answer. */
export function EvaluationView({ ev, onUseExpanded }: { ev: Evaluation; onUseExpanded?: (text: string) => void }) {
  return (
    <div className="space-y-3 ds-enter">
          <div className="ds-card-raised flex items-center gap-4 p-4">
            <Ring value={ev.overall / 100} size={76} stroke={7} tone={levelTone[ev.level]} label={`${ev.overall} out of 100`}>
              <span className="text-center">
                <span className="block text-xl font-bold leading-none ds-ink ds-num">{ev.overall}</span>
                <span className="block text-[11px] font-semibold ds-faint">/ 100</span>
              </span>
            </Ring>
            <div>
              <div className={`text-lg font-bold ds-tone-text ${toneClass(levelTone[ev.level])}`}>{ev.level}</div>
              <p className="text-xs ds-muted">Weighted across the rubric below. Each point is tied to what you wrote.</p>
            </div>
          </div>

          <Section title="Rubric">
            <div className="space-y-3">
              {ev.criteria.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold ds-ink">
                    <span>{c.label} <span className="ds-faint">· {c.weight}%</span></span>
                    <span className="ds-num">{c.score}/5</span>
                  </div>
                  <Bar value={c.score / 5} tone={scoreTone(c.score)} className="mt-1.5" label={c.label} />
                  {c.comment && <p className="mt-1.5 text-xs ds-muted">{c.comment}</p>}
                  {c.improve && c.score < 5 && <p className="mt-0.5 text-xs font-semibold ds-tone-indigo ds-tone-text">To improve: {c.improve}</p>}
                </div>
              ))}
            </div>
          </Section>

          {ev.factual_issues.length > 0 && (
            <Section title="Corrections: what to fix" tone="rose">
              <ul className="space-y-2">
                {ev.factual_issues.map((f, i) => (
                  <li key={i} className="text-sm">
                    <span className={`ds-chip mr-2 ${f.severity === 'major' ? 'ds-tone-rose' : 'ds-tone-gold'}`}>{f.severity}</span>
                    <span className="ds-muted line-through">{f.claim}</span>
                    <div className="mt-1 font-semibold ds-ink">{f.correction}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {ev.strengths.length > 0 && (
            <Section title="What you did well" tone="jade">
              <List items={ev.strengths} />
            </Section>
          )}
          {ev.missing.length > 0 && (
            <Section title="Missing">
              <List items={ev.missing} />
            </Section>
          )}
          {ev.improvements.length > 0 && (
            <Section title="How to improve (highest impact first)" tone="indigo">
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed ds-ink">
                {ev.improvements.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ol>
            </Section>
          )}
          {ev.better_answer && (
            <Section title="A stronger version of your answer">
              <RichText text={ev.better_answer} />
              {onUseExpanded && (
                <button type="button" onClick={() => onUseExpanded(ev.better_answer)} className="ds-btn ds-btn-secondary ds-btn-sm mt-3">
                  Use as my answer
                </button>
              )}
            </Section>
          )}
          {ev.follow_ups.length > 0 && (
            <Section title="Expect these follow-ups">
              <List items={ev.follow_ups} />
            </Section>
          )}
          {ev.confidence_notes && <DoubleCheck note={ev.confidence_notes} />}
        </div>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return <span className={`h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${dark ? 'opacity-70' : ''}`} />;
}
