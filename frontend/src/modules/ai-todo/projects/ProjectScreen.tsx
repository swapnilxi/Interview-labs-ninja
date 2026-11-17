'use client';

import BackButton from '@/components/ui/BackButton';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import { useUrlState } from '@/lib/navigation/urlState';
import type { Project } from '@/lib/services/projectService';
import ProjectIcon from './ProjectIcon';
import ProjectExplorer from './ProjectExplorer';
import ProjectPlanner from './planner/ProjectPlanner';
import { planUrls, type ProjectSection } from './projectUrls';
import { PROJECT_STATUS_COLOR } from '../shared/semanticColors';

interface ProjectScreenProps {
  project: Project;
  model: 'ollama' | 'gemini';
}

const SECTIONS: { id: ProjectSection; label: string; icon: string }[] = [
  { id: 'explore', label: 'Explorer', icon: 'FolderOpenIcon' },
  { id: 'planner', label: 'AI planner', icon: 'SparklesIcon' },
];

/**
 * One project, at its own address: `?tab=plan&project=<id>` is the Explorer, `&section=planner` the AI Planner
 * (and `&step=` the planner's step). Back always returns to the list of projects.
 */
export default function ProjectScreen({ project, model }: ProjectScreenProps) {
  const { get, update } = useUrlState();
  const section: ProjectSection = get('section') === 'planner' ? 'planner' : 'explore';
  const color = project.color || '#3b82f6';

  return (
    <div className="flex flex-col gap-[1rem]">
      {/* Unboxed header (iOS large title): Back, the project's name and state, then its sections */}
      <header className="flex flex-col gap-3">
        <BackButton href={planUrls.list} label="Projects" className="-ml-1.5 self-start" />
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-[2.75rem] w-[2.75rem] shrink-0 items-center justify-center rounded-[12px]"
            style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}
          >
            <ProjectIcon icon={project.icon} size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-heading text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-xl">
              <span className="min-w-0 break-words">{project.title}</span>
              {project.is_top_20 && (
                <span className="inline-flex items-center gap-1 text-xs font-medium tracking-normal text-warning">
                  <FlatIcon name="star" size={12} /> Top 20%
                </span>
              )}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 capitalize">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PROJECT_STATUS_COLOR[project.status] || PROJECT_STATUS_COLOR.archived }} aria-hidden="true" />
                {project.status}
              </span>
              <span aria-hidden="true">·</span>
              <span>{project.priority.toUpperCase()}</span>
              {project.due_date && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Due {project.due_date}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="todo-segmented w-full sm:w-auto sm:self-start" role="group" aria-label="Project sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => update({ section: s.id === 'planner' ? 'planner' : null, step: null })}
              aria-pressed={section === s.id}
              className="todo-segment flex-1 gap-2 px-4 py-2 text-sm font-medium sm:flex-none"
            >
              <Icon name={s.icon} size={15} variant={section === s.id ? 'solid' : 'outline'} />
              {s.label}
            </button>
          ))}
        </div>
      </header>

      {section === 'planner' ? <ProjectPlanner key={project.id} project={project} model={model} /> : <ProjectExplorer project={project} model={model} />}
    </div>
  );
}
