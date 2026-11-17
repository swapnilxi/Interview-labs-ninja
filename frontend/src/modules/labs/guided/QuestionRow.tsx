'use client';

import Icon from '@/components/ui/AppIcon';
import { difficultyDotClass } from '@/modules/labs/common/LabTags';
import { DEEPER_LEVELS } from './constants';
import { InlineError, Collapse, Spinner } from './ui';
import { usePrefs } from './prefs';
import { branchStats, canGrow, childrenOf, progressOf, visibleInPath } from './tree';
import type { Guided } from './useGuided';
import type { DeeperLevel, GuidedState, Question } from './types';

/** What every row of the path needs. */
export interface PathCtx {
  state: GuidedState;
  guided: Guided;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function StatusMark({ done }: { done: boolean }) {
  return done ? (
    <Icon
      name="CheckCircleIcon"
      variant="solid"
      size={16}
      className="mt-0.5 shrink-0 text-success"
      aria-hidden="true"
    />
  ) : (
    <span
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 mix-border-foreground/30"
    />
  );
}

/** Difficulty dot, effort and (when there is one) the coding exercise: the quiet line under a title. */
export function QuestionMeta({ q, showLevel = true }: { q: Question; showLevel?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${difficultyDotClass(q.difficulty)}`}
        />
        {sentence(q.difficulty)}
      </span>
      <span>{q.effort}</span>
      {(q.wantsExercise || q.content?.exercise) && <span>Coding exercise</span>}
      {showLevel && q.relation === 'deeper' && q.level && <span>Level {q.level}</span>}
    </span>
  );
}

/**
 * One question of the path, with its two compact actions and, nested beneath it, the questions they produced: Breakdown
 * steps (which can be broken down again, without limit but MAX_DEPTH) and Dive Deeper follow-ups, grouped by level. Pressing
 * an action for the first time asks the AI; after that it opens and folds the nested list.
 */
export function QuestionNode({ id, depth, ctx }: { id: string; depth: number; ctx: PathCtx }) {
  const { state, guided, selectedId, onSelect } = ctx;
  const { todoOnly } = usePrefs();
  const q = state.questions[id];
  if (!q) return null;
  // "To do" hides what is finished (with everything beneath it), unless the learner has it open.
  if (!visibleInPath(state, id, todoOnly, selectedId)) return null;
  const done = progressOf(state, id).completed;
  const steps = childrenOf(state, id, 'breakdown');
  const deeper = childrenOf(state, id, 'deeper');
  const stepStats = branchStats(state, id, 'breakdown');
  const deeperStats = branchStats(state, id, 'deeper');
  const stepsOpen = !!state.ui.open[`bd:${id}`] && steps.length > 0;
  const deeperOpen = !!state.ui.open[`dp:${id}`] && deeper.length > 0;
  const stepsKey = `bd:${id}`;
  const deeperKey = `dp:${id}`;
  const grow = canGrow(state, id);
  const { busy, errors, actions } = guided;

  const pressBreakdown = () =>
    steps.length ? actions.toggleOpen(stepsKey) : void actions.breakdown(id);
  const pressDeeper = () => (deeper.length ? actions.toggleOpen(deeperKey) : void actions.dive(id));
  const tooSmall = 'This step is already as small as it gets';

  const levels = ([1, 2, 3, 4, 5] as DeeperLevel[])
    .map((level) => ({ level, items: deeper.filter((d) => d.level === level) }))
    .filter((g) => g.items.length);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(id)}
        aria-current={selectedId === id ? 'true' : undefined}
        className="gp-row todo-focus"
      >
        <StatusMark done={done} />
        <span className="min-w-0 flex-1">
          <span
            className={`gp-row-title block break-words leading-snug text-foreground ${depth === 0 ? 'text-sm font-medium' : 'text-[13px]'}`}
          >
            {q.title}
            {done && <span className="sr-only"> (completed)</span>}
          </span>
          {q.relation === 'breakdown' && q.why && (
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              Needed because {lowerFirst(q.why).replace(/\.$/, '')}
            </span>
          )}
          <span className="mt-1 block">
            <QuestionMeta q={q} showLevel={false} />
          </span>
        </span>
      </button>

      <div className="gp-actions ml-[2.25rem] flex flex-wrap items-center gap-1 pb-1">
        <button
          type="button"
          className="gp-act todo-focus"
          aria-expanded={stepsOpen}
          disabled={!!busy[stepsKey] || (!steps.length && !grow)}
          title={
            !steps.length && !grow
              ? tooSmall
              : steps.length
                ? 'Show or hide the smaller questions'
                : 'Break this question into smaller steps'
          }
          onClick={pressBreakdown}
        >
          {busy[stepsKey] ? <Spinner size={12} /> : <Icon name="ArrowDownIcon" size={14} />}
          Breakdown
          {steps.length > 0 && (
            <span className="tabular-nums opacity-80">
              {stepStats.done}/{stepStats.total}
            </span>
          )}
        </button>
        <button
          type="button"
          className="gp-act todo-focus"
          aria-expanded={deeperOpen}
          disabled={!!busy[deeperKey] || (!deeper.length && !grow)}
          title={
            !deeper.length && !grow
              ? tooSmall
              : deeper.length
                ? 'Show or hide the deeper questions'
                : 'Go deeper on this question'
          }
          onClick={pressDeeper}
        >
          {busy[deeperKey] ? <Spinner size={12} /> : <Icon name="ArrowUpRightIcon" size={14} />}
          Dive deeper
          {deeper.length > 0 && (
            <span className="tabular-nums opacity-80">
              {deeperStats.done}/{deeperStats.total}
            </span>
          )}
        </button>
      </div>

      {(errors[stepsKey] || errors[deeperKey]) && (
        <div className="ml-[2.25rem] space-y-1.5 pb-2 pr-1">
          {errors[stepsKey] && (
            <InlineError
              message={errors[stepsKey]}
              onRetry={() => void actions.breakdown(id)}
              onDismiss={() => actions.clearError(stepsKey)}
            />
          )}
          {errors[deeperKey] && (
            <InlineError
              message={errors[deeperKey]}
              onRetry={() => void actions.dive(id)}
              onDismiss={() => actions.clearError(deeperKey)}
            />
          )}
        </div>
      )}

      <Collapse open={stepsOpen}>
        <ul className="gp-branch space-y-0.5 pb-1" aria-label={`Smaller questions of: ${q.title}`}>
          {steps.map((c) => (
            <QuestionNode key={c.id} id={c.id} depth={depth + 1} ctx={ctx} />
          ))}
        </ul>
      </Collapse>

      <Collapse open={deeperOpen}>
        <div className="gp-branch pb-1" aria-label={`Deeper questions of: ${q.title}`}>
          {levels.map((g) => (
            <div key={g.level}>
              <p className="dsa-caption px-2.5 pb-0.5 pt-2 text-muted-foreground">
                Level {g.level} · {DEEPER_LEVELS[g.level]}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((c) => (
                  <QuestionNode key={c.id} id={c.id} depth={depth + 1} ctx={ctx} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Collapse>
    </li>
  );
}
