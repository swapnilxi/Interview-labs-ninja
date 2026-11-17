'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import { Project, projectService } from '@/lib/services/projectService';
import { todoService } from '@/lib/services/todoService';
import { quickTaskService } from '@/lib/services/quickTaskService';

interface ProjectRoadmapProps {
  project: Project | null;
  projects: Project[];
  onSelectProject: (project: Project) => void;
  model: 'ollama' | 'gemini';
}

export default function ProjectRoadmap({ project, projects, onSelectProject, model }: ProjectRoadmapProps) {
  const [roadmap, setRoadmap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movedKeys, setMovedKeys] = useState<Set<string>>(new Set());
  const [movingKey, setMovingKey] = useState<string | null>(null);

  const handleMoveTask = async (key: string, phase: any, task: string, destination: 'smart' | 'quick') => {
    if (!project || movingKey) return;
    setMovingKey(key);
    setError(null);
    try {
      const context = `From AI Roadmap: ${project.title} — Phase ${phase.name || ''}`.trim();
      const created = destination === 'smart'
        ? await todoService.createTask({ title: task, priority: 'p3', status: 'backlog', context })
        : await quickTaskService.createTask({ title: task, source: 'moved_from_plan' });
      if (created) {
        setMovedKeys(prev => new Set(prev).add(key));
      } else {
        setError(`Failed to move "${task}" — please try again.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move task.');
    } finally {
      setMovingKey(null);
    }
  };

  const handleGenerate = async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const result = await projectService.generateRoadmap(project.id, model);
      if (result?.roadmap) {
        // Backend returns {roadmap: {phases: [...]}} or legacy {roadmap: [...]}
        const rm = result.roadmap;
        setRoadmap(Array.isArray(rm) ? { phases: rm } : rm);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate roadmap.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border mix-border-border/80 rounded-xl p-4 shadow-sm overflow-hidden">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-[1.5rem]">
        <div>
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            <FlatIcon name="roadmap" size={24} quiet /> Project roadmap
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            A phased plan for any project
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            className="bg-input border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:border-primary outline-none max-w-[200px]"
            value={project?.id || ''}
            onChange={(e) => {
              const p = projects.find(p => p.id.toString() === e.target.value);
              if (p) onSelectProject(p);
            }}
          >
            <option value="" disabled>Select a project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.icon} {p.title}</option>
            ))}
          </select>

          <button
            onClick={handleGenerate}
            disabled={!project || loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-smooth hover:mix-bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 mix-border-primary-foreground/30 border-t-primary-foreground" />
            ) : <FlatIcon name="ai" size={16} />}
            Generate roadmap
          </button>
        </div>
      </div>

      {/* AI action error */}
      {error && (
        <div role="alert" className="todo-alert todo-alert-error mb-4">
          <FlatIcon name="warning" size={16} className="mt-px" />
          <p className="flex-1 text-xs leading-relaxed">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

      {/* Content Area */}
      {!project && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-70">
          <FlatIcon name="explore" size={32} quiet />
          <p className="text-sm font-medium">Select a project to view its roadmap</p>
        </div>
      )}

      {project && loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
          <span className="h-8 w-8 animate-spin rounded-full border-4 mix-border-primary/20 border-t-primary" />
          <p className="text-xs font-medium animate-pulse">Mapping out {project.title}…</p>
        </div>
      )}

      {project && !loading && !roadmap && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-70">
          <FlatIcon name="roadmap" size={32} quiet />
          <p className="text-sm font-medium">No roadmap yet. Click Generate roadmap to start.</p>
        </div>
      )}

      {project && !loading && roadmap && (
        <div className="flex-1 overflow-x-auto pb-4 scrollbar-clean relative">
          <div className="flex gap-8 min-w-max h-full pt-4 px-4 items-start">
            
            {roadmap.phases?.map((phase: any, index: number) => (
              <div key={index} className="relative flex flex-col w-[300px] shrink-0">
                {/* Connector line (except for last item) */}
                {index < (roadmap.phases.length - 1) && (
                  <div className="absolute top-4 left-[300px] w-8 h-0.5 bg-border -z-10" />
                )}
                {/* Arrow head */}
                {index < (roadmap.phases.length - 1) && (
                  <div className="absolute top-3 right-[-34px] text-border -z-10">
                    <Icon name="ArrowRightIcon" size={14} />
                  </div>
                )}

                {/* Phase Card */}
                <div className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:mix-border-foreground/25">
                  {/* Header */}
                  <div className="border-b border-border p-3 mix-bg-foreground/[0.04]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-muted-foreground">
                        Phase {index + 1}
                      </span>
                      {phase.duration && (
                        <span className="text-xs text-muted-foreground">
                          {phase.duration}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {phase.name}
                    </h3>
                  </div>

                  {/* Body */}
                  <div className="p-3 space-y-3 mix-bg-muted/10">
                    {/* Milestone */}
                    {phase.milestone && (
                      <div className="flex items-start gap-1.5 rounded-lg p-2 mix-bg-foreground/[0.05]">
                        <FlatIcon name="trophy" size={16} quiet className="mt-px" />
                        <p className="text-xs font-medium leading-snug text-foreground">
                          {phase.milestone}
                        </p>
                      </div>
                    )}

                    {/* Tasks */}
                    <div>
                      <h4 className="mb-2 text-[12px] font-medium text-muted-foreground">Key tasks</h4>
                      <ul className="space-y-1.5">
                        {phase.key_tasks?.map((task: string, tIndex: number) => {
                          const key = `${index}-${tIndex}`;
                          const moved = movedKeys.has(key);
                          const moving = movingKey === key;
                          return (
                            <li key={tIndex} className="group flex items-start gap-2 p-1.5 rounded-md hover:bg-muted transition-smooth">
                              <div className="w-3 h-3 rounded-sm border border-border mt-0.5 shrink-0" />
                              <span className={`text-xs font-medium leading-tight ${moved ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                {task}
                              </span>

                              {/* Actions (Hidden until hover) */}
                              {moved ? (
                                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success"><FlatIcon name="check" size={14} /> moved</span>
                              ) : (
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-auto shrink-0 transition-opacity">
                                  <button
                                    type="button"
                                    title="Move to Smart To-Do"
                                    disabled={moving}
                                    onClick={() => handleMoveTask(key, phase, task, 'smart')}
                                    className="p-1 rounded text-muted-foreground hover:mix-bg-foreground/[0.06] hover:text-foreground transition-smooth disabled:opacity-50"
                                  >
                                    <FlatIcon name="brain" size={18} quiet />
                                  </button>
                                  <button
                                    type="button"
                                    title="Move to Quick Daily"
                                    disabled={moving}
                                    onClick={() => handleMoveTask(key, phase, task, 'quick')}
                                    className="p-1 rounded text-muted-foreground hover:mix-bg-foreground/[0.06] hover:text-foreground transition-smooth disabled:opacity-50"
                                  >
                                    <FlatIcon name="quick" size={18} quiet />
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
