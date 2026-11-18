'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { type LabProject } from '@/lib/services/labProjectsService';
import ProjectContextEditor from '@/modules/labs/project/ProjectContextEditor';
import ProjectSections from '@/modules/labs/project/ProjectSections';
import {
  deleteWithConfirm,
  setArchived,
  toggleUseInLabs,
} from '@/modules/labs/project/projectActions';
import { dangerButton, quietButton, StatusBadge, UsedBadge } from '@/modules/labs/project/ui';

export type ProjectTab = 'context' | 'sections';

/** One project: its header and actions, and its two areas, Context and Sections. */
export default function ProjectScreen({
  project,
  tab,
  inUse,
  onTab,
  onDeleted,
}: {
  project: LabProject;
  tab: ProjectTab;
  /** Selected as the project the labs generate for. */
  inUse: boolean;
  onTab: (tab: ProjectTab) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const archived = project.status === 'archived';

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: ProjectTab; label: string; icon: string }[] = [
    { id: 'sections', label: `Sections (${project.sectionCount})`, icon: 'BookmarkIcon' },
    { id: 'context', label: 'Context', icon: 'DocumentTextIcon' },
  ];

  return (
    <div className="max-w-[880px]">
      <div className="mb-5">
        <BackButton href="/labs-project" label="Projects" />
      </div>

      <header className="lab-edge lab-rim mb-5 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={project.status} />
              {inUse && <UsedBadge />}
            </div>
            <h2 className="mt-2 break-words font-heading text-[1.25rem] font-bold leading-tight tracking-[-0.018em] text-foreground">
              {project.name}
            </h2>
            {project.description && (
              <p className="mt-1 text-sm leading-relaxed mix-text-foreground/[0.68]">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {archived && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
            <Icon name="ArchiveBoxIcon" size={15} className="mt-0.5 flex-shrink-0" />
            <span>
              This project is archived. Restore it to use it in the labs and save new sections.
            </span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!archived && (
            <button
              type="button"
              className={quietButton}
              onClick={() => toggleUseInLabs(project, inUse)}
            >
              <Icon name={inUse ? 'XMarkIcon' : 'BoltIcon'} size={14} />
              {inUse ? 'Stop using in labs' : 'Use in labs'}
            </button>
          )}
          <button
            type="button"
            className={quietButton}
            disabled={busy}
            onClick={() => run(() => setArchived(project, !archived))}
          >
            <Icon name={archived ? 'ArrowUturnLeftIcon' : 'ArchiveBoxIcon'} size={14} />
            {archived ? 'Restore' : 'Archive'}
          </button>
          <button
            type="button"
            className={`${dangerButton} sm:ml-auto`}
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (await deleteWithConfirm(project)) onDeleted();
              })
            }
          >
            <Icon name="TrashIcon" size={14} />
            Delete
          </button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Project areas"
        className="mb-5 todo-segmented todo-segmented-accent self-start"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`project-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-pressed={tab === t.id}
            aria-controls={`project-panel-${t.id}`}
            onClick={() => onTab(t.id)}
            className="todo-segment text-[13px]"
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`project-panel-${tab}`} aria-labelledby={`project-tab-${tab}`}>
        {tab === 'context' ? (
          <ProjectContextEditor key={project.id} project={project} />
        ) : (
          <ProjectSections project={project} />
        )}
      </div>
    </div>
  );
}
