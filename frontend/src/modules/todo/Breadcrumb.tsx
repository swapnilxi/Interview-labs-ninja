'use client';

import { type Task, getBreadcrumb } from '@/lib/services/todoService';

interface BreadcrumbProps {
  taskId: number;
  allTasks: Task[];
  onNavigate: (taskId: number) => void;
}

export default function Breadcrumb({ taskId, allTasks, onNavigate }: BreadcrumbProps) {
  const crumbs = getBreadcrumb(taskId, allTasks);

  if (crumbs.length < 3) return null; // Only show at L3+ depth

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto scrollbar-clean pb-1">
      {crumbs.map((crumb, i) => (
        <span key={crumb.id} className="flex items-center gap-1 flex-shrink-0">
          {i > 0 && <span className="text-muted-foreground/40">›</span>}
          <button
            onClick={() => onNavigate(crumb.id)}
            className={`hover:text-primary transition-smooth truncate max-w-[140px] ${
              i === crumbs.length - 1 ? 'text-foreground font-medium' : ''
            }`}
          >
            {crumb.title}
          </button>
        </span>
      ))}
    </nav>
  );
}
