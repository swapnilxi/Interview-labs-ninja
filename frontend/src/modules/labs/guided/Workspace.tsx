'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Markdown from '@/modules/labs/common/Markdown';
import { DifficultyTag } from '@/modules/labs/common/LabTags';
import BranchPanel from './BranchPanels';
import { DEEPER_LEVELS, XP } from './constants';
import ExercisePanel from './ExercisePanel';
import HelpPanel from './HelpPanel';
import { highlightFence } from './highlight';
import { usePrefs } from './prefs';
import type { PathCtx } from './QuestionRow';
import StarPanel from './StarPanel';
import TutorPanel from './TutorPanel';
import { Collapse, InlineError, SkeletonLines, Spinner, Tag } from './ui';
import {
  branchStats,
  canGrow,
  childrenOf,
  completionGate,
  nextQuestionId,
  phaseOfQuestion,
  progressOf,
} from './tree';

/** What completing this question would still pay (what was already paid is not counted again). */
function worthOf(ctx: PathCtx, id: string): number {
  const { state } = ctx;
  const q = state.questions[id];
  const ledger = state.player.ledger;
  let worth = 0;
  if (!(`complete:${id}` in ledger)) worth += XP.complete[q.difficulty];
  if (q.relation === 'deeper' && !(`explore:${id}` in ledger)) worth += XP.explore;
  if (q.relation === 'boss' && !('boss' in ledger)) worth += XP.boss;
  if (
    q.content?.exercise?.gradable !== false &&
    (q.wantsExercise || q.content?.exercise) &&
    !(`code:${id}` in ledger)
  )
    worth += XP.code;
  return worth;
}

function Completion({ ctx, id, showPop = false }: { ctx: PathCtx; id: string; showPop?: boolean }) {
  const { state, guided } = ctx;
  const { game } = usePrefs();
  const q = state.questions[id];
  const progress = progressOf(state, id);
  const gate = completionGate(state, id);
  const steps = branchStats(state, id, 'breakdown');
  const ready =
    gate.ok &&
    (progress.codingDone ||
      progress.tutor.understood ||
      (steps.total > 0 && steps.done === steps.total));
  const worth = worthOf(ctx, id);

  // "+15 XP" rises from the control once, the moment a question flips to completed.
  const wasDone = useRef(progress.completed);
  const [pop, setPop] = useState<number | null>(null);
  const ledger = state.player.ledger;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!wasDone.current && progress.completed && game && showPop) {
      const paid =
        (ledger[`complete:${id}`] ?? 0) +
        (ledger[`code:${id}`] ?? 0) +
        (ledger[`explore:${id}`] ?? 0);
      if (paid > 0) {
        setPop(paid);
        timer = setTimeout(() => setPop(null), 1700);
      }
    }
    wasDone.current = progress.completed;
    return () => clearTimeout(timer);
  }, [progress.completed, game, showPop, id, ledger]);

  if (progress.completed) {
    return (
      <div className="relative flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <svg
            className="gp-check"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Completed
        </span>
        <button
          type="button"
          onClick={() => guided.actions.uncomplete(id)}
          className="todo-btn todo-btn-ghost"
        >
          Undo
        </button>
        {pop !== null && (
          <span
            aria-hidden="true"
            className="gp-xp-pop lab-tint lab-ink pointer-events-none absolute -top-7 left-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
          >
            +{pop} XP
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => guided.actions.complete(id)}
          disabled={!gate.ok}
          className={`todo-btn ${ready ? 'todo-btn-primary' : 'todo-btn-secondary'}`}
        >
          <Icon name="CheckIcon" size={14} />
          Mark as completed
        </button>
        {game && worth > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">Worth up to {worth} XP</span>
        )}
      </div>
      {!gate.ok && (
        <p className="mt-2 max-w-prose text-xs leading-snug text-muted-foreground">{gate.reason}</p>
      )}
      {q.relation === 'boss' && gate.ok && (
        <p className="mt-2 text-xs text-muted-foreground">
          Passing every test defeats the boss on its own.
        </p>
      )}
    </div>
  );
}

