'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import AiError from '@/modules/labs/common/AiError';
import ConfirmDialog from '../components/ConfirmDialog';
import ChapterPreview from './ChapterPreview';
import { sectionStats, type ProgressState, type Stats } from './progress';
import { workbookService } from './workbookService';
import type { WorkbookDetail, WorkbookSection } from './types';

interface Run {
  /** What is being written right now, for the status line, and which chapter (none while planning). */
  label: string;
  sectionId?: string;
  done: number;
  total: number;
}

/**
 * The workbook's chapters, and (for whoever may edit it) generating them. Generation is two steps the server keeps
 * apart so no answer gets cut off: plan the chapters (one AI call), then write them one at a time (one call each).
 * This component walks the unwritten chapters in order; it can stop after any chapter and pick up later, because each
 * written chapter is saved as it arrives.
 */
export default function ChaptersPanel({
  workbook,
  onChange,
  learnerState,
  onOpen,
}: {
  workbook: WorkbookDetail;
  onChange: (next: WorkbookDetail) => void;
  /** The viewer's own progress, for each chapter's "3 of 9 done" (null while loading or when not in use). */
  learnerState: ProgressState | null;
  /** Open a written chapter to work through it; absent when the workbook cannot be used yet. */
  onOpen?: (sectionId: string) => void;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirmReplan, setConfirmReplan] = useState(false);
  const stopRef = useRef(false);

  const sections = workbook.content?.sections ?? [];
  const written = sections.filter((s) => s.status === 'ready').length;
  const pending = sections.length - written;
  const canGenerate = workbook.can_edit && workbook.status !== 'published';
  const running = run !== null;

  // Leaving mid-run loses only the chapter being written, but say so.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  /** Write the given chapters in order, saving each; stops early on Stop or the first error. */
  const writeChapters = async (from: WorkbookDetail, ids: string[]) => {
    let current = from;
    for (let i = 0; i < ids.length; i++) {
      if (stopRef.current) break;
      const section = current.content?.sections.find((s) => s.id === ids[i]);
      setRun({ label: section?.title || 'Chapter', sectionId: ids[i], done: i, total: ids.length });
      current = await workbookService.generateSection(current.id, ids[i]);
      onChange(current);
    }
  };

  const start = async (task: 'plan' | 'remaining' | string) => {
    stopRef.current = false;
    setError(null);
    try {
      if (task === 'plan') {
        setRun({ label: 'Planning the chapters', done: 0, total: 0 });
        const planned = await workbookService.generateOutline(workbook.id);
        onChange(planned);
        setOpen(new Set());
        await writeChapters(
          planned,
          (planned.content?.sections ?? []).map((s) => s.id)
        );
      } else if (task === 'remaining') {
        await writeChapters(
          workbook,
          sections.filter((s) => s.status !== 'ready').map((s) => s.id)
        );
      } else {
        await writeChapters(workbook, [task]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation stopped. Try again.');
    } finally {
      setRun(null);
    }
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Nothing planned yet ──────────────────────────────────────────────────────
  if (!sections.length) {
    return (
      <section
        className="wb-card items-center gap-3 px-5 py-10 text-center"
        aria-labelledby="wb-chapters"
      >
        <span className="wb-cover" aria-hidden="true">
          <Icon name="SparklesIcon" size={22} />
        </span>
        <h2 id="wb-chapters" className="text-base font-semibold text-foreground">
          {workbook.can_edit ? 'Turn the material into chapters' : 'Not ready yet'}
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {workbook.can_edit
            ? 'AI reads the material, plans its chapters, then writes each one as short readings and exercises: checklists, planners, trackers, reflections and a quiz. You can stop after any chapter and continue later.'
            : 'The author has not generated this workbook yet. Check back soon.'}
        </p>
        {canGenerate && (
          <div className="mt-1 flex flex-col items-center gap-3">
            {running ? (
              <RunStatus run={run} onStop={() => (stopRef.current = true)} />
            ) : (
              <button type="button" className="wb-btn wb-btn-primary" onClick={() => start('plan')}>
                <Icon name="SparklesIcon" size={16} />
                Generate chapters
              </button>
            )}
            {error && <AiError message={error} className="max-w-md text-sm" />}
          </div>
        )}
      </section>
    );
  }

  // ── The chapters ─────────────────────────────────────────────────────────────
  const content = workbook.content!;
  return (
    <section className="wb-card space-y-5 p-5 sm:p-[1.5rem]" aria-labelledby="wb-chapters">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="wb-chapters" className="text-base font-semibold text-foreground">
            Chapters
          </h2>
          <p className="wb-hint mt-0.5">
            {sections.length} chapters · about {content.estimated_minutes} min
            {workbook.can_edit && pending > 0 ? ` · ${written} of ${sections.length} written` : ''}
          </p>
        </div>
        {canGenerate && !running && (
          <div className="flex flex-wrap gap-2">
            {pending > 0 && (
              <button
                type="button"
                className="wb-btn wb-btn-sm wb-btn-primary"
                onClick={() => start('remaining')}
              >
                <Icon name="SparklesIcon" size={14} />
                {written ? `Write the remaining ${pending}` : `Write all ${pending} chapters`}
              </button>
            )}
            <button
              type="button"
              className="wb-btn wb-btn-sm"
              onClick={() => setConfirmReplan(true)}
            >
              <Icon name="ArrowPathIcon" size={14} />
              Plan again
            </button>
          </div>
        )}
      </div>

      {workbook.can_edit && pending > 0 && (
        <div className="wb-progress" aria-hidden="true">
          <span style={{ width: `${Math.round((written / sections.length) * 100)}%` }} />
        </div>
      )}

      {running && <RunStatus run={run} onStop={() => (stopRef.current = true)} />}
      {error && <AiError message={error} className="text-sm" />}

      {(content.summary || content.outcomes.length > 0) && (
        <div className="wb-notice flex-col gap-2">
          {content.summary && <p className="whitespace-pre-line">{content.summary}</p>}
          {content.outcomes.length > 0 && (
            <div>
              <p className="mb-1 font-semibold">By the end you can</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {content.outcomes.map((outcome, i) => (
                  <li key={i}>{outcome}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ol className="space-y-2.5">
        {sections.map((section, i) => (
          <ChapterRow
            key={section.id}
            section={section}
            number={i + 1}
            canEdit={workbook.can_edit}
            canGenerate={canGenerate && !running}
            writing={run?.sectionId === section.id}
            open={open.has(section.id)}
            onToggle={() => toggle(section.id)}
            onWrite={() => start(section.id)}
            stats={learnerState ? sectionStats(section, learnerState) : null}
            onOpen={onOpen && section.status === 'ready' ? () => onOpen(section.id) : undefined}
          />
        ))}
      </ol>

      {workbook.can_edit && workbook.status === 'published' && (
        <p className="wb-hint">
          Learners are working through this workbook, so its chapters are locked. Move it back to
          draft to plan or rewrite them.
        </p>
      )}

      <ConfirmDialog
        isOpen={confirmReplan}
        title="Plan the chapters again"
        message={`AI plans a new set of chapters from the material and writes them from scratch. The ${written} chapter${
          written === 1 ? '' : 's'
        } written so far will be replaced.`}
        confirmLabel="Plan again"
        isDestructive={written > 0}
        onConfirm={() => {
          setConfirmReplan(false);
          start('plan');
        }}
        onCancel={() => setConfirmReplan(false)}
      />
    </section>
  );
}

function RunStatus({ run, onStop }: { run: Run | null; onStop: () => void }) {
  const [stopping, setStopping] = useState(false);
  if (!run) return null;
  return (
    <div className="wb-run" role="status" aria-live="polite">
      <span className="wb-spinner" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words text-sm text-foreground">
        {run.total
          ? `Writing chapter ${run.done + 1} of ${run.total}: ${run.label}`
          : `${run.label}…`}
      </span>
      {run.total > 1 && run.done + 1 < run.total && (
        <button
          type="button"
          className="wb-btn wb-btn-sm"
          disabled={stopping}
          onClick={() => {
            setStopping(true);
            onStop();
          }}
        >
          {stopping ? 'Stopping after this chapter' : 'Stop after this chapter'}
        </button>
      )}
    </div>
  );
}

function ChapterRow({
  section,
  number,
  canEdit,
  canGenerate,
  writing,
  open,
  onToggle,
  onWrite,
  stats,
  onOpen,
}: {
  stats: Stats | null;
  onOpen?: () => void;
  section: WorkbookSection;
  number: number;
  canEdit: boolean;
  canGenerate: boolean;
  writing: boolean;
  open: boolean;
  onToggle: () => void;
  onWrite: () => void;
}) {
  const ready = section.status === 'ready';
  const exercises = section.blocks.filter((b) => b.type !== 'reading' && b.type !== 'key_points');
  const complete = !!stats && stats.total > 0 && stats.done === stats.total;
  const begun = !!stats && stats.done > 0;
  return (
    <li className="wb-chapter">
      <div className="flex items-start gap-3">
        <span
          className={`wb-chapter-number ${complete ? 'wb-chapter-ready' : ''}`}
          aria-hidden="true"
        >
          {complete ? <Icon name="CheckIcon" size={14} /> : number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold text-foreground">
            <span className="sr-only">Chapter {number}: </span>
            {section.title}
          </h3>
          {section.summary && (
            <p className="mt-0.5 text-sm text-muted-foreground">{section.summary}</p>
          )}
          <p className="wb-hint mt-1.5">
            {section.minutes} min
            {ready ? ` · ${exercises.length} exercises` : ''}
            {writing ? ' · Writing…' : canEdit && !ready ? ' · Not written yet' : ''}
            {stats && stats.total > 0 && begun ? ` · ${stats.done} of ${stats.total} done` : ''}
          </p>
        </div>
      </div>
      {(onOpen || (canEdit && (ready || canGenerate))) && (
        <div className="mt-3 flex flex-wrap gap-2 pl-[2.6rem]">
          {onOpen && (
            <button type="button" className="wb-btn wb-btn-sm wb-btn-primary" onClick={onOpen}>
              {complete ? 'Review' : begun ? 'Continue' : 'Open'}
              <Icon name="ArrowRightIcon" size={14} />
            </button>
          )}
          {canEdit && ready && (
            <button
              type="button"
              className="wb-btn wb-btn-sm"
              aria-expanded={open}
              onClick={onToggle}
            >
              <Icon name={open ? 'ChevronUpIcon' : 'EyeIcon'} size={14} />
              {open ? 'Hide preview' : 'Preview with answers'}
            </button>
          )}
          {canGenerate && (
            <button type="button" className="wb-btn wb-btn-sm" onClick={onWrite}>
              <Icon name={ready ? 'ArrowPathIcon' : 'SparklesIcon'} size={14} />
              {ready ? 'Rewrite' : 'Write this chapter'}
            </button>
          )}
        </div>
      )}
      {canEdit && ready && open && (
        <div className="mt-4 sm:pl-[2.6rem]">
          <ChapterPreview blocks={section.blocks} />
        </div>
      )}
    </li>
  );
}
