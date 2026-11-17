'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import ProjectIcon from './ProjectIcon';
import { planUrls } from './projectUrls';
import { PRIORITY_COLOR, PROJECT_STATUS_COLOR } from '../shared/semanticColors';
import { Project } from '@/lib/services/projectService';

interface ProjectCardProps {
  project: Project;
  onDelete?: (project: Project) => void;
  isCompact?: boolean;
}

export default function ProjectCard({ project, onDelete, isCompact = false }: ProjectCardProps) {
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
      {/* Clickable main body — a real link to the project's own address, so it opens in a new tab and works from the keyboard */}
      <Link
        href={planUrls.project(project.id)}
        className="todo-focus block w-full flex-1 cursor-pointer p-[1.5rem] text-left"
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
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 capitalize">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PROJECT_STATUS_COLOR[project.status] || PROJECT_STATUS_COLOR.archived }} aria-hidden="true" />
                  {project.status}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[project.priority] || PRIORITY_COLOR.p3 }} aria-hidden="true" />
                  {project.priority.toUpperCase()}
                </span>
                {project.due_date && (
                  <span className="inline-flex items-center gap-1">
                    <Icon name="CalendarIcon" size={12} />
                    {project.due_date}
                  </span>
                )}
                {project.node_count !== undefined && (
                  <span className="tabular-nums">{project.node_count} nodes</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: badges */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {project.is_top_20 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                <Icon name="StarIcon" size={12} variant="solid" /> Top 20%
              </span>
            )}
            <div className="relative w-8 h-8 flex items-center justify-center" title={`${exportedCount}/${nodeCount} plan nodes exported to action`}>
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" fill="transparent" className="mix-text-muted/30" />
                <circle cx="16" cy="16" r="14" stroke={color} strokeWidth="3" fill="transparent" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} className="transition-[stroke-dashoffset] duration-500" />
              </svg>
              <span className="absolute text-xs font-medium text-foreground">{progressPct}%</span>
            </div>
          </div>
        </div>

        {project.description && !isCompact && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-4 leading-relaxed">
            {project.description}
          </p>
        )}
      </Link>

      {/* ── Action footer — always visible, NOT part of the clickable area ── */}
      {!isCompact && (
        <div className="flex flex-wrap items-center gap-1 border-t border-border px-[0.5rem] py-3" style={{ background: 'color-mix(in srgb, var(--color-foreground) 4%, transparent)' }}>
          {/* Left: each one is a link to its own screen */}
          <div className="flex flex-wrap items-center gap-1">
            <Link href={planUrls.project(project.id)} className="todo-focus copilot-tint px-1.5 py-1.5 text-xs font-medium">
              <Icon name="MagnifyingGlassIcon" size={12} /> Explore
            </Link>
            <Link href={planUrls.project(project.id, 'planner')} className="todo-focus copilot-tint px-1.5 py-1.5 text-xs font-medium">
              <Icon name="SparklesIcon" size={12} /> AI planner
            </Link>
            <Link href={planUrls.roadmap(project.id)} className="todo-focus copilot-tint px-1.5 py-1.5 text-xs font-medium">
              <Icon name="MapIcon" size={12} /> Roadmap
            </Link>
          </div>

          {/* Right: delete button (always visible) */}
          {onDelete && (
            <div className="ml-auto flex items-center gap-1.5">
              {confirmDelete ? (
                <>
                  <span className="text-xs font-medium text-error">Sure?</span>
                  <button
                    onClick={handleConfirmDelete}
                    className="rounded-md bg-error px-2 py-1 text-xs font-medium text-white transition-colors hover:opacity-90"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={handleCancelDelete}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:mix-bg-foreground/[0.06] hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleDeleteClick}
                  className="todo-focus flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:mix-bg-error/10 hover:text-error"
                  title="Delete project"
                  aria-label={`Delete project ${project.title}`}
                >
                  <Icon name="TrashIcon" size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
