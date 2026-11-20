'use client';

import Icon from '@/components/ui/AppIcon';
import InteractiveBlock from './InteractiveBlock';
import { sectionStats } from './progress';
import SaveIndicator from './SaveIndicator';
import type { WorkbookProgress } from './useWorkbookProgress';
import type { WorkbookSection } from './types';

/**
 * One chapter, filled in (`?chapter=<id>` on the workbook's page): its blocks in order, the chapter's own progress,
 * the save status, and the way to the previous / next written chapter.
 */
export default function ChapterView({
  workbookId,
  sections,
  section,
  progress,
  onOpen,
}: {
  workbookId: string;
  /** The written chapters, in order. */
  sections: WorkbookSection[];
  section: WorkbookSection;
  progress: WorkbookProgress;
  /** Open another chapter, or the overview (null). */
  onOpen: (sectionId: string | null) => void;
}) {
  const { state, update } = progress;
  const index = sections.findIndex((s) => s.id === section.id);
  const previous = index > 0 ? sections[index - 1] : null;
  const next = index >= 0 && index < sections.length - 1 ? sections[index + 1] : null;
  const stats = sectionStats(section, state);
  const complete = stats.total > 0 && stats.done === stats.total;

  if (!state) {
    return (
      <div className="animate-pulse space-y-3" aria-busy="true">
        <div className="wb-card h-[8rem]" />
        <div className="wb-card h-[12rem]" />
      </div>
    );
  }

  return (
    <article className="space-y-4" aria-labelledby="wb-chapter-title">
      <header className="wb-card wb-wash space-y-3 p-5 sm:p-[1.5rem]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="wb-hint">
            Chapter {index + 1} of {sections.length} · {section.minutes} min
          </p>
          <SaveIndicator progress={progress} />
        </div>
        <h2
          id="wb-chapter-title"
          className="break-words text-xl font-semibold text-foreground md:text-2xl"
        >
          {section.title}
        </h2>
        {section.summary && <p className="text-sm text-muted-foreground">{section.summary}</p>}
        {section.goals.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground">
            {section.goals.map((goal, i) => (
              <li key={i}>{goal}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <div
            className="wb-progress flex-1"
            role="progressbar"
            aria-label="This chapter"
            aria-valuemin={0}
            aria-valuemax={stats.total}
            aria-valuenow={stats.done}
          >
            <span style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }} />
          </div>
          <span className="wb-hint whitespace-nowrap">
            {stats.done} of {stats.total} done
          </span>
        </div>
      </header>

      {section.blocks.map((block) => (
        <InteractiveBlock
          key={block.id}
          workbookId={workbookId}
          block={block}
          state={state}
          update={update}
        />
      ))}

      {complete && (
        <div
          className="wb-card wb-wash items-center gap-2 px-5 py-[1.5rem] text-center"
          role="status"
        >
          <span className="wb-cover" aria-hidden="true">
            <Icon name="CheckBadgeIcon" size={22} />
          </span>
          <p className="font-semibold text-foreground">Chapter complete</p>
          <p className="text-sm text-muted-foreground">
            {next ? `Next up: ${next.title}` : 'That was the last chapter.'}
          </p>
        </div>
      )}

      <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Chapters">
        {previous ? (
          <button type="button" className="wb-btn" onClick={() => onOpen(previous.id)}>
            <Icon name="ArrowLeftIcon" size={16} />
            <span className="max-w-[14rem] truncate">{previous.title}</span>
          </button>
        ) : (
          <button type="button" className="wb-btn" onClick={() => onOpen(null)}>
            <Icon name="ArrowLeftIcon" size={16} />
            All chapters
          </button>
        )}
        {next ? (
          <button type="button" className="wb-btn wb-btn-primary" onClick={() => onOpen(next.id)}>
            <span className="max-w-[14rem] truncate">{next.title}</span>
            <Icon name="ArrowRightIcon" size={16} />
          </button>
        ) : (
          <button type="button" className="wb-btn wb-btn-primary" onClick={() => onOpen(null)}>
            Back to all chapters
          </button>
        )}
      </nav>
    </article>
  );
}
