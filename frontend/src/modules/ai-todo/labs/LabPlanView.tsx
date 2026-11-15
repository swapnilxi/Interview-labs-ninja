'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { useUrlState } from '@/lib/navigation/urlState';
import type { LabName } from '@/lib/services/labSectionsService';
import { type Project, projectService } from '@/lib/services/projectService';
import { toast } from '@/lib/ui/toast';
import { LAB_CATALOG } from '@/modules/labs/common/labCatalog';
import ProjectIcon from '../projects/ProjectIcon';
import { planUrls } from '../projects/projectUrls';
import LabContentPicker from './LabContentPicker';
import {
  addLabPicksToProject,
  labEntry,
  labTopicHref,
  linkedLabNodes,
  plannedItems,
  selectionLabs,
  suggestedProjectTitle,
  type LabPick,
  type LabSelection,
} from './labContent';

const PROJECT_ICON_FOR_LAB: Record<LabName, string> = {
  dsa: 'fc:code',
  python: 'fc:code',
  cv: 'fc:study',
  system_design: 'fc:study',
  communication: 'fc:briefcase',
  finance: 'fc:money',
};

interface LabPlanViewProps {
  projects: Project[];
  onProjectCreated: (project: Project) => void;
}

/**
 * Plan & Project → Lab plan (`?tab=plan&view=labs&lab=<lab>`): pick topics and lessons from any lab, then add them
 * to a new or an existing project, where they become a tree you can schedule, chunk and push to Smart To-Do.
 */
export default function LabPlanView({ projects, onProjectCreated }: LabPlanViewProps) {
  const { get, update } = useUrlState();
  const rawLab = get('lab');
  const lab: LabName = LAB_CATALOG.some((l) => l.key === rawLab) ? (rawLab as LabName) : 'dsa';

  const [selection, setSelection] = useState<LabSelection>(new Map());
  const [reviewOpen, setReviewOpen] = useState(false);

  const topicsPicked = selection.size;
  const items = plannedItems(selection.values());

  return (
    <div className="flex flex-col">
      <LabContentPicker
        layout="page"
        lab={lab}
        onLabChange={(l) => update({ lab: l }, 'replace')}
        selection={selection}
        onSelectionChange={setSelection}
      />

      {topicsPicked > 0 && (
        <div className="lp-bar" role="region" aria-label="Selection">
          <p
            className="min-w-0 flex-1 text-[14px] leading-tight text-foreground"
            aria-live="polite"
          >
            <span className="font-semibold">{topicsPicked} selected</span>
            {items > topicsPicked && (
              // Its own line on phones, so the phrase never breaks in the middle.
              <span className="block text-[13px] text-muted-foreground sm:inline sm:text-[14px]">
                <span className="hidden sm:inline"> · </span>
                {items} tasks<span className="hidden sm:inline"> with lessons</span>
              </span>
            )}
          </p>
          <button
            type="button"
            className="lp-text-btn px-1"
            onClick={() => setSelection(new Map())}
          >
            Clear
          </button>
          <button
            type="button"
            className="todo-btn todo-btn-primary px-4 py-2"
            onClick={() => setReviewOpen(true)}
          >
            <Icon name="PlusIcon" size={15} /> Add to project
          </button>
        </div>
      )}

      {reviewOpen && (
        <ReviewSheet
          selection={selection}
          onSelectionChange={setSelection}
          projects={projects}
          onClose={() => setReviewOpen(false)}
          onProjectCreated={onProjectCreated}
        />
      )}
    </div>
  );
}

/* ── Review & add ─────────────────────────────────────────────────────────────────────────────────────── */

