'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import EisenhowerMatrix, { MatrixItem } from '@/components/ui/EisenhowerMatrix';
import ProjectCard from './ProjectCard';
import ProjectExplorer from './ProjectExplorer';
import ProjectRoadmap from './ProjectRoadmap';
import CreateProjectModal from './CreateProjectModal';
import { Project, ProjectNodeFlat, projectService } from '@/lib/services/projectService';
import { paretoService } from '@/lib/services/paretoService';

type PlanSubView = 'projects' | 'matrix' | 'roadmap';
const VALID_VIEWS: PlanSubView[] = ['projects', 'matrix', 'roadmap'];

interface PlanProjectProps {
  model: 'ollama' | 'gemini';
}

// ── Tab instructions ──────────────────────────────────────────────────────────

const TAB_GUIDE: Record<PlanSubView, { icon: string; title: string; steps: string[] }> = {
  projects: {
    icon: '📁',
    title: 'Projects — Your Planning Hub',
    steps: [
      'Click a project card body to open its Explorer and add/AI-generate topics.',
      'Use 🔍 Explore to build the node tree, or 🗺️ Roadmap for an AI phase plan.',
      'Inside Explorer: use 🔍 Dive Deeper (strategic subtopics) or ⚡ Chunk It (actionable tasks) on any node.',
      'Push nodes to Smart To-Do (🧠) or Quick Daily (⚡) with a single click.',
      'Click 🗑️ Delete on any card footer to permanently remove the project and all its nodes.',
    ],
  },
  matrix: {
    icon: '🟦',
    title: 'Eisenhower Matrix — Project Tasks & Subtasks',
    steps: [
      'Drag tasks & subtasks from across all active projects between the four quadrants.',
      'Each card shows the task title, project name, node type, and export status.',
      'Click any task card to jump straight into its Project Explorer.',
      '✅ Do Now — urgent + important: tackle these first.',
      '📅 Schedule — important, not urgent: plan dedicated time.',
      '🤝 Delegate — urgent, not important: hand off if possible.',
      '🗑️ Eliminate — neither: consider dropping.',
      'Click 🤖 AI Auto-Sort to let AI categorize all project tasks & subtasks into quadrants.',
    ],
  },
  roadmap: {
    icon: '🗺️',
    title: 'Roadmap — AI-Generated Phase Plan',
    steps: [
      'Select a project from the dropdown.',
      'Click 🤖 Generate Roadmap — AI creates 3-5 structured phases with tasks & milestones.',
      'Each phase card shows duration, key tasks, and a milestone target.',
      'Hover a task row to push it directly to Smart To-Do (🧠) or Quick Daily (⚡).',
    ],
  },
};

// ── Card Renderer for Project Tasks in Matrix ─────────────────────────────────

