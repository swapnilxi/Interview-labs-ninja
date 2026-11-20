'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import WorkbookCard from './WorkbookCard';
import { workbookService } from './workbookService';
import type { WorkbookSummary } from './types';

/**
 * The Workbooks band of a class page (beside Subjects & Projects). Everyone signed in sees the class's published
 * workbooks and their own; anyone may create one (private to them; an instructor can share it with the class).
 * It loads its own list, so the class page only mounts it.
 */
export default function ClassWorkbooks({
  classSlug,
  className,
}: {
  classSlug: string;
  className: string;
}) {
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setWorkbooks(await workbookService.list(classSlug));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the workbooks.');
    }
  }, [classSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const createHref = `/ai-lms/classes/${classSlug}/workbooks/new`;

  return (
    <section
      id="workbooks"
      className="wb-accent scroll-mt-[5rem] space-y-5"
      aria-labelledby="class-workbooks-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2
            id="class-workbooks-heading"
            className="font-heading text-xl font-bold text-foreground"
          >
            Workbooks{workbooks ? ` (${workbooks.length})` : ''}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Books and lessons turned into exercises you fill in, track and come back to. Your
            answers are private.
          </p>
        </div>
        <Link href={createHref} className="wb-btn wb-btn-primary self-start sm:self-auto">
          <Icon name="PlusIcon" size={16} />
          Create workbook
        </Link>
      </div>

      {error ? (
        <div className="wb-notice items-center justify-between">
          <span>{error}</span>
          <button type="button" className="wb-btn wb-btn-sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : workbooks === null ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="wb-card h-[11rem] animate-pulse" />
          ))}
        </div>
      ) : workbooks.length === 0 ? (
        <div className="wb-card wb-wash items-center gap-3 px-5 py-10 text-center">
          <span className="wb-cover" aria-hidden="true">
            <Icon name="BookOpenIcon" size={22} />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              No workbooks in {className} yet
            </h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Upload a book chapter, a PDF or a Word file, or paste text, and AI turns it into
              checklists, planners, quizzes and reflections you work through.
            </p>
          </div>
          <Link href={createHref} className="wb-btn wb-btn-primary mt-1">
            <Icon name="PlusIcon" size={16} />
            Create workbook
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {workbooks.map((workbook) => (
            <WorkbookCard key={workbook.id} workbook={workbook} classSlug={classSlug} />
          ))}
        </div>
      )}
    </section>
  );
}