/**
 * The learning workspace of one question: the question and its objective, the two ways to learn it (AI Tutor, Answer in STAR)
 * and the two ways to adjust it (Breakdown, Dive Deeper), the lesson, the coding exercise and its tests, hints and the
 * solution on request, and the completion control. The tutor and the STAR answer open inline under the question.
 */
export default function Workspace({
  ctx,
  id,
  onBackToPath,
}: {
  ctx: PathCtx;
  id: string;
  onBackToPath?: () => void;
}) {
  const { state, guided, onSelect } = ctx;
  const { actions, busy, errors, runs } = guided;
  const q = state.questions[id];
  const lessonKey = `lesson:${id}`;
  const hasLesson = !!q?.content;
  const lessonBusy = !!busy[lessonKey];
  const lessonError = errors[lessonKey];

  // Opening a question writes its lesson (once; a saved one is never rewritten on a page load).
  useEffect(() => {
    if (q && !hasLesson && !lessonBusy && !lessonError) void actions.lesson(id);
  }, [q, id, hasLesson, lessonBusy, lessonError, actions]);

  if (!q) return null;
  const progress = progressOf(state, id);
  const phase = phaseOfQuestion(state, id);
  const parent = q.parentId ? state.questions[q.parentId] : null;
  const content = q.content;
  const exercise = content?.exercise ?? null;
  const gate = completionGate(state, id);
  const steps = childrenOf(state, id, 'breakdown');
  const deeper = childrenOf(state, id, 'deeper');
  const stepsKey = `bd:${id}`;
  const deeperKey = `dp:${id}`;
  const grow = canGrow(state, id);
  const next = nextQuestionId(state, id);
  const nextQ = next ? state.questions[next] : null;
  const mode = progress.mode;
  const lessonOpen = state.ui.open[`ls:${id}`] ?? true;
  const canExplainMistake =
    (progress.code !== null && progress.code !== exercise?.starterCode) || !!progress.lastRun;

  const breadcrumb =
    q.relation === 'boss'
      ? 'Final boss'
      : q.relation === 'breakdown'
        ? `Breakdown step${phase ? ` · Phase ${phase.number}` : ''}`
        : q.relation === 'deeper'
          ? `Dive deeper · Level ${q.level ?? 2} · ${DEEPER_LEVELS[q.level ?? 2]}`
          : phase
            ? `Phase ${phase.number} · ${phase.title}`
            : '';

  const toggleBranch = (kind: 'breakdown' | 'deeper') => {
    const key = kind === 'breakdown' ? stepsKey : deeperKey;
    const kids = kind === 'breakdown' ? steps : deeper;
    if (!kids.length) {
      void (kind === 'breakdown' ? actions.breakdown(id) : actions.dive(id));
      return;
    }
    // Panels default to open; pressing the action while one is open folds it.
    actions.setOpen(key, !(state.ui.open[key] ?? true));
  };

  return (
    <div className="gp-enter space-y-4" key={id}>
      <header className="gp-card p-4 sm:p-[1.25rem]">
        {onBackToPath && (
          <button
            type="button"
            onClick={onBackToPath}
            className="todo-btn todo-btn-ghost -ml-2 mb-2 lg:hidden"
          >
            <Icon name="ArrowLeftIcon" size={14} />
            Path
          </button>
        )}
        <p className="text-xs text-muted-foreground">{breadcrumb}</p>
        {parent && (
          <button
            type="button"
            onClick={() => onSelect(parent.id)}
            className="todo-focus mt-1 inline-flex max-w-full items-start gap-1 rounded text-left text-xs font-medium lab-ink hover:underline"
          >
            <Icon
              name="ArrowUturnLeftIcon"
              size={12}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span className="min-w-0 break-words">
              Return to the parent question: {parent.title}
            </span>
          </button>
        )}
        <h2 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-foreground">
          {q.title}
        </h2>

        {q.objective && (
          <div className="mt-3">
            <p className="dsa-caption text-muted-foreground">Learning objective</p>
            <p className="mt-0.5 text-sm leading-relaxed text-foreground">{q.objective}</p>
          </div>
        )}
        {q.relation === 'breakdown' && q.why && (
          <div className="mt-3">
            <p className="dsa-caption text-muted-foreground">Why this step matters</p>
            <p className="mt-0.5 text-sm leading-relaxed text-foreground">{q.why}</p>
          </div>
        )}
        {q.relation === 'boss' && q.why && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{q.why}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <DifficultyTag
            difficulty={q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
          />
          <Tag>{q.effort}</Tag>
          <Tag>{q.kind.charAt(0).toUpperCase() + q.kind.slice(1)}</Tag>
          {(q.wantsExercise || exercise) && <Tag tone="accent">Coding exercise</Tag>}
        </div>

        <div className="mt-4 border-t pt-4">
          <Completion ctx={ctx} id={id} showPop />
        </div>
      </header>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
        aria-label="Ways to work on this question"
        role="group"
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="Learning mode">
          <button
            type="button"
            className="gp-mode todo-focus"
            aria-pressed={mode === 'tutor'}
            aria-keyshortcuts="T"
            title="Learn it with a tutor (T)"
            onClick={() => actions.setMode(id, mode === 'tutor' ? null : 'tutor')}
          >
            <Icon name="SparklesIcon" size={15} aria-hidden="true" />
            AI Tutor
            <kbd className="gp-key ml-0.5 hidden lg:inline-flex">T</kbd>
          </button>
          <button
            type="button"
            className="gp-mode todo-focus"
            aria-pressed={mode === 'star'}
            aria-keyshortcuts="S"
            title="A structured reference answer (S)"
            onClick={() => actions.setMode(id, mode === 'star' ? null : 'star')}
          >
            <Icon name="StarIcon" size={15} aria-hidden="true" />
            Answer in STAR
            <kbd className="gp-key ml-0.5 hidden lg:inline-flex">S</kbd>
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Adjust the question">
          <button
            type="button"
            className="gp-act todo-focus border"
            aria-expanded={steps.length > 0 && (state.ui.open[stepsKey] ?? true)}
            disabled={!!busy[stepsKey] || (!steps.length && !grow)}
            title={
              !steps.length && !grow
                ? 'This step is already as small as it gets'
                : 'I do not understand this yet. Make it simpler.'
            }
            onClick={() => toggleBranch('breakdown')}
          >
            {busy[stepsKey] ? <Spinner size={12} /> : <Icon name="ArrowDownIcon" size={14} />}
            Breakdown
            {steps.length > 0 ? (
              <span className="tabular-nums opacity-80">{steps.length}</span>
            ) : (
              <kbd className="gp-key hidden lg:inline-flex">B</kbd>
            )}
          </button>
          <button
            type="button"
            className="gp-act todo-focus border"
            aria-expanded={deeper.length > 0 && (state.ui.open[deeperKey] ?? true)}
            disabled={!!busy[deeperKey] || (!deeper.length && !grow)}
            title={
              !deeper.length && !grow
                ? 'This step is already as small as it gets'
                : 'I understand this. Challenge me further.'
            }
            onClick={() => toggleBranch('deeper')}
          >
            {busy[deeperKey] ? <Spinner size={12} /> : <Icon name="ArrowUpRightIcon" size={14} />}
            Dive deeper
            {deeper.length > 0 ? (
              <span className="tabular-nums opacity-80">{deeper.length}</span>
            ) : (
              <kbd className="gp-key hidden lg:inline-flex">D</kbd>
            )}
          </button>
        </div>
      </div>

      {mode === 'tutor' && (
        <TutorPanel
          question={q}
          progress={progress}
          busy={!!busy[`tutor:${id}`]}
          error={errors[`tutor:${id}`]}
          canExplainMistake={canExplainMistake}
          completeBlocked={gate.ok ? '' : gate.reason}
          onSend={(action, message) => void actions.tutorSend(id, action, message)}
          onRetry={() => actions.tutorRetry(id)}
          onClearError={() => actions.clearError(`tutor:${id}`)}
          onComplete={() => actions.completeViaTutor(id)}
        />
      )}
      {mode === 'star' && (
        <StarPanel
          question={q}
          progress={progress}
          busy={!!busy[`star:${id}`]}
          error={errors[`star:${id}`]}
          onRun={(variant) => void actions.starRun(id, variant)}
          onSelect={(versionId) => actions.starSelect(id, versionId)}
          onHide={(hidden) => actions.starHide(id, hidden)}
          onAskTutor={() => {
            actions.setMode(id, 'tutor', { autoStart: false });
            void actions.tutorSend(id, 'star');
          }}
          onClearError={() => actions.clearError(`star:${id}`)}
        />
      )}

      <BranchPanel kind="breakdown" question={q} ctx={ctx} />
      <BranchPanel kind="deeper" question={q} ctx={ctx} />

      <section className="gp-card p-4 sm:p-[1.25rem]" aria-label="Lesson">
        {content ? (
          <>
            <button
              type="button"
              aria-expanded={lessonOpen}
              aria-controls={`gp-lesson-${id}`}
              onClick={() => actions.setOpen(`ls:${id}`, !lessonOpen)}
              className="todo-focus -m-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-3 rounded-[10px] p-1 text-left"
            >
              <span className="text-sm font-semibold text-foreground">Lesson</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {lessonOpen ? 'Hide' : 'Show'}
                <Icon
                  name="ChevronDownIcon"
                  size={14}
                  className={`transition-[transform] duration-200 ${lessonOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </span>
            </button>
            <Collapse open={lessonOpen} id={`gp-lesson-${id}`}>
              <div className="space-y-5 pt-3">
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Explanation</h3>
                  <Markdown
                    content={content.explanation}
                    highlight={highlightFence}
                    className="text-sm"
                  />
                </div>
                {content.example && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                      Practical example
                    </h3>
                    <Markdown
                      content={content.example}
                      highlight={highlightFence}
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            </Collapse>
          </>
        ) : lessonError ? (
          <InlineError
            message={lessonError}
            onRetry={() => void actions.lesson(id)}
            onDismiss={() => actions.clearError(lessonKey)}
          />
        ) : (
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size={14} />
              Writing this lesson…
            </p>
            <SkeletonLines lines={5} label="Writing this lesson" />
          </div>
        )}
      </section>

      {exercise && (
        <ExercisePanel
          question={q}
          progress={progress}
          exercise={exercise}
          result={runs[id]}
          running={!!busy[`run:${id}`]}
          error={errors[`run:${id}`]}
          onCode={(code) => actions.setCode(id, code)}
          onRun={() => void actions.test(id)}
          onClearError={() => actions.clearError(`run:${id}`)}
        />
      )}

      <HelpPanel
        question={q}
        progress={progress}
        onHint={() => actions.takeHint(id)}
        onExplain={() => {
          actions.setMode(id, 'tutor', { autoStart: false });
          void actions.tutorSend(id, 'simplify');
        }}
        onReveal={() => actions.revealSolution(id)}
      />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Completion ctx={ctx} id={id} />
        {nextQ && (
          <button
            type="button"
            onClick={() => onSelect(nextQ.id)}
            className="todo-btn todo-btn-quiet max-w-full !whitespace-normal text-left"
          >
            <span className="min-w-0 break-words">Next: {nextQ.title}</span>
            <Icon name="ArrowRightIcon" size={14} className="shrink-0" />
          </button>
        )}
      </footer>
    </div>
  );
}
