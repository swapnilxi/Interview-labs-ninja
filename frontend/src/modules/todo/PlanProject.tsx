'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import EisenhowerMatrix, { MatrixItem } from '@/components/ui/EisenhowerMatrix';
import ProjectCard from './ProjectCard';
import ProjectExplorer from './ProjectExplorer';
import ProjectRoadmap from './ProjectRoadmap';
import CreateProjectModal from './CreateProjectModal';
import { Project, projectService } from '@/lib/services/projectService';

type PlanSubView = 'projects' | 'matrix' | 'roadmap';

interface PlanProjectProps {
  model: 'ollama' | 'gemini';
}

export default function PlanProject({ model }: PlanProjectProps) {
  const [activeSubView, setActiveSubView] = useState<PlanSubView>('projects');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSortLoading, setAutoSortLoading] = useState(false);

  // States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null); // For explorer or roadmap

  const loadProjects = async () => {
    setLoading(true);
    const fetched = await projectService.fetchProjects();
    setProjects(fetched);
    setLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleQuadrantChange = async (itemId: string | number, newQuadrant: any) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === id ? { ...p, eisenhower_quadrant: newQuadrant } : p));
    await projectService.updateProject(id, { eisenhower_quadrant: newQuadrant });
  };

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    await projectService.eisenhowerAuto(model);
    await loadProjects();
    setAutoSortLoading(false);
  };

  const handleActionClick = (project: Project, action: 'dive' | 'chunk' | 'roadmap') => {
    if (action === 'roadmap') {
      setActiveProject(project);
      setActiveSubView('roadmap');
    } else {
      setActiveProject(project);
      // Explorer will handle the dive/chunk action once opened. 
      // For simplicity, we just open the explorer here.
    }
  };

  const matrixItems = projects.map(p => ({
    ...p,
    id: p.id.toString(),
    quadrant: p.eisenhower_quadrant || null,
  })) as (MatrixItem & Project)[];

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

  return (
    <div className="flex flex-col h-full gap-4 relative">
      {/* Header & Sub-view Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/80 rounded-xl p-3 shadow-sm">
        <div className="inline-flex items-center p-1 bg-muted/50 rounded-lg border border-border shrink-0">
          <button
            onClick={() => setActiveSubView('projects')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-smooth ${
              activeSubView === 'projects' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span>📁</span> Projects
          </button>
          <button
            onClick={() => setActiveSubView('matrix')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-smooth ${
              activeSubView === 'matrix' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span>🟦</span> Matrix
          </button>
          <button
            onClick={() => setActiveSubView('roadmap')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-smooth ${
              activeSubView === 'roadmap' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span>🗺️</span> Roadmap
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-smooth flex items-center gap-2 shrink-0 justify-center"
        >
          <Icon name="PlusIcon" size={14} variant="solid" /> New Project
        </button>
      </div>

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
                  <p className="text-xs mt-1">Create your first project to start planning.</p>
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
                  />
                ))}
              </div>
            )}
          </div>
        )}
        
        {activeSubView === 'matrix' && (
          <div className="h-full">
            <EisenhowerMatrix
              items={matrixItems}
              onQuadrantChange={handleQuadrantChange}
              showAutoSort={true}
              onAutoSort={handleAutoSort}
              autoSortLoading={autoSortLoading}
              itemRenderer={(item, isDragging) => (
                <div className={isDragging ? '' : 'pointer-events-none'}>
                  <ProjectCard 
                    project={item} 
                    onClick={() => {
                      if (!isDragging) {
                        setActiveProject(item);
                        setActiveSubView('projects'); // Switch back to see explorer
                      }
                    }} 
                    isCompact={true}
                  />
                </div>
              )}
            />
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
            loadProjects();
            setActiveProject(newProject);
            setActiveSubView('projects'); // Open it immediately in explorer
          }}
        />
      )}
    </div>
  );
}
