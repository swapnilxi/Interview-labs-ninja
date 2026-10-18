'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { type LabProject } from '@/lib/services/labProjectsService';
import ProjectContextEditor from '@/modules/labs-project/ProjectContextEditor';
import ProjectSections from '@/modules/labs-project/ProjectSections';
import {
  deleteWithConfirm,
  setArchived,
  toggleUseInLabs,
} from '@/modules/labs-project/projectActions';
import { dangerButton, quietButton, StatusBadge } from '@/modules/labs-project/ui';

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
    <div>
      <div className="mb-4">
        <BackButton href="/labs-project" label="Projects" />
      </div>

      <header className="mb-5 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          {inUse && (
            <span className="inline-flex items-center gap-1 rounded-md border mix-border-primary/30 mix-bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Icon name="CheckIcon" size={12} />
              Used by the labs
            </span>
          )}
        </div>
        <h2 className="mt-2 break-words font-heading text-xl font-semibold text-foreground">
          {project.name}
        </h2>
        {project.description && (
          <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!archived && (
            <button
              type="button"
              className={quietButton}
              onClick={() => toggleUseInLabs(project, inUse)}
            >
              <Icon name={inUse ? 'XMarkIcon' : 'FolderOpenIcon'} size={14} />
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
        {archived && (
          <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            This project is archived. The labs don&apos;t offer it and it takes no new sections;
            everything in it is kept. Restore it to use it again.
          </p>
        )}
      </header>

      <div
        role="tablist"
        aria-label="Project areas"
        className="mb-4 flex gap-1 border-b border-border"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`project-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`project-panel-${t.id}`}
            onClick={() => onTab(t.id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name={t.icon} size={15} />
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
