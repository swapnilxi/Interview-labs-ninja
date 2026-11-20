'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import ChaptersPanel from './ChaptersPanel';
import ChapterView from './ChapterView';
import LearnersPanel from './LearnersPanel';
import ProgressCard from './ProgressCard';
import { useWorkbookProgress } from './useWorkbookProgress';
import PrivacyNotice from './PrivacyNotice';
import { workbookService } from './workbookService';
import type { WorkbookDetail, WorkbookUpdate } from './types';

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * /ai-lms/classes/<class>/workbooks/<id>: the workbook's details, its chapters (and, for whoever may edit it,
 * generating them: ChaptersPanel), the viewer's own progress, the privacy notice, the material it was made from and
 * the owner's / instructor's controls (with the learner list for a class workbook). `?chapter=<id>` opens one written
 * chapter to work through (ChapterView): a page with its own address, so Back and links work.
 */
export default function WorkbookModule({
  classSlug,
  workbookId,
}: {
  classSlug: string;
  workbookId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const chapterId = useSearchParams().get('chapter');
  const { canEdit: isEditor } = useAuth();
  const [workbook, setWorkbook] = useState<WorkbookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWorkbook(await workbookService.get(workbookId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workbook not found.');
    }
  }, [workbookId]);

  useEffect(() => {
    load();
  }, [load]);

  // The viewer's own progress, once there is at least one written chapter to work through.
  const written = (workbook?.content?.sections ?? []).filter((s) => s.status === 'ready');
  const progress = useWorkbookProgress(workbookId, workbook?.content, written.length > 0);
  const openSection = written.find((s) => s.id === chapterId) ?? null;

  // Remember the chapter last opened, for "Continue".
  const { state: learnerState, update } = progress;
  useEffect(() => {
    if (openSection && learnerState && learnerState.section !== openSection.id) {
      update((prev) => ({ ...prev, section: openSection.id }), { quiet: true });
    }
  }, [openSection, learnerState, update]);

  const openChapter = useCallback(
    (sectionId: string | null) => {
      router.push(sectionId ? `${pathname}?chapter=${encodeURIComponent(sectionId)}` : pathname);
    },
    [router, pathname]
  );

  const change = async (changes: WorkbookUpdate) => {
    setBusy(true);
    setActionError(null);
    try {
      setWorkbook(await workbookService.update(workbookId, changes));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The change was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    setBusy(true);
    try {
      await workbookService.remove(workbookId);
      router.push(`/ai-lms/classes/${classSlug}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The workbook was not deleted.');
      setBusy(false);
    }
  };

  const classHref = `/ai-lms/classes/${workbook?.class_slug || classSlug}`;

  if (error) {
    return (
      <div className="wb-accent mx-auto w-full max-w-xl px-4 py-16">
        <div className="wb-card wb-wash items-center gap-3 px-[1.5rem] py-10 text-center">
          <span className="wb-cover" aria-hidden="true">
            <Icon name="BookOpenIcon" size={22} />
          </span>
          <h1 className="text-lg font-semibold text-foreground">Workbook not found</h1>
          <p className="text-sm text-muted-foreground">
            It may have been deleted, or it is private to someone else.
          </p>
          <Link href={classHref} className="wb-btn wb-btn-primary mt-2">
            <Icon name="ArrowLeftIcon" size={16} />
            Back to the class
          </Link>
        </div>
      </div>
    );
  }

  if (!workbook) {
    return (
      <div className="wb-accent mx-auto w-full max-w-4xl animate-pulse space-y-5 px-4 py-10 sm:px-[1.5rem]">
        <div className="h-4 w-[12rem] max-w-full rounded bg-muted" />
        <div className="wb-hero h-[12rem]" />
        <div className="wb-card h-[8rem]" />
      </div>
    );
  }

  const shared = workbook.visibility === 'class';
  const sections = workbook.content?.sections ?? [];
  const generated = sections.length > 0;
  // Publishing needs every chapter written (the server refuses it otherwise, with the same rule).
  const allWritten = generated && sections.every((s) => s.status === 'ready');
  const words = workbook.source_text ? countWords(workbook.source_text) : 0;

  return (
    <div className="wb-accent mx-auto w-full max-w-4xl px-4 pb-[8rem] pt-[2rem] sm:px-[1.5rem] md:pt-[3rem]">
      <nav
        className="mb-5 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <BackButton href={classHref} label="Back" className="-ml-2.5" />
        <Link href="/ai-lms" className="hover:text-foreground">
          AI LMS
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={classHref} className="min-w-0 break-words hover:text-foreground">
          {workbook.class_name || 'Class'}
        </Link>
        <span aria-hidden="true">/</span>
        {openSection ? (
          <Link href={pathname} className="min-w-0 break-words hover:text-foreground">
            {workbook.title}
          </Link>
        ) : (
          <span className="min-w-0 break-words font-semibold text-foreground">
            {workbook.title}
          </span>
        )}
      </nav>

      {openSection ? (
        <ChapterView
          workbookId={workbook.id}
          sections={written}
          section={openSection}
          progress={progress}
          onOpen={openChapter}
        />
      ) : (
        <>
          <header className="wb-hero wb-wash wb-enter mb-[1.5rem] px-5 py-7 sm:px-8">
            <div className="flex items-start gap-4">
              <span className="wb-cover" aria-hidden="true">
                <Icon name={workbook.icon || 'BookOpenIcon'} size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="break-words font-heading text-2xl font-semibold text-foreground md:text-3xl">
                  {workbook.title}
                </h1>
                {workbook.description && (
                  <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {workbook.description}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {workbook.can_edit && (
                    <span className={`wb-chip ${shared ? 'wb-chip-accent' : ''}`}>
                      <Icon name={shared ? 'UserGroupIcon' : 'LockClosedIcon'} size={12} />
                      {shared ? 'Shared with class' : 'Private'}
                    </span>
                  )}
                  {workbook.can_edit && workbook.status !== 'published' && (
                    <span className="wb-chip">
                      {workbook.status === 'draft' ? 'Draft' : 'Archived'}
                    </span>
                  )}
                  <span className="wb-chip">
                    {generated ? `${sections.length} chapters` : 'Not generated yet'}
                  </span>
                </div>
              </div>
            </div>
          </header>

          <div className="space-y-[1.5rem]">
            {written.length > 0 && workbook.content && (
              <ProgressCard content={workbook.content} progress={progress} onOpen={openChapter} />
            )}

            <ChaptersPanel
              workbook={workbook}
              onChange={setWorkbook}
              learnerState={written.length > 0 ? progress.state : null}
              onOpen={written.length > 0 ? openChapter : undefined}
            />

            <PrivacyNotice />

            {workbook.can_edit && isEditor && shared && written.length > 0 && (
              <LearnersPanel workbookId={workbook.id} />
            )}

            {workbook.can_edit && (
              <section
                className="wb-card space-y-4 p-5 sm:p-[1.5rem]"
                aria-labelledby="wb-material"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="wb-material" className="text-base font-semibold text-foreground">
                    Learning material
                  </h2>
                  <span className="wb-hint">
                    {words.toLocaleString()} words
                    {workbook.source_name ? ` from ${workbook.source_name}` : ' pasted'}
                  </span>
                </div>
                {workbook.instructions && (
                  <div>
                    <p className="wb-label">Instructions for the AI</p>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {workbook.instructions}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className="wb-btn wb-btn-sm self-start"
                  aria-expanded={showSource}
                  onClick={() => setShowSource((v) => !v)}
                >
                  <Icon name={showSource ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={14} />
                  {showSource ? 'Hide the text' : 'Show the text'}
                </button>
                {showSource && (
                  <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background p-4 font-[inherit] text-sm leading-relaxed text-foreground">
                    {(workbook.source_text || '').slice(0, 20000)}
                    {(workbook.source_text || '').length > 20000 ? '\n\n…' : ''}
                  </pre>
                )}
              </section>
            )}

            {workbook.can_edit && (
              <section className="wb-card space-y-4 p-5 sm:p-[1.5rem]" aria-labelledby="wb-manage">
                <h2 id="wb-manage" className="text-base font-semibold text-foreground">
                  Manage
                </h2>
                <div className="flex flex-wrap gap-2">
                  {isEditor && (
                    <button
                      type="button"
                      className="wb-btn wb-btn-sm"
                      disabled={busy}
                      onClick={() => change({ visibility: shared ? 'private' : 'class' })}
                    >
                      <Icon name={shared ? 'LockClosedIcon' : 'UserGroupIcon'} size={14} />
                      {shared ? 'Make private' : 'Share with class'}
                    </button>
                  )}
                  {(isEditor || !shared) && workbook.status !== 'published' && (
                    <button
                      type="button"
                      className="wb-btn wb-btn-sm wb-btn-primary"
                      disabled={busy || !allWritten}
                      title={allWritten ? undefined : 'Write every chapter first'}
                      onClick={() => change({ status: 'published' })}
                    >
                      <Icon name="CheckCircleIcon" size={14} />
                      {shared ? 'Publish to class' : 'Mark as ready'}
                    </button>
                  )}
                  {(isEditor || !shared) && workbook.status === 'published' && (
                    <button
                      type="button"
                      className="wb-btn wb-btn-sm"
                      disabled={busy}
                      onClick={() => change({ status: 'draft' })}
                    >
                      <Icon name="EyeSlashIcon" size={14} />
                      {shared ? 'Unpublish' : 'Back to draft'}
                    </button>
                  )}
                  {(isEditor || !shared) && workbook.status !== 'archived' && (
                    <button
                      type="button"
                      className="wb-btn wb-btn-sm"
                      disabled={busy}
                      onClick={() => change({ status: 'archived' })}
                    >
                      <Icon name="ArchiveBoxIcon" size={14} />
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    className="wb-btn wb-btn-sm wb-btn-danger"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="TrashIcon" size={14} />
                    Delete
                  </button>
                </div>
                {workbook.status !== 'published' && !allWritten && (
                  <p className="wb-hint">
                    {shared ? 'Publishing' : 'Marking it ready'} opens once every chapter is
                    written.
                  </p>
                )}
                <p className="wb-hint">
                  {shared
                    ? workbook.status === 'published'
                      ? 'Everyone who opens the class can use it. Each learner fills in their own private copy.'
                      : 'Learners do not see it until it is published.'
                    : 'Only you can see this workbook.'}
                </p>
                {actionError && (
                  <p className="text-sm font-medium text-destructive" role="alert">
                    {actionError}
                  </p>
                )}
              </section>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete workbook"
        message={
          shared
            ? `Delete "${workbook.title}"? Every learner's answers and progress in it are deleted too. This can't be undone.`
            : `Delete "${workbook.title}" and your answers in it? This can't be undone.`
        }
        confirmLabel="Delete workbook"
        isDestructive
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