function ProjectNodeMatrixCard({ node }: { node: ProjectNodeFlat }) {
  const color = node.project_color || '#3b82f6';
  return (
    <div className="bg-card border border-border/70 rounded-xl p-3 shadow-sm hover:shadow-md transition-smooth flex flex-col gap-2 cursor-pointer group">
      {/* Project Pill Header */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold truncate max-w-[200px]"
          style={{
            backgroundColor: `${color}15`,
            border: `1px solid ${color}35`,
            color: color,
          }}
        >
          <span>{node.project_icon || '📁'}</span>
          <span className="truncate">{node.project_title}</span>
        </div>

        {node.is_top_20 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400 shrink-0 flex items-center gap-0.5">
            ⭐ 20%
          </span>
        )}
      </div>

      {/* Task Title */}
      <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-smooth leading-snug">
        {node.title}
      </div>

      {/* Footer Badges */}
      <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-medium text-muted-foreground pt-1.5 border-t border-border/40">
        <span className="uppercase tracking-wider font-bold bg-muted px-1.5 py-0.5 rounded text-[8px]">
          {node.node_type}
        </span>
        <span className="bg-muted/70 px-1.5 py-0.5 rounded text-[8px]">
          L{node.depth_level}
        </span>
        {node.exported_to_smart_todo && (
          <span className="text-emerald-500 font-bold flex items-center gap-0.5 ml-auto text-[8px]">
            🧠 Smart
          </span>
        )}
        {node.exported_to_quick && (
          <span className="text-amber-500 font-bold flex items-center gap-0.5 ml-auto text-[8px]">
            ⚡ Quick
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

  const setActiveSubView = (view: PlanSubView) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'plan');
    params.set('view', view);
    router.push(`/todo?${params.toString()}`);
  };

  const [showGuide, setShowGuide] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectNodes, setProjectNodes] = useState<ProjectNodeFlat[]>([]);
  const [loading, setLoading] = useState(true);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [autoSortLoading, setAutoSortLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeToast, setAnalyzeToast] = useState<string | null>(null);

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
    setProjectNodes(prev =>
      prev.map(n => (n.id === id ? { ...n, eisenhower_quadrant: newQuadrant } : n))
    );
    await projectService.updateProjectNode(id, { eisenhower_quadrant: newQuadrant });
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

  const handleActionClick = (project: Project, action: 'dive' | 'chunk' | 'roadmap') => {
    if (action === 'roadmap') {
      setActiveProject(project);
      setActiveSubView('roadmap');
    } else {
      setActiveProject(project);
    }
  };

  const handleAnalyze = async () => {
    if (paretoService.hasAnalyzedToday('plan')) {
      if (!confirm('You already ran analysis today. Results may be similar. Continue?')) return;
    }
    if (!confirm('AI will analyze all your projects and topics and identify the top 20% that will drive 80% of your results. This takes a few seconds.')) return;
    setAnalyzeLoading(true);
    try {
      const result = await paretoService.analyze('plan', model);
      paretoService.markAnalyzedToday('plan');
      await loadProjects();
      if (activeSubView === 'matrix') await loadProjectNodes();
      setAnalyzeToast(`⭐ Found ${result.top20_count ?? 0} high-leverage item${(result.top20_count ?? 0) === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total`);
    } catch (err) {
      setAnalyzeToast(err instanceof Error ? `⚠️ ${err.message}` : '⚠️ Analysis failed.');
    } finally {
      setAnalyzeLoading(false);
      setTimeout(() => setAnalyzeToast(null), 4000);
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

  // If a project is selected for explorer in 'projects' view
  if (activeProject && activeSubView === 'projects') {
    return (
      <ProjectExplorer
        project={activeProject}
        onClose={() => setActiveProject(null)}
        model={model}
      />
    );
  }

  const guide = TAB_GUIDE[activeSubView];

  return (
    <div className="flex flex-col h-full gap-3 relative">
      {/* Header & Sub-view Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/80 rounded-xl p-3 shadow-sm">
        <div className="inline-flex items-center p-1 bg-muted/50 rounded-lg border border-border shrink-0">
          {(['projects', 'matrix', 'roadmap'] as PlanSubView[]).map((view) => {
            const icons: Record<PlanSubView, string> = { projects: '📁', matrix: '🟦', roadmap: '🗺️' };
            const labels: Record<PlanSubView, string> = { projects: 'Projects', matrix: 'Matrix', roadmap: 'Roadmap' };
            return (
              <button
                key={view}
                onClick={() => setActiveSubView(view)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-smooth ${
                  activeSubView === view
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <span>{icons[view]}</span> {labels[view]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAnalyze}
            disabled={analyzeLoading}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-400/50 bg-amber-400/5 text-amber-600 dark:text-amber-400 hover:bg-amber-400/10 transition-smooth flex items-center gap-1.5 disabled:opacity-50"
            title="Run AI 80/20 analysis on all projects"
          >
            {analyzeLoading ? (
              <span className="w-3 h-3 border border-amber-500/40 border-t-amber-500 rounded-full animate-spin" />
            ) : '⭐'}
            <span className="hidden sm:inline">80/20 Analyze</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-smooth flex items-center gap-2 justify-center"
          >
            <Icon name="PlusIcon" size={14} variant="solid" /> New Project
          </button>
        </div>
      </div>

      {/* 80/20 Analyze toast */}
      {analyzeToast && (
        <div className="fixed top-20 right-6 z-[200] px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold bg-amber-500 text-white animate-slide-up">
          {analyzeToast}
        </div>
      )}

      {/* AI action error */}
      {aiError && (
        <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <span className="text-xs shrink-0">⚠️</span>
          <p className="text-[11px] text-red-600 dark:text-red-400 flex-1 leading-relaxed">{aiError}</p>
          <button onClick={() => setAiError(null)} className="text-red-500/70 hover:text-red-500 shrink-0">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

      {/* ── How-to guide banner ─────────────────────────────────────────── */}
      {showGuide && (
        <div className="relative bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5 border border-primary/20 rounded-xl px-4 py-3 animate-in fade-in duration-200">
          <button
            onClick={() => setShowGuide(false)}
            className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-smooth"
            title="Dismiss"
          >
            <Icon name="XMarkIcon" size={13} />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <span className="text-xl shrink-0">{guide.icon}</span>
            <div>
              <p className="text-xs font-bold text-foreground mb-1.5">{guide.title}</p>
              <ul className="space-y-0.5">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
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
                <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : projects.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-70">
                <span className="text-5xl">🏔️</span>
                <div className="text-center">
                  <p className="text-sm font-medium">No projects yet.</p>
                  <p className="text-xs mt-1">Click <strong>+ New Project</strong> to start planning.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={setActiveProject}
                    onActionClick={handleActionClick}
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
                <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                <span className="text-xs">Loading project tasks & subtasks...</span>
              </div>
            ) : projectNodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-70">
                <span className="text-4xl">🌱</span>
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
                itemRenderer={(item, isDragging) => (
                  <div
                    onClick={() => {
                      if (!isDragging) {
                        const proj = projects.find(p => p.id === item.project_id);
                        if (proj) {
                          setActiveProject(proj);
                          setActiveSubView('projects');
                        }
                      }
                    }}
                  >
                    <ProjectNodeMatrixCard node={item} />
                  </div>
                )}
              />
            )}
          </div>
        )}

        {activeSubView === 'roadmap' && (
          <div className="h-full">
            <ProjectRoadmap
              project={activeProject}
              projects={projects}
              onSelectProject={setActiveProject}
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
