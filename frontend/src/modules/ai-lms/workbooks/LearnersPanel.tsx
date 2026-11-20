'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import ConfirmDialog from '../components/ConfirmDialog';
import { workbookService } from './workbookService';
import type { LearnerRow } from './types';

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Instructors only, class workbooks only: who has started it, how far they are and when they last worked in it.
 * Never their answers (the server does not send them). One learner's progress can be reset, after a confirm.
 */
export default function LearnersPanel({ workbookId }: { workbookId: string }) {
  const [rows, setRows] = useState<LearnerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<LearnerRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await workbookService.listLearners(workbookId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The learners could not be loaded.');
    }
  }, [workbookId]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = async (row: LearnerRow) => {
    setTarget(null);
    setBusy(true);
    setError(null);
    try {
      await workbookService.resetLearner(workbookId, row.user_id);
      setRows((prev) => (prev ? prev.filter((r) => r.user_id !== row.user_id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The progress was not reset.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="wb-card space-y-4 p-5 sm:p-[1.5rem]" aria-labelledby="wb-learners">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="wb-learners" className="text-base font-semibold text-foreground">
            Learners
          </h2>
          <p className="wb-hint mt-0.5">
            How far each learner is. Their answers stay private, even to you.
          </p>
        </div>
        <button type="button" className="wb-btn wb-btn-sm" onClick={load} disabled={busy}>
          <Icon name="ArrowPathIcon" size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
      {!rows && !error && <div className="h-[4rem] animate-pulse rounded-xl bg-muted" />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nobody has started this workbook yet.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1 basis-[12rem]">
                <p className="break-words text-sm font-medium text-foreground">{row.name}</p>
                <p className="wb-hint">
                  Last opened {when(row.last_accessed_at)} · started {when(row.started_at)}
                </p>
              </div>
              <div className="flex min-w-[9rem] flex-1 items-center gap-2">
                <div className="wb-progress flex-1" aria-hidden="true">
                  <span style={{ width: `${row.percent}%` }} />
                </div>
                <span className="wb-hint w-[2.5rem] text-right">{row.percent}%</span>
              </div>
              <button
                type="button"
                className="wb-btn wb-btn-sm wb-btn-danger"
                disabled={busy}
                onClick={() => setTarget(row)}
              >
                Reset
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={!!target}
        title="Reset this learner's progress"
        message={
          target
            ? `Reset ${target.name}'s progress? Their answers, ticks and quiz results in this workbook are deleted and they start again. Other learners are not affected. This can't be undone.`
            : ''
        }
        confirmLabel="Reset progress"
        isDestructive
        onConfirm={() => target && reset(target)}
        onCancel={() => setTarget(null)}
      />
    </section>
  );
}
