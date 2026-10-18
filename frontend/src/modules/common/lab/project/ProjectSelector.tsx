'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import { useLabProjects } from '@/modules/common/lab/project/useLabProjects';

/**
 * The project picker every lab shows. The selection is shared (one project for all labs, kept across
 * refreshes), so choosing a project in one lab is what the next lab generates against too.
 *
 * "No project" keeps each lab's general behaviour. Projects are made and managed in Labs Project; the
 * menu links there, and offers to create the first one when there are none.
 */
export default function ProjectSelector({ className = '' }: { className?: string }) {
  const { projects, selected, select, loaded, loading, error, refresh } = useLabProjects();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const pick = (id: number | null) => {
    select(id);
    setOpen(false);
  };

  const itemClass =
    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:mix-bg-muted/70 focus-visible:outline-none focus-visible:mix-bg-muted/70';

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Project: ${selected ? selected.name : 'none'}. Change project`}
        title={selected ? `Generating for “${selected.name}”` : 'Choose a project to generate for'}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm transition-all ${
          selected
            ? 'mix-border-primary/40 mix-bg-primary/10 text-primary hover:mix-bg-primary/15'
            : 'border-border mix-bg-card/80 mix-text-foreground/80 hover:bg-muted hover:text-foreground'
        } ${className}`}
      >
        <Icon
          name={selected ? 'FolderOpenIcon' : 'FolderIcon'}
          size={13}
          className="flex-shrink-0"
        />
        <span className="max-w-[10rem] truncate">{selected ? selected.name : 'No project'}</span>
        <Icon name="ChevronUpDownIcon" size={12} className="flex-shrink-0 opacity-60" />
      </button>

      <Popover
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        label="Choose a project"
        placement="bottom-end"
        className="w-[min(20rem,calc(100vw-1rem))] rounded-xl border border-border bg-card p-1.5 shadow-xl"
      >
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Generate for
        </p>
        <button
          type="button"
          role="menuitem"
          aria-current={selected ? undefined : 'true'}
          onClick={() => pick(null)}
          className={itemClass}
        >
          <Icon
            name="CheckIcon"
            size={14}
            className={`mt-0.5 flex-shrink-0 text-primary ${selected ? 'invisible' : ''}`}
          />
          <span className="min-w-0">
            <span className="block font-medium text-foreground">No project</span>
            <span className="block text-xs text-muted-foreground">
              General answers, as the lab always gave
            </span>
          </span>
        </button>

        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            role="menuitem"
            aria-current={selected?.id === p.id ? 'true' : undefined}
            onClick={() => pick(p.id)}
            className={itemClass}
          >
            <Icon
              name="CheckIcon"
              size={14}
              className={`mt-0.5 flex-shrink-0 text-primary ${selected?.id === p.id ? '' : 'invisible'}`}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {p.sectionCount} saved section{p.sectionCount === 1 ? '' : 's'}
                {p.description ? ` · ${p.description}` : ''}
              </span>
            </span>
          </button>
        ))}

        {!loaded && loading && (
          <p className="px-2.5 py-2 text-xs text-muted-foreground" role="status">
            Loading your projects…
          </p>
        )}
        {error && (
          <div className="px-2.5 py-2 text-xs text-error" role="alert">
            {error}{' '}
            <button
              type="button"
              onClick={() => void refresh()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}
        {loaded && projects.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">
            You have no projects yet. Create one and every lab can generate for it.
          </p>
        )}

        <div className="mt-1 border-t border-border pt-1">
          <Link
            href="/labs-project?new=1"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${itemClass} items-center text-primary`}
          >
            <Icon name="FolderPlusIcon" size={14} className="flex-shrink-0" />
            <span className="font-medium">New project</span>
          </Link>
          <Link
            href="/labs-project"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${itemClass} items-center`}
          >
            <Icon name="Squares2X2Icon" size={14} className="flex-shrink-0 text-muted-foreground" />
            <span className="font-medium text-foreground">Manage projects</span>
          </Link>
        </div>
      </Popover>
    </>
  );
}
