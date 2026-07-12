'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { Project, projectService } from '@/lib/services/projectService';

interface ProjectRoadmapProps {
  project: Project | null;
  projects: Project[];
  onSelectProject: (project: Project) => void;
  model: 'ollama' | 'gemini';
}

export default function ProjectRoadmap({ project, projects, onSelectProject, model }: ProjectRoadmapProps) {
  const [roadmap, setRoadmap] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!project) return;
    setLoading(true);
    const result = await projectService.generateRoadmap(project.id, model);
    if (result && result.roadmap) {
      setRoadmap(result.roadmap);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border/80 rounded-xl p-4 shadow-sm overflow-hidden">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2">
            🗺️ AI Project Roadmap
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Generate a phased execution plan for any project.
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
            <option value="" disabled>Select a project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.icon} {p.title}</option>
            ))}
          </select>

          <button
            onClick={handleGenerate}
            disabled={!project || loading}
            className="px-4 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-smooth disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : '🤖'}
            Generate Roadmap
          </button>
        </div>
      </div>

      {/* Content Area */}
      {!project && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-70">
          <span className="text-5xl">🔭</span>
          <p className="text-sm font-medium">Select a project to view its roadmap.</p>
        </div>
      )}

      {project && loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
          <span className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-xs font-bold animate-pulse">Mapping out {project.title}...</p>
        </div>
      )}

      {project && !loading && !roadmap && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-70">
          <span className="text-5xl">🗺️</span>
          <p className="text-sm font-medium">No roadmap generated yet. Click generate to start.</p>
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
                <div className="bg-card border-2 border-emerald-500/30 rounded-xl overflow-hidden shadow-sm hover:border-emerald-500/60 transition-smooth">
                  {/* Header */}
                  <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                        Phase {index + 1}
                      </span>
                      {phase.duration && (
                        <span className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {phase.duration}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-foreground">
                      {phase.name}
                    </h3>
                  </div>

                  {/* Body */}
                  <div className="p-3 space-y-3 bg-muted/10">
                    {/* Milestone */}
                    {phase.milestone && (
                      <div className="flex items-start gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <span className="text-xs shrink-0">🏆</span>
                        <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 leading-snug">
                          {phase.milestone}
                        </p>
                      </div>
                    )}

                    {/* Tasks */}
                    <div>
                      <h4 className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Key Tasks</h4>
                      <ul className="space-y-1.5">
                        {phase.key_tasks?.map((task: string, tIndex: number) => (
                          <li key={tIndex} className="group flex items-start gap-2 p-1.5 rounded-md hover:bg-muted transition-smooth">
                            <div className="w-3 h-3 rounded-sm border border-border mt-0.5 shrink-0" />
                            <span className="text-[11px] text-foreground font-medium leading-tight">
                              {task}
                            </span>
                            
                            {/* Actions (Hidden until hover) */}
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-auto shrink-0 transition-opacity">
                              <button title="Move to Smart To-Do" className="p-1 rounded text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 transition-smooth">
                                <span className="text-[10px]">🧠</span>
                              </button>
                              <button title="Move to Quick Daily" className="p-1 rounded text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500 transition-smooth">
                                <span className="text-[10px]">⚡</span>
                              </button>
                            </div>
                          </li>
                        ))}
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
