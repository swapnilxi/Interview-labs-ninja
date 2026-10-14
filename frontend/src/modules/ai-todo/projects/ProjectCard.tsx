'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import ProjectIcon from './ProjectIcon';
import { Project } from '@/lib/services/projectService';

interface ProjectCardProps {
  project: Project;
  onClick: (project: Project) => void;
  onActionClick?: (project: Project, action: 'dive' | 'chunk' | 'roadmap') => void;
  onDelete?: (project: Project) => void;
  isCompact?: boolean;
}

export default function ProjectCard({ project, onClick, onActionClick, onDelete, isCompact = false }: ProjectCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 80/20 styling
  let paretoClasses = '';
  if (project.is_top_20) {
    paretoClasses = 'ring-1 ring-amber-400/50 border-amber-400/30';
  } else if (project.pareto_score !== undefined && project.pareto_score !== null) {
    if (project.pareto_score >= 0.6) paretoClasses = 'shadow-[inset_2px_0_0_0_rgba(251,191,36,0.6)]';
    else if (project.pareto_score < 0.3) paretoClasses = 'opacity-60 grayscale-[30%]';
  }

  const color = project.color || '#3b82f6';

  // "Progress" = share of plan nodes already exported into actionable tasks.
  const nodeCount = project.node_count || 0;
  const exportedCount = project.exported_count || 0;
  const progressPct = nodeCount > 0 ? Math.round((exportedCount / nodeCount) * 100) : 0;
  const ringCircumference = 87.96;
  const ringOffset = ringCircumference * (1 - progressPct / 100);

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-500',
    paused: 'bg-amber-500/10 text-amber-500',
    completed: 'bg-blue-500/10 text-blue-500',
    archived: 'bg-muted text-muted-foreground',
  };

  const priorityColors: Record<string, string> = {
    p1: 'bg-red-500',
    p2: 'bg-amber-500',
    p3: 'bg-blue-500',
    p4: 'bg-muted-foreground',
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDelete(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDelete(false);
    onDelete?.(project);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDelete(false);
  };

  return (
    <div
      style={{ '--lit': color } as React.CSSProperties}
      className={`todo-lit flex flex-col bg-card border border-border rounded-xl overflow-hidden ${paretoClasses} ${project.status === 'completed' || project.status === 'archived' ? 'opacity-60' : ''}`}
    >
      {/* Clickable main body — a real button, so it is reachable and operable from the keyboard */}
      <button
        type="button"
        className="todo-focus block w-full flex-1 cursor-pointer p-[1.5rem] text-left"
        onClick={() => onClick(project)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="todo-icon-chip w-[2.75rem] h-[2.75rem] rounded-xl flex items-center justify-center text-xl shadow-sm shrink-0"
              style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}
            >
              <ProjectIcon icon={project.icon} size={26} />
            </div>
            <div className="min-w-0 flex flex-col">
              <h3 className="font-heading font-semibold text-foreground truncate text-base">
                {project.title}
              </h3>
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                <span className={`text-[11px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${statusColors[project.status] || 'bg-muted text-muted-foreground'}`}>
                  {project.status}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${priorityColors[project.priority] || priorityColors.p3}`} />
                  {project.priority.toUpperCase()}
                </span>
                {project.due_date && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Icon name="CalendarIcon" size={10} />
                    {project.due_date}
                  </span>
                )}
                {project.node_count !== undefined && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-sm">
                    {project.node_count} nodes
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: badges */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {project.is_top_20 && (
              <span className="copilot-tint px-2 py-0.5 text-xs font-bold">
                <Icon name="StarIcon" size={10} variant="solid" /> Top 20%
              </span>
            )}
            <div className="relative w-8 h-8 flex items-center justify-center" title={`${exportedCount}/${nodeCount} plan nodes exported to action`}>
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" fill="transparent" className="mix-text-muted/30" />
                <circle cx="16" cy="16" r="14" stroke={color} strokeWidth="3" fill="transparent" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} className="transition-all duration-1000" />
              </svg>
              <span className="absolute text-xs font-bold text-foreground">{progressPct}%</span>
            </div>
          </div>
        </div>

        {project.description && !isCompact && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-4 leading-relaxed">
            {project.description}
          </p>
        )}
      </button>

      {/* ── Action footer — always visible, NOT part of the clickable area ── */}
      {!isCompact && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-[1.25rem] py-3" style={{ background: 'color-mix(in srgb, var(--color-foreground) 4%, transparent)' }}>
          {/* Left: explore / roadmap buttons */}
          <div className="flex items-center gap-1.5">
            {onActionClick && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onActionClick(project, 'dive'); }}
                  className="copilot-tint px-2.5 py-1.5 text-xs font-semibold"
                >
                  <Icon name="MagnifyingGlassIcon" size={12} /> Explore
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onActionClick(project, 'roadmap'); }}
                  className="copilot-tint px-2.5 py-1.5 text-xs font-semibold"
                >
                  <Icon name="MapIcon" size={12} /> Roadmap
                </button>
              </>
            )}
          </div>

          {/* Right: delete button (always visible) */}
          {onDelete && (
            <div className="flex items-center gap-1.5">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-red-500 font-semibold">Sure?</span>
                  <button
                    onClick={handleConfirmDelete}
                    className="text-xs font-bold px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-smooth"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    className="text-xs font-semibold px-2 py-1 rounded bg-muted text-muted-foreground hover:mix-bg-muted/80 transition-smooth"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDeleteClick}
                  className="text-xs font-semibold px-2 py-1 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-smooth flex items-center gap-1"
                >
                  <Icon name="TrashIcon" size={10} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
