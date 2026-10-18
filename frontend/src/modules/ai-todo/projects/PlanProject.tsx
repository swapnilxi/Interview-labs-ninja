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
import { Project, ProjectNodeFlat, projectService } from '@/lib/services/projectService';
import { paretoService } from '@/lib/services/paretoService';
import { toast } from '@/lib/ui/toast';
import { confirmParetoRun } from '../shared/confirmPareto';

type PlanSubView = 'projects' | 'matrix' | 'roadmap';
const VALID_VIEWS: PlanSubView[] = ['projects', 'matrix', 'roadmap'];

interface PlanProjectProps {
  model: 'ollama' | 'gemini';
}

// ── Tab instructions ──────────────────────────────────────────────────────────

const TAB_GUIDE: Record<PlanSubView, { title: string; steps: string[] }> = {
  projects: {
    title: 'Projects — Your Planning Hub',
    steps: [
      'Click a project card to open it. Every project has its own address you can bookmark or share.',
      'Use Explore to build the node tree, AI Planner to plan it with AI from your requirements, or Roadmap for a quick phase outline.',
      'Inside Explorer: use Dive Deeper (strategic subtopics) or Chunk It (actionable tasks) on any node.',
      'Push nodes to Smart To-Do or Quick Daily with a single click.',
      'Click Delete on any card footer to permanently remove the project and all its nodes.',
    ],
  },
  matrix: {
    title: 'Eisenhower Matrix — Project Tasks & Subtasks',
    steps: [
      'Drag tasks & subtasks from across all active projects between the four quadrants.',
      'Each card shows the task title, project name, node type, and export status.',
      'Click any task card to jump straight into its Project Explorer.',
      'Do Now — urgent + important: tackle these first.',
      'Schedule — important, not urgent: plan dedicated time.',
      'Delegate — urgent, not important: hand off if possible.',
      'Eliminate — neither: consider dropping.',
      'Click AI Auto-Sort to let AI categorize all project tasks & subtasks into quadrants.',
    ],
  },
  roadmap: {
    title: 'Roadmap — AI-Generated Phase Plan',
    steps: [
      'Select a project from the dropdown.',
      'Click Generate Roadmap — AI creates 3-5 structured phases with tasks & milestones.',
      'Each phase card shows duration, key tasks, and a milestone target.',
      'Hover a task row to push it directly to Smart To-Do or Quick Daily.',
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
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold truncate max-w-[200px]"
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
          <span className="text-xs font-bold px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400 shrink-0 flex items-center gap-0.5">
            <FlatIcon name="star" size={12} /> 20%
          </span>
        )}
      </div>

      {/* Task Title */}
      <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-smooth leading-snug">
        {node.title}
      </div>

      {/* Footer Badges */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs font-medium text-muted-foreground pt-1.5 border-t mix-border-border/40">
        <span className="uppercase tracking-wider font-bold bg-muted px-1.5 py-0.5 rounded text-[11px]">
          {node.node_type}
        </span>
        <span className="mix-bg-muted/70 px-1.5 py-0.5 rounded text-xs">
          L{node.depth_level}
        </span>
        {node.exported_to_smart_todo && (
          <span className="text-emerald-500 font-bold flex items-center gap-0.5 ml-auto text-xs">
            <FlatIcon name="brain" size={14} /> Smart
          </span>
        )}
        {node.exported_to_quick && (
          <span className="text-amber-500 font-bold flex items-center gap-0.5 ml-auto text-xs">
            <FlatIcon name="quick" size={14} /> Quick
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
    <div className="flex flex-col h-full gap-[1.75rem] relative">
      {/* Header & Sub-view Switcher */}
      <div className="todo-glass todo-lit flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-[1.25rem]">
        <div className="todo-segmented shrink-0 p-1">
          {(['projects', 'matrix', 'roadmap'] as PlanSubView[]).map((view) => {
            const icons: Record<PlanSubView, string> = { projects: 'FolderIcon', matrix: 'Squares2X2Icon', roadmap: 'MapIcon' };
            const labels: Record<PlanSubView, string> = { projects: 'Projects', matrix: 'Matrix', roadmap: 'Roadmap' };
            return (
              <button
                key={view}
                onClick={() => setActiveSubView(view)}
                aria-pressed={activeSubView === view}
                className="todo-segment gap-2 px-4 py-2 text-sm font-semibold"
              >
                <Icon name={icons[view]} size={15} variant={activeSubView === view ? 'solid' : 'outline'} /> {labels[view]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleAnalyze}
            disabled={analyzeLoading}
            className="todo-btn todo-btn-secondary px-4 py-2.5"
            title="Run AI 80/20 analysis on all projects"
          >
            {analyzeLoading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="StarIcon" size={14} variant="solid" className="text-primary" />
            )}
            <span className="hidden sm:inline">80/20 Analyze</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="todo-btn todo-btn-primary px-4 py-2.5"
          >
            <Icon name="PlusIcon" size={14} variant="solid" /> New Project
          </button>
        </div>
      </div>

      {/* AI action error */}
      {aiError && (
        <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <FlatIcon name="warning" size={16} className="mt-px" />
          <p className="text-xs text-red-600 dark:text-red-400 flex-1 leading-relaxed">{aiError}</p>
          <button onClick={() => setAiError(null)} className="text-red-500/70 hover:text-red-500 shrink-0">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

      {/* ── How-to guide banner ─────────────────────────────────────────── */}
      {showGuide && (
        <div className="todo-glass relative px-[1.5rem] py-[1.25rem] animate-fade-in">
          <button
            onClick={() => setShowGuide(false)}
            className="todo-focus absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Dismiss"
          >
            <Icon name="XMarkIcon" size={13} />
          </button>
          <div className="flex items-start gap-4 pr-8">
            <span className="todo-icon-chip h-9 w-9 shrink-0">
              <Icon name="LightBulbIcon" size={18} />
            </span>
            <div>
              <p className="mb-2 text-sm font-bold text-foreground">{guide.title}</p>
              <ul className="space-y-1.5">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="text-primary font-bold shrink-0 mt-px">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
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
                  <p className="mt-1.5 text-sm">Click <strong className="text-foreground">New Project</strong> to start planning.</p>
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
                <span className="text-xs">Loading project tasks & subtasks...</span>
              </div>
            ) : projectNodes.length === 0 ? (
              <div className="todo-glass mx-auto mt-4 flex max-w-xl flex-col items-center gap-4 px-[2rem] py-[3rem] text-center text-muted-foreground">
                <span className="todo-icon-chip h-[3.5rem] w-[3.5rem]">
                  <Icon name="Squares2X2Icon" size={26} />
                </span>
                <div className="text-center">
                  <p className="text-sm font-medium">No project tasks found.</p>
                  <p className="text-xs mt-1">Open a project in the <strong>Projects</strong> tab to add topics & tasks.</p>
                </div>
              </div>
            ) : (
              <EisenhowerMatrix
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
