'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { labConfig } from './labs';
import { InlineError, Spinner } from './ui';
import type { TopicRef } from './types';

/**
 * Shown before the learner has a path for this problem. One action: have the AI write it. Nothing is generated until they
 * ask, and once it is written it is saved to their account and never rewritten on a page load.
 */
export default function StartScreen({
  topic,
  busy,
  error,
  onGenerate,
  onClearError,
}: {
  topic: TopicRef;
  busy: boolean;
  error: string | undefined;
  onGenerate: (focus: string) => void;
  onClearError: () => void;
}) {
  const [focus, setFocus] = useState('');
  const name = topic.subName || topic.name;

  return (
    <section
      className="gp-enter gp-card mx-auto max-w-xl p-5 sm:p-[2rem]"
      aria-labelledby="gp-start-title"
    >
      <h2
        id="gp-start-title"
        className="text-xl font-semibold leading-snug tracking-tight text-foreground"
      >
        A guided path for {name}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {labConfig(topic.lab).intro}
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="font-medium text-foreground">Learn at your own depth</dt>
          <dd className="mt-0.5 text-muted-foreground">
            Break any question into smaller steps, or dive deeper when it feels easy.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Two ways to learn</dt>
          <dd className="mt-0.5 text-muted-foreground">
            Work it out with the tutor, or read a structured answer in the STAR format straight
            away.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Progress you keep</dt>
          <dd className="mt-0.5 text-muted-foreground">
            XP, levels, a coding streak and achievements, saved separately for each problem.
          </dd>
        </div>
      </dl>

      <label htmlFor="gp-focus" className="mt-[1.5rem] block text-sm font-medium text-foreground">
        Focus <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <textarea
        id="gp-focus"
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
        rows={2}
        maxLength={600}
        placeholder="For example: I struggle with pointer problems"
        className="todo-input todo-input-quiet mt-1.5 w-full resize-y px-3 py-2 text-[16px] sm:text-sm"
      />

      {error && (
        <div className="mt-4">
          <InlineError message={error} onRetry={() => onGenerate(focus)} onDismiss={onClearError} />
          {/No API key/i.test(error) && (
            <p className="mt-2 text-xs text-muted-foreground">
              Add a key on the{' '}
              <Link href="/config" className="lab-ink font-medium underline underline-offset-2">
                Config page
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onGenerate(focus)}
          disabled={busy}
          className="todo-btn todo-btn-primary h-11 px-5"
        >
          {busy ? <Spinner size={14} /> : <Icon name="SparklesIcon" size={15} aria-hidden="true" />}
          {busy ? 'Writing your path…' : 'Generate my path'}
        </button>
        <p className="text-xs text-muted-foreground">
          Uses the AI model chosen in Config. Takes about half a minute.
        </p>
      </div>
    </section>
  );
}
