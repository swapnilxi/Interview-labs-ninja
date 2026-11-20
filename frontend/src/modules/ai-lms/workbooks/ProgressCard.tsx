'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import ConfirmDialog from '../components/ConfirmDialog';
import { continueSection, workbookStats } from './progress';
import SaveIndicator from './SaveIndicator';
import type { WorkbookProgress } from './useWorkbookProgress';
import type { WorkbookContent } from './types';

/** The learner's own progress on the overview: how far, where to continue, and resetting it (after a confirm). */
export default function ProgressCard({
  content,
  progress,
  onOpen,
}: {
  content: WorkbookContent;
  progress: WorkbookProgress;
  onOpen: (sectionId: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { state, started } = progress;
  const stats = workbookStats(content, state);
  const target = continueSection(content, state);
  const complete = stats.total > 0 && stats.done === stats.total;

  if (progress.loadError) {
    return (
      <section className="wb-card p-5 text-sm" role="alert">
        <p className="text-destructive">{progress.loadError}</p>
        <button type="button" className="wb-btn wb-btn-sm mt-3" onClick={() => progress.reload()}>
          Try again
        </button>
      </section>
    );
  }
  if (!state) return <div className="wb-card h-[7rem] animate-pulse" aria-busy="true" />;

  const action = !stats.done ? 'Start' : complete ? 'Review' : 'Continue';

  return (
    <section className="wb-card space-y-4 p-5 sm:p-[1.5rem]" aria-labelledby="wb-progress-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="wb-progress-title" className="text-base font-semibold text-foreground">
            {complete ? 'Workbook complete' : 'Your progress'}
          </h2>
          <p className="wb-hint mt-0.5">
            {stats.done} of {stats.total} activities done · {stats.percent}%
          </p>
        </div>
        <SaveIndicator progress={progress} />
      </div>
      <div
        className="wb-progress"
        role="progressbar"
        aria-label="Your progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stats.percent}
      >
        <span style={{ width: `${stats.percent}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {target && (
          <button type="button" className="wb-btn wb-btn-primary" onClick={() => onOpen(target.id)}>
            {action}
            <span className="max-w-[16rem] truncate font-normal">: {target.title}</span>
            <Icon name="ArrowRightIcon" size={16} />
          </button>
        )}
        {started && (
          <button
            type="button"
            className="wb-btn wb-btn-sm wb-btn-danger"
            onClick={() => setConfirm(true)}
          >
            <Icon name="ArrowUturnLeftIcon" size={14} />
            Reset my progress
          </button>
        )}
      </div>
      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        isOpen={confirm}
        title="Reset your progress"
        message="Your answers, ticks, trackers and quiz results in this workbook are deleted and you start again. Nobody else's progress changes. This can't be undone."
        confirmLabel="Reset my progress"
        isDestructive
        onConfirm={async () => {
          setConfirm(false);
          setError(null);
          try {
            await progress.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Your progress was not reset.');
          }
        }}
        onCancel={() => setConfirm(false)}
      />
    </section>
  );
}
