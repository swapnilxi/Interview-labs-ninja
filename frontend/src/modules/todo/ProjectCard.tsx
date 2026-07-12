'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { Project } from '@/lib/services/projectService';

interface ProjectCardProps {
  project: Project;
  onClick: (project: Project) => void;
  onActionClick?: (project: Project, action: 'dive' | 'chunk' | 'roadmap') => void;
  isCompact?: boolean;
}

export default function ProjectCard({ project, onClick, onActionClick, isCompact = false }: ProjectCardProps) {
  // 80/20 styling
  let paretoClasses = '';
  if (project.is_top_20) {
    paretoClasses = 'ring-1 ring-amber-400/50 shadow-sm border-amber-400/30';
  } else if (project.pareto_score !== undefined && project.pareto_score !== null) {
    if (project.pareto_score >= 0.6) paretoClasses = 'shadow-[inset_2px_0_0_0_rgba(251,191,36,0.6)]';
    else if (project.pareto_score < 0.3) paretoClasses = 'opacity-60 grayscale-[30%]';
  }

  // Color parsing
  const color = project.color || '#3b82f6';
  
  // Status mapping
  const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-500',
    paused: 'bg-amber-500/10 text-amber-500',
    completed: 'bg-blue-500/10 text-blue-500',
    archived: 'bg-muted text-muted-foreground',
  };

  const priorityColors = {
    p1: 'bg-red-500',
    p2: 'bg-amber-500',
    p3: 'bg-blue-500',
    p4: 'bg-muted-foreground',
  };

  return (
    <div 
      className={`group flex flex-col bg-card border border-border/60 rounded-xl overflow-hidden transition-smooth hover:border-border/80 hover:shadow-md cursor-pointer ${paretoClasses} ${project.status === 'completed' || project.status === 'archived' ? 'opacity-60' : ''}`}
      onClick={() => onClick(project)}
    >
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm shrink-0"
              style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}
            >
              {project.icon || '📁'}
            </div>
            <div className="min-w-0 flex flex-col">
              <h3 className="font-heading font-semibold text-foreground truncate text-sm">
                {project.title}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${statusColors[project.status]}`}>
                  {project.status}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${priorityColors[project.priority as keyof typeof priorityColors] || priorityColors.p3}`} />
                  {project.priority.toUpperCase()}
                </span>
                {project.due_date && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Icon name="CalendarIcon" size={10} />
                    {project.due_date}
                  </span>
                )}
                {project.node_count !== undefined && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 rounded-sm">
                    {project.node_count} nodes
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Progress / Pareto Badge */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {project.is_top_20 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400 shadow-sm flex items-center gap-1">
                ⭐ Top 20%
              </span>
            )}
            
            {/* Progress Ring Placeholder (Needs actual stats from backend, assuming 0 for now) */}
            <div className="relative w-8 h-8 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-muted/30" />
                <circle cx="16" cy="16" r="14" stroke={color} strokeWidth="3" fill="transparent" strokeDasharray="87.96" strokeDashoffset="87.96" className="transition-all duration-1000" />
              </svg>
              <span className="absolute text-[8px] font-bold text-foreground">0%</span>
            </div>
          </div>
        </div>

        {project.description && !isCompact && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
            {project.description}
          </p>
        )}
      </div>

      {!isCompact && onActionClick && (
        <div className="px-4 py-2 bg-muted/20 border-t border-border/50 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onActionClick(project, 'dive'); }}
            className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-smooth"
          >
            🔍 Dive Deeper
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onActionClick(project, 'chunk'); }}
            className="text-[10px] font-semibold px-2 py-1 rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-smooth"
          >
            ⚡ Chunk It
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onActionClick(project, 'roadmap'); }}
            className="text-[10px] font-semibold px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-smooth"
          >
            🗺️ Roadmap
          </button>
        </div>
      )}
    </div>
  );
}
