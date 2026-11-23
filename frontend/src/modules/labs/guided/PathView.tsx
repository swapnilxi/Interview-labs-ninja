'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { confirmDialog } from '@/lib/ui/confirm';
import { MAX_GENERATED_PHASES, PHASE_QUESTIONS, QUESTION_BATCH_SIZES, XP } from './constants';
import ImportPathPanel from './ImportPathPanel';
import { labConfig } from './labs';
import { setPref, usePrefs } from './prefs';
import { QuestionNode, type PathCtx } from './QuestionRow';
import { Collapse, InlineError, ProgressBar, Spinner, plural } from './ui';
import { bossStatus, hasProgress, isDone, phaseStatus, progressOf, visibleInPath } from './tree';
import type { Phase } from './types';

const STATUS_TEXT = {
  locked: '',
  active: 'Active',
  available: '',
  completed: 'Completed',
} as const;

/** How many questions a "Generate questions" / "Add questions" request asks for (five by default). */
function CountPicker({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-9 rounded-[10px] border border-border bg-card px-2 text-xs text-foreground"
      >
        {QUESTION_BATCH_SIZES.map((n) => (
          <option key={n} value={n}>
            {n} questions
          </option>
        ))}
      </select>
    </label>
  );
}

/** A phase with a title and a goal but no questions yet: open like any other, one button writes its questions. */
function PendingStop({ phase, ctx }: { phase: Phase; ctx: PathCtx }) {
  const { guided } = ctx;
  const [count, setCount] = useState<number>(PHASE_QUESTIONS);
  const key = `phase:${phase.id}`;
  const busy = !!guided.busy[key];
  const error = guided.errors[key];
  return (
    <li className="gp-stop" data-status="available">
      <span className="gp-node" aria-hidden="true">
        {phase.number}
      </span>
      <section
        className="gp-card p-4"
        aria-label={`Phase ${phase.number}: ${phase.title}, no questions yet`}
      >
        <p className="text-xs text-muted-foreground">Phase {phase.number} · ready to generate</p>
        <h2 className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{phase.title}</h2>
        {phase.goal && (
          <p className="mt-1 text-xs leading-snug text-muted-foreground">{phase.goal}</p>
        )}
        {error && (
          <div className="mt-3">
            <InlineError
              message={error}
              onRetry={() => void guided.actions.writePhase(phase.id, count)}
              onDismiss={() => guided.actions.clearError(key)}
            />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void guided.actions.writePhase(phase.id, count)}
            disabled={busy}
            className="todo-btn todo-btn-primary"
          >
            {busy ? (
              <Spinner size={14} />
            ) : (
              <Icon name="SparklesIcon" size={15} aria-hidden="true" />
            )}
            {busy ? 'Generating…' : 'Generate questions'}
          </button>
          <CountPicker
            value={count}
            onChange={setCount}
            disabled={busy}
            label={`How many questions for phase ${phase.number}`}
          />
        </div>
      </section>
    </li>
  );
}

/** After the last phase: "Add phase" plans more phases (a title and a goal each); their questions come on demand. */
function AddPhaseStop({ ctx }: { ctx: PathCtx }) {
  const { state, guided } = ctx;
  const [count, setCount] = useState(1);
  if (state.phases.length >= MAX_GENERATED_PHASES) return null;
  const busy = !!guided.busy['phase:new'];
  const error = guided.errors['phase:new'];
  const room = Math.min(3, MAX_GENERATED_PHASES - state.phases.length);
  return (
    <li className="gp-stop" data-status="available">
      <span className="gp-node" aria-hidden="true">
        <Icon name="PlusIcon" size={14} />
      </span>
      <section className="gp-card p-4" aria-label="Add phase">
        <h2 className="text-sm font-semibold leading-snug text-foreground">Want to go further?</h2>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Plan more phases that build on this path. Their questions are generated when you ask for
          them.
        </p>
        {error && (
          <div className="mt-3">
            <InlineError
              message={error}
              onRetry={() => void guided.actions.addPhase(count)}
              onDismiss={() => guided.actions.clearError('phase:new')}
            />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void guided.actions.addPhase(count)}
            disabled={busy}
            className="todo-btn todo-btn-secondary"
          >
            {busy ? <Spinner size={14} /> : <Icon name="PlusIcon" size={15} aria-hidden="true" />}
            {busy ? 'Adding…' : count === 1 ? 'Add phase' : `Add ${count} phases`}
          </button>
          {room > 1 && (
            <select
              value={count}
              disabled={busy}
              onChange={(e) => setCount(Number(e.target.value))}
              aria-label="How many phases to add"
              className="h-9 rounded-[10px] border border-border bg-card px-2 text-xs text-foreground"
            >
              {Array.from({ length: room }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'phase' : 'phases'}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>
    </li>
  );
}

/** One stop of the route: a phase, with its number, title, question count and status; its questions open and fold (only the active phase is open by default). */
function PhaseStop({ phase, ctx }: { phase: Phase; ctx: PathCtx }) {
  if (phase.pending) return <PendingStop phase={phase} ctx={ctx} />;
  return <WrittenPhaseStop phase={phase} ctx={ctx} />;
}

function WrittenPhaseStop({ phase, ctx }: { phase: Phase; ctx: PathCtx }) {
  const { state, guided, selectedId } = ctx;
  const { todoOnly } = usePrefs();
  const [addCount, setAddCount] = useState<number>(PHASE_QUESTIONS);
  const status = phaseStatus(state, phase);
  const flag = state.ui.open[`ph:${phase.id}`];
  const open = flag ?? status === 'active';
  const done = phase.questionIds.filter((id) => isDone(state, id)).length;
  const bodyId = `gp-phase-${phase.id}`;
  const shown = phase.questionIds.filter((id) => visibleInPath(state, id, todoOnly, selectedId));
  // Regenerating replaces only what nobody worked on, so there has to be something to replace
  const canRegenerate = phase.questionIds.some(
    (id) => state.questions[id] && !hasProgress(state, id)
  );
  const regenKey = `phase:${phase.id}`;
  const regenerating = !!guided.busy[regenKey];
  const regenError = guided.errors[regenKey];
  const addKey = `add:${phase.id}`;
  const adding = !!guided.busy[addKey];
  const addError = guided.errors[addKey];

  return (
    <li className="gp-stop" data-status={status}>
      <span className="gp-node" aria-hidden="true">
        {status === 'completed' ? <Icon name="CheckIcon" size={15} /> : phase.number}
      </span>
      <section className="gp-card" aria-label={`Phase ${phase.number}: ${phase.title}`}>
        <h2 className="m-0">
          <button
            type="button"
            className="todo-focus flex min-h-[3.5rem] w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => guided.actions.toggleOpen(`ph:${phase.id}`, status === 'active')}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-snug text-foreground">
                {phase.title}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                {`Phase ${phase.number} · ${plural(phase.questionIds.length, 'question')} · ${done} completed`}
              </span>
            </span>
            <span
              className={`shrink-0 text-xs font-medium ${status === 'completed' ? 'text-success' : status === 'active' ? 'lab-ink' : 'text-muted-foreground'}`}
            >
              {STATUS_TEXT[status]}
            </span>
            <Icon
              name="ChevronDownIcon"
              size={16}
              className={`shrink-0 text-muted-foreground transition-[transform] duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </h2>
        <div className="px-4 pb-1">
          <ProgressBar
            value={done}
            max={phase.questionIds.length}
            label={`Phase ${phase.number}: ${done} of ${phase.questionIds.length} questions completed`}
          />
        </div>
        <Collapse open={open} id={bodyId}>
          <div className="px-2 pb-2 pt-2">
            {phase.goal && (
              <p className="px-2.5 pb-2 text-xs leading-snug text-muted-foreground">{phase.goal}</p>
            )}
            {shown.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                Everything in this phase is done.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {shown.map((id) => (
                  <QuestionNode key={id} id={id} depth={0} ctx={ctx} />
                ))}
              </ul>
            )}
            {regenError && (
              <div className="px-2.5 pt-2">
                <InlineError
                  message={regenError}
                  onRetry={() => void guided.actions.writePhase(phase.id)}
                  onDismiss={() => guided.actions.clearError(regenKey)}
                />
              </div>
            )}
            {addError && (
              <div className="px-2.5 pt-2">
                <InlineError
                  message={addError}
                  onRetry={() => void guided.actions.appendQuestions(phase.id, addCount)}
                  onDismiss={() => guided.actions.clearError(addKey)}
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2">
              <button
                type="button"
                onClick={() => void guided.actions.appendQuestions(phase.id, addCount)}
                disabled={adding}
                className="todo-btn todo-btn-secondary"
              >
                {adding ? (
                  <Spinner size={14} />
                ) : (
                  <Icon name="PlusIcon" size={15} aria-hidden="true" />
                )}
                {adding ? 'Adding…' : 'Add questions'}
              </button>
              <CountPicker
                value={addCount}
                onChange={setAddCount}
                disabled={adding}
                label={`How many questions to add to phase ${phase.number}`}
              />
            </div>
            {canRegenerate && (
              <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => void guided.actions.writePhase(phase.id)}
                  disabled={regenerating}
                  className="todo-btn todo-btn-quiet"
                >
                  {regenerating ? (
                    <Spinner size={14} />
                  ) : (
                    <Icon name="ArrowPathIcon" size={15} aria-hidden="true" />
                  )}
                  {regenerating ? 'Regenerating…' : 'Regenerate phase'}
                </button>
                <span className="text-xs text-muted-foreground">
                  Questions you have worked on stay.
                </span>
              </div>
            )}
          </div>
        </Collapse>
      </section>
    </li>
  );
}

/** The last stop of the route: the final boss, the whole problem as a closing challenge. Open at any time, like every phase. */
function BossStop({ ctx }: { ctx: PathCtx }) {
  const { state, onSelect, selectedId } = ctx;
  const status = bossStatus(state);
  if (status === 'none' || !state.bossId) return null;
  const boss = state.questions[state.bossId];
  const run = progressOf(state, boss.id).lastRun;
  const worth = XP.boss + XP.complete.hard;
  // The boss loses health with every test that passes: all of it before a run, none once defeated.
  const health =
    status === 'completed'
      ? 0
      : run && run.total > 0
        ? Math.round(100 * (1 - run.passed / run.total))
        : 100;

  return (
    <li className="gp-stop" data-status={status === 'completed' ? 'completed' : 'active'}>
      <span className="gp-node" aria-hidden="true">
        <Icon name="TrophyIcon" size={14} />
      </span>
      <section className="gp-card p-4" aria-label="Final boss">
        <p className="text-xs text-muted-foreground">Final boss</p>
        <h2 className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{boss.title}</h2>
        {boss.why && <p className="mt-1 text-xs leading-snug text-muted-foreground">{boss.why}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          {status === 'active' && `${labConfig(state.topic.lab).bossLine} · worth ${worth} XP`}
          {status === 'completed' && <span className="text-success">Defeated</span>}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Boss health</span>
          <div className="gp-bar flex-1" role="img" aria-label={`Boss health ${health} percent`}>
            <span style={{ '--p': `${health}%` } as React.CSSProperties} />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {health}%
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSelect(boss.id)}
          aria-current={selectedId === boss.id ? 'true' : undefined}
          className={`todo-btn mt-3 ${status === 'active' ? 'todo-btn-primary' : 'todo-btn-secondary'}`}
        >
          {status === 'completed' ? 'Review the boss' : 'Face the boss'}
          <Icon name="ArrowRightIcon" size={14} aria-hidden="true" />
        </button>
      </section>
    </li>
  );
}

/** The path: a route of stops (the phases, then the boss), with the switch between every question and only those still to do. */
export default function PathView({ ctx }: { ctx: PathCtx }) {
  const { compact, todoOnly } = usePrefs();
  const { state, guided } = ctx;
  const [menu, setMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const regenerating = !!guided.busy.regenerate;

  const regenerateAll = async () => {
    setMenu(false);
    const ok = await confirmDialog({
      title: 'Write a new path?',
      message:
        'The AI writes a new plan and its first five questions. Your current path, progress, XP and answers on this page are replaced. This cannot be undone.',
      confirmLabel: 'Regenerate',
      tone: 'danger',
    });
    if (ok) void guided.actions.regeneratePath();
  };

  return (
    <div data-compact={compact}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Path</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-expanded={importing}
            title="Add questions from JSON: paste it or upload a .json file"
            disabled={regenerating}
            onClick={() => {
              setMenu(false);
              setImporting((v) => !v);
            }}
            className="todo-btn todo-btn-secondary h-9 px-3 aria-expanded:todo-btn-active"
          >
            <Icon name="ArrowUpTrayIcon" size={15} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Add from JSON</span>
          </button>
          <button
            type="button"
            aria-expanded={menu}
            aria-label="Path options"
            title="Path options"
            disabled={regenerating}
            onClick={() => setMenu((v) => !v)}
            className="todo-btn todo-btn-quiet h-9 w-9 px-0 aria-expanded:todo-btn-active"
          >
            <Icon name="EllipsisHorizontalIcon" size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={compact}
            aria-label="Compact rows"
            title="Compact rows"
            onClick={() => setPref('compact', !compact)}
            className="todo-btn todo-btn-quiet h-9 w-9 px-0 aria-pressed:todo-btn-active"
          >
            <Icon name="QueueListIcon" size={16} aria-hidden="true" />
          </button>
          <div className="todo-segmented" role="group" aria-label="Which questions to show">
            <button
              type="button"
              aria-pressed={!todoOnly}
              onClick={() => setPref('todoOnly', false)}
              className="todo-segment todo-focus px-3 py-1.5 text-xs font-medium"
            >
              All
            </button>
            <button
              type="button"
              aria-pressed={todoOnly}
              onClick={() => setPref('todoOnly', true)}
              className="todo-segment todo-focus px-3 py-1.5 text-xs font-medium"
            >
              To do
            </button>
          </div>
        </div>
      </div>
      {menu && (
        <div
          className="gp-card mb-3 flex flex-wrap gap-2 p-3"
          role="group"
          aria-label="Path options"
        >
          <button
            type="button"
            onClick={() => void regenerateAll()}
            className="todo-btn todo-btn-secondary"
          >
            <Icon name="ArrowPathIcon" size={15} aria-hidden="true" />
            Regenerate path
          </button>
        </div>
      )}
      {importing && (
        <div className="mb-3">
          <ImportPathPanel
            existing
            topicName={state.topic.subName || state.topic.name}
            focus={state.focus}
            onImport={(path, mode) => {
              guided.actions.importPath(path, state.focus, mode);
              setImporting(false);
            }}
            onClose={() => setImporting(false)}
          />
        </div>
      )}
      {regenerating && (
        <p
          role="status"
          className="gp-card mb-3 flex items-center gap-2 p-3 text-sm text-muted-foreground"
        >
          <Spinner size={14} />
          {guided.stage || 'Writing a new path…'}
        </p>
      )}
      {guided.errors.regenerate && (
        <div className="mb-3">
          <InlineError
            message={guided.errors.regenerate}
            onRetry={() => void guided.actions.regeneratePath()}
            onDismiss={() => guided.actions.clearError('regenerate')}
          />
        </div>
      )}
      <ol className="gp-route">
        {state.phases.map((phase) => (
          <PhaseStop key={phase.id} phase={phase} ctx={ctx} />
        ))}
        <AddPhaseStop ctx={ctx} />
        <BossStop ctx={ctx} />
      </ol>
    </div>
  );
}
