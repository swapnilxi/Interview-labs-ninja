'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import ConfirmHost from '@/components/ui/ConfirmHost';
import { useUrlState } from '@/lib/navigation/urlState';
import { toast } from '@/lib/ui/toast';
import { useLabProjects } from '@/modules/labs/common/project/useLabProjects';
import ProjectScreen, { type ProjectTab } from '@/modules/labs/project/ProjectScreen';
import ProjectsList, { type StatusFilter } from '@/modules/labs/project/ProjectsList';
import SectionDetail from '@/modules/labs/project/SectionDetail';
import { ErrorBlock, LoadingBlock, primaryButton } from '@/modules/labs/project/ui';

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
 *   /labs-project/new                                    New project (its own page; the old /labs-project?new=1 redirects there)
 */
export default function LabsProjectModule() {
  const router = useRouter();
  const { get, update } = useUrlState();
  const { allProjects, selectedId, loaded, loading, error, refresh } = useLabProjects();

  const projectId = positiveInt(get('project'));
  const sectionId = positiveInt(get('section'));
  const tab: ProjectTab = get('tab') === 'context' ? 'context' : 'sections';
  const statusParam = get('status');
  const status: StatusFilter =
    statusParam === 'archived' || statusParam === 'all' ? statusParam : 'active';

  const project = projectId !== null ? allProjects.find((p) => p.id === projectId) : undefined;
  const unknownProject = loaded && projectId !== null && !project;

  // A project id that isn't one of this user's projects (deleted, mistyped, someone else's) falls back to the list.
  useEffect(() => {
    if (!unknownProject) return;
    toast.info('That project no longer exists.');
    update({ project: null, tab: null, section: null }, 'replace');
  }, [unknownProject, update]);

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
          <p className="max-w-xl text-[0.9375rem] leading-relaxed mix-text-foreground/[0.68]">
            Pick a project in any lab — its context is woven into every answer. Save the answers
            you want to keep; they become knowledge future generations can build on.
          </p>
          <Link href="/labs-project/new" className={primaryButton}>
            <Icon name="PlusIcon" size={15} />
            New project
          </Link>
        </div>
        <ProjectsList
          projects={allProjects}
          selectedId={selectedId}
          status={status}
          onStatusChange={(next) => update({ status: next === 'active' ? null : next }, 'replace')}
          onNew={() => router.push('/labs-project/new')}
        />
      </>
    );
  }

  return (
    <>
      {body}
      {/* the question dialog is portalled to <body>, outside the page frame: give it the same hairline and weight */}
      <ConfirmHost panelClassName="lab-page" />
    </>
  );
}