function ReviewSheet({
  selection,
  onSelectionChange,
  projects,
  onClose,
  onProjectCreated,
}: {
  selection: LabSelection;
  onSelectionChange: (next: LabSelection) => void;
  projects: Project[];
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
}) {
  const router = useRouter();
  const openProjects = projects.filter((p) => p.status !== 'archived' && p.status !== 'completed');
  const [dest, setDest] = useState<'new' | number>('new');
  const [name, setName] = useState('');
  const [existing, setExisting] = useState<Map<string, number>>(new Map());
  const [loadingTree, setLoadingTree] = useState(false);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);

  const picks = useMemo(() => Array.from(selection.values()), [selection]);
  const suggested = suggestedProjectTitle(selection);
  const count = plannedItems(picks, existing);

  // An existing project: find what it already has from the labs, so nothing is added twice.
  useEffect(() => {
    if (dest === 'new') {
      setExisting(new Map());
      return;
    }
    let live = true;
    setLoadingTree(true);
    projectService.fetchProjectTree(dest).then((tree) => {
      if (!live) return;
      setExisting(linkedLabNodes(tree));
      setLoadingTree(false);
    });
    return () => {
      live = false;
    };
  }, [dest]);

  // The last pick removed here: nothing left to review.
  useEffect(() => {
    if (selection.size === 0) onClose();
  }, [selection.size, onClose]);

  const remove = (pick: LabPick) => {
    const next = new Map(selection);
    for (const [key, p] of next) if (p === pick) next.delete(key);
    onSelectionChange(next);
  };

  const run = async () => {
    if (running || count === 0) return;
    setRunning({ done: 0, total: count });
    let target: Project | null = null;
    if (dest === 'new') {
      const labs = selectionLabs(selection);
      target = await projectService.createProject({
        title: name.trim() || suggested,
        description: `Planned from ${labs.map((l) => labEntry(l).label).join(', ')}.`,
        color: '#8b5cf6',
        icon: labs.length === 1 ? PROJECT_ICON_FOR_LAB[labs[0]] : 'fc:study',
      });
      if (!target) {
        setRunning(null);
        return;
      }
      onProjectCreated(target);
    } else {
      target = openProjects.find((p) => p.id === dest) ?? null;
      if (!target) {
        setRunning(null);
        return;
      }
    }

    const result = await addLabPicksToProject(target.id, picks, {
      existing,
      onProgress: (done, total) => setRunning({ done, total }),
    });
    setRunning(null);
    if (result.added > 0) {
      toast.success(
        `Added ${result.added} item${result.added === 1 ? '' : 's'} to ${target.title}.`
      );
    }
    if (result.ok) {
      onSelectionChange(new Map());
      router.push(planUrls.project(target.id));
    }
  };

  const busy = running !== null;
  const actionLabel =
    count === 0
      ? 'Already in this project'
      : `${dest === 'new' ? 'Create and add' : 'Add'} ${count} item${count === 1 ? '' : 's'}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy="lp-review-title"
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
      className="ios-sheet flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[22px] sm:max-w-lg"
    >
      <div className="ios-sheet-grabber sm:hidden" data-sheet-grabber="" aria-hidden="true">
        <span />
      </div>
      <div className="ios-sheet-head sm:pt-4">
        <h2 id="lp-review-title" className="ios-sheet-title">
          Add to a project
        </h2>
        <button type="button" onClick={onClose} className="sheet-done" disabled={busy}>
          Cancel
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 sm:px-5">
        {/* Where it goes */}
        <section>
          <p className="lp-group-head">Project</p>
          <div className="drawer-group" role="radiogroup" aria-label="Project">
            <DestRow checked={dest === 'new'} onSelect={() => setDest('new')} disabled={busy}>
              <span className="drawer-icon drawer-icon-sm">
                <Icon name="FolderPlusIcon" size={15} />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">
                New project
              </span>
            </DestRow>
            {dest === 'new' && (
              <div className="lp-row py-2 pl-[3.1rem]">
                <label className="lp-search flex-1">
                  <span className="sr-only">Project name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={suggested}
                    maxLength={120}
                    disabled={busy}
                    data-autofocus
                  />
                </label>
              </div>
            )}
            {openProjects.map((p) => (
              <DestRow
                key={p.id}
                checked={dest === p.id}
                onSelect={() => setDest(p.id)}
                disabled={busy}
              >
                <span className="drawer-icon drawer-icon-sm">
                  <ProjectIcon icon={p.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1 break-words text-[15px] font-medium text-foreground">
                  {p.title}
                </span>
                {p.node_count !== undefined && (
                  <span className="text-[12px] text-muted-foreground">{p.node_count} items</span>
                )}
              </DestRow>
            ))}
          </div>
        </section>

        {/* What goes in */}
        <section>
          <p className="lp-group-head">
            <span>Selected</span>
            {loadingTree && <span className="font-normal">Checking the project…</span>}
          </p>
          <ul className="drawer-group">
            {picks.map((p) => {
              const entry = labEntry(p.lab);
              const topicThere = existing.has(labTopicHref(p.lab, p.topic.id));
              const newSubs = p.subtopicIds.filter(
                (id) => !existing.has(labTopicHref(p.lab, p.topic.id, id))
              ).length;
              const skipped = topicThere && newSubs === 0;
              return (
                <li key={`${p.lab}:${p.topic.id}`} className="lp-row items-center">
                  <span className="drawer-icon drawer-icon-sm">
                    <Icon name={entry.icon} size={15} />
                  </span>
                  <span className={`min-w-0 flex-1 ${skipped ? 'opacity-60' : ''}`}>
                    <span className="block break-words text-[15px] font-medium leading-snug text-foreground">
                      {p.topic.name}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {entry.label}
                      {skipped
                        ? ' · already in this project'
                        : topicThere
                          ? ` · ${newSubs} new lesson${newSubs === 1 ? '' : 's'} under it`
                          : p.subtopicIds.length > 0
                            ? ` · with ${p.subtopicIds.length} lesson${p.subtopicIds.length === 1 ? '' : 's'}`
                            : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="pe-act pe-act-danger h-8 w-8 justify-center px-0"
                    onClick={() => remove(p)}
                    disabled={busy}
                    aria-label={`Remove ${p.topic.name}`}
                    title="Remove"
                  >
                    <Icon name="XMarkIcon" size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div
        className="flex-shrink-0 border-t px-4 pb-[calc(1rem+var(--safe-bottom,0px))] pt-3 sm:px-5 sm:pb-4"
        style={{ borderColor: 'var(--color-separator)' }}
      >
        <button
          type="button"
          className="todo-btn todo-btn-primary h-11 w-full text-[15px]"
          onClick={run}
          disabled={busy || loadingTree || count === 0}
        >
          {running ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              Adding {running.done} of {running.total}…
            </>
          ) : (
            actionLabel
          )}
        </button>
      </div>
    </Modal>
  );
}

function DestRow({
  checked,
  onSelect,
  disabled,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      disabled={disabled}
      className="lp-lab-row min-h-[50px] gap-3 px-3.5"
    >
      {children}
      <Icon
        name="CheckIcon"
        size={18}
        strokeWidth={2.5}
        className={`shrink-0 text-primary ${checked ? '' : 'invisible'}`}
      />
    </button>
  );
}
