'use client';

import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { WorkbookSummary } from './types';

/** What a card's chips say about who can see the workbook and its state (only to people it concerns). */
function stateChips(
  workbook: WorkbookSummary
): { label: string; icon: string; accent?: boolean }[] {
  const chips: { label: string; icon: string; accent?: boolean }[] = [];
  if (workbook.is_owner && workbook.visibility === 'private')
    chips.push({ label: 'Private', icon: 'LockClosedIcon' });
  if (workbook.can_edit && workbook.visibility === 'class') {
    chips.push({ label: 'Shared with class', icon: 'UserGroupIcon', accent: true });
  }
  if (workbook.can_edit && workbook.status === 'draft')
    chips.push({ label: 'Draft', icon: 'PencilIcon' });
  if (workbook.status === 'archived') chips.push({ label: 'Archived', icon: 'ArchiveBoxIcon' });
  return chips;
}

export default function WorkbookCard({
  workbook,
  classSlug,
}: {
  workbook: WorkbookSummary;
  classSlug: string;
}) {
  const href = `/ai-lms/classes/${classSlug}/workbooks/${workbook.id}`;
  const percent = workbook.my_progress?.percent ?? 0;
  const started = workbook.my_progress !== null;
  const ready = workbook.section_count > 0;
  const action = !ready
    ? workbook.can_edit
      ? 'Set up'
      : 'Open'
    : percent >= 100
      ? 'Review'
      : started
        ? 'Continue'
        : 'Start';

  return (
    <article className="wb-card wb-card-link wb-wash overflow-hidden">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="wb-cover" aria-hidden="true">
            <Icon name={workbook.icon || 'BookOpenIcon'} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-semibold leading-snug text-foreground">
              {/* The whole card is the link (the ::after covers it), so keyboard and screen readers get one stop. */}
              <Link href={href} className="after:absolute after:inset-0 after:content-['']">
                {workbook.title}
              </Link>
            </h3>
            {workbook.description && (
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {workbook.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {stateChips(workbook).map((chip) => (
            <span key={chip.label} className={`wb-chip ${chip.accent ? 'wb-chip-accent' : ''}`}>
              <Icon name={chip.icon} size={12} />
              {chip.label}
            </span>
          ))}
          {ready ? (
            <span className="wb-chip">
              {workbook.section_count} {workbook.section_count === 1 ? 'chapter' : 'chapters'}
            </span>
          ) : (
            <span className="wb-chip">Not generated yet</span>
          )}
          {workbook.estimated_minutes ? (
            <span className="wb-chip">About {workbook.estimated_minutes} min</span>
          ) : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            {started && ready ? (
              <>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Your progress</span>
                  <span className="font-medium text-foreground">{percent}%</span>
                </div>
                <div
                  className="wb-progress"
                  role="progressbar"
                  aria-label="Your progress"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {ready ? 'Your answers stay private to you' : 'Waiting for its chapters'}
              </span>
            )}
          </div>
          <span className="wb-btn wb-btn-sm wb-btn-primary pointer-events-none" aria-hidden="true">
            {action}
            <Icon name="ArrowRightIcon" size={14} />
          </span>
        </div>
      </div>
    </article>
  );
}
