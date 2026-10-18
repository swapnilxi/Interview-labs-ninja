'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { formatServerDate, projectHref, type LabProject } from '@/lib/services/labProjectsService';
import {
  deleteWithConfirm,
  setArchived,
  toggleUseInLabs,
} from '@/modules/labs-project/projectActions';
import { EmptyState, fieldClass, primaryButton, StatusBadge } from '@/modules/labs-project/ui';

export type StatusFilter = 'active' | 'archived' | 'all';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
  { id: 'all', label: 'All' },
];

/** Projects: search, filter by status, open one, and the quick actions (use in labs, archive, delete). */
export default function ProjectsList({
  projects,
  selectedId,
  status,
  onStatusChange,
  onNew,
}: {
  projects: LabProject[];
  selectedId: number | null;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const counts = useMemo(
    () => ({
      active: projects.filter((p) => p.status === 'active').length,
      archived: projects.filter((p) => p.status === 'archived').length,
      all: projects.length,
    }),
    [projects]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => status === 'all' || p.status === status)
      .filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
  }, [projects, status, query]);

  const run = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  if (projects.length === 0) {
    return (
      <EmptyState icon="FolderPlusIcon" title="No projects yet">
        <p>
          A project holds the background of something you are building. Pick one in any lab and its
          answers are written for it; save the answers you like back into the project to build up
          its knowledge.
        </p>
        <button type="button" onClick={onNew} className={`${primaryButton} mt-4`}>
          <Icon name="PlusIcon" size={16} />
          Create your first project
        </button>
      </EmptyState>
    );
  }

  const iconButton =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

  return (
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading" className="sr-only">
        Projects
      </h2>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filter projects by status"
          className="inline-flex rounded-lg border border-border bg-card p-0.5"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={status === f.id}
              onClick={() => onStatusChange(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                status === f.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-[18rem]">
          <Icon
            name="MagnifyingGlassIcon"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className={`${fieldClass} pl-9`}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="MagnifyingGlassIcon" title="No projects match">
          <p>
            {query
              ? 'Nothing matches that search in this view.'
              : status === 'archived'
                ? 'You have no archived projects.'
                : 'You have no active projects.'}
          </p>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const inUse = p.id === selectedId;
            const busy = busyId === p.id;
            return (
              <li
                key={p.id}
                className={`flex flex-col rounded-xl border bg-card transition-shadow hover:shadow-md ${
                  inUse ? 'mix-border-primary/50 ring-1 mix-ring-primary/30' : 'border-border'
                }`}
              >
                <Link
                  href={projectHref(p.id)}
                  className="flex-1 rounded-t-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    {inUse && (
                      <span className="inline-flex items-center gap-1 rounded-md border mix-border-primary/30 mix-bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Icon name="CheckIcon" size={12} />
                        Used by the labs
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 break-words font-heading text-base font-semibold text-foreground">
                    {p.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {p.description || (p.context ? p.context : 'No description yet.')}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {p.sectionCount} saved section{p.sectionCount === 1 ? '' : 's'} · updated{' '}
                    {formatServerDate(p.updatedAt)}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5">
                  {p.status === 'active' && (
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => toggleUseInLabs(p, inUse)}
                    >
                      <Icon name={inUse ? 'XMarkIcon' : 'FolderOpenIcon'} size={14} />
                      {inUse ? 'Stop using' : 'Use in labs'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={iconButton}
                    disabled={busy}
                    onClick={() => run(p.id, () => setArchived(p, p.status === 'active'))}
                  >
                    <Icon
                      name={p.status === 'active' ? 'ArchiveBoxIcon' : 'ArrowUturnLeftIcon'}
                      size={14}
                    />
                    {p.status === 'active' ? 'Archive' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    className={`${iconButton} ml-auto hover:!text-error`}
                    disabled={busy}
                    onClick={() => run(p.id, () => deleteWithConfirm(p))}
                  >
                    <Icon name="TrashIcon" size={14} />
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
