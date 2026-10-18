'use client';

import { useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import ConfirmHost from '@/components/ui/ConfirmHost';
import { useUrlState } from '@/lib/navigation/urlState';
import { toast } from '@/lib/ui/toast';
import { useLabProjects } from '@/modules/common/lab/project/useLabProjects';
import ProjectFormDialog from '@/modules/labs-project/ProjectFormDialog';
import ProjectScreen, { type ProjectTab } from '@/modules/labs-project/ProjectScreen';
import ProjectsList, { type StatusFilter } from '@/modules/labs-project/ProjectsList';
import SectionDetail from '@/modules/labs-project/SectionDetail';
import { ErrorBlock, LoadingBlock, primaryButton } from '@/modules/labs-project/ui';

const positiveInt = (value: string | null): number | null => {
  const n = value && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Labs Project. The screen is in the URL, so every screen has an address and Back works:
 *
 *   /labs-project                                        projects (status=active|archived|all)
 *   /labs-project?project=ID&tab=sections|context        one project (an unknown id falls back to the list)
 *   /labs-project?project=ID&tab=sections&section=ID     one saved section (an unknown id falls back to the list)
 *   /labs-project?new=1                                  the list with the New project dialog open
 */
export default function LabsProjectModule() {
  const { get, update } = useUrlState();
  const { allProjects, selectedId, loaded, loading, error, refresh } = useLabProjects();

  const projectId = positiveInt(get('project'));
  const sectionId = positiveInt(get('section'));
  const tab: ProjectTab = get('tab') === 'context' ? 'context' : 'sections';
  const statusParam = get('status');
  const status: StatusFilter =
    statusParam === 'archived' || statusParam === 'all' ? statusParam : 'active';
  const newOpen = get('new') === '1';

  const project = projectId !== null ? allProjects.find((p) => p.id === projectId) : undefined;
  const unknownProject = loaded && projectId !== null && !project;

  // A project id that isn't one of this user's projects (deleted, mistyped, someone else's) falls back to the list.
  useEffect(() => {
    if (!unknownProject) return;
    toast.info('That project no longer exists.');
    update({ project: null, tab: null, section: null }, 'replace');
  }, [unknownProject, update]);

  const closeNew = () => update({ new: null }, 'replace');

  let body: React.ReactNode;
  if (!loaded && error) {
    body = <ErrorBlock message={error} onRetry={() => void refresh()} />;
  } else if (!loaded || unknownProject) {
    body = <LoadingBlock label={loading || !loaded ? 'Loading your projects…' : 'Opening…'} />;
  } else if (project && sectionId !== null) {
    body = (
      <SectionDetail
        key={`${project.id}-${sectionId}`}
        project={project}
        sectionId={sectionId}
        onDeleted={() => update({ section: null, tab: 'sections' }, 'replace')}
      />
    );
  } else if (project) {
    body = (
      <ProjectScreen
        project={project}
        tab={tab}
        inUse={project.id === selectedId}
        onTab={(next) => update({ tab: next })}
        onDeleted={() => update({ project: null, tab: null, section: null }, 'replace')}
      />
    );
  } else {
    body = (
      <>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Projects give the labs something real to work on. Pick one in a lab and its answers are
            written for it; save the ones you want to keep and they become knowledge the next lab
            can build on.
          </p>
          <button type="button" className={primaryButton} onClick={() => update({ new: 1 })}>
            <Icon name="PlusIcon" size={16} />
            New project
          </button>
        </div>
        <ProjectsList
          projects={allProjects}
          selectedId={selectedId}
          status={status}
          onStatusChange={(next) => update({ status: next === 'active' ? null : next }, 'replace')}
          onNew={() => update({ new: 1 })}
        />
      </>
    );
  }

  return (
    <>
      {body}
      <ProjectFormDialog
        isOpen={newOpen && loaded}
        onClose={closeNew}
        onCreated={(created) => {
          // Leaves the list for the new project: its Context tab when there is none yet, else its sections.
          update({ new: null, project: created.id, tab: created.context ? 'sections' : 'context' });
        }}
      />
      <ConfirmHost />
    </>
  );
}
