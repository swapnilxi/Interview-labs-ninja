'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import ImportPathPanel from './ImportPathPanel';
import { FormatHelp, FormatHelpButton } from './JsonFormatHelp';
import type { ImportedPath } from './importPath';
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
  stage,
  error,
  onGenerate,
  onImport,
  onClearError,
}: {
  topic: TopicRef;
  busy: boolean;
  /** What the path being written is doing now ("Planning the path…"). */
  stage?: string;
  error: string | undefined;
  onGenerate: (focus: string) => void;
  /** A path pasted as JSON instead of written by the AI. */
  onImport: (path: ImportedPath, focus: string) => void;
  onClearError: () => void;
}) {
  const [focus, setFocus] = useState('');
  const [importing, setImporting] = useState(false);
  const [help, setHelp] = useState(false);
  const helpId = useId();
  const name = topic.subName || topic.name;
  const cfg = labConfig(topic.lab);

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
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cfg.intro}</p>

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
            {cfg.progressLine}, saved separately for each {cfg.noun}.
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
        placeholder={`For example: ${cfg.focusExample}`}
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
          {busy ? stage || 'Writing your path…' : 'Generate my path'}
        </button>
        <button
          type="button"
          onClick={() => setImporting((v) => !v)}
          disabled={busy}
          aria-expanded={importing}
          className="todo-btn todo-btn-secondary h-11 px-5"
        >
          <Icon name="ArrowUpTrayIcon" size={15} aria-hidden="true" />
          Import from JSON
        </button>
        <FormatHelpButton open={help} onToggle={() => setHelp((v) => !v)} controlsId={helpId} />
        <p className="text-xs text-muted-foreground">
          Generating uses the AI model chosen in Config: a plan, then your first five questions
          (about 20 seconds). You can ask for more later. Importing needs no AI.
        </p>
      </div>

      {help && <FormatHelp id={helpId} existing={false} />}

      {importing && !busy && (
        <ImportPathPanel
          topicName={name}
          focus={focus}
          onImport={(path) => onImport(path, focus)}
          onClose={() => setImporting(false)}
        />
      )}
    </section>
  );
}
