'use client';

import Icon from '@/components/ui/AppIcon';
import { DEEPER_ANGLES, DEEPER_LEVELS } from './constants';
import { QuestionMeta, StatusMark, type PathCtx } from './QuestionRow';
import { Collapse, InlineError, ProgressBar, SkeletonLines, Spinner, plural } from './ui';
import { branchStats, childrenOf, hasProgress, progressOf } from './tree';
import type { DeeperLevel, Question } from './types';

type Kind = 'breakdown' | 'deeper';

const COPY: Record<
  Kind,
  { title: string; icon: string; busy: string; flag: string; regen: string }
> = {
  breakdown: {
    title: 'Breakdown',
    icon: 'ArrowDownIcon',
    busy: 'Breaking this question into smaller steps…',
    flag: 'bd',
    regen: 'Replaces the steps you have not started. Steps you started or completed stay.',
  },
  deeper: {
    title: 'Dive deeper',
    icon: 'ArrowUpRightIcon',
    busy: 'Writing deeper questions…',
    flag: 'dp',
    regen: 'Replaces the questions you have not started. Questions you started or completed stay.',
  },
};

function StepButton({
  q,
  ctx,
  index,
  why,
}: {
  q: Question;
  ctx: PathCtx;
  index?: number;
  why?: boolean;
}) {
  const done = progressOf(ctx.state, q.id).completed;
  return (
    <button type="button" onClick={() => ctx.onSelect(q.id)} className="gp-row todo-focus">
      <StatusMark done={done} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium leading-snug text-foreground">
          {index !== undefined && (
            <span className="mr-1.5 tabular-nums text-muted-foreground">{index}.</span>
          )}
          {q.title}
          {done && <span className="sr-only"> (completed)</span>}
        </span>
        {why && q.why && (
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            Why it is needed: {q.why}
          </span>
        )}
        <span className="mt-1 block">
          <QuestionMeta q={q} showLevel={false} />
        </span>
      </span>
      <Icon
        name="ChevronRightIcon"
        size={14}
        className="mt-1 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The Breakdown or Dive Deeper set of the open question, as a panel in its workspace: how many questions, how many are
 * done, Regenerate, and (for a breakdown) the prerequisites the AI found and why each step is needed. It folds and
 * opens in place; nothing here navigates away from the page.
 */
export default function BranchPanel({
  kind,
  question,
  ctx,
}: {
  kind: Kind;
  question: Question;
  ctx: PathCtx;
}) {
  const { state, guided } = ctx;
  const { actions, busy, errors } = guided;
  const copy = COPY[kind];
  const key = `${copy.flag}:${question.id}`;
  const kids = childrenOf(state, question.id, kind);
  const set = kind === 'breakdown' ? question.breakdown : question.deeper;
  const stats = branchStats(state, question.id, kind);
  const open = state.ui.open[key] ?? true;
  const working = !!busy[key];
  const error = errors[key];
  if (!kids.length && !working && !error) return null;
  const canRegenerate = kids.some((k) => !hasProgress(state, k.id)) || kids.length === 0;
  const regenerate = () =>
    void (kind === 'breakdown'
      ? actions.breakdown(question.id, true)
      : actions.dive(question.id, true));
  const bodyId = `gp-panel-${copy.flag}-${question.id}`;

  const levels = ([1, 2, 3, 4, 5] as DeeperLevel[])
    .map((level) => ({ level, items: kids.filter((k) => k.level === level) }))
    .filter((g) => g.items.length);

  return (
    <section className="gp-card p-4 sm:p-[1.25rem]" aria-label={copy.title}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon name={copy.icon} size={15} aria-hidden="true" />
          {copy.title}
        </h3>
        {kids.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {plural(kids.length, 'question')} · <span className="tabular-nums">{stats.done}</span>{' '}
            of <span className="tabular-nums">{stats.total}</span> complete
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={regenerate}
          disabled={working || !canRegenerate}
          title={copy.regen}
          className="todo-btn todo-btn-quiet"
        >
          {working ? <Spinner size={13} /> : <Icon name="ArrowPathIcon" size={14} />}
          Regenerate
        </button>
        {kids.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => actions.setOpen(key, !open)}
            className="todo-btn todo-btn-ghost"
          >
            {open ? 'Hide' : 'Show'}
            <Icon
              name="ChevronDownIcon"
              size={14}
              className={`transition-[transform] duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {kids.length > 0 && (
        <ProgressBar
          value={stats.done}
          max={stats.total}
          label={`${copy.title}: ${stats.done} of ${stats.total} complete`}
          className="mt-3"
        />
      )}

      {error && (
        <div className="mt-3">
          <InlineError
            message={error}
            onRetry={regenerate}
            onDismiss={() => actions.clearError(key)}
          />
        </div>
      )}

      {working && !kids.length && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner size={12} />
            {copy.busy}
          </p>
          <SkeletonLines lines={4} label={copy.busy} />
        </div>
      )}

      <Collapse open={open && kids.length > 0} id={bodyId}>
        <div className="pt-3">
          {kind === 'breakdown' && set && set.prerequisites.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Prerequisites</span>
              {set.prerequisites.map((p) => (
                <span
                  key={p}
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-foreground mix-bg-foreground/[0.06]"
                >
                  {p}
                </span>
              ))}
            </div>
          )}

          {kind === 'breakdown' && (
            <ol className="space-y-0.5" aria-label="Smaller questions, easiest first">
              {kids.map((k, i) => (
                <li key={k.id}>
                  <StepButton q={k} ctx={ctx} index={i + 1} why />
                </li>
              ))}
            </ol>
          )}

          {kind === 'deeper' &&
            levels.map((g) => (
              <div key={g.level} className="mb-2 last:mb-0">
                <p className="dsa-caption px-2.5 pb-0.5 pt-1 text-muted-foreground">
                  Level {g.level} · {DEEPER_LEVELS[g.level]}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((k) => (
                    <li key={k.id}>
                      <StepButton q={k} ctx={ctx} />
                      {k.angle && DEEPER_ANGLES[k.angle] && (
                        <span className="sr-only">Angle: {DEEPER_ANGLES[k.angle]}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {kind === 'breakdown' &&
            kids.length > 0 &&
            stats.done === stats.total &&
            !progressOf(state, question.id).completed && (
              <p className="mt-3 rounded-[12px] p-3 text-sm leading-snug text-foreground mix-bg-success/10">
                Every breakdown question is complete. You can complete this question now.
              </p>
            )}
        </div>
      </Collapse>
    </section>
  );
}
