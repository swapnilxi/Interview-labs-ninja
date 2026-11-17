'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import BackButton from '@/components/ui/BackButton';
import { useUrlState } from '@/lib/navigation/urlState';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import ProjectIcon from './ProjectIcon';
import EisenhowerMatrix, { MatrixItem } from '@/components/ui/EisenhowerMatrix';
import ProjectCard from './ProjectCard';
import ProjectScreen from './ProjectScreen';
import { parseProjectId, planUrls } from './projectUrls';
import ProjectRoadmap from './ProjectRoadmap';
import CreateProjectModal from './CreateProjectModal';
import LabPlanView from '../labs/LabPlanView';
import { Project, ProjectNodeFlat, projectService } from '@/lib/services/projectService';
import { paretoService } from '@/lib/services/paretoService';
import { toast } from '@/lib/ui/toast';
import { confirmParetoRun } from '../shared/confirmPareto';

type PlanSubView = 'projects' | 'matrix' | 'roadmap' | 'labs';
const VALID_VIEWS: PlanSubView[] = ['projects', 'matrix', 'roadmap', 'labs'];

const VIEW_META: Record<PlanSubView, { label: string; icon: string }> = {
  projects: { label: 'Projects', icon: 'FolderIcon' },
  matrix: { label: 'Matrix', icon: 'Squares2X2Icon' },
  roadmap: { label: 'Roadmap', icon: 'MapIcon' },
  labs: { label: 'Lab plan', icon: 'BeakerIcon' },
};

interface PlanProjectProps {
  model: 'ollama' | 'gemini';
}

// ── Tab instructions ──────────────────────────────────────────────────────────

const TAB_GUIDE: Record<PlanSubView, { title: string; steps: string[] }> = {
  projects: {
    title: 'Projects',
    steps: [
      'Open a project card. Each project has its own address you can bookmark or share.',
      'Explore builds the node tree, AI planner writes a plan from your requirements, and Roadmap gives a quick phase outline.',
      'In Explorer, Dive deeper splits a node into subtopics and Chunk it into actionable tasks.',
      'Send nodes to Smart To-Do or Quick Daily with one click.',
      'Delete, on a card’s footer, removes the project and all its nodes for good.',
    ],
  },
  matrix: {
    title: 'Eisenhower matrix',
    steps: [
      'Drag tasks and subtasks from all active projects between the four quadrants.',
      'Each card shows the task title, project, node type and export status.',
      'Click a card to open it in its Project Explorer.',
      'Do now: urgent and important. Start here.',
      'Schedule: important, not urgent. Set time aside.',
      'Delegate: urgent, not important. Hand off if you can.',
      'Eliminate: neither. Consider dropping.',
      'Auto-sort lets AI place every project task and subtask in a quadrant.',
    ],
  },
  roadmap: {
    title: 'Roadmap',
    steps: [
      'Select a project from the dropdown.',
      'Click Generate roadmap. AI writes 3–5 phases with tasks and milestones.',
      'Each phase card shows its duration, key tasks and a milestone.',
      'Hover a task to send it to Smart To-Do or Quick Daily.',
    ],
  },
  labs: {
    title: 'Lab plan',
    steps: [
      'Pick a lab, then tick the topics you want to work through. Open a topic to choose its lessons.',
      'Mix labs freely: the bar at the bottom keeps everything you picked.',
      'Add to project puts them in a new or existing project; each item links back to its lab page.',
      'Inside a project, From lab in the Explorer adds more without leaving it.',
    ],
  },
};

// ── Card Renderer for Project Tasks in Matrix ─────────────────────────────────

