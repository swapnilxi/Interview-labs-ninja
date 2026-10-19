'use client';

import React, { useState } from 'react';
import Mascot from '../companion/Mascot';
import type { Mood } from '../companion/content';
import RichText from './RichText';
import { answerCoachService, type CoachInput, type Evaluation, type Expansion } from './answerCoachService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';

interface Props {
  input: CoachInput;
  /** Put the AI-expanded answer into the answer box. */
  onUseExpanded?: (text: string) => void;
}

const levelStyle: Record<Evaluation['level'], string> = {
  Excellent: 'from-emerald-400 to-teal-400',
  Strong: 'from-lime-400 to-emerald-400',
  Developing: 'from-amber-400 to-orange-400',
  'Needs work': 'from-rose-400 to-pink-500',
};

const barColor = (s: number) => (s >= 4 ? 'bg-emerald-500' : s >= 3 ? 'bg-lime-500' : s >= 2 ? 'bg-amber-500' : 'bg-rose-500');

function ScoreRing({ value, level }: { value: number; level: Evaluation['level'] }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[5.5rem] w-[5.5rem] flex-shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className={level === 'Needs work' ? 'stroke-rose-500' : level === 'Developing' ? 'stroke-amber-500' : 'stroke-emerald-500'}
          style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold leading-none text-foreground">{value}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

const Section = ({ title, tone, children }: { title: string; tone?: string; children: React.ReactNode }) => (
  <section className={`rounded-2xl border-2 p-3.5 ${tone ?? 'border-border bg-card'}`}>
    <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{title}</h4>
    {children}
  </section>
);

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
    {items.map((t, i) => (
      <li key={i}>{t}</li>
    ))}
  </ul>
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

  const mood: Mood = busy ? 'think' : error ? 'comfort' : ev ? (ev.overall >= 70 ? 'cheer' : ev.overall >= 50 ? 'happy' : 'comfort') : 'happy';
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
      <div className="flex items-end gap-3">
        <Mascot mood={mood} speaking={!!busy} size={64} className="flex-shrink-0" />
        <div className="relative flex-1 rounded-2xl rounded-bl-md border-2 mix-border-primary/30 bg-card px-4 py-3 text-sm font-semibold leading-snug text-foreground">
          {bubble}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => run('eval')}
          disabled={!!busy || !hasContent}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-[0_4px_0_0_color-mix(in_srgb,var(--color-primary)_60%,black)] transition active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {busy === 'eval' ? <Spinner /> : <span aria-hidden>🎯</span>}
          Evaluate with AI
        </button>
        <button
          type="button"
          onClick={() => run('expand')}
          disabled={!!busy}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 mix-border-primary/40 lab-tint px-4 py-3 text-sm font-extrabold lab-ink transition hover:mix-bg-primary/[0.18] disabled:opacity-50"
        >
          {busy === 'expand' ? <Spinner dark /> : <span aria-hidden>🪄</span>}
          Expand answer with AI
        </button>
      </div>
      {!hasContent && <p className="text-xs text-muted-foreground">Write something first to get an evaluation. “Expand” works on an empty draft too and writes a model answer.</p>}
      {error && <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {ev && <EvaluationView ev={ev} onUseExpanded={onUseExpanded} />}

      {ex && (
        <div className="space-y-3 animate-fade-in">
          <Section title="Expanded answer" tone="mix-border-primary/30 lab-tint">
            {ex.summary && <p className="mb-2 text-xs font-semibold italic text-muted-foreground">{ex.summary}</p>}
            <RichText text={ex.expanded_answer} />
            <div className="mt-3 flex flex-wrap gap-2">
              {onUseExpanded && (
                <button type="button" onClick={() => onUseExpanded(ex.expanded_answer)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-primary-foreground">
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
                className="rounded-full border-2 border-border px-3 py-1.5 text-xs font-extrabold text-foreground"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </Section>
          {ex.corrections.length > 0 && (
            <Section title="Corrections to your draft" tone="border-rose-300 bg-rose-50/60 dark:border-rose-500/40 dark:bg-rose-500/10">
              <ul className="space-y-2 text-sm">
                {ex.corrections.map((c, i) => (
                  <li key={i}>
                    <span className="line-through decoration-rose-400/70">{c.claim}</span>
                    <div className="font-semibold text-foreground">✓ {c.correction}</div>
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
          {ex.confidence_notes && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">⚠️ Worth double-checking: {ex.confidence_notes}</p>}
        </div>
      )}
    </div>
  );
}

/** Rubric result: score ring, criteria, corrections, improvements, stronger answer. */
export function EvaluationView({ ev, onUseExpanded }: { ev: Evaluation; onUseExpanded?: (text: string) => void }) {
  return (
    <div className="space-y-3 animate-fade-in">
          <div className={`flex items-center gap-4 rounded-3xl bg-gradient-to-br ${levelStyle[ev.level]} p-[2px]`}>
            <div className="flex w-full items-center gap-4 rounded-[1.4rem] bg-card p-4">
              <ScoreRing value={ev.overall} level={ev.level} />
              <div>
                <div className="text-lg font-extrabold text-foreground">{ev.level}</div>
                <p className="text-xs text-muted-foreground">Weighted across the rubric below. Be honest with yourself: each point is tied to what you wrote.</p>
              </div>
            </div>
          </div>

          <Section title="Rubric">
            <div className="space-y-3">
              {ev.criteria.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-foreground">
                    <span>{c.label} <span className="font-semibold text-muted-foreground">· {c.weight}%</span></span>
                    <span>{c.score}/5</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${barColor(c.score)} transition-all duration-700`} style={{ width: `${(c.score / 5) * 100}%` }} />
                  </div>
                  {c.comment && <p className="mt-1 text-xs text-muted-foreground">{c.comment}</p>}
                  {c.improve && c.score < 5 && <p className="mt-0.5 text-xs font-semibold lab-ink">↗ {c.improve}</p>}
                </div>
              ))}
            </div>
          </Section>

          {ev.factual_issues.length > 0 && (
            <Section title="Corrections: what to fix" tone="border-rose-300 bg-rose-50/60 dark:border-rose-500/40 dark:bg-rose-500/10">
              <ul className="space-y-2">
                {ev.factual_issues.map((f, i) => (
                  <li key={i} className="text-sm">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${f.severity === 'major' ? 'bg-rose-600 text-white' : 'bg-rose-200 text-rose-800'}`}>{f.severity}</span>
                    <span className="line-through decoration-rose-400/70">{f.claim}</span>
                    <div className="mt-1 font-semibold text-foreground">✓ {f.correction}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {ev.strengths.length > 0 && (
            <Section title="What you did well" tone="border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <List items={ev.strengths} />
            </Section>
          )}
          {ev.missing.length > 0 && (
            <Section title="Missing">
              <List items={ev.missing} />
            </Section>
          )}
          {ev.improvements.length > 0 && (
            <Section title="How to improve (highest impact first)" tone="mix-border-primary/30 lab-tint">
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground">
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
                <button type="button" onClick={() => onUseExpanded(ev.better_answer)} className="mt-3 rounded-full border-2 mix-border-primary/40 px-3 py-1.5 text-xs font-extrabold lab-ink">
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
          {ev.confidence_notes && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">⚠️ Worth double-checking: {ev.confidence_notes}</p>}
        </div>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return <span className={`h-4 w-4 animate-spin rounded-full border-2 ${dark ? 'border-border border-t-primary' : 'border-current border-t-transparent'}`} />;
}