function ProjectNodeMatrixCard({ node }: { node: ProjectNodeFlat }) {
  const color = node.project_color || '#3b82f6';
  return (
    <div className="bg-card border mix-border-border/70 rounded-xl p-3 shadow-sm hover:shadow-md transition-smooth flex flex-col gap-2 cursor-pointer group">
      {/* Project Pill Header */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium truncate max-w-[200px]"
          style={{
            backgroundColor: `${color}15`,
            border: `1px solid ${color}35`,
            color: color,
          }}
        >
          <span className="inline-flex"><ProjectIcon icon={node.project_icon} size={14} /></span>
          <span className="truncate">{node.project_title}</span>
        </div>

        {node.is_top_20 && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-warning">
            <FlatIcon name="star" size={12} /> 20%
          </span>
        )}
      </div>

      {/* Task Title */}
      <div className="text-xs font-medium text-foreground group-hover:text-primary transition-smooth leading-snug">
        {node.title}
      </div>

      {/* Footer Badges */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs font-medium text-muted-foreground pt-1.5 border-t mix-border-border/40">
        <span className="text-xs font-medium capitalize">
          {node.node_type}
        </span>
        <span className="text-xs">
          L{node.depth_level}
        </span>
        {node.exported_to_smart_todo && (
          <span className="ml-auto flex items-center gap-0.5 text-xs font-medium">
            <FlatIcon name="brain" size={14} quiet /> Smart
          </span>
        )}
        {node.exported_to_quick && (
          <span className="ml-auto flex items-center gap-0.5 text-xs font-medium">
            <FlatIcon name="quick" size={14} quiet /> Quick
          </span>
        )}
      </div>
    </div>
  );
}

export default function PlanProject({ model }: PlanProjectProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Sub-view driven by ?view= param
  const rawView = searchParams.get('view') as PlanSubView | null;
  const activeSubView: PlanSubView = rawView && VALID_VIEWS.includes(rawView) ? rawView : 'projects';

  // A project is `?project=<id>`; on the Projects view it opens the project's own screen, on Roadmap it picks the project.
  const { update } = useUrlState();
  const projectId = parseProjectId(searchParams.get('project'));

  // Switching sub-view starts that view at its top: a chosen project, section or step does not follow.
  const setActiveSubView = (view: PlanSubView) => {
    router.push(view === 'projects' ? planUrls.list : `${planUrls.list}&view=${view}`);
  };

  const [showGuide, setShowGuide] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectNodes, setProjectNodes] = useState<ProjectNodeFlat[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [autoSortLoading, setAutoSortLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    const fetched = await projectService.fetchProjects();
    setProjects(fetched);
    setLoading(false);
  };

  const loadProjectNodes = async () => {
    setNodesLoading(true);
    const nodes = await projectService.fetchFlatProjectNodes();
    setProjectNodes(nodes);
    setNodesLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const activeProject = projectId === null ? null : projects.find(p => p.id === projectId) ?? null;

  // Fetch project nodes whenever switching to matrix view
  useEffect(() => {
    if (activeSubView === 'matrix') {
      loadProjectNodes();
    }
  }, [activeSubView]);

  // Re-show guide when sub-view changes
  useEffect(() => {
    setShowGuide(true);
  }, [activeSubView]);

  const handleNodeQuadrantChange = async (itemId: string | number, newQuadrant: any) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    const previous = projectNodes.find(n => n.id === id)?.eisenhower_quadrant ?? null;
    setProjectNodes(prev =>
      prev.map(n => (n.id === id ? { ...n, eisenhower_quadrant: newQuadrant } : n))
    );
    const updated = await projectService.updateProjectNode(id, { eisenhower_quadrant: newQuadrant });
    // Not saved (the service already toasted why): move the card back.
    if (!updated) {
      setProjectNodes(prev => prev.map(n => (n.id === id ? { ...n, eisenhower_quadrant: previous } : n)));
    }
  };

  const handleNodeAutoSort = async () => {
    setAutoSortLoading(true);
    setAiError(null);
    try {
      await projectService.eisenhowerAutoNodes(model);
      await loadProjectNodes();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Auto-sort failed.');
    } finally {
      setAutoSortLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!(await confirmParetoRun('plan', 'all your projects and topics'))) return;
    setAnalyzeLoading(true);
    try {
      const result = await paretoService.analyze('plan', model);
      paretoService.markAnalyzedToday('plan');
      await loadProjects();
      if (activeSubView === 'matrix') await loadProjectNodes();
      toast.success(`Found ${result.top20_count ?? 0} high-leverage item${(result.top20_count ?? 0) === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleDelete = async (project: Project) => {
    const ok = await projectService.deleteProject(project.id);
    if (ok) {
      setProjects(prev => prev.filter(p => p.id !== project.id));
    }
  };

  const matrixNodeItems = projectNodes.map(n => ({
    ...n,
    id: n.id.toString(),
    quadrant: n.eisenhower_quadrant || null,
  })) as unknown as (MatrixItem & ProjectNodeFlat)[];

  // A project is open on the Projects view: it has its own screen (Explorer / AI Planner) and Back.
  if (projectId !== null && activeSubView === 'projects') {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-[4rem]" role="status" aria-label="Loading the project">
          <span className="w-[1.5rem] h-[1.5rem] border-2 mix-border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      );
    }
    if (!activeProject) {
      return (
        <div className="todo-glass mx-auto mt-4 flex max-w-xl flex-col items-center gap-4 px-[2rem] py-[3rem] text-center">
          <span className="todo-icon-chip h-[3.5rem] w-[3.5rem]">
            <Icon name="FolderIcon" size={26} />
          </span>
          <div>
            <p className="font-heading text-base font-semibold text-foreground">Project not found</p>
            <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or it belongs to another account.</p>
          </div>
          <BackButton href={planUrls.list} label="Back to projects" />
        </div>
      );
    }
    return <ProjectScreen key={activeProject.id} project={activeProject} model={model} />;
  }

  const guide = TAB_GUIDE[activeSubView];

  return (
    <div className="relative flex h-full flex-col gap-[1.25rem] sm:gap-[1.75rem]">
      {/* Header & Sub-view Switcher: unboxed — a full-width segmented control on phones, actions under it. */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="todo-segmented w-full shrink-0 sm:w-auto">
          {VALID_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveSubView(view)}
              aria-pressed={activeSubView === view}
              className="todo-segment flex-1 gap-1.5 px-2 py-2 text-sm font-medium sm:flex-none sm:px-4"
            >
              {/* Phones fit four segments by dropping the icons */}
              <Icon name={VIEW_META[view].icon} size={15} variant={activeSubView === view ? 'solid' : 'outline'} className="hidden sm:block" />
              {VIEW_META[view].label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
          <button
            onClick={handleAnalyze}
            disabled={analyzeLoading}
            className="todo-btn todo-btn-quiet px-4 py-2.5"
            title="Run AI 80/20 analysis on all projects"
          >
            {analyzeLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="StarIcon" size={14} variant="solid" className="text-primary" />
            )}
            <span>Analyze 80/20</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="todo-btn todo-btn-primary flex-1 px-4 py-2.5 sm:flex-none"
          >
            <Icon name="PlusIcon" size={16} /> New project
          </button>
        </div>
      </div>

      {/* AI action error */}
      {aiError && (
        <div className="todo-alert todo-alert-error" role="alert">
          <FlatIcon name="warning" size={16} className="mt-px" />
          <p className="flex-1 text-[13px] leading-relaxed text-inherit">{aiError}</p>
          <button
            onClick={() => setAiError(null)}
            aria-label="Dismiss"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>
      )}

      {/* ── How-to guide banner ─────────────────────────────────────────── */}
      {showGuide && (
        <div className="todo-glass relative animate-fade-in px-4 py-4 sm:px-[1.5rem] sm:py-[1.25rem]">
          <button
            onClick={() => setShowGuide(false)}
            className="todo-focus absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Dismiss"
            aria-label="Dismiss guide"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
          <div className="flex items-start gap-3 pr-8 sm:gap-4">
            <span className="todo-icon-chip h-9 w-9 shrink-0 rounded-[10px]">
              <Icon name="LightBulbIcon" size={18} />
            </span>
            <div>
              <p className="mb-2 text-[15px] font-medium text-foreground">{guide.title}</p>
              <ol className="space-y-2">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
                    <span className="lab-ink mt-px shrink-0 font-medium tabular-nums">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeSubView === 'projects' && (
          <div className="h-full overflow-y-auto scrollbar-clean pr-2">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                <span className="w-[1.5rem] h-[1.5rem] border-2 mix-border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <div className="todo-glass todo-lit mx-auto mt-4 flex max-w-xl flex-col items-center gap-5 px-[2rem] py-[3rem] text-center text-muted-foreground">
                <span className="todo-icon-chip h-[4rem] w-[4rem]">
                  <Icon name="FolderPlusIcon" size={30} />
                </span>
                <div className="text-center">
                  <p className="font-heading text-base font-semibold text-foreground">No projects yet</p>
                  <p className="mt-1.5 text-sm">Click <strong className="text-foreground">New project</strong> to start planning.</p>
                </div>
              </div>
            ) : (
              <div className="todo-stagger grid grid-cols-1 gap-[1.5rem] md:grid-cols-2 xl:grid-cols-3">
                {projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeSubView === 'matrix' && (
          <div className="h-full">
            {nodesLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
                <span className="w-[1.5rem] h-[1.5rem] border-2 mix-border-primary/20 border-t-primary rounded-full animate-spin" />
                <span className="text-xs">Loading project tasks…</span>
              </div>
            ) : projectNodes.length === 0 ? (
              <div className="todo-glass mx-auto mt-4 flex max-w-xl flex-col items-center gap-4 px-[2rem] py-[3rem] text-center text-muted-foreground">
                <span className="todo-icon-chip h-[3.5rem] w-[3.5rem]">
                  <Icon name="Squares2X2Icon" size={26} />
                </span>
                <div className="text-center">
                  <p className="text-sm font-medium">No project tasks yet</p>
                  <p className="text-xs mt-1">Open a project in the <strong>Projects</strong> tab to add topics & tasks.</p>
                </div>
              </div>
            ) : (
              <EisenhowerMatrix
                tone="calm"
                items={matrixNodeItems}
                onQuadrantChange={handleNodeQuadrantChange}
                showAutoSort={true}
                onAutoSort={handleNodeAutoSort}
                autoSortLoading={autoSortLoading}
                itemRenderer={(item, isDragging) => {
                  const openProject = () => {
                    if (isDragging) return;
                    router.push(planUrls.project(item.project_id));
                  };
                  return (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${item.title} in its project`}
                      onClick={openProject}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openProject();
                        }
                      }}
                      className="todo-focus rounded-xl"
                    >
                      <ProjectNodeMatrixCard node={item} />
                    </div>
                  );
                }}
              />
            )}
          </div>
        )}

        {activeSubView === 'labs' && (
          <LabPlanView projects={projects} onProjectCreated={(p) => setProjects((prev) => [p, ...prev.filter((x) => x.id !== p.id)])} />
        )}

        {activeSubView === 'roadmap' && (
          <div className="h-full">
            <ProjectRoadmap
              key={activeProject?.id ?? 'none'}
              project={activeProject}
              projects={projects}
              onSelectProject={(p) => update({ project: p.id }, 'replace')}
              model={model}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(newProject) => {
            setShowCreateModal(false);
            setProjects(prev => [newProject, ...prev]);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}
